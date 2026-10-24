import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readCandidateCatalog,validateCandidateCatalog,installCandidateCatalog} from './telegram-candidates.mjs';
import {telegramApi} from './telegram-bot-api.mjs';
import {ProductionQueue} from './production-queue.mjs';
import {handleTelegramPanel} from './telegram-panel.mjs';
const catalog=()=>({catalogVersion:'1.0.0',reviewApprovalGranted:false,generationAllowed:false,renderAllowed:false,
 topics:[{candidateId:'offline-test',title:'Предложенная тема',businessTask:'Тестовая задача бизнеса',referenceUrl:'https://www.instagram.com/reel/offline-test/',
 evidenceNote:'Содержание и счётчики в этом тесте не проверены.',reviewStatus:'awaiting_roman_review'}]});
function setup(t){const q=new ProductionQueue(':memory:');t.after(()=>q.close());const sent=[];let incoming;
 const api=telegramApi({token:'123456:offline_candidates_token_123456789',fetchImpl:async(url,options)=>{
  const method=url.split('/').at(-1),body=JSON.parse(options.body);if(method==='sendMessage')sent.push(body);
  return new Response(JSON.stringify({ok:true,result:method==='getUpdates'?[incoming]:true}));
 }});
 const options={api,queue:q,allowedOperatorIds:['123'],readCurrentApprovals:async()=>{throw Error('approval source not called');},readCandidates:async()=>catalog()};
 return {q,sent,options,async update(text,actor=123){incoming={update_id:1,message:{text,from:{id:actor},chat:{id:actor,type:'private'}}};return (await api.updates(0))[0];},
 async callback(data){incoming={update_id:2,callback_query:{id:'candidate_cb',data,from:{id:123},message:{chat:{id:123,type:'private'}}}};return (await api.updates(0))[0];}};
}
test('candidate cards work with Google disabled/unavailable, never call approval reader or add jobs',async t=>{
 const h=setup(t);const result=await handleTelegramPanel(await h.update('/candidates'),h.options);
 assert.equal(result.readOnly,true);assert.equal(result.reviewApprovalGranted,false);assert.equal(h.q.countJobs(),0);
 assert.match(h.sent[0].text,/Ожидает просмотра Романом. Тема не согласована/);
 assert.ok(h.sent[0].reply_markup.inline_keyboard.flat().every(b=>!b.callback_data.startsWith('start:')));
});
test('authorization checked before private catalog read, no outsider reply or data',async t=>{
 const h=setup(t);let reads=0;h.options.readCandidates=async()=>{reads++;return catalog();};
 assert.equal((await handleTelegramPanel(await h.update('/candidates',456),h.options)).ignored,true);
 assert.equal(reads,0);assert.equal(h.sent.length,0);
});
test('approval flags, reviewed status, duplicate IDs and command fields cannot enter candidate view',()=>{
 const c=catalog(),topic=c.topics[0];
 for(const bad of [{...c,reviewApprovalGranted:true},{...c,generationAllowed:true},{...c,renderAllowed:true},
  {...c,topics:[{...topic,reviewStatus:'approved'}]}, {...c,topics:[topic,topic]}, {...c,command:'run'},
  {...c,topics:[{...topic,referenceUrl:'https://user:secret@www.instagram.com/reel/a/'}]}])assert.throws(()=>validateCandidateCatalog(bad));
});
test('candidate catalog is never accepted by production start and unavailable list does not infer approval',async t=>{
 const h=setup(t);h.options.readCurrentApprovals=async()=>catalog();
 assert.equal((await handleTelegramPanel(await h.update('/start'),h.options)).blocked,true);assert.equal(h.q.countJobs(),0);
 assert.ok(h.sent.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='panel:candidates:0'));
 h.options.readCandidates=async()=>{throw Error('private path')};
 assert.equal((await handleTelegramPanel(await h.update('/candidates'),h.options)).blocked,true);
 assert.ok(!h.sent.at(-1).text.includes('private path'));
});
test('candidate pages retain unreviewed status, no implicit approve or launch callback',async t=>{
 const h=setup(t);h.options.readCandidates=async()=>{const c=catalog();c.topics.push({...c.topics[0],candidateId:'offline-second',title:'Вторая тема'});return c;};
 await handleTelegramPanel(await h.callback('panel:candidates:1'),h.options);
 assert.match(h.sent[0].text,/Вторая тема/);assert.ok(!h.sent[0].text.includes('Предложенная тема'));assert.equal(h.q.countJobs(),0);
});
test('bounded local loader rejects missing, malformed and oversized catalog without path leakage',async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'candidates-'));const file=path.join(home,'input.json');
 try{
  for(const value of ['broken','x'.repeat(65537)]){await writeFile(file,value);await assert.rejects(readCandidateCatalog(file),e=>e.message==='Candidate catalog unavailable or invalid');}
  await assert.rejects(readCandidateCatalog(path.join(home,'missing.json')),e=>e.message==='Candidate catalog unavailable or invalid');
  await writeFile(file,JSON.stringify(catalog()));assert.deepEqual(await readCandidateCatalog(file),catalog());
 }finally{await rm(home,{recursive:true,force:true});}
});
test('explicit installer copies privately, repeats without overwrite and blocks changed catalog',async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'candidate-install-'));const input=path.join(home,'input.json');
 try{
  await writeFile(input,JSON.stringify(catalog()));
  assert.equal((await installCandidateCatalog(input,home)).status,'installed');assert.equal((await installCandidateCatalog(input,home)).status,'already_installed');
  const changed=catalog();changed.topics[0].title='Другой кандидат';await writeFile(input,JSON.stringify(changed));
  await assert.rejects(installCandidateCatalog(input,home),/Different candidate catalog/);
  const saved=await readCandidateCatalog(path.join(home,'RomanReels','telegram-panel','candidate-topics.json'));assert.deepEqual(saved,catalog());
 }finally{await rm(home,{recursive:true,force:true});}
});
