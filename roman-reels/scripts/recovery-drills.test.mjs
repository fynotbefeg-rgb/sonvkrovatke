// Multi-step recovery drills on fictional data. Combine the real supervisor, receiver/acknowledger and journals
// with fake process lists and a fake Drive. No live bot, Telegram, Google, Drive or HeyGen is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readdir, readFile, rm, writeFile, appendFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {ensureBot, inspectBot, runReceiverOnce} from './windows-runtime-supervisor.mjs';
import {buildDelivery, parseDelivery, MAILBOX_NAME, MAILBOX_FOLDER} from './windows-plan-delivery.mjs';
import {ACK_NAME, acknowledgeDelivery, emptyAck, parseAckSlot} from './windows-plan-ack.mjs';
import {AmbiguousNetworkError, Journal} from './source-uploader.mjs';
import {deliveryPlan} from './testing/delivery-fixture.mjs';

const hash = (b, t = 'sha256') => createHash(t).update(b).digest('hex');
const panel = pid => ({pid, commandLine: `"C:\\nodejs\\node.exe" scripts/run-telegram-panel.mjs --windows-serve`});
const config = {fileId: 'mailbox-file-0001', folderId: 'mailbox-folder-0001'}, ackConfig = {fileId: 'ack-slot-file-0001'};

class FakeDrive {
  constructor(mailbox) {
    this.files = new Map([[config.folderId, {id: config.folderId, name: MAILBOX_FOLDER, mimeType: 'application/vnd.google-apps.folder', trashed: false}]]);
    this.put(config.fileId, MAILBOX_NAME, mailbox); this.put(ackConfig.fileId, ACK_NAME, Buffer.from(JSON.stringify(emptyAck())));
    this.faults = []; this.updates = 0; this.offline = false;
  }
  put(id, name, bytes) { this.files.set(id, {id, name, mimeType: 'application/json', parents: [config.folderId], trashed: false,
    size: String(bytes.length), md5Checksum: hash(bytes, 'md5'), sha256Checksum: hash(bytes), bytes: Buffer.from(bytes)}); }
  check() { if (this.offline) throw new AmbiguousNetworkError('get'); }
  async get(id) { this.check(); const f = this.files.get(id); if (!f) return null; const {bytes, ...m} = f; return structuredClone(m); }
  async readJsonBytes(id) { this.check(); return Buffer.from(this.files.get(id).bytes); }
  async updateJsonBytes(id, bytes) {
    this.updates++;
    const fault = this.faults.shift();
    if (fault === 'before') throw new AmbiguousNetworkError('updateJsonBytes');
    this.put(id, this.files.get(id).name, bytes);
    if (fault === 'after') throw new AmbiguousNetworkError('updateJsonBytes');
  }
}

async function laptop(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'rr-drill-')); t.after(() => rm(root, {recursive: true, force: true}));
  const s = {root, stateDir: path.join(root, 'telegram-panel'), inbox: path.join(root, 'received-plans'), ackStore: path.join(root, 'delivery-acks'),
    processes: [{pid: 4, commandLine: 'explorer.exe'}], spawned: [], clock: Date.now()};
  await mkdir(s.stateDir);
  s.lock = pid => writeFile(path.join(s.stateDir, 'production.sqlite.lock'), JSON.stringify({pid, startedAt: 'x'}));
  s.supervise = () => ensureBot({stateDir: s.stateDir, approved: true, listProcesses: async () => structuredClone(s.processes),
    spawnBot: async ({stdout}) => { const pid = 7000 + s.spawned.length; s.spawned.push(pid); s.processes.push(panel(pid)); await s.lock(pid);
      await appendFile(stdout, '{"event":"telegram_identity_verified"}\n{"event":"telegram_poll_completed","processed":0}\n'); return pid; },
    now: () => s.clock, wait: async () => { s.clock += 1000; }, confirmTimeoutMs: 3000});
  return s;
}
const ack = (s, drive, now = Date.now()) => acknowledgeDelivery({drive, config, ackConfig, inbox: s.inbox, ackStore: s.ackStore, now});

