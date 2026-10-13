// Bounded Gemini client shared by future editorial helpers. Text assistance only:
// results never carry approval authority, never register topics and never start production.
// Every request (including a retry) is reserved in a durable local ledger BEFORE the network call, so
// per-run / per-day / per-week caps hold across restarts. No model fallback, no hidden retries.
import {randomUUID} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';

export const ALLOWED_TASKS = ['draft_suggestion', 'summarize', 'classify', 'extract', 'critique'];
const FORBIDDEN = /approv|утверд|publish|production|render|heygen|register/i;
export const DEFAULT_LIMITS = {maxRequestsPerRun: 1, maxRequestsPerDay: 10, maxRequestsPerWeek: 40, maxPromptChars: 16000,
  maxOutputTokens: 4096, maxResponseBytes: 262144, timeoutMs: 90000, maxRetries: 0, maxRetryAfterMs: 60000};
export const DEFAULT_MODELS = ['gemini-3-flash-preview'];
const DAY = 86400000, WEEK = 7 * DAY;

export class GeminiError extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (code, message) => { throw new GeminiError(code, message); };

// Strict bounds: every limit must be a finite integer inside its range; nothing is silently clamped.
const LIMIT_RANGES = {maxRequestsPerRun: [1, 20], maxRequestsPerDay: [1, 1000], maxRequestsPerWeek: [1, 5000], maxPromptChars: [1, 100000],
  maxOutputTokens: [1, 65536], maxResponseBytes: [1, 10485760], timeoutMs: [1000, 300000], maxRetries: [0, 1], maxRetryAfterMs: [0, 300000]};
function validateLimits(cap) {
  for (const [k, [lo, hi]] of Object.entries(LIMIT_RANGES))
    if (!Number.isSafeInteger(cap[k]) || cap[k] < lo || cap[k] > hi) fail('invalid_limits', `Limit ${k} must be an integer in ${lo}..${hi}`);
  if (Object.keys(cap).some(k => !(k in LIMIT_RANGES))) fail('invalid_limits', 'Unknown limit');
  if (cap.maxRequestsPerDay > cap.maxRequestsPerWeek) fail('invalid_limits', 'Daily cap exceeds weekly cap');
}

