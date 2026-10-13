import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness} from './apps-script.test.mjs';
import {readReviewStatuses,validateReviewStatusSnapshot} from './review-status-reader.mjs';
import {ProductionQueue} from './production-queue.mjs';

const action='get_review_status_snapshot';
const packet=()=>({schemaVersion:'1.0.0',topicId:'status-test',topicText:'Автоматизация бизнеса',revision:1,bodyText:'PRIVATE BODY',
 hooks:[{id:1,text:'PRIVATE HOOK ONE'},{id:2,text:'PRIVATE HOOK TWO'},{id:3,text:'PRIVATE HOOK THREE'}],endings:[]});
const topic=()=>({schemaVersion:'1.0.0',topicId:'status-test',topicText:'Автоматизация бизнеса',revision:1,analysis:'PRIVATE ANALYSIS',statistics:'PRIVATE STATS',referenceUrl:'https://example.test/ref'});
const snapshot=h=>h.post({token:'local-test-token',action});
function setup(source){const h=harness(source,{shared:true});h.properties.set('ROMAN_SHARED_REVIEW_ENABLED','true');assert.equal(h.post({token:'local-test-token',action:'add_shared_review',packet:packet()}).ok,true);return h;}
function approve(h,row,col){h.reviewRows[row-1][col-1]='Утверждено';h.editReview(row,col);}

