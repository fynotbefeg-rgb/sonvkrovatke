// Offline tests for the bounded Gemini client. Fake fetch only: no API requests, no key, no cost.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createGeminiClient, ledgerSummary} from './gemini-bounded-client.mjs';

const KEY = 'fake-key-never-real-0123456789';
const ok = (text = '{"ok":true}', finishReason = 'STOP') => new Response(JSON.stringify({candidates: [{finishReason, content: {parts: [{text}]}}], usageMetadata: {totalTokenCount: 10}}));
async function setup(t, {responses = [ok()], limits = {}, allowGenerate = true, apiKey = KEY} = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'rr-gemini-')); t.after(() => rm(dir, {recursive: true, force: true}));
  const s = {dir, ledgerFile: path.join(dir, 'gemini-ledger.json'), calls: [], clock: Date.parse('2026-10-13T12:00:00Z'), waits: []};
  s.fetchImpl = async (url, init) => { s.calls.push({url, init}); const r = responses.shift(); if (r instanceof Error) throw r; return r; };
  s.client = (extra = {}) => createGeminiClient({apiKey, ledgerFile: s.ledgerFile, allowGenerate, limits, fetchImpl: s.fetchImpl,
    now: () => s.clock, wait: async ms => { s.waits.push(ms); }, ...extra});
  return s;
}
const ask = (c, extra = {}) => c.generate({task: 'draft_suggestion', prompt: 'Вымышленный тестовый запрос', ...extra});

test('one bounded request: header key, token cap in body, no-authority result flags', async t => {
  const s = await setup(t);
  const r = await ask(s.client());
  assert.equal(r.text, '{"ok":true}');
  assert.deepEqual([r.approvalAuthority, r.topicRegistration, r.productionAllowed, r.editorialReviewRequired], [false, false, false, true]);
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].init.headers['x-goog-api-key'], KEY);
  assert.ok(!s.calls[0].url.includes(KEY));
  assert.equal(JSON.parse(s.calls[0].init.body).generationConfig.maxOutputTokens, 4096);
  assert.ok(!(await readFile(s.ledgerFile, 'utf8')).includes(KEY));
});

test('no authorization, no key, forbidden task, foreign model or oversized prompt: nothing is sent', async t => {
  const s = await setup(t);
  await assert.rejects(ask(s.client({allowGenerate: false})), {code: 'generation_not_authorized'});
  await assert.rejects(ask(s.client({apiKey: ''})), {code: 'missing_key'});
  for (const task of ['approve_topic', 'start_production', 'утвердить']) await assert.rejects(ask(s.client(), {task}), {code: 'task_not_allowed'});
  await assert.rejects(ask(s.client(), {model: 'gemini-pro-expensive'}), {code: 'model_not_allowed'});
  await assert.rejects(ask(s.client(), {prompt: 'x'.repeat(16001)}), {code: 'prompt_invalid'});
  assert.equal(s.calls.length, 0);
  assert.deepEqual(await ledgerSummary(s.ledgerFile, s.clock), {lastDay: 0, lastWeek: 0});
});

test('per-run, daily and weekly caps persist across new client instances (restarts)', async t => {
  const s = await setup(t, {responses: Array.from({length: 10}, () => ok()), limits: {maxRequestsPerDay: 2, maxRequestsPerWeek: 3}});
  const c = s.client();
  await ask(c);
  await assert.rejects(ask(c), {code: 'run_budget_exhausted'});
  await ask(s.client());
  await assert.rejects(ask(s.client()), {code: 'day_budget_exhausted'});
  s.clock += 86400001;
  await ask(s.client());
  await assert.rejects(ask(s.client()), {code: 'week_budget_exhausted'});
  assert.equal(s.calls.length, 3);
  s.clock += 7 * 86400000;
  assert.deepEqual(await ledgerSummary(s.ledgerFile, s.clock), {lastDay: 0, lastWeek: 0});
});

test('retries: none by default; with maxRetries=1 only for 429/503, each retry consumes budget', async t => {
  const none = await setup(t, {responses: [new Response('{}', {status: 429})]});
  await assert.rejects(ask(none.client()), {code: 'http_429'});
  assert.equal(none.calls.length, 1);
  const one = await setup(t, {responses: [new Response('{}', {status: 503, headers: {'retry-after': '2'}}), ok()], limits: {maxRetries: 1, maxRequestsPerRun: 2}});
  const r = await ask(one.client());
  assert.deepEqual([r.requestsUsed, one.waits[0], one.calls.length], [2, 2000, 2]);
  assert.equal((await ledgerSummary(one.ledgerFile, one.clock)).lastDay, 2);
  const capped = await setup(t, {responses: [new Response('{}', {status: 429}), ok()], limits: {maxRetries: 1, maxRequestsPerRun: 1}});
  await assert.rejects(ask(capped.client()), {code: 'run_budget_exhausted'});
  assert.equal(capped.calls.length, 1);
  const longWait = await setup(t, {responses: [new Response('{}', {status: 429, headers: {'retry-after': '3600'}})], limits: {maxRetries: 1, maxRequestsPerRun: 2}});
  await assert.rejects(ask(longWait.client()), {code: 'http_429'});
  const bad = await setup(t, {responses: [new Response('{}', {status: 400})], limits: {maxRetries: 1, maxRequestsPerRun: 2}});
  await assert.rejects(ask(bad.client()), {code: 'http_400'});
  assert.equal(bad.calls.length, 1);
  assert.throws(() => createGeminiClient({apiKey: KEY, ledgerFile: one.ledgerFile, limits: {maxRetries: 3}}), {code: 'invalid_limits'});
});

test('truncated, blocked, oversized or lost responses fail closed without retry; key redacted from errors', async t => {
  for (const [response, code] of [[ok('{"a":', 'MAX_TOKENS'), 'truncated'], [ok('', 'SAFETY'), 'incomplete'],
    [new Response('x'.repeat(300000)), 'response_too_large'], [new TypeError('socket reset'), 'network_ambiguous']]) {
    const s = await setup(t, {responses: [response, ok()], limits: {maxRetries: 1, maxRequestsPerRun: 2}});
    await assert.rejects(ask(s.client()), {code});
    assert.equal(s.calls.length, 1, code);
  }
  const leak = await setup(t, {responses: [new Response(`{"error":"bad key ${KEY}"}`, {status: 403})]});
  const error = await ask(leak.client()).catch(e => e);
  assert.equal(error.code, 'http_403');
  assert.ok(!error.message.includes(KEY));
});
