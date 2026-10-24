import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProductionQueue} from './production-queue.mjs';
import {scriptHash} from './approval-manifest.mjs';
import {telegramApi} from './telegram-bot-api.mjs';
import {handleTelegramPanel,pollTelegramPanelOnce} from './telegram-panel.mjs';

const token='123456:only_offline_fake_token_123456789';
function approvals(n=1){return {items:Array.from({length:n},(_,i)=>{const x={topic_id:`panel-test-${i}`,hook_id:1,version_id:`R-panel-test-${i}-h1`,script_revision:1,
 hook_text:'Тестовый хук',script_text:'Приватная тестовая речь',status:'approved',approved_by:'example@example.test',approved_at:'2026-10-10T00:00:00Z'};x.script_hash=scriptHash(x);return x;})};}
const message=(id=1,actor=123)=>({update_id:id,message:{from:{id:actor},chat:{id:actor,type:'private'},text:'/start'}});
const callback=(data,id=2)=>({update_id:id,callback_query:{id:`cb_${id}`,from:{id:123},message:{chat:{id:123,type:'private'}},data}});
function setup(t,{db=':memory:',snapshot=approvals(),closeAfter=true}={}){
 const queue=new ProductionQueue(db);if(closeAfter)t.after(()=>queue.close());const sent=[],calls=[];let batch=[],failSend=false;
 const api=telegramApi({token,fetchImpl:async(url,options)=>{
  assert.equal(options.redirect,'error');assert.ok(url.startsWith(`https://api.telegram.org/bot${token}/`));
  const method=url.split('/').at(-1),body=JSON.parse(options.body);calls.push({method,body});
  if(method==='sendMessage'){if(failSend)throw Error(`Private token ${token}`);sent.push(body);}
  return new Response(JSON.stringify({ok:true,result:method==='getUpdates'?batch:method==='getMe'?{id:321,is_bot:true}:true}));
 }});
 const options={api,queue,allowedOperatorIds:['123'],readCurrentApprovals:async()=>snapshot};
 return {queue,api,sent,calls,options,setBatch:b=>batch=b,failSend:()=>failSend=true,async verified(u){batch=[u];return (await api.updates(0))[0];}};
}
test('unverified JSON and outsider/group cannot access panel or create tickets',async t=>{
 const h=setup(t);await assert.rejects(handleTelegramPanel(message(),h.options),/Authenticated Telegram/);
 for(const u of [message(1,456),{...message(),message:{...message().message,chat:{id:123,type:'group'}}}]){
  assert.equal((await handleTelegramPanel(await h.verified(u),h.options)).ignored,true);
 }
 assert.equal(h.sent.length,0);assert.equal(h.queue.countJobs(),0);
});
test('menu gives one bounded frozen ticket; button only enqueues and repeat does not duplicate',async t=>{
 const h=setup(t);await handleTelegramPanel(await h.verified(message()),h.options);
 const ticket=h.sent[0].reply_markup.inline_keyboard[0][0].callback_data;
 assert.match(ticket,/^start:[a-f0-9-]{36}$/);assert.ok(Buffer.byteLength(ticket)<=64);
 for(const id of [2,2,3])await handleTelegramPanel(await h.verified(callback(ticket,id)),h.options);
 assert.equal(h.queue.countJobs(),1);assert.equal(h.sent.some(s=>s.text.includes('Приватная тестовая речь')),false);
 assert.match(h.sent.at(-1).text,/Добавлено в очередь: 0/);
 assert.match(h.sent.at(-1).text,/пока не запускаются/);
});
test('revoked approvals block old button atomically; client approvals are ignored',async t=>{
 const h=setup(t);await handleTelegramPanel(await h.verified(message()),h.options);
 const ticket=h.sent[0].reply_markup.inline_keyboard[0][0].callback_data;
 h.options.readCurrentApprovals=async()=>({items:[]});
 const u=callback(ticket);u.approvals=approvals();
 assert.equal((await handleTelegramPanel(await h.verified(u),h.options)).blocked,true);assert.equal(h.queue.countJobs(),0);
});
test('empty or unavailable Google never implies rejection or offers a start ticket',async t=>{
 const h=setup(t,{snapshot:{items:[]}});await handleTelegramPanel(await h.verified(message()),h.options);
 assert.equal(h.sent[0].reply_markup.inline_keyboard.some(r=>r.some(b=>b.callback_data.startsWith('start:'))),false);
 await handleTelegramPanel(await h.verified(callback('panel:approvals:0')),h.options);
 assert.match(h.sent.at(-1).text,/Отсутствие не означает отказ/);
 h.options.readCurrentApprovals=async()=>{throw Error('private error')};
 assert.equal((await handleTelegramPanel(await h.verified(message()),h.options)).blocked,true);
 assert.ok(!h.sent.at(-1).text.includes('private error'));
});
test('approved variants paginated without full texts or approver identities',async t=>{
 const h=setup(t,{snapshot:approvals(12)});await handleTelegramPanel(await h.verified(callback('panel:approvals:1')),h.options);
 const text=h.sent[0].text;assert.match(text,/R-panel-test-11-h1/);assert.ok(!text.includes('R-panel-test-0-h1'));
 assert.ok(!text.includes('example@example.test')&&!text.includes('Приватная тестовая речь'));
});
test('production view reports actual waiting jobs, never invented generation or render',async t=>{
 const h=setup(t);await handleTelegramPanel(await h.verified(message()),h.options);
 await handleTelegramPanel(await h.verified(callback(h.sent[0].reply_markup.inline_keyboard[0][0].callback_data)),h.options);
 await handleTelegramPanel(await h.verified(callback('panel:production:0',3)),h.options);
 assert.match(h.sent.at(-1).text,/ожидает исходников/);assert.match(h.sent.at(-1).text,/не считаются создающимися/);
});
test('cursor survives SQLite restart; jobs do not duplicate after lost send response',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'telegram-panel-')),opened=[];
 t.after(()=>{for(const queue of opened)queue.close();rmSync(dir,{recursive:true,force:true});});
 const db=join(dir,'queue.sqlite'),h=setup(t,{db,closeAfter:false});opened.push(h.queue);
 await handleTelegramPanel(await h.verified(message()),h.options);
 const u=callback(h.sent[0].reply_markup.inline_keyboard[0][0].callback_data,10);
 h.setBatch([u]);h.failSend();await assert.rejects(pollTelegramPanelOnce({...h.options,botId:'321'}),/Telegram request failed/);
 assert.equal(h.queue.countJobs(),1);assert.equal(h.queue.telegramOffset('321'),0);
 const restarted=setup(t,{db,closeAfter:false});opened.push(restarted.queue);
 restarted.setBatch([u]);await pollTelegramPanelOnce({...restarted.options,botId:'321'});
 assert.equal(restarted.queue.countJobs(),1);assert.equal(h.queue.telegramOffset('321'),11);
 h.queue.advanceTelegramOffset('321',2);assert.equal(h.queue.telegramOffset('321'),11);
});
test('Telegram redirect, HTTP failures and oversized replies stop without token leakage or retry',async()=>{
 for(const reply of [()=>new Response('failure',{status:429}),()=>new Response('x'.repeat(1048577)),()=>{throw Error(token)}]){
  let calls=0;const api=telegramApi({token,fetchImpl:async()=>{calls++;return reply()}});
  await assert.rejects(api.updates(0),e=>!e.message.includes(token)&&/Telegram request failed/.test(e.message));assert.equal(calls,1);
 }
});
test('invalid or unordered update batches never gain verified provenance',async()=>{
 for(const batch of [[message(3),message(2)],[message(-1)],Array.from({length:21},(_,i)=>message(i))]){
  const api=telegramApi({token,fetchImpl:async()=>new Response(JSON.stringify({ok:true,result:batch}))});await assert.rejects(api.updates(0),/Invalid Telegram batch/);
 }
});
function detailed(n=1){return {ok:true,snapshotVersion:'1.0.0',source:'apps_script_review_status',capturedAt:new Date().toISOString(),enabled:true,
 topics:Array.from({length:n},(_,i)=>({topicId:`review-${i}`,title:`Тема ${i}`,reviewRevision:1,kind:'shared',
 components:{topic:'approved',body:'pending',hook1:'not_approved',hook2:'unverified',hook3:'binding_changed'}})),approvalWrites:false,productionAllowed:false};}
