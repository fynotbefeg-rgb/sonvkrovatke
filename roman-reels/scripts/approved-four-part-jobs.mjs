// Fresh authenticated queue -> exact four-part packet and explicit uploader jobs.
// Planning only: no avatar generation, upload, render or writes to approvals.
import {createHash} from 'node:crypto';
import path from 'node:path';
import {scriptHash, validateManifest} from './approval-manifest.mjs';

const receipts = new WeakMap();
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const textHash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const roles = ['body', 'hook-1', 'hook-2', 'hook-3'];
const require = (ok, message) => { if (!ok) throw new Error(message); };
const exact = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) &&
  Object.keys(o).length === keys.length && Object.keys(o).every(k => keys.includes(k));

function validateReview(p) {
  require(exact(p, ['schemaVersion', 'topicId', 'topicText', 'revision', 'bodyText', 'hooks', 'endings']) &&
    p.schemaVersion === '1.0.0' && typeof p.topicId === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(p.topicId) &&
    Number.isSafeInteger(p.revision) && p.revision >= 1 && p.revision <= 9999 &&
    Array.isArray(p.endings) && p.endings.length === 0 && Buffer.byteLength(JSON.stringify(p)) <= 8000,
    'Exact four-part shared review required; platform endings are not discarded');
  for (const text of [p.topicText, p.bodyText]) require(typeof text === 'string' && text.trim() && !/^\s*[=+@-]/.test(text), 'Invalid review text');
  require(Array.isArray(p.hooks) && p.hooks.length === 3 && new Set(p.hooks.map(h => h.id)).size === 3 &&
    p.hooks.every(h => exact(h, ['id', 'text']) && [1, 2, 3].includes(h.id) && typeof h.text === 'string' &&
      h.text.trim() && !/^\s*[=+@-]/.test(h.text)), 'Three distinct hook IDs/texts required');
  require(new Set(p.hooks.map(h => h.text.trim().replace(/\s+/gu, ' ').toLowerCase())).size === 3, 'Hook texts must differ');
}

async function boundedJson(response) {
  require(response.ok && response.body, 'Production queue endpoint refused');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length; require(size <= 200000, 'Production queue exceeds byte cap'); chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function readApprovedQueue({url, token, fetchImpl = fetch, now = Date.now()} = {}) {
  require(typeof url === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url) &&
    typeof token === 'string' && token.trim() && !/[\r\n]/.test(token) && Number.isFinite(now), 'Protected queue configuration required');
  try {
    const signal = AbortSignal.timeout(30000);
    let response = await fetchImpl(url, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify({token, action: 'get_production_queue'}), redirect: 'manual', signal});
    if ([302, 303].includes(response.status)) {
      const target = new URL(response.headers.get('location') || '', url);
      require(target.origin === 'https://script.googleusercontent.com' && target.pathname === '/macros/echo' &&
        !target.username && !target.password && !target.hash && !target.href.includes(token) &&
        !target.href.includes(encodeURIComponent(token)), 'Unexpected response redirect');
      response = await fetchImpl(target.href, {method: 'GET', redirect: 'error', signal});
    }
    const data = await boundedJson(response);
    require(data?.ok === true && Array.isArray(data.items) && data.items.length <= 180, 'Invalid production queue');
    validateManifest(data);
    require(data.items.every(i => i.status === 'approved' && Date.parse(i.approved_at) <= now), 'Only current approved receipts accepted');
    // Local read time is freshness of the transport, NOT a new approval timestamp.
    receipts.set(data, {digest: digest(data), capturedAt: now});
    return data;
  } catch { throw new Error('Authenticated production queue unavailable or invalid; no fallback or retry'); }
}

