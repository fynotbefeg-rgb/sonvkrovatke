import test from 'node:test';
import assert from 'node:assert/strict';
import {runTelegramPoller} from './telegram-poll-recovery.mjs';
import {telegramApi,TelegramApiError,safeTelegramError} from './telegram-bot-api.mjs';
import {pollTelegramPanelOnce} from './telegram-panel.mjs';
import {ProductionQueue,productionKey} from './production-queue.mjs';
import {scriptHash} from './approval-manifest.mjs';

const token='123456:offline_recovery_token_123456789';
test('startup network interruption recovers and verifies identity before polling',async()=>{
 let identities=0,polls=0,stop=false;const waits=[],logs=[];
 const result=await runTelegramPoller({continuous:true,identify:async()=>{if(++identities===1)throw new TelegramApiError('network',{method:'getMe'});return '321';},
  poll:async id=>{assert.equal(id,'321');polls++;stop=true;return {processed:0};},wait:async ms=>waits.push(ms),log:r=>logs.push(r),shouldStop:()=>stop});
 assert.equal(result.cycles,1);assert.equal(identities,2);assert.equal(polls,1);assert.deepEqual(waits,[1000]);
 assert.equal(logs[1].event,'telegram_identity_verified');assert.equal(logs[2].event,'telegram_poll_completed');
});
test('backoff grows to30s and resets after successful poll, no reconnect storm',async()=>{
 let n=0,stop=false;const waits=[];
 await runTelegramPoller({continuous:true,identify:async()=> '321',poll:async()=>{
  n++;if(n===9)return {processed:0};throw new TelegramApiError('server_error',{status:503,method:'getUpdates'});
 },wait:async ms=>{waits.push(ms);if(waits.length===9)stop=true;},shouldStop:()=>stop});
 assert.deepEqual(waits,[1000,2000,4000,8000,16000,30000,30000,30000,1000]);
});
test('rate limiting honors retry_after; excessive delay stops rather than retrying early',async()=>{
 const api=telegramApi({token,fetchImpl:async()=>new Response(JSON.stringify({ok:false,error_code:429,parameters:{retry_after:7}}),{status:429})});
 let stop=false;const waits=[];
 await runTelegramPoller({continuous:true,identify:()=>api.identity(),poll:async()=>({processed:0}),wait:async ms=>{waits.push(ms);stop=true;},shouldStop:()=>stop});
 assert.deepEqual(waits,[7000]);
 const deferred=telegramApi({token,fetchImpl:async()=>new Response(JSON.stringify({ok:false,error_code:429,parameters:{retry_after:3600}}),{status:429})});
 await assert.rejects(deferred.updates(0),e=>e.kind==='rate_limit_deferred'&&!e.retryable);
 const malformed=telegramApi({token,fetchImpl:async()=>new Response(JSON.stringify({ok:false,parameters:{retry_after:'7'}}),{status:429})});
 await assert.rejects(malformed.updates(0),e=>e.kind==='protocol'&&!e.retryable);
});
test('invalid token, forbidden chat, second poller conflict and malformed responses stop with no retry',async()=>{
 for(const status of [401,403,409,400]){
  let calls=0;const api=telegramApi({token,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({ok:false,description:token}),{status});}});
  await assert.rejects(runTelegramPoller({continuous:true,identify:()=>api.identity(),poll:async()=>({processed:0}),wait:async()=>{throw Error('must not wait');}}),e=>e instanceof TelegramApiError&&!e.retryable);
  assert.equal(calls,1);
 }
 const api=telegramApi({token,fetchImpl:async()=>new Response('not-json')});
 await assert.rejects(runTelegramPoller({continuous:true,identify:()=>api.identity(),poll:async()=>({processed:0}),wait:async()=>{throw Error('must not wait');}}),e=>e.kind==='protocol');
});
test('explicit once probe retains fail-fast behavior and does not keep polling',async()=>{
 let calls=0;await assert.rejects(runTelegramPoller({identify:async()=> '321',poll:async()=>{calls++;throw new TelegramApiError('network');},
 wait:async()=>{throw Error('must not wait');}}),TelegramApiError);assert.equal(calls,1);
});
test('lost reply replays durable cursor, rechecks revoked approval, creates no second job and advances only after reply',async()=>{
 const queue=new ProductionQueue(':memory:');
 try{
  const item={topic_id:'recovery-test',hook_id:1,version_id:'R-recovery-test-h1',script_revision:1,hook_text:'Тест',script_text:'Тестовая речь',
   status:'approved',approved_by:'test@example.test',approved_at:'2026-10-10T00:00:00Z'};item.script_hash=scriptHash(item);
  const snapshot={items:[item]},ticket=queue.createTicket(snapshot,[item.version_id],'123');
  const update={update_id:20,callback_query:{id:'callback_test',data:ticket.callback_data,from:{id:123},message:{chat:{id:123,type:'private'}}}};
  let sends=0,acks=0,reads=0,revoked=false,stop=false;const offsets=[],texts=[];
  const api=telegramApi({token,fetchImpl:async(url,options)=>{
   const method=url.split('/').at(-1),body=JSON.parse(options.body);
   if(method==='getMe')return new Response(JSON.stringify({ok:true,result:{id:321,is_bot:true}}));
   if(method==='getUpdates'){offsets.push(body.offset);return new Response(JSON.stringify({ok:true,result:body.offset===0?[update]:[]}));}
   if(method==='answerCallbackQuery'&&++acks>1)return new Response(JSON.stringify({ok:false,description:'Bad Request: query is too old and response timeout expired or query ID is invalid'}),{status:400});
   if(method==='sendMessage'){texts.push(body.text);if(++sends===1)throw Error(token);}
   return new Response(JSON.stringify({ok:true,result:true}));
  }});
  await runTelegramPoller({continuous:true,identify:()=>api.identity(),poll:async botId=>{
   const result=await pollTelegramPanelOnce({api,botId,queue,allowedOperatorIds:['123'],readCurrentApprovals:async()=>{reads++;return revoked?{items:[]}:snapshot;}});
   stop=queue.telegramOffset('321')===21;return result;
  },wait:async()=>{assert.equal(queue.countJobs(),1);assert.equal(queue.telegramOffset('321'),0);revoked=true;},shouldStop:()=>stop});
  assert.equal(reads,2);assert.equal(queue.countJobs(),1);assert.equal(queue.telegramOffset('321'),21);assert.deepEqual(offsets,[0,0]);
  assert.match(texts.at(-1),/Запуск заблокирован/);
  const job=queue.getJob(productionKey(item));assert.equal(job.generation_started,false);assert.equal(job.render_allowed,false);
 }finally{queue.close();}
});
test('only exact expired acknowledgement is ignored; other400 callbacks still stop',async()=>{
 const api=telegramApi({token,fetchImpl:async()=>new Response(JSON.stringify({ok:false,description:'different bad request'}),{status:400})});
 await assert.rejects(api.answer('callback_test'),e=>e.kind==='invalid_request'&&!e.retryable);
});
test('diagnostics contain only whitelisted fields, never URL/token/raw API description',async()=>{
 const api=telegramApi({token,fetchImpl:async()=>{const e=Error(`https://api.telegram.org/bot${token}`);e.cause={code:'ECONNRESET'};throw e;}});
 let error;try{await api.updates(0);}catch(e){error=e;}
 assert.equal(error.kind,'network');assert.equal(error.networkCode,'ECONNRESET');
 const serialized=JSON.stringify(safeTelegramError(error));assert.ok(!serialized.includes(token)&&!serialized.includes('https://'));
 assert.deepEqual(safeTelegramError(Error(token)),{kind:'configuration_or_state',retryable:false});
});
