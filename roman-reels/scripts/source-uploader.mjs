// Windows source uploader: one explicit, verified job = one local MP4 → Drive incoming/<topic>/v<version>/<role>.mp4.
// It never guesses topic/role from file names, never invents script metadata, never deletes or rewrites
// sources, and never touches the cloud intake-state-v1.json. Drive files get pre-generated IDs that are
// persisted in a local journal BEFORE any create, so an ambiguous network failure is reconciled by ID
// instead of blindly creating a duplicate.
import {createHash, randomUUID} from 'node:crypto';
import {createReadStream, promises as fs} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {Readable, Transform} from 'node:stream';

export const INCOMING_ID = '1Qs3YJQB9Hr8H7B0Fa7MWlwsQ0LLGBPoQ';
export const ROLES = ['hook-1', 'hook-2', 'hook-3', 'body'];
// The current cloud intake (INCOMING_SIX_PARTS.md) waits for all of these before a set is complete.
export const SIX_PART_INTAKE_EXTRA = ['ending-instagram.mp4', 'ending-tiktok.mp4', 'recording-set.json'];
export const FOLDER = 'application/vnd.google-apps.folder';
export const MAX_BYTES = 4 * 1024 ** 3;
export const MAX_UPLOAD_ATTEMPTS = 3;
const TEMP_NAME = /\.(crdownload|partial|part|download|tmp|opdownload)$/i;
const JOB_KEYS = new Set(['schemaVersion', 'jobId', 'topicId', 'scriptVersion', 'role', 'localPath', 'heygenTitle', 'textHash']);

export class UploaderError extends Error {
  constructor(code, message, {retryable = false} = {}) { super(message); this.code = code; this.retryable = retryable; }
}
export class AuthError extends UploaderError {
  constructor(message = 'Drive authorization failed; no credential details logged') { super('auth_failed', message); }
}
export class DriveHttpError extends UploaderError {
  constructor(status, operation) {
    super(`drive_http_${status}`, `Drive ${operation} failed: HTTP ${status}`, {retryable: status === 429 || status >= 500});
    this.status = status;
  }
}
// The request may or may not have reached Google: state must be inspected before any new write.
export class AmbiguousNetworkError extends UploaderError {
  constructor(operation) { super('network_ambiguous', `Drive ${operation}: connection lost; result unknown`, {retryable: true}); }
}
const fail = (code, message, options) => { throw new UploaderError(code, message, options); };

const canonical = value => JSON.stringify(value, Object.keys(value).sort());
const sha256 = text => createHash('sha256').update(text).digest('hex');

