// Offline tests for the cloud relay decision: real readApprovedQueue with a fake transport; no Google, Drive or secrets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildDelivery, emptyDelivery} from './windows-plan-delivery.mjs';
import {emptyAck} from './windows-plan-ack.mjs';
import {scriptHash} from './approval-manifest.mjs';
import {deliveryPlan} from './testing/delivery-fixture.mjs';
import {relayFromInput} from './relay-windows-outbox.mjs';

const url = 'https://script.google.com/macros/s/test/exec', token = 'test-token-not-real';
const b64 = b => Buffer.from(b).toString('base64');
const EMPTY_BOX = Buffer.from(JSON.stringify(emptyDelivery())), EMPTY_ACK = Buffer.from(JSON.stringify(emptyAck()));
const otherPlan = () => { const p = deliveryPlan(); p.planKey = 'b'.repeat(64); for (const j of p.jobs) j.jobId = `rr-${p.planKey.slice(0, 40)}-${j.role}`; return p; };
const approvedFor = env => ({ok: true, items: JSON.parse(env).payload.packet.items.map(i => ({...i, status: 'approved',
  approved_by: 'approver@example.test', approved_at: new Date(Date.now() - 60000).toISOString()}))});
const input = (outbox, mailbox = EMPTY_BOX, ack = EMPTY_ACK) => Buffer.from(JSON.stringify({outbox: b64(outbox), mailbox: b64(mailbox), ack: b64(ack)}));
const run = (env, queue, extra = {}) => relayFromInput({input: input(env, extra.mailbox, extra.ack), url, token,
  fetchImpl: async () => Response.json(queue)});

test('fresh authenticated approvals matching the packet -> publish, bound to the exact outbox bytes', async () => {
  const env = buildDelivery(deliveryPlan(), {ttlMs: 900000});
  const r = await run(env, approvedFor(env));
  assert.deepEqual([r.status, r.reason, r.generationAllowed, r.renderAllowed], ['publish', 'mailbox_empty', false, false]);
  assert.match(r.outboxSha256, /^[a-f0-9]{64}$/);
  const again = await run(env, approvedFor(env), {mailbox: env});
  assert.equal(again.status, 'already_published');
});

test('revoked approval or changed text never publishes', async () => {
  const env = buildDelivery(deliveryPlan(), {ttlMs: 900000});
  const revoked = approvedFor(env); revoked.items.pop();
  assert.equal((await run(env, revoked)).status, 'approval_changed_or_revoked');
  const changed = approvedFor(env); changed.items[0].script_text += ' (изменено)'; changed.items[0].script_hash = scriptHash(changed.items[0]);
  assert.equal((await run(env, changed)).status, 'approval_changed_or_revoked');
});

test('forged or invalid queue responses are refused before any decision', async () => {
  const env = buildDelivery(deliveryPlan(), {ttlMs: 900000});
  const forged = approvedFor(env); delete forged.items[0].approved_by;
  await assert.rejects(run(env, forged));
  const future = approvedFor(env); future.items[0].approved_at = new Date(Date.now() + 3600000).toISOString();
  await assert.rejects(run(env, future));
  await assert.rejects(run(env, {ok: false, error: 'Unauthorized'}));
});

test('a different unacknowledged delivery in the mailbox blocks publication', async () => {
  const current = buildDelivery(deliveryPlan(), {ttlMs: 900000}), next = buildDelivery(otherPlan(), {ttlMs: 900000});
  const r = await run(next, approvedFor(next), {mailbox: current});
  assert.deepEqual([r.status, r.reason], ['blocked', 'previous_not_acknowledged']);
});

test('malformed input is refused; the CLI exits non-zero without echoing data', () => {
  const cli = fileURLToPath(new URL('./relay-windows-outbox.mjs', import.meta.url));
  for (const stdin of ['{}', '{"outbox":"!!","mailbox":"","ack":""}', 'not json']) {
    const r = spawnSync(process.execPath, [cli], {input: stdin, encoding: 'utf8', env: {PATH: process.env.PATH}});
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /not confirmed/);
  }
});

test('Windows push CLI without private config stops with a generic message and no Drive access', async () => {
  const {mkdtempSync, rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const pathMod = await import('node:path');
  const home = mkdtempSync(pathMod.join(tmpdir(), 'rr-push-cli-'));
  try {
    const cli = fileURLToPath(new URL('./push-windows-outbox.mjs', import.meta.url));
    const r = spawnSync(process.execPath, [cli], {encoding: 'utf8', env: {PATH: process.env.PATH, ROMAN_UPLOADER_HOME: home}});
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /Outbox not pushed/);
    assert.equal(spawnSync(process.execPath, [cli, '--extra'], {encoding: 'utf8', env: {PATH: process.env.PATH, ROMAN_UPLOADER_HOME: home}}).status, 1);
  } finally { rmSync(home, {recursive: true, force: true}); }
});
