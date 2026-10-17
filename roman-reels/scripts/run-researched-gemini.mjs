#!/usr/bin/env node
// One bounded generation through the shared createGeminiClient: durable request ledger, no retries, no fallback model,
// no Sheet/Drive/HeyGen writes. Drafts are always pending editorial review and Roman's approval.
import {readFileSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {dirname,join,isAbsolute,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {researchPrompt,researchedDrafts} from './researched-gemini-drafts.mjs';
import {editorialRulesVersion,editorialRulesSha256} from './editorial-rules.mjs';
import {createGeminiClient} from './gemini-bounded-client.mjs';

export const LEDGER_STORE_MARKER='gemini-ledger-store.json';
const MODEL='gemini-3-flash-preview';
// One-off comparison allowlist; the pinned default above never changes. Any other model id is refused before a request.
export const COMPARISON_MODELS=Object.freeze([MODEL,'gemini-3.8-flash']);
// Codes raised before any generation request leaves the machine.
const PRE_NETWORK=new Set(['task_not_allowed','generation_not_authorized','missing_key','model_not_allowed','prompt_invalid','invalid_mime',
 'invalid_limits','invalid_ledger','ledger_invalid','ledger_locked','ledger_lock_stale','run_budget_exhausted','day_budget_exhausted',
 'week_budget_exhausted','invalid_clock']);

// The weekly budget is only meaningful in one persistent shared ledger. A fresh temp or Actions folder would silently
// grant a new budget, so generation requires: explicit absolute path outside any Git work tree, in a directory that
// the operator deliberately initialised with a store marker, and never on a GitHub Actions runner until a persistent
// serialized store is chosen there.
export function assertDurableLedger(file,env=process.env){
 if(env.GITHUB_ACTIONS==='true')throw Error('Persistent shared Gemini ledger for Actions is not configured; generation blocked');
 if(typeof file!=='string'||!isAbsolute(file)||!file.endsWith('.json'))throw Error('ROMAN_GEMINI_LEDGER must be an explicit absolute .json path');
 const dir=dirname(resolve(file));
 for(let d=dir;;d=dirname(d)){ if(existsSync(join(d,'.git')))throw Error('Gemini ledger must live outside any Git work tree'); if(dirname(d)===d)break; }
 let marker;
 try{marker=JSON.parse(readFileSync(join(dir,LEDGER_STORE_MARKER),'utf8'));}catch{throw Error('Gemini ledger store is not initialised (missing store marker)');}
 if(marker?.storeVersion!=='1.0.0'||marker.purpose!=='roman-gemini-weekly-budget'||!statSync(dir).isDirectory())
  throw Error('Gemini ledger store marker invalid');
 const temp=resolve(tmpdir())+sep;
 if((resolve(dir)+sep).startsWith(temp)&&marker.allowTemporaryLocation!==true)throw Error('Gemini ledger store inside a temporary folder is refused');
 return resolve(file);
}

export async function runResearched({mode,input,output,env=process.env,now=()=>new Date(),model=MODEL}){
 if(!['prepare','generate'].includes(mode)||!input||!output)throw Error('Usage: run-researched-gemini.mjs prepare|generate brief.json output.json');
 if(!COMPARISON_MODELS.includes(model))throw Error('Model is not in the explicit comparison allowlist; no request');
 if(existsSync(output))throw Error('Output already exists; no request or overwrite allowed');
 const brief=JSON.parse(readFileSync(input,'utf8')),prompt=researchPrompt(brief);
 if(prompt.length>16000)throw Error('Prompt exceeds input character cap');
 if(mode==='prepare'){
  writeFileSync(output,JSON.stringify({mode:'offline_request_preview',model,prompt,
   maxOutputTokens:4096,maxGenerateCalls:1,timeoutSeconds:90,sendsToSheets:false,productionReady:false,
   editorialReviewRequired:true,editorialRulesVersion,editorialRulesSha256},null,2)+'\n',{flag:'wx'});
  return 'Prepared one request; no API calls.';
 }
 if(env.ROMAN_GEMINI_ALLOW_GENERATE!=='true')throw Error('Explicit single-call authorization required');
 const ledgerFile=assertDurableLedger(env.ROMAN_GEMINI_LEDGER,env);
 const key=env.GEMINI_API_KEY;if(!key)throw Error('Missing existing GEMINI_API_KEY');
 const list=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(30000)});
 if(!list.ok)throw Error(`Gemini models HTTP ${list.status}; no generation attempted`);
 const models=await list.json();
 if(!models.models?.some(m=>m.name===`models/${model}`&&m.supportedGenerationMethods?.includes('generateContent')))throw Error('Selected model unavailable; no fallback generation');
 const client=createGeminiClient({apiKey:key,ledgerFile,allowGenerate:true,models:[model],
  limits:{maxRequestsPerRun:1,maxRetries:0,maxOutputTokens:4096,timeoutMs:90000,maxPromptChars:16000}});
 let answer;
 try{answer=await client.generate({task:'draft_suggestion',model,prompt,responseMimeType:'application/json',temperature:0.4});}
 catch(error){
  // Bounded, redacted diagnostic; the client already strips the key from its messages.
  const report=JSON.stringify({
   model,checkedAt:now().toISOString(),generationCalls:PRE_NETWORK.has(error.code)?0:1,errorCode:error.code||'unexpected',
   providerMessage:String(error.message||'').split(key).join('[REDACTED]').slice(0,600),newDraftGenerated:false,
   retryAttempted:false,actualCostUsd:null},null,2)+'\n';
  // Never overwrite an earlier report and never let a report collision hide the original error.
  for(const name of ['gemini-generation-report.json',`gemini-generation-report-${process.pid}-${Date.now()}.json`]){
   try{writeFileSync(join(dirname(output),name),report,{flag:'wx'});break;}catch(writeError){if(writeError.code!=='EEXIST')break;}
  }
  throw Error(`Gemini generation not completed (${error.code||'unexpected'}); no automatic retry`);
 }
 const result=researchedDrafts(brief,JSON.parse(answer.text),{model,generatedAt:now().toISOString(),usageMetadata:answer.usage||null,actualCostUsd:null});
 writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 return `Generated 3 pending revision-${brief.scriptRevision} drafts; editorial review required; nothing sent to Sheets.`;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,input,output]=process.argv.slice(2);
 runResearched({mode,input,output}).then(message=>console.log(message),error=>{console.error(String(error.message).slice(0,300));process.exitCode=1;});
}