async function loadLedger(file) {
  let data;
  try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return {ledgerVersion: '1.0.0', requests: []};
    if (error instanceof SyntaxError) fail('ledger_invalid', 'Gemini ledger is not JSON');
    throw error;
  }
  const valid = data && typeof data === 'object' && Object.keys(data).sort().join(',') === 'ledgerVersion,requests' &&
    data.ledgerVersion === '1.0.0' && Array.isArray(data.requests) && data.requests.length <= 10000 &&
    data.requests.every(r => r && typeof r === 'object' && Object.keys(r).sort().join(',') === 'at,model,task' &&
      Number.isSafeInteger(r.at) && r.at > 0 && ALLOWED_TASKS.includes(r.task) && typeof r.model === 'string' && r.model.length <= 100);
  if (!valid) fail('ledger_invalid', 'Gemini ledger invalid; inspect manually');
  return data;
}
async function saveLedger(file, data) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`; // unique per write, even for clients in one process
  await fs.writeFile(temp, JSON.stringify(data, null, 2), {flag: 'wx'});
  await fs.rename(temp, file);
}

// Exclusive cross-process reservation: load, check and save happen under one lock file. A lock older than
// staleMs is reported, never silently stolen (its owner may still be writing).
async function withLedgerLock(file, fn, {waitMs = 5000, staleMs = 120000} = {}) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  const lock = `${file}.lock`, started = Date.now();
  let handle;
  for (;;) {
    try { handle = await fs.open(lock, 'wx'); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let age = 0;
      try { age = Date.now() - (await fs.stat(lock)).mtimeMs; } catch {}
      if (age > staleMs) fail('ledger_lock_stale', 'Gemini ledger lock is stale; inspect and remove it manually');
      if (Date.now() - started > waitMs) fail('ledger_locked', 'Gemini ledger is locked by another request');
      await new Promise(r => setTimeout(r, 25 + Math.floor(Math.random() * 50)));
    }
  }
  try {
    await handle.writeFile(JSON.stringify({pid: process.pid, at: new Date().toISOString()}));
    await handle.close(); handle = null;
    return await fn();
  } finally {
    if (handle) await handle.close();
    await fs.rm(lock, {force: true});
  }
}

async function boundedText(response, maxBytes) {
  const chunks = []; let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > maxBytes) fail('response_too_large', 'Gemini response exceeds byte cap');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createGeminiClient({apiKey, ledgerFile, allowGenerate = false, models = DEFAULT_MODELS, limits = {}, fetchImpl = fetch,
  now = Date.now, wait = ms => new Promise(r => setTimeout(r, ms))}) {
  const cap = {...DEFAULT_LIMITS, ...limits};
  validateLimits(cap);
  if (!ledgerFile || !path.isAbsolute(ledgerFile)) fail('invalid_ledger', 'Absolute ledger path required');
  let runRequests = 0;
  const redact = text => (apiKey ? String(text).split(apiKey).join('[REDACTED]') : String(text)).slice(0, 500);

  async function reserve(task, model) {
    if (runRequests >= cap.maxRequestsPerRun) fail('run_budget_exhausted', 'Per-run Gemini request cap reached');
    runRequests += 1; // claimed before awaiting, so concurrent generate() calls of one client cannot both pass
    try {
      await withLedgerLock(ledgerFile, async () => {
        const ledger = await loadLedger(ledgerFile);
        const t = now();
        if (!Number.isSafeInteger(t)) fail('invalid_clock', 'Clock must return integer milliseconds');
        const day = ledger.requests.filter(r => t - r.at < DAY).length, week = ledger.requests.filter(r => t - r.at < WEEK).length;
        if (day >= cap.maxRequestsPerDay) fail('day_budget_exhausted', 'Daily Gemini request cap reached');
        if (week >= cap.maxRequestsPerWeek) fail('week_budget_exhausted', 'Weekly Gemini request cap reached');
        ledger.requests = ledger.requests.filter(r => t - r.at < WEEK);
        ledger.requests.push({at: t, task, model});
        await saveLedger(ledgerFile, ledger);
      });
    } catch (error) { runRequests -= 1; throw error; }
  }

  async function generate({task, model = models[0], prompt, responseMimeType = 'application/json', temperature = 0.4}) {
    if (!ALLOWED_TASKS.includes(task) || FORBIDDEN.test(task)) fail('task_not_allowed', 'Task is not an allowed text-assistance task');
    if (allowGenerate !== true) fail('generation_not_authorized', 'Explicit generation authorization required; no request sent');
    if (!apiKey) fail('missing_key', 'GEMINI_API_KEY not configured; no request sent');
    if (!models.includes(model)) fail('model_not_allowed', 'Model is not in the explicit allowlist; no fallback');
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > cap.maxPromptChars) fail('prompt_invalid', 'Prompt empty or over character cap');
    if (!['application/json', 'text/plain'].includes(responseMimeType)) fail('invalid_mime', 'Unsupported response type');
    const body = JSON.stringify({contents: [{parts: [{text: prompt}]}],
      generationConfig: {responseMimeType, temperature, maxOutputTokens: cap.maxOutputTokens}});
    for (let attempt = 0; ; attempt++) {
      await reserve(task, model);
      let response;
      try {
        response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {method: 'POST', redirect: 'error', headers: {'content-type': 'application/json', 'x-goog-api-key': apiKey}, body,
            signal: AbortSignal.timeout(cap.timeoutMs)});
      } catch { fail('network_ambiguous', 'Gemini request outcome unknown; not retried'); }
      if (response.ok) {
        const data = JSON.parse(await boundedText(response, cap.maxResponseBytes));
        const candidate = data.candidates?.[0];
        if (candidate?.finishReason === 'MAX_TOKENS') fail('truncated', 'Gemini output hit the token cap; not retried');
        if (candidate?.finishReason !== 'STOP') fail('incomplete', 'Gemini output blocked or incomplete; not retried');
        const text = (candidate.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
        return {text, model, finishReason: 'STOP', usage: data.usageMetadata ?? null, requestsUsed: attempt + 1,
          approvalAuthority: false, topicRegistration: false, productionAllowed: false, editorialReviewRequired: true};
      }
      const retryable = [429, 503].includes(response.status);
      const after = Number(response.headers?.get?.('retry-after')) * 1000;
      const delay = Number.isFinite(after) && after > 0 ? after : 5000;
      let detail = '';
      try { detail = redact((await boundedText(response, 8192))); } catch {}
      if (!retryable || attempt >= cap.maxRetries || delay > cap.maxRetryAfterMs)
        fail(`http_${response.status}`, `Gemini HTTP ${response.status}; ${retryable ? 'retry budget spent' : 'not retried'}${detail ? ` (${detail.slice(0, 200)})` : ''}`);
      await wait(delay);
    }
  }
  return {generate, limits: cap};
}

export async function ledgerSummary(ledgerFile, now = Date.now()) {
  const ledger = await loadLedger(ledgerFile);
  return {lastDay: ledger.requests.filter(r => now - r.at < DAY).length, lastWeek: ledger.requests.filter(r => now - r.at < WEEK).length};
}
