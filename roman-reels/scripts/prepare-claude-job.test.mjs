import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareClaudeJob} from './prepare-claude-job.mjs';
test('packet binds exact task and preserves proposal-only restrictions', () => {
  const a = prepareClaudeJob('Создай шаблон 👀');
  assert.ok(a.prompt.endsWith('Создай шаблон 👀'));
  assert.equal(a.metadata.approval_granted, false);
  assert.equal(a.metadata.ai_started, false);
  assert.equal(a.metadata.automatic_push, false);
  assert.equal(a.metadata.branch, 'automation/roman-reels-v1');
  assert.match(a.prompt, /Bash недоступен/);
  assert.notEqual(a.metadata.task_sha256, prepareClaudeJob('Создай другой шаблон').metadata.task_sha256);
});
test('empty and oversized tasks cannot be dispatched', () => {
  for (const value of ['', '  ', null, 'a'.repeat(50001)]) assert.throws(() => prepareClaudeJob(value));
});
