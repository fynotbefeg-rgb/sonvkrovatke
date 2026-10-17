// Offline tests: Telegram queue -> laptop delivery envelope. Fictional approvals; no Google, Drive, Telegram or HeyGen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {ProductionQueue} from './production-queue.mjs';
import {readApprovedQueue} from './approved-four-part-jobs.mjs';
import {scriptHash} from './approval-manifest.mjs';
import {emptyDelivery, parseDelivery, buildDelivery, validateDeliveryPlan} from './windows-plan-delivery.mjs';
import {emptyAck} from './windows-plan-ack.mjs';
import {expectedBindings, prepareQueueDelivery, waitingJobsFor} from './queue-delivery-bridge.mjs';

const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const now = Date.parse('2026-10-13T12:00:00Z');
const operator = '123456789';
function fixture() {
  const review = {schemaVersion: '1.0.0', topicId: 'bridge-test', topicText: 'Вымышленная тема', revision: 2,
    bodyText: 'Вымышленная основа для теста.', hooks: [1, 2, 3].map(id => ({id, text: `Вымышленный хук ${id}`})), endings: []};
  const body = hash(['shared-review-v1', 'bridge-test', 2, 'body', review.bodyText]);
  const queue = {ok: true, items: review.hooks.map(h => {
    const i = {topic_id: 'bridge-test', hook_id: h.id, version_id: `R-bridge-test-h${h.id}`, script_revision: 2, hook_text: h.text,
      script_text: `${h.text}\n\n${review.bodyText}`, status: 'approved', approved_by: 'approver@example.test', approved_at: '2026-10-13T11:59:00Z',
      shared_review: {topicId: 'bridge-test', revision: 2, packetHash: hash(review), componentHashes: {
        topic: hash(['shared-review-v1', 'bridge-test', 2, 'topic', review.topicText]), body,
        hook: hash(['shared-review-v1', 'bridge-test', 2, 'hook', h.id, h.text, body])}}};
    i.script_hash = scriptHash(i); return i;
  })};
  return {review, queue};
}
const authenticated = queue => readApprovedQueue({url: 'https://script.google.com/macros/s/test/exec', token: 'test-token', now,
  fetchImpl: async () => Response.json(queue)});
const EMPTY_MAILBOX = Buffer.from(JSON.stringify(emptyDelivery())), EMPTY_ACK = Buffer.from(JSON.stringify(emptyAck()));

async function setup(t, {versions = [1, 2, 3]} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'rr-bridge-'));
  const s = {root, db: path.join(root, 'production.sqlite'), outbox: path.join(root, 'delivery-outbox'), downloads: path.join(root, 'downloads'), ...fixture()};
  const q = new ProductionQueue(s.db);
  try {
    if (versions.length) {
      const ticket = q.createTicket(s.queue, versions.map(v => `R-bridge-test-h${v}`), operator, {now});
      q.startTicket(ticket.ticket_id, 'callback-1', operator, s.queue, {provider: 'windows_browser', now});
    }
  } finally { q.close(); }
  t.after(() => rm(root, {recursive: true, force: true}));
  s.run = async (extra = {}) => prepareQueueDelivery({queueDbPath: s.db, review: s.review, downloadsDir: s.downloads,
    readQueue: () => authenticated(extra.liveQueue ?? s.queue), mailboxBytes: EMPTY_MAILBOX, ackBytes: EMPTY_ACK, outbox: s.outbox, now, ...extra});
  s.jobRows = () => { const q2 = new ProductionQueue(s.db); try { return q2.listPanelJobs({limit: 20}); } finally { q2.close(); } };
  return s;
}

test('three waiting queue jobs + fresh matching approvals -> one staging-only envelope; queue unchanged', async t => {
  const s = await setup(t);
  const before = JSON.stringify(s.jobRows());
  const r = await s.run();
  assert.equal(r.status, 'prepared');
  assert.deepEqual([r.generationAllowed, r.uploadStarted, r.renderAllowed, r.currentApprovalRecheckRequired], [false, false, false, true]);
  const bytes = await readFile(path.join(s.outbox, r.file));
  const data = parseDelivery(bytes, {now});
  assert.equal(data.deliveryId, r.deliveryId);
  validateDeliveryPlan(data.payload);
  assert.deepEqual(data.payload.jobs.map(j => j.localPath), Object.values(expectedBindings(s.downloads, 'bridge-test', 2)).map(b => b.localPath));
  assert.ok(data.payload.packet.items.every(i => i.status === 'pending_approval' && !('approved_by' in i)));
  assert.equal(JSON.stringify(s.jobRows()), before); // jobs stay waiting; bridge never writes the bot database
  assert.ok(s.jobRows().every(j => j.state === 'waiting_for_windows_worker'));
});

