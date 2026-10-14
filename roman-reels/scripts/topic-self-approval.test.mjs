// Topic self-approval through a web app that executes as the visitor (Google-authenticated identity).
// Offline Apps Script harness; no Google, Drive or secrets. The edit-trigger author check is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness} from './apps-script.test.mjs';

const token = 'local-test-token', ROMAN = 'roman@example.test';
const addon = readFileSync(new URL('../apps-script/RomanApproval.gs', import.meta.url), 'utf8');
const packet = (extra = {}) => ({schemaVersion: '1.0.0', topicId: 'self-approval-test', topicText: 'Учебная тема <b>с разметкой</b>', revision: 1,
  analysis: 'Учебный анализ', statistics: 'Учебные данные', referenceUrl: 'https://www.instagram.com/reel/testExample/', ...extra});
function setup({source, active = ROMAN, effective = active} = {}) {
  const h = harness(source, {shared: true});
  h.properties.set('ROMAN_SHARED_REVIEW_ENABLED', 'true');
  h.context.Session = {getActiveUser: () => ({getEmail: () => h.identity.active}), getEffectiveUser: () => ({getEmail: () => h.identity.effective})};
  h.context.HtmlService = {createHtmlOutput: html => ({html, setTitle() { return this; }})};
  h.identity = {active, effective};
  assert.equal(h.post({token, action: 'add_topic_review', packet: packet()}).ok, true);
  return h;
}
const snapshot = h => h.post({token, action: 'get_topic_research_snapshot'});
const hashOf = h => JSON.parse(h.properties.get('ROMAN_TOPIC_ONLY_REVIEW:self-approval-test')).packet && page(h).match(/&quot;([a-f0-9]{64})&quot;/)?.[1];
const page = h => h.context.doGet({parameter: {view: 'topics'}}).html ?? '';

for (const [name, source] of [['standalone Code.gs', undefined], ['generated RomanApproval.gs addon', addon]]) {
  test(`${name}: allowlisted visitor confirmed by Google selects the exact topic; trigger then keeps it`, () => {
    const h = setup({source});
    const html = page(h);
    assert.match(html, /Учебная тема &lt;b&gt;с разметкой&lt;\/b&gt; \(строка 2\)/);
    assert.ok(!html.includes('<b>с разметкой'));
    const hash = hashOf(h);
    const r = h.context.romanSelfApproveTopic('self-approval-test', 1, hash);
    assert.deepEqual([r.ok, r.row, r.productionAllowed], [true, 2, false]);
    assert.equal(h.reviewRows[1][1], 'Утверждено');
    const s = snapshot(h);
    assert.equal(s.topics.length, 1);
    assert.equal(s.topics[0].approvedBy, ROMAN);
    assert.equal(s.productionAllowed, false);
    assert.equal(h.post({token, action: 'get_production_queue'}).items.length, 0);
    assert.equal(page(h).includes('<ul>'), false); // already chosen: nothing left to choose
  });

  test(`${name}: hidden, foreign or mismatched Google identity never approves`, () => {
    for (const identity of [{active: '', effective: ''}, {active: 'stranger@example.test', effective: 'stranger@example.test'},
      {active: ROMAN, effective: 'owner@example.test'}, {active: 'owner@example.test', effective: 'owner@example.test'}]) {
      const h = setup({source});
      const hash = (() => { const keep = h.identity; h.identity = {active: ROMAN, effective: ROMAN}; const x = hashOf(h); h.identity = keep; return x; })();
      Object.assign(h.identity, identity);
      assert.equal(page(h).includes('<ul>'), false, JSON.stringify(identity));
      const r = h.context.romanSelfApproveTopic('self-approval-test', 1, hash);
      assert.equal(r.ok, false);
      assert.equal(h.reviewRows[1][1], '');
      assert.equal(snapshot(h).topics.length, 0);
    }
  });

  test(`${name}: stale revision, wrong hash, edited row or disabled review are refused`, () => {
    const h = setup({source});
    const hash = hashOf(h);
    assert.equal(h.context.romanSelfApproveTopic('self-approval-test', 2, hash).ok, false);
    assert.equal(h.context.romanSelfApproveTopic('self-approval-test', 1, '0'.repeat(64)).ok, false);
    assert.equal(h.context.romanSelfApproveTopic('unknown-topic', 1, hash).ok, false);
    h.reviewRows[1][0] = 'Изменённая тема';
    assert.equal(h.context.romanSelfApproveTopic('self-approval-test', 1, hash).ok, false);
    const d = setup({source}); const dh = hashOf(d);
    d.properties.set('ROMAN_SHARED_REVIEW_ENABLED', 'false');
    assert.equal(d.context.romanSelfApproveTopic('self-approval-test', 1, dh).ok, false);
    assert.equal(snapshot(h).topics.length, 0);
  });

  test(`${name}: plain GET still refuses; dropdown edit with empty e.user still fails closed`, () => {
    const h = setup({source});
    assert.equal(JSON.parse(h.context.doGet().content).ok, false);
    assert.equal(JSON.parse(h.context.doGet({parameter: {}}).content).ok, false);
    h.reviewRows[1][1] = 'Утверждено';
    h.editReview(2, 2, null);
    assert.equal(h.reviewRows[1][1], '');
    assert.equal(snapshot(h).topics.length, 0);
  });
}
