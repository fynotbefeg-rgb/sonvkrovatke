// Offline tests for recording-set.json finalization after four uploads. Fake Drive only: no Google, HeyGen or paid calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {AmbiguousNetworkError, AuthError, DriveHttpError, FOLDER, INCOMING_ID, Journal, driveClient, processJob} from './source-uploader.mjs';
import {buildFourPartReceipt, textHash} from './build-four-part-receipt.mjs';
import {RECEIPT_NAME, finalizeReceipt, receiptBytes, receiptExitCode, runReceipt} from './four-part-receipt-upload.mjs';

const md5 = b => createHash('md5').update(b).digest('hex');
const sha = b => createHash('sha256').update(b).digest('hex');
const okMedia = async () => ({durationSec: 1.5, videoStreams: 1, audioStreams: 1});
const fast = {pollMs: 1, samples: 2, minAgeMs: 0, maxWaitMs: 200};
const ROLES = ['body', 'hook-1', 'hook-2', 'hook-3'];

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
  }
  store(id, name, parentId, mimeType, bytes, appProperties) {
    this.files.set(id, {id, name, mimeType, parents: [parentId], trashed: false, appProperties,
      size: String(bytes.length), md5Checksum: md5(bytes), sha256Checksum: sha(bytes), bytes});
  }
  async upload({id, name, parentId, stream, appProperties}) {
    this.hit('upload');
    if (this.files.has(id)) throw new DriveHttpError(409, 'upload');
    const chunks = []; for await (const c of stream) chunks.push(c);
    this.store(id, name, parentId, 'video/mp4', Buffer.concat(chunks), appProperties);
  }
  async uploadJson({id, name, parentId, bytes, appProperties}) {
    this.hit('uploadJson');
    if (this.files.has(id)) throw new DriveHttpError(409, 'uploadJson');
    const stored = this.faults.corruptJson ? Buffer.concat([bytes, Buffer.from(' ')]) : bytes;
    this.store(id, name, parentId, 'application/json', stored, appProperties);
    if (this.faults.loseJsonResponse) { this.faults.loseJsonResponse = false; throw new AmbiguousNetworkError('uploadJson'); }
  }
  async rename(id, name) {
    this.hit('rename');
    if (this.faults.beforeRename) this.faults.beforeRename();
    this.files.get(id).name = name;
  }
  named(name) { return [...this.files.values()].filter(f => f.name === name); }
  count(op) { return this.calls.filter(c => c === op).length; }
  writes() { return this.calls.filter(c => ['generateId', 'createFolder', 'upload', 'uploadJson', 'rename'].includes(c)).length; }
}

function packetFor(topic = 'receipt-test', revision = 2) {
  const body = 'Точная основа\nс пробелами.';
  const sourceSet = {topic_id: topic, recordingParts: 4, status: 'pending_approval', body_text: body, body_text_hash: textHash(body),
    hooks: [1, 2, 3].map(hook_id => ({hook_id, hook_text: `Хук ${hook_id}!`}))};
  return {draftVersion: '3.0.0', mode: 'editorial', productionReady: false, syntheticFixtures: true, sourceSet,
    items: sourceSet.hooks.map(h => {
      const id = `R-${topic}-h${h.hook_id}`, script = `${h.hook_text}\n\n${body}`;
      return {version_id: id, topic_id: topic, hook_id: h.hook_id, script_revision: revision, hook_text: h.hook_text, script_text: script,
        status: 'pending_approval', script_hash: textHash(JSON.stringify([id, revision, h.hook_text, script]))};
    })};
}
const partText = (packet, role) => role === 'body' ? packet.sourceSet.body_text :
  packet.sourceSet.hooks.find(h => `hook-${h.hook_id}` === role).hook_text;

