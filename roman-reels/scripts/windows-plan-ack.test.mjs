// Offline tests for Windows delivery acknowledgements. Fake Drive, fictional plans; no Google, HeyGen or paid calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, readdir, rm, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {buildDelivery, parseDelivery, emptyDelivery, MAILBOX_NAME, MAILBOX_FOLDER} from './windows-plan-delivery.mjs';
import {ACK_NAME, acknowledgeDelivery, emptyAck, isAcknowledged, mayReplaceDelivery, parseAckSlot} from './windows-plan-ack.mjs';
import {AmbiguousNetworkError, driveClient} from './source-uploader.mjs';
import {deliveryPlan} from './testing/delivery-fixture.mjs';

const now = Date.now();
const hash = (b, t = 'sha256') => createHash(t).update(b).digest('hex');
const config = {fileId: 'mailbox-file-0001', folderId: 'mailbox-folder-0001'};
const ackConfig = {fileId: 'ack-slot-file-0001'};

class FakeDrive {
  constructor(mailbox, ack = Buffer.from(JSON.stringify(emptyAck()))) {
    this.files = new Map([[config.folderId, {id: config.folderId, name: MAILBOX_FOLDER, mimeType: 'application/vnd.google-apps.folder', trashed: false}]]);
    this.put(config.fileId, MAILBOX_NAME, mailbox); this.put(ackConfig.fileId, ACK_NAME, ack);
    this.calls = []; this.faults = {};
  }
  put(id, name, bytes, parents = [config.folderId]) {
    this.files.set(id, {id, name, mimeType: 'application/json', parents, trashed: false, size: String(bytes.length),
      md5Checksum: hash(bytes, 'md5'), sha256Checksum: hash(bytes), bytes: Buffer.from(bytes)});
  }
  meta(id) { const f = this.files.get(id); if (!f) return null; const {bytes, ...m} = f; return structuredClone(m); }
  async get(id) { this.calls.push('get'); if (this.faults.auth) throw new Error('auth denied'); return this.meta(id); }
  async readJsonBytes(id) { this.calls.push('read'); return Buffer.from(this.files.get(id).bytes); }
  async updateJsonBytes(id, bytes) {
    this.calls.push('update');
    if (this.faults.failBeforeWrite) { this.faults.failBeforeWrite = false; throw new AmbiguousNetworkError('updateJsonBytes'); }
    const f = this.files.get(id); this.put(id, f.name, bytes, f.parents);
    if (this.faults.loseResponse) { this.faults.loseResponse = false; throw new AmbiguousNetworkError('updateJsonBytes'); }
    return this.meta(id);
  }
  count(op) { return this.calls.filter(c => c === op).length; }
  ackBytes() { return this.files.get(ackConfig.fileId).bytes; }
}