export function planApprovedUploads(review, bindings, queue, {now = Date.now()} = {}) {
  const read = queue && receipts.get(queue);
  require(read && read.digest === digest(queue) && Number.isFinite(now) && now >= read.capturedAt &&
    now - read.capturedAt <= 300000, 'Fresh unchanged authenticated queue required; saved JSON is not authority');
  validateReview(review);
  const selected = queue.items.filter(i => i.topic_id === review.topicId);
  const base = {planVersion: '1.0.0', topicId: review.topicId, scriptVersion: review.revision,
    generationAllowed: false, uploadPerformed: false, renderAllowed: false,
    currentApprovalRecheckRequired: true, jobs: [], packet: null};
  if (selected.length !== 3) return {...base, status: 'awaiting_exact_approvals'};
  const packetHash = digest(review), topicHash = digest(['shared-review-v1', review.topicId, review.revision, 'topic', review.topicText]);
  const bodyHash = digest(['shared-review-v1', review.topicId, review.revision, 'body', review.bodyText]);
  const hooks = [...review.hooks].sort((a, b) => a.id - b.id);
  for (const hook of hooks) {
    const item = selected.find(i => i.hook_id === hook.id);
    const proof = item?.shared_review;
    const hookHash = digest(['shared-review-v1', review.topicId, review.revision, 'hook', hook.id, hook.text, bodyHash]);
    require(item && item.script_revision === review.revision && item.hook_text === hook.text &&
      item.script_text === `${hook.text}\n\n${review.bodyText}` && item.script_hash === scriptHash(item) &&
      proof?.topicId === review.topicId && proof.revision === review.revision && proof.packetHash === packetHash &&
      proof.componentHashes?.topic === topicHash && proof.componentHashes.body === bodyHash && proof.componentHashes.hook === hookHash,
      'Current shared topic/body/hook receipt does not match the exact review packet');
  }
  require(new Set(selected.map(i => i.approved_by)).size === 1, 'One shared approver required');
  require(exact(bindings, roles), 'Explicit local path for every role required');
  const planKey = digest(['approved-four-part-v1', packetHash, hooks.map(h => selected.find(i => i.hook_id === h.id).script_hash)]);
  const jobs = roles.map(role => {
    const b = bindings[role];
    require(b && typeof b === 'object' && !Array.isArray(b) && Object.keys(b).every(k => ['localPath', 'heygenTitle'].includes(k)), 'Invalid file binding');
    const localPath = b.localPath;
    require(typeof localPath === 'string' && !/[\u0000-\u001f]/.test(localPath) && /\.mp4$/i.test(localPath) &&
      (path.isAbsolute(localPath) || /^[A-Za-z]:[\\/]/.test(localPath)) &&
      !localPath.split(/[\\/]/).includes('..'), 'Finished absolute MP4 path required');
    require(b.heygenTitle == null || (typeof b.heygenTitle === 'string' && b.heygenTitle.length <= 300 && !/[\u0000-\u001f]/.test(b.heygenTitle)), 'Invalid HeyGen title');
    const text = role === 'body' ? review.bodyText : hooks.find(h => role === `hook-${h.id}`).text;
    return {schemaVersion: '1.0.0', jobId: `rr-${planKey.slice(0, 40)}-${role}`, topicId: review.topicId,
      scriptVersion: review.revision, role, localPath, heygenTitle: b.heygenTitle ?? null, textHash: textHash(text)};
  });
  const normalize = file => /^[A-Za-z]:[\\/]/.test(file) ? path.win32.normalize(file).toLowerCase() : path.resolve(file);
  require(new Set(jobs.map(j => normalize(j.localPath))).size === 4, 'Distinct local files required');
  // Neutral declaration for the intake; actual approvals remain only in the live service.
  const packet = {draftVersion: '3.0.0', mode: 'editorial', productionReady: false,
    sourceSet: {topic_id: review.topicId, recordingParts: 4, status: 'pending_approval', body_text: review.bodyText,
      body_text_hash: textHash(review.bodyText), hooks: hooks.map(h => ({hook_id: h.id, hook_text: h.text}))},
    items: hooks.map(h => {const item = selected.find(i => i.hook_id === h.id);
      return {topic_id: item.topic_id, hook_id: item.hook_id, version_id: item.version_id, script_revision: item.script_revision,
        hook_text: item.hook_text, script_text: item.script_text, script_hash: item.script_hash, status: 'pending_approval'};})};
  return {...base, status: 'planned', planKey, jobs, packet};
}
