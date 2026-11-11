// Upgrade regressions: live Version 4 layout (unchanged legacy Code.gs + RomanApproval.gs +
// SharedReview.gs) versus the local topic-first candidate. Live sources never enter Git:
//   ROMAN_LIVE_BACKUP_DIR=<private copy of the current live project>
//   ROMAN_CANDIDATE_DIR=<private candidate: live Code.gs + generated RomanApproval.gs + SharedReview.gs>
// Without them the suite is skipped. All tokens, accounts and edits below are local mocks;
// they do not prove Google's real e.user behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {harness} from './apps-script.test.mjs';
import {validateManifest} from './approval-manifest.mjs';
import {validateTopicSnapshot} from './topic-selection-reader.mjs';

const liveDir = process.env.ROMAN_LIVE_BACKUP_DIR, candidateDir = process.env.ROMAN_CANDIDATE_DIR;
const files = ['Code.gs', 'RomanApproval.gs', 'SharedReview.gs'];
const skip = !liveDir || !candidateDir || files.some(f => !existsSync(join(liveDir, f)) || !existsSync(join(candidateDir, f)))
  ? 'live backup/candidate dirs not set' : false;
// Apps Script evaluates project files in order in one global scope.
const load = dir => files.map(f => readFileSync(join(dir, f), 'utf8')).join('\n');
const v4 = () => harness(load(liveDir));
const candidate = () => harness(load(candidateDir));
const token = 'local-test-token';
const enable = h => { h.properties.set('ROMAN_SHARED_REVIEW_ENABLED', 'true'); return h; };
const queue = h => h.post({token, action: 'get_production_queue'});
const snapshot = h => h.post({token, action: 'get_topic_research_snapshot'});
const state = h => JSON.stringify([h.rows, h.reviewRows, [...h.properties].sort(), h.triggers.length]);
const topic = () => ({schemaVersion: '1.0.0', topicId: 'upgrade-topic', topicText: 'Учебная тема для проверки', revision: 1,
  analysis: 'Мок-анализ', statistics: 'Мок-статистика', referenceUrl: 'https://example.test/reference'});
const speech = (extra = {}) => ({schemaVersion: '1.0.0', topicId: 'upgrade-topic', topicText: 'Учебная тема для проверки', revision: 1,
  bodyText: 'Мок-основа', hooks: [{id: 1, text: 'Мок-хук 1'}, {id: 2, text: 'Мок-хук 2'}, {id: 3, text: 'Мок-хук 3'}], endings: [], ...extra});
function decide(h, row, column, value = 'Утверждено', email) { h.reviewRows[row - 1][column - 1] = value; h.editReview(row, column, email); }
const handlers = ['doPost', 'doGet', 'onRomanApprovalEdit', 'setupRomanApproval', 'checkApprovedScripts', 'markApprovedForProduction',
  'checkProductionSafety', 'testConnection', 'getApprovedProductionQueue', 'getProductionQueueResponse', 'legacydoPost',
  'romanApprovalQueueV1', 'romanApprovalSafetyV1'];

test('same global handlers, one router, legacy Code.gs functions byte-identical', {skip}, () => {
  const a = v4(), b = candidate();
  assert.deepEqual(handlers.filter(n => typeof b.context[n] === 'function'), handlers);
  for (const n of handlers) assert.equal(typeof a.context[n], typeof b.context[n], n);
  assert.match(b.context.doPost.toString(), /RomanApprovalV1\.doPost\(e\)/);
  for (const n of ['checkApprovedScripts', 'markApprovedForProduction', 'checkProductionSafety', 'testConnection',
    'getApprovedProductionQueue', 'getProductionQueueResponse', 'doGet', 'legacydoPost']) {
    assert.equal(b.context[n].toString(), a.context[n].toString(), n);
  }
});

test('loading adds no triggers and writes nothing', {skip}, () => {
  const ref = harness('// no project code');
  for (const h of [v4(), candidate()]) assert.equal(state(h), state(ref));
});

test('wrong token and unknown action behave exactly as Version 4', {skip}, () => {
  const a = v4(), b = candidate();
  for (const body of [{action: 'get_production_queue'}, {token: 'wrong', action: 'get_topic_research_snapshot'},
    {token: 'wrong', action: 'add_topic_review', packet: topic()}, {token, action: 'start_production'}]) {
    assert.deepEqual(b.post(body), a.post(body));
  }
  assert.equal(state(b), state(a));
});

