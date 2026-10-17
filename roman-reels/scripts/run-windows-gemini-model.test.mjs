// Offline only: fake loader/editorial and a throwing fetch stub; no key, Google request, ledger write or generation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {runWindowsGemini} from './run-windows-gemini.mjs';
import {runResearched,COMPARISON_MODELS} from './run-researched-gemini.mjs';
const KEY='fake-key-never-real-1234567890';
const row={page:'https://demo.example/a',query:'учебный запрос',impressions:1200,clicks:12,position:4.8,title:'A',firstScreen:'B',ctrPercent:1};
const brief={briefVersion:'1.0.0',topicId:'test-model-override',scriptRevision:2,businessProblem:'Учебный тест',romanFeedback:'Не мнение Романа',
  sources:[{id:'s1',url:'https://example.com/a',checkedAt:'2026-10-10',supports:'x'},{id:'s2',url:'https://example.com/b',checkedAt:'2026-10-10',supports:'y'}],
  alternatives:[{method:'a'},{method:'b'}],demo:{synthetic:true,candidates:[row],inputSha256:'0'.repeat(64)},requirements:['r']};
function fake(){
  const events=[];
  return {events,options:{platform:'win32',env:{LOCALAPPDATA:path.resolve('/fictional-owner'),ROMAN_GEMINI_ALLOW_GENERATE:'true'},
    load:async()=>{events.push('load');return {apiKey:KEY};},check:async()=>({lastDay:0,lastWeek:0}),
    editorial:async x=>{events.push(x.mode);return x;}}};
}
test('wrapper passes --model only for prepare/generate, last, and never when omitted',async()=>{
  const a=fake();const p=await runWindowsGemini({...a.options,args:['prepare','b.json','o.json','--model=gemini-3.8-flash']});
  assert.equal(p.model,'gemini-3.8-flash');
  const b=fake();const g=await runWindowsGemini({...b.options,args:['generate','b.json','o.json','--allow-one-generation','--model=gemini-3.8-flash']});
  assert.equal(g.model,'gemini-3.8-flash');assert.equal(g.env.GEMINI_API_KEY,KEY);
  const c=fake();const d=await runWindowsGemini({...c.options,args:['generate','b.json','o.json','--allow-one-generation']});
  assert.ok(!('model' in d));
  for(const args of [['check-config','--model=gemini-3.8-flash'],['check-access','--model=gemini-3.8-flash'],['generate','b','o','--model=gemini-3.8-flash','--allow-one-generation']]){
    const f=fake();await assert.rejects(runWindowsGemini({...f.options,args}));assert.deepEqual(f.events,[]);
  }
  const e=fake();const empty=await runWindowsGemini({...e.options,args:['prepare','b.json','o.json','--model=']});assert.equal(empty.model,'');
});
test('runner: allowlist is exactly the pinned model plus gemini-3.8-flash; other ids are refused before any request',async t=>{
  assert.deepEqual([...COMPARISON_MODELS],['gemini-3-flash-preview','gemini-3.8-flash']);
  const root=await mkdtemp(path.join(tmpdir(),'rr-model-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(path.join(root,'brief.json'),JSON.stringify(brief));
  const realFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network must not be used');};t.after(()=>{globalThis.fetch=realFetch;});
  for(const model of ['','gemini-3.1-pro-preview','gemini-3.8-flash-lite-tts']){
    await assert.rejects(runResearched({mode:'prepare',input:path.join(root,'brief.json'),output:path.join(root,'x.json'),model}),/allowlist/);
    await assert.rejects(runResearched({mode:'generate',input:path.join(root,'brief.json'),output:path.join(root,'y.json'),model,env:{ROMAN_GEMINI_ALLOW_GENERATE:'true',GEMINI_API_KEY:KEY}}),/allowlist/);
  }
  assert.equal(calls,0);
  await runResearched({mode:'prepare',input:path.join(root,'brief.json'),output:path.join(root,'p38.json'),model:'gemini-3.8-flash'});
  await runResearched({mode:'prepare',input:path.join(root,'brief.json'),output:path.join(root,'pdef.json')});
  const p38=JSON.parse(await readFile(path.join(root,'p38.json'),'utf8')),pdef=JSON.parse(await readFile(path.join(root,'pdef.json'),'utf8'));
  assert.equal(p38.model,'gemini-3.8-flash');assert.equal(pdef.model,'gemini-3-flash-preview');
  assert.equal(p38.prompt,pdef.prompt);assert.equal(p38.maxOutputTokens,pdef.maxOutputTokens);assert.equal(p38.maxGenerateCalls,1);assert.equal(calls,0);
});
