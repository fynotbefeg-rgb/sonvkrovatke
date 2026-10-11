import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {assessEditorialRelease,requireEditorialRelease} from './editorial-release.mjs';
import {publishSharedReview} from './send-shared-review.mjs';
import {scriptHash} from './approval-manifest.mjs';
import {editorialRulesVersion,editorialRulesSha256} from './editorial-rules.mjs';
const now=Date.parse('2026-10-11T12:00:00Z');
const sha=x=>createHash('sha256').update(x).digest('hex');
const ids=['task','reference','setup','demo','claims','costs_limits','body_hooks','approval'];
function setup(t) {
 const root=mkdtempSync(join(tmpdir(),'roman-editorial-')),dir=join(root,'roman-reels/research');mkdirSync(dir,{recursive:true});t.after(()=>rmSync(root,{recursive:true,force:true}));
 const body='Учебная основа: конкретный вход, действие и результат.';
 const manifest={items:[1,2,3].map(hook_id=>({topic_id:'test',hook_id,version_id:`R-test-h${hook_id}`,script_revision:7,
   hook_text:`Хук ${hook_id}`,script_text:`Хук ${hook_id}\n\n${body}`,status:'pending_approval'})),
   source_sets:[{topic_id:'test',body_revision:7,body_text:body,body_text_hash:sha(body)}]};
 const record={url:'https://www.instagram.com/reel/TESTONLY123/',publishedAt:'2026-10-01T12:00:00Z',checkedAt:'2026-10-11T11:00:00Z',primaryCounters:{plays:200000}};
 const save=(name,value)=>{const data=JSON.stringify(value);writeFileSync(join(dir,name),data);return {path:'roman-reels/research/'+name,sha256:sha(data)};};
 const review={reviewVersion:'1.0.0',rulesVersion:editorialRulesVersion,rulesSha256:editorialRulesSha256,
   reviewer:'TEST ONLY',semanticReviewCompleted:true,romanApprovalGranted:false,
   scriptHashes:manifest.items.map(i=>({versionId:i.version_id,scriptHash:scriptHash(i)})),
   businessTask:{actor:'Владелец',input:'Учебное письмо',operation:'Записать поля',output:'Учебная карточка',extraValue:'Повторяемый перенос вместо ручного копирования'},
   reference:{platform:'instagram',inspectionMode:'frames_and_transcript',relevance:'TEST ONLY specific business process',evidence:save('reference.json',record)},
   demonstration:{status:'tested',workflowMatchesScript:true,syntheticDisclosed:true,artifacts:[save('demo.json',{testOnly:true,result:'pass'})],
    steps:[{action:'Учебный шаг',observed:'Учебный результат',verification:'Проверены поля',status:'pass'}]},
   costReview:{status:'verified',scope:'viewer_workflow',workflowMatchesScript:true,evidence:save('cost.json',{
    scope:'viewer_workflow',requiredPayment:false,trialOnly:false,testedUsage:'TEST ONLY one synthetic operation',limitations:'TEST ONLY bounded usage',
    components:['tool','model','integration','execution','data'].map(layer=>({layer,name:'TEST ONLY '+layer,access:'free',requiredPayment:false,requiredCost:0,
      checkedAt:'2026-10-11T11:00:00Z',limits:'TEST ONLY local fixture',sourceUrl:'https://example.com/pricing',sourceQuote:'TEST ONLY fictional source'}))})},
   criteria:ids.map(id=>({id,status:'pass',note:'TEST ONLY reviewer note',evidence:['test artifact']}))};
 return {root,manifest,review,record,save,options:{root,now}};
}
test('eligible review stays pending and does not grant Roman approval or production',t=>{
 const {manifest,review,options}=setup(t),before=JSON.stringify(manifest),r=requireEditorialRelease(manifest,review,options);
 assert.equal(r.eligibleForRomanReview,true);assert.equal(r.productionReady,false);assert.equal(r.romanApprovalGranted,false);
 assert.equal(r.semanticFactCheckAutomated,false);assert.equal(JSON.stringify(manifest),before);
});
test('prepared prompt, unrelated demo and failed actual step cannot pass',t=>{
 const {manifest,review,options}=setup(t);
 for(const change of [r=>r.demonstration.status='prepared',r=>r.demonstration.workflowMatchesScript=false,r=>r.demonstration.steps[0].status='failed',r=>r.demonstration.artifacts=[]]) {
  const r=structuredClone(review);change(r);assert.ok(assessEditorialRelease(manifest,r,options).blockers.some(b=>b.id==='demo'));
 }
});
test('old, unknown or future publication and stale metrics are blocked',t=>{
 const {manifest,review,record,save,options}=setup(t);
 for(const changes of [{publishedAt:'2026-02-28'},{publishedAt:null},{publishedAt:'2026-10-12'},{checkedAt:'2026-09-01'}]) {
  const r=structuredClone(review);r.reference.evidence=save('reference.json',{...record,...changes});
  assert.ok(assessEditorialRelease(manifest,r,options).blockers.some(b=>b.id==='reference'));
 }
});
test('aggregator plays, low verified views or unknown counts do not qualify',t=>{
 const {manifest,review,record,save,options}=setup(t);
 for(const changes of [{primaryCounters:null,aggregator:{plays:1000000}},{primaryCounters:{views:99999}},{primaryCounters:{reach:200000}}]) {
  const r=structuredClone(review);r.reference.evidence=save('reference.json',{...record,...changes});
  assert.ok(assessEditorialRelease(manifest,r,options).blockers.some(b=>b.id==='reference'));
 }
});
test('pending, duplicate or empty editorial criteria and missing semantic reviewer block release',t=>{
 const {manifest,review,options}=setup(t);
 for(const change of [r=>r.criteria[0].status='pending',r=>r.criteria[0].evidence=[],r=>r.criteria[0].note='',r=>r.criteria[1].id='task',r=>r.semanticReviewCompleted=false,r=>r.reviewer='']) {
  const r=structuredClone(review);change(r);assert.equal(assessEditorialRelease(manifest,r,options).eligibleForRomanReview,false);
 }
});
test('edited hook/body/revision or reused duplicate hash review cannot pass',t=>{
 const {manifest,review,options}=setup(t);
 for(const key of ['hook_text','script_text','script_revision']) {const d=structuredClone(manifest);d.items[0][key]=key==='script_revision'?8:'Новая речь';
  assert.equal(assessEditorialRelease(d,review,options).eligibleForRomanReview,false);}
 const r=structuredClone(review);r.scriptHashes[1]={...r.scriptHashes[0]};assert.equal(assessEditorialRelease(manifest,r,options).eligibleForRomanReview,false);
});
test('changed evidence bytes, traversal and symlink out of research scope fail closed',t=>{
 const {manifest,review,root,options}=setup(t);writeFileSync(join(root,'roman-reels/research/demo.json'),'changed');
 assert.ok(assessEditorialRelease(manifest,review,options).blockers.some(b=>b.id==='demo_artifact'));
 const r=structuredClone(review);r.reference.evidence.path='roman-reels/research/../../secret.json';writeFileSync(join(root,'secret.json'),'secret');
 assert.equal(assessEditorialRelease(manifest,r,options).eligibleForRomanReview,false);
 symlinkSync(join(root,'secret.json'),join(root,'roman-reels/research/escape.json'));r.reference.evidence.path='roman-reels/research/escape.json';
 assert.equal(assessEditorialRelease(manifest,r,options).eligibleForRomanReview,false);
});
test('real SEO v6 with old Cooper reference and untested Claude stays blocked',t=>{
 const {review}=setup(t),real=fileURLToPath(new URL('../../',import.meta.url));
 const d=JSON.parse(readFileSync(join(real,'roman-reels/research/site-technical-seo/reviewed-revision6.json')));
 const evidencePath='roman-reels/research/seo-reference-cooper-public-evidence.json',bytes=readFileSync(join(real,evidencePath));
 const r={...review,scriptHashes:d.items.map(i=>({versionId:i.version_id,scriptHash:scriptHash(i)})),reference:{...review.reference,evidence:{path:evidencePath,sha256:sha(bytes)}},demonstration:{status:'prepared',workflowMatchesScript:false}};
 const result=assessEditorialRelease(d,r,{root:real,now});
 assert.ok(result.blockers.some(b=>b.id==='reference'&&/older/.test(b.message)));assert.ok(result.blockers.some(b=>b.id==='demo'));assert.equal(result.eligibleForRomanReview,false);
});
test('sender refuses missing or blocked release before any Google network request',t=>{
 const {root,manifest}=setup(t),draft=join(root,'draft.json'),review=join(root,'review.json'),trace=join(root,'network'),stub=join(root,'mock.mjs');
 writeFileSync(draft,JSON.stringify(manifest));writeFileSync(review,'{}');
 writeFileSync(stub,"import {writeFileSync} from 'node:fs';globalThis.fetch=()=>{writeFileSync(process.env.TRACE,'called');throw Error('Network must not run');};");
 const cli=fileURLToPath(new URL('./send-drafts-to-sheet.mjs',import.meta.url));
 for(const args of [[draft],[draft,review]]) {const r=spawnSync(process.execPath,['--import',stub,cli,...args],{encoding:'utf8',env:{...process.env,TRACE:trace}});assert.notEqual(r.status,0);assert.equal(existsSync(trace),false);}
});
test('YouTube homepage is not a video; direct watch and Shorts are supported',t=>{
 const {manifest,review,record,save,options}=setup(t);
 for(const [url,allowed] of [['https://www.youtube.com/',false],['https://www.youtube.com/watch?v=ABCDEFGHIJK',true],['https://www.youtube.com/shorts/ABCDEFGHIJK',true]]) {
  const r=structuredClone(review);r.reference.platform='youtube';r.reference.evidence=save('reference.json',{...record,url});
  assert.equal(assessEditorialRelease(manifest,r,options).eligibleForRomanReview,allowed);
 }
});

