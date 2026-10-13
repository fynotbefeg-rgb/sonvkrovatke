#!/usr/bin/env node
// One supervisor pass on Windows. Modes:
//   --status                                   classify bot state only (no changes)
//   --ensure [--bot-deployment-approved] [--receive]
//       start the poller only if it is stopped (or its lock is provably stale); with --receive also run one
//       ack-windows-plan.mjs pass. ROMAN_TELEGRAM_DEPLOYMENT_APPROVED is given to the bot child process only.
// Output: one JSON line of states/counts; no tokens, URLs or private texts.
import {spawn} from 'node:child_process';
import {openSync, closeSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureBot, inspectBot, otherSupervisors, runReceiverOnce} from './windows-runtime-supervisor.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), cwd = path.resolve(here, '..');
const args = process.argv.slice(2);
const known = new Set(['--status', '--ensure', '--bot-deployment-approved', '--receive']);
const local = process.env.LOCALAPPDATA;
const stateDir = local && path.join(local, 'RomanReels', 'telegram-panel');

function run(command, argv, {timeoutMs = 120000, env = process.env, maxBytes = 65536} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, {cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', d => { if (stdout.length < maxBytes) stdout += d; });
    child.stderr.resume();
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve({code, stdout}); });
  });
}

async function listProcesses() {
  const {code, stdout} = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'], {timeoutMs: 60000, maxBytes: 8 * 1024 ** 2});
  if (code !== 0) throw Error('Process list unavailable');
  const rows = JSON.parse(stdout || '[]');
  return (Array.isArray(rows) ? rows : [rows]).map(r => ({pid: r.ProcessId, commandLine: r.CommandLine || ''}));
}

function spawnBot({stdout, stderr}) {
  const out = openSync(stdout, 'a'), err = openSync(stderr, 'a');
  try {
    const child = spawn(process.execPath, ['scripts/run-telegram-panel.mjs', '--windows-serve'], {cwd, detached: true, windowsHide: true,
      stdio: ['ignore', out, err], env: {...process.env, ROMAN_TELEGRAM_DEPLOYMENT_APPROVED: 'true'}});
    child.unref();
    return child.pid;
  } finally { closeSync(out); closeSync(err); }
}

async function main() {
  if (!args.length || args.some(a => !known.has(a)) || (args.includes('--status') && args.length !== 1) ||
      (!args.includes('--status') && !args.includes('--ensure'))) throw Error('Usage');
  if (!stateDir) throw Error('Windows profile required');
  const processes = await listProcesses();
  if (args.includes('--status')) return inspectBot({stateDir, processes});
  if (otherSupervisors(processes, process.pid).length) return {action: 'none', reason: 'supervisor_busy'};
  const bot = await ensureBot({stateDir, approved: args.includes('--bot-deployment-approved'), listProcesses, spawnBot});
  if (!args.includes('--receive')) return {bot};
  const receiver = await runReceiverOnce({runReceiver: () => run(process.execPath, ['scripts/ack-windows-plan.mjs'], {timeoutMs: 300000})});
  return {bot, ...receiver, generationAllowed: false, renderAllowed: false};
}

main().then(result => console.log(JSON.stringify(result)), () => {
  console.error(JSON.stringify({event: 'supervisor_failed', generationAllowed: false, renderAllowed: false}));
  process.exitCode = 1;
});
