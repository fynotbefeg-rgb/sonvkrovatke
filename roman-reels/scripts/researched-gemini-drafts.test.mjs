import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {researchPrompt,researchedDrafts} from './researched-gemini-drafts.mjs';
import {analyzeDemo} from './prepare-seo-research-demo.mjs';
import {scriptHash,validateManifest} from './approval-manifest.mjs';
import {editorialRules,editorialRulesVersion,editorialRulesSha256} from './editorial-rules.mjs';
const briefPath=fileURLToPath(new URL('../research/gemini-revision-seo/brief-v2.json',import.meta.url));
const brief=JSON.parse(readFileSync(briefPath));
const answer=()=>({body_text:'Учебный пример '+Array.from({length:100},(_,i)=>`Слово${i}`).join(' '),
 hooks:[1,2,3].map(hook_id=>({hook_id,hook_text:`Хук ${hook_id}`})),evidence_ids:['google-seo'],limitations:['Нет измеренного роста.']});
test('reproducible demo selects one page and computes CTR, not an AI result',()=>{
 const input=JSON.parse(readFileSync(new URL('../research/gemini-revision-seo/search-console-demo.json',import.meta.url)));
 const result=analyzeDemo(input);assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].ctrPercent,1);
 assert.equal(result.candidates[0].position,4.8);assert.throws(()=>analyzeDemo({...input,synthetic:false}));
});
test('prompt carries feedback, sources, comparisons and explicit demo limitations',()=>{
 const prompt=researchPrompt(brief);assert.ok(prompt.includes(brief.romanFeedback));assert.ok(prompt.includes(brief.demo.inputSha256));
 for(const change of [b=>{b.sources=[]},b=>{b.demo.synthetic=false},b=>{b.alternatives=[]},b=>{b.scriptRevision=1}]){
  const b=structuredClone(brief);change(b);assert.throws(()=>researchPrompt(b));
 }
});
test('new revision stays pending and changes full approval hashes without mutating old versions',()=>{
 const result=researchedDrafts(brief,answer());validateManifest(result);
 assert.equal(result.items.length,3);assert.equal(result.source_sets[0].body_revision,2);
 for(const item of result.items){assert.equal(item.script_revision,2);assert.equal(item.status,'pending_approval');
  assert.equal(item.approved_by,undefined);assert.notEqual(item.script_hash,scriptHash({...item,script_revision:1}));}
 assert.equal(result.productionReady,false);assert.equal(result.editorialReviewRequired,true);
 assert.equal(result.provenance.clientCaseTested,false);
});
test('insufficient evidence, invented citations and hidden synthetic examples fail closed',()=>{
 for(const change of [a=>{a.insufficient_evidence=true},a=>{a.evidence_ids=['invented']},a=>{a.limitations=[]},a=>{a.body_text=a.body_text.replace('Учебный','Настоящий')}]){
  const a=answer();change(a);assert.throws(()=>researchedDrafts(brief,a));
 }
});
test('CLI refuses unapproved calls and makes exactly one generation POST without retry or Sheet send',()=>{
 const dir=mkdtempSync(join(tmpdir(),'roman-gemini-test-'));
 try{
  const stub=join(dir,'mock.mjs'),trace=join(dir,'trace.json'),output=join(dir,'draft.json');
  writeFileSync(stub,`import {writeFileSync} from 'node:fs';const calls=[];globalThis.fetch=async(url,options={})=>{calls.push({url,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});writeFileSync(process.env.TEST_TRACE,JSON.stringify(calls));if(!options.method)return {ok:true,json:async()=>({models:[{name:'models/gemini-3-flash-preview',supportedGenerationMethods:['generateContent']}]})};if(process.env.TEST_HTTP_ERROR)return {ok:false,status:503,json:async()=>({error:{status:'UNAVAILABLE',message:'mock-only provider failure'}})};return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(${JSON.stringify(answer())})}]}}],usageMetadata:{promptTokenCount:1}})};};`);
  const runner=fileURLToPath(new URL('./run-researched-gemini.mjs',import.meta.url));
  const run=(extra={})=>spawnSync(process.execPath,['--import',stub,runner,'generate',briefPath,output],{
   encoding:'utf8',env:{...process.env,GEMINI_API_KEY:'mock-only',TEST_TRACE:trace,ROMAN_GEMINI_ALLOW_GENERATE:'false',...extra}});
  assert.notEqual(run().status,0);assert.equal(existsSync(trace),false);
  assert.equal(run({ROMAN_GEMINI_ALLOW_GENERATE:'true'}).status,0);
  let calls=JSON.parse(readFileSync(trace));assert.equal(calls.filter(c=>c.method==='POST').length,1);
  assert.equal(calls.length,2);assert.equal(calls[1].body.generationConfig.maxOutputTokens,4096);
  assert.ok(calls[1].url.includes('gemini-3-flash-preview'));
  assert.notEqual(run({ROMAN_GEMINI_ALLOW_GENERATE:'true'}).status,0); // Existing output: no extra request.
  assert.deepEqual(JSON.parse(readFileSync(trace)),calls);
  rmSync(output);assert.notEqual(run({ROMAN_GEMINI_ALLOW_GENERATE:'true',TEST_HTTP_ERROR:'true'}).status,0);
  calls=JSON.parse(readFileSync(trace));assert.equal(calls.length,2);assert.equal(existsSync(output),false);
  const diagnostic=JSON.parse(readFileSync(join(dir,'gemini-generation-report.json')));
  assert.equal(diagnostic.generationCalls,1);assert.equal(diagnostic.httpStatus,503);
  assert.equal(diagnostic.providerErrorCode,'UNAVAILABLE');assert.equal(diagnostic.providerMessage,'[REDACTED] provider failure');
  assert.equal(diagnostic.retryAttempted,false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('MCP brief produces revision 3 and carries real protocol evidence without claiming a Claude session',()=>{
 const mcp=JSON.parse(readFileSync(new URL('../research/mcp-site-check/brief-revision3.json',import.meta.url)));
 const prompt=researchPrompt(mcp);assert.ok(prompt.includes('browser_click'));assert.ok(prompt.includes(mcp.installationCommand));
 assert.equal(mcp.demo.findings[0].httpStatus,404);assert.equal(mcp.demo.findings[1].httpStatus,200);
 const response=answer();response.evidence_ids=['playwright-mcp'];
 const result=researchedDrafts(mcp,response);assert.equal(result.source_sets[0].body_revision,3);
 assert.ok(result.items.every(i=>i.script_revision===3&&i.status==='pending_approval'));
});

test('offline previews package the editorial policy for both briefs without credentials or network',()=>{
 const dir=mkdtempSync(join(tmpdir(),'roman-editorial-preview-'));
 try{
  const stub=join(dir,'offline.mjs');
  writeFileSync(stub,"globalThis.fetch=()=>{throw Error('Unexpected network in offline preview')};");
  const runner=fileURLToPath(new URL('./run-researched-gemini.mjs',import.meta.url));
  const inputs=[briefPath,fileURLToPath(new URL('../research/mcp-site-check/brief-revision3.json',import.meta.url))];
  for(const [i,input] of inputs.entries()){
   const output=join(dir,`preview-${i}.json`);
   const env={...process.env};delete env.GEMINI_API_KEY;env.ROMAN_GEMINI_ALLOW_GENERATE='false';
   const run=spawnSync(process.execPath,['--import',stub,runner,'prepare',input,output],{encoding:'utf8',env});
   assert.equal(run.status,0,run.stderr);
   const preview=JSON.parse(readFileSync(output));
   assert.equal(preview.mode,'offline_request_preview');assert.equal(preview.items,undefined);
   assert.equal(preview.productionReady,false);assert.equal(preview.sendsToSheets,false);
   assert.equal(preview.editorialRulesVersion,editorialRulesVersion);
   assert.equal(preview.editorialRulesSha256,editorialRulesSha256);
   assert.ok(preview.prompt.includes(editorialRules));assert.ok(preview.prompt.length<=16000);
  }
  // A topic shortlist is not a verified revision brief; even prepare must reject it.
  const shortlist=fileURLToPath(new URL('../research/business-automation-shortlist-v1.json',import.meta.url));
  const output=join(dir,'unready.json');
  const invalid=spawnSync(process.execPath,['--import',stub,runner,'prepare',shortlist,output],{encoding:'utf8'});
  assert.notEqual(invalid.status,0);assert.equal(existsSync(output),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('model and caller metadata cannot approve their own editorial checklist or the scripts',()=>{
 const fakeApproval={status:'passed',reviewer:'Gemini',decision:'approve',romanScriptApprovalGranted:true};
 const response={...answer(),editorialReview:fakeApproval,productionReady:true};
 const result=researchedDrafts(brief,response,{editorialReview:fakeApproval});
 assert.equal(result.productionReady,false);assert.equal(result.editorialReviewRequired,true);
 assert.equal(result.editorialReview.status,'pending_review');assert.equal(result.editorialReview.reviewer,null);
 assert.equal(result.editorialReview.decision,null);assert.equal(result.editorialReview.romanScriptApprovalGranted,false);
 assert.equal(result.editorialReview.semanticFactCheckAutomated,false);
 assert.ok(result.editorialReview.criteria.every(c=>c.status==='pending'&&c.evidence.length===0));
 assert.ok(result.items.every(i=>i.status==='pending_approval'&&i.approved_by===undefined));
 result.editorialReview.criteria[0].status='pass';
 assert.equal(researchedDrafts(brief,answer()).editorialReview.criteria[0].status,'pending');
});
