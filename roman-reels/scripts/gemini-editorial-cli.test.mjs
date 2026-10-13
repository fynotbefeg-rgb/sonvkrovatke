// Fake-fetch tests for the editorial Gemini CLI on the bounded client. No real Gemini requests, keys or costs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {LEDGER_STORE_MARKER, assertDurableLedger, runResearched} from './run-researched-gemini.mjs';

const KEY = 'fake-key-never-real-0123456789';
const briefPath = fileURLToPath(new URL('../research/gemini-revision-seo/brief-v2.json', import.meta.url));
const answer = JSON.stringify({body_text: 'Учебный пример ' + Array.from({length: 100}, (_, i) => `Слово${i}`).join(' '),
  hooks: [1, 2, 3].map(hook_id => ({hook_id, hook_text: `Хук ${hook_id}`})), evidence_ids: ['google-seo'], limitations: ['Нет измеренного роста.']});
const models = {models: [{name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent']}]};

function store(t, {marker = true} = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'rr-gemini-store-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  if (marker) writeFileSync(path.join(dir, LEDGER_STORE_MARKER), JSON.stringify({storeVersion: '1.0.0', purpose: 'roman-gemini-weekly-budget', allowTemporaryLocation: true}));
  return {dir, ledger: path.join(dir, 'gemini-ledger.json'), out: name => path.join(dir, name)};
}
function stubFetch(t, {fail = null} = {}) {
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({url: String(url), method: init.method || 'GET'});
    if (String(url).includes('/models?')) return Response.json(models);
    if (fail) return new Response(JSON.stringify({error: {status: 'UNAVAILABLE', message: `echo ${KEY}`}}), {status: fail});
    return Response.json({candidates: [{finishReason: 'STOP', content: {parts: [{text: answer}]}}], usageMetadata: {totalTokenCount: 5}});
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}
const env = (s, extra = {}) => ({GEMINI_API_KEY: KEY, ROMAN_GEMINI_ALLOW_GENERATE: 'true', ROMAN_GEMINI_LEDGER: s.ledger, ...extra});
const posts = calls => calls.filter(c => c.method === 'POST').length;

test('generation needs explicit permission, a durable ledger store and never runs on Actions without one', async t => {
  const s = store(t), calls = stubFetch(t);
  await assert.rejects(runResearched({mode: 'generate', input: briefPath, output: s.out('a.json'), env: env(s, {ROMAN_GEMINI_ALLOW_GENERATE: 'false'})}), /authorization/);
  await assert.rejects(runResearched({mode: 'generate', input: briefPath, output: s.out('b.json'), env: env(s, {ROMAN_GEMINI_LEDGER: ''})}), /absolute/);
  await assert.rejects(runResearched({mode: 'generate', input: briefPath, output: s.out('c.json'), env: env(s, {ROMAN_GEMINI_LEDGER: 'ledger.json'})}), /absolute/);
  await assert.rejects(runResearched({mode: 'generate', input: briefPath, output: s.out('d.json'), env: env(s, {GITHUB_ACTIONS: 'true'})}), /Actions/);
  const bare = store(t, {marker: false});
  await assert.rejects(runResearched({mode: 'generate', input: briefPath, output: bare.out('e.json'), env: env(bare)}), /not initialised/);
  const strict = store(t, {marker: false});
  writeFileSync(path.join(strict.dir, LEDGER_STORE_MARKER), JSON.stringify({storeVersion: '1.0.0', purpose: 'roman-gemini-weekly-budget'}));
  await assert.rejects(runResearched({mode: 'generate', input: briefPath, output: strict.out('f.json'), env: env(strict)}), /temporary/);
  const repoLedger = fileURLToPath(new URL('../research/gemini-ledger.json', import.meta.url));
  assert.throws(() => assertDurableLedger(repoLedger, {}), /Git work tree|not initialised/);
  assert.equal(calls.length, 0);
});

test('one bounded generation: single POST, pending-only drafts, ledger records one request; prepare stays offline', async t => {
  const s = store(t), calls = stubFetch(t);
  await runResearched({mode: 'prepare', input: briefPath, output: s.out('preview.json'), env: {}});
  assert.equal(calls.length, 0);
  await runResearched({mode: 'generate', input: briefPath, output: s.out('drafts.json'), env: env(s)});
  assert.equal(posts(calls), 1);
  const drafts = JSON.parse(readFileSync(s.out('drafts.json'), 'utf8'));
  assert.equal(drafts.productionReady, false);
  assert.equal(drafts.editorialReviewRequired, true);
  assert.ok(drafts.items.every(i => i.status === 'pending_approval' && !('approved_by' in i)));
  assert.equal(JSON.parse(readFileSync(s.ledger, 'utf8')).requests.length, 1);
});

test('budget is shared by separate processes through the same ledger', async t => {
  const s = store(t);
  const day = Date.now();
  writeFileSync(s.ledger, JSON.stringify({ledgerVersion: '1.0.0', requests: Array.from({length: 10}, (_, i) => ({at: day - 1000 - i, task: 'draft_suggestion', model: 'gemini-3-flash-preview'}))}));
  const stubFile = path.join(s.dir, 'stub.mjs'), trace = path.join(s.dir, 'trace.log');
  writeFileSync(stubFile, `import {appendFileSync} from 'node:fs';globalThis.fetch=async(url,init={})=>{appendFileSync(${JSON.stringify(trace)},(init.method||'GET')+'\\n');
    if(String(url).includes('/models?'))return Response.json(${JSON.stringify(models)});
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:${JSON.stringify(answer)}}]}}]});};`);
  const runner = fileURLToPath(new URL('./run-researched-gemini.mjs', import.meta.url));
  const child = name => new Promise(resolve => {
    const p = spawn(process.execPath, ['--import', pathToFileURL(stubFile).href, runner, 'generate', briefPath, s.out(name)],
      {env: {PATH: process.env.PATH, ...env(s)}, stdio: ['ignore', 'ignore', 'pipe']});
    let err = ''; p.stderr.on('data', d => { err += d; }); p.on('close', code => resolve({code, err}));
  });
  const results = await Promise.all([child('p1.json'), child('p2.json')]);
  assert.ok(results.every(r => r.code === 1 && /day_budget_exhausted/.test(r.err)), JSON.stringify(results));
  const methods = existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n') : [];
  assert.equal(methods.filter(m => m === 'POST').length, 0);
  assert.equal(JSON.parse(readFileSync(s.ledger, 'utf8')).requests.length, 10);
});

test('corrupted ledger is refused untouched; provider errors keep the key out of output and report', async t => {
  const s = store(t), calls = stubFetch(t);
  writeFileSync(s.ledger, '{"ledgerVersion":"1.0.0","requests":[{"at":"bad"}]}');
  await assert.rejects(runResearched({mode: 'generate', input: briefPath, output: s.out('x.json'), env: env(s)}), /ledger_invalid/);
  assert.equal(readFileSync(s.ledger, 'utf8'), '{"ledgerVersion":"1.0.0","requests":[{"at":"bad"}]}');
  assert.equal(posts(calls), 0);
  const report = JSON.parse(readFileSync(s.out('gemini-generation-report.json'), 'utf8'));
  assert.deepEqual([report.generationCalls, report.errorCode], [0, 'ledger_invalid']);

  const e = store(t); const failing = stubFetch(t, {fail: 503});
  const error = await runResearched({mode: 'generate', input: briefPath, output: e.out('y.json'), env: env(e)}).catch(x => x);
  assert.match(error.message, /http_503/);
  assert.ok(!error.message.includes(KEY));
  const diag = readFileSync(e.out('gemini-generation-report.json'), 'utf8');
  assert.ok(!diag.includes(KEY));
  assert.deepEqual([JSON.parse(diag).generationCalls, JSON.parse(diag).retryAttempted], [1, false]);
  assert.equal(posts(failing), 1);
  assert.equal(existsSync(e.out('y.json')), false);
});
