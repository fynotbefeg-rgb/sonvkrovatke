import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {harness} from './apps-script.test.mjs';
import {readTopicSnapshot,validateTopicSnapshot,planForSelectedTopic} from './topic-selection-reader.mjs';
const packet=()=>({schemaVersion:'1.0.0',topicId:'topic-reader-test',topicText:'Технический SEO-аудит с ИИ',revision:1,
 bodyText:'Учебная основа',hooks:[{id:1,text:'Первый хук'},{id:2,text:'Второй хук'},{id:3,text:'Третий хук'}],endings:[]});
function setup(source) {const h=harness(source,{shared:true});h.properties.set('ROMAN_SHARED_REVIEW_ENABLED','true');
 assert.equal(h.post({token:'local-test-token',action:'add_shared_review',packet:packet()}).ok,true);return h;}
const snapshot=h=>h.post({token:'local-test-token',action:'get_topic_research_snapshot'});
function select(h,email){h.reviewRows[1][1]='Утверждено';h.editReview(2,2,email);}
const scope=()=>({scopeVersion:'1.0.0',topicId:packet().topicId,topicRevision:1,title:packet().topicText,
 businessTask:{actor:'Владелец',input:'URL',operation:'Проверить сайт',output:'Задачи с доказательствами'},
 focusGroups:[['SEO'],['Claude']],queries:[{platform:'instagram',query:'Claude SEO audit'}]});
const config={url:'https://script.google.com/macros/s/TEST_ONLY/exec',token:'local-test-token'};
const response=data=>new Response(JSON.stringify(data),{status:200});
async function trusted(h){const data=snapshot(h);return readTopicSnapshot({...config,fetchImpl:async()=>response(data)});}
const batch=()=>({checkedAt:new Date().toISOString(),items:[]});

test('endpoint authenticated, disabled by default, read-only and never available over GET',()=>{
 const h=harness(undefined,{shared:true});const rows=JSON.stringify(h.rows),props=JSON.stringify([...h.properties]);
 assert.equal(snapshot(h).enabled,false);assert.deepEqual(snapshot(h).topics,[]);
 assert.equal(h.post({action:'get_topic_research_snapshot'}).ok,false);
 assert.equal(JSON.parse(h.context.doGet().content).ok,false);
 assert.equal(JSON.stringify(h.rows),rows);assert.equal(JSON.stringify([...h.properties]),props);
 const absent=harness();assert.equal(snapshot(absent).ok,false);
});
test('topic selection can be read before body/hooks approval, without exposing or approving speech',()=>{
 const h=setup();select(h);const before=JSON.stringify([h.reviewRows,[...h.properties]]),r=snapshot(h);
 assert.equal(r.topics.length,1);assert.equal(r.topics[0].status,'selected_for_research');validateTopicSnapshot(r);
 assert.equal(r.productionAllowed,false);assert.equal(r.scriptApprovalGranted,false);
 assert.ok(!JSON.stringify(r).includes('Учебная основа'));assert.ok(!JSON.stringify(r).includes('Первый хук'));
 assert.equal(h.post({token:'local-test-token',action:'get_production_queue'}).items.length,0);
 assert.equal(JSON.stringify([h.reviewRows,[...h.properties]]),before);
});
test('forged decision, missing/unauthorized editor and future receipt cannot select topic',()=>{
 for(const email of [null,'','other@example.test']){const h=setup();select(h,email);assert.equal(snapshot(h).topics.length,0);}
 const h=setup();h.reviewRows[1][1]='Утверждено';assert.equal(snapshot(h).topics.length,0);
 select(h);const key='ROMAN_SHARED_RECEIPT:'+packet().topicId+':topic',receipt=JSON.parse(h.properties.get(key));
 receipt.approvedAt='2999-01-01T00:00:00Z';h.properties.set(key,JSON.stringify(receipt));assert.equal(snapshot(h).topics.length,0);
});
test('current rejection, changed text, formulas and revoked approver block snapshot before trigger',()=>{
 for(const change of [h=>h.reviewRows[1][1]='Не утверждено',h=>h.reviewRows[1][0]='Другая тема',
  h=>h.reviewRows[1][2]='Изменённая основа',h=>h.reviewRows[1][1]='=BAD()',h=>h.properties.set('ROMAN_APPROVER_EMAILS','other@example.test')]) {
  const h=setup();select(h);change(h);assert.equal(snapshot(h).topics.length,0);
 }
});
test('new registered packet revision cannot reuse old topic receipt',()=>{
 const h=setup();select(h);assert.equal(snapshot(h).topics.length,1);
 const p={...packet(),revision:2};assert.equal(h.post({token:'local-test-token',action:'add_shared_review',packet:p}).ok,true);
 assert.equal(snapshot(h).topics.length,0);
});
test('generated additive installer exposes same authenticated read-only endpoint',()=>{
 const h=setup(readFileSync(new URL('../apps-script/RomanApproval.gs',import.meta.url),'utf8'));select(h);assert.equal(snapshot(h).topics.length,1);
});
test('only live transport object can bind narrow plan; saved/copy/modified snapshot cannot grant authority',async()=>{
 const h=setup();select(h);const s=await trusted(h);const r=planForSelectedTopic(scope(),batch(),s);
 assert.equal(r.topicSelectionVerification,'authenticated_live_snapshot');assert.equal(r.topicApprovalVerificationRequired,false);
 assert.equal(r.networkExecutionAllowed,false);assert.equal(r.geminiGenerationAllowed,false);assert.equal(r.productionReady,false);
 assert.throws(()=>planForSelectedTopic(scope(),batch(),structuredClone(s)),/Live authenticated/);
 assert.throws(()=>planForSelectedTopic(scope(),batch(),snapshot(h)),/Live authenticated/);
 s.topics[0].topicText='Changed';assert.throws(()=>planForSelectedTopic(scope(),batch(),s),/Live authenticated/);
});
test('stale, duplicate, changed hash and production-enabled snapshot responses rejected',async()=>{
 const h=setup();select(h);const original=snapshot(h);
 for(const edit of [s=>s.capturedAt='2020-01-01',s=>s.capturedAt='2999-01-01',s=>s.topics.push(s.topics[0]),
  s=>s.topics[0].topicHash='0'.repeat(64),s=>s.productionAllowed=true,s=>s.scriptApprovalGranted=true,s=>s.enabled=false,s=>s.extra='unsupported']) {
  const data=structuredClone(original);edit(data);await assert.rejects(readTopicSnapshot({...config,fetchImpl:async()=>response(data)}));
 }
});
test('fresh live rejection and exact-title mismatch stop planning',async()=>{
 const h=setup();select(h);const s=await trusted(h);assert.throws(()=>planForSelectedTopic({...scope(),title:'Other'},batch(),s),/not selected/);
 assert.throws(()=>planForSelectedTopic(scope(),batch(),s,{now:Date.parse(s.capturedAt)+300001}),/Current/);
 h.reviewRows[1][1]='Не утверждено';const rejected=await trusted(h);assert.throws(()=>planForSelectedTopic(scope(),batch(),rejected),/not selected/);
});
test('Apps Script response redirect uses GET without token or original POST body',async()=>{
 const h=setup();select(h);const calls=[];
 const s=await readTopicSnapshot({...config,fetchImpl:async(url,options)=>{calls.push({url,options});
  return calls.length===1?new Response(null,{status:302,headers:{location:'https://script.googleusercontent.com/macros/echo?user_content_key=TEST_ONLY'}}):response(snapshot(h));}});
 assert.equal(s.topics.length,1);assert.equal(calls.length,2);assert.equal(JSON.parse(calls[0].options.body).action,'get_topic_research_snapshot');
 assert.equal(calls[1].options.method,'GET');assert.equal(calls[1].options.body,undefined);assert.equal(calls[1].options.headers,undefined);
 assert.ok(!calls[1].url.includes(config.token));
});
test('off-host and method-preserving redirects are rejected without token forwarding/retry',async()=>{
 for(const [status,location] of [[302,'https://evil.example/macros/echo'],[302,'https://accounts.google.com/login'],[307,'https://script.googleusercontent.com/macros/echo'],[302,'https://script.googleusercontent.com/macros/echo?token=local-test-token']]) {
  let calls=0;await assert.rejects(readTopicSnapshot({...config,fetchImpl:async()=>{calls++;return new Response(null,{status,headers:{location}});}}));assert.equal(calls,1);
 }
});
test('bad configuration rejected before HTTP; provider errors are redacted and never retried',async()=>{
 let calls=0;for(const changes of [{url:'https://evil.example/'},{token:''},{token:'secret\nvalue'}]){
  await assert.rejects(readTopicSnapshot({...config,...changes,fetchImpl:async()=>{calls++;throw Error();}}));}
 assert.equal(calls,0);
 await assert.rejects(readTopicSnapshot({...config,fetchImpl:async()=>{calls++;return response({ok:false,error:config.token});}}),error=>!error.message.includes(config.token));assert.equal(calls,1);
});

