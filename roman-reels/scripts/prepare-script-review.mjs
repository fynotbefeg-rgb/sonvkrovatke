#!/usr/bin/env node
// Offline review packet. Does not grant approvals or contact external services.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {scriptHash, validateManifest} from './approval-manifest.mjs';

function literal(text) {
  // Keep arbitrary draft text out of Markdown links, headings and HTML.
  const longest = Math.max(0, ...Array.from(text.matchAll(/`+/g), m => m[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

export function prepareReview(manifest) {
  const items = validateManifest(manifest);
  if (!items.length || items.length > 90) throw Error('Review requires 1–90 scripts');
  if (items.some(item => item.status !== 'pending_approval')) throw Error('Only pending drafts can enter review');
  const snapshot = {schema_version: 1, approval_granted: false, items: items.map(item => ({
    topic_id: item.topic_id, hook_id: item.hook_id, version_id: item.version_id,
    script_revision: item.script_revision, hook_text: item.hook_text,
    script_text: item.script_text, status: 'pending_approval', script_hash: scriptHash(item),
  }))};
  const parts = ['# Сценарии для проверки Романом',
    'Статус: черновики. Этот документ не утверждает сценарии и не запускает производство.',
    'В блоке «Полный текст речи» записан весь текст для озвучки. Если хук уже входит в него, второй раз добавлять хук не нужно.',
    'После любой правки нужно подготовить новую ревизию и снова показать полный текст. SHA-256 связывает версию с текстом; он не подтверждает личность утверждающего.'];
  for (const item of snapshot.items) {
    parts.push(`## ${item.version_id} — ревизия ${item.script_revision}`,
      'Хук:', literal(item.hook_text), 'Полный текст речи:', literal(item.script_text),
      `SHA-256: \`${item.script_hash}\``,
      'Решение Романа: ожидается.');
  }
  return {snapshot, markdown: parts.join('\n\n') + '\n'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, outputDir] = process.argv.slice(2);
  if (!input || !outputDir) throw Error('Usage: prepare-script-review.mjs drafts.json NEW-output-directory');
  const result = prepareReview(JSON.parse(readFileSync(input, 'utf8')));
  // Refuse reuse of a review directory instead of replacing an earlier snapshot.
  mkdirSync(outputDir, {recursive: false});
  writeFileSync(join(outputDir, 'snapshot.json'), JSON.stringify(result.snapshot, null, 2) + '\n', {flag: 'wx'});
  writeFileSync(join(outputDir, 'REVIEW.md'), result.markdown, {flag: 'wx'});
  console.log(`Prepared ${result.snapshot.items.length} pending scripts. No approvals or production jobs created.`);
}
