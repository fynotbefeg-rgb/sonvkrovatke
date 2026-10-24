#!/usr/bin/env node
// Read-only Gemini access diagnostics through the bounded client: catalogue + countTokens, never generateContent.
// Does not prove generation eligibility, free tier or billing (not exposed by the API).
import {writeFileSync} from 'node:fs';
import {checkGeminiAccess} from './gemini-bounded-client.mjs';
const key=process.env.GEMINI_API_KEY;
if(!key)throw Error('Missing existing GEMINI_API_KEY');
const report={checkedAt:new Date().toISOString(),...(await checkGeminiAccess({apiKey:key}))};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log('GeminiReadOnlyDiagnostics '+JSON.stringify(report));
