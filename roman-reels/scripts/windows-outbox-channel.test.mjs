// Offline tests for the outbox channel. Fake Drive, fictional plans; no Google, Telegram, HeyGen or paid calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, rm, writeFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {buildDelivery, emptyDelivery, MAILBOX_NAME} from './windows-plan-delivery.mjs';
import {emptyAck} from './windows-plan-ack.mjs';
import {AmbiguousNetworkError} from './source-uploader.mjs';
import {deliveryPlan} from './testing/delivery-fixture.mjs';
import {OUTBOX_NAME, emptyOutbox, newestPrepared, parseOutboxSlot, pushOutbox, relayDecision} from './windows-outbox-channel.mjs';
import {readApprovedQueue} from './approved-four-part-jobs.mjs';

const now = Date.parse('2026-10-13T12:00:00Z');
const md5 = b => createHash('md5').update(b).digest('hex');
const mailboxConfig = {fileId: 'mailbox-file-0001', folderId: 'mailbox-folder-0001'};
const outboxConfig = {fileId: 'outbox-slot-0001'};
const EMPTY_BOX = Buffer.from(JSON.stringify(emptyDelivery())), EMPTY_OUT = Buffer.from(JSON.stringify(emptyOutbox()));
const EMPTY_ACK = Buffer.from(JSON.stringify(emptyAck()));
const planB = () => { const p = deliveryPlan(); p.planKey = 'b'.repeat(64); for (const j of p.jobs) j.jobId = `rr-${p.planKey.slice(0, 40)}-${j.role}`; return p; };
const envA = (t = now) => buildDelivery(deliveryPlan(), {now: t, ttlMs: 900000});
const envB = (t = now) => buildDelivery(planB(), {now: t, ttlMs: 900000});

class FakeDrive {
  constructor(outbox = EMPTY_OUT, mailbox = EMPTY_BOX) { this.files = new Map(); this.put(outboxConfig.fileId, OUTBOX_NAME, outbox); this.put(mailboxConfig.fileId, MAILBOX_NAME, mailbox); this.calls = []; this.faults = {}; }
  put(id, name, bytes) { this.files.set(id, {id, name, mimeType: 'application/json', parents: [mailboxConfig.folderId], trashed: false, size: String(bytes.length), md5Checksum: md5(bytes), bytes: Buffer.from(bytes)}); }
  async get(id) { this.calls.push('get'); const f = this.files.get(id); if (!f) return null; const {bytes, ...m} = f; return structuredClone(m); }
  async readJsonBytes(id) { this.calls.push('read'); return Buffer.from(this.files.get(id).bytes); }
  async updateJsonBytes(id, bytes) {
    this.calls.push('update');
    if (this.faults.failBefore) { this.faults.failBefore = false; throw new AmbiguousNetworkError('updateJsonBytes'); }
    this.put(id, this.files.get(id).name, bytes);
    if (this.faults.loseResponse) { this.faults.loseResponse = false; throw new AmbiguousNetworkError('updateJsonBytes'); }
  }
  count(op) { return this.calls.filter(c => c === op).length; }
  outbox() { return this.files.get(outboxConfig.fileId).bytes; }
}
async function setup(t, envelopes = [envA()]) {
  const root = await mkdtemp(path.join(tmpdir(), 'rr-outbox-')); t.after(() => rm(root, {recursive: true, force: true}));
  const outboxDir = path.join(root, 'delivery-outbox'); await mkdir(outboxDir);
  for (const bytes of envelopes) { const d = JSON.parse(bytes); await writeFile(path.join(outboxDir, `${d.deliveryId}.${d.issuedAt}.json`), bytes); }
  return {root, outboxDir, drive: new FakeDrive(), push(extra = {}) { return pushOutbox({drive: this.drive, outboxConfig, mailboxConfig, outboxDir, now, ...extra}); }};
}


test('push: newest live envelope goes to the empty outbox slot once; repeat is already_sent', async t => {
  const s = await setup(t, [envA(now - 1000), envA(now)]);
  const r = await s.push();
  assert.deepEqual([r.status, r.generationAllowed, r.renderAllowed], ['sent', false, false]);
  assert.ok(s.drive.outbox().equals(envA(now)));
  assert.equal((await s.push()).status, 'already_sent');
  assert.equal(s.drive.count('update'), 1);
  assert.equal((await readdir(s.outboxDir)).length, 2); // local envelopes are kept
});

