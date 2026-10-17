import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness} from './apps-script.test.mjs';
import {validateTopicSnapshot} from './topic-selection-reader.mjs';
const token='local-test-token';
const packet=()=>({schemaVersion:'1.0.0',topicId:'topic-first-test',topicText:'Автоматизация проверки сайта',revision:1,
 analysis:'Учебный анализ, не реальный референс',statistics:'Учебные данные: просмотры неизвестны',referenceUrl:'https://www.instagram.com/reel/testExample/'});
function setup(source) {const h=harness(source,{shared:true});h.properties.set('ROMAN_SHARED_REVIEW_ENABLED','true');return h;}
const post=(h,p=packet())=>h.post({token,action:'add_topic_review',packet:p});
const snapshot=h=>h.post({token,action:'get_topic_research_snapshot'});
const queue=h=>h.post({token,action:'get_production_queue'});
function approve(h,row=2,email) {h.reviewRows[row-1][1]='Утверждено';h.editReview(row,2,email);}
const speech=()=>({schemaVersion:'1.0.0',topicId:packet().topicId,topicText:packet().topicText,revision:1,
 bodyText:'Проверяем сайт и показываем подтверждённый результат.',hooks:[{id:1,text:'Хук один'},{id:2,text:'Хук два'},{id:3,text:'Хук три'}],endings:[]});
