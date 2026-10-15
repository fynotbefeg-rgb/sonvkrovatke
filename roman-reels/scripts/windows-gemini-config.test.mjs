// Fake DPAPI/fetch only; no real key, Google, environment setup, generation or Windows change.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {geminiPaths,validateGeminiConfig,loadGeminiConfig,initializeGeminiStore,assertStoreLocation} from './windows-gemini-config.mjs';
import {runWindowsGemini} from './run-windows-gemini.mjs';
const KEY='fake-key-never-real-1234567890';
const config=()=>({configVersion:'1.0.0',apiKey:KEY,projectName:'Test project',quotaTierReported:'Free'});
async function setup(t){const root=await mkdtemp(path.join(tmpdir(),'rr-win-gemini-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
test('config schema rejects unknown/blank/malformed fields and never includes the input in errors',()=>{
  assert.equal(validateGeminiConfig(config()).apiKey,KEY);
  for(const value of [{...config(),apiKey:'bad\nkey'},{...config(),surprise:true},{...config(),quotaTierReported:'Paid'},{...config(),projectName:''},null]){
    assert.throws(()=>validateGeminiConfig(value),e=>!e.message.includes(KEY));
  }
  assert.throws(()=>geminiPaths('relative'));
});
test('decrypts existing explicit ciphertext only; wrong Windows user or corrupt contents fail generically',async t=>{
  const root=await setup(t),file=path.join(root,'config.dpapi');await writeFile(file,'ciphertext-only');
  const crypto={unprotect:async text=>{assert.equal(text,'ciphertext-only');return JSON.stringify(config());}};
  assert.equal((await loadGeminiConfig(file,{crypto})).apiKey,KEY);
  assert.equal(await readFile(file,'utf8'),'ciphertext-only');
  await assert.rejects(loadGeminiConfig(file,{crypto:{unprotect:async()=>{throw Error(KEY);}}}),e=>!e.message.includes(KEY));
  await assert.rejects(loadGeminiConfig(file,{crypto:{unprotect:async()=>'{bad'}}));
});
test('store initialization survives rerun without resetting request counters; corrupt ledger remains untouched',async t=>{
  const root=await setup(t),paths=geminiPaths(root);
  const injected={checkLocation:async()=>{}}; // fake persistent location; production uses real Git/temp checks
  assert.deepEqual(await initializeGeminiStore(paths,injected),{lastDay:0,lastWeek:0});
  const entry={ledgerVersion:'1.0.0',requests:[{at:Date.now(),task:'summarize',model:'gemini-3-flash-preview'}]};
  const bytes=JSON.stringify(entry);await writeFile(paths.ledger,bytes);
  assert.deepEqual(await initializeGeminiStore(paths,injected),{lastDay:1,lastWeek:1});
  assert.equal(await readFile(paths.ledger,'utf8'),bytes);
  await writeFile(paths.ledger,'corrupt');await assert.rejects(initializeGeminiStore(paths,injected));
  assert.equal(await readFile(paths.ledger,'utf8'),'corrupt');
});
test('foreign marker blocks initialization without overwriting it',async t=>{
  const root=await setup(t),paths=geminiPaths(root);await initializeGeminiStore(paths,{checkLocation:async()=>{}});
  await writeFile(paths.marker,'{"purpose":"other"}');
  await assert.rejects(initializeGeminiStore(paths,{checkLocation:async()=>{}}));
  assert.equal(await readFile(paths.marker,'utf8'),'{"purpose":"other"}');
});
function fake(extra={}){
  const events=[];
  const options={platform:'win32',env:{LOCALAPPDATA:path.resolve('/fictional-owner')},
    load:async()=>{events.push('load');return config();},check:async()=>{events.push('check');return {lastDay:0,lastWeek:0};},
    access:async x=>{events.push('access');assert.equal(x.apiKey,KEY);return {generationCalls:0,catalogueHttpStatus:200,modelListed:true,countTokensHttpStatus:200};},
    editorial:async x=>{events.push(x.mode);return x;},...extra};return {events,options};
}
test('check-config never calls API and returns no key; check-access cannot call generation',async()=>{
  const f=fake(),result=await runWindowsGemini({...f.options,args:['check-config']});
  assert.deepEqual(f.events,['load','check']);assert.ok(!JSON.stringify(result).includes(KEY));
  const a=fake();assert.deepEqual(await runWindowsGemini({...a.options,args:['check-access']}),{generationCalls:0,catalogueHttpStatus:200,modelListed:true,countTokensHttpStatus:200,accessAvailable:true});
  assert.deepEqual(a.events,['load','check','access']);
});
test('offline prepare needs no key, store or environment authorization',async()=>{
  const f=fake();const result=await runWindowsGemini({...f.options,args:['prepare','brief.json','out.json']});
  assert.deepEqual(f.events,['prepare']);assert.deepEqual(result.env,{});
});
test('generate requires explicit argument AND authorization, uses only the canonical journal and in-memory key',async()=>{
  const f=fake();await assert.rejects(runWindowsGemini({...f.options,args:['generate','a','b']}));
  assert.deepEqual(f.events,[]);
  const g=fake();await assert.rejects(runWindowsGemini({...g.options,args:['generate','a','b','--allow-one-generation']}));
  assert.ok(!g.events.includes('generate'));
  const h=fake();h.options.env.ROMAN_GEMINI_ALLOW_GENERATE='true';
  const result=await runWindowsGemini({...h.options,args:['generate','a','b','--allow-one-generation']});
  assert.equal(result.env.GEMINI_API_KEY,KEY);assert.equal(result.env.ROMAN_GEMINI_LEDGER,geminiPaths(h.options.env.LOCALAPPDATA).ledger);
  assert.deepEqual(h.events,['load','check','generate']);
});
test('invalid/foreign runtime or failed store stops before any provider request',async()=>{
  for(const extra of [{platform:'linux'},{env:{LOCALAPPDATA:'/owner',GITHUB_ACTIONS:'true'}}]){
    const f=fake(extra);await assert.rejects(runWindowsGemini({...f.options,args:['check-access']}));assert.deepEqual(f.events,[]);
  }
  const f=fake({check:async()=>{throw Error('corrupt');}});
  await assert.rejects(runWindowsGemini({...f.options,args:['check-access']}));assert.deepEqual(f.events,['load']);
});

test('real location guard rejects temporary folders and Git work trees before setup',async t=>{
  const root=await setup(t);await assert.rejects(assertStoreLocation(root));
  await assert.rejects(assertStoreLocation(process.cwd()));
});

test('Windows DPAPI roundtrip with fictional key, no network or user config', {skip:process.platform!=='win32'},async t=>{
  const {dpapi}=await import('./source-uploader-auth.mjs');
  const root=await setup(t),file=path.join(root,'fictional-config.dpapi');
  const encrypted=await dpapi.protect(JSON.stringify(config()));
  assert.ok(!encrypted.includes(KEY));await writeFile(file,encrypted);
  assert.equal((await loadGeminiConfig(file)).apiKey,KEY);
});

test('HTTP quota/region refusal or missing model is not reported as available access',async()=>{
  for(const data of [{catalogueHttpStatus:403,modelListed:false,countTokensHttpStatus:403},
    {catalogueHttpStatus:200,modelListed:false,countTokensHttpStatus:404},
    {catalogueHttpStatus:200,modelListed:true,countTokensHttpStatus:429}]){
    const f=fake({access:async()=>({...data,generationCalls:0})});
    const result=await runWindowsGemini({...f.options,args:['check-access']});
    assert.equal(result.accessAvailable,false);assert.equal(result.generationCalls,0);assert.ok(!f.events.includes('generate'));
  }
});