export function validateJob(raw, {pathStyle = 'native'} = {}) {
  if (!['native', 'windows'].includes(pathStyle)) fail('invalid_job', 'Unknown path style');
  const paths = pathStyle === 'windows' ? path.win32 : path;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('invalid_job', 'Job must be a JSON object');
  for (const key of Object.keys(raw)) if (!JOB_KEYS.has(key)) fail('invalid_job', `Unknown job field: ${key}`);
  const {schemaVersion, jobId, topicId, scriptVersion, role, localPath, heygenTitle = null, textHash = null} = raw;
  if (schemaVersion !== '1.0.0') fail('invalid_job', 'schemaVersion must be 1.0.0');
  if (typeof jobId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{7,79}$/.test(jobId)) fail('invalid_job', 'Invalid jobId');
  if (typeof topicId !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(topicId) || topicId.startsWith('intake-self-test'))
    fail('invalid_job', 'Invalid or reserved topicId');
  if (!Number.isInteger(scriptVersion) || scriptVersion < 1 || scriptVersion > 9999) fail('invalid_job', 'Invalid scriptVersion');
  if (!ROLES.includes(role)) fail('invalid_job', `Role must be one of ${ROLES.join(', ')}`);
  if (typeof localPath !== 'string' || !paths.isAbsolute(localPath) || !/\.mp4$/i.test(localPath) || TEMP_NAME.test(localPath))
    fail('invalid_job', 'localPath must be an absolute path to a finished .mp4');
  if (heygenTitle !== null && (typeof heygenTitle !== 'string' || heygenTitle.length > 300 || /[\u0000-\u001f]/.test(heygenTitle)))
    fail('invalid_job', 'Invalid heygenTitle');
  if (textHash !== null && (typeof textHash !== 'string' || !/^[a-f0-9]{64}$/.test(textHash)))
    fail('invalid_job', 'textHash must come from the verified job as 64 lowercase hex characters');
  const job = {schemaVersion, jobId, topicId, scriptVersion, role, localPath: paths.resolve(localPath), heygenTitle, textHash};
  return {job, jobDigest: sha256(canonical(job))};
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fingerprint = stat => ({size: stat.size, mtimeMs: stat.mtimeMs, ino: stat.ino});
const sameFile = (a, b) => a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino;

async function statFile(file) {
  let stat;
  try { stat = await fs.lstat(file); } catch (error) {
    if (error.code === 'ENOENT') fail('not_ready', 'Source file does not exist yet', {retryable: true});
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail('not_regular_file', 'Source must be a regular file, not a link or folder');
  return stat;
}

// Bounded wait until the browser has finished writing: no temp sibling, size/mtime unchanged
// across consecutive samples and the last write is older than minAgeMs.
export async function waitUntilStable(file, {pollMs = 2000, samples = 3, minAgeMs = 10000, maxWaitMs = 60000,
  now = Date.now, wait = sleep} = {}) {
  const started = now();
  const dir = path.dirname(file), base = path.basename(file);
  let previous = null, same = 0;
  for (;;) {
    const siblings = await fs.readdir(dir);
    const downloading = siblings.some(name => name !== base && name.startsWith(base) && TEMP_NAME.test(name));
    let stat = null;
    try { stat = await statFile(file); } catch (error) { if (error.code !== 'not_ready') throw error; }
    if (!downloading && stat && stat.size > 0) {
      if (stat.size > MAX_BYTES) fail('too_large', 'Source exceeds uploader byte limit');
      same = previous && sameFile(previous, fingerprint(stat)) ? same + 1 : 1;
      previous = fingerprint(stat);
      if (same >= samples && now() - stat.mtimeMs >= minAgeMs) return previous;
    } else { same = 0; previous = null; }
    if (now() - started >= maxWaitMs) fail('not_ready', 'Download not finished within the bounded wait', {retryable: true});
    await wait(pollMs);
  }
}

export async function hashFile(file) {
  const sha = createHash('sha256'), md5 = createHash('md5');
  let size = 0;
  for await (const chunk of createReadStream(file)) { sha.update(chunk); md5.update(chunk); size += chunk.length; }
  return {size, sha256: sha.digest('hex'), md5: md5.digest('hex')};
}

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let out = '', err = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', d => { if (out.length < 1e6) out += d; });
    child.stderr.on('data', d => { if (err.length < 1e4) err += d; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve({code, out, err}); });
  });
}

