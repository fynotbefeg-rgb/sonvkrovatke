// Offline tests for the Windows source uploader. Fake Drive and fake tokens only: no Google, HeyGen or paid calls.
// Real-media tests cut tiny stream-copies from a tracked repo MP4 and need ffprobe/ffmpeg
// (ROMAN_FFPROBE/ROMAN_FFMPEG, PATH or the bundled Remotion binaries); otherwise they are skipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, appendFileSync, utimesSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AmbiguousNetworkError, AuthError, DriveHttpError, FOLDER, INCOMING_ID, Journal, exitCode, mediaChecker, processJob,
  runJobs, validateJob, driveClient} from './source-uploader.mjs';
import {tokenProvider} from './source-uploader-auth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const md5 = b => createHash('md5').update(b).digest('hex');
const sha = b => createHash('sha256').update(b).digest('hex');
const okMedia = async () => ({durationSec: 1.5, videoStreams: 1, audioStreams: 1});
const fast = {pollMs: 1, samples: 2, minAgeMs: 0, maxWaitMs: 200};

class FakeDrive {
  constructor() {
    this.files = new Map([[INCOMING_ID, {id: INCOMING_ID, name: 'incoming', mimeType: FOLDER, parents: ['assets'], trashed: false,
      capabilities: {canAddChildren: true}}]]);
    this.calls = []; this.next = 0; this.faults = {};
  }
  hit(name) { this.calls.push(name); if (this.faults.auth) throw new AuthError(); }
  async get(id) { this.hit('get'); const f = this.files.get(id); return f ? structuredClone(f) : null; }
  async listChildren(parent, name) { this.hit('list'); return [...this.files.values()].filter(f => f.parents.includes(parent) && f.name === name && !f.trashed).map(f => structuredClone(f)); }
  async generateId() { this.hit('generateId'); return `fake-id-${++this.next}`; }
  async createFolder({id, name, parentId}) {
    this.hit('createFolder');
    if (this.files.has(id)) throw new DriveHttpError(409, 'createFolder');
    this.files.set(id, {id, name, mimeType: FOLDER, parents: [parentId], trashed: false});
    if (this.faults.loseFolderResponse) { this.faults.loseFolderResponse = false; throw new AmbiguousNetworkError('createFolder'); }
  }
  async upload({id, name, parentId, stream, appProperties}) {
    this.hit('upload');
    if (this.files.has(id)) throw new DriveHttpError(409, 'upload');
    if (this.faults.beforeRead) this.faults.beforeRead();
    const chunks = []; for await (const c of stream) chunks.push(c);
    let bytes = Buffer.concat(chunks);
    if (this.faults.corrupt) bytes = Buffer.concat([bytes.subarray(0, -1), Buffer.from([bytes.at(-1) ^ 1])]);
    this.files.set(id, {id, name, mimeType: 'video/mp4', parents: [parentId], trashed: false, appProperties,
      size: String(bytes.length), md5Checksum: md5(bytes), sha256Checksum: sha(bytes), bytes});
    if (this.faults.loseUploadResponse) { this.faults.loseUploadResponse = false; throw new AmbiguousNetworkError('upload'); }
    return this.files.get(id);
  }
  async rename(id, name) { this.hit('rename'); this.files.get(id).name = name; return this.files.get(id); }
  named(name) { return [...this.files.values()].filter(f => f.name === name); }
  count(prefix) { return this.calls.filter(c => c === prefix).length; }
}

function setup(t, {content = Buffer.from('fake mp4 bytes '.repeat(100)), role = 'hook-1'} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'rr-uploader-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const downloads = path.join(root, 'downloads'), state = path.join(root, 'state'), jobs = path.join(root, 'jobs');
  for (const d of [downloads, state, jobs]) mkdirSync(d);
  const file = path.join(downloads, 'Видео аватара.mp4');
  writeFileSync(file, content);
  const job = {schemaVersion: '1.0.0', jobId: 'job-20261012-0001', topicId: 'ai-seo-audit', scriptVersion: 2, role,
    localPath: file, heygenTitle: 'Видео аватара'};
  return {root, downloads, state, jobs, file, job, drive: new FakeDrive(), journalFile: path.join(state, 'journal-v1.json')};
}
const journalOf = async s => new Journal(s.journalFile).load();
const go = async (s, job = s.job, extra = {}) => processJob(job, {drive: s.drive, journal: await journalOf(s), checkMedia: okMedia, readiness: fast, ...extra});
const snapshot = dir => readdirSync(dir).map(n => [n, statSync(path.join(dir, n)).size, statSync(path.join(dir, n)).mtimeMs, sha(readFileSync(path.join(dir, n)))]);

