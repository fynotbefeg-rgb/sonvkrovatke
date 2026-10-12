#!/usr/bin/env node
// Opt-in read-only bridge: live topic choice + saved metadata -> offline proposal.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {readTopicSnapshot,planForSelectedTopic} from './topic-selection-reader.mjs';
import {validateTopicScope} from './topic-reference-plan.mjs';
const [scopeFile,batchFile,output]=process.argv.slice(2);
if(!scopeFile||!batchFile||!output||process.argv.length!==5)throw Error('Usage: scope.json saved-metadata.json NEW-plan.json');
if(existsSync(output))throw Error('Output exists; no request or overwrite');
const load=file=>{const bytes=readFileSync(file);if(bytes.length>2*1024*1024)throw Error('Input too large');return JSON.parse(bytes);};
const scope=validateTopicScope(load(scopeFile)),batch=load(batchFile);
if(!Array.isArray(batch?.items)||batch.items.length>200)throw Error('Bounded saved metadata required');
if(process.env.ROMAN_TOPIC_READ_ENABLED!=='true')throw Error('Topic reader disabled; no network request');
const snapshot=await readTopicSnapshot({url:process.env.ROMAN_REELS_WEBHOOK_URL,token:process.env.ROMAN_REELS_WEBHOOK_TOKEN});
const plan=planForSelectedTopic(scope,batch,snapshot);
writeFileSync(output,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(`Selected-topic metadata candidates: ${plan.candidates.length}. No Actors, Gemini, approvals or production started.`);