// ffprobe: an MP4 container with at least one video and one audio stream; ffmpeg: full decode, any error fails.
export function mediaChecker({ffprobe = 'ffprobe', ffmpeg = 'ffmpeg', timeoutMs = 15 * 60 * 1000} = {}) {
  return async file => {
    let probe;
    try { probe = await run(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration,format_name', '-of', 'json', file], 120000); }
    catch { fail('media_tool_missing', 'ffprobe is not available'); }
    let data = null;
    try { data = probe.code === 0 ? JSON.parse(probe.out) : null; } catch { data = null; }
    if (!data) fail('invalid_media', 'MP4 is not readable by ffprobe');
    const types = (data.streams || []).map(s => s.codec_type);
    const duration = Number(data.format?.duration);
    if (!/mp4/.test(data.format?.format_name || '')) fail('invalid_media', 'Container is not MP4');
    if (!types.includes('video')) fail('invalid_media', 'MP4 has no video stream');
    if (!types.includes('audio')) fail('invalid_media', 'MP4 has no audio stream');
    if (!(duration > 0 && Number.isFinite(duration))) fail('invalid_media', 'MP4 has no valid duration');
    let decode;
    try { decode = await run(ffmpeg, ['-nostdin', '-v', 'error', '-xerror', '-i', file, '-map', '0:v:0', '-map', '0:a:0',
      '-c:v', 'rawvideo', '-c:a', 'pcm_s16le', '-f', 'null', '-'], timeoutMs); }
    catch { fail('media_tool_missing', 'ffmpeg is not available'); }
    if (decode.code !== 0 || decode.err.trim()) fail('invalid_media', 'MP4 failed full decode');
    return {durationSec: Math.round(duration * 1000) / 1000, videoStreams: types.filter(t => t === 'video').length,
      audioStreams: types.filter(t => t === 'audio').length};
  };
}

// Local durable journal (separate from the cloud intake ledger). Atomic replace via temp file + rename.
export class Journal {
  constructor(file) { this.file = file; }
  async load() {
    try {
      const state = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (state.journalVersion !== '1.0.0' || typeof state.jobs !== 'object' || typeof state.folders !== 'object')
        fail('journal_invalid', 'Local uploader journal is invalid; inspect it manually');
      this.state = state;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error instanceof SyntaxError ? new UploaderError('journal_invalid', 'Local uploader journal is not JSON') : error;
      this.state = {journalVersion: '1.0.0', jobs: {}, folders: {}};
    }
    return this;
  }
  async save() {
    await fs.mkdir(path.dirname(this.file), {recursive: true});
    const temp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(this.state, null, 2));
    await fs.rename(temp, this.file);
  }
}

// One uploader process at a time; a stale lock is reported, never silently stolen.
export async function withLock(file, fn) {
  let handle;
  try { handle = await fs.open(file, 'wx'); } catch (error) {
    if (error.code === 'EEXIST') fail('locked', 'Another uploader run holds the lock (remove it only after confirming no run is active)');
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify({pid: process.pid, startedAt: new Date().toISOString()}));
    await handle.close(); handle = null;
    return await fn();
  } finally {
    if (handle) await handle.close();
    await fs.rm(file, {force: true});
  }
}

function verifyRemote(remote, entry, parentId) {
  if (!remote || remote.trashed) return 'remote_missing';
  if (!(remote.parents || []).includes(parentId)) return 'remote_moved';
  if (Number(remote.size) !== entry.size || remote.md5Checksum !== entry.md5 ||
      (remote.sha256Checksum && remote.sha256Checksum !== entry.sha256)) return 'checksum_mismatch';
  if (remote.appProperties?.rrJobId !== entry.jobId || remote.appProperties?.rrSha256 !== entry.sha256) return 'remote_identity_mismatch';
  return null;
}

async function ensureFolder(drive, journal, parentId, name, key) {
  const folders = journal.state.folders;
  const valid = m => m && !m.trashed && m.mimeType === FOLDER && m.name === name && (m.parents || []).includes(parentId);
  const record = folders[key];
  if (record?.id) {
    const current = await drive.get(record.id);
    if (valid(current)) {
      if (record.status !== 'ok') { folders[key] = {id: current.id, status: 'ok'}; await journal.save(); }
      return current.id;
    }
    if (current || record.status !== 'creating') fail('folder_changed', `Drive folder ${key} changed; inspect manually`);
  }
  if (!record?.id) {
    const found = await drive.listChildren(parentId, name);
    if (found.length > 1 || (found.length === 1 && !valid(found[0]))) fail('ambiguous_folder', `Drive has an ambiguous ${key}`);
    if (found.length === 1) { folders[key] = {id: found[0].id, status: 'ok'}; await journal.save(); return found[0].id; }
  }
  // Reserve the ID durably first; a lost response is then resolved by GET on the same ID.
  const id = record?.id || await drive.generateId();
  folders[key] = {id, status: 'creating'};
  await journal.save();
  try { await drive.createFolder({id, name, parentId}); } catch (error) {
    if (!(error instanceof DriveHttpError && error.status === 409)) throw error;
  }
  const created = await drive.get(id);
  if (!valid(created)) fail('folder_changed', `Drive folder ${key} could not be verified`);
  folders[key] = {id, status: 'ok'};
  await journal.save();
  return id;
}

