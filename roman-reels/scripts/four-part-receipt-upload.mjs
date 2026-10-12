// After four verified MP4 uploads: re-check every Drive part, then publish recording-set.json (receipt v1).
// The receipt comes from the explicit four-part packet and the uploader journal via buildFourPartReceipt;
// textHash is never assigned here. The local journal alone is not trusted: real Drive IDs, roles, folder chain,
// size/MD5/SHA-256 and uploader appProperties of all four parts are re-read before the upload and again before the
// rename. The receipt is created under a temporary name with a pre-generated ID persisted first, verified by its
// own checksums and only then renamed to its final name. A foreign or modified receipt is never overwritten.
// No approval, cloud intake-state, HeyGen, render or production action.
import {createHash} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {buildFourPartReceipt} from './build-four-part-receipt.mjs';
import {AuthError, DriveHttpError, FOLDER, INCOMING_ID, Journal, MAX_UPLOAD_ATTEMPTS, UploaderError, withLock} from './source-uploader.mjs';

export const RECEIPT_NAME = 'recording-set.json';
export const RECEIPT_MIME = 'application/json';
const PART_ROLES = ['body', 'hook-1', 'hook-2', 'hook-3'];
const MAX_PACKET_BYTES = 2 * 1024 ** 2;

const digest = bytes => ({size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
  md5: createHash('md5').update(bytes).digest('hex')});
export const receiptBytes = receipt => Buffer.from(JSON.stringify(receipt, null, 2) + '\n', 'utf8');

function partProblem(remote, entry, folderId) {
  if (!remote || remote.trashed) return 'part_missing';
  if (remote.mimeType !== 'video/mp4') return 'part_mime_changed';
  if (remote.name !== `${entry.role}.mp4`) return 'part_renamed';
  if (!(remote.parents || []).includes(folderId)) return 'part_moved';
  if (Number(remote.size) !== entry.size || remote.md5Checksum !== entry.md5) return 'part_checksum_mismatch';
  if (remote.sha256Checksum !== entry.sha256) return remote.sha256Checksum ? 'part_checksum_mismatch' : 'part_sha256_unavailable';
  const a = remote.appProperties || {};
  if (a.rrJobId !== entry.jobId || a.rrSha256 !== entry.sha256 || a.rrRole !== entry.role || a.rrTopicId !== entry.topicId ||
      a.rrScriptVersion !== String(entry.scriptVersion)) return 'part_identity_mismatch';
  return null;
}

function receiptProblem(remote, record, folderId) {
  if (!remote || remote.trashed) return 'receipt_missing';
  if (remote.mimeType !== RECEIPT_MIME) return 'receipt_mime_changed';
  if (!(remote.parents || []).includes(folderId)) return 'receipt_moved';
  if (Number(remote.size) !== record.size || remote.md5Checksum !== record.md5 || remote.sha256Checksum !== record.sha256)
    return 'receipt_checksum_mismatch';
  const a = remote.appProperties || {};
  if (a.rrKind !== 'recording-set' || a.rrSha256 !== record.sha256 || a.rrTopicId !== record.topicId ||
      a.rrScriptVersion !== String(record.scriptVersion)) return 'receipt_identity_mismatch';
  return null;
}

// Folder chain incoming/<topic>/v<version> must be exactly the one the uploader recorded, and each part slot must
// hold exactly the uploaded file (no duplicate or foreign file with the same name).
async function partsProblem(drive, journal, entries, folderId, incomingId) {
  const {topicId, scriptVersion} = entries[0];
  const topicRecord = journal.state.folders?.[topicId], versionRecord = journal.state.folders?.[`${topicId}/v${scriptVersion}`];
  if (topicRecord?.status !== 'ok' || versionRecord?.status !== 'ok' || versionRecord.id !== folderId) return 'folder_record_mismatch';
  const topic = await drive.get(topicRecord.id), version = await drive.get(folderId);
  const folderOk = (f, name, parent) => f && !f.trashed && f.mimeType === FOLDER && f.name === name && (f.parents || []).includes(parent);
  if (!folderOk(topic, topicId, incomingId) || !folderOk(version, `v${scriptVersion}`, topic.id)) return 'folder_changed';
  for (const entry of entries) {
    const problem = partProblem(await drive.get(entry.driveFileId), entry, folderId);
    if (problem) return problem;
    const named = await drive.listChildren(folderId, `${entry.role}.mp4`);
    if (named.length !== 1 || named[0].id !== entry.driveFileId) return 'part_slot_ambiguous';
  }
  return null;
}

