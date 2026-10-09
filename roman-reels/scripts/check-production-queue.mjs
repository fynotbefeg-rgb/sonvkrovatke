#!/usr/bin/env node
// Read-only test of the authenticated production queue.
const url=process.env.ROMAN_REELS_WEBHOOK_URL;
const token=process.env.ROMAN_REELS_WEBHOOK_TOKEN;
if(!url||!token)throw Error('Missing webhook configuration');
if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url))throw Error('Unexpected Apps Script URL');
const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({token,action:'get_production_queue'}),redirect:'follow'});
const raw=await response.text();
let data;
try{data=JSON.parse(raw);}catch{throw Error('Queue endpoint did not return JSON (HTTP '+response.status+')');}
if(!response.ok||data.ok!==true||!Array.isArray(data.items))throw Error('Queue endpoint rejected request');
for(const item of data.items){
 if(typeof item.version_id!=='string'||typeof item.script_text!=='string'||!item.script_text.trim())throw Error('Invalid production item');
}
console.log('Approved production queue items:',data.items.length);
console.log('Read-only check complete. No videos started.');
