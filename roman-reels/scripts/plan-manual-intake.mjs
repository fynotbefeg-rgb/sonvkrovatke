#!/usr/bin/env node
// Metadata-only planner. Never downloads, transcribes, renders, or updates Drive/Sheets.
import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validateManifest} from './approval-manifest.mjs';

export function intakeName(item) {
  return `${item.version_id}__r${item.script_revision}__${item.script_hash}.mp4`;
}

export function planIntake(approvals, inventory, ledger = {items: []}) {
  const items = validateManifest(approvals);
  if (!inventory || typeof inventory.folder_id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(inventory.folder_id) || !Array.isArray(inventory.files)) throw Error('Invalid incoming folder inventory');
  if (!ledger || !Array.isArray(ledger.items)) throw Error('Invalid completed ledger');
  const completed = new Set();
  for (const item of ledger.items) {
    if (!item || !/^[a-f0-9]{64}$/.test(item.job_key ?? '') || item.status !== 'completed' || typeof item.output_file_id !== 'string' || !item.output_file_id.trim()) throw Error('Invalid completed ledger entry');
    if (completed.has(item.job_key)) throw Error('Duplicate completed ledger entry');
    completed.add(item.job_key);
  }
  const ids = new Set();
  const names = new Map();
  for (const file of inventory.files) {
    if (!file || typeof file.ID !== 'string' || !file.ID.trim() || typeof file.Name !== 'string' || !file.Name || file.IsDir === true) throw Error('Invalid source metadata');
    if (ids.has(file.ID)) throw Error('Duplicate source file ID');
    ids.add(file.ID);
    const bucket = names.get(file.Name) ?? [];
    bucket.push(file);
    names.set(file.Name, bucket);
  }
  const jobs = [], blocked = [], skipped = [];
  for (const item of items.filter(x => x.status === 'approved')) {
    const name = intakeName(item);
    const candidates = names.get(name) ?? [];
    const block = reason => blocked.push({version_id: item.version_id, script_revision: item.script_revision, expected_name: name, reason});
    if (candidates.length === 0) { block('missing_source'); continue; }
    if (candidates.length !== 1) { block('ambiguous_source'); continue; }
    const file = candidates[0];
    if (file.MimeType !== 'video/mp4' || !Number.isSafeInteger(file.Size) || file.Size <= 0) { block('invalid_mp4_metadata'); continue; }
    const md5 = file.Hashes?.md5;
    if (typeof md5 !== 'string' || !/^[a-f0-9]{32}$/.test(md5)) { block('missing_source_checksum'); continue; }
    const job_key = createHash('sha256').update(JSON.stringify([item.version_id, item.script_revision, item.script_hash, file.ID, md5])).digest('hex');
    if (completed.has(job_key)) { skipped.push({version_id: item.version_id, job_key, reason: 'already_completed'}); continue; }
    jobs.push({
      version_id: item.version_id, script_revision: item.script_revision,
      script_hash: item.script_hash, job_key,
      source: {folder_id: inventory.folder_id, file_id: file.ID, name, md5, size: file.Size},
      stage: 'awaiting_transcription', render_allowed: false,
      blockers: ['verify_download_checksum', 'verify_speech_against_approved_script', 'fresh_word_timestamps', 'compatible_template', 'recheck_live_approval'],
    });
  }
  const approvedNames = new Set(items.filter(x => x.status === 'approved').map(intakeName));
  return {
    mode: 'dry_run', render_allowed: false, jobs, blocked, skipped,
    ignored_file_count: inventory.files.filter(x => !approvedNames.has(x.Name)).length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [approvalsFile, inventoryFile, outputFile, ledgerFile, ...extra] = process.argv.slice(2);
    if (!approvalsFile || !inventoryFile || !outputFile || extra.length) throw Error('Usage: node plan-manual-intake.mjs approvals.json inventory.json plan.json [completed.json]');
    const read = p => JSON.parse(readFileSync(p, 'utf8'));
    const plan = planIntake(read(approvalsFile), read(inventoryFile), ledgerFile ? read(ledgerFile) : undefined);
    writeFileSync(outputFile, JSON.stringify(plan, null, 2) + '\n');
    console.log(`Dry run: ${plan.jobs.length} awaiting transcription, ${plan.blocked.length} blocked, ${plan.skipped.length} completed. No videos started.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