test('drill: power loss during delivery staging — bot recovers, partial package blocks until owner inspects it', async t => {
  const s = await laptop(t);
  const bytes = buildDelivery(deliveryPlan());
  const id = parseDelivery(bytes).deliveryId;
  // State left by the power loss: stale bot lock of a dead PID and a half-written staged package.
  await s.lock(4321);
  await mkdir(path.join(s.inbox, `${id}.partial`, 'jobs'), {recursive: true});
  // 1. Supervisor pass after login: exactly one new poller, stale lock replaced.
  const bot = await s.supervise();
  assert.deepEqual([bot.action, bot.clearedStaleLock, bot.confirmation], ['started', true, 'confirmed']);
  // 2. Receiver pass refuses the partial package and writes no acknowledgement; the bot is unaffected.
  const drive = new FakeDrive(bytes);
  const receiver = await runReceiverOnce({runReceiver: async () => { try { await ack(s, drive); return {code: 0, stdout: '{}'}; } catch { return {code: 1, stdout: ''}; } }});
  assert.deepEqual(receiver, {receiver: 'failed', exitCode: 1});
  assert.equal(drive.updates, 0);
  assert.equal((await inspectBot({stateDir: s.stateDir, processes: s.processes})).state, 'running');
  // 3. Owner inspects and moves the partial package aside (never deleted automatically); next pass acknowledges once.
  await rm(path.join(s.inbox, `${id}.partial`), {recursive: true});
  const r = await ack(s, drive);
  assert.deepEqual([r.status, r.acknowledgement], ['received', 'acknowledged']);
  assert.equal((await s.supervise()).action, 'none'); // still exactly one poller
  assert.equal(s.spawned.length, 1);
});

test('drill: network flapping during acknowledgement — one record, identical bytes, no duplicate staging', async t => {
  const s = await laptop(t);
  const bytes = buildDelivery(deliveryPlan());
  const drive = new FakeDrive(bytes);
  drive.offline = true;
  await assert.rejects(ack(s, drive));                       // offline before reading the mailbox: nothing staged
  await assert.rejects(readdir(s.inbox));
  drive.offline = false; drive.faults = ['before'];
  await assert.rejects(ack(s, drive), AmbiguousNetworkError); // lost before the slot write
  drive.faults = ['after'];
  await assert.rejects(ack(s, drive), AmbiguousNetworkError); // written, response lost
  const final = await ack(s, drive);
  assert.deepEqual([final.status, final.acknowledgement], ['already_received', 'already_acknowledged']);
  assert.equal(drive.updates, 2);
  const slot = parseAckSlot(drive.files.get(ackConfig.fileId).bytes);
  assert.equal(slot.contentSha256, hash(bytes));
  assert.equal((await readdir(s.ackStore)).filter(n => n.endsWith('.json')).length, 1);
  assert.equal((await readdir(s.inbox)).filter(n => !n.endsWith('.lock')).length, 1);
});

test('drill: poller killed repeatedly (revoked token) — three restarts, then crash_loop until the owner fixes config', async t => {
  const s = await laptop(t);
  for (let i = 0; i < 3; i++) {
    assert.equal((await s.supervise()).action, 'started');
    s.processes = s.processes.filter(p => !/run-telegram-panel/.test(p.commandLine)); // killed: lock stays behind
  }
  const stopped = await s.supervise();
  assert.deepEqual([stopped.action, stopped.reason], ['not_started', 'crash_loop']);
  assert.ok((await readdir(s.stateDir)).includes('production.sqlite.lock')); // evidence kept for inspection
});

test('drill: corrupted local journals are reported, never silently reset', async t => {
  const s = await laptop(t);
  const journalFile = path.join(s.root, 'journal-v1.json');
  await writeFile(journalFile, '{"journalVersion":"1.0.0","jobs":');
  await assert.rejects(new Journal(journalFile).load(), {code: 'journal_invalid'});
  assert.equal(await readFile(journalFile, 'utf8'), '{"journalVersion":"1.0.0","jobs":');
  // A tampered stored acknowledgement blocks instead of being regenerated.
  const bytes = buildDelivery(deliveryPlan());
  const drive = new FakeDrive(bytes);
  await ack(s, drive);
  const [name] = (await readdir(s.ackStore)).filter(n => n.endsWith('.json'));
  await writeFile(path.join(s.ackStore, name), '{"ackVersion":"1.0.0","status":"received"}');
  await assert.rejects(ack(s, new FakeDrive(bytes)));
});
