// Offline tests for the Windows runtime supervisor. Fake process lists and spawns; no bot, Telegram or Google.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile, appendFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {MAX_RESTARTS_PER_HOUR, ensureBot, inspectBot, otherSupervisors, runReceiverOnce} from './windows-runtime-supervisor.mjs';

const panel = pid => ({pid, commandLine: `"C:\\nodejs\\node.exe" scripts/run-telegram-panel.mjs --windows-serve`});
const other = pid => ({pid, commandLine: 'C:\\Windows\\explorer.exe'});
async function setup(t) {
  const stateDir = await mkdtemp(path.join(tmpdir(), 'rr-supervisor-'));
  t.after(() => rm(stateDir, {recursive: true, force: true}));
  await writeFile(path.join(stateDir, 'production.sqlite'), 'db-bytes'); await writeFile(path.join(stateDir, 'config.dpapi'), 'cfg');
  const s = {stateDir, processes: [other(4)], spawned: [], clock: 1_800_000_000_000};
  s.lock = pid => writeFile(path.join(stateDir, 'production.sqlite.lock'), JSON.stringify({pid, startedAt: '2026-10-13T00:00:00.000Z'}));
  s.spawnBot = async ({stdout}) => {
    const pid = 9000 + s.spawned.length; s.spawned.push(pid); s.processes.push(panel(pid)); await s.lock(pid);
    if (s.events !== null) await appendFile(stdout, (s.events ?? ['{"event":"telegram_identity_verified"}', '{"event":"telegram_poll_completed","processed":0}']).join('\n') + '\n');
    return pid;
  };
  s.ensure = (extra = {}) => ensureBot({stateDir, approved: true, listProcesses: async () => structuredClone(s.processes), spawnBot: s.spawnBot,
    now: () => s.clock, wait: async () => { s.clock += 1000; }, confirmTimeoutMs: 5000, ...extra});
  return s;
}
const lockExists = async s => (await readdir(s.stateDir)).includes('production.sqlite.lock');

test('running poller with matching lock: nothing started or removed', async t => {
  const s = await setup(t);
  s.processes.push(panel(500)); await s.lock(500);
  assert.equal((await inspectBot({stateDir: s.stateDir, processes: s.processes})).state, 'running');
  const r = await s.ensure();
  assert.deepEqual([r.action, r.state, s.spawned.length], ['none', 'running', 0]);
  assert.ok(await lockExists(s));
});

test('stopped bot: started once with confirmation events, state and pid recorded, DB/config untouched', async t => {
  const s = await setup(t);
  const r = await s.ensure();
  assert.deepEqual([r.action, r.confirmation, s.spawned.length, r.clearedStaleLock], ['started', 'confirmed', 1, false]);
  assert.equal(await readFile(path.join(s.stateDir, 'serve.pid'), 'utf8'), String(r.pid));
  const state = JSON.parse(await readFile(path.join(s.stateDir, 'supervisor-state.json'), 'utf8'));
  assert.equal(state.pid, r.pid); assert.equal(state.restarts.length, 1);
  assert.deepEqual([await readFile(path.join(s.stateDir, 'production.sqlite'), 'utf8'), await readFile(path.join(s.stateDir, 'config.dpapi'), 'utf8')], ['db-bytes', 'cfg']);
  // Next pass sees it running: no second poller.
  assert.equal((await s.ensure()).action, 'none');
  assert.equal(s.spawned.length, 1);
});

test('stale lock after crash or reboot: removed only when its PID is gone and no poller exists', async t => {
  const s = await setup(t);
  await s.lock(777);
  assert.equal((await inspectBot({stateDir: s.stateDir, processes: s.processes})).state, 'stale_lock');
  const r = await s.ensure();
  assert.deepEqual([r.action, r.clearedStaleLock, s.spawned.length], ['started', true, 1]);
  const lock = JSON.parse(await readFile(path.join(s.stateDir, 'production.sqlite.lock'), 'utf8'));
  assert.equal(lock.pid, r.pid);
});

