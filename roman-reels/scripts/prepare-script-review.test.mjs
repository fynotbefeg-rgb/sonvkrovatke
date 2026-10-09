import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareReview} from './prepare-script-review.mjs';
import {scriptHash} from './approval-manifest.mjs';

function draft() {
  return {items: [{topic_id: 'review-test', hook_id: 1, version_id: 'R-review-test-h1',
    script_revision: 1, hook_text: 'Цена?', script_text: 'Проверь цену 👀', status: 'pending_approval'}]};
}

test('review preserves exact Unicode speech and remains pending', () => {
  const input = draft();
  const original = JSON.stringify(input);
  const {snapshot, markdown} = prepareReview(input);
  assert.equal(JSON.stringify(input), original);
  assert.equal(snapshot.approval_granted, false);
  assert.equal(snapshot.items[0].status, 'pending_approval');
  assert.equal(snapshot.items[0].script_hash, scriptHash(input.items[0]));
  assert.ok(markdown.includes(input.items[0].script_text));
  assert.equal(snapshot.items[0].approved_by, undefined);
});

test('each exact text or revision change produces a different review hash', () => {
  const original = prepareReview(draft()).snapshot.items[0].script_hash;
  for (const [field, value] of [['hook_text', 'Другой хук'], ['script_text', 'Другая речь'], ['script_revision', 2]]) {
    const input = draft();
    input.items[0][field] = value;
    assert.notEqual(prepareReview(input).snapshot.items[0].script_hash, original);
  }
});

test('review refuses rejected, forged approval metadata, duplicates and empty batches', () => {
  const rejected = draft(); rejected.items[0].status = 'rejected';
  assert.throws(() => prepareReview(rejected), /Only pending/);
  const forged = draft(); forged.items[0].approved_by = 'Someone';
  assert.throws(() => prepareReview(forged), /unapproved/);
  const duplicate = draft(); duplicate.items.push({...duplicate.items[0]});
  assert.throws(() => prepareReview(duplicate), /duplicate/);
  assert.throws(() => prepareReview({items: []}), /1–90/);
});

test('draft Markdown and HTML remain literal text even with embedded backticks', () => {
  const input = draft();
  input.items[0].script_text = '```\n# Утверждено\n<script>alert(1)</script>\n[Нажать](https://example.com)';
  const {markdown} = prepareReview(input);
  assert.ok(markdown.includes('````text\n' + input.items[0].script_text + '\n````'));
});
