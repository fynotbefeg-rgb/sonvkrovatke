// Bounded Gemini client shared by future editorial helpers. Text assistance only:
// results never carry approval authority, never register topics and never start production.
// Every request (including a retry) is reserved in a durable local ledger BEFORE the network call, so
// per-run / per-day / per-week caps hold across restarts. No model fallback, no hidden retries.
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

async function loadLedger(file) {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (data.ledgerVersion !== '1.0.0' || !Array.isArray(data.requests)) fail('ledger_invalid', 'Gemini ledger invalid; inspect manually');
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return {ledgerVersion: '1.0.0', requests: []};
    if (error instanceof SyntaxError) fail('ledger_invalid', 'Gemini ledger is not JSON');
    throw error;
  }
}
async function saveLedger(file, data) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2));
  await fs.rename(temp, file);
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
  if (!(cap.maxRetries >= 0 && cap.maxRetries <= 1)) fail('invalid_limits', 'At most one retry is allowed');
  if (!ledgerFile || !path.isAbsolute(ledgerFile)) fail('invalid_ledger', 'Absolute ledger path required');
  let runRequests = 0;
  const redact = text => (apiKey ? String(text).split(apiKey).join('[REDACTED]') : String(text)).slice(0, 500);

  async function reserve(task, model) {
    const ledger = await loadLedger(ledgerFile);
    const t = now();
    const day = ledger.requests.filter(r => t - r.at < DAY).length, week = ledger.requests.filter(r => t - r.at < WEEK).length;
    if (runRequests >= cap.maxRequestsPerRun) fail('run_budget_exhausted', 'Per-run Gemini request cap reached');
    if (day >= cap.maxRequestsPerDay) fail('day_budget_exhausted', 'Daily Gemini request cap reached');
    if (week >= cap.maxRequestsPerWeek) fail('week_budget_exhausted', 'Weekly Gemini request cap reached');
    runRequests += 1;
    ledger.requests = ledger.requests.filter(r => t - r.at < WEEK);
    ledger.requests.push({at: t, task, model});
    await saveLedger(ledgerFile, ledger);
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