test('push: nothing prepared or only expired envelopes -> nothing_to_send, no Drive write', async t => {
  const s = await setup(t, [envA(now - 1000000)]);
  assert.equal((await s.push()).status, 'nothing_to_send');
  assert.equal(s.drive.count('update'), 0);
  assert.equal((await newestPrepared(path.join(s.root, 'missing'), now)), null);
});

test('push: a different unconsumed live envelope is never overwritten; consumed, expired or renewal may be', async t => {
  const s = await setup(t, [envB()]);
  s.drive.put(outboxConfig.fileId, OUTBOX_NAME, envA());
  assert.equal((await s.push()).status, 'blocked_unconsumed');
  assert.ok(s.drive.outbox().equals(envA()));
  s.drive.put(mailboxConfig.fileId, MAILBOX_NAME, envA()); // cloud already published it
  assert.equal((await s.push()).status, 'sent');
  const e = await setup(t, [envB()]);
  e.drive.put(outboxConfig.fileId, OUTBOX_NAME, envA(now - 1000000)); // expired, never consumed
  assert.equal((await e.push()).status, 'sent');
  const r = await setup(t, [envA(now)]);
  r.drive.put(outboxConfig.fileId, OUTBOX_NAME, envA(now - 5000)); // same plan, renewed envelope
  assert.equal((await r.push()).status, 'sent');
});

test('push: foreign slot content, wrong slot metadata or aliasing the mailbox is refused', async t => {
  const s = await setup(t);
  s.drive.put(outboxConfig.fileId, OUTBOX_NAME, Buffer.from('{"other":1}'));
  await assert.rejects(s.push(), /unexpected data/);
  const m = await setup(t); m.drive.files.get(outboxConfig.fileId).parents = ['elsewhere'];
  await assert.rejects(m.push(), /identity/);
  const a = await setup(t);
  await assert.rejects(pushOutbox({drive: a.drive, outboxConfig: {fileId: mailboxConfig.fileId}, mailboxConfig, outboxDir: a.outboxDir, now}), /Separate/);
  for (const x of [s, m, a]) assert.equal(x.drive.count('update'), 0);
});

test('push: lost response is resolved by reading the slot next time, no second write', async t => {
  const s = await setup(t);
  s.drive.faults.loseResponse = true;
  await assert.rejects(s.push(), AmbiguousNetworkError);
  assert.equal((await s.push()).status, 'already_sent');
  assert.equal(s.drive.count('update'), 1);
  const b = await setup(t); b.drive.faults.failBefore = true;
  await assert.rejects(b.push(), AmbiguousNetworkError);
  assert.equal((await b.push()).status, 'sent');
  assert.equal(b.drive.count('update'), 2);
});

const plainQueueFor = env => ({ok: true, items: JSON.parse(env).payload.packet.items.map(i => ({...i, status: 'approved', approved_by: 'approver@example.test', approved_at: '2026-10-13T11:00:00Z'}))});
// Authenticated read through the real reader with a fake transport: only such objects are relay authority.
const authed = (data, at = now) => readApprovedQueue({url: 'https://script.google.com/macros/s/test/exec', token: 'test-token', now: at, fetchImpl: async () => Response.json(data)});