// Uploads four parts through the real PR22 uploader; textHash is preassigned in each job before the upload.
async function setup(t, {roles = ROLES, hashFor} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'rr-receipt-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const state = path.join(root, 'state'), downloads = path.join(root, 'downloads');
  mkdirSync(state); mkdirSync(downloads);
  const packet = packetFor(), drive = new FakeDrive(), journalFile = path.join(state, 'journal-v1.json');
  const journal = await new Journal(journalFile).load();
  for (const [i, role] of roles.entries()) {
    const file = path.join(downloads, `part-${i}.mp4`);
    writeFileSync(file, `synthetic mp4 bytes ${role} `.repeat(40));
    const textHashValue = hashFor ? hashFor(role, packet) : textHash(partText(packet, role));
    const job = {schemaVersion: '1.0.0', jobId: `receipt-job-${role}`, topicId: 'receipt-test', scriptVersion: 2, role, localPath: file,
      ...(textHashValue === undefined ? {} : {textHash: textHashValue})};
    assert.equal((await processJob(job, {drive, journal, checkMedia: okMedia, readiness: fast})).status, 'uploaded');
  }
  const packetFile = path.join(root, 'packet.json');
  writeFileSync(packetFile, JSON.stringify(packet));
  const fresh = async () => new Journal(journalFile).load(); // a new process reloads the journal from disk
  const go = async (p = packet) => finalizeReceipt({packet: p, journal: await fresh(), drive});
  return {root, state, packet, packetFile, drive, journalFile, fresh, go};
}
const partOf = (s, role) => s.drive.named(`${role}.mp4`)[0];

test('four verified uploads: receipt v1 bytes in Drive match the builder, final name only after verification', async t => {
  const s = await setup(t);
  const writesBefore = s.drive.writes();
  const r = await s.go();
  assert.equal(r.status, 'uploaded');
  const [file] = s.drive.named(RECEIPT_NAME);
  const expected = buildFourPartReceipt(s.packet, (await s.fresh()).state);
  assert.deepEqual(JSON.parse(file.bytes.toString('utf8')), expected);
  assert.deepEqual(Object.keys(expected).sort(), ['files', 'receiptVersion', 'scriptVersion', 'topicId']);
  assert.equal(file.mimeType, 'application/json');
  assert.deepEqual([file.sha256Checksum, file.md5Checksum, Number(file.size)], [r.receiptSha256, md5(receiptBytes(expected)), receiptBytes(expected).length]);
  assert.equal(file.parents[0], partOf(s, 'body').parents[0]);
  assert.equal(file.appProperties.rrKind, 'recording-set');
  // Created under a temporary name, renamed once; exactly one JSON create, no MP4 writes.
  assert.deepEqual([s.drive.count('uploadJson'), s.drive.count('upload'), s.drive.count('rename'), s.drive.writes() - writesBefore], [1, 4, 5, 3]);
  assert.equal(s.drive.named(`.${RECEIPT_NAME}.uploading-${r.receiptSha256.slice(0, 16)}`).length, 0);
  const record = (await s.fresh()).state.receipts['receipt-test/v2'];
  assert.deepEqual([record.status, record.driveFileId, record.sha256], ['uploaded', file.id, r.receiptSha256]);
});

test('incomplete set or missing packet: blocker, nothing written to Drive', async t => {
  const s = await setup(t, {roles: ['body', 'hook-1', 'hook-2']});
  const writes = s.drive.writes();
  const r = await s.go();
  assert.deepEqual([r.status, r.code], ['blocked', 'receipt_not_buildable']);
  const missing = await finalizeReceipt({packet: null, journal: await s.fresh(), drive: s.drive});
  assert.deepEqual([missing.status, missing.code], ['blocked', 'packet_missing']);
  const viaRun = await runReceipt({packetFile: path.join(s.root, 'absent.json'), stateDir: s.state, drive: null});
  assert.deepEqual([viaRun.status, viaRun.code, receiptExitCode(viaRun)], ['blocked', 'packet_missing', 1]);
  assert.equal(s.drive.writes(), writes);
  assert.equal((await s.fresh()).state.receipts, undefined);
});

test('missing or wrong textHash is never assigned afterwards: no receipt', async t => {
  for (const hashFor of [(role, p) => role === 'hook-1' ? undefined : textHash(partText(p, role)),
    (role, p) => textHash(partText(p, role) + (role === 'body' ? ' ' : ''))]) {
    const s = await setup(t, {hashFor});
    const writes = s.drive.writes();
    const r = await s.go();
    assert.deepEqual([r.status, r.code], ['blocked', 'receipt_not_buildable']);
    assert.match(r.message, /textHash/);
    assert.equal(s.drive.writes(), writes);
    assert.equal(s.drive.named(RECEIPT_NAME).length, 0);
  }
});

