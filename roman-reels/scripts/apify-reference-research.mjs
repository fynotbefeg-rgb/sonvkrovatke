import {mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {reelPlan} from './apify-one-reel.mjs';

export const PROFILES = ['theautomationguy.ai', 'zapier'];
export function plans(stage, urls = []) {
  if (stage === 'metadata' && urls.length === 0) return PROFILES.map(profile => ({
    cap: 0.1, profile, input: {username: [profile], resultsLimit: 15,
      includeSharesCount: false, includeTranscript: false, includeDownloadedVideo: false},
  }));
  if (stage === 'details' && urls.length > 0 && urls.length <= 2) {
    const clean = urls.map(url => reelPlan(url).reel_url);
    if (new Set(clean).size !== clean.length) throw Error('Duplicate detail URLs');
    return clean.map(url => ({cap: 0.4, url, input: {...reelPlan(url).input,
      includeTranscript: true, includeDownloadedVideo: true}}));
  }
  throw Error('Expected metadata without URLs or details with 1–2 distinct Reel URLs');
}

export function sanitize(item, details) {
  const count = key => Number.isFinite(item[key]) && item[key] >= 0 ? item[key] : null;
  const s = key => typeof item[key] === 'string' ? item[key] : null;
  return {shortcode: s('shortCode'), owner: s('ownerUsername'), caption: s('caption'),
    url: item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}/` : null,
    publishedAt: s('timestamp'), likes: count('likesCount'), comments: count('commentsCount'),
    plays: count('videoPlayCount'), views: count('videoViewCount'), reach: null,
    duration: count('videoDuration'), sponsored: item.isSponsored ?? null,
    ...(details ? {transcript: item.transcript ?? null,
      downloadedVideo: item.downloadedVideo ?? null, downloadedVideoUrl: item.downloadedVideoUrl ?? null,
      videoUrl: s('videoUrl')} : {})};
}

export async function collect(stage, urls, {token, approved = false, directory,
  fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
  const selected = plans(stage, urls);
  if (!approved) throw Error('Explicit $1 research budget approval required');
  if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) throw Error('Missing APIFY_TOKEN');
  mkdirSync(directory, {recursive: true});
  const save = (name, value) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + '\n', {mode: 0o600});
  async function request(path, options = {}) {
    let response;
    try { response = await fetchImpl(`https://api.apify.com/v2/${path}`, {...options,
      headers: {Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json'},
      redirect: 'error', signal: AbortSignal.timeout(30000)}); }
    catch { throw Error('Apify connection failure; do not retry Actor creation'); }
    if (!response.ok) throw Error(`Apify HTTP ${response.status}; inspect saved run, do not retry POST`);
    return response.json();
  }
  const actor = (await request('acts/apify~instagram-reel-scraper')).data;
  const pricing = actor?.pricingInfos?.filter(p => Date.parse(p.startedAt) <= Date.now())
    .sort((a,b) => Date.parse(b.startedAt)-Date.parse(a.startedAt))[0];
  if (pricing?.pricingModel !== 'PAY_PER_EVENT') throw Error('Cannot confirm PPE budget cap');
  save('plan.json', {stage, maxStageChargeUsd: selected.reduce((s,p)=>s+p.cap,0),
    runs: selected, pricing, collectedAt: new Date().toISOString()});
  const all = [];
  for (const [index, plan] of selected.entries()) {
    const journal = `run-${index}.json`;
    if (existsSync(join(directory, journal))) throw Error('Run journal exists; no duplicate creation');
    save(journal, {state:'creation_pending', cap:plan.cap});
    let run = (await request(`acts/apify~instagram-reel-scraper/runs?maxTotalChargeUsd=${plan.cap}&timeout=180&restartOnError=false`,
      {method:'POST', body:JSON.stringify(plan.input)})).data;
    if (!run?.id || !/^[A-Za-z0-9]+$/.test(run.id)) throw Error('No valid run ID; inspect Apify before retrying');
    const runId = run.id;
    save(journal, {id:runId,status:run.status,cap:plan.cap});
    if (run.options?.maxTotalChargeUsd !== plan.cap) {
      await request(`actor-runs/${runId}/abort`, {method:'POST'});
      throw Error('Applied budget cap not confirmed; run aborted');
    }
    for (let n=0; !['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(run.status) && n<48; n++) {
      await sleep(5000); run = (await request(`actor-runs/${runId}`)).data;
      if (run?.id !== runId) throw Error('Unexpected run identity');
      save(journal, {id:runId,status:run.status,cap:plan.cap,usageTotalUsd:run.usageTotalUsd ?? null,
        datasetId:run.defaultDatasetId ?? null});
    }
    if (run.status !== 'SUCCEEDED') throw Error('Run did not succeed; inspect journal, no automatic retry');
    if (!/^[A-Za-z0-9]+$/.test(run.defaultDatasetId ?? '')) throw Error('Invalid dataset ID');
    const items = await request(`datasets/${run.defaultDatasetId}/items?clean=true&format=json&limit=16`);
    if (!Array.isArray(items) || items.length > (stage === 'metadata' ? 15 : 1)) throw Error('Unexpected dataset size');
    const rawValid = items.filter(item => item.shortCode && !item.error);
    // Profile feeds can include collaborations owned by a different account.
    // Exclude those, preserving verified own-account results without repeating a paid run.
    const valid = stage === 'metadata' ? rawValid.filter(item=>item.ownerUsername?.toLowerCase()===plan.profile) : rawValid;
    if (stage === 'details' && (valid.length !== 1 || valid[0].shortCode !== reelPlan(plan.url).shortcode)) throw Error('Detail Reel identity mismatch');
    const result = {runId, datasetId:run.defaultDatasetId, cap:plan.cap, usageTotalUsd:run.usageTotalUsd ?? null,
      excludedOwnerMismatch:rawValid.length-valid.length,
      items:valid.map(item=>sanitize(item,stage==='details'))};
    save(`result-${index}.json`, result); all.push(result);
    if (stage === 'details' && typeof valid[0].downloadedVideo === 'string') {
      const media = new URL(valid[0].downloadedVideo);
      if (media.protocol !== 'https:' || media.hostname !== 'api.apify.com' ||
          !/^\/v2\/key-value-stores\/[A-Za-z0-9]+\/records\/[^/]+$/.test(media.pathname)) throw Error('Unexpected video store URL');
      // Send our token only to the verified Apify API host; never forward it to a CDN.
      const response = await fetchImpl(media.origin + media.pathname, {headers:{Authorization:`Bearer ${token.trim()}`},
        redirect:'error',signal:AbortSignal.timeout(60000)});
      if (!response.ok) throw Error('Video store download failed');
      const chunks=[]; let size=0;
      for await (const chunk of response.body) {
        size+=chunk.length; if(size>50*1024*1024) throw Error('Video exceeds 50MB local limit'); chunks.push(chunk);
      }
      writeFileSync(join(directory,`video-${index}.mp4`),Buffer.concat(chunks),{mode:0o600});
    }
  }
  save('results.json', {stage, collectedAt:new Date().toISOString(), runs:all});
  return all;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [stage, directory, ...urls] = process.argv.slice(2);
    await collect(stage, urls, {token:process.env.APIFY_TOKEN,
      approved:process.env.APIFY_RESEARCH_APPROVED==='true',directory});
    console.log('Bounded reference collection completed; review private artifact.');
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