test('status requires token and disabled feature gives explicit paused view without writes',()=>{
 const h=harness(undefined,{shared:true});assert.equal(h.post({action}).ok,false);
 const before=JSON.stringify([h.rows,h.reviewRows,[...h.properties]]),s=snapshot(h);
 validateReviewStatusSnapshot(s);assert.equal(s.enabled,false);assert.deepEqual(s.topics,[]);
 assert.equal(JSON.stringify([h.rows,h.reviewRows,[...h.properties]]),before);
});
test('pending/approved/negative/unverified components shown separately, not inferred from empty production',()=>{
 const h=setup();approve(h,2,2);approve(h,2,4);approve(h,3,4);
 h.reviewRows[3][3]='Не утверждено';h.reviewRows[4][3]='Утверждено';
 const before=JSON.stringify([h.rows,h.reviewRows,[...h.properties]]),s=snapshot(h);validateReviewStatusSnapshot(s);
 assert.deepEqual(s.topics[0].components,{topic:'approved',body:'approved',hook1:'approved',hook2:'not_approved',hook3:'unverified'});
 assert.equal(JSON.stringify([h.rows,h.reviewRows,[...h.properties]]),before);
 assert.equal(s.productionAllowed,false);assert.ok(!JSON.stringify(s).includes('PRIVATE')&&!JSON.stringify(s).includes('roman@example.test'));
});
test('changed text/formula or deauthorized/future approval cannot display approved',()=>{
 for(const change of ['text','formula','approver','future']){
  const h=setup();approve(h,2,2);approve(h,2,4);approve(h,3,4);
  if(change==='text')h.reviewRows[2][2]='Edited hook';
  if(change==='formula')h.reviewRows[2][2]='=BAD()';
  if(change==='approver')h.properties.set('ROMAN_APPROVER_EMAILS','other@example.test');
  if(change==='future'){const key='ROMAN_SHARED_RECEIPT:status-test:body',r=JSON.parse(h.properties.get(key));r.approvedAt=new Date(Date.now()+60000).toISOString();h.properties.set(key,JSON.stringify(r));}
  const s=snapshot(h);validateReviewStatusSnapshot(s);
  assert.equal(s.topics[0].components.body,['text','formula'].includes(change)?'binding_changed':'unverified');
 }
});
test('topic-only view and new revision do not borrow old body/hook approvals',()=>{
 const h=harness(undefined,{shared:true});h.properties.set('ROMAN_SHARED_REVIEW_ENABLED','true');
 assert.equal(h.post({token:'local-test-token',action:'add_topic_review',packet:topic()}).ok,true);
 assert.equal(snapshot(h).topics[0].components.body,'not_created');approve(h,2,2);
 assert.equal(h.post({token:'local-test-token',action:'add_shared_review',packet:packet()}).ok,true);
 approve(h,3,4);approve(h,4,4);approve(h,5,4);approve(h,6,4);
 assert.equal(snapshot(h).topics[0].kind,'shared');
 const newer={...topic(),revision:2,topicText:'Новая тема'};
 assert.equal(h.post({token:'local-test-token',action:'add_topic_review',packet:newer}).ok,true);
 const s=snapshot(h);validateReviewStatusSnapshot(s);assert.equal(s.topics.length,1);
 assert.equal(s.topics[0].reviewRevision,2);assert.equal(s.topics[0].components.body,'not_created');assert.equal(s.topics[0].components.topic,'pending');
});
test('standalone topic revocation overrides copied shared topic approval; status is never ticket authority',()=>{
 const h=harness(undefined,{shared:true});h.properties.set('ROMAN_SHARED_REVIEW_ENABLED','true');
 h.post({token:'local-test-token',action:'add_topic_review',packet:topic()});approve(h,2,2);
 h.post({token:'local-test-token',action:'add_shared_review',packet:packet()});approve(h,3,4);approve(h,4,4);approve(h,5,4);approve(h,6,4);
 h.reviewRows[1][1]='Не утверждено';const s=snapshot(h);
 assert.equal(s.topics[0].components.topic,'not_approved');assert.equal(s.topics[0].components.body,'approved');
 assert.equal(h.post({token:'local-test-token',action:'get_production_queue'}).items.length,0);
 const q=new ProductionQueue(':memory:');try{assert.throws(()=>q.createTicket(s,['R-status-test-h1'],'123'),/items array/);}finally{q.close();}
});
test('addon wrapper exposes same endpoint; protected reader follows only response GET without secret forwarding',async()=>{
 const source=readFileSync(new URL('../apps-script/RomanApproval.gs',import.meta.url),'utf8'),h=setup(source),s=snapshot(h),calls=[];
 const result=await readReviewStatuses({url:'https://script.google.com/macros/s/offline/exec',token:'local-test-token',fetchImpl:async(url,options)=>{
  calls.push({url,options});return calls.length===1?new Response('',{status:302,headers:{location:'https://script.googleusercontent.com/macros/echo?k=offline'}}):new Response(JSON.stringify(s));
 }});
 assert.deepEqual(result,s);assert.equal(calls[1].options.method,'GET');assert.equal(calls[1].options.body,undefined);
 assert.equal(calls[1].options.headers,undefined);assert.equal(JSON.parse(calls[0].options.body).action,action);
});
test('reader rejects stale/future/invalid permission metadata, duplicate topics, unknown states and extra private fields',()=>{
 const base=snapshot(setup());
 for(const bad of [{...base,productionAllowed:true},{...base,capturedAt:new Date(Date.now()-400000).toISOString()},
  {...base,capturedAt:new Date(Date.now()+60000).toISOString()}, {...base,topics:[base.topics[0],base.topics[0]]},
  {...base,topics:[{...base.topics[0],components:{...base.topics[0].components,topic:'rejected'}}]},
  {...base,privateToken:'bad'}, {...base,enabled:false}])assert.throws(()=>validateReviewStatusSnapshot(bad));
});
test('reader blocks foreign redirects, malformed/oversized/error responses without retry or leaking secrets',async()=>{
 const choices=[()=>new Response('',{status:302,headers:{location:'https://example.test/echo'}}),()=>new Response('x'.repeat(200001)),
  ()=>new Response('broken'),()=>new Response('{}',{status:403}),()=>{throw Error('local-test-token')}];
 for(const reply of choices){let calls=0;await assert.rejects(readReviewStatuses({url:'https://script.google.com/macros/s/offline/exec',token:'local-test-token',
  fetchImpl:async()=>{calls++;return reply();}}),e=>!e.message.includes('local-test-token'));assert.equal(calls,1);}
});