test('Drive part changed after upload: real Drive state is rechecked, receipt not published', async t => {
  const mutations = {
    part_checksum_mismatch: f => { f.md5Checksum = '0'.repeat(32); },
    part_sha256_unavailable: f => { delete f.sha256Checksum; },
    part_renamed: f => { f.name = 'hook-9.mp4'; },
    part_moved: f => { f.parents = ['elsewhere']; },
    part_missing: f => { f.trashed = true; },
    part_identity_mismatch: f => { f.appProperties.rrRole = 'body'; },
  };
  for (const [code, mutate] of Object.entries(mutations)) {
    const s = await setup(t);
    mutate(s.drive.files.get(partOf(s, 'hook-2').id));
    const r = await s.go();
    assert.deepEqual([r.status, r.code], ['blocked', code], code);
    assert.equal(s.drive.count('uploadJson'), 0);
  }
  // A duplicate file in a part slot is ambiguous as well.
  const d = await setup(t);
  const body = partOf(d, 'body');
  d.drive.files.set('dup', {...structuredClone(body), id: 'dup'});
  assert.equal((await d.go()).code, 'part_slot_ambiguous');
  // A part changed between the receipt upload and its rename: left under the temporary name, slot parked.
  const late = await setup(t);
  late.drive.faults.beforeRename = () => { throw new Error('rename must not happen'); };
  const original = late.drive.uploadJson.bind(late.drive);
  late.drive.uploadJson = async args => { await original(args); late.drive.files.get(partOf(late, 'body').id).md5Checksum = 'f'.repeat(32); };
  const r = await late.go();
  assert.deepEqual([r.status, r.code], ['manual_attention', 'part_checksum_mismatch']);
  assert.equal(late.drive.named(RECEIPT_NAME).length, 0);
  assert.equal((await late.go()).status, 'manual_attention'); // stays parked, no blind retry
});

test('receipt checksum mismatch after upload: not renamed, not retried blindly', async t => {
  const s = await setup(t);
  s.drive.faults.corruptJson = true;
  const r = await s.go();
  assert.deepEqual([r.status, r.code], ['manual_attention', 'receipt_checksum_mismatch']);
  assert.equal(s.drive.named(RECEIPT_NAME).length, 0);
  assert.equal((await s.go()).status, 'manual_attention');
  assert.equal(s.drive.count('uploadJson'), 1);
});

test('lost response after create: next process finds the reserved ID, no duplicate receipt', async t => {
  const s = await setup(t);
  s.drive.faults.loseJsonResponse = true;
  const r1 = await s.go();
  assert.deepEqual([r1.status, r1.code], ['retry_later', 'network_ambiguous']);
  const reserved = (await s.fresh()).state.receipts['receipt-test/v2'];
  assert.equal(reserved.status, 'uploading');
  const r2 = await s.go();
  assert.deepEqual([r2.status, r2.driveFileId], ['uploaded', reserved.driveFileId]);
  assert.equal(s.drive.count('uploadJson'), 1);
  assert.equal([...s.drive.files.values()].filter(f => f.mimeType === 'application/json').length, 1);
});

test('repeat by a new process: already_uploaded with the same ID, no second create', async t => {
  const s = await setup(t);
  const first = await s.go();
  const second = await s.go(), third = await s.go(structuredClone(s.packet));
  assert.deepEqual([second.status, third.status], ['already_uploaded', 'already_uploaded']);
  assert.equal(second.driveFileId, first.driveFileId);
  assert.deepEqual([s.drive.count('uploadJson'), s.drive.count('generateId') , s.drive.named(RECEIPT_NAME).length], [1, 7, 1]);
  // The full runner (lock + access check) gives the same answer.
  const run = await runReceipt({packetFile: s.packetFile, stateDir: s.state, drive: s.drive});
  assert.deepEqual([run.status, receiptExitCode(run)], ['already_uploaded', 0]);
});