function hashingStream(file) {
  const sha = createHash('sha256');
  let size = 0;
  const stream = createReadStream(file).pipe(new Transform({transform(chunk, _encoding, done) { sha.update(chunk); size += chunk.length; done(null, chunk); }}));
  return {stream, result: () => ({size, sha256: sha.digest('hex')})};
}

export async function processJob(raw, {drive, journal, checkMedia, incomingId = INCOMING_ID, readiness = {}, now = () => new Date()}) {
  const {job, jobDigest} = validateJob(raw);
  const jobs = journal.state.jobs;
  let entry = jobs[job.jobId];
  const result = (status, code = null, message = null) => ({jobId: job.jobId, slot: `${job.topicId}/v${job.scriptVersion}/${job.role}`, status, code, message,
    driveFileId: entry?.driveFileId || null});
  const attention = async (code, message) => {
    entry.status = 'manual_attention'; entry.errorCode = code; entry.errorReason = message; entry.updatedAt = now().toISOString();
    await journal.save();
    return result('manual_attention', code, message);
  };
  if (entry && entry.jobDigest !== jobDigest) return result('manual_attention', 'job_changed', 'Same jobId with different job content; use a new jobId');
  if (entry?.status === 'manual_attention') return result('manual_attention', entry.errorCode, 'Waiting for manual inspection');
  const conflict = Object.values(jobs).find(other => other.jobId !== job.jobId && other.topicId === job.topicId &&
    other.scriptVersion === job.scriptVersion && other.role === job.role && ['uploading', 'uploaded'].includes(other.status));
  if (conflict) return result('manual_attention', 'slot_taken_by_other_job', `Slot already used by job ${conflict.jobId}`);

  if (entry?.status === 'uploaded') {
    // Restart/repeat: verify instead of uploading again. A changed source never replaces the upload silently.
    const remote = await drive.get(entry.driveFileId);
    const problem = verifyRemote(remote, entry, entry.driveFolderId) || (remote.name !== `${job.role}.mp4` ? 'remote_renamed' : null);
    if (problem) return attention(problem, 'Previously uploaded Drive file no longer matches the journal');
    try {
      const stat = await statFile(job.localPath);
      if (!sameFile(fingerprint(stat), entry.sourceFingerprint) && (await hashFile(job.localPath)).sha256 !== entry.sha256)
        return attention('source_changed_after_upload', 'Local source differs from the uploaded file; Drive copy kept unchanged');
    } catch (error) { if (error.code !== 'not_ready') throw error; } // a moved/deleted local source does not affect Drive
    return result('already_uploaded');
  }

  entry ||= jobs[job.jobId] = {jobId: job.jobId, jobDigest, topicId: job.topicId, scriptVersion: job.scriptVersion, role: job.role,
    heygenTitle: job.heygenTitle, textHash: job.textHash, localPath: job.localPath, status: 'new', attempts: 0, createdAt: now().toISOString()};
  try {
    const stable = await waitUntilStable(job.localPath, readiness);
    const hashes = await hashFile(job.localPath);
    if (entry.sha256 && entry.sha256 !== hashes.sha256)
      return attention('source_changed', 'Source differs from the file validated in an earlier attempt; use a new jobId');
    const media = await checkMedia(job.localPath);
    if (!sameFile(stable, fingerprint(await statFile(job.localPath))) || (await hashFile(job.localPath)).sha256 !== hashes.sha256)
      return attention('source_changed_during_processing', 'Source changed while it was being validated');
    Object.assign(entry, {size: hashes.size, sha256: hashes.sha256, md5: hashes.md5, durationSec: media.durationSec,
      sourceFingerprint: stable, status: entry.status === 'uploading' ? 'uploading' : 'validated', updatedAt: now().toISOString()});
    await journal.save();

    const topicFolder = await ensureFolder(drive, journal, incomingId, job.topicId, job.topicId);
    const versionFolder = await ensureFolder(drive, journal, topicFolder, `v${job.scriptVersion}`, `${job.topicId}/v${job.scriptVersion}`);
    const finalName = `${job.role}.mp4`, tempName = `.${job.role}.mp4.uploading-${job.jobId}`;
    const occupied = async () => (await drive.listChildren(versionFolder, finalName)).some(f => f.id !== entry.driveFileId);
    if (await occupied()) return attention('slot_occupied', `${finalName} already exists in Drive; existing file is not replaced`);

    if (!entry.driveFileId) entry.driveFileId = await drive.generateId();
    Object.assign(entry, {status: 'uploading', driveFolderId: versionFolder, updatedAt: now().toISOString()});
    await journal.save(); // reserved ID persisted BEFORE the create request

    // After an ambiguous failure the reserved ID is looked up first; a create is repeated only if it is absent.
    let remote = await drive.get(entry.driveFileId);
    if (!remote) {
      if (entry.attempts >= MAX_UPLOAD_ATTEMPTS) return attention('retry_limit', 'Upload attempts exhausted');
      entry.attempts += 1;
      await journal.save();
      const sending = hashingStream(job.localPath);
      try {
        await drive.upload({id: entry.driveFileId, name: tempName, parentId: versionFolder, size: entry.size, stream: sending.stream,
          appProperties: {rrJobId: job.jobId, rrRole: job.role, rrTopicId: job.topicId, rrScriptVersion: String(job.scriptVersion), rrSha256: entry.sha256}});
      } catch (error) {
        if (!(error instanceof DriveHttpError && error.status === 409)) throw error;
      }
      const sent = sending.result();
      remote = await drive.get(entry.driveFileId);
      if (sent.sha256 !== entry.sha256 && sent.size > 0) return attention('source_changed_during_upload', 'Bytes sent differ from validated source; Drive file left under its temporary name');
    }
    if (!sameFile(stable, fingerprint(await statFile(job.localPath))))
      return attention('source_changed_during_upload', 'Source changed during upload; Drive file left under its temporary name');
    const problem = verifyRemote(remote, entry, versionFolder);
    if (problem) return attention(problem, 'Drive size/checksum does not match the validated source; not renamed into the slot');
    if (remote.name !== finalName) {
      if (await occupied()) return attention('slot_occupied', `${finalName} appeared in Drive; upload left under temporary name`);
      await drive.rename(entry.driveFileId, finalName);
      remote = await drive.get(entry.driveFileId);
    }
    const finalProblem = verifyRemote(remote, entry, versionFolder) || (remote.name !== finalName ? 'rename_failed' : null);
    if (finalProblem) return attention(finalProblem, 'Final Drive verification failed');
    Object.assign(entry, {status: 'uploaded', driveName: finalName, uploadedAt: now().toISOString(), updatedAt: now().toISOString(),
      errorCode: null, errorReason: null});
    await journal.save();
    return result('uploaded');
  } catch (error) {
    if (!(error instanceof UploaderError)) throw error;
    if (error instanceof AuthError) return result('auth_failed', error.code, error.message);
    if (error.code === 'not_ready') return result('not_ready', error.code, error.message);
    if (!error.retryable) return attention(error.code, error.message);
    entry.errorCode = error.code; entry.errorReason = error.message; entry.updatedAt = now().toISOString();
    await journal.save();
    return result('retry_later', error.code, error.message);
  }
}

