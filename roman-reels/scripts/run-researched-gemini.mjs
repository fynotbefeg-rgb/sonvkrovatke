#!/usr/bin/env node
// One bounded generation, no retries/fallback, no Sheet/Drive/HeyGen writes.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {researchPrompt,researchedDrafts} from './researched-gemini-drafts.mjs';
const [mode,input,output]=process.argv.slice(2);
if(!['prepare','generate'].includes(mode)||!input||!output)throw Error('Usage: run-researched-gemini.mjs prepare|generate brief.json output.json');
if(existsSync(output))throw Error('Output already exists; no request or overwrite allowed');
const brief=JSON.parse(readFileSync(input,'utf8')),prompt=researchPrompt(brief);
if(prompt.length>16000)throw Error('Prompt exceeds input character cap');
if(mode==='prepare'){
 writeFileSync(output,JSON.stringify({mode:'offline_request_preview',model:'gemini-2.5-flash-lite',prompt,
  maxOutputTokens:4096,maxGenerateCalls:1,timeoutSeconds:90,sendsToSheets:false,productionReady:false},null,2)+'\n',{flag:'wx'});
 console.log('Prepared one request; no API calls.');
}else{
 if(process.env.ROMAN_GEMINI_ALLOW_GENERATE!=='true')throw Error('Explicit single-call authorization required');
 const key=process.env.GEMINI_API_KEY;if(!key)throw Error('Missing existing GEMINI_API_KEY');
 const model='gemini-2.5-flash-lite';
 const list=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(30000)});
 if(!list.ok)throw Error(`Gemini models HTTP ${list.status}; no generation attempted`);
 const models=await list.json();
 if(!models.models?.some(m=>m.name===`models/${model}`&&m.supportedGenerationMethods?.includes('generateContent')))throw Error('Selected model unavailable; no fallback generation');
 const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
  method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:AbortSignal.timeout(90000),
  body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.4,maxOutputTokens:4096,thinkingConfig:{thinkingBudget:0}}})});
 if(!response.ok)throw Error(`Gemini generation HTTP ${response.status}; no automatic retry`);
 const data=await response.json();
 if(data.candidates?.[0]?.finishReason!=='STOP')throw Error('Incomplete or blocked generation; no automatic retry');
 const raw=data.candidates[0].content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('');
 const result=researchedDrafts(brief,JSON.parse(raw),{model,generatedAt:new Date().toISOString(),usageMetadata:data.usageMetadata||null,actualCostUsd:null});
 writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(`Generated 3 pending revision-${brief.scriptRevision} drafts; editorial review required; nothing sent to Sheets.`);
}
