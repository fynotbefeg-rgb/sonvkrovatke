#!/usr/bin/env node
// Windows: push the newest prepared bridge envelope into the pinned Drive outbox slot (one bounded pass).
// Uses the uploader's existing DPAPI OAuth. Writes only the separate outbox slot; never the mailbox, never creates files.
// Private config outside Git: %LOCALAPPDATA%\RomanReels\source-uploader\delivery-outbox-config.json = {"fileId":"…"}.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {tokenProvider} from './source-uploader-auth.mjs';
import {driveClient} from './source-uploader.mjs';
import {pushOutbox} from './windows-outbox-channel.mjs';

async function readConfig(file) {
  const raw = await readFile(file);
  if (raw.length > 4096) throw Error('Config too large');
  return JSON.parse(raw.toString('utf8'));
}

async function main() {
  if (process.argv.length !== 2) throw Error('This command takes no arguments');
  if (!process.env.LOCALAPPDATA && !process.env.ROMAN_UPLOADER_HOME) throw Error('Windows runtime home required');
  const local = process.env.LOCALAPPDATA || path.dirname(path.dirname(process.env.ROMAN_UPLOADER_HOME));
  const home = process.env.ROMAN_UPLOADER_HOME || path.join(local, 'RomanReels', 'source-uploader');
  const mailboxConfig = await readConfig(path.join(home, 'delivery-config.json'));
  const outboxConfig = await readConfig(path.join(home, 'delivery-outbox-config.json'));
  const outboxDir = process.env.ROMAN_DELIVERY_OUTBOX_DIR || path.join(local, 'RomanReels', 'delivery-outbox');
  const drive = driveClient({getToken: tokenProvider({tokenFile: path.join(home, 'oauth-token.dpapi')})});
  console.log(JSON.stringify(await pushOutbox({drive, outboxConfig, mailboxConfig, outboxDir})));
}
main().catch(() => { console.error('Outbox not pushed; check local outbox/mailbox configuration, auth and slot state. No jobs executed.'); process.exitCode = 1; });
