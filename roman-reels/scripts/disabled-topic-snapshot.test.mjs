import test from 'node:test';
import assert from 'node:assert/strict';
import {checkDisabledTopicSnapshot,planForSelectedTopic} from './topic-selection-reader.mjs';
const now=Date.parse('2026-10-12T09:00:00Z');
const valid=()=>({ok:true,snapshotVersion:'1.0.0',source:'apps_script_shared_review',capturedAt:new Date(now).toISOString(),enabled:false,topics:[],scriptApprovalGranted:false,productionAllowed:false});
const options=data=>({url:'https://script.google.com/macros/s/test-deployment/exec',token:'fictional-token',now,
 fetchImpl:async()=>({status:200,ok:true,text:async()=>JSON.stringify(data)})});
test('disabled deployment probe accepts exact inactive snapshot without planner authority',async()=>{
 const result=await checkDisabledTopicSnapshot(options(valid()));
 assert.deepEqual(result,{enabled:false,topicCount:0,productionAllowed:false});
 assert.throws(()=>planForSelectedTopic({}, {}, result),/Live authenticated snapshot required/);
});
test('probe rejects enabled, populated, permissive, stale and foreign responses',async()=>{
 const mutations=[{enabled:true},{topics:[{}]},{productionAllowed:true},{scriptApprovalGranted:true},
  {capturedAt:new Date(now-300001).toISOString()},{capturedAt:new Date(now+1).toISOString()},
  {source:'other'},{snapshotVersion:'2.0.0'},{ok:false},{extra:true}];
 for(const mutation of mutations)await assert.rejects(checkDisabledTopicSnapshot(options({...valid(),...mutation})));
});
test('probe preserves response-only GET redirect without forwarding token',async()=>{
 const calls=[];
 const result=await checkDisabledTopicSnapshot({...options(valid()),fetchImpl:async(url,init)=>{
  calls.push({url,init});
  if(calls.length===1)return {status:302,headers:{get:()=> 'https://script.googleusercontent.com/macros/echo?user_content_key=test'}};
  return {status:200,ok:true,text:async()=>JSON.stringify(valid())};
 }});
 assert.equal(result.enabled,false);assert.equal(calls.length,2);
 assert.equal(calls[1].init.method,'GET');assert.equal(calls[1].init.body,undefined);
 assert.equal(calls[1].init.headers,undefined);
});
test('probe rejects unsafe redirect and network errors without secret messages',async()=>{
 let calls=0;
 await assert.rejects(checkDisabledTopicSnapshot({...options(valid()),fetchImpl:async()=>{
  calls++;return {status:302,headers:{get:()=> 'https://untrusted.example/echo'}};
 }}),/unavailable or invalid/);assert.equal(calls,1);
 await assert.rejects(checkDisabledTopicSnapshot({...options(valid()),fetchImpl:async()=>{throw Error('fictional-token');}}),
  error=>!error.message.includes('fictional-token'));
});