test('detailed panel shows each component and paginates without queue writes or approval reads',async t=>{
 const h=setup(t);h.options.readReviewStatus=async()=>detailed(6);h.options.readCurrentApprovals=async()=>{throw Error('not used')};
 await handleTelegramPanel(await h.verified(callback('panel:approvals:1')),h.options);
 assert.match(h.sent[0].text,/Тема 5/);assert.ok(!h.sent[0].text.includes('Тема 0'));
 for(const part of ['Тема: утверждено','Основа: ожидает решения','Хук 1: не утверждено (таблица)','Хук 2: нет подтверждения','Хук 3: пакет изменён'])assert.ok(h.sent[0].text.includes(part));
 assert.equal(h.queue.countJobs(),0);
});
test('disabled or unavailable detailed view never says Roman rejected everything or falls back to approval',async t=>{
 const h=setup(t);h.options.readReviewStatus=async()=>({...detailed(0),enabled:false});
 await handleTelegramPanel(await h.verified(callback('panel:approvals:0')),h.options);assert.match(h.sent[0].text,/не означает, что Роман отклонил/);
 h.options.readReviewStatus=async()=>{throw Error('private')};
 assert.equal((await handleTelegramPanel(await h.verified(callback('panel:approvals:0',3)),h.options)).blocked,true);
 assert.match(h.sent.at(-1).text,/Это не означает отказ/);assert.equal(h.queue.countJobs(),0);
});
