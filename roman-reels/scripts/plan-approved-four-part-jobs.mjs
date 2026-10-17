#!/usr/bin/env node
// Private offline files + fresh protected queue; planning only, never execute jobs.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {readApprovedQueue, planApprovedUploads} from './approved-four-part-jobs.mjs';

async function readBounded(file) {
  const data = await readFile(file);
  if (data.length > 65536) throw new Error('Planner input exceeds byte cap');
  return JSON.parse(data.toString('utf8'));
}
async function main() {
  const args = process.argv.slice(2);
  const url = process.env.ROMAN_REELS_WEBHOOK_URL, token = process.env.ROMAN_REELS_WEBHOOK_TOKEN;
  if (args.length === 1 && args[0] === '--check-access') {
    const queue = await readApprovedQueue({url, token});
    console.log(JSON.stringify({authenticatedRead: true, approvedItems: queue.items.length,
      generationAllowed: false, renderAllowed: false, googleWrites: false}));
    return;
  }
  if (args.length !== 3) throw new Error('Usage: plan-approved-four-part-jobs.mjs <shared-review.json> <role-bindings.json> <NEW-private-directory>');
  const [review, bindings] = await Promise.all([readBounded(args[0]), readBounded(args[1])]);
  const queue = await readApprovedQueue({url, token});
  const plan = planApprovedUploads(review, bindings, queue);
  const out = path.resolve(args[2]);
  await mkdir(out, {recursive: false, mode: 0o700});
  const write = (name, data) => writeFile(path.join(out, name), JSON.stringify(data, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  await write('plan.json', plan);
  if (plan.status === 'planned') {
    await write('packet.json', plan.packet);
    await mkdir(path.join(out, 'jobs'), {mode: 0o700});
    for (const job of plan.jobs) await write(`jobs/${job.role}.json`, job);
  }
  console.log(JSON.stringify({status: plan.status, jobs: plan.jobs.length, generationAllowed: false,
    renderAllowed: false, currentApprovalRecheckRequired: true}));
}
main().catch(() => {console.error('Approved source plan not created; inspect configuration/input privately. No jobs executed.'); process.exitCode = 1;});