// Bounded run over an explicit jobs folder only (no scanning of personal files or the whole Drive).
export async function runJobs({jobsDir, stateDir, drive, checkMedia, readiness, maxJobs = 20, incomingId = INCOMING_ID, log = () => {}}) {
  await fs.mkdir(stateDir, {recursive: true});
  return withLock(path.join(stateDir, 'uploader.lock'), async () => {
    const journal = await new Journal(path.join(stateDir, 'journal-v1.json')).load();
    const names = (await fs.readdir(jobsDir, {withFileTypes: true})).filter(d => d.isFile() && d.name.endsWith('.json')).map(d => d.name).sort();
    const results = [];
    if (names.length) {
      // Listing an invisible folder returns an empty list, so access is checked explicitly once per run.
      let access = null;
      try { access = await drive.get(incomingId); } catch (error) {
        if (!(error instanceof UploaderError)) throw error;
        results.push({status: error instanceof AuthError ? 'auth_failed' : 'retry_later', code: error.code, message: error.message});
      }
      if (!results.length && !(access && access.mimeType === FOLDER && !access.trashed && access.capabilities?.canAddChildren === true))
        results.push({status: 'auth_failed', code: 'incoming_not_writable', message: 'This credential cannot add files to Drive incoming'});
      if (results.length) { log({at: new Date().toISOString(), ...results[0]}); return {results, skippedJobFiles: names.length, intake: {}}; }
    }
    for (const name of names.slice(0, maxJobs)) {
      let outcome;
      try {
        const raw = JSON.parse(await fs.readFile(path.join(jobsDir, name), 'utf8'));
        outcome = await processJob(raw, {drive, journal, checkMedia, incomingId, readiness});
      } catch (error) {
        outcome = {jobFile: name, status: 'error', code: error.code || 'invalid_job_file', message: error.message};
      }
      results.push(outcome);
      log({at: new Date().toISOString(), jobFile: name, ...outcome});
      if (outcome.status === 'auth_failed') break; // every further Drive call would fail the same way
    }
    const slots = {};
    for (const entry of Object.values(journal.state.jobs))
      if (entry.status === 'uploaded') (slots[`${entry.topicId}/v${entry.scriptVersion}`] ||= []).push(`${entry.role}.mp4`);
    const intake = Object.fromEntries(Object.entries(slots).map(([slot, files]) => [slot, {
      uploaded: files.sort(), missingForSixPartIntake: [...ROLES.map(r => `${r}.mp4`).filter(f => !files.includes(f)), ...SIX_PART_INTAKE_EXTRA]}]));
    return {results, skippedJobFiles: Math.max(0, names.length - maxJobs), intake};
  });
}

