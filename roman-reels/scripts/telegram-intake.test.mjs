// Offline: fake Bot API, fictional MP4s made by ffmpeg, the real run-local-four-part.py in plan mode only.
// No token, live Telegram, ASR, render, Drive, Google or HeyGen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ProductionQueue} from './production-queue.mjs';
import {telegramApi,TELEGRAM_CLOUD_DOWNLOAD_LIMIT} from './telegram-bot-api.mjs';
import {handleTelegramPanel} from './telegram-panel.mjs';
import {FourPartIntake,launcherPlanner} from './telegram-intake.mjs';

const token='123456:only_offline_fake_token_123456789';
const python=process.env.ROMAN_INTAKE_PYTHON||(process.platform==='win32'?'python':'python3');
const incoming=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../pv/public/rr/incoming');
const fixtures=mkdtempSync(path.join(tmpdir(),'intake-fixtures-'));
const sources={};
for(const [i,part] of ['body','h1','h2','h3'].entries()){
  sources[part]=path.join(fixtures,`${part}.mp4`);  // fictional colour + tone, different per part
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=c=0x${(i*40+30).toString(16)}2050:s=180x320:r=25:d=1`,
    '-f','lavfi','-i',`sine=frequency=${300+i*100}:duration=1`,'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',sources[part]]);
}
test.after(()=>rmSync(fixtures,{recursive:true,force:true}));
const incomingBefore=existsSync(incoming)?readdirSync(incoming).sort():[];

function setup(t,{plan,files={}}={}){
  const root=mkdtempSync(path.join(tmpdir(),'intake-root-'));
  const queue=new ProductionQueue(':memory:');
  t.after(()=>{queue.close();rmSync(root,{recursive:true,force:true});});
  const sent=[],calls=[];let batch=[],failFile=null;
  const api=telegramApi({token,fetchImpl:async(url,options)=>{
    assert.equal(options.redirect,'error');
    if(url.startsWith(`https://api.telegram.org/file/bot${token}/`)){
      calls.push({method:'download',url});const name=url.split('/').at(-1);
      return new Response(files[name]??readFileSync(sources[name.replace('.mp4','')]));
    }
    const method=url.split('/').at(-1),body=JSON.parse(options.body);calls.push({method,body});
    if(method==='sendMessage')sent.push(body);
    if(method==='getFile'){
      if(failFile)return new Response(JSON.stringify({ok:false,error_code:failFile,description:'x'}),{status:failFile});
      const name=`${body.file_id.replace('id_','')}.mp4`,size=(files[name]??readFileSync(sources[name.replace('.mp4','')])).length;
      return new Response(JSON.stringify({ok:true,result:{file_id:body.file_id,file_size:size,file_path:`documents/${name}`}}));
    }
    return new Response(JSON.stringify({ok:true,result:method==='getUpdates'?batch:true}));
  }});
  const intake=new FourPartIntake(queue.db,{root,plan:plan??launcherPlanner({python}),now:()=>new Date('2026-10-24T10:00:00Z')});
  const options={api,queue,allowedOperatorIds:['123'],readCurrentApprovals:async()=>({items:[]}),intake};
  let nextId=1;
  const deliver=async u=>{batch=[{update_id:nextId++,...u}];return handleTelegramPanel((await api.updates(0))[0],options);};
  const chat={from:{id:123},chat:{id:123,type:'private'}};
  return {root,queue,intake,api,sent,calls,options,failFile:code=>failFile=code,
    text:text=>deliver({message:{...chat,text}}),
    doc:(part,{name=`HeyGen ${part}.mp4`,size,mime='video/mp4'}={})=>{
      const bytes=files[`${part}.mp4`]??(sources[part]&&readFileSync(sources[part]));
      return deliver({message:{...chat,document:{file_id:`id_${part}`,file_unique_id:`u_${part}`,file_name:name,mime_type:mime,file_size:size??bytes.length}}});
    },
    video:()=>deliver({message:{...chat,video:{file_id:'v',file_unique_id:'v',file_size:10}}}),
    press:(data,id='cb1')=>deliver({callback_query:{id,from:{id:123},message:{chat:{id:123,type:'private'}},data}}),
    lastButtons:()=>sent.at(-1).reply_markup?.inline_keyboard.flat().map(b=>b.callback_data)??[]};
}
async function fullKit(h){
  await h.text('/intake roman-seo-01');
  for(const [part,label] of [['body','body'],['h1','h1'],['h2','h2'],['h3','h3']]){
    await h.doc(part);const button=h.lastButtons().find(b=>b.endsWith(`:${label}`));
    await h.press(button);
  }
}

test('full fictional kit: explicit roles, real launcher plan, summary and one confirmation',async t=>{
  const h=setup(t);await fullKit(h);
  const summary=h.sent.at(-1);
  assert.match(summary.text,/Основа: 0,0 МБ · 1\.0\d с · 180×320 · SHA [a-f0-9]{8}/);
  assert.match(summary.text,/режиме плана/);assert.match(summary.text,/ASR и рендер не запускались/);
  const [confirm]=h.lastButtons();assert.match(confirm,/^ic:tg-20261024-[a-f0-9]{8}:1$/);assert.ok(Buffer.byteLength(confirm)<=64);
  const job=h.intake.db.prepare('SELECT * FROM intake_jobs').get(),dir=path.join(h.root,job.id);
  assert.equal(existsSync(path.join(dir,`run-${job.id}`)),false,'plan mode creates no launcher output');
  for(const [i,id] of ['cb-a','cb-a','cb-b'].entries()){
    const result=await h.press(confirm,id);
    assert.equal(i?result.alreadyConfirmed:result.confirmed,true);
  }
  assert.match(h.sent.at(-1).text,/уже подтверждён.*ничего не запускает/s);
  const frozen=JSON.parse(readFileSync(path.join(dir,'confirmed.json'),'utf8'));
  assert.equal(frozen.executeStarted,false);assert.equal(frozen.productionReady,false);
  for(const part of ['body','h1','h2','h3'])
    assert.equal(frozen.parts[part].sha256,execFileSync(python,['-c','import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())',sources[part]]).toString().trim());
  assert.deepEqual(readdirSync(dir).sort(),['confirmed.json','files','plan-v1.json']);
  assert.deepEqual(existsSync(incoming)?readdirSync(incoming).sort():[],incomingBefore,'no rr/incoming folders created');
});

