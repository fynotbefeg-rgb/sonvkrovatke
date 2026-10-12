import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildFourPartReceipt, textHash} from './build-four-part-receipt.mjs';

const childEnv = {...process.env};
delete childEnv.NODE_TEST_CONTEXT;

function fixture() {
  const sourceSet = {topic_id: 'receipt-test', recordingParts: 4, status: 'pending_approval',
    body_text: 'Точная основа\nс пробелами.', body_text_hash: textHash('Точная основа\nс пробелами.'),
    hooks: [1, 2, 3].map(hook_id => ({hook_id, hook_text: `Хук ${hook_id}!`}))};
  const packet = {draftVersion: '3.0.0', mode: 'editorial', productionReady: false, sourceSet,
    items: sourceSet.hooks.map(h => {
      const id = `R-receipt-test-h${h.hook_id}`, script = `${h.hook_text}\n\n${sourceSet.body_text}`;
      return {version_id: id, topic_id: 'receipt-test', hook_id: h.hook_id, script_revision: 2,
        hook_text: h.hook_text, script_text: script, status: 'pending_approval',
        script_hash: textHash(JSON.stringify([id, 2, h.hook_text, script]))};
    })};
  const journal = {journalVersion: '1.0.0', jobs: {}};
  for (const [i, role] of ['body', 'hook-1', 'hook-2', 'hook-3'].entries()) {
    const jobId = `upload-job-${i}`;
    journal.jobs[jobId] = {jobId, topicId: 'receipt-test', scriptVersion: 2, role, status: 'uploaded',
      driveFileId: `drive-${i}`, driveName: `${role}.mp4`, size: 1000, sha256: textHash(`bytes-${i}`),
      textHash: textHash(role === 'body' ? sourceSet.body_text : sourceSet.hooks[i - 1].hook_text)};
  }
  return {packet, journal};
}

test('receipt preserves exact text hashes, four roles, revision and existing schema; no approval fields', () => {
  const {packet, journal} = fixture();
  const receipt = buildFourPartReceipt(packet, journal);
  assert.deepEqual(Object.keys(receipt).sort(), ['files', 'receiptVersion', 'scriptVersion', 'topicId']);
  assert.equal(receipt.files.length, 4);
  assert.equal(receipt.scriptVersion, 2);
  const python = spawnSync('python', ['-c',
    'import json,sys; from drive_intake import incoming; p=json.loads(sys.stdin.readline()); t,v,parts=incoming.expectations(p); print(json.dumps([t,v,{x["fileName"]:x["textHash"] for x in parts}]))'],
    {cwd: path.dirname(fileURLToPath(import.meta.url)), input: JSON.stringify(packet) + '\n', timeout: 20000, env: childEnv, encoding: 'utf8'});
  assert.equal(python.status, 0, python.stderr);
  const [topic, version, hashes] = JSON.parse(python.stdout);
  assert.equal(topic, receipt.topicId); assert.equal(version, receipt.scriptVersion);
  for (const file of receipt.files) assert.equal(file.textHash, hashes[file.fileName]);
});

test('missing textHash is never retroactively assigned to test uploads', () => {
  const {packet, journal} = fixture(); journal.jobs['upload-job-0'].textHash = null;
  assert.throws(() => buildFourPartReceipt(packet, journal), /preassigned textHash/);
});

test('partial, duplicate and cross-version journals cannot declare a complete set', () => {
  for (const mutation of [j => delete j.jobs['upload-job-0'], j => j.jobs['upload-job-0'].status = 'uploading',
    j => j.jobs['upload-job-0'].scriptVersion = 1,
    j => j.jobs.extra = {...j.jobs['upload-job-0'], jobId: 'extra'},
    j => j.jobs['upload-job-0'].driveFileId = j.jobs['upload-job-1'].driveFileId]) {
    const {packet, journal} = fixture(); mutation(journal);
    assert.throws(() => buildFourPartReceipt(packet, journal));
  }
});

test('changed body, full script, or part text fail the exact binding', () => {
  for (const mutation of [p => p.sourceSet.body_text += ' ', p => p.items[0].script_text += ' ',
    p => p.items[0].script_revision = 3, p => p.sourceSet.hooks[0].hook_text += ' ']) {
    const {packet, journal} = fixture(); mutation(packet);
    assert.throws(() => buildFourPartReceipt(packet, journal));
  }
});

test('CLI exclusive write leaves existing receipt and journal unchanged', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'receipt-test-'));
  try {
    const {packet, journal} = fixture();
    const p = path.join(directory, 'packet.json'), j = path.join(directory, 'journal.json'), out = path.join(directory, 'recording-set.json');
    await writeFile(p, JSON.stringify(packet)); await writeFile(j, JSON.stringify(journal));
    const run = () => spawnSync(process.execPath, [fileURLToPath(new URL('./build-four-part-receipt.mjs', import.meta.url)), p, j, out], {encoding: 'utf8', timeout: 20000, env: childEnv});
    assert.equal(run().status, 0);
    const original = await readFile(out, 'utf8');
    assert.equal(run().status, 1);
    assert.equal(await readFile(out, 'utf8'), original);
    assert.equal(await readFile(j, 'utf8'), JSON.stringify(journal));
  } finally {await rm(directory, {recursive: true, force: true});}
});
