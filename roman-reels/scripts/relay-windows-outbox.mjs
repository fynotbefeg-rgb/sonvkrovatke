#!/usr/bin/env node
// Cloud relay decision. Input on stdin: {"outbox","mailbox","ack"} as base64 bytes of the pinned Drive slots
// (read by the Python Drive client). Approval authority is ONLY a fresh readApprovedQueue call made here, in this
// process; saved or forwarded queue JSON is never accepted. Output: one JSON line, no texts, IDs or secrets.
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readApprovedQueue} from './approved-four-part-jobs.mjs';
import {relayDecision} from './windows-outbox-channel.mjs';
import {MAX_DELIVERY_BYTES} from './windows-plan-delivery.mjs';
import {MAX_ACK_BYTES} from './windows-plan-ack.mjs';

const decode = (value, max) => {
  if (typeof value !== 'string') throw Error('type');
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > max || bytes.toString('base64') !== value) throw Error('encoding');
  return bytes;
};

export async function relayFromInput({input, url, token, fetchImpl = fetch, now = Date.now}) {
  const clock = typeof now === 'function' ? now : () => now;
  const request = JSON.parse(Buffer.from(input).toString('utf8'));
  if (!request || typeof request !== 'object' || Object.keys(request).sort().join(',') !== 'ack,mailbox,outbox') throw Error('fields');
  const outboxBytes = decode(request.outbox, MAX_DELIVERY_BYTES), mailboxBytes = decode(request.mailbox, MAX_DELIVERY_BYTES);
  const ackBytes = decode(request.ack, MAX_ACK_BYTES);
  const approvedQueue = await readApprovedQueue({url, token, fetchImpl, now: clock()});
  const decision = relayDecision({outboxBytes, approvedQueue, mailboxBytes, ackBytes, now: clock()});
  return {...decision, outboxSha256: createHash('sha256').update(outboxBytes).digest('hex')};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw Error('args');
    let input = Buffer.alloc(0);
    for await (const chunk of process.stdin) { input = Buffer.concat([input, chunk]); if (input.length > 200000) throw Error('size'); }
    console.log(JSON.stringify(await relayFromInput({input, url: process.env.ROMAN_REELS_WEBHOOK_URL, token: process.env.ROMAN_REELS_WEBHOOK_TOKEN})));
  } catch {
    console.error('Relay decision not confirmed; no data published.');
    process.exitCode = 1;
  }
}
