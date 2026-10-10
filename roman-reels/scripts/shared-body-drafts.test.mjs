import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedBodyDrafts} from './shared-body-drafts.mjs';
import {scriptHash, validateManifest} from './approval-manifest.mjs';
const sample = () => ({body_text: Array.from({length: 100}, (_, i) => `Слово${i}`).join(' '),
  hooks: [3, 1, 2].map(hook_id => ({hook_id, hook_text: `Хук ${hook_id}`}))});
test('all full scripts contain exactly the same body and remain pending in the legacy format', () => {
  const input = sample();
  const result = sharedBodyDrafts('topic', input);
  assert.deepEqual(result.items.map(x => x.hook_id), [1, 2, 3]);
  for (const item of validateManifest({items: result.items})) {
    assert.equal(item.script_text, item.hook_text + '\n\n' + input.body_text);
    assert.equal(item.status, 'pending_approval');
    assert.equal(item.approved_by, undefined);
  }
  assert.equal(result.sourceSet.body_text, input.body_text);
});
test('any common body edit changes every eventual approval hash', () => {
  const a = sample(), b = sample(); b.body_text += ' Изменено';
  const old = sharedBodyDrafts('topic', a), edited = sharedBodyDrafts('topic', b);
  assert.notEqual(old.sourceSet.body_text_hash, edited.sourceSet.body_text_hash);
  old.items.forEach((item, i) => assert.notEqual(scriptHash(item), scriptHash(edited.items[i])));
});
test('missing body, duplicate hooks, wrong count and wrong length cannot produce drafts', () => {
  for (const change of [x => delete x.body_text, x => x.hooks.pop(),
    x => {x.hooks[0].hook_id = 1;}, x => {x.body_text = 'Коротко';},
    x => {x.hooks[2].hook_text = x.hooks[0].hook_text;}]) {
    const bad = sample();change(bad);assert.throws(() => sharedBodyDrafts('topic', bad));
  }
});
