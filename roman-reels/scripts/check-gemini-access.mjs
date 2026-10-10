#!/usr/bin/env node
// Model catalogue GET only. No generation, retry, secret output or billing claim.
const key=process.env.GEMINI_API_KEY;
if(!key)throw Error('Missing existing GEMINI_API_KEY');
const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{
 headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error(`Gemini model access HTTP ${response.status}; no generation attempted`);
const data=await response.json();
const model='gemini-2.5-flash-lite';
if(!data.models?.some(m=>m.name===`models/${model}`&&m.supportedGenerationMethods?.includes('generateContent')))
 throw Error('Selected model unavailable; no generation attempted');
console.log(`GeminiAccess ${model} available; generationCalls=0; freeTierAndBilling=unknown`);
