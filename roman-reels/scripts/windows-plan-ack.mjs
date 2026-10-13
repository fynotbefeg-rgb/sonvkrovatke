// Receipt acknowledgement for Windows source-plan deliveries. Data transport only:
// an acknowledgement says "this exact delivery was saved and re-verified on Windows",
// never approval, upload, avatar generation, montage or render permission.
// Separate stores: a local acknowledgement directory and one pinned Drive slot
// (`source-plan-ack-v1.json`, owner-created next to the mailbox). The cloud intake journal is untouched.
import {createHash} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {MAX_DELIVERY_BYTES, receiveDelivery} from './windows-plan-delivery.mjs';

export const ACK_NAME = 'source-plan-ack-v1.json';
export const MAX_ACK_BYTES = 4096;
export const emptyAck = () => ({ackVersion: '1.0.0', status: 'empty'});
const ACK_KEYS = ['ackVersion', 'status', 'deliveryId', 'contentSha256', 'topicId', 'scriptVersion', 'planKey', 'jobCount',
  'issuedAt', 'expiresAt', 'receivedAt', 'generationAllowed', 'uploadAllowed', 'renderAllowed', 'currentApprovalRecheckRequired'];
const require = (ok, message) => { if (!ok) throw new Error(message); };
const exact = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === keys.length && Object.keys(o).every(k => keys.includes(k));
const sha = b => createHash('sha256').update(b).digest('hex');
const md5 = b => createHash('md5').update(b).digest('hex');
const hex64 = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const encode = ack => Buffer.from(JSON.stringify(Object.fromEntries(ACK_KEYS.map(k => [k, ack[k]]))));

export function validateAck(ack) {
  require(exact(ack, ACK_KEYS) && ack.ackVersion === '1.0.0' && ack.status === 'received' && hex64(ack.deliveryId) &&
    hex64(ack.contentSha256) && hex64(ack.planKey) && typeof ack.topicId === 'string' && Number.isSafeInteger(ack.scriptVersion) &&
    ack.jobCount === 4 && [ack.issuedAt, ack.expiresAt, ack.receivedAt].every(Number.isSafeInteger) &&
    ack.issuedAt <= ack.receivedAt && ack.receivedAt < ack.expiresAt && ack.generationAllowed === false &&
    ack.uploadAllowed === false && ack.renderAllowed === false && ack.currentApprovalRecheckRequired === true, 'Invalid acknowledgement');
  return ack;
}

// Parses an acknowledgement slot: {status:'empty'} or one valid acknowledgement. Anything else is foreign/corrupt.
export function parseAckSlot(bytes) {
  require(bytes.length > 0 && bytes.length <= MAX_ACK_BYTES, 'Invalid acknowledgement size');
  const data = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (exact(data, ['ackVersion', 'status']) && data.ackVersion === '1.0.0' && data.status === 'empty') return data;
  return validateAck(data);
}

function buildAck(data, contentSha256, receivedAt) {
  return validateAck({ackVersion: '1.0.0', status: 'received', deliveryId: data.deliveryId, contentSha256,
    topicId: data.payload.topicId, scriptVersion: data.payload.scriptVersion, planKey: data.payload.planKey, jobCount: 4,
    issuedAt: data.issuedAt, expiresAt: data.expiresAt, receivedAt, generationAllowed: false, uploadAllowed: false,
    renderAllowed: false, currentApprovalRecheckRequired: true});
}