test('topic-only registration is token protected, opt-in and creates no fake speech',()=>{
 const h=harness(undefined,{shared:true});assert.equal(post(h).ok,false);
 h.properties.set('ROMAN_SHARED_REVIEW_ENABLED','true');
 assert.equal(h.post({action:'add_topic_review',packet:packet()}).ok,false);
 const before=JSON.stringify(h.rows);const r=post(h);assert.equal(r.ok,true);assert.equal(r.rows,1);
 assert.equal(h.reviewRows.length,2);assert.deepEqual(h.reviewRows[1].slice(0,4),[packet().topicText,'','','']);
 assert.equal(JSON.stringify(h.rows),before);assert.equal(queue(h).items.length,0);
 assert.equal([...h.properties.keys()].some(k=>k.startsWith('ROMAN_TOPIC_ONLY_RECEIPT:')),false);
});
test('real trusted topic choice is readable before any scripts and cannot enter production',()=>{
 const h=setup();post(h);approve(h);const s=snapshot(h);validateTopicSnapshot(s);
 assert.equal(s.topics.length,1);assert.equal(s.topics[0].topicText,packet().topicText);
 assert.equal(s.scriptApprovalGranted,false);assert.equal(s.productionAllowed,false);assert.equal(queue(h).items.length,0);
 assert.equal(JSON.stringify(h.reviewRows).includes('Хук'),false);
});
test('forged dropdown, unknown or absent editor, wrong sheet and future receipt do not select',()=>{
 for(const email of [null,'stranger@example.test']) {const h=setup();post(h);approve(h,2,email);assert.equal(snapshot(h).topics.length,0);}
 const h=setup();post(h);h.reviewRows[1][1]='Утверждено';assert.equal(snapshot(h).topics.length,0);
 h.editReview(2,2,undefined,{sheetId:'other'});assert.equal(snapshot(h).topics.length,0);
 approve(h);const key='ROMAN_TOPIC_ONLY_RECEIPT:'+packet().topicId;const receipt=JSON.parse(h.properties.get(key));
 receipt.approvedAt='2999-01-01T00:00:00Z';h.properties.set(key,JSON.stringify(receipt));assert.equal(snapshot(h).topics.length,0);
});
test('rejection, changed title, formulas, inserted speech and revoked approver block immediately',()=>{
 for(const change of [h=>h.reviewRows[1][1]='Не утверждено',h=>h.reviewRows[1][0]='Иная тема',
  h=>h.reviewRows[1][0]='=BAD()',h=>h.reviewRows[1][2]='Вставленная основа',h=>h.reviewRows[1][3]='Утверждено',
  h=>h.properties.set('ROMAN_APPROVER_EMAILS','other@example.test')]) {
  const h=setup();post(h);approve(h);change(h);assert.equal(snapshot(h).topics.length,0);assert.equal(queue(h).items.length,0);
 }
});
test('topic edits revoke irreversibly; bulk approvals never grant; metadata edits preserve choice',()=>{
 const h=setup();post(h);approve(h);h.reviewRows[1][0]='Иная тема';h.editReview(2,1);
 h.reviewRows[1][0]=packet().topicText;h.reviewRows[1][1]='Утверждено';assert.equal(snapshot(h).topics.length,0);
 h.editReview(2,1,undefined,{numColumns:2});assert.equal(snapshot(h).topics.length,0);
 approve(h);h.reviewRows[1][4]='Уточнение анализа';h.editReview(2,5);assert.equal(snapshot(h).topics.length,1);
});
test('retry is append-idempotent; revision change preserves history and resets choice',()=>{
 const h=setup();post(h);approve(h);assert.equal(post(h).added,false);assert.equal(h.reviewRows.length,2);
 const changed={...packet(),topicText:'Новая тема'};assert.equal(post(h,changed).ok,false);
 changed.revision=2;assert.equal(post(h,changed).firstRow,3);assert.equal(h.reviewRows[1][0],packet().topicText);
 assert.equal(snapshot(h).topics.length,0);approve(h,2);assert.equal(snapshot(h).topics.length,0);
 approve(h,3);assert.equal(snapshot(h).topics[0].reviewRevision,2);
});
test('invalid and oversized topic packets stop before writes',()=>{
 for(const invalid of [{topicId:'bad id'},{topicId:'x'.repeat(101)},{revision:0},{topicText:'=BAD()'},{analysis:''},
  {statistics:'x'.repeat(9000)},{referenceUrl:'http://example.test'},{bodyText:'fake'},{approvalGranted:true}]) {
  const h=setup();assert.equal(post(h,{...packet(),...invalid}).ok,false);assert.equal(h.reviewRows.length,1);
 }
});
test('incomplete topic registration cannot be silently retried',()=>{
 const h=setup();post(h);h.reviewRows[1][2]='Partial failure';assert.equal(post(h).ok,false);assert.equal(h.reviewRows.length,2);
});
test('ordinary and platform legacy receipts cannot bypass topic-only choice or disabled flag',()=>{
 for(const suffix of ['', '-instagram','-tiktok']) {
  const h=setup();post(h);const row=h.rows[1];row[0]=packet().topicId+suffix;row[2]='R-'+row[0]+'-h1';row[6]='Утверждено';h.edit(7);
  assert.ok(h.properties.has('ROMAN_APPROVAL:'+row[2]));assert.equal(queue(h).items.length,0);
  approve(h);assert.equal(queue(h).items.length,0);h.properties.set('ROMAN_SHARED_REVIEW_ENABLED','false');assert.equal(queue(h).items.length,0);
 }
});
test('speech transition requires current exact topic and preserves only its original receipt',()=>{
 const h=setup();post(h);assert.equal(h.post({token,action:'add_shared_review',packet:speech()}).ok,false);
 approve(h);const before=snapshot(h).topics[0];
 assert.equal(h.post({token,action:'add_shared_review',packet:{...speech(),topicText:'Другая тема'}}).ok,false);
 const r=h.post({token,action:'add_shared_review',packet:speech()});assert.equal(r.ok,true);assert.equal(r.firstRow,3);
 const inherited=JSON.parse(h.properties.get('ROMAN_SHARED_RECEIPT:'+packet().topicId+':topic'));
 assert.equal(inherited.hash,before.topicHash);assert.equal(inherited.approvedAt,before.approvedAt);
 assert.equal(h.reviewRows[2][1],'Утверждено');assert.equal(h.reviewRows[2][3],'');
 assert.equal(queue(h).items.length,0);assert.equal(snapshot(h).topics.length,1);
 h.reviewRows[2][3]='Утверждено';h.editReview(3,4);h.reviewRows[3][3]='Утверждено';h.editReview(4,4);
 assert.equal(queue(h).items.length,1);
 h.reviewRows[1][1]='Не утверждено';assert.equal(queue(h).items.length,0);
});
test('new topic revision blocks old speech even before edit triggers; old shared topics are not auto-migrated',()=>{
 const h=setup();post(h);approve(h);h.post({token,action:'add_shared_review',packet:speech()});
 h.reviewRows[2][3]='Утверждено';h.editReview(3,4);h.reviewRows[3][3]='Утверждено';h.editReview(4,4);assert.equal(queue(h).items.length,1);
 assert.equal(post(h,{...packet(),revision:2}).ok,true);assert.equal(queue(h).items.length,0);
 approve(h,7);assert.equal(queue(h).items.length,0);
 const other=setup();other.post({token,action:'add_shared_review',packet:speech()});
 assert.equal(post(other).ok,false);
});
test('generated additive installer exposes topic registration with the same gates',()=>{
 const h=setup(readFileSync(new URL('../apps-script/RomanApproval.gs',import.meta.url),'utf8'));
 assert.equal(post(h).ok,true);approve(h);assert.equal(snapshot(h).topics.length,1);assert.equal(queue(h).items.length,0);
});
test('unrelated genuine legacy approvals survive registering a new research topic',()=>{
 const h=setup();h.rows[1][6]='Утверждено';h.edit(7);
 const before=queue(h);assert.equal(before.items.length,1);
 post(h);assert.deepEqual(queue(h),before);
});
test('disabled snapshot is unchanged and malformed registry cannot become a selected topic',()=>{
 const h=setup();post(h);approve(h);h.properties.set('ROMAN_SHARED_REVIEW_ENABLED','false');
 assert.equal(snapshot(h).enabled,false);assert.deepEqual(snapshot(h).topics,[]);
 h.properties.set('ROMAN_SHARED_REVIEW_ENABLED','true');
 const key='ROMAN_TOPIC_ONLY_REVIEW:'+packet().topicId;
 const c=JSON.parse(h.properties.get(key));c.firstRow=1;h.properties.set(key,JSON.stringify(c));
 assert.equal(snapshot(h).ok,false);assert.equal(queue(h).ok,false);
});
