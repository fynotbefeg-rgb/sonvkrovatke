#!/usr/bin/env node
// Publish ONLY editorially released pending content to the opt-in shared review view.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {requireEditorialRelease} from './editorial-release.mjs';
import {prepareSharedReview} from './prepare-shared-review.mjs';
export async function publishSharedReview(draft,review,title,{url,token,root,now,fetchImpl=fetch}={}) {
 requireEditorialRelease(draft,review,{root,now});
 const packet=prepareSharedReview(draft,draft.items[0].topic_id,title);
 if(typeof url!=='string'||!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)||typeof token!=='string'||!token.trim())throw Error('Existing protected webhook configuration required');
 const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
  body:JSON.stringify({token,action:'add_shared_review',packet}),redirect:'follow',signal:AbortSignal.timeout(30000)});
 let data;
 try {data=JSON.parse(await response.text());}catch {throw Error('Shared review endpoint did not return JSON; inspect registration before retry');}
 if(!response.ok||data.ok!==true||typeof data.added!=='boolean'||!Number.isSafeInteger(data.firstRow)||data.firstRow<2||data.approvalGranted===true)
  throw Error('Shared review registration rejected or ambiguous; inspect before retry');
 return {added:data.added,firstRow:data.firstRow,approvalGranted:false,productionStarted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const[draftFile,reviewFile,title]=process.argv.slice(2);
 if(!draftFile||!reviewFile||!title)throw Error('Usage: send-shared-review.mjs drafts.json editorial-release.json "topic title"');
 const result=await publishSharedReview(JSON.parse(readFileSync(draftFile,'utf8')),JSON.parse(readFileSync(reviewFile,'utf8')),title,
  {url:process.env.ROMAN_REELS_WEBHOOK_URL,token:process.env.ROMAN_REELS_WEBHOOK_TOKEN});
 console.log('Pending shared review registered; added:',result.added,'No approvals or production.');
}