// Local store: one file per (deliveryId, contentSha256). Exclusive publication via hard link: a repeat or a
// restart reuses the stored bytes (same receivedAt), so the Drive slot always receives identical bytes.
async function storeLocalAck(store, data, contentSha256, now) {
  await fs.mkdir(store, {recursive: true, mode: 0o700});
  const file = path.join(store, `${data.deliveryId}.${contentSha256}.json`);
  try {
    const bytes = await fs.readFile(file);
    const ack = validateAck(JSON.parse(bytes.toString('utf8')));
    require(ack.deliveryId === data.deliveryId && ack.contentSha256 === contentSha256 && ack.planKey === data.payload.planKey &&
      encode(ack).equals(bytes), 'Stored acknowledgement changed');
    return {bytes, created: false};
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const bytes = encode(buildAck(data, contentSha256, now));
  const temp = `${file}.${process.pid}.tmp`;
  const handle = await fs.open(temp, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try { await fs.link(temp, file); } finally { await fs.rm(temp, {force: true}); }
  require((await fs.readFile(file)).equals(bytes), 'Stored acknowledgement readback differs');
  return {bytes, created: true};
}

const slotOk = (meta, ackConfig, mailboxConfig) => meta && meta.id === ackConfig.fileId && meta.name === ACK_NAME && !meta.trashed &&
  meta.mimeType === 'application/json' && (meta.parents || []).includes(mailboxConfig.folderId) &&
  Number(meta.size) > 0 && Number(meta.size) <= MAX_ACK_BYTES && /^[a-f0-9]{32}$/.test(meta.md5Checksum || '');

// Writes the acknowledgement into the pinned Drive slot. Identical bytes already there → no write.
// After a lost response the next run reads the slot first; the same bytes are never a second record.
async function publishAck(drive, ackConfig, mailboxConfig, bytes) {
  const before = await drive.get(ackConfig.fileId);
  require(slotOk(before, ackConfig, mailboxConfig), 'Acknowledgement slot identity/metadata mismatch');
  const current = await drive.readJsonBytes(ackConfig.fileId, MAX_ACK_BYTES);
  require(current.length === Number(before.size) && md5(current) === before.md5Checksum, 'Acknowledgement slot checksum mismatch');
  if (current.equals(bytes)) return 'already_acknowledged';
  parseAckSlot(current); // empty or a previous valid acknowledgement only; foreign data is never overwritten
  const recheck = await drive.get(ackConfig.fileId);
  require(recheck?.md5Checksum === before.md5Checksum && recheck?.size === before.size, 'Acknowledgement slot changed before write');
  await drive.updateJsonBytes(ackConfig.fileId, bytes);
  const after = await drive.get(ackConfig.fileId);
  require(slotOk(after, ackConfig, mailboxConfig) && Number(after.size) === bytes.length && after.md5Checksum === md5(bytes),
    'Acknowledgement metadata differs after write; inspect without blind retry');
  require((await drive.readJsonBytes(ackConfig.fileId, MAX_ACK_BYTES)).equals(bytes), 'Acknowledgement readback differs');
  return 'acknowledged';
}

export async function acknowledgeDelivery({drive, config, ackConfig, inbox, ackStore, now = Date.now}) {
  const clock = typeof now === 'function' ? now : () => now;
  require(exact(ackConfig, ['fileId']) && typeof ackConfig.fileId === 'string' && /^[A-Za-z0-9_-]{10,100}$/.test(ackConfig.fileId) &&
    ackConfig.fileId !== config?.fileId && ackConfig.fileId !== config?.folderId, 'Separate pinned acknowledgement slot required');
  return receiveDelivery({drive, config, inbox, now: clock, afterVerified: async ({data, contentSha256}) => {
    // Only reached after the whole package was saved and re-read; expired deliveries are never acknowledged.
    require(clock() < data.expiresAt, 'Delivery expired before acknowledgement');
    const local = await storeLocalAck(ackStore, data, contentSha256, clock());
    const acknowledgement = await publishAck(drive, ackConfig, config, local.bytes);
    return {acknowledgement, ackSha256: sha(local.bytes)};
  }});
}

// Coordinator side. Structural check of the current mailbox (expiry is not required: an expired delivery stays outstanding).
function outstanding(bytes) {
  require(bytes.length > 0 && bytes.length <= MAX_DELIVERY_BYTES, 'Invalid delivery size');
  const data = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (data?.status === 'empty' && exact(data, ['deliveryVersion', 'status', 'generationAllowed', 'renderAllowed'])) return null;
  require(data?.status === 'staging_only' && hex64(data.deliveryId) && data.deliveryId === sha(JSON.stringify(data.payload)) &&
    hex64(data.payload?.planKey), 'Invalid outstanding delivery');
  return data;
}

// True only when the acknowledgement names exactly the delivery currently in the mailbox (same plan and same bytes).
export function isAcknowledged(mailboxBytes, ackBytes) {
  const data = outstanding(mailboxBytes);
  if (!data) return false;
  let ack;
  try { ack = parseAckSlot(ackBytes); } catch { return false; }
  return ack.status === 'received' && ack.deliveryId === data.deliveryId && ack.contentSha256 === sha(mailboxBytes) &&
    ack.planKey === data.payload.planKey && ack.expiresAt === data.expiresAt;
}

// The coordinator never replaces an unacknowledged delivery with a different one. Renewal of the same plan is allowed.
// Acknowledgement is receipt only: callers must still recheck current approvals before any execution.
export function mayReplaceDelivery({currentBytes, ackBytes, nextBytes}) {
  const current = outstanding(currentBytes), next = outstanding(nextBytes);
  require(next, 'Next delivery required');
  if (!current) return {allowed: true, reason: 'mailbox_empty'};
  if (current.deliveryId === next.deliveryId) return {allowed: true, reason: 'same_plan_renewal'};
  return isAcknowledged(currentBytes, ackBytes) ? {allowed: true, reason: 'previous_acknowledged'} :
    {allowed: false, reason: 'previous_not_acknowledged'};
}
