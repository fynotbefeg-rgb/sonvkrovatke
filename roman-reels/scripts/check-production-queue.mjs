#!/usr/bin/env node
// Read-only test of the authenticated production queue.
import {writeFileSync} from 'node:fs';
import {validateManifest} from './approval-manifest.mjs';
const outputFile = process.argv[2];
if (process.argv.length > 3) throw Error('Usage: node check-production-queue.mjs [approvals.json]');
const url=process.env.ROMAN_REELS_WEBHOOK_URL;
const token=process.env.ROMAN_REELS_WEBHOOK_TOKEN;
if(!url||!token)throw Error('Missing webhook configuration');
if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url))throw Error('Unexpected Apps Script URL');
const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({token,action:'get_production_queue'}),redirect:'follow',signal:AbortSignal.timeout(30000)});
const raw=await response.text();
let data;
try{data=JSON.parse(raw);}catch{throw Error('Queue endpoint did not return JSON (HTTP '+response.status+')');}
if(!response.ok||data.ok!==true||!Array.isArray(data.items))throw Error('Queue endpoint rejected request');
for(const item of data.items){
 if(typeof item.version_id!=='string'||typeof item.script_text!=='string'||!item.script_text.trim())throw Error('Invalid production item');
}
// Export only a complete, verified approval snapshot. An underspecified web-app
// response must stop the intake planner rather than imply an approval.
if (outputFile) {
 validateManifest({items: data.items});
 if (data.items.some(item => item.status !== 'approved')) throw Error('Queue contains unapproved item');
 writeFileSync(outputFile, JSON.stringify({items: data.items}, null, 2) + '\n', {mode: 0o600});
}
console.log('Approved production queue items:',data.items.length);
console.log('Read-only check complete. No videos started.');
