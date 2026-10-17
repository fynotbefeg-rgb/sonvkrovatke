#!/usr/bin/env node
// Prepare exact pending review content offline. No Sheets writes or approvals.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateManifest,scriptHash} from './approval-manifest.mjs';
export function prepareSharedReview(manifest,topicId,topicText) {
 const all=validateManifest(manifest);
 const source=(manifest.source_sets??[manifest.sourceSet]).find(s=>s?.topic_id===topicId);
 if(!source||typeof source.body_text!=='string'||!source.body_text.trim())throw Error('Exact source-set body required');
 if(typeof topicText!=='string'||!topicText.trim())throw Error('Visible topic title required');
 const items=all.filter(i=>i.topic_id===topicId||i.root_topic_id===topicId);
 if(![3,6].includes(items.length)||items.some(i=>i.status!=='pending_approval'))throw Error('Three or six pending scripts required');
 const revisions=new Set(items.map(i=>i.script_revision));
 if(revisions.size!==1)throw Error('Mixed script revisions');
 const revision=items[0].script_revision;
 if(source.body_revision!==undefined&&source.body_revision!==revision)throw Error('Body revision mismatch');
 const endings=items.length===6?(source.endings??[]).map(e=>({platform:e.platform,text:e.text})):[];
 if(items.length===6&&(endings.length!==2||new Set(endings.map(e=>e.platform)).size!==2||endings.some(e=>!['instagram','tiktok'].includes(e.platform)||typeof e.text!=='string'||!e.text.trim())))throw Error('Two exact platform endings required');
 const hooks=[];
 for(const id of [1,2,3]) {
  const versions=items.filter(i=>i.hook_id===id);
  if(versions.length!==items.length/3||new Set(versions.map(i=>i.hook_text)).size!==1)throw Error('Shared hooks mismatch');
  hooks.push({id,text:versions[0].hook_text});
 }
 for(const item of items) {
  const ending=endings.length?endings.find(e=>item.platform===e.platform):null;
  if(endings.length&&!ending)throw Error('Unknown platform');
  const expectedTopic=topicId+(ending?'-'+ending.platform:'');
  if(item.topic_id!==expectedTopic||item.script_text!==item.hook_text+'\n\n'+source.body_text+(ending?'\n\n'+ending.text:''))throw Error('Full speech differs from displayed parts');
  if(item.script_hash&&item.script_hash!==scriptHash(item))throw Error('Draft hash mismatch');
 }
 return {schemaVersion:'1.0.0',topicId,topicText,revision,bodyText:source.body_text,hooks,endings};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const[input,topic,title,output]=process.argv.slice(2);
 if(!input||!topic||!title||!output)throw Error('Usage: prepare-shared-review.mjs manifest.json topicId "topic title" NEW-output.json');
 const manifest=JSON.parse(readFileSync(input,'utf8'));
 writeFileSync(output,JSON.stringify(prepareSharedReview(manifest,topic,title),null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('Pending review prepared offline; no approvals, Sheets writes or production.');
}
