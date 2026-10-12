#!/usr/bin/env node
// Windows source uploader CLI. Commands:
//   auth [--client <client.json|rclone.conf>]  one interactive owner login (Drive scope), token stored with DPAPI
//   check-auth                                 refresh token + verify incoming is writable (prints no secrets)
//   validate <job.json>                        offline job validation
//   run [--jobs <dir>] [--max <n>]             one bounded pass over explicit job files
// Runtime lives outside Git: %LOCALAPPDATA%\RomanReels\source-uploader (override: ROMAN_UPLOADER_HOME).
import {existsSync, promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {INCOMING_ID, driveClient, exitCode, mediaChecker, runJobs, validateJob} from './source-uploader.mjs';
import {loadClient, login, tokenProvider} from './source-uploader-auth.mjs';

const [command, ...rest] = process.argv.slice(2);
const option = (name, fallback) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : fallback; };
const home = process.env.ROMAN_UPLOADER_HOME || path.join(process.env.LOCALAPPDATA || '.', 'RomanReels', 'source-uploader');
const tokenFile = path.join(home, 'oauth-token.dpapi');

function mediaTools() {
  const bundled = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pv/node_modules/@remotion/compositor-win32-x64-msvc');
  const pick = (env, exe) => process.env[env] || (existsSync(path.join(bundled, exe)) ? path.join(bundled, exe) : exe.replace('.exe', ''));
  return {ffprobe: pick('ROMAN_FFPROBE', 'ffprobe.exe'), ffmpeg: pick('ROMAN_FFMPEG', 'ffmpeg.exe')};
}

async function main() {
  if (command === 'validate') {
    const {job} = validateJob(JSON.parse(await fs.readFile(rest[0], 'utf8')));
    console.log(JSON.stringify({ok: true, jobId: job.jobId, slot: `${job.topicId}/v${job.scriptVersion}/${job.role}.mp4`}));
    return 0;
  }
  if (command === 'auth') {
    const client = await loadClient(option('client', path.join(process.env.APPDATA || '.', 'rclone', 'rclone.conf')));
    console.log('Откроется браузер: войдите в аккаунт владельца Drive и разрешите доступ.');
    const {scope} = await login({client, tokenFile});
    console.log(JSON.stringify({ok: true, scopeGranted: scope.split(' ').length}));
    return 0;
  }
  const drive = driveClient({getToken: tokenProvider({tokenFile})});
  if (command === 'check-auth') {
    const folder = await drive.get(INCOMING_ID);
    const writable = folder?.capabilities?.canAddChildren === true;
    console.log(JSON.stringify({ok: writable, incomingVisible: !!folder, incomingWritable: writable}));
    return writable ? 0 : 2;
  }
  if (command === 'run') {
    const jobsDir = option('jobs', path.join(home, 'jobs'));
    await fs.mkdir(jobsDir, {recursive: true});
    const logFile = path.join(home, 'uploader-log.jsonl');
    const lines = [];
    const summary = await runJobs({jobsDir, stateDir: home, drive, checkMedia: mediaChecker(mediaTools()),
      maxJobs: Number(option('max', 20)), log: line => lines.push(JSON.stringify(line))});
    if (lines.length) await fs.appendFile(logFile, lines.join('\n') + '\n');
    console.log(JSON.stringify(summary, null, 2));
    return exitCode(summary);
  }
  console.error('Usage: run-source-uploader.mjs auth|check-auth|validate <job.json>|run [--jobs dir] [--max n]');
  return 64;
}

main().then(code => { process.exitCode = code; }, async error => {
  // Errors carry codes and short messages only; tokens never reach error text.
  const line = {at: new Date().toISOString(), status: 'error', code: error.code || 'unexpected', message: String(error.message).slice(0, 300)};
  try { await fs.mkdir(home, {recursive: true}); await fs.appendFile(path.join(home, 'uploader-log.jsonl'), JSON.stringify(line) + '\n'); } catch {}
  console.error(JSON.stringify(line));
  process.exitCode = error.code === 'auth_failed' ? 2 : 1;
});
