#!/usr/bin/env node
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const ACTOR = 'apify~instagram-reel-scraper';
export function reelPlan(input) {
  let url;
  try { url = new URL(input); } catch { throw Error('Expected one Instagram Reel URL'); }
  const match = url.pathname.match(/^\/reel\/([A-Za-z0-9_-]+)\/?$/);
  if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.port || url.username || url.password || !match) throw Error('Expected one Instagram Reel URL');
  const reel_url = `https://www.instagram.com/reel/${match[1]}/`;
  return {actor: ACTOR, shortcode: match[1], reel_url, max_total_charge_usd: 0.05, timeout_seconds: 120,
    input: {username: [reel_url], resultsLimit: 1, includeSharesCount: false, includeTranscript: false, includeDownloadedVideo: false}};
}

export async function collectOneReel(plan, {token, approved = false, fetchImpl = fetch, saveRun = () => {}, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
  // Recompute the plan rather than trusting caller-controlled Actor/budget/input.
  const safe = reelPlan(plan.reel_url);
  if (!approved) throw Error('Paid Actor run requires explicit approval');
  if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) throw Error('Missing or invalid APIFY_TOKEN');
  const headers = {Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json'};
  async function request(path, options = {}) {
    let response;
    try {
      response = await fetchImpl(`https://api.apify.com/v2/${path}`, {...options, headers, redirect: 'error', signal: AbortSignal.timeout(30000)});
    } catch { throw Error('Apify request failed; do not automatically retry Actor creation'); }
    if (!response.ok) throw Error(`Apify HTTP ${response.status}; do not automatically retry Actor creation`);
    try { return await response.json(); } catch { throw Error('Unexpected Apify JSON response; inspect saved run before retrying'); }
  }
  const data = (await request(`actors/${ACTOR}/runs?maxTotalChargeUsd=0.05&timeout=120&restartOnError=false`, {method: 'POST', body: JSON.stringify(safe.input)})).data;
  if (!data || typeof data.id !== 'string' || !/^[A-Za-z0-9]+$/.test(data.id)) throw Error('Missing Actor run ID; inspect Apify before retrying');
  let run = data;
  // Persist remote identity immediately. Never retry POST after ambiguous failure.
  saveRun({run_id: run.id, reel_url: safe.reel_url, max_total_charge_usd: 0.05, status: run.status});
  for (let attempt = 0; !['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status) && attempt < 36; attempt++) {
    await sleep(5000);
    run = (await request(`actor-runs/${data.id}`, {method: 'GET'})).data;
    if (!run || run.id !== data.id) throw Error('Unexpected Actor run response');
    saveRun({run_id: run.id, reel_url: safe.reel_url, max_total_charge_usd: 0.05, status: run.status});
  }
  if (run.status !== 'SUCCEEDED') throw Error(`Actor did not succeed; inspect saved run before retrying`);
  if (typeof run.defaultDatasetId !== 'string' || !/^[A-Za-z0-9]+$/.test(run.defaultDatasetId)) throw Error('Missing Actor dataset ID');
  const items = await request(`datasets/${run.defaultDatasetId}/items?format=json&clean=true&limit=2`, {method: 'GET'});
  if (!Array.isArray(items) || items.length !== 1 || items[0].shortCode !== safe.shortcode || items[0].error) throw Error('Expected exactly one matching Reel result');
  const item = items[0];
  const count = key => typeof item[key] === 'number' && Number.isFinite(item[key]) && item[key] >= 0 ? item[key] : null;
  // Exclude comments, signed CDN URLs, audio links and account details from artifact.
  return {collected_at: new Date().toISOString(), run_id: data.id, source_url: safe.reel_url,
    shortcode: safe.shortcode, owner_username: typeof item.ownerUsername === 'string' ? item.ownerUsername : null,
    caption: typeof item.caption === 'string' ? item.caption : null,
    published_at: typeof item.timestamp === 'string' ? item.timestamp : null,
    likes: count('likesCount'), comments: count('commentsCount'),
    views: count('videoViewCount'), plays: count('videoPlayCount'), duration_seconds: count('videoDuration'),
    transcript_requested: false, video_download_requested: false,
    actor_reported_usage_usd: typeof run.usageTotalUsd === 'number' ? run.usageTotalUsd : null,
    limitations: ['Public counters only; no private Insights or retention data', 'Metadata collection does not constitute playback or speech analysis']};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [url, output, mode = 'plan', ...extra] = process.argv.slice(2);
    if (!output || extra.length || !['plan', 'run'].includes(mode)) throw Error('Usage: node apify-one-reel.mjs <reel-url> <output.json> [plan|run]');
    const plan = reelPlan(url);
    if (mode === 'plan') {
      writeFileSync(output, JSON.stringify({mode: 'plan', ...plan}, null, 2) + '\n');
      console.log('One-Reel plan saved. No Actors started.');
    } else {
      const result = await collectOneReel(plan, {token: process.env.APIFY_TOKEN,
        approved: process.env.APIFY_ONE_REEL_APPROVED === 'true',
        saveRun: value => writeFileSync(output + '.run.json', JSON.stringify(value, null, 2) + '\n')});
      writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
      console.log('One Reel collected. Public metadata saved; no other profiles or Reels requested.');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
