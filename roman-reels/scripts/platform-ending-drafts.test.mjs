import test from 'node:test';
import assert from 'node:assert/strict';
import {platformEndingDrafts} from './platform-ending-drafts.mjs';
import {validateManifest} from './approval-manifest.mjs';
const response=()=>({body_text:Array(100).fill('Основа').join(' '),hooks:[1,2,3].map(hook_id=>({hook_id,hook_text:`Хук ${hook_id}`}))});
const endings=()=>[{platform:'instagram',trigger:'comment_keyword',keyword:'ПЛАН',text:'Напиши ПЛАН в комментариях.'},{platform:'tiktok',trigger:'dm_keyword',keyword:'ПЛАН',text:'Напиши ПЛАН в личных сообщениях.'}];
test('six distinct pending full variants preserve exact common body and part order',()=>{
 const input=response(),ends=endings(),r=platformEndingDrafts('topic',input,ends);
 assert.equal(validateManifest(r).length,6);assert.equal(r.sourceSet.recordingParts,6);assert.equal(r.productionReady,false);
 for(const item of r.items){assert.equal(item.status,'pending_approval');assert.equal(item.script_text,`${item.hook_text}\n\n${input.body_text}\n\n${item.ending_text}`);assert.equal(item.body_text_hash,r.sourceSet.body_text_hash);}
});
test('editing one ending changes only the three corresponding full approval hashes',()=>{
 const a=platformEndingDrafts('topic',response(),endings()),e=endings();e[1].text+=' Сейчас.';
 const b=platformEndingDrafts('topic',response(),e);
 for(let i=0;i<6;i++)assert.equal(a.items[i].script_hash===b.items[i].script_hash,a.items[i].platform==='instagram');
 assert.equal(a.sourceSet.body_text_hash,b.sourceSet.body_text_hash);
});
test('editing common body changes all six full approval hashes',()=>{
 const a=platformEndingDrafts('topic',response(),endings()),r=response();r.body_text+=' Правка';
 const b=platformEndingDrafts('topic',r,endings());
 a.items.forEach((x,i)=>assert.notEqual(x.script_hash,b.items[i].script_hash));
});
test('editing a hook changes its two platform variants only',()=>{
 const a=platformEndingDrafts('topic',response(),endings()),r=response();r.hooks[1].hook_text+=' Правка';
 const b=platformEndingDrafts('topic',r,endings());
 a.items.forEach((x,i)=>assert.equal(x.script_hash===b.items[i].script_hash,x.hook_id!==2));
});
test('unsupported channels, duplicate platforms and mismatched trigger or keyword rejected',()=>{
 for(const change of [e=>e.pop(),e=>e[1].platform='instagram',e=>e[1].platform='youtube',e=>e[1].trigger='comment_keyword',e=>e[1].keyword='ДРУГОЕ',e=>e[0].text='']){
 const e=endings();change(e);assert.throws(()=>platformEndingDrafts('topic',response(),e));}
});
test('TikTok comment CTA and absent DM request rejected even with a DM-labelled trigger',()=>{
 for(const text of ['Напиши ПЛАН в комментариях.','Напиши ПЛАН.']){const e=endings();e[1].text=text;assert.throws(()=>platformEndingDrafts('topic',response(),e));}
});
