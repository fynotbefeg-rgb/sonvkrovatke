// Bridge: waiting Telegram queue jobs of one topic revision -> one staging-only delivery envelope for the laptop.
// Read-only on the bot's SQLite queue (jobs stay waiting), fresh authenticated approvals are re-read and must still
// match the queued production keys, and the existing planner/envelope contracts are reused unchanged.
// It prepares data only: no Drive publication, no upload, avatar generation, montage or render.
import {DatabaseSync} from 'node:sqlite';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {planApprovedUploads} from './approved-four-part-jobs.mjs';
import {productionKey} from './production-queue.mjs';
import {buildDelivery, parseDelivery} from './windows-plan-delivery.mjs';
import {mayReplaceDelivery} from './windows-plan-ack.mjs';

const WAITING = ['waiting_for_manual_upload', 'waiting_for_windows_worker'];
const ROLES = ['body', 'hook-1', 'hook-2', 'hook-3'];
const flags = {generationAllowed: false, uploadStarted: false, renderAllowed: false, currentApprovalRecheckRequired: true};

// Snapshot of waiting jobs for one topic/revision, opened read-only so the live bot's database is never modified.
export function waitingJobsFor(queueDbPath, topicId, revision) {
  const db = new DatabaseSync(queueDbPath, {readOnly: true});
  try {
    const marks = WAITING.map(() => '?').join(',');
    return db.prepare(`SELECT production_key, state, snapshot FROM jobs WHERE state IN (${marks}) ORDER BY rowid`).all(...WAITING)
      .map(row => ({productionKey: row.production_key, state: row.state, item: JSON.parse(row.snapshot)}))
      .filter(job => job.item.topic_id === topicId && job.item.script_revision === revision);
  } finally { db.close(); }
}

// Expected finished-download locations; the uploader itself waits until each file is complete and stable.
export function expectedBindings(downloadsDir, topicId, revision) {
  if (typeof downloadsDir !== 'string' || !(path.isAbsolute(downloadsDir) || /^[A-Za-z]:[\\/]/.test(downloadsDir)))
    throw Error('Absolute downloads directory required');
  const join = /^[A-Za-z]:[\\/]/.test(downloadsDir) ? path.win32.join : path.join;
  return Object.fromEntries(ROLES.map(role => [role, {localPath: join(downloadsDir, topicId, `v${revision}`, `${role}.mp4`), heygenTitle: null}]));
}

export async function prepareQueueDelivery({queueDbPath, review, downloadsDir, readQueue, mailboxBytes, ackBytes, outbox, now = Date.now}) {
  const clock = typeof now === 'function' ? now : () => now;
  const base = {topicId: review?.topicId ?? null, revision: review?.revision ?? null, ...flags};
  const jobs = waitingJobsFor(queueDbPath, review.topicId, review.revision);
  if (jobs.length !== 3 || new Set(jobs.map(j => j.item.hook_id)).size !== 3) return {...base, status: 'awaiting_queue_jobs', waitingJobs: jobs.length};
  // Queue rows are not authority: the live approvals must still contain exactly the queued versions.
  const queue = await readQueue();
  for (const job of jobs) {
    const current = queue.items.find(i => i.version_id === job.item.version_id && i.status === 'approved');
    if (!current || productionKey(current) !== job.productionKey) return {...base, status: 'approval_changed_or_revoked'};
  }
  const plan = planApprovedUploads(review, expectedBindings(downloadsDir, review.topicId, review.revision), queue, {now: clock()});
  if (plan.status !== 'planned') return {...base, status: plan.status};
  const bytes = buildDelivery(plan, {now: clock()});
  const {deliveryId, expiresAt} = parseDelivery(bytes, {now: clock()});
  const gate = mayReplaceDelivery({currentBytes: mailboxBytes, ackBytes, nextBytes: bytes});
  if (!gate.allowed) return {...base, status: 'blocked', reason: gate.reason, deliveryId};
  await fs.mkdir(outbox, {recursive: true, mode: 0o700});
  // One live envelope per plan: an unexpired prepared envelope for the same deliveryId is reused, never duplicated.
  for (const name of (await fs.readdir(outbox)).filter(n => n.startsWith(`${deliveryId}.`) && n.endsWith('.json'))) {
    const existing = await fs.readFile(path.join(outbox, name));
    try { parseDelivery(existing, {now: clock()}); return {...base, status: 'already_prepared', deliveryId, file: name, gate: gate.reason}; } catch {}
  }
  const name = `${deliveryId}.${JSON.parse(bytes).issuedAt}.json`;
  await fs.writeFile(path.join(outbox, name), bytes, {flag: 'wx', mode: 0o600});
  return {...base, status: 'prepared', deliveryId, expiresAt, file: name, gate: gate.reason};
}