test('flag off (default): snapshot contract identical to Version 4; add_topic_review writes nothing', {skip}, () => {
  const a = v4(), b = candidate();
  const sa = snapshot(a), sb = snapshot(b);
  const strip = ({capturedAt, ...rest}) => rest;
  assert.deepEqual(strip(sb), strip(sa));
  assert.equal(sb.enabled, false); assert.deepEqual(sb.topics, []); assert.equal(sb.productionAllowed, false);
  const before = state(b);
  assert.equal(b.post({token, action: 'add_topic_review', packet: topic()}).ok, false);
  // Version 4 does not know the action; it also writes nothing.
  assert.deepEqual(a.post({token, action: 'add_topic_review', packet: topic()}), {ok: false, error: 'Unknown action'});
  assert.equal(state(b), before);
});

test('legacy approved queue and drafts keep the Version 4 contract', {skip}, () => {
  const a = v4(), b = candidate();
  for (const h of [a, b]) { h.rows[1][6] = 'Утверждено'; h.edit(7); }
  const strip = r => r.items.map(({approved_at, ...rest}) => rest);
  const qa = queue(a), qb = queue(b);
  assert.equal(qb.items.length, 1); validateManifest(qb);
  assert.deepEqual(strip(qb), strip(qa));
  const draft = {topic_id: 'draft-topic', hook_id: 1, version_id: 'R-draft-topic-h1', script_revision: 1,
    hook_text: 'Мок', script_text: 'Мок-текст', status: 'pending_approval'};
  assert.deepEqual(b.post({token, action: 'add_drafts', items: [draft]}), a.post({token, action: 'add_drafts', items: [draft]}));
  assert.deepEqual(b.rows.slice(2), a.rows.slice(2));
});

test('existing Version 4 shared approvals survive the code update unchanged', {skip}, () => {
  const a = enable(v4());
  assert.equal(a.post({token, action: 'add_shared_review', packet: speech({topicId: 'old-shared'})}).ok, true);
  decide(a, 2, 2); decide(a, 2, 4); decide(a, 3, 4);
  const before = queue(a); assert.equal(before.items.length, 1);
  // Same spreadsheet/properties state, new code.
  const b = candidate();
  b.rows.splice(0, b.rows.length, ...structuredClone(a.rows));
  b.reviewRows.splice(0, b.reviewRows.length, ...structuredClone(a.reviewRows));
  b.properties.clear(); for (const [k, v] of a.properties) b.properties.set(k, v);
  assert.deepEqual(queue(b), before);
  const strip = ({capturedAt, ...rest}) => rest;
  assert.deepEqual(strip(snapshot(b)), strip(snapshot(a)));
});

test('topic first → same-revision speech keeps only the original topic receipt → separate approvals → revoke blocks', {skip}, () => {
  const h = enable(candidate());
  const reg = h.post({token, action: 'add_topic_review', packet: topic()});
  assert.equal(reg.ok, true); assert.equal(reg.approvalGranted, false); assert.equal(reg.rows, 1);
  decide(h, 2, 2); // mock trusted single edit in column B
  const snap = snapshot(h); validateTopicSnapshot(snap);
  assert.equal(snap.topics.length, 1); assert.equal(snap.productionAllowed, false);
  const original = JSON.parse(h.properties.get('ROMAN_TOPIC_ONLY_RECEIPT:upgrade-topic'));

  // Different text or revision is refused; exact same revision is accepted.
  assert.equal(h.post({token, action: 'add_shared_review', packet: speech({topicText: 'Другая тема'})}).ok, false);
  assert.equal(h.post({token, action: 'add_shared_review', packet: speech({revision: 2})}).ok, false);
  const sp = h.post({token, action: 'add_shared_review', packet: speech()});
  assert.equal(sp.ok, true); assert.equal(sp.firstRow, 3);
  const carried = JSON.parse(h.properties.get('ROMAN_SHARED_RECEIPT:upgrade-topic:topic'));
  assert.deepEqual(carried, original);
  assert.equal([...h.properties.keys()].filter(k => k.startsWith('ROMAN_SHARED_RECEIPT:upgrade-topic:')).length, 1);
  assert.equal(queue(h).items.length, 0);

  decide(h, 3, 4); // body
  assert.equal(queue(h).items.length, 0);
  decide(h, 4, 4); // hook 1
  const q = queue(h); validateManifest(q);
  assert.deepEqual(q.items.map(i => i.hook_id), [1]);

  decide(h, 2, 2, 'Не утверждено'); // revoke original topic choice
  assert.equal(h.properties.has('ROMAN_TOPIC_ONLY_RECEIPT:upgrade-topic'), false);
  assert.equal(queue(h).items.length, 0);
  assert.equal(snapshot(h).topics.length, 0);
});

test('existing full-shared topic is not retrofitted as topic-only', {skip}, () => {
  const h = enable(candidate());
  assert.equal(h.post({token, action: 'add_shared_review', packet: speech()}).ok, true);
  const before = state(h);
  assert.equal(h.post({token, action: 'add_topic_review', packet: topic()}).ok, false);
  assert.equal(state(h), before);
});
