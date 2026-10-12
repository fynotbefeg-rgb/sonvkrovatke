// Regression checks for the live Apps Script layout (Code.gs with legacydoPost +
// generated RomanApproval.gs) and the local update candidate (+ SharedReview.gs).
// Live sources are never stored in Git: point the env vars at private local copies.
//   ROMAN_LIVE_BACKUP_DIR=<dir with live Code.gs, RomanApproval.gs>
//   ROMAN_CANDIDATE_DIR=<dir with candidate Code.gs, RomanApproval.gs, SharedReview.gs>
// Without them the suite is skipped. Only fictional tokens/accounts are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {harness} from './apps-script.test.mjs';
import {validateManifest, scriptHash} from './approval-manifest.mjs';

const liveDir = process.env.ROMAN_LIVE_BACKUP_DIR, candidateDir = process.env.ROMAN_CANDIDATE_DIR;
const skip = !liveDir || !candidateDir || !existsSync(join(candidateDir, 'SharedReview.gs')) ? 'live backup/candidate dirs not set' : false;
// Apps Script evaluates project files in order in one global scope.
const load = (dir, files) => files.map(f => readFileSync(join(dir, f), 'utf8')).join('\n');
const live = () => harness(load(liveDir, ['Code.gs', 'RomanApproval.gs']));
const candidate = () => harness(load(candidateDir, ['Code.gs', 'RomanApproval.gs', 'SharedReview.gs']));
const token = 'local-test-token';
const packet = () => ({schemaVersion: '1.0.0', topicId: 'live-candidate-test', topicText: 'Тестовая тема', revision: 1,
  bodyText: 'Тестовая основа', hooks: [{id: 1, text: 'Хук один'}, {id: 2, text: 'Хук два'}, {id: 3, text: 'Хук три'}], endings: []});
const state = h => JSON.stringify([h.rows, h.reviewRows, [...h.properties].sort(), h.triggers.length]);
const handlers = ['doPost', 'doGet', 'onRomanApprovalEdit', 'setupRomanApproval', 'checkApprovedScripts', 'markApprovedForProduction',
  'checkProductionSafety', 'testConnection', 'getApprovedProductionQueue', 'getProductionQueueResponse', 'legacydoPost',
  'romanApprovalQueueV1', 'romanApprovalSafetyV1'];
const globalsOf = h => handlers.filter(n => typeof h.context[n] === 'function');

test('one global router; handler names and legacy timer functions preserved exactly', {skip}, () => {
  const a = live(), b = candidate();
  assert.deepEqual(globalsOf(b), globalsOf(a));
  assert.deepEqual(globalsOf(a), handlers);
  for (const h of [a, b]) {
    assert.match(h.context.doPost.toString(), /RomanApprovalV1\.doPost\(e\)/);
    assert.match(h.context.onRomanApprovalEdit.toString(), /RomanApprovalV1\.onRomanApprovalEdit\(e\)/);
  }
  // Code.gs untouched: time-trigger targets resolve to the same legacy implementations.
  for (const n of ['checkApprovedScripts', 'markApprovedForProduction', 'checkProductionSafety', 'testConnection',
    'getApprovedProductionQueue', 'getProductionQueueResponse', 'doGet', 'legacydoPost']) {
    assert.equal(b.context[n].toString(), a.context[n].toString(), n);
  }
});

test('loading code adds/removes no triggers and writes no properties or cells', {skip}, () => {
  for (const make of [live, candidate]) {
    const ref = harness('// no project code');
    const h = make();
    assert.equal(h.triggers.length, 2);
    assert.deepEqual(h.triggers.map(t => t.getHandlerFunction()), ['checkApprovedScripts', 'checkProductionSafety']);
    assert.equal(state(h), state(ref));
  }
});

test('wrong or missing token returns no data and changes nothing', {skip}, () => {
  for (const make of [live, candidate]) {
    const h = make(); h.rows[1][6] = 'Утверждено'; h.edit(7); const before = state(h);
    for (const body of [{action: 'get_production_queue'}, {token: 'wrong', action: 'get_production_queue'},
      {token: 'wrong', action: 'get_topic_research_snapshot'}, {token: 'wrong', action: 'add_drafts', items: []}]) {
      const r = h.post(body);
      assert.equal(r.ok, false); assert.equal(r.items, undefined); assert.equal(r.topics, undefined);
    }
    assert.equal(state(h), before);
  }
});

test('unknown action starts no write or production; GET gives no data', {skip}, () => {
  for (const make of [live, candidate]) {
    const h = make(); const before = state(h);
    for (const action of ['start_production', 'delete_rows', 'approve']) {
      const r = h.post({token, action, items: [{topic_id: 'x'}]});
      assert.deepEqual(r, {ok: false, error: 'Unknown action'});
    }
    assert.equal(JSON.parse(h.context.doGet({}).content).ok, false);
    assert.equal(state(h), before);
  }
});