export const exitCode = summary => summary.results.some(r => r.status === 'auth_failed') ? 2 :
  summary.results.some(r => !['uploaded', 'already_uploaded', 'not_ready', 'retry_later'].includes(r.status)) ? 1 : 0;

// Drive REST v3 transport. getToken({force}) supplies an OAuth access token; nothing secret is logged.
export function driveClient({getToken, fetchImpl = fetch}) {
  const api = 'https://www.googleapis.com/drive/v3/', upload = 'https://www.googleapis.com/upload/drive/v3/';
  const fields = 'id,name,mimeType,parents,size,md5Checksum,sha256Checksum,trashed,appProperties,capabilities(canAddChildren)';
  async function call(operation, url, init = {}, {replayable = true} = {}) {
    for (let attempt = 0; ; attempt++) {
      const token = await getToken({force: attempt > 0});
      let response;
      try { response = await fetchImpl(url, {...init, headers: {...init.headers, authorization: `Bearer ${token}`}}); }
      catch { throw new AmbiguousNetworkError(operation); }
      if (response.status === 401 && attempt === 0 && replayable) continue;
      if (response.status === 401) throw new AuthError();
      return response;
    }
  }
  const json = async (operation, response) => {
    if (!response.ok) throw new DriveHttpError(response.status, operation);
    try { return await response.json(); } catch { throw new AmbiguousNetworkError(operation); }
  };
  return {
    async get(id) {
      const response = await call('get', `${api}files/${encodeURIComponent(id)}?fields=${fields}&supportsAllDrives=true`);
      if (response.status === 404) return null;
      return json('get', response);
    },
    async listChildren(parentId, name) {
      const q = `'${parentId.replace(/[\\']/g, '\\$&')}' in parents and name = '${name.replace(/[\\']/g, '\\$&')}' and trashed = false`;
      const data = await json('list', await call('list', `${api}files?${new URLSearchParams({q, fields: `files(${fields})`, pageSize: '10', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true'})}`));
      return data.files || [];
    },
    // Bounded read of a pinned private delivery file; no writes or redirects.
    async readJsonBytes(id, maxBytes = 65536) {
      const response = await call('readJsonBytes', `${api}files/${encodeURIComponent(id)}?alt=media`,
        {redirect: 'error', signal: AbortSignal.timeout(30000)});
      if (!response.ok) throw new DriveHttpError(response.status, 'readJsonBytes');
      const chunks = []; let total = 0;
      for await (const chunk of response.body) {
        total += chunk.length;
        if (total > maxBytes) fail('delivery_too_large', 'Delivery JSON exceeds byte cap');
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    },
    // Replace the bytes of one existing pinned JSON file (acknowledgement slot); never creates files.
    async updateJsonBytes(id, bytes) {
      return json('updateJsonBytes', await call('updateJsonBytes', `${upload}files/${encodeURIComponent(id)}?uploadType=media&fields=${fields}&supportsAllDrives=true`,
        {method: 'PATCH', redirect: 'error', headers: {'content-type': 'application/json'}, body: bytes}, {replayable: false}));
    },
    async generateId() {
      const data = await json('generateIds', await call('generateIds', `${api}files/generateIds?count=1&space=drive&type=files`));
      return data.ids[0];
    },
    async createFolder({id, name, parentId}) {
      return json('createFolder', await call('createFolder', `${api}files?fields=${fields}&supportsAllDrives=true`, {method: 'POST',
        headers: {'content-type': 'application/json; charset=utf-8'}, body: JSON.stringify({id, name, mimeType: FOLDER, parents: [parentId]})}));
    },
    async upload({id, name, parentId, size, stream, appProperties}) {
      const init = await call('uploadInit', `${upload}files?uploadType=resumable&fields=${fields}&supportsAllDrives=true`, {method: 'POST',
        headers: {'content-type': 'application/json; charset=utf-8', 'x-upload-content-type': 'video/mp4', 'x-upload-content-length': String(size)},
        body: JSON.stringify({id, name, parents: [parentId], mimeType: 'video/mp4', appProperties})});
      if (!init.ok) throw new DriveHttpError(init.status, 'uploadInit');
      const session = init.headers.get('location');
      if (!session) throw new AmbiguousNetworkError('uploadInit');
      return json('upload', await call('upload', session, {method: 'PUT', duplex: 'half',
        headers: {'content-type': 'video/mp4', 'content-length': String(size)}, body: Readable.toWeb(stream)}, {replayable: false}));
    },
    // Small JSON file (recording-set.json) in one multipart request with a pre-generated ID.
    async uploadJson({id, name, parentId, bytes, appProperties}) {
      const boundary = `rr-${randomUUID()}`;
      const meta = JSON.stringify({id, name, parents: [parentId], mimeType: 'application/json', appProperties});
      const body = Buffer.concat([Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=utf-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\ncontent-type: application/json\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
      return json('uploadJson', await call('uploadJson', `${upload}files?uploadType=multipart&fields=${fields}&supportsAllDrives=true`, {method: 'POST',
        headers: {'content-type': `multipart/related; boundary=${boundary}`}, body}));
    },
    async rename(id, name) {
      return json('rename', await call('rename', `${api}files/${encodeURIComponent(id)}?fields=${fields}&supportsAllDrives=true`, {method: 'PATCH',
        headers: {'content-type': 'application/json; charset=utf-8'}, body: JSON.stringify({name})}));
    },
  };
}