export async function finalizeReceipt({packet, journal, drive, incomingId = INCOMING_ID, now = () => new Date()}) {
  if (packet == null) return {slot: null, status: 'blocked', code: 'packet_missing',
    message: 'No explicit verified four-part packet supplied; old or rejected texts are not used instead'};
  let receipt;
  try { receipt = buildFourPartReceipt(packet, journal.state); } catch (error) {
    return {slot: null, status: 'blocked', code: 'receipt_not_buildable', message: error.message};
  }
  const slot = `${receipt.topicId}/v${receipt.scriptVersion}`;
  const bytes = receiptBytes(receipt), sums = digest(bytes);
  const receipts = journal.state.receipts ||= {};
  let record = receipts[slot];
  const result = (status, code = null, message = null) => ({slot, status, code, message, driveFileId: record?.driveFileId || null,
    receiptSha256: sums.sha256});
  // Before an ID is reserved nothing was written to Drive: report a blocker without parking the slot.
  const stop = async (code, message) => {
    if (!record?.driveFileId) return result('blocked', code, message);
    Object.assign(record, {status: 'manual_attention', errorCode: code, errorReason: message, updatedAt: now().toISOString()});
    await journal.save();
    return result('manual_attention', code, message);
  };
  if (record && record.sha256 !== sums.sha256)
    return result('manual_attention', 'receipt_changed', 'A different receipt is already recorded for this slot; it is not replaced');
  if (record?.status === 'manual_attention') return result('manual_attention', record.errorCode, 'Waiting for manual inspection');

  const jobs = Object.values(journal.state.jobs);
  const entries = PART_ROLES.map(role => jobs.find(e => e.topicId === receipt.topicId && e.scriptVersion === receipt.scriptVersion && e.role === role));
  const folderId = entries[0].driveFolderId;
  if (!folderId || entries.some(e => e.driveFolderId !== folderId)) return result('blocked', 'parts_in_different_folders',
    'Uploaded parts are not recorded in one topic/version folder');
  const tempName = `.${RECEIPT_NAME}.uploading-${sums.sha256.slice(0, 16)}`;
  const foreign = async () => (await drive.listChildren(folderId, RECEIPT_NAME)).some(f => f.id !== record?.driveFileId);
  try {
    let problem = await partsProblem(drive, journal, entries, folderId, incomingId);
    if (problem) return stop(problem, 'Drive parts do not match the verified uploads; no receipt is published');
    if (await foreign()) return stop('receipt_conflict', `${RECEIPT_NAME} already exists in Drive; existing file is not replaced`);

    if (record?.status === 'uploaded') {
      const remote = await drive.get(record.driveFileId);
      problem = receiptProblem(remote, record, folderId) || (remote.name !== RECEIPT_NAME ? 'receipt_renamed' : null);
      if (problem) return stop(problem, 'Published receipt no longer matches the journal');
      return result('already_uploaded');
    }

    record ||= receipts[slot] = {topicId: receipt.topicId, scriptVersion: receipt.scriptVersion, ...sums, status: 'new', attempts: 0,
      createdAt: now().toISOString()};
    if (!record.driveFileId) record.driveFileId = await drive.generateId();
    Object.assign(record, {status: 'uploading', driveFolderId: folderId, updatedAt: now().toISOString()});
    await journal.save(); // reserved ID persisted BEFORE the create request

    // After an ambiguous failure the reserved ID is looked up first; the create is repeated only if it is absent.
    let remote = await drive.get(record.driveFileId);
    if (!remote) {
      if (record.attempts >= MAX_UPLOAD_ATTEMPTS) return stop('retry_limit', 'Receipt upload attempts exhausted');
      record.attempts += 1;
      await journal.save();
      try {
        await drive.uploadJson({id: record.driveFileId, name: tempName, parentId: folderId, bytes,
          appProperties: {rrKind: 'recording-set', rrTopicId: receipt.topicId, rrScriptVersion: String(receipt.scriptVersion), rrSha256: sums.sha256}});
      } catch (error) {
        if (!(error instanceof DriveHttpError && error.status === 409)) throw error;
      }
      remote = await drive.get(record.driveFileId);
      if (!remote) throw new UploaderError('receipt_not_visible', 'Receipt create reported but file is not visible yet', {retryable: true});
    }
    problem = receiptProblem(remote, record, folderId);
    if (problem) return stop(problem, 'Uploaded receipt does not match its bytes; left under its temporary name');
    if (remote.name !== RECEIPT_NAME) {
      // Parts are re-read right before the receipt becomes visible to the cloud intake under its final name.
      problem = await partsProblem(drive, journal, entries, folderId, incomingId);
      if (problem) return stop(problem, 'Drive parts changed before the receipt was finalized; left under its temporary name');
      if (await foreign()) return stop('receipt_conflict', `${RECEIPT_NAME} appeared in Drive; receipt left under its temporary name`);
      await drive.rename(record.driveFileId, RECEIPT_NAME);
      remote = await drive.get(record.driveFileId);
    }
    problem = receiptProblem(remote, record, folderId) || (remote.name !== RECEIPT_NAME ? 'rename_failed' : null);
    if (problem) return stop(problem, 'Final receipt verification failed');
    Object.assign(record, {status: 'uploaded', driveName: RECEIPT_NAME, uploadedAt: now().toISOString(), updatedAt: now().toISOString(),
      errorCode: null, errorReason: null});
    await journal.save();
    return result('uploaded');
  } catch (error) {
    if (!(error instanceof UploaderError)) throw error;
    if (error instanceof AuthError) return result('auth_failed', error.code, error.message);
    if (!error.retryable) return stop(error.code, error.message);
    if (record) { Object.assign(record, {errorCode: error.code, errorReason: error.message, updatedAt: now().toISOString()}); await journal.save(); }
    return result('retry_later', error.code, error.message);
  }
}

