// Offline receipt declaration from an explicit packet and the uploader's own journal.
// No network, HeyGen, approval, or proof that the MP4 speech matches the text.
import {createHash} from 'node:crypto';
import {readFile, stat, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

export const textHash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const require = (ok, message) => { if (!ok) throw new Error(message); };
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const roles = ['body', 'hook-1', 'hook-2', 'hook-3'];

export function buildFourPartReceipt(packet, journal) {
  require(packet?.draftVersion === '3.0.0' && packet.mode === 'editorial' && packet.productionReady === false,
    'Explicit four-part editorial packet required');
  const source = packet.sourceSet;
  require(source && typeof source.topic_id === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(source.topic_id) &&
    source.recordingParts === 4 && source.status === 'pending_approval' && !source.endings?.length,
    'Four-part topic required, without endings');
  require(typeof source.body_text === 'string' && source.body_text.trim() &&
    textHash(source.body_text) === source.body_text_hash, 'Exact body text/hash required');
  require(Array.isArray(source.hooks) && source.hooks.length === 3 &&
    new Set(source.hooks.map(h => h.hook_id)).size === 3 && source.hooks.every(h =>
      Number.isInteger(h.hook_id) && [1, 2, 3].includes(h.hook_id) && typeof h.hook_text === 'string' && h.hook_text.trim()),
    'Three explicit hooks required');
  require(Array.isArray(packet.items) && packet.items.length === 3, 'Three full-text variants required');
  const version = packet.items[0].script_revision;
  require(Number.isInteger(version) && version >= 1 && version <= 9999, 'Invalid script revision');
  const seen = new Set();
  for (const item of packet.items) {
    const hook = source.hooks.find(h => h.hook_id === item.hook_id);
    require(hook && !seen.has(item.hook_id), 'Duplicate or unknown variant');
    seen.add(item.hook_id);
    const id = `R-${source.topic_id}-h${item.hook_id}`;
    const script = `${hook.hook_text}\n\n${source.body_text}`;
    require(item.topic_id === source.topic_id && item.script_revision === version && item.platform == null &&
      item.version_id === id && item.hook_text === hook.hook_text && item.script_text === script &&
      item.status === 'pending_approval' && item.script_hash === textHash(JSON.stringify([id, version, hook.hook_text, script])),
      'Full-text binding mismatch');
  }
  require(journal?.journalVersion === '1.0.0' && journal.jobs && typeof journal.jobs === 'object' &&
    !Array.isArray(journal.jobs) && Object.keys(journal.jobs).length <= 10000, 'Invalid uploader journal');
  const selected = Object.entries(journal.jobs).filter(([, e]) => e.topicId === source.topic_id && e.scriptVersion === version);
  require(selected.length === 4, 'Exactly four journal entries for the target revision required');
  const files = roles.map(role => {
    const matches = selected.filter(([, e]) => e.role === role);
    require(matches.length === 1, 'Missing or ambiguous role in uploader journal');
    const [key, entry] = matches[0];
    const text = role === 'body' ? source.body_text : source.hooks.find(h => role === `hook-${h.hook_id}`).hook_text;
    require(key === entry.jobId && entry.status === 'uploaded' && typeof entry.driveFileId === 'string' && entry.driveFileId &&
      entry.driveName === `${role}.mp4` && hex(entry.sha256) && entry.textHash === textHash(text) &&
      Number.isSafeInteger(entry.size) && entry.size > 0, 'Verified upload with exact preassigned textHash required');
    return {fileName: `${role}.mp4`, sha256: entry.sha256, textHash: entry.textHash};
  });
  require(new Set(selected.map(([, e]) => e.driveFileId)).size === 4, 'Distinct Drive files required');
  require(selected.reduce((sum, [, e]) => sum + e.size, 0) < 1024 ** 3, 'Source set exceeds cloud byte cap');
  return {receiptVersion: '1.0.0', topicId: source.topic_id, scriptVersion: version, files};
}

async function readBounded(file) {
  require((await stat(file)).size <= 2 * 1024 ** 2, 'Input JSON exceeds byte limit');
  return JSON.parse(await readFile(file, 'utf8'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , packetFile, journalFile, out, ...extra] = process.argv;
  try {
    require(packetFile && journalFile && out && !extra.length,
      'Usage: build-four-part-receipt.mjs <packet.json> <journal-v1.json> <new-recording-set.json>');
    const receipt = buildFourPartReceipt(await readBounded(packetFile), await readBounded(journalFile));
    await writeFile(out, JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    console.log('Receipt declaration written; no upload or production authorization performed.');
  } catch (error) {
    console.error(['EEXIST', 'ENOENT', 'EACCES'].includes(error.code) ? `Receipt file operation failed (${error.code})` :
      error instanceof SyntaxError ? 'Invalid input JSON' : error.message);
    process.exitCode = 1;
  }
}
