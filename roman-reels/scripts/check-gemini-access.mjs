#!/usr/bin/env node
// Read-only model catalogue and detail. Does not prove generation eligibility.
import {writeFileSync} from 'node:fs';
const key=process.env.GEMINI_API_KEY;
if(!key)throw Error('Missing existing GEMINI_API_KEY');
const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{
 headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error(`Gemini model access HTTP ${response.status}; no generation attempted`);
const data=await response.json();
const supported=(data.models||[]).filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>m.name);
const candidates=['gemini-2.5-flash-lite','gemini-3-flash-preview'];
const details=[];
for(const model of candidates){
 const detail=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}`,{
  headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(30000)});
 details.push({model,listed:supported.includes(`models/${model}`),detailHttpStatus:detail.status});
}
const report={checkedAt:new Date().toISOString(),generationCalls:0,supportedModels:supported,candidates:details,
 generationEligibility:'not_proven_by_catalogue',freeTierAndBilling:'unknown'};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log('GeminiReadOnlyDiagnostics '+JSON.stringify(report));