test('job validation: explicit role/topic only, no guessing, no invented script metadata', () => {
  const base = {schemaVersion: '1.0.0', jobId: 'job-20261012-0001', topicId: 'ai-seo-audit', scriptVersion: 1, role: 'body',
    localPath: path.resolve('C:/x/Видео аватара.mp4')};
  assert.equal(validateJob(base).job.heygenTitle, null);
  assert.equal(validateJob(base).job.textHash, null); // never computed or invented by the uploader
  for (const bad of [{role: undefined}, {role: 'ending-instagram'}, {role: 'hook-4'}, {topicId: undefined}, {topicId: 'Видео аватара'},
    {topicId: 'intake-self-test-20261010'}, {scriptVersion: '1'}, {scriptVersion: 0}, {localPath: 'Видео аватара.mp4'},
    {localPath: path.resolve('C:/x/a.mp4.crdownload')}, {localPath: path.resolve('C:/x/a.mov')}, {textHash: 'abc'},
    {approved: true}, {scriptText: 'выдуманный текст'}, {schemaVersion: '2.0.0'}, {jobId: 'x'}]) {
    assert.throws(() => validateJob({...base, ...bad}), {code: 'invalid_job'}, JSON.stringify(bad));
  }
});

test('happy path: role-based working name, HeyGen title kept in journal, sizes and checksums recorded and verified', async t => {
  const s = setup(t);
  const r = await go(s);
  assert.equal(r.status, 'uploaded');
  const [file] = s.drive.named('hook-1.mp4');
  const version = s.drive.files.get(file.parents[0]), topic = s.drive.files.get(version.parents[0]);
  assert.deepEqual([topic.name, version.name, topic.parents[0]], ['ai-seo-audit', 'v2', INCOMING_ID]);
  const entry = (await journalOf(s)).state.jobs[s.job.jobId];
  const bytes = readFileSync(s.file);
  assert.equal(entry.heygenTitle, 'Видео аватара');
  assert.deepEqual([entry.status, entry.driveFileId, entry.role, entry.scriptVersion, entry.size, entry.md5, entry.sha256],
    ['uploaded', file.id, 'hook-1', 2, bytes.length, md5(bytes), sha(bytes)]);
  assert.equal(file.appProperties.rrSha256, sha(bytes));
  assert.equal(s.drive.named('.hook-1.mp4.uploading-job-20261012-0001').length, 0);
});

test('incomplete download: temp sibling or growing file is not uploaded (bounded wait)', async t => {
  const s = setup(t);
  writeFileSync(s.file + '.crdownload', 'partial');
  assert.equal((await go(s)).status, 'not_ready');
  rmSync(s.file + '.crdownload');
  let n = 0;
  const growing = {...fast, maxWaitMs: 50, wait: async () => { appendFileSync(s.file, String(n++)); await new Promise(r => setTimeout(r, 2)); }};
  assert.equal((await go(s, s.job, {readiness: growing})).status, 'not_ready');
  const fresh = {...fast, minAgeMs: 3600000, maxWaitMs: 20};
  assert.equal((await go(s, s.job, {readiness: fresh})).status, 'not_ready');
  assert.equal(s.drive.count('upload'), 0);
  rmSync(s.file);
  assert.equal((await go(s)).status, 'not_ready'); // file not there yet
});

test('file changed during processing: validation or upload aborts, nothing lands in the slot', async t => {
  const s = setup(t);
  const touching = async file => { appendFileSync(file, 'x'); return okMedia(); };
  const r1 = await go(s, s.job, {checkMedia: touching});
  assert.deepEqual([r1.status, r1.code], ['manual_attention', 'source_changed_during_processing']);
  assert.equal(s.drive.count('upload'), 0);

  const s2 = setup(t);
  s2.drive.faults.beforeRead = () => appendFileSync(s2.file, 'changed during upload');
  const r2 = await go(s2);
  assert.deepEqual([r2.status, r2.code], ['manual_attention', 'source_changed_during_upload']);
  assert.equal(s2.drive.named('hook-1.mp4').length, 0); // left only under its temporary name
});

