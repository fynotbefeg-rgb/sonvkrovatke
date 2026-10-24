import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readApprovedQueue, planApprovedUploads} from './approved-four-part-jobs.mjs';
import {scriptHash} from './approval-manifest.mjs';
import {validateJob} from './source-uploader.mjs';
import {buildFourPartReceipt} from './build-four-part-receipt.mjs';
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const now = Date.parse('2026-10-13T12:00:00Z');
const url = 'https://script.google.com/macros/s/test/exec', token = 'private-test-token';
const make = () => {
  const review = {schemaVersion:'1.0.0',topicId:'example',topicText:'Практическая тема',revision:2,
    bodyText:'Точная основа 👀\nбез нормализации.',hooks:[1,2,3].map(id=>({id,text:`Хук ${id}`})),endings:[]};
  const body = hash(['shared-review-v1','example',2,'body',review.bodyText]);
  const queue = {ok:true,items:review.hooks.map(h=>{
    const i={topic_id:'example',hook_id:h.id,version_id:`R-example-h${h.id}`,script_revision:2,hook_text:h.text,
      script_text:`${h.text}\n\n${review.bodyText}`,status:'approved',approved_by:'roman@example.test',approved_at:'2026-10-13T11:59:00Z',
      shared_review:{topicId:'example',revision:2,packetHash:hash(review),componentHashes:{
        topic:hash(['shared-review-v1','example',2,'topic',review.topicText]),body,
        hook:hash(['shared-review-v1','example',2,'hook',h.id,h.text,body])}}};
    i.script_hash=scriptHash(i);return i;
  })};
  const bindings=Object.fromEntries(['body','hook-1','hook-2','hook-3'].map(r=>[r,{localPath:path.resolve(`/tmp/${r}.mp4`),heygenTitle:'Видео аватара'}]));
  return {review,queue,bindings};
};
const read = queue => readApprovedQueue({url,token,now,fetchImpl:async()=>Response.json(queue)});

test('exact receipts produce four deterministic uploader jobs and compatible neutral packet/receipt',async()=>{
  const {review,queue,bindings}=make();const authenticated=await read(queue);
  const original=JSON.stringify(authenticated);const a=planApprovedUploads(review,bindings,authenticated,{now});
  assert.equal(a.status,'planned');assert.equal(a.jobs.length,4);assert.equal(a.generationAllowed,false);assert.equal(a.renderAllowed,false);
  assert.equal(a.currentApprovalRecheckRequired,true);assert.deepEqual(planApprovedUploads(review,bindings,authenticated,{now}),a);
  assert.equal(JSON.stringify(authenticated),original);
  const journal={journalVersion:'1.0.0',jobs:{}};
  for(const j of a.jobs){assert.deepEqual(validateJob(j).job,j);journal.jobs[j.jobId]={...j,status:'uploaded',driveFileId:`file-${j.role}`,driveName:`${j.role}.mp4`,size:1000,sha256:'a'.repeat(64)};}
  assert.equal(buildFourPartReceipt(a.packet,journal).files.length,4);
  assert.ok(a.packet.items.every(i=>i.status==='pending_approval'&&!i.approved_by));
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const python=spawnSync('python',['-c','import json,sys;from drive_intake import incoming;p=json.loads(sys.stdin.readline());t,v,parts=incoming.expectations(p);print(len(parts))'],
    {cwd:path.dirname(fileURLToPath(import.meta.url)),input:JSON.stringify(a.packet)+'\n',encoding:'utf8',timeout:20000,env});
  assert.equal(python.status,0,python.stderr);assert.equal(python.stdout.trim(),'4');
});

test('empty or partial queue waits and cannot create jobs',async()=>{
  for(const count of [0,1,2]){const {review,queue,bindings}=make();queue.items.length=count;
    const plan=planApprovedUploads(review,bindings,await read(queue),{now});assert.equal(plan.status,'awaiting_exact_approvals');assert.deepEqual(plan.jobs,[]);assert.equal(plan.packet,null);}
});

