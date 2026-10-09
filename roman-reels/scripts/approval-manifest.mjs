import {createHash} from 'node:crypto';

export function scriptHash(item) {
  return createHash('sha256').update(JSON.stringify([
    item.version_id, item.script_revision, item.hook_text, item.script_text,
  ])).digest('hex');
}

// A hash proves consistency with the approval snapshot, not the approver's identity.
export function validateManifest(data) {
  if (!data || !Array.isArray(data.items)) throw Error('Manifest must contain items array');
  const seen = new Set();
  for (const [i, item] of data.items.entries()) {
    const fail = (message) => { throw Error(`items[${i}]: ${message}`); };
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('expected object');
    if (typeof item.topic_id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(item.topic_id)) fail('invalid topic_id');
    if (![1, 2, 3].includes(item.hook_id)) fail('invalid hook_id');
    if (item.version_id !== `R-${item.topic_id}-h${item.hook_id}`) fail('version_id mismatch');
    if (seen.has(item.version_id)) fail('duplicate version_id');
    seen.add(item.version_id);
    if (!Number.isSafeInteger(item.script_revision) || item.script_revision < 1) fail('invalid script_revision');
    for (const field of ['hook_text', 'script_text']) {
      if (typeof item[field] !== 'string' || !item[field].trim()) fail(`empty ${field}`);
    }
    if (!['pending_approval', 'approved', 'rejected'].includes(item.status)) fail('invalid status');
    if (item.status === 'approved') {
      if (typeof item.approved_by !== 'string' || !item.approved_by.trim()) fail('approved_by required');
      if (typeof item.approved_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(item.approved_at) || Number.isNaN(Date.parse(item.approved_at))) fail('approved_at must be ISO timestamp');
      if (item.script_hash !== scriptHash(item)) fail('script_hash does not match approved text/revision');
    } else if (item.approved_by || item.approved_at) {
      fail('unapproved item cannot contain approval metadata');
    }
  }
  return data.items;
}