test('snapshot contract cannot become a production manifest and client rejects invalid clocks',()=>{
 const h=setup();select(h);const s=snapshot(h);
 assert.throws(()=>validateTopicSnapshot(s,{now:NaN}));
 assert.equal(s.topics[0].script_text,undefined);assert.equal(s.topics[0].version_id,undefined);
 const schema=JSON.parse(readFileSync(new URL('../schemas/topic-research-snapshot-v1.schema.json',import.meta.url)));
 assert.equal(schema.properties.productionAllowed.const,false);assert.equal(schema.properties.scriptApprovalGranted.const,false);
});

test('opt-in CLI and existing-output guard stop before any webhook HTTP request',t=>{
 const dir=mkdtempSync(join(tmpdir(),'roman-topic-reader-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const input=join(dir,'scope.json'),metadata=join(dir,'batch.json'),output=join(dir,'plan.json'),trace=join(dir,'network'),stub=join(dir,'mock.mjs');
 writeFileSync(input,JSON.stringify(scope()));writeFileSync(metadata,JSON.stringify(batch()));
 writeFileSync(stub,"import {writeFileSync} from 'node:fs';globalThis.fetch=()=>{writeFileSync(process.env.TRACE,'called');throw Error('Network must not run');};");
 const cli=fileURLToPath(new URL('./plan-selected-topic-research.mjs',import.meta.url));
 for(const [enabled,exists] of [['false',false],['true',true]]) {
  if(exists)writeFileSync(output,'original');
  const r=spawnSync(process.execPath,['--import',stub,cli,input,metadata,output],{encoding:'utf8',env:{...process.env,TRACE:trace,ROMAN_TOPIC_READ_ENABLED:enabled}});
  assert.notEqual(r.status,0);assert.equal(existsSync(trace),false);if(exists)assert.equal(readFileSync(output,'utf8'),'original');
 }
});