test('incomplete kit says what is missing and offers no confirmation; stale button refused',async t=>{
  const h=setup(t);await h.text('/intake roman-seo-01');
  for(const part of ['body','h1','h2']){await h.doc(part);await h.press(h.lastButtons().find(b=>b.endsWith(`:${part}`)));}
  assert.match(h.sent.at(-1).text,/Не хватает: Хук 3\. Запуск недоступен/);
  assert.equal(h.sent.some(s=>s.reply_markup?.inline_keyboard.flat().some(b=>b.callback_data.startsWith('ic:'))),false);
  const job=h.intake.db.prepare('SELECT id FROM intake_jobs').get();
  assert.equal((await h.press(`ic:${job.id}:1`)).stale,true);
  await h.text('/intake');assert.match(h.sent.at(-1).text,/— Хук 3\n\nНе хватает: Хук 3/);
  await h.text('/intake other-topic');assert.match(h.sent.at(-1).text,/Уже открыт комплект.*после \/intake_cancel/s);
});

test('reassigning a role after the plan withdraws the old confirmation button',async t=>{
  const h=setup(t);await fullKit(h);const [old]=h.lastButtons();
  const body=h.intake.db.prepare("SELECT id FROM intake_files WHERE role='body'").get();
  await h.press(`ir:${body.id}:h1`);
  assert.match(h.sent.at(-1).text,/Не хватает: Основа/);
  assert.equal((await h.press(old)).stale,true);
  assert.equal(h.intake.db.prepare("SELECT count(*) n FROM intake_jobs WHERE state='confirmed'").get().n,0);
});

test('Telegram limits: >20 MB and compressed video refused before download; non-MP4 and no kit explained',async t=>{
  const h=setup(t);
  await h.doc('body');assert.match(h.sent.at(-1).text,/Сначала открой комплект/);
  await h.text('/intake roman-seo-01');
  await h.doc('body',{size:TELEGRAM_CLOUD_DOWNLOAD_LIMIT+1});
  assert.match(h.sent.at(-1).text,/20,0 МБ.*до 20 МБ каждый.*Файл не принят/s);
  await h.video();assert.match(h.sent.at(-1).text,/может пережать.*как файл/s);
  await h.doc('body',{name:'notes.txt',size:5,mime:'text/plain'});assert.match(h.sent.at(-1).text,/не MP4/);
  assert.equal(h.calls.filter(c=>c.method==='getFile'||c.method==='download').length,0);
});

test('replayed document is not downloaded twice; download errors never stop the coordinator',async t=>{
  const h=setup(t);await h.text('/intake roman-seo-01');
  await h.doc('body');await h.doc('body');
  assert.equal(h.calls.filter(c=>c.method==='download').length,1);assert.match(h.sent.at(-1).text,/уже получен/);
  h.failFile(400);assert.equal((await h.doc('h1')).failed,true);
  h.failFile(502);await assert.rejects(h.doc('h2'),/Telegram request failed/);  // transient: whole poll retried from cursor
  assert.equal(h.intake.files(h.intake.openJob('123').id).length,1);
});

test('oversized stream is cut and the partial file removed',async t=>{
  const big=Buffer.alloc(64);
  const h=setup(t,{files:{'h1.mp4':big}});await h.text('/intake roman-seo-01');
  const filePath='documents/h1.mp4',dest=path.join(h.root,'x.mp4');
  await assert.rejects(h.api.download(filePath,dest,32),/Telegram request failed/);
  assert.equal(existsSync(dest),false);
});

test('launcher rejection is reported plainly and nothing is confirmed',async t=>{
  const h=setup(t,{files:{'h3.mp4':Buffer.from('not a video at all')}});await fullKit(h);
  assert.match(h.sent.at(-1).text,/не прошёл проверку запускателем: Хук 3: не читается или не декодируется.*Ничего не запущено/s);
  assert.ok(!h.sent.at(-1).text.includes(h.root),'no private path in the reply');
  assert.equal(h.intake.db.prepare('SELECT state FROM intake_jobs').get().state,'collecting');
});

test('outsiders and group chats get nothing; intake folder must stay outside Git',async t=>{
  const h=setup(t);
  const fake=telegramApi({token,fetchImpl:async()=>new Response(JSON.stringify({ok:true,result:[
    {update_id:1,message:{from:{id:456},chat:{id:456,type:'private'},text:'/intake roman-seo-01'}},
    {update_id:2,message:{from:{id:123},chat:{id:-5,type:'group'},document:{file_id:'id_body',file_unique_id:'u',file_name:'a.mp4',file_size:9}}}]}))});
  for(const u of await fake.updates(0))assert.equal((await handleTelegramPanel(u,h.options)).ignored,true);
  assert.equal(h.sent.length,0);assert.equal(h.intake.db.prepare('SELECT count(*) n FROM intake_jobs').get().n,0);
  assert.throws(()=>new FourPartIntake(h.queue.db,{root:path.resolve(incoming,'..'),plan:()=>{}}),/outside the Git/);
});
