import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkSelectedTopic} from './check-selected-topic.mjs';
const now=Date.parse('2026-10-15T12:00:00Z');
const expectation={topicId:'test-topic',revision:2,topicText:'Учебная тема'};
const topic=()=>({topicId:expectation.topicId,reviewRevision:2,topicText:expectation.topicText,
  topicHash:createHash('sha256').update(JSON.stringify(['shared-review-v1',expectation.topicId,2,'topic',expectation.topicText])).digest('hex'),
  approvedBy:'approver@example.test',approvedAt:'2026-10-15T11:00:00Z',status:'selected_for_research'});
const snapshot=()=>({ok:true,snapshotVersion:'1.0.0',source:'apps_script_shared_review',capturedAt:'2026-10-15T11:59:59Z',
  enabled:true,topics:[topic()],scriptApprovalGranted:false,productionAllowed:false});
function options(data=snapshot()){
  const calls=[];return {...expectation,url:'https://script.google.com/macros/s/test/exec',token:'fictional-secret',now,
    calls,fetchImpl:async(url,init)=>{calls.push(JSON.parse(init.body));return Response.json(data);}};
}
test('exact authenticated selection is verified without exporting identity or writing approvals',async()=>{
  const o=options(),r=await checkSelectedTopic(o);assert.equal(r.topicApprovalVerified,true);
  assert.equal(r.productionAllowed,false);assert.equal(r.scriptApprovalGranted,false);assert.equal(r.approvalWrites,false);
  assert.deepEqual(o.calls.map(x=>x.action),['get_topic_research_snapshot']);
  assert.ok(!JSON.stringify(r).includes('approver@example.test'));assert.ok(!JSON.stringify(r).includes('fictional-secret'));
});
test('pending, wrong revision and wrong title do not verify',async()=>{
  const empty=snapshot();empty.topics=[];
  for(const o of [options(empty),{...options(),revision:3},{...options(),topicText:'Другая тема'}])assert.equal((await checkSelectedTopic(o)).topicApprovalVerified,false);
});
test('disabled, stale, corrupted hash and permissive snapshots fail closed',async()=>{
  for(const change of [d=>{d.enabled=false;d.topics=[];},d=>{d.capturedAt='2020-01-01T00:00:00Z';},d=>{d.topics[0].topicHash='0'.repeat(64);},d=>{d.productionAllowed=true;}]){
    const d=snapshot();change(d);await assert.rejects(checkSelectedTopic(options(d)));
  }
});
test('bad expectation refuses before transport; auth failure is generic and no retry occurs',async()=>{
  const o=options();await assert.rejects(checkSelectedTopic({...o,revision:0}));assert.equal(o.calls.length,0);
  let calls=0;await assert.rejects(checkSelectedTopic({...options(),fetchImpl:async()=>{calls++;throw Error('fictional-secret');}}),e=>!e.message.includes('fictional-secret'));
  assert.equal(calls,1);
});
