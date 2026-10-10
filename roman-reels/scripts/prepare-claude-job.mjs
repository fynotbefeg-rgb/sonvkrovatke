#!/usr/bin/env node
// Offline packet. Preparing a packet does not run Claude or grant billing consent.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

export function prepareClaudeJob(task) {
  if (typeof task !== 'string' || !task.trim() || task.length > 50000) throw Error('Invalid task text');
  const hash = createHash('sha256').update(task).digest('hex');
  const constraints = `Режим автоматического локального предложения для Codex.
Выполни задание ниже, но в этом запуске меняй только roman-reels/pv/src/ и roman-reels/docs/.
Не запускай команды, сервисы, subagents, рендеры, git commit/push и не меняй ветку или утверждения.
Существующие файлы не удаляй и не переименовывай. Не редактируй CODEX_HANDOFF.md.
Если нужны проверки командами, опиши их для Codex: в этом запуске Bash недоступен.
Не утверждай, что проверки выполнены, если их не запускал.
При отсутствии утверждения Романа разрабатывай шаблон, не допускай производство.
Это уточнение заменяет указания задания о commit/push и запуске тестов.
После изменений кратко опиши результат и оставшиеся проверки.\n\n`;
  return {prompt: constraints + task, metadata: {
    task_id: 'roman-full-clip-01', task_sha256: hash,
    branch: 'automation/roman-reels-v1', mode: 'proposal_only',
    approval_granted: false, ai_started: false,
    automatic_push: false, max_turns: 20,
  }};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outputDir = process.argv[2];
  if (!outputDir || process.argv.length !== 3) throw Error('Usage: prepare-claude-job.mjs NEW-output-directory');
  const task = readFileSync(new URL('../docs/CLAUDE_CODE_TASK_01.md', import.meta.url), 'utf8');
  const result = prepareClaudeJob(task);
  mkdirSync(outputDir);
  writeFileSync(resolve(outputDir, 'prompt.txt'), result.prompt, {flag: 'wx'});
  writeFileSync(resolve(outputDir, 'job.json'), JSON.stringify(result.metadata, null, 2)+'\n', {flag:'wx'});
  console.log('Task packet prepared offline. Claude not started.');
}