test('repeat of the same job and restart after upload: verified, no duplicate', async t => {
  const s = setup(t);
  assert.equal((await go(s)).status, 'uploaded');
  assert.equal((await go(s)).status, 'already_uploaded');           // same process journal file
  assert.equal((await go(s)).status, 'already_uploaded');           // "restart": journal reloaded from disk
  assert.equal(s.drive.count('upload'), 1);
  assert.equal(s.drive.named('hook-1.mp4').length, 1);
  // Same jobId, different job content → refused, not re-uploaded.
  const r = await go(s, {...s.job, role: 'hook-2'});
  assert.deepEqual([r.status, r.code], ['manual_attention', 'job_changed']);
  // Another job for an already filled slot → refused.
  const other = await go(s, {...s.job, jobId: 'job-20261012-0002'});
  assert.deepEqual([other.status, other.code], ['manual_attention', 'slot_taken_by_other_job']);
});

test('lost response after successful create: next run finds the reserved ID instead of creating again', async t => {
  const s = setup(t);
  s.drive.faults.loseUploadResponse = true;
  const r1 = await go(s);
  assert.deepEqual([r1.status, r1.code], ['retry_later', 'network_ambiguous']);
  assert.equal((await journalOf(s)).state.jobs[s.job.jobId].status, 'uploading');
  const r2 = await go(s);
  assert.equal(r2.status, 'uploaded');
  assert.equal(s.drive.count('upload'), 1);
  assert.equal([...s.drive.files.values()].filter(f => f.mimeType === 'video/mp4').length, 1);

  const f = setup(t);
  f.drive.faults.loseFolderResponse = true;
  assert.equal((await go(f)).status, 'retry_later');
  assert.equal((await go(f)).status, 'uploaded');
  assert.equal(f.drive.named('ai-seo-audit').length, 1);
});

test('checksum mismatch after upload: not renamed into the slot, flagged for manual attention', async t => {
  const s = setup(t);
  s.drive.faults.corrupt = true;
  const r = await go(s);
  assert.deepEqual([r.status, r.code], ['manual_attention', 'checksum_mismatch']);
  assert.equal(s.drive.named('hook-1.mp4').length, 0);
  assert.equal((await go(s)).status, 'manual_attention'); // stays parked, no blind retry
  assert.equal(s.drive.count('upload'), 1);
});

test('authorization refused: nothing uploaded, run stops, exit code 2, no secrets in the log', async t => {
  const s = setup(t);
  s.drive.faults.auth = true;
  assert.equal((await go(s)).status, 'auth_failed');
  writeFileSync(path.join(s.jobs, 'a.json'), JSON.stringify(s.job));
  writeFileSync(path.join(s.jobs, 'b.json'), JSON.stringify({...s.job, jobId: 'job-20261012-0002', role: 'hook-2'}));
  const lines = [];
  const summary = await runJobs({jobsDir: s.jobs, stateDir: s.state, drive: s.drive, checkMedia: okMedia, readiness: fast, log: l => lines.push(l)});
  assert.equal(summary.results.length, 1);
  assert.equal(exitCode(summary), 2);
  assert.equal(s.drive.count('upload'), 0);

  // Real token provider: refused refresh → AuthError without token material in the message.
  const tokenFile = path.join(s.state, 'oauth-token.dpapi');
  const secret = {clientId: 'cid', clientSecret: 'very-secret-client', refreshToken: 'very-secret-refresh'};
  writeFileSync(tokenFile, JSON.stringify(secret));
  const getToken = tokenProvider({tokenFile, crypto: {unprotect: async t => t},
    fetchImpl: async () => new Response(JSON.stringify({error: 'invalid_grant'}), {status: 400})});
  const drive = driveClient({getToken, fetchImpl: async () => { throw new Error('must not be called'); }});
  const error = await drive.get(INCOMING_ID).catch(e => e);
  assert.ok(error instanceof AuthError);
  assert.doesNotMatch(error.message + JSON.stringify(lines), /very-secret/);
  // Folder not writable for the credential (e.g. drive.file scope) → whole run refused before any job.
  const blind = new FakeDrive(); blind.files.get(INCOMING_ID).capabilities.canAddChildren = false;
  const refused = await runJobs({jobsDir: s.jobs, stateDir: s.state, drive: blind, checkMedia: okMedia, readiness: fast});
  assert.deepEqual([refused.results[0].status, refused.results[0].code, blind.count('upload')], ['auth_failed', 'incoming_not_writable', 0]);
});