test('ambiguous states are never "fixed": reused PID, two pollers, poller without lock, unreadable lock', async t => {
  const cases = [
    async s => { await s.lock(4); },                                          // lock PID alive but not a poller (PID reuse)
    async s => { s.processes.push(panel(10), panel(11)); await s.lock(10); }, // two pollers
    async s => { s.processes.push(panel(12)); },                               // poller without lock
    async s => { s.processes.push(panel(13)); await s.lock(14); },             // lock owned by another PID
    async s => { await writeFile(path.join(s.stateDir, 'production.sqlite.lock'), 'garbage'); },
  ];
  for (const arrange of cases) {
    const s = await setup(t);
    await arrange(s);
    const before = await readFile(path.join(s.stateDir, 'production.sqlite.lock'), 'utf8').catch(() => null);
    const r = await s.ensure();
    assert.deepEqual([r.action, r.state, s.spawned.length], ['none', 'conflict', 0], r.reason);
    assert.equal(await readFile(path.join(s.stateDir, 'production.sqlite.lock'), 'utf8').catch(() => null), before);
  }
});

test('lock changing between check and removal is left alone', async t => {
  const s = await setup(t);
  await s.lock(777);
  let calls = 0;
  const r = await s.ensure({listProcesses: async () => (++calls === 1 ? [other(4)] : [other(4), panel(778)])});
  assert.deepEqual([r.action, r.reason, s.spawned.length], ['none', 'lock_changed_during_check', 0]);
  assert.ok(await lockExists(s));
});

test('without explicit deployment approval the supervisor only reports', async t => {
  const s = await setup(t);
  const r = await s.ensure({approved: false});
  assert.deepEqual([r.action, r.reason, s.spawned.length], ['not_started', 'deployment_not_approved', 0]);
});

test('crash loop: after the hourly limit no further restarts; resumes after the window', async t => {
  const s = await setup(t);
  s.events = ['{"event":"telegram_identity_verified"}', '{"event":"telegram_stopped","kind":"invalid_token"}'];
  for (let i = 0; i < MAX_RESTARTS_PER_HOUR; i++) {
    const r = await s.ensure();
    assert.deepEqual([r.action, r.confirmation], ['started', 'stopped_after_start']);
    s.processes = s.processes.filter(p => !/run-telegram-panel/.test(p.commandLine));  // the poller exits again
    await rm(path.join(s.stateDir, 'production.sqlite.lock'));                       // clean exit removes its lock
  }
  const blocked = await s.ensure();
  assert.deepEqual([blocked.action, blocked.reason, s.spawned.length], ['not_started', 'crash_loop', MAX_RESTARTS_PER_HOUR]);
  s.clock += 3600001;
  s.events = undefined;
  assert.equal((await s.ensure()).action, 'started');
});

test('unconfirmed start is reported, not hidden', async t => {
  const s = await setup(t);
  s.events = null;
  const r = await s.ensure();
  assert.deepEqual([r.action, r.confirmation], ['started', 'unconfirmed']);
});

test('receiver pass reports status or failure without affecting the bot; concurrent supervisors detected', async () => {
  assert.deepEqual(await runReceiverOnce({runReceiver: async () => ({code: 0, stdout: '{"status":"waiting","generationAllowed":false}\n'})}),
    {receiver: 'ok', status: 'waiting'});
  assert.deepEqual(await runReceiverOnce({runReceiver: async () => ({code: 1, stdout: ''})}), {receiver: 'failed', exitCode: 1});
  assert.deepEqual(await runReceiverOnce({runReceiver: async () => { throw Error('spawn failed'); }}), {receiver: 'failed', exitCode: null});
  const list = [{pid: 1, commandLine: 'node scripts/run-windows-supervisor.mjs --ensure'}, {pid: 2, commandLine: 'node scripts\\run-windows-supervisor.mjs --ensure --receive'}, other(3)];
  assert.equal(otherSupervisors(list, 1).length, 1);
});
