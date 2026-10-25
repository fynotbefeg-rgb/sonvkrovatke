import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness} from './apps-script.test.mjs';
import {validateManifest, scriptHash} from './approval-manifest.mjs';
import {ProductionQueue} from './production-queue.mjs';
const packet = () => ({schemaVersion:'1.0.0',topicId:'review-test',topicText:'ИИ для бизнеса',revision:1,
  bodyText:'Точная общая основа 👀',hooks:[{id:3,text:'Третий хук'},{id:1,text:'Первый хук'},{id:2,text:'Второй хук'}],endings:[]});
function setup(options={}) {
 const h=harness(options.source,{shared:true});h.properties.set('ROMAN_SHARED_REVIEW_ENABLED','true');
 const p=packet();const r=h.post({token:'local-test-token',action:'add_shared_review',packet:p});
 assert.equal(r.ok,true);assert.equal(r.firstRow,2);return {...h,p};
}
const queue=h=>h.post({token:'local-test-token',action:'get_production_queue'});
function approve(h,row,column,email) {h.reviewRows[row-1][column-1]='Утверждено';h.editReview(row,column,email);}
function approveAll(h) {approve(h,2,2);approve(h,2,4);for(let r=3;r<=5;r++)approve(h,r,4);}

test('shared review disabled by default, token mandatory, no existing rows or approvals changed',()=>{
 const h=harness(undefined,{shared:true});const old=JSON.stringify(h.rows);
 assert.equal(h.post({token:'local-test-token',action:'add_shared_review',packet:packet()}).ok,false);
 h.properties.set('ROMAN_SHARED_REVIEW_ENABLED','true');
 assert.equal(h.post({action:'add_shared_review',packet:packet()}).ok,false);
 assert.equal(JSON.stringify(h.rows),old);assert.equal(h.reviewRows.length,1);
});
test('append four review rows with one body and sorted hooks; retry never appends or grants approval',()=>{
 const h=setup();assert.equal(h.reviewRows.length,5);assert.equal(h.reviewRows[1][2],h.p.bodyText);
 assert.deepEqual(h.reviewRows.slice(2).map(r=>r[2]),['Первый хук','Второй хук','Третий хук']);
 const retry=h.post({token:'local-test-token',action:'add_shared_review',packet:h.p});
 assert.equal(retry.added,false);assert.equal(h.reviewRows.length,5);assert.equal(queue(h).items.length,0);
});
test('topic or hooks alone cannot approve body; only selected approved hook produces exact full script',()=>{
 const h=setup();approve(h,2,2);approve(h,3,4);assert.equal(queue(h).items.length,0);
 approve(h,2,4);const result=queue(h);assert.equal(result.items.length,1);validateManifest(result);
 assert.equal(result.items[0].hook_id,1);assert.equal(result.items[0].script_text,'Первый хук\n\n'+h.p.bodyText);
 assert.equal(result.items[0].script_hash,scriptHash(result.items[0]));
});
test('all three hooks share one exact body; queue button deduplicates and rechecks live body rejection',()=>{
 const h=setup();approveAll(h);const current=queue(h);assert.equal(current.items.length,3);validateManifest(current);
 const q=new ProductionQueue(':memory:');try {
  const ids=current.items.map(i=>i.version_id),ticket=q.createTicket(current,ids,'123');
  assert.equal(q.startTicket(ticket.ticket_id,'a','123',queue(h)).created,3);
  assert.equal(q.startTicket(ticket.ticket_id,'b','123',queue(h)).created,0);
  h.reviewRows[1][3]='Не утверждено'; // Even before delayed edit trigger, dropdown rejection blocks.
  assert.equal(queue(h).items.length,0);
  assert.throws(()=>q.startTicket(ticket.ticket_id,'c','123',queue(h)),/revoked/);
  assert.equal(q.countJobs(),3);
 } finally {q.close();}
});
test('missing, unauthorized or revoked editor identity and forged dropdown cannot approve',()=>{
 for(const email of [null,'','other@example.test']) {
  const h=setup();approve(h,2,2);approve(h,2,4);approve(h,3,4,email);assert.equal(queue(h).items.length,0);assert.equal(h.reviewRows[2][3],'');
 }
 const h=setup();for(const row of h.reviewRows.slice(1))row[3]='Утверждено';h.reviewRows[1][1]='Утверждено';
 assert.equal(queue(h).items.length,0);approveAll(h);h.properties.set('ROMAN_APPROVER_EMAILS','other@example.test');
 assert.equal(queue(h).items.length,0);
});
test('body text and formula changes block every variant immediately; edit revoke survives restoring old text',()=>{
 for(const changed of ['Новая основа','=IMPORTXML("https://example.test","x")']) {
  const h=setup();approveAll(h);h.reviewRows[1][2]=changed;assert.equal(queue(h).items.length,0);
  h.editReview(2,3);h.reviewRows[1][2]=h.p.bodyText;assert.equal(queue(h).items.length,0);
 }
});
test('rejecting one hook blocks only its variant; bulk decision paste never creates receipts',()=>{
 const h=setup();approveAll(h);h.reviewRows[3][3]='Не утверждено';h.editReview(4,4);
 assert.deepEqual(queue(h).items.map(i=>i.hook_id),[1,3]);
 for(let r=3;r<=5;r++)h.reviewRows[r-1][3]='Утверждено';h.editReview(3,4,undefined,{numRows:3});
 assert.equal(queue(h).items.length,0);
});
test('analysis/statistics/link edits preserve receipts; wrong spreadsheet event cannot grant approval',()=>{
 const h=setup();approveAll(h);h.reviewRows[1][4]='Новое исследование';h.editReview(2,5);
 assert.equal(queue(h).items.length,3);
 const other=setup();other.reviewRows[1][1]='Утверждено';other.editReview(2,2,undefined,{sheetId:'other'});
 approve(other,2,4);approve(other,3,4);assert.equal(queue(other).items.length,0);
});
test('new revision appends history, resets receipts and blocks old ticket even after reapproval',()=>{
 const h=setup();approveAll(h);const old=queue(h);const q=new ProductionQueue(':memory:');
 try {
  const ticket=q.createTicket(old,[old.items[0].version_id],'123');
  const changed={...h.p,bodyText:'Новая основа',revision:1};
  assert.equal(h.post({token:'local-test-token',action:'add_shared_review',packet:changed}).ok,false);
  changed.revision=2;assert.equal(h.post({token:'local-test-token',action:'add_shared_review',packet:changed}).firstRow,6);
  assert.equal(h.reviewRows[1][2],h.p.bodyText);assert.equal(queue(h).items.length,0);
  approve(h,6,2);approve(h,6,4);approve(h,7,4);
  assert.throws(()=>q.startTicket(ticket.ticket_id,'new','123',queue(h)),/changed/);
 } finally {q.close();}
});
test('managed simple review blocks legacy canonical receipt bypass',()=>{
 const h=setup();const old=h.rows[1];old[0]=h.p.topicId;old[2]='R-'+h.p.topicId+'-h1';old[6]='Утверждено';h.edit(7);
 assert.ok(h.properties.has('ROMAN_APPROVAL:'+old[2]));assert.equal(queue(h).items.length,0);
});
test('platform endings are displayed for body approval and included exactly in six canonical scripts',()=>{
 const h=setup();const p={...h.p,revision:2,endings:[{platform:'instagram',text:'Напиши САЙТ в комментариях.'},{platform:'tiktok',text:'Напиши САЙТ в личные сообщения.'}]};
 const r=h.post({token:'local-test-token',action:'add_shared_review',packet:p});assert.equal(r.ok,true);
 assert.ok(h.reviewRows[5][2].includes(p.endings[1].text));approve(h,6,2);approve(h,6,4);for(let row=7;row<=9;row++)approve(h,row,4);
 const current=queue(h);assert.equal(current.items.length,6);validateManifest(current);
 for(const item of current.items)assert.ok(item.script_text.endsWith(p.endings.find(e=>item.topic_id.endsWith(e.platform)).text));
});
test('malformed hooks, unsupported endings, oversized packet, formula-like speech rejected before append',()=>{
 const examples=[{hooks:[{id:1,text:'a'},{id:1,text:'b'},{id:3,text:'c'}]},{hooks:[{id:1,text:'a'},{id:2,text:'A'},{id:3,text:'c'}]},
  {bodyText:'=BAD()'},{approvalGranted:true},{bodyText:'x'.repeat(9000)},{topicId:123},{endings:[{platform:'tiktok',text:'Напиши в комментариях'}]}];
 for(const invalid of examples) {const h=harness(undefined,{shared:true});h.properties.set('ROMAN_SHARED_REVIEW_ENABLED','true');
  assert.equal(h.post({token:'local-test-token',action:'add_shared_review',packet:{...packet(),...invalid}}).ok,false);assert.equal(h.reviewRows.length,1);}
});
test('updated additive installer works with shared module, not only full Code.gs',()=>{
 const h=setup({source:readFileSync(new URL('../apps-script/RomanApproval.gs',import.meta.url),'utf8')});
 approveAll(h);validateManifest(queue(h));assert.equal(queue(h).items.length,3);
});

test('disabling the feature pauses managed approvals instead of restoring old canonical receipts',()=>{
 const h=setup();const old=h.rows[1];old[0]=h.p.topicId;old[2]='R-'+h.p.topicId+'-h1';old[6]='Утверждено';h.edit(7);
 approveAll(h);assert.equal(queue(h).items.length,3);h.properties.set('ROMAN_SHARED_REVIEW_ENABLED','false');
 assert.equal(queue(h).items.length,0);
});
test('incomplete or edited registration cannot be silently accepted by a repeat POST',()=>{
 const h=setup();h.reviewRows[1][2]='Частичная запись';
 assert.equal(h.post({token:'local-test-token',action:'add_shared_review',packet:h.p}).ok,false);
 assert.equal(h.reviewRows.length,5);assert.equal(queue(h).items.length,0);
});