test('shared publisher calls exactly one protected POST after release, keeps pending and fails closed on ambiguous response',async t=>{
 const {manifest,review,options}=setup(t);let calls=0;
 const opts={...options,url:'https://script.google.com/macros/s/TESTONLY/exec',token:'TEST ONLY',fetchImpl:async(url,o)=>{
  calls++;assert.equal(o.method,'POST');const body=JSON.parse(o.body);assert.equal(body.action,'add_shared_review');
  assert.equal(body.packet.bodyText,manifest.source_sets[0].body_text);assert.equal(body.packet.hooks.length,3);
  assert.equal(body.packet.approved_by,undefined);return {ok:true,text:async()=>JSON.stringify({ok:true,added:true,firstRow:2,approvalGranted:false})};
 }};
 const result=await publishSharedReview(manifest,review,'Тема',opts);assert.equal(calls,1);assert.equal(result.productionStarted,false);
 const blocked={...review,semanticReviewCompleted:false};await assert.rejects(publishSharedReview(manifest,blocked,'Тема',opts),/blocked/);assert.equal(calls,1);
 opts.fetchImpl=async()=>{calls++;throw Error('Lost reply');};await assert.rejects(publishSharedReview(manifest,review,'Тема',opts),/Lost reply/);assert.equal(calls,2);
});