test('Drive transport: 401 refreshes once, ambiguous network error is never retried blindly for writes', async t => {
  let tokens = 0, calls = 0;
  const getToken = async () => `t${++tokens}`;
  const d1 = driveClient({getToken, fetchImpl: async () => (++calls === 1 ? new Response('', {status: 401}) : Response.json({id: 'x'}))});
  assert.deepEqual(await d1.get('x'), {id: 'x'});
  assert.equal(tokens, 2);
  let writes = 0;
  const d2 = driveClient({getToken, fetchImpl: async () => { writes++; throw new TypeError('socket hang up'); }});
  await assert.rejects(d2.createFolder({id: 'a', name: 'b', parentId: 'c'}), AmbiguousNetworkError);
  assert.equal(writes, 1);
  const d3 = driveClient({getToken, fetchImpl: async () => new Response('', {status: 404})});
  assert.equal(await d3.get('missing'), null);
});

test('slot already occupied in Drive and source changed after upload: nothing replaced silently', async t => {
  const s = setup(t);
  await go(s, {...s.job, role: 'body', jobId: 'job-20261012-0009'}); // creates folders
  const version = s.drive.named('v2')[0];
  s.drive.files.set('foreign', {id: 'foreign', name: 'hook-1.mp4', mimeType: 'video/mp4', parents: [version.id], trashed: false, size: '1', md5Checksum: 'x'});
  const r = await go(s);
  assert.deepEqual([r.status, r.code], ['manual_attention', 'slot_occupied']);
  assert.equal(s.drive.files.get('foreign').size, '1');

  const c = setup(t);
  assert.equal((await go(c)).status, 'uploaded');
  const pick = f => [f.id, f.name, f.size, f.md5Checksum, f.sha256Checksum, f.parents.join()];
  const before = pick(c.drive.named('hook-1.mp4')[0]);
  writeFileSync(c.file, 'a re-downloaded different video');
  const r2 = await go(c);
  assert.deepEqual([r2.status, r2.code], ['manual_attention', 'source_changed_after_upload']);
  assert.deepEqual(pick(c.drive.named('hook-1.mp4')[0]), before);
  assert.equal(c.drive.count('upload'), 1);
});

test('sources stay intact: never deleted, moved, renamed or rewritten in any scenario', async t => {
  const s = setup(t);
  writeFileSync(path.join(s.downloads, 'other personal file.txt'), 'untouched');
  const old = new Date(Date.now() - 60000); utimesSync(s.file, old, old);
  const before = snapshot(s.downloads);
  s.drive.faults.loseUploadResponse = true;
  await go(s); await go(s); await go(s);
  s.drive.faults.corrupt = true;
  await go(s, {...s.job, jobId: 'job-20261012-0003', role: 'hook-3'});
  assert.deepEqual(snapshot(s.downloads), before);
  // Run only reads the explicit jobs folder; a stray file elsewhere is ignored.
  writeFileSync(path.join(s.downloads, 'stray.json'), JSON.stringify({...s.job, jobId: 'job-20261012-0004', role: 'body'}));
  const summary = await runJobs({jobsDir: s.jobs, stateDir: s.state, drive: s.drive, checkMedia: okMedia, readiness: fast});
  assert.deepEqual(summary.results, []);
});