test('relay: publishes only a live envelope whose texts are still approved, through the acknowledgement gate', async () => {
  const a = envA(), q = await authed(plainQueueFor(a));
  assert.equal(relayDecision({outboxBytes: EMPTY_OUT, approvedQueue: q, mailboxBytes: EMPTY_BOX, ackBytes: EMPTY_ACK, now}).status, 'nothing_to_relay');
  const ok = relayDecision({outboxBytes: a, approvedQueue: q, mailboxBytes: EMPTY_BOX, ackBytes: EMPTY_ACK, now});
  assert.deepEqual([ok.status, ok.reason, ok.generationAllowed], ['publish', 'mailbox_empty', false]);
  assert.equal(relayDecision({outboxBytes: a, approvedQueue: q, mailboxBytes: a, ackBytes: EMPTY_ACK, now}).status, 'already_published');
  const later = await authed(plainQueueFor(a), now + 900000);
  assert.equal(relayDecision({outboxBytes: a, approvedQueue: later, mailboxBytes: EMPTY_BOX, ackBytes: EMPTY_ACK, now: now + 900000}).status, 'outbox_expired');
  const revoked = plainQueueFor(a); revoked.items.pop();
  assert.equal(relayDecision({outboxBytes: a, approvedQueue: await authed(revoked), mailboxBytes: EMPTY_BOX, ackBytes: EMPTY_ACK, now}).status, 'approval_changed_or_revoked');
  const b = envB();
  const blocked = relayDecision({outboxBytes: b, approvedQueue: await authed(plainQueueFor(b)), mailboxBytes: a, ackBytes: EMPTY_ACK, now});
  assert.deepEqual([blocked.status, blocked.reason], ['blocked', 'previous_not_acknowledged']);
  assert.throws(() => relayDecision({outboxBytes: Buffer.from('{"x":1}'), approvedQueue: q, mailboxBytes: EMPTY_BOX, ackBytes: EMPTY_ACK, now}));
});

test('relay: saved, copied, mutated or stale queue JSON is never authority, even when it says approved', async () => {
  const a = envA(), q = await authed(plainQueueFor(a));
  for (const forged of [plainQueueFor(a), structuredClone(q)])
    assert.throws(() => relayDecision({outboxBytes: a, approvedQueue: forged, mailboxBytes: EMPTY_BOX, ackBytes: EMPTY_ACK, now}), /authenticated/);
  assert.throws(() => relayDecision({outboxBytes: a, approvedQueue: q, mailboxBytes: EMPTY_BOX, ackBytes: EMPTY_ACK, now: now + 300001}), /authenticated/);
  const mutated = await authed(plainQueueFor(a)); mutated.items[0].script_text += ' ';
  assert.throws(() => relayDecision({outboxBytes: a, approvedQueue: mutated, mailboxBytes: EMPTY_BOX, ackBytes: EMPTY_ACK, now}), /authenticated/);
});

test('malformed mailbox never counts as consumed and blocks the relay', async t => {
  const fake = Buffer.from(JSON.stringify({status: 'staging_only', deliveryId: JSON.parse(envA()).deliveryId}));
  const s = await setup(t, [envB()]);
  s.drive.put(outboxConfig.fileId, OUTBOX_NAME, envA());
  s.drive.put(mailboxConfig.fileId, MAILBOX_NAME, fake);
  assert.equal((await s.push()).status, 'blocked_unconsumed');
  assert.equal(s.drive.count('update'), 0);
  assert.ok(s.drive.outbox().equals(envA()));
  // A real envelope with the same deliveryId but different bytes (renewed) is not proof of consumption either.
  s.drive.put(mailboxConfig.fileId, MAILBOX_NAME, envA(now - 1000));
  assert.equal((await s.push()).status, 'blocked_unconsumed');
  // Wrong mailbox metadata (moved file) is not proof either.
  s.drive.put(mailboxConfig.fileId, MAILBOX_NAME, envA()); s.drive.files.get(mailboxConfig.fileId).parents = ['elsewhere'];
  assert.equal((await s.push()).status, 'blocked_unconsumed');
  assert.equal(s.drive.count('update'), 0);
  const q = await authed(plainQueueFor(envB()));
  assert.throws(() => relayDecision({outboxBytes: envB(), approvedQueue: q, mailboxBytes: fake, ackBytes: EMPTY_ACK, now}));
});

test('slot parser accepts only the empty marker or a complete envelope, independent of current time', () => {
  assert.equal(parseOutboxSlot(EMPTY_OUT).status, 'empty');
  assert.equal(parseOutboxSlot(envA(now - 10 ** 9)).status, 'staging_only');
  const tampered = JSON.parse(envA()); tampered.payload.jobs[0].heygenTitle = 'x';
  assert.throws(() => parseOutboxSlot(Buffer.from(JSON.stringify(tampered))));
});