test('paid, unknown, trial-only, incomplete and stale audience cost evidence blocks release',t=>{
 const {manifest,review,save,options}=setup(t);
 const original=JSON.parse(readFileSync(join(options.root,review.costReview.evidence.path),'utf8'));
 const changes=[r=>r.requiredPayment=true,r=>r.trialOnly=true,r=>r.components.pop(),r=>r.components[1].access='paid',
  r=>r.components[1].requiredCost=1,r=>r.components[1].requiredPayment=true,r=>delete r.components[1].requiredCost,
  r=>r.components[0].checkedAt='2026-08-01',r=>r.components[0].checkedAt='2026-10-12',
  r=>r.components[0].access='unknown',r=>r.components[0].sourceQuote='',r=>r.scope='factory'];
 for(const change of changes) {const record=structuredClone(original);change(record);const r=structuredClone(review);
  r.costReview.evidence=save('cost.json',record);assert.ok(assessEditorialRelease(manifest,r,options).blockers.some(b=>b.id==='costs'));}
 const missing=structuredClone(review);delete missing.costReview;assert.ok(assessEditorialRelease(manifest,missing,options).blockers.some(b=>b.id==='costs'));
});
test('free tier requires stated limits; unused layer requires an explanation',t=>{
 const {manifest,review,save,options}=setup(t),record=JSON.parse(readFileSync(join(options.root,review.costReview.evidence.path),'utf8'));
 record.components[0].access='free_tier';review.costReview.evidence=save('cost.json',record);assert.equal(assessEditorialRelease(manifest,review,options).eligibleForRomanReview,true);
 record.components[0].limits='';review.costReview.evidence=save('cost.json',record);assert.equal(assessEditorialRelease(manifest,review,options).eligibleForRomanReview,false);
 record.components[0].limits='TEST ONLY';record.components[0].access='not_required';review.costReview.evidence=save('cost.json',record);assert.equal(assessEditorialRelease(manifest,review,options).eligibleForRomanReview,false);
 record.components[0].notRequiredReason='TEST ONLY no dependency';review.costReview.evidence=save('cost.json',record);assert.equal(assessEditorialRelease(manifest,review,options).eligibleForRomanReview,true);
});