test('bounded runner: max jobs per pass, log per job, six-part intake gap reported, no fake endings', async t => {
  const s = setup(t);
  const roles = ['hook-1', 'hook-2', 'hook-3', 'body'];
  roles.forEach((role, i) => {
    const file = path.join(s.downloads, `part-${i}.mp4`); writeFileSync(file, `distinct bytes ${i} `.repeat(50));
    writeFileSync(path.join(s.jobs, `${i}.json`), JSON.stringify({...s.job, jobId: `job-20261012-010${i}`, role, localPath: file}));
  });
  writeFileSync(path.join(s.jobs, 'broken.json'), '{not json');
  const lines = [];
  const first = await runJobs({jobsDir: s.jobs, stateDir: s.state, drive: s.drive, checkMedia: okMedia, readiness: fast, maxJobs: 3, log: l => lines.push(l)});
  assert.equal(first.results.length, 3);
  assert.equal(first.skippedJobFiles, 2);
  const second = await runJobs({jobsDir: s.jobs, stateDir: s.state, drive: s.drive, checkMedia: okMedia, readiness: fast, log: l => lines.push(l)});
  assert.deepEqual(second.results.map(r => r.status), ['already_uploaded', 'already_uploaded', 'already_uploaded', 'uploaded', 'error']);
  assert.equal(exitCode(second), 1);
  assert.deepEqual(second.intake['ai-seo-audit/v2'], {uploaded: ['body.mp4', 'hook-1.mp4', 'hook-2.mp4', 'hook-3.mp4'],
    missingForSixPartIntake: ['ending-instagram.mp4', 'ending-tiktok.mp4', 'recording-set.json']});
  assert.equal(s.drive.named('ending-instagram.mp4').length + s.drive.named('recording-set.json').length, 0);
  assert.equal(lines.length, 8);
  // A second concurrent run is refused by the lock.
  writeFileSync(path.join(s.state, 'uploader.lock'), '{}');
  await assert.rejects(runJobs({jobsDir: s.jobs, stateDir: s.state, drive: s.drive, checkMedia: okMedia}), {code: 'locked'});
});

// Real media checks.
const bundled = path.resolve(here, '../pv/node_modules/@remotion/compositor-win32-x64-msvc');
const tool = (env, name) => process.env[env] || (existsSync(path.join(bundled, `${name}.exe`)) ? path.join(bundled, `${name}.exe`) :
  (spawnSync(name, ['-version']).status === 0 ? name : null));
const tools = {ffprobe: tool('ROMAN_FFPROBE', 'ffprobe'), ffmpeg: tool('ROMAN_FFMPEG', 'ffmpeg')};
const sample = path.resolve(here, '../pv/public/ai/h3.mp4');
const skipMedia = !tools.ffprobe || !tools.ffmpeg || !existsSync(sample) ? 'ffprobe/ffmpeg or sample MP4 unavailable' : false;

test('real MP4 check: valid, corrupted, truncated and video-only files', {skip: skipMedia}, async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rr-uploader-media-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const cut = (name, extra) => { const out = path.join(dir, name);
    assert.equal(spawnSync(tools.ffmpeg, ['-v', 'error', '-i', sample, '-t', '0.6', ...extra, '-c', 'copy', out]).status, 0); return out; };
  const good = cut('good.mp4', []), silent = cut('silent.mp4', ['-an']);
  const check = mediaChecker(tools);
  assert.ok((await check(good)).durationSec > 0);
  await assert.rejects(check(silent), {code: 'invalid_media', message: /no audio/});
  const garbage = path.join(dir, 'garbage.mp4'); writeFileSync(garbage, Buffer.alloc(4096, 7));
  await assert.rejects(check(garbage), {code: 'invalid_media'});
  const bytes = readFileSync(good);
  const truncated = path.join(dir, 'truncated.mp4'); writeFileSync(truncated, bytes.subarray(0, Math.floor(bytes.length * 0.6)));
  await assert.rejects(check(truncated), {code: 'invalid_media'});
  // End-to-end with real checks: corrupted MP4 never reaches Drive.
  const s = setup(t, {content: readFileSync(garbage)});
  const r = await go(s, s.job, {checkMedia: check});
  assert.deepEqual([r.status, r.code], ['manual_attention', 'invalid_media']);
  assert.equal(s.drive.count('upload'), 0);
  const ok = setup(t, {content: bytes});
  assert.equal((await go(ok, ok.job, {checkMedia: check})).status, 'uploaded');
});
