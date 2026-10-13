// Outbox channel: the laptop bridge's prepared envelope -> one pinned Drive outbox slot -> serialized cloud
// publisher -> mailbox. The laptop never writes the mailbox; the cloud stays the single mailbox writer and
// rechecks live approvals before publishing. Data transport only: no upload, generation, montage or render.
import {createHash} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {MAX_DELIVERY_BYTES, parseDelivery} from './windows-plan-delivery.mjs';
import {mayReplaceDelivery} from './windows-plan-ack.mjs';

export const OUTBOX_NAME = 'source-plan-outbox-v1.json';
export const emptyOutbox = () => ({outboxVersion: '1.0.0', status: 'empty'});
const flags = {generationAllowed: false, uploadStarted: false, renderAllowed: false};
const require = (ok, message) => { if (!ok) throw new Error(message); };
const md5 = b => createHash('md5').update(b).digest('hex');
const exact = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === keys.length && Object.keys(o).every(k => keys.includes(k));

// Slot content: exact empty marker, or one structurally valid envelope (expiry evaluated by the caller).
export function parseOutboxSlot(bytes) {
  require(bytes.length > 0 && bytes.length <= MAX_DELIVERY_BYTES, 'Invalid outbox size');
  const data = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (exact(data, ['outboxVersion', 'status']) && data.outboxVersion === '1.0.0' && data.status === 'empty') return {status: 'empty'};
  require(data?.status === 'staging_only' && Number.isSafeInteger(data.issuedAt), 'Outbox slot holds unexpected data');
  return parseDelivery(bytes, {now: data.issuedAt}); // full contract check, independent of the current clock
}

const mailboxDeliveryId = bytes => {
  const data = JSON.parse(Buffer.from(bytes).toString('utf8'));
  return data.status === 'staging_only' ? data.deliveryId : null;
};

// Newest unexpired prepared envelope in the local bridge outbox (files are never deleted here).
export async function newestPrepared(outboxDir, now) {
  let names = [];
  try { names = (await fs.readdir(outboxDir)).filter(n => /^[a-f0-9]{64}\.\d+\.json$/.test(n)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const live = [];
  for (const name of names) {
    const bytes = await fs.readFile(path.join(outboxDir, name));
    try { const data = parseDelivery(bytes, {now}); live.push({name, bytes, data}); } catch {}
  }
  live.sort((a, b) => b.data.issuedAt - a.data.issuedAt);
  return live[0] ?? null;
}

const slotOk = (meta, cfg, folderId) => meta && meta.id === cfg.fileId && meta.name === OUTBOX_NAME && !meta.trashed &&
  meta.mimeType === 'application/json' && (meta.parents || []).includes(folderId) && Number(meta.size) > 0 &&
  Number(meta.size) <= MAX_DELIVERY_BYTES && /^[a-f0-9]{32}$/.test(meta.md5Checksum || '');

// Windows side. Never overwrites an envelope the cloud has not consumed yet, unless it is the same plan
// (renewal) or already expired (it was never published; the plan stays in the queue and can be rebuilt).
export async function pushOutbox({drive, outboxConfig, mailboxConfig, outboxDir, now = Date.now}) {
  const clock = typeof now === 'function' ? now : () => now;
  require(exact(outboxConfig, ['fileId']) && /^[A-Za-z0-9_-]{10,100}$/.test(outboxConfig.fileId) &&
    ![mailboxConfig?.fileId, mailboxConfig?.folderId].includes(outboxConfig.fileId), 'Separate pinned outbox slot required');
  const prepared = await newestPrepared(outboxDir, clock());
  if (!prepared) return {status: 'nothing_to_send', ...flags};
  const before = await drive.get(outboxConfig.fileId);
  require(slotOk(before, outboxConfig, mailboxConfig.folderId), 'Outbox slot identity/metadata mismatch');
  const current = await drive.readJsonBytes(outboxConfig.fileId, MAX_DELIVERY_BYTES);
  require(current.length === Number(before.size) && md5(current) === before.md5Checksum, 'Outbox slot checksum mismatch');
  const result = status => ({status, deliveryId: prepared.data.deliveryId, ...flags});
  if (current.equals(prepared.bytes)) return result('already_sent');
  const slot = parseOutboxSlot(current);
  if (slot.status !== 'empty' && slot.deliveryId !== prepared.data.deliveryId && clock() < slot.expiresAt) {
    const consumed = mailboxDeliveryId(await drive.readJsonBytes(mailboxConfig.fileId, MAX_DELIVERY_BYTES)) === slot.deliveryId;
    if (!consumed) return result('blocked_unconsumed');
  }
  const recheck = await drive.get(outboxConfig.fileId);
  require(recheck?.md5Checksum === before.md5Checksum && recheck?.size === before.size, 'Outbox slot changed before write');
  await drive.updateJsonBytes(outboxConfig.fileId, prepared.bytes);
  const after = await drive.get(outboxConfig.fileId);
  require(slotOk(after, outboxConfig, mailboxConfig.folderId) && after.md5Checksum === md5(prepared.bytes) &&
    Number(after.size) === prepared.bytes.length, 'Outbox metadata differs after write; inspect without blind retry');
  require((await drive.readJsonBytes(outboxConfig.fileId, MAX_DELIVERY_BYTES)).equals(prepared.bytes), 'Outbox readback differs');
  return result('sent');
}

const SAME = ['topic_id', 'hook_id', 'script_revision', 'hook_text', 'script_text', 'script_hash'];
// Cloud side, pure. `approvedQueue` must come from a fresh authenticated read in the same process.
export function relayDecision({outboxBytes, approvedQueue, mailboxBytes, ackBytes, now = Date.now()}) {
  const slot = parseOutboxSlot(outboxBytes);
  if (slot.status === 'empty') return {status: 'nothing_to_relay', ...flags};
  if (now >= slot.expiresAt || slot.issuedAt > now) return {status: 'outbox_expired', deliveryId: slot.deliveryId, ...flags};
  const live = new Map((approvedQueue?.items || []).filter(i => i.status === 'approved').map(i => [i.version_id, i]));
  for (const item of slot.payload.packet.items) {
    const current = live.get(item.version_id);
    if (!current || SAME.some(k => current[k] !== item[k])) return {status: 'approval_changed_or_revoked', deliveryId: slot.deliveryId, ...flags};
  }
  if (Buffer.from(mailboxBytes).equals(Buffer.from(outboxBytes))) return {status: 'already_published', deliveryId: slot.deliveryId, ...flags};
  const gate = mayReplaceDelivery({currentBytes: mailboxBytes, ackBytes, nextBytes: outboxBytes});
  if (!gate.allowed) return {status: 'blocked', reason: gate.reason, deliveryId: slot.deliveryId, ...flags};
  return {status: 'publish', reason: gate.reason, deliveryId: slot.deliveryId, ...flags};
}
