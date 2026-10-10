// Build three pending full scripts from one exact common body. No model/network/approval.
import {createHash} from 'node:crypto';
export function sharedBodyDrafts(topicId, response) {
  if (typeof topicId !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(topicId)) throw Error('Invalid topic ID');
  if (!response || typeof response.body_text !== 'string' || !response.body_text.trim() ||
      !Array.isArray(response.hooks) || response.hooks.length !== 3) throw Error('One body and exactly 3 hooks required');
  const seen = new Set();
  const hookTexts = new Set();
  const items = response.hooks.map(hook => {
    if (!hook || ![1, 2, 3].includes(hook.hook_id) || seen.has(hook.hook_id) ||
        typeof hook.hook_text !== 'string' || !hook.hook_text.trim()) throw Error('Hooks 1, 2, 3 must each occur once');
    seen.add(hook.hook_id);
    const comparable = hook.hook_text.trim().replace(/\s+/gu, ' ').toLowerCase();
    if (hookTexts.has(comparable)) throw Error('The three hooks must have different texts');
    hookTexts.add(comparable);
    const script = `${hook.hook_text}\n\n${response.body_text}`;
    const words = script.trim().split(/\s+/u).length;
    if (words < 100 || words > 160) throw Error('Each complete script must contain 100–160 words');
    return {topic_id: topicId, hook_id: hook.hook_id, version_id: `R-${topicId}-h${hook.hook_id}`,
      script_revision: 1, hook_text: hook.hook_text, script_text: script, status: 'pending_approval'};
  }).sort((a, b) => a.hook_id - b.hook_id);
  return {items, sourceSet: {topic_id: topicId, body_revision: 1, body_text: response.body_text,
    body_text_hash: createHash('sha256').update(response.body_text, 'utf8').digest('hex'),
    separator: '\n\n', versions: items.map(x => x.version_id), status: 'pending_approval'}};
}
