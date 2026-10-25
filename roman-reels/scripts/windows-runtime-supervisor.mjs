// Windows runtime supervisor: one bounded pass that keeps exactly one Telegram poller alive and runs the
// delivery receiver/acknowledger once. Intended to be called repeatedly (Task Scheduler at logon + interval),
// but installs nothing itself and changes no system, power, login, Google or Drive settings.
// Never starts a second poller, never clears a lock whose process may still be alive, never resets the DB,
// and stops restarting after repeated crashes so an invalid token or config is reported instead of looping.
import {promises as fs} from 'node:fs';
import path from 'node:path';

export const MAX_RESTARTS_PER_HOUR = 3;
const PANEL = /run-telegram-panel\.mjs["']?\s+--windows-serve(\s|$)/;
const SUPERVISOR = /run-windows-supervisor\.mjs/;

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) return {invalid: true};
    throw error;
  }
}
const panelProcesses = processes => processes.filter(p => PANEL.test(p.commandLine || ''));

// Classifies the bot without changing anything. lockPid must belong to the only poller.
export async function inspectBot({stateDir, processes}) {
  const lockFile = path.join(stateDir, 'production.sqlite.lock');
  const lock = await readJson(lockFile);
  const panels = panelProcesses(processes);
  const alive = pid => processes.some(p => p.pid === pid);
  const base = {panels: panels.length, lockPid: lock?.pid ?? null};
  if (lock?.invalid) return {...base, state: 'conflict', reason: 'lock_unreadable'};
  if (panels.length > 1) return {...base, state: 'conflict', reason: 'multiple_pollers'};
  if (panels.length === 1) {
    if (lock && lock.pid === panels[0].pid) return {...base, state: 'running', pid: panels[0].pid};
    return {...base, state: 'conflict', reason: lock ? 'lock_owned_by_other_pid' : 'poller_without_lock'};
  }
  if (!lock) return {...base, state: 'stopped'};
  if (!Number.isSafeInteger(lock.pid) || lock.pid <= 0) return {...base, state: 'conflict', reason: 'lock_without_pid'};
  // A live process with the recorded PID may be a reused PID or a poller we cannot identify: never clear it.
  if (alive(lock.pid)) return {...base, state: 'conflict', reason: 'lock_pid_alive_not_poller'};
  return {...base, state: 'stale_lock', staleLock: lock};
}

async function removeStaleLock(stateDir, expected, listProcesses) {
  const file = path.join(stateDir, 'production.sqlite.lock');
  const again = await readJson(file);
  const processes = await listProcesses();
  if (!again || again.pid !== expected.pid || again.startedAt !== expected.startedAt ||
      processes.some(p => p.pid === expected.pid) || panelProcesses(processes).length) return false;
  await fs.rm(file);
  return true;
}

async function waitForEvents(file, {timeoutMs, wait, now}) {
  const started = now();
  for (;;) {
    let text = '';
    try { text = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const events = text.split('\n').map(line => { try { return JSON.parse(line).event; } catch { return null; } });
    const identity = events.includes('telegram_identity_verified'), poll = events.includes('telegram_poll_completed');
    if (identity && poll) return 'confirmed';
    if (events.includes('telegram_stopped')) return 'stopped_after_start';
    if (now() - started >= timeoutMs) return identity ? 'identity_only' : 'unconfirmed';
    await wait(1000);
  }
}

// One pass for the bot. `approved` must come from the owner's explicit command-line flag.
export async function ensureBot({stateDir, approved, listProcesses, spawnBot, now = Date.now, wait = ms => new Promise(r => setTimeout(r, ms)),
  confirmTimeoutMs = 60000}) {
  const statusFile = path.join(stateDir, 'supervisor-state.json');
  const saved = (await readJson(statusFile)) || {};
  const restarts = (Array.isArray(saved.restarts) ? saved.restarts : []).filter(t => Number.isSafeInteger(t) && now() - t < 3600000);
  const inspected = await inspectBot({stateDir, processes: await listProcesses()});
  if (inspected.state === 'running' || inspected.state === 'conflict') return {action: 'none', ...inspected};
  if (!approved) return {action: 'not_started', reason: 'deployment_not_approved', ...inspected};
  if (restarts.length >= MAX_RESTARTS_PER_HOUR) return {action: 'not_started', reason: 'crash_loop', restartsLastHour: restarts.length, ...inspected};
  if (inspected.state === 'stale_lock' && !(await removeStaleLock(stateDir, inspected.staleLock, listProcesses)))
    return {action: 'none', state: 'conflict', reason: 'lock_changed_during_check'};
  const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
  const stdout = path.join(stateDir, `serve-stdout-${stamp}.log`), stderr = path.join(stateDir, `serve-stderr-${stamp}.log`);
  const pid = await spawnBot({stdout, stderr});
  restarts.push(now());
  await fs.writeFile(statusFile, JSON.stringify({pid, startedAt: now(), stdout: path.basename(stdout), stderr: path.basename(stderr), restarts}, null, 2));
  await fs.writeFile(path.join(stateDir, 'serve.pid'), String(pid));
  const confirmation = await waitForEvents(stdout, {timeoutMs: confirmTimeoutMs, wait, now});
  return {action: 'started', pid, clearedStaleLock: inspected.state === 'stale_lock', confirmation, restartsLastHour: restarts.length};
}

// Receiver pass: one bounded ack-windows-plan run. Its failures never touch the bot.
export async function runReceiverOnce({runReceiver}) {
  try {
    const {code, stdout} = await runReceiver();
    let status = null;
    try { status = JSON.parse(stdout.trim().split('\n').pop()).status ?? null; } catch {}
    return code === 0 ? {receiver: 'ok', status} : {receiver: 'failed', exitCode: code};
  } catch { return {receiver: 'failed', exitCode: null}; }
}

export const otherSupervisors = (processes, selfPid) => processes.filter(p => p.pid !== selfPid && SUPERVISOR.test(p.commandLine || ''));
