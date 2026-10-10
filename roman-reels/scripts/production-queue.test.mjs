import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProductionQueue, productionKey} from './production-queue.mjs';
import {scriptHash} from './approval-manifest.mjs';
import {handleVerifiedStart} from './telegram-start-controller.mjs';

function fixture() {
  const item = {topic_id:'queue-test', hook_id:1, version_id:'R-queue-test-h1', script_revision:1,
    hook_text:'Тестовый хук', script_text:'Тестовая речь 👀', status:'approved',
    approved_by:'test@example.test', approved_at:'2026-10-10T00:00:00Z'};
  item.script_hash = scriptHash(item);
  return {items:[item]};
}
function setup(t) {
  const q = new ProductionQueue(':memory:');
  t.after(() => q.close());
  const snapshot = fixture();
  const ticket = q.createTicket(snapshot, ['R-queue-test-h1'], '123');
  const update = {callback_query:{id:'cb_1', data:ticket.callback_data, from:{id:123}, message:{chat:{id:123,type:'private'}}}};
  const options = {queue:q, allowedOperatorIds:['123'], readCurrentApprovals:async()=>snapshot};
  return {q,snapshot,ticket,update,options};
}
test('manual provider enqueues exact approval and expected source name without generation', async t => {
  const {q,update,options,snapshot} = setup(t);
  const result = await handleVerifiedStart(update,options);
  assert.equal(result.created,1);
  assert.equal(result.generation_started,false);
  assert.equal(result.render_allowed,false);
  assert.equal(result.jobs[0].state,'waiting_for_manual_upload');
  assert.ok(result.jobs[0].expected_name.includes(snapshot.items[0].script_hash));
  assert.deepEqual(result.jobs[0].approval,snapshot.items[0]);
  assert.equal(q.countJobs(),1);
});
test('duplicate delivery, double click and a new ticket create only one durable job', async t => {
  const {q,update,options,snapshot} = setup(t);
  await handleVerifiedStart(update,options);
  assert.equal((await handleVerifiedStart(update,options)).replayed,true);
  update.callback_query.id = 'cb_2';
  assert.equal((await handleVerifiedStart(update,options)).created,0);
  update.callback_query.data = q.createTicket(snapshot,['R-queue-test-h1'],'123').callback_data;
  update.callback_query.id = 'cb_3';
  assert.equal((await handleVerifiedStart(update,options)).created,0);
  assert.equal(q.countJobs(),1);
});
test('unauthorized actor, group chat and spoofed client approvals are rejected', async t => {
  const {update,options,q} = setup(t);
  const stranger = structuredClone(update); stranger.callback_query.from.id=456;
  await assert.rejects(handleVerifiedStart(stranger,options),/Unauthorized/);
  const group = structuredClone(update); group.callback_query.message.chat.type='group';
  await assert.rejects(handleVerifiedStart(group,options),/Unauthorized/);
  update.approvals = fixture();
  options.readCurrentApprovals=async()=>({items:[]});
  await assert.rejects(handleVerifiedStart(update,options),/revoked/);
  assert.equal(q.countJobs(),0);
});
test('ticket belongs to its operator and expires', t => {
  const {q,snapshot} = setup(t);
  const ticket=q.createTicket(snapshot,['R-queue-test-h1'],'123',{now:100,ttlMs:10});
  assert.throws(()=>q.startTicket(ticket.ticket_id,'cb','456',snapshot,{now:105}),/ticket/);
  assert.throws(()=>q.startTicket(ticket.ticket_id,'cb','123',snapshot,{now:110}),/ticket/);
});
test('pending scripts and unapproved hooks cannot obtain a start ticket', t => {
  const {q,snapshot} = setup(t);
  snapshot.items[0].status='pending_approval'; delete snapshot.items[0].approved_by; delete snapshot.items[0].approved_at;
  assert.throws(()=>q.createTicket(snapshot,['R-queue-test-h1'],'123'),/not approved/);
  assert.throws(()=>q.createTicket(fixture(),['R-queue-test-h2'],'123'),/not approved/);
});
test('changed speech, hook or revision blocks old button even after reapproval', async t => {
  const {snapshot,update,options,q} = setup(t);
  for(const [key,value] of [['script_text','Новая речь'],['hook_text','Новый хук'],['script_revision',2]]) {
    const current=structuredClone(snapshot); current.items[0][key]=value;
    current.items[0].script_hash=scriptHash(current.items[0]);
    options.readCurrentApprovals=async()=>current;
    await assert.rejects(handleVerifiedStart(update,options),/changed/);
  }
  assert.equal(q.countJobs(),0);
});
test('multi-version start is atomic when one approval has been revoked', t => {
  const {q,snapshot} = setup(t);
  const second={...snapshot.items[0],hook_id:2,version_id:'R-queue-test-h2'};
  second.script_hash=scriptHash(second);
  const batch={items:[snapshot.items[0],second]};
  const ticket=q.createTicket(batch,batch.items.map(x=>x.version_id),'123');
  assert.throws(()=>q.startTicket(ticket.ticket_id,'cb','123',snapshot),/revoked/);
  assert.equal(q.countJobs(),0);
});
test('Windows switch preserves production key and stops repeat click from resetting provider', async t => {
  const {q,update,options} = setup(t);
  const first=await handleVerifiedStart(update,options);
  const key=first.jobs[0].production_key;
  const switched=q.switchWaitingProvider(key,'windows_browser');
  assert.equal(switched.production_key,key);
  assert.equal(switched.state,'waiting_for_windows_worker');
  assert.equal(switched.generation_started,false);
  assert.equal((await handleVerifiedStart(update,options)).jobs[0].provider,'windows_browser');
  update.callback_query.id='after_switch';
  assert.equal((await handleVerifiedStart(update,options)).jobs[0].provider,'windows_browser');
  assert.equal(q.countJobs(),1);
  assert.throws(()=>q.switchWaitingProvider(key,'api'),/Unsupported/);
});
test('server controls provider; callback cannot choose Windows or API', async t => {
  const {update,options}=setup(t);
  update.provider='windows_browser'; update.callback_query.provider='api';
  assert.equal((await handleVerifiedStart(update,options)).jobs[0].provider,'manual_upload');
});
test('file queue survives reopen and separate connections cannot create duplicate jobs', t => {
  const dir=mkdtempSync(join(tmpdir(),'roman-queue-'));
  const file=join(dir,'queue.sqlite');
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const snapshot=fixture();
  let first=new ProductionQueue(file);
  const ticket=first.createTicket(snapshot,['R-queue-test-h1'],'123');
  first.startTicket(ticket.ticket_id,'cb_1','123',snapshot);
  first.close();
  first=new ProductionQueue(file); const second=new ProductionQueue(file);
  t.after(()=>{first.close();second.close();});
  assert.equal(second.startTicket(ticket.ticket_id,'cb_2','123',snapshot).created,0);
  assert.equal(first.countJobs(),1);
  assert.equal(second.getJob(productionKey(snapshot.items[0])).state,'waiting_for_manual_upload');
});
test('failed authenticated approval read never enqueues a job', async t => {
  const {q,update,options}=setup(t);
  options.readCurrentApprovals=async()=>{throw Error('Approval service unavailable');};
  await assert.rejects(handleVerifiedStart(update,options),/unavailable/);
  assert.equal(q.countJobs(),0);
});
test('callback ID reuse for a different ticket is rejected without new jobs', async t => {
  const {q,snapshot,update,options}=setup(t);
  await handleVerifiedStart(update,options);
  update.callback_query.data=q.createTicket(snapshot,['R-queue-test-h1'],'123').callback_data;
  await assert.rejects(handleVerifiedStart(update,options),/collision/);
  assert.equal(q.countJobs(),1);
});
