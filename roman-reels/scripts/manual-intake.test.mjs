import test from 'node:test';
import assert from 'node:assert/strict';
import {scriptHash, validateManifest} from './approval-manifest.mjs';
import {intakeName, planIntake} from './plan-manual-intake.mjs';

function fixture() {
  const item = {topic_id: 'test-hooks', hook_id: 1, version_id: 'R-test-hooks-h1', script_revision: 1,
    hook_text: 'Первый шаг', script_text: 'Первый шаг должен быть понятным.', status: 'approved',
    approved_by: 'test-approver', approved_at: '2026-10-09T12:00:00Z'};
  item.script_hash = scriptHash(item);
  return {approvals: {items: [item]}, inventory: {folder_id: 'test-incoming', files: [{
    ID: 'test-file', Name: intakeName(item), MimeType: 'video/mp4', Size: 100,
    Hashes: {md5: 'a'.repeat(32)}, IsDir: false,
  }]}};
}

test('matched approval and MP4 only advance to transcription, never rendering', () => {
  const {approvals, inventory} = fixture();
  const plan = planIntake(approvals, inventory);
  assert.equal(plan.jobs.length, 1);
  assert.equal(plan.jobs[0].stage, 'awaiting_transcription');
  assert.equal(plan.render_allowed, false);
  assert.equal(plan.jobs[0].render_allowed, false);
  assert.ok(plan.jobs[0].blockers.includes('recheck_live_approval'));
});

test('modified approved text, hook, or revision invalidates approval', () => {
  for (const [field, value] of [['script_text', 'Изменённая речь'], ['hook_text', 'Другой хук'], ['script_revision', 2]]) {
    const {approvals, inventory} = fixture();
    approvals.items[0][field] = value;
    assert.throws(() => planIntake(approvals, inventory), /script_hash/);
  }
});

test('pending and rejected scripts cannot enter intake even with a matching name', () => {
  for (const status of ['pending_approval', 'rejected']) {
    const {approvals, inventory} = fixture();
    Object.assign(approvals.items[0], {status, approved_by: null, approved_at: null});
    assert.equal(planIntake(approvals, inventory).jobs.length, 0);
  }
});

test('missing or stale source and duplicate Drive names block intake', () => {
  for (const variant of ['missing', 'stale', 'duplicate']) {
    const {approvals, inventory} = fixture();
    if (variant === 'missing') inventory.files = [];
    if (variant === 'stale') inventory.files[0].Name = inventory.files[0].Name.replace('__r1__', '__r2__');
    if (variant === 'duplicate') inventory.files.push({...inventory.files[0], ID: 'second-file'});
    const plan = planIntake(approvals, inventory);
    assert.equal(plan.jobs.length, 0);
    assert.equal(plan.blocked[0].reason, variant === 'duplicate' ? 'ambiguous_source' : 'missing_source');
  }
});

test('invalid MIME, size, and absent checksum block intake', () => {
  for (const patch of [{MimeType: 'text/plain'}, {Size: 0}, {Size: '100'}, {Hashes: {}}, {Hashes: {md5: 'invalid'}}]) {
    const {approvals, inventory} = fixture();
    Object.assign(inventory.files[0], patch);
    assert.equal(planIntake(approvals, inventory).jobs.length, 0);
  }
});

test('completed jobs are skipped; replaced bytes get a new job identity', () => {
  const {approvals, inventory} = fixture();
  const first = planIntake(approvals, inventory);
  const ledger = {items: [{job_key: first.jobs[0].job_key, status: 'completed', output_file_id: 'final-mp4'}]};
  const repeat = planIntake(approvals, inventory, ledger);
  assert.equal(repeat.jobs.length, 0);
  assert.equal(repeat.skipped.length, 1);
  inventory.files[0].Hashes.md5 = 'b'.repeat(32);
  const replaced = planIntake(approvals, inventory, ledger);
  assert.equal(replaced.jobs.length, 1);
  assert.notEqual(replaced.jobs[0].job_key, first.jobs[0].job_key);
});

test('malformed approvals, inventories and ledgers fail closed', () => {
  const {approvals, inventory} = fixture();
  assert.throws(() => validateManifest({items: [null]}));
  assert.throws(() => validateManifest({items: [...approvals.items, ...approvals.items]}), /duplicate/);
  assert.throws(() => planIntake(approvals, {...inventory, files: [...inventory.files, ...inventory.files]}), /Duplicate/);
  assert.throws(() => planIntake(approvals, inventory, {items: [{}]}), /ledger/);
  delete approvals.items[0].approved_by;
  assert.throws(() => planIntake(approvals, inventory), /approved_by/);
});

test('empty queue produces no work', () => {
  assert.deepEqual(planIntake({items: []}, {folder_id: 'incoming', files: []}).jobs, []);
});