// One bounded pass under the same lock as MP4 uploads. Packet is an explicit trusted file, never discovered.
export async function runReceipt({packetFile, stateDir, drive, incomingId = INCOMING_ID}) {
  let packet = null;
  if (packetFile) {
    try {
      if ((await fs.stat(packetFile)).size > MAX_PACKET_BYTES) return {status: 'blocked', code: 'packet_too_large', message: 'Packet exceeds byte limit'};
      packet = JSON.parse(await fs.readFile(packetFile, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') packet = null;
      else if (error instanceof SyntaxError) return {status: 'blocked', code: 'packet_invalid', message: 'Packet is not JSON'};
      else throw error;
    }
  }
  if (packet == null) return finalizeReceipt({packet, journal: {state: {}}, drive, incomingId});
  await fs.mkdir(stateDir, {recursive: true});
  return withLock(path.join(stateDir, 'uploader.lock'), async () => {
    const journal = await new Journal(path.join(stateDir, 'journal-v1.json')).load();
    let access;
    try { access = await drive.get(incomingId); } catch (error) {
      if (!(error instanceof UploaderError)) throw error;
      return {status: error instanceof AuthError ? 'auth_failed' : 'retry_later', code: error.code, message: error.message};
    }
    if (!(access && access.mimeType === FOLDER && !access.trashed && access.capabilities?.canAddChildren === true))
      return {status: 'auth_failed', code: 'incoming_not_writable', message: 'This credential cannot add files to Drive incoming'};
    return finalizeReceipt({packet, journal, drive, incomingId});
  });
}

export const receiptExitCode = r => r.status === 'auth_failed' ? 2 : ['uploaded', 'already_uploaded', 'retry_later'].includes(r.status) ? 0 : 1;