test('receipt conflicts: foreign file, modified own receipt, different packet text all block without overwrite', async t => {
  const s = await setup(t);
  const folder = partOf(s, 'body').parents[0];
  s.drive.store('foreign', RECEIPT_NAME, folder, 'application/json', Buffer.from('{"other":true}'), {});
  const writes = s.drive.writes();
  const r = await s.go();
  assert.deepEqual([r.status, r.code], ['blocked', 'receipt_conflict']);
  assert.equal(s.drive.files.get('foreign').bytes.toString(), '{"other":true}');
  assert.equal(s.drive.writes(), writes);

  const m = await setup(t);
  await m.go();
  const own = m.drive.named(RECEIPT_NAME)[0];
  m.drive.store(own.id, RECEIPT_NAME, own.parents[0], 'application/json', Buffer.from('{}'), own.appProperties);
  const r2 = await m.go();
  assert.deepEqual([r2.status, r2.code], ['manual_attention', 'receipt_checksum_mismatch']);
  assert.equal(m.drive.files.get(own.id).bytes.toString(), '{}');

  const c = await setup(t);
  await c.go();
  const changed = structuredClone(c.packet); changed.syntheticFixtures = false; // same texts → same receipt bytes
  assert.equal((await c.go(changed)).status, 'already_uploaded');
  // A rebuilt receipt with other bytes for the same slot is refused instead of replacing the recorded one.
  const journal = await c.fresh();
  journal.state.receipts['receipt-test/v2'].sha256 = '0'.repeat(64);
  await journal.save();
  const r3 = await c.go();
  assert.deepEqual([r3.status, r3.code], ['manual_attention', 'receipt_changed']);
  assert.equal(c.drive.count('uploadJson'), 1);
});

test('authorization refused: no Drive write, journal unchanged, exit code 2', async t => {
  const s = await setup(t);
  const before = readFileSync(s.journalFile, 'utf8'), writes = s.drive.writes();
  s.drive.faults.auth = true;
  const direct = await s.go();
  assert.equal(direct.status, 'auth_failed');
  const run = await runReceipt({packetFile: s.packetFile, stateDir: s.state, drive: s.drive});
  assert.deepEqual([run.status, receiptExitCode(run)], ['auth_failed', 2]);
  s.drive.faults.auth = false;
  s.drive.files.get(INCOMING_ID).capabilities.canAddChildren = false;
  const blind = await runReceipt({packetFile: s.packetFile, stateDir: s.state, drive: s.drive});
  assert.deepEqual([blind.status, blind.code], ['auth_failed', 'incoming_not_writable']);
  assert.equal(readFileSync(s.journalFile, 'utf8'), before);
  assert.equal(s.drive.writes(), writes);
});

test('Drive transport: JSON multipart create carries reserved ID, temp name, JSON MIME and exact bytes', async () => {
  let seen;
  const drive = driveClient({getToken: async () => 'token', fetchImpl: async (url, init) => { seen = {url, init}; return Response.json({id: 'r1'}); }});
  const bytes = receiptBytes({receiptVersion: '1.0.0'});
  assert.deepEqual(await drive.uploadJson({id: 'r1', name: '.tmp', parentId: 'folder', bytes, appProperties: {rrKind: 'recording-set'}}), {id: 'r1'});
  assert.match(seen.url, /upload\/drive\/v3\/files\?uploadType=multipart/);
  const body = seen.init.body.toString('utf8');
  const boundary = seen.init.headers['content-type'].match(/boundary=(.+)$/)[1];
  const parts = body.split(`--${boundary}`);
  const meta = JSON.parse(parts[1].split('\r\n\r\n')[1]);
  assert.deepEqual(meta, {id: 'r1', name: '.tmp', parents: ['folder'], mimeType: 'application/json', appProperties: {rrKind: 'recording-set'}});
  assert.equal(parts[2].split('\r\n\r\n')[1].replace(/\r\n$/, ''), bytes.toString('utf8'));
  await assert.rejects(driveClient({getToken: async () => 't', fetchImpl: async () => { throw new TypeError('reset'); }})
    .uploadJson({id: 'x', name: 'y', parentId: 'z', bytes, appProperties: {}}), AmbiguousNetworkError);
});
