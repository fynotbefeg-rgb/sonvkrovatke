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

// Full speech approvals remain separate; only a live Google-authenticated visitor can confirm a part.
const vm = await import('node:vm');
const {createHash}=await import('node:crypto');
const choicesFor = h => JSON.parse(vm.runInContext('JSON.stringify(RomanSharedReview.selfReviewChoices(Session.getActiveUser().getEmail(), Session.getEffectiveUser().getEmail(), ["roman@example.test"]))', h.context));
function speechSetup(source) {
  const h = setup({source});
  assert.equal(h.context.romanSelfApproveTopic('self-approval-test', 1, hashOf(h)).ok, true);
  const p = {schemaVersion: '1.0.0', topicId: 'self-approval-test', topicText: packet().topicText, revision: 1,
    bodyText: 'Проверенная основа <script>alert(1)</script>', hooks: [1,2,3].map(id => ({id, text: 'Хук ' + id})),
    endings: [{platform: 'instagram', text: 'Отдельное окончание'}, {platform: 'tiktok', text: 'Напиши в личные сообщения'}]};
  const r = h.post({token, action: 'add_shared_review', packet: p});
  assert.equal(r.ok, true, JSON.stringify(r)); h.speechRow = r.firstRow; return h;
}
const confirm = (h, c) => h.context.romanSelfApprovePart(c.topicId, c.revision, c.part, c.hash);
for (const [name, source] of [['standalone', undefined], ['addon', addon]]) {
  test(`${name}: separate body including ending then three hooks yield only their exact approved variants`, () => {
    const h = speechSetup(source);
    const before = choicesFor(h); assert.deepEqual(before.map(c => c.part), ['body']);
    assert.ok(before[0].text.includes('Отдельное окончание')); assert.ok(before[0].text.endsWith('Напиши в личные сообщения'));
    const html = h.context.doGet({parameter: {view: 'review'}}).html;
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')); assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.equal(confirm(h, before[0]).ok, true);
    const key = 'ROMAN_SHARED_RECEIPT:self-approval-test:body', original = h.properties.get(key);
    assert.equal(confirm(h, before[0]).alreadyApproved, true); assert.equal(h.properties.get(key), original);
    const hooks = choicesFor(h); assert.deepEqual(hooks.map(c => c.part), ['hook1','hook2','hook3']);
    assert.equal(h.post({token, action: 'get_production_queue'}).items.length, 0);
    assert.equal(confirm(h, hooks[0]).ok, true); assert.equal(h.post({token, action: 'get_production_queue'}).items.length, 2);
    assert.equal(confirm(h, hooks[1]).ok, true); assert.equal(confirm(h, hooks[2]).ok, true);
    assert.equal(h.post({token, action: 'get_production_queue'}).items.length, 6);
    assert.equal(choicesFor(h).length, 0);
  });
  test(`${name}: forged identity, stale revision/hash, unsupported part and premature hook never approve`, () => {
    const h = speechSetup(source), body = choicesFor(h)[0];
    assert.equal(confirm(h, {...body, part: 'topic'}).ok, false);
    assert.equal(confirm(h, {...body, part: 'hook4'}).ok, false);
    assert.equal(confirm(h, {...body, revision: 2}).ok, false);
    assert.equal(confirm(h, {...body, hash: '0'.repeat(64)}).ok, false);
    // A real hook hash is insufficient before the body receipt exists.
    const hash = vm.runInContext('JSON.parse(PropertiesService.getScriptProperties().getProperty("ROMAN_SHARED_REVIEW:self-approval-test"))', h.context);
    assert.ok(hash.packet);
    const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
    const p=hash.packet, display=p.bodyText+p.endings.map(e=>'\n\nОкончание '+e.platform+':\n'+e.text).join('');
    const bh=digest(['shared-review-v1',p.topicId,p.revision,'body',display]);
    const hh=digest(['shared-review-v1',p.topicId,p.revision,'hook',1,p.hooks.find(x=>x.id===1).text,bh]);
    assert.equal(confirm(h,{...body,part:'hook1',hash:hh}).ok,false);
    for (const id of [{active:'',effective:''},{active:ROMAN,effective:'owner@example.test'}, {active:'owner@example.test',effective:'owner@example.test'}]) {
      Object.assign(h.identity,id); assert.equal(confirm(h,body).ok,false); assert.equal(choicesFor(h).length,0);
    }
    assert.equal(h.reviewRows[h.speechRow-1][3], '');
  });
  test(`${name}: withdrawn topic, changed body/ending, formula and disabled review invalidate stale forms`, () => {
    for (const kind of ['topic','body','ending','formula','disabled']) {
      const h = speechSetup(source), body = choicesFor(h)[0];
      if(kind==='topic') {h.reviewRows[1][1]='Не утверждено';h.editReview(2,2,ROMAN);}
      if(kind==='body'||kind==='ending')h.reviewRows[h.speechRow-1][2]+=' changed '+kind;
      if(kind==='formula')h.reviewRows[h.speechRow-1][2]='=1';
      if(kind==='disabled')h.properties.set('ROMAN_SHARED_REVIEW_ENABLED','false');
      assert.equal(confirm(h,body).ok,false,kind); assert.equal(h.post({token,action:'get_production_queue'}).items.length,0);
    }
  });
  test(`${name}: body and topic rejection stop saved hook form`, () => {
    const h = speechSetup(source), body=choicesFor(h)[0]; assert.equal(confirm(h,body).ok,true);
    const hook=choicesFor(h)[0];h.reviewRows[h.speechRow-1][3]='Не утверждено';h.editReview(h.speechRow,4,ROMAN);
    assert.equal(confirm(h,hook).ok,false);
    const other=speechSetup(source);const ob=choicesFor(other)[0];assert.equal(confirm(other,ob).ok,true);const oh=choicesFor(other)[0];
    other.reviewRows[1][1]='Не утверждено'; other.editReview(2,2,ROMAN);
    assert.equal(confirm(other,oh).ok,false);
  });
}