async function setup(t, bytes = buildDelivery(deliveryPlan(), {now})) {
  const root = await mkdtemp(path.join(tmpdir(), 'delivery-ack-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const s = {root, inbox: path.join(root, 'received-plans'), ackStore: path.join(root, 'delivery-acks'), drive: new FakeDrive(bytes),
    config, ackConfig, now, bytes};
  s.run = (extra = {}) => acknowledgeDelivery({...s, ...extra});
  return s;
}
const localAcks = async s => { try { return (await readdir(s.ackStore)).filter(n => n.endsWith('.json')); } catch { return []; } };

test('successful receipt: ack only after full staging, bound to deliveryId and content hash, no execution flags', async t => {
  const s = await setup(t);
  const r = await s.run();
  assert.deepEqual([r.status, r.acknowledgement, r.jobs], ['received', 'acknowledged', 4]);
  const ack = parseAckSlot(s.drive.ackBytes());
  const delivery = parseDelivery(s.bytes, {now});
  assert.deepEqual([ack.deliveryId, ack.contentSha256, ack.planKey, ack.jobCount], [delivery.deliveryId, hash(s.bytes), delivery.payload.planKey, 4]);
  assert.deepEqual([ack.generationAllowed, ack.uploadAllowed, ack.renderAllowed, ack.currentApprovalRecheckRequired], [false, false, false, true]);
  assert.deepEqual(await localAcks(s), [`${delivery.deliveryId}.${hash(s.bytes)}.json`]);
  assert.ok((await readFile(path.join(s.ackStore, (await localAcks(s))[0]))).equals(s.drive.ackBytes()));
  assert.equal(r.ackSha256, hash(s.drive.ackBytes()));
  assert.equal((await readdir(path.join(s.inbox, delivery.deliveryId, 'jobs'))).length, 4);
  assert.equal(isAcknowledged(s.bytes, s.drive.ackBytes()), true);
});

test('repeat by a new process: already acknowledged, same bytes, no Drive write, no duplicate local record', async t => {
  const s = await setup(t);
  await s.run();
  const before = Buffer.from(s.drive.ackBytes());
  const fresh = new FakeDrive(s.bytes, before);
  const r = await acknowledgeDelivery({...s, drive: fresh, now: now + 1000});
  assert.deepEqual([r.status, r.acknowledgement], ['already_received', 'already_acknowledged']);
  assert.equal(fresh.count('update'), 0);
  assert.ok(fresh.ackBytes().equals(before));
  assert.equal((await localAcks(s)).length, 1);
  assert.equal((await readdir(s.inbox)).filter(n => !n.endsWith('.lock')).length, 1);
});

test('lost response after the slot write: next run finds identical bytes, no second write or record', async t => {
  const s = await setup(t);
  s.drive.faults.loseResponse = true;
  await assert.rejects(s.run(), AmbiguousNetworkError);
  const written = Buffer.from(s.drive.ackBytes());
  assert.equal(parseAckSlot(written).status, 'received');
  const r = await s.run({now: now + 500});
  assert.deepEqual([r.status, r.acknowledgement], ['already_received', 'already_acknowledged']);
  assert.equal(s.drive.count('update'), 1);
  assert.ok(s.drive.ackBytes().equals(written)); // receivedAt is reused from the local store, not regenerated
  assert.equal((await localAcks(s)).length, 1);
  // Lost before reaching Drive: the retry writes the same stored bytes exactly once.
  const b = await setup(t);
  b.drive.faults.failBeforeWrite = true;
  await assert.rejects(b.run(), AmbiguousNetworkError);
  assert.equal(parseAckSlot(b.drive.ackBytes()).status, 'empty');
  const stored = await readFile(path.join(b.ackStore, (await localAcks(b))[0]));
  assert.equal((await b.run({now: now + 500})).acknowledgement, 'acknowledged');
  assert.ok(b.drive.ackBytes().equals(stored));
  assert.equal(b.drive.count('update'), 2);
});

test('corrupted delivery, tampered staging or foreign slot content are never acknowledged', async t => {
  const tampered = JSON.parse(buildDelivery(deliveryPlan(), {now}));
  tampered.payload.jobs[0].heygenTitle = 'changed';
  const c = await setup(t, Buffer.from(JSON.stringify(tampered)));
  await assert.rejects(c.run());
  assert.deepEqual([await localAcks(c), c.drive.count('update')], [[], 0]);

  const s = await setup(t);
  await s.run();
  const id = parseDelivery(s.bytes, {now}).deliveryId;
  await writeFile(path.join(s.inbox, id, 'jobs', 'body.json'), '{"command":"never"}');
  const fresh = new FakeDrive(s.bytes, Buffer.from(JSON.stringify(emptyAck())));
  await assert.rejects(acknowledgeDelivery({...s, drive: fresh}), /Staged job changed/);
  assert.equal(fresh.count('update'), 0);

  const f = await setup(t);
  f.drive.put(ackConfig.fileId, ACK_NAME, Buffer.from('{"someone":"else"}'));
  await assert.rejects(f.run(), /Invalid acknowledgement/);
  assert.equal(f.drive.ackBytes().toString(), '{"someone":"else"}');
  assert.equal(f.drive.count('update'), 0);
});

test('expired delivery or expiry reached after staging: no acknowledgement written', async t => {
  const e = await setup(t);
  await assert.rejects(e.run({now: now + 300000}));
  assert.deepEqual([await localAcks(e), e.drive.count('update')], [[], 0]);
  // Valid while staging, expired at the acknowledgement step.
  const late = await setup(t);
  let calls = 0; const clock = () => (++calls > 3 ? now + 300000 : now);
  await assert.rejects(late.run({now: clock}), /expired before acknowledgement/);
  assert.deepEqual([await localAcks(late), late.drive.count('update')], [[], 0]);
});

test('failure while saving: partial staging or unwritable ack store block the acknowledgement; retry acknowledges once', async t => {
  const p = await setup(t);
  const id = parseDelivery(p.bytes, {now}).deliveryId;
  await mkdir(path.join(p.inbox, `${id}.partial`), {recursive: true});
  await assert.rejects(p.run());
  assert.deepEqual([await localAcks(p), p.drive.count('update')], [[], 0]);

  const s = await setup(t);
  await writeFile(s.ackStore, 'not a directory');
  await assert.rejects(s.run());
  assert.equal(s.drive.count('update'), 0);
  await rm(s.ackStore);
  const r = await s.run({now: now + 100});
  assert.deepEqual([r.status, r.acknowledgement], ['already_received', 'acknowledged']);
  assert.equal(s.drive.count('update'), 1);
});

test('foreign or misconfigured slot is refused; auth failure writes nothing', async t => {
  const s = await setup(t);
  await assert.rejects(acknowledgeDelivery({...s, ackConfig: {fileId: config.fileId}}), /Separate pinned/);
  s.drive.files.get(ackConfig.fileId).parents = ['elsewhere'];
  await assert.rejects(s.run(), /slot identity/);
  const a = await setup(t);
  a.drive.faults.auth = true;
  await assert.rejects(a.run());
  assert.deepEqual([await localAcks(a), a.drive.count('update')], [[], 0]);
});

test('coordinator never replaces an unacknowledged delivery; renewal and acknowledged progression allowed', async t => {
  const first = buildDelivery(deliveryPlan(), {now});
  const otherPlan = deliveryPlan(); otherPlan.planKey = 'b'.repeat(64);
  for (const job of otherPlan.jobs) job.jobId = `rr-${otherPlan.planKey.slice(0, 40)}-${job.role}`;
  const second = buildDelivery(otherPlan, {now});
  const empty = Buffer.from(JSON.stringify(emptyAck()));
  assert.deepEqual(mayReplaceDelivery({currentBytes: Buffer.from(JSON.stringify(emptyDelivery())), ackBytes: empty, nextBytes: first}),
    {allowed: true, reason: 'mailbox_empty'});
  assert.deepEqual(mayReplaceDelivery({currentBytes: first, ackBytes: empty, nextBytes: second}), {allowed: false, reason: 'previous_not_acknowledged'});
  assert.equal(mayReplaceDelivery({currentBytes: first, ackBytes: empty, nextBytes: buildDelivery(deliveryPlan(), {now: now + 1})}).reason, 'same_plan_renewal');
  const s = await setup(t, first);
  await s.run();
  assert.deepEqual(mayReplaceDelivery({currentBytes: first, ackBytes: s.drive.ackBytes(), nextBytes: second}), {allowed: true, reason: 'previous_acknowledged'});
  // An acknowledgement of the old bytes does not cover a renewed envelope or another plan.
  const renewed = buildDelivery(deliveryPlan(), {now: now + 5});
  assert.equal(isAcknowledged(renewed, s.drive.ackBytes()), false);
  assert.deepEqual(mayReplaceDelivery({currentBytes: renewed, ackBytes: s.drive.ackBytes(), nextBytes: second}).allowed, false);
  assert.equal(isAcknowledged(second, s.drive.ackBytes()), false);
});

test('Drive transport: acknowledgement update is a single PATCH of media bytes to the pinned ID, not replayed', async () => {
  const calls = [];
  const d = driveClient({getToken: async () => 'test-token', fetchImpl: async (u, o) => { calls.push([u, o]); return Response.json({id: ackConfig.fileId}); }});
  await d.updateJsonBytes(ackConfig.fileId, Buffer.from('{}'));
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /upload\/drive\/v3\/files\/ack-slot-file-0001\?uploadType=media/);
  assert.equal(calls[0][1].method, 'PATCH');
  assert.equal(calls[0][1].body.toString(), '{}');
  let n = 0;
  const lost = driveClient({getToken: async () => 't', fetchImpl: async () => { n++; throw new TypeError('reset'); }});
  await assert.rejects(lost.updateJsonBytes(ackConfig.fileId, Buffer.from('{}')), AmbiguousNetworkError);
  assert.equal(n, 1);
});
