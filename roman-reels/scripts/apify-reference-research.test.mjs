import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {plans, collect, sanitize} from './apify-reference-research.mjs';
const url='https://www.instagram.com/reel/Test123/';
test('total caps <= $1, exact profiles and bounded add-ons',()=>{
  const m=plans('metadata'),d=plans('details',[url,'https://www.instagram.com/reel/Test456/']);
  assert.equal(m.length,2);assert.equal(m.reduce((s,x)=>s+x.input.resultsLimit,0),30);
  assert.equal([...m,...d].reduce((s,x)=>s+x.cap,0),1);
  assert.ok(m.every(x=>!x.input.includeTranscript&&!x.input.includeDownloadedVideo));
  assert.ok(d.every(x=>x.input.includeTranscript&&x.input.includeDownloadedVideo));
});
test('rejects expanded and duplicated detail scope',()=>{
  for(const xs of [[],[url,url],[url,url,url],['https://example.com/reel/id/']])assert.throws(()=>plans('details',xs));
  assert.throws(()=>plans('metadata',[url]));
});
test('cannot spend without approval',async()=>{
  await assert.rejects(collect('metadata',[],{token:'test',fetchImpl:()=>assert.fail('Network')}),/approval/);
});
test('sanitization does not invent reach or preserve comments/account secrets',()=>{
  const s=sanitize({shortCode:'Test123',caption:'x',latestComments:[{text:'private'}],videoPlayCount:5},false);
  assert.equal(s.reach,null);assert.equal(s.plays,5);assert.equal(s.likes,null);
  assert.ok(!('latestComments' in s));assert.ok(!('videoUrl' in s));
});
async function fixture(kind){
 const directory=mkdtempSync(join(tmpdir(),'apify-ref-'));let posts=0;
 try {
  const fetchImpl=async(p,o={})=>{
   if(p.endsWith('/acts/apify~instagram-reel-scraper'))return {ok:true,json:async()=>({data:{pricingInfos:[{startedAt:'2026-01-01',pricingModel:'PAY_PER_EVENT'}]}})};
   if(o.method==='POST'&&!p.endsWith('/abort')){
    posts++;assert.ok(p.includes('maxTotalChargeUsd=0.4'));assert.equal(o.redirect,'error');
    if(kind==='ambiguous')throw Error('Lost response');
    return {ok:true,json:async()=>({data:{id:'run123',status:'SUCCEEDED',options:{maxTotalChargeUsd:kind==='badcap'?99:.4},defaultDatasetId:'dataset123'}})};
   }
   if(p.endsWith('/abort'))return {ok:true,json:async()=>({})};
   return {ok:true,json:async()=>[{shortCode:kind==='mismatch'?'Other':'Test123',ownerUsername:'test',transcript:'Business demo'}]};
  };
  if(kind==='success'){
   const r=await collect('details',[url],{token:'test',approved:true,directory,fetchImpl});
   assert.equal(r[0].items[0].transcript,'Business demo');assert.equal(posts,1);
   await assert.rejects(collect('details',[url],{token:'test',approved:true,directory,fetchImpl}),/journal exists/);assert.equal(posts,1);
  }else{
   await assert.rejects(collect('details',[url],{token:'test',approved:true,directory,fetchImpl}),kind==='badcap'?/cap/:kind==='mismatch'?/identity/:/do not retry/);
   assert.equal(posts,1);assert.ok(readFileSync(join(directory,'run-0.json'),'utf8').length);
  }
 }finally{rmSync(directory,{recursive:true,force:true});}
}
test('one POST, preserved identity and rerun blocked',()=>fixture('success'));
test('ambiguous creation is never retried',()=>fixture('ambiguous'));
test('unapplied budget cap aborts',()=>fixture('badcap'));
test('wrong Reel identity cannot reach result',()=>fixture('mismatch'));