test('live endpoint rejects new actions; candidate keeps them closed while feature flag is off (default)', {skip}, () => {
  const a = live();
  assert.deepEqual(a.post({token, action: 'get_topic_research_snapshot'}), {ok: false, error: 'Unknown action'});
  const b = candidate(); const before = state(b);
  assert.equal(b.properties.has('ROMAN_SHARED_REVIEW_ENABLED'), false);
  const snap = b.post({token, action: 'get_topic_research_snapshot'});
  assert.equal(snap.ok, true); assert.equal(snap.enabled, false); assert.deepEqual(snap.topics, []);
  assert.equal(b.post({token, action: 'add_shared_review', packet: packet()}).ok, false);
  assert.equal(state(b), before);
});

test('topic snapshot works without speech approval and never enables production', {skip}, () => {
  const h = candidate(); h.properties.set('ROMAN_SHARED_REVIEW_ENABLED', 'true');
  assert.equal(h.post({token, action: 'add_shared_review', packet: packet()}).ok, true);
  h.reviewRows[1][1] = 'Утверждено'; h.editReview(2, 2);
  const snap = h.post({token, action: 'get_topic_research_snapshot'});
  assert.equal(snap.topics.length, 1);
  assert.equal(snap.topics[0].status, 'selected_for_research');
  assert.equal(snap.scriptApprovalGranted, false); assert.equal(snap.productionAllowed, false);
  assert.ok(!JSON.stringify(snap).includes('Тестовая основа'));
  assert.equal(h.post({token, action: 'get_production_queue'}).items.length, 0);
  assert.equal([...h.properties.keys()].some(k => /:body$|:hook\d$/.test(k)), false);
});

test('changed topic text or unknown editor gives no receipt', {skip}, () => {
  const unknown = candidate(); unknown.properties.set('ROMAN_SHARED_REVIEW_ENABLED', 'true');
  unknown.post({token, action: 'add_shared_review', packet: packet()});
  unknown.reviewRows[1][1] = 'Утверждено'; unknown.editReview(2, 2, 'stranger@example.test');
  assert.equal([...unknown.properties.keys()].some(k => k.startsWith('ROMAN_SHARED_RECEIPT:')), false);
  assert.deepEqual(unknown.post({token, action: 'get_topic_research_snapshot'}).topics, []);

  const changed = candidate(); changed.properties.set('ROMAN_SHARED_REVIEW_ENABLED', 'true');
  changed.post({token, action: 'add_shared_review', packet: packet()});
  changed.reviewRows[1][0] = 'Другая тема'; changed.reviewRows[1][1] = 'Утверждено'; changed.editReview(2, 2);
  assert.equal([...changed.properties.keys()].some(k => k.startsWith('ROMAN_SHARED_RECEIPT:')), false);
  assert.deepEqual(changed.post({token, action: 'get_topic_research_snapshot'}).topics, []);
});

test('ordinary approved queue keeps the same contract as the live endpoint', {skip}, () => {
  const strip = r => r.items.map(({approved_at, ...rest}) => rest);
  const a = live(), b = candidate();
  for (const h of [a, b]) { h.rows[1][6] = 'Утверждено'; h.edit(7); }
  const ra = a.post({token, action: 'get_production_queue'}), rb = b.post({token, action: 'get_production_queue'});
  assert.equal(rb.items.length, 1); validateManifest(rb);
  assert.equal(rb.items[0].script_hash, scriptHash(rb.items[0]));
  assert.deepEqual(Object.keys(rb).sort(), Object.keys(ra).sort());
  assert.deepEqual(strip(rb), strip(ra));
  // Drafts endpoint unchanged.
  const draft = {topic_id: 'new-topic', hook_id: 2, version_id: 'R-new-topic-h2', script_revision: 1,
    hook_text: 'Хук', script_text: 'Текст', status: 'pending_approval'};
  assert.deepEqual(b.post({token, action: 'add_drafts', items: [draft]}), a.post({token, action: 'add_drafts', items: [draft]}));
  assert.deepEqual(b.rows.slice(2), a.rows.slice(2));
});

test('missing trusted receipt blocks production in live and candidate', {skip}, () => {
  for (const make of [live, candidate]) {
    const h = make();
    const item = {topic_id: 'test-hooks', hook_id: 1, version_id: 'R-test-hooks-h1', script_revision: 1,
      hook_text: 'Первый шаг', script_text: 'Первый шаг должен быть понятным. 👋'};
    h.rows[1].splice(6, 5, 'Утверждено', '2026-10-09T12:00:00Z', 'roman@example.test', scriptHash(item), 'Готов к производству');
    assert.equal(h.post({token, action: 'get_production_queue'}).items.length, 0);
    h.rows[1][6] = 'Утверждено'; h.edit(7);
    h.properties.delete('ROMAN_APPROVAL:R-test-hooks-h1');
    assert.equal(h.post({token, action: 'get_production_queue'}).items.length, 0);
  }
});