test('saved, copied, mutated or expired authenticated snapshot is never authority',async()=>{
  const {review,queue,bindings}=make();assert.throws(()=>planApprovedUploads(review,bindings,queue,{now}));
  const q=await read(queue);assert.throws(()=>planApprovedUploads(review,bindings,structuredClone(q),{now}));
  assert.throws(()=>planApprovedUploads(review,bindings,q,{now:now+300001}));
  q.items[0].approved_by='different@example.test';assert.throws(()=>planApprovedUploads(review,bindings,q,{now}));
});

test('edited body/title/hook/revision or forged component proof fails exact binding',async()=>{
  for(const change of [r=>r.bodyText+=' ',r=>r.topicText+=' ',r=>r.hooks[0].text+=' ',r=>r.revision++,r=>r.endings.push({platform:'tiktok',text:'ending'})]){
    const {review,queue,bindings}=make();const q=await read(queue);change(review);assert.throws(()=>planApprovedUploads(review,bindings,q,{now}));
  }
  for(const change of [q=>delete q.items[0].shared_review,q=>q.items[0].shared_review.componentHashes.body='0'.repeat(64),q=>q.items[0].shared_review.packetHash='0'.repeat(64)]){
    const {review,queue,bindings}=make();change(queue);
    const q=await read(queue);assert.throws(()=>planApprovedUploads(review,bindings,q,{now}));
  }
});

test('future approvals, unapproved records and duplicate variant identities reject endpoint data',async()=>{
  for(const change of [q=>q.items[0].approved_at='2026-10-14T00:00:00Z',q=>q.items[0].status='pending_approval',q=>q.items.push(q.items[0])]){
    const {queue}=make();change(queue);await assert.rejects(read(queue),/unavailable or invalid/);
  }
});

test('only explicit distinct finished MP4 bindings accepted; Windows paths supported',async()=>{
  const {review,queue,bindings}=make();const q=await read(queue);
  for(const change of [b=>delete b.body,b=>b.body.localPath='relative.mp4',b=>b.body.localPath='/tmp/a.mp4.crdownload',
    b=>b.body.localPath=b['hook-1'].localPath,b=>b.body.localPath='/tmp/../file.mp4']){
    const b=structuredClone(bindings);change(b);assert.throws(()=>planApprovedUploads(review,b,q,{now}));
  }
  for(const r of Object.keys(bindings))bindings[r].localPath=`C:\\RomanReels\\downloads\\${r}.mp4`;
  assert.equal(planApprovedUploads(review,bindings,q,{now}).jobs.length,4);
});

test('allowed response-only redirect never forwards token/body; foreign redirects rejected',async()=>{
  const calls=[];const {queue}=make();
  const result=await readApprovedQueue({url,token,now,fetchImpl:async(u,o)=>{calls.push([u,o]);return calls.length===1?
    new Response('',{status:302,headers:{location:'https://script.googleusercontent.com/macros/echo?response=1'}}):Response.json(queue);}});
  assert.equal(result.items.length,3);assert.equal(calls[0][1].method,'POST');assert.equal(calls[1][1].method,'GET');
  assert.equal(calls[1][1].body,undefined);assert.equal(calls[1][1].headers,undefined);assert.ok(!calls[1][0].includes(token));
  for(const location of ['https://evil.example/macros/echo','https://script.googleusercontent.com/macros/echo?token='+token]){
    let hits=0;await assert.rejects(readApprovedQueue({url,token,now,fetchImpl:async()=>{hits++;return new Response('',{status:302,headers:{location}});}}));assert.equal(hits,1);
  }
});

test('network/HTTP/non-JSON/oversized response fails without retry or leaking tokens',async()=>{
  for(const fetchImpl of [async()=>{throw Error(token)},async()=>new Response('no',{status:503}),async()=>new Response('<html>'),async()=>new Response('x'.repeat(200001))]){
    await assert.rejects(readApprovedQueue({url,token,now,fetchImpl}),e=>!e.message.includes(token)&&/unavailable or invalid/.test(e.message));
  }
});