test('repeat while envelope is live: reused, no duplicate file', async t => {
  const s = await setup(t);
  const first = await s.run();
  const second = await s.run({now: now + 1000});
  assert.deepEqual([second.status, second.deliveryId, second.file], ['already_prepared', first.deliveryId, first.file]);
  assert.equal((await readdir(s.outbox)).length, 1);
});

test('a valid different envelope under the expected filename is rejected without creating a duplicate', async t => {
  const s = await setup(t);
  const first = await s.run();
  const saved = parseDelivery(await readFile(path.join(s.outbox, first.file)), {now});
  saved.payload.jobs[0].localPath += '.different.mp4';
  const changed = buildDelivery(saved.payload, {now});
  await writeFile(path.join(s.outbox, first.file), changed);
  await assert.rejects(s.run({now: now + 1000}), /differs from current plan/);
  assert.equal((await readdir(s.outbox)).length, 1);
  assert.deepEqual(await readFile(path.join(s.outbox, first.file)), changed);
});

test('incomplete queue or revoked/changed approval never produces an envelope', async t => {
  const partial = await setup(t, {versions: [1, 2]});
  assert.deepEqual([(await partial.run()).status, (await partial.run()).waitingJobs], ['awaiting_queue_jobs', 2]);
  const revoked = await setup(t);
  const live = structuredClone(revoked.queue); live.items.splice(0, 1); // the live queue lists approved variants only
  assert.equal((await revoked.run({liveQueue: live})).status, 'approval_changed_or_revoked');
  const edited = await setup(t);
  const changed = structuredClone(edited.queue); changed.items[1].hook_text += '!'; changed.items[1].script_text = `${changed.items[1].hook_text}\n\n${edited.review.bodyText}`;
  changed.items[1].script_hash = scriptHash(changed.items[1]);
  assert.equal((await edited.run({liveQueue: changed})).status, 'approval_changed_or_revoked');
  for (const s of [partial, revoked, edited]) await assert.rejects(readdir(s.outbox));
});

test('review packet that does not match the approvals fails closed', async t => {
  const s = await setup(t);
  const review = structuredClone(s.review); review.bodyText += ' ';
  await assert.rejects(prepareQueueDelivery({queueDbPath: s.db, review, downloadsDir: s.downloads, readQueue: () => authenticated(s.queue),
    mailboxBytes: EMPTY_MAILBOX, ackBytes: EMPTY_ACK, outbox: s.outbox, now}));
  await assert.rejects(readdir(s.outbox));
});

test('different unacknowledged delivery in the mailbox blocks the next one; same plan renewal allowed', async t => {
  const s = await setup(t);
  const first = await s.run();
  const current = await readFile(path.join(s.outbox, first.file));
  const other = await setup(t); // same approvals, different download bindings -> a different plan
  const blocked = await prepareQueueDelivery({queueDbPath: other.db, review: other.review, downloadsDir: path.join(other.root, 'elsewhere'),
    readQueue: () => authenticated(other.queue), mailboxBytes: current, ackBytes: EMPTY_ACK, outbox: other.outbox, now});
  assert.deepEqual([blocked.status, blocked.reason], ['blocked', 'previous_not_acknowledged']);
  await assert.rejects(readdir(other.outbox));
  const renewal = await prepareQueueDelivery({queueDbPath: s.db, review: s.review, downloadsDir: s.downloads, readQueue: () => authenticated(s.queue),
    mailboxBytes: current, ackBytes: EMPTY_ACK, outbox: path.join(s.root, 'outbox-2'), now: now + 2000});
  assert.deepEqual([renewal.status, renewal.gate], ['prepared', 'same_plan_renewal']);
});

test('read-only queue access and Windows download paths', async t => {
  const s = await setup(t);
  assert.equal(waitingJobsFor(s.db, 'bridge-test', 2).length, 3);
  assert.equal(waitingJobsFor(s.db, 'bridge-test', 3).length, 0);
  assert.equal(expectedBindings('C:\\RomanReels\\downloads', 'bridge-test', 2)['hook-1'].localPath, 'C:\\RomanReels\\downloads\\bridge-test\\v2\\hook-1.mp4');
  assert.throws(() => expectedBindings('relative/dir', 'bridge-test', 2));
});
