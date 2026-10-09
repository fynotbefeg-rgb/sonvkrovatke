#!/usr/bin/env node
// Send pending Gemini drafts to the protected Google Apps Script webhook.
import {readFileSync} from 'node:fs';
const file=process.argv[2];
if(!file)throw Error('Usage: node send-drafts-to-sheet.mjs drafts.json');
const url=process.env.ROMAN_REELS_WEBHOOK_URL;
const token=process.env.ROMAN_REELS_WEBHOOK_TOKEN;
if(!url||!token)throw Error('Missing ROMAN_REELS_WEBHOOK_URL or ROMAN_REELS_WEBHOOK_TOKEN');
if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url))throw Error('Unexpected Apps Script URL');
const {items}=JSON.parse(readFileSync(file,'utf8'));
if(!Array.isArray(items)||items.length<1||items.length>90)throw Error('Invalid draft count');
if(items.some(x=>x.status!=='pending_approval'))throw Error('Only pending_approval drafts may be sent');
const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({token,items}),redirect:'follow'});
const raw=await response.text();
let data;
try{data=JSON.parse(raw);}catch{throw Error('Webhook did not return JSON (HTTP '+response.status+'); check deployment access and URL');}
if(!response.ok||data.ok!==true||!Number.isInteger(data.added))throw Error('Webhook rejected drafts: '+JSON.stringify(data).slice(0,200));
console.log('Google Sheet accepted drafts; newly added:',data.added);
