#!/usr/bin/env node
// Windows owner wrapper: DPAPI key stays in memory, same persistent budget for every process.
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {geminiPaths,loadGeminiConfig,initializeGeminiStore,checkGeminiStore} from './windows-gemini-config.mjs';
import {checkGeminiAccess} from './gemini-bounded-client.mjs';
import {runResearched} from './run-researched-gemini.mjs';

export async function runWindowsGemini({args,env=process.env,platform=process.platform,
  load=loadGeminiConfig,init=initializeGeminiStore,check=checkGeminiStore,access=checkGeminiAccess,editorial=runResearched}) {
  const [mode,input,output,permission]=args;
  if(!['init-store','check-config','check-access','prepare','generate'].includes(mode))throw new Error('Unknown Gemini mode');
  const editing=['prepare','generate'].includes(mode);
  if((!editing&&args.length!==1)||(mode==='prepare'&&args.length!==3)||(mode==='generate'&&(args.length!==4||permission!=='--allow-one-generation')))
    throw new Error('Expected mode or prepare|generate brief.json output.json; generate requires --allow-one-generation');
  if(platform!=='win32'||env.GITHUB_ACTIONS==='true')throw new Error('This wrapper requires the Windows owner session');
  if(mode==='prepare') return editorial({mode,input,output,env:{}}); // entirely offline, no key required
  const paths=geminiPaths(env.LOCALAPPDATA);
  const config=await load(paths.config);
  if(mode==='init-store')return {status:'initialized',...(await init(paths)),generationCalls:0};
  const budget=await check(paths);
  if(mode==='check-config')return {status:'ready',projectConfigured:true,quotaTier:'Free (owner reported)',
    billingVerifiedByApi:false,...budget,generationCalls:0,productionAllowed:false};
  if(mode==='check-access')return access({apiKey:config.apiKey}); // catalogue + countTokens; never generateContent
  if(env.ROMAN_GEMINI_ALLOW_GENERATE!=='true')throw new Error('Owner single-generation authorization required');
  return editorial({mode,input,output,env:{ROMAN_GEMINI_ALLOW_GENERATE:'true',ROMAN_GEMINI_LEDGER:paths.ledger,GEMINI_API_KEY:config.apiKey}});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  runWindowsGemini({args:process.argv.slice(2)}).then(x=>console.log(typeof x==='string'?x:JSON.stringify(x)),()=>{
    console.error('Gemini step not completed. Check private setup, mode, authorization and provider access. No automatic retry.');process.exitCode=1;
  });
}
