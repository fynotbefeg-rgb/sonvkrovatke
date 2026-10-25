// Offline: local four-MP4 kits from a fictional inbox, fake Bot API, real run-local-four-part.py in plan mode only.
// No token, live Telegram, ASR, render, Drive, Google or HeyGen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {appendFileSync,copyFileSync,existsSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,realpathSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ProductionQueue} from './production-queue.mjs';
import {telegramApi,TELEGRAM_CLOUD_DOWNLOAD_LIMIT} from './telegram-bot-api.mjs';
import {handleTelegramPanel} from './telegram-panel.mjs';
import {FourPartIntake,launcherPlanner,sha256} from './telegram-intake.mjs';

const token='123456:only_offline_fake_token_123456789';
const python=process.env.ROMAN_INTAKE_PYTHON||(process.platform==='win32'?'python':'python3');
const incoming=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../pv/public/rr/incoming');
const fixtures=mkdtempSync(path.join(tmpdir(),'local-kit-fixtures-'));
test.after(()=>rmSync(fixtures,{recursive:true,force:true}));
const sources={};
for(const [i,part] of ['body','h1','h2','h3'].entries()){
  sources[part]=path.join(fixtures,`${part}.mp4`);
  // The fictional body is lossless noise, larger than the 20 MB Bot API download limit.
  const [video,quality]=part==='body'?['nullsrc=s=640x360:r=25:d=3,geq=random(1)*255:128:128',['-qp','0','-preset','ultrafast']]:
    [`color=c=0x${(i*40+30).toString(16)}2050:s=180x320:r=25:d=1`,[]];
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',video,'-f','lavfi','-i',`sine=frequency=${300+i*100}:duration=${part==='body'?3:1}`,
    '-c:v','libx264',...quality,'-pix_fmt','yuv420p','-c:a','aac','-shortest',sources[part]]);
}
// Small body for kits whose size does not matter (pagination); still a decodable MP4.
sources.small=path.join(fixtures,'small-body.mp4');
execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=white:s=180x320:r=25:d=1','-f','lavfi','-i','sine=frequency=700:duration=1',
  '-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',sources.small]);
const kitFiles={body:'Основа HeyGen.mp4',h1:'hook-1.mp4',h2:'hook-2.mp4',h3:'hook-3.mp4'};
const incomingBefore=existsSync(incoming)?readdirSync(incoming).sort():[];

function setup(t,{dir,db=':memory:',counter={plans:0}}={}){
  const owned=!dir;dir??=mkdtempSync(path.join(tmpdir(),'local-kit-'));
  const root=path.join(dir,'intake'),inbox=path.join(dir,'inbox');
  mkdirSync(inbox,{recursive:true});
  const queue=new ProductionQueue(db);let closed=false;
  const close=()=>{if(!closed){closed=true;queue.close();}};
  t.after(()=>{close();if(owned)rmSync(dir,{recursive:true,force:true});});  // Windows: close SQLite before deleting
  const sent=[],calls=[];let batch=[],failSend=null;
  const api=telegramApi({token,fetchImpl:async(url,options)=>{
    const method=url.split('/').at(-1),body=JSON.parse(options.body);calls.push(method);
    if(method==='sendMessage'){if(failSend?.(body)){failSend=null;throw Error('lost reply');}sent.push(body);}
    return new Response(JSON.stringify({ok:true,result:method==='getUpdates'?batch:true}));
  }});
  const real=launcherPlanner({python});
  const intake=new FourPartIntake(queue.db,{root,inbox,plan:async a=>{counter.plans++;return real(a);},now:()=>new Date('2026-10-24T10:00:00Z')});
  const options={api,queue,allowedOperatorIds:['123'],readCurrentApprovals:async()=>({items:[]}),intake};
  let nextId=1;
  const deliver=async u=>{batch=[{update_id:nextId++,...u}];return handleTelegramPanel((await api.updates(0))[0],options);};
  const chat={from:{id:123},chat:{id:123,type:'private'}};
  const kit=(name,{parts=kitFiles,files=parts,topicId='roman-seo-02',manifest,small=false}={})=>{
    const folder=path.join(inbox,name);mkdirSync(folder);
    for(const [role,file] of Object.entries(files))if(sources[role]&&typeof file==='string'&&!file.includes('/')&&!file.includes('\\')&&!file.includes('..'))
      copyFileSync(small&&role==='body'?sources.small:sources[role],path.join(folder,file));
    writeFileSync(path.join(folder,'kit.json'),JSON.stringify(manifest??{topicId,parts}));
    return folder;
  };
  return {dir,root,inbox,intake,sent,calls,kit,close,plans:()=>counter.plans,failSend:when=>failSend=when,
    text:text=>deliver({message:{...chat,text}}),
    press:(data,id='cb1')=>deliver({callback_query:{id,from:{id:123},message:{chat:{id:123,type:'private'}},data}}),
    buttons:()=>sent.at(-1).reply_markup?.inline_keyboard.flat()??[]};
}
const offerFor=(h,name)=>h.buttons().find(b=>b.text.startsWith(`${name} ·`))?.callback_data;

test('full local kit with a body over 20 MB: listed, copied, SHA-checked, planned and confirmed once',async t=>{
  assert.ok(readFileSync(sources.body).length>TELEGRAM_CLOUD_DOWNLOAD_LIMIT,'fixture body must exceed the Bot API limit');
  const h=setup(t),folder=h.kit('ROMAN-SEO-02');
  await h.text('/intake_local');
  const offer=offerFor(h,'ROMAN-SEO-02');
  assert.match(offer,/^il:[a-f0-9-]{36}$/);assert.ok(Buffer.byteLength(offer)<=64);
  assert.ok(!h.sent.at(-1).text.includes(h.inbox)&&!offer.includes('ROMAN'),'no paths or names in the callback');
  await h.press(offer,'cb-offer');
  assert.match(h.sent.at(-2).text,/из локальной папки ROMAN-SEO-02\n✓ Основа: «ROMAN-SEO-02\/Основа HeyGen\.mp4»/);
  assert.match(h.sent.at(-1).text,/Основа: 2\d,\d МБ · 3\.0\d с · 640×360/);assert.match(h.sent.at(-1).text,/режиме плана/);
  const [confirm]=h.buttons().map(b=>b.callback_data);assert.match(confirm,/^ic:tg-20261024-[a-f0-9]{8}:1$/);
  const job=h.intake.db.prepare('SELECT * FROM intake_jobs').get(),jobDir=path.join(h.root,job.id);
  const plan=JSON.parse(readFileSync(path.join(jobDir,'plan-v1.json'),'utf8'));
  for(const part of ['body','h1','h2','h3']){
    assert.equal(path.dirname(realpathSync.native(plan.inputs[part].path)),realpathSync.native(path.join(jobDir,'files')),'launcher checked the job copies, not the inbox');
    assert.equal(plan.inputs[part].sha256,execFileSync(python,['-c','import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())',
      path.join(folder,kitFiles[part])]).toString().trim());
  }
  await h.press(offer,'cb-offer');  // replayed selection: summary again, nothing copied or planned
  assert.equal(h.buttons()[0].callback_data,confirm);assert.equal(h.plans(),1);
  assert.equal(readdirSync(path.join(jobDir,'files')).length,4);
  assert.equal((await h.press(confirm,'cb-ok')).confirmed,true);
  for(const id of ['cb-ok','cb-ok2']){const r=await h.press(confirm,id);assert.equal(r.alreadyConfirmed,true);assert.equal(r.confirmationRestored,false);}
  assert.equal(h.intake.db.prepare("SELECT count(*) n FROM intake_jobs WHERE state='confirmed'").get().n,1);
  await h.text('/intake_local');
  assert.match((await h.press(offerFor(h,'ROMAN-SEO-02'),'cb-new')).duplicate?'dup':'',/dup/);
  assert.match(h.sent.at(-1).text,/уже взят в задание/);
  assert.equal(h.intake.db.prepare('SELECT count(*) n FROM intake_jobs').get().n,1);
  assert.equal(readFileSync(path.join(folder,kitFiles.body)).equals(readFileSync(sources.body)),true,'inbox originals untouched');
  assert.ok(!h.calls.includes('getFile'),'no Bot API download');
  assert.deepEqual(existsSync(incoming)?readdirSync(incoming).sort():[],incomingBefore,'no rr/incoming folders created');
});

test('incomplete or malformed kits are listed as rejected without buttons',async t=>{
  const h=setup(t);
  h.kit('no-hook3',{parts:{body:kitFiles.body,h1:kitFiles.h1,h2:kitFiles.h2}});
  h.kit('missing-file',{files:{body:kitFiles.body,h1:kitFiles.h1,h2:kitFiles.h2}});
  h.kit('same-file',{parts:{...kitFiles,h3:kitFiles.h2}});
  h.kit('extra-role',{parts:{...kitFiles,h4:'x.mp4'}});
  mkdirSync(path.join(h.inbox,'no-manifest'));
  await h.text('/intake_local');
  const text=h.sent.at(-1).text;
  assert.match(text,/Готовых локальных комплектов нет/);
  assert.match(text,/✗ no-hook3: неполный, нет: Хук 3/);
  assert.match(text,/✗ missing-file: неполный, нет файла: Хук 3/);
  assert.match(text,/✗ same-file: один файл назначен двум ролям/);
  assert.match(text,/✗ extra-role: kit.json: лишние роли h4/);
  assert.match(text,/✗ no-manifest: нет kit.json/);
  assert.equal(h.sent.at(-1).reply_markup,undefined);
  assert.equal(h.intake.db.prepare('SELECT count(*) n FROM intake_jobs').get().n,0);
});

test('source changed after the listing: nothing copied, no job, fresh listing required',async t=>{
  const h=setup(t),folder=h.kit('kit-a');
  await h.text('/intake_local');const offer=offerFor(h,'kit-a');
  appendFileSync(path.join(folder,kitFiles.h2),Buffer.from([0]));
  const result=await h.press(offer);
  assert.equal(result.stale,true);assert.match(h.sent.at(-1).text,/изменился после показа списка: Хук 2.*Ничего не скопировано/s);
  assert.equal(h.intake.db.prepare('SELECT count(*) n FROM intake_jobs').get().n,0);
  assert.deepEqual(existsSync(h.root)?readdirSync(h.root):[],[]);assert.equal(h.plans(),0);
});

test('paths: Telegram arguments refused; traversal, absolute and nested names rejected',async t=>{
  const h=setup(t);
  writeFileSync(path.join(h.dir,'outside.mp4'),readFileSync(sources.h3));
  for(const [name,bad] of [['dotdot','../outside.mp4'],['absolute',path.join(h.dir,'outside.mp4')],['nested','sub/hook-3.mp4'],['backslash','sub\\hook-3.mp4']]){
    const folder=h.kit(name,{parts:{...kitFiles,h3:bad}});
    if(name==='nested'){mkdirSync(path.join(folder,'sub'));copyFileSync(sources.h3,path.join(folder,'sub','hook-3.mp4'));}
  }
  mkdirSync(path.join(h.inbox,'bad name!'));
  // A complete kit outside the inbox reached through a directory link must not be offered.
  const elsewhere=path.join(h.dir,'elsewhere');mkdirSync(elsewhere);
  for(const [role,file] of Object.entries(kitFiles))copyFileSync(sources[role],path.join(elsewhere,file));
  writeFileSync(path.join(elsewhere,'kit.json'),JSON.stringify({topicId:'roman-seo-02',parts:kitFiles}));
  let linked=true;
  try{symlinkSync(elsewhere,path.join(h.inbox,'linked'),'junction');}catch{linked=false;}
  await h.text(`/intake_local ${h.dir}`);
  assert.match(h.sent.at(-1).text,/Пути и аргументы не принимаются/);
  await h.text('/intake_local');
  const text=h.sent.at(-1).text;
  for(const name of ['dotdot','absolute','nested','backslash'])assert.match(text,new RegExp(`✗ ${name}: Хук 3: недопустимое имя файла`));
  assert.ok(!text.includes('bad name!'),'folders with unexpected names are not offered');
  if(linked)assert.ok(!h.sent.at(-1).reply_markup&&!/linked ·/.test(text),'linked folder outside the inbox not offered');
  assert.equal(h.sent.at(-1).reply_markup,undefined);
  assert.equal((await h.press('il:00000000-0000-4000-8000-000000000000')).stale,true,'unknown offer refused');
  assert.equal(h.intake.db.prepare('SELECT count(*) n FROM intake_jobs').get().n,0);
  assert.throws(()=>new FourPartIntake(h.intake.db,{root:h.root,inbox:path.join(h.root,'inbox'),plan:()=>{}}),/separate/);
  assert.throws(()=>new FourPartIntake(h.intake.db,{root:h.root,inbox:path.resolve(incoming,'..'),plan:()=>{}}),/outside the Git/);
});

test('lost reply after saving a local job: after reopening the DB, repeat continues with the same copies',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'local-kit-reopen-')),db=path.join(dir,'queue.sqlite'),counter={plans:0};
  const h=setup(t,{dir,db,counter});let r;
  t.after(()=>{h.close();r?.close();rmSync(dir,{recursive:true,force:true});});  // Windows: close SQLite before deleting
  h.kit('kit-a',{small:true});
  await h.text('/intake_local');const offer=offerFor(h,'kit-a');
  h.failSend(body=>body.text.includes('проверяю запускателем'));
  await assert.rejects(h.press(offer,'cb-a'),/Telegram request failed/);  // poll stops before advancing its cursor
  assert.equal(counter.plans,0,'saved before the plan, reply lost');
  h.close();
  r=setup(t,{dir,db,counter});
  await r.press(offer,'cb-a');  // the same callback delivered again
  assert.match(r.sent.at(-1).text,/режиме плана/);const [confirm]=r.buttons().map(b=>b.callback_data);
  assert.match(confirm,/^ic:tg-20261024-[a-f0-9]{8}:1$/);
  await r.text('/intake');assert.equal(r.buttons()[0].callback_data,confirm);
  await r.press(offer,'cb-a2');assert.equal(r.buttons()[0].callback_data,confirm);
  assert.equal(counter.plans,1,'plan ran exactly once');
  const jobs=r.intake.db.prepare('SELECT * FROM intake_jobs').all();
  assert.equal(jobs.length,1);
  assert.deepEqual(readdirSync(r.root),[jobs[0].id],'one job folder');
  assert.equal(readdirSync(path.join(r.root,jobs[0].id,'files')).length,4,'four copies, none repeated');
  assert.equal(r.intake.db.prepare('SELECT count(*) n FROM intake_files').get().n,4);
});

test('the eleventh kit is reachable by paging past old and broken folders',async t=>{
  const h=setup(t);
  for(let i=1;i<=11;i++){
    const name=`kit-${String(i).padStart(2,'0')}`;
    if(i<=6)h.kit(name,{parts:{body:kitFiles.body},small:true});  // old or broken folders sort first
    else h.kit(name,{small:true});
  }
  await h.text('/intake_local');
  assert.match(h.sent.at(-1).text,/Страница 1 из 2 \(папок: 11\)/);
  assert.equal(offerFor(h,'kit-11'),undefined);
  assert.match(h.sent.at(-1).text,/✗ kit-01: неполный/);
  const next=h.buttons().find(b=>b.text==='Далее').callback_data;assert.equal(next,'ilp:1');
  await h.press(next,'cb-next');
  assert.match(h.sent.at(-1).text,/Страница 2 из 2/);
  assert.ok(h.buttons().some(b=>b.text==='Назад')&&!h.buttons().some(b=>b.text==='Далее'));
  const eleventh=offerFor(h,'kit-11');assert.match(eleventh,/^il:/);
  assert.equal((await h.press('ilp:9','cb-far')).stale,true,'page out of range');
  await h.press(offerFor((await h.press('ilp:1','cb-back'),h),'kit-11'),'cb-11');
  assert.match(h.sent.at(-2).text,/из локальной папки kit-11/);assert.match(h.sent.at(-1).text,/режиме плана/);
  assert.equal(h.intake.db.prepare('SELECT topic_id FROM intake_jobs').get().topic_id,'roman-seo-02');
  assert.equal((await h.press('ilp:0','cb-open')).blocked,true,'no listing while a job is open');
});

// Optional editorial plan next to the four MP4s: structurally valid for the launcher, bound to the kit's originals.
const pngBytes=Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de','hex');
function editorialKit(h,name,{plan:change=x=>x,planName='editorial-plan.json'}={}){
  const folder=h.kit(name,{small:true});
  writeFileSync(path.join(folder,'insert-a.png'),pngBytes);
  const parts=Object.fromEntries(Object.entries(kitFiles).map(([p,f])=>[p,sha256(path.join(folder,f))]));
  const variant={assembledSha256:'0'.repeat(64),hookText:'Хук',scriptText:'Хук\n\nОснова',wordTimings:[],speechSegments:[],
    visualAssets:[{id:'insert-a',type:'image',file:'insert-a.png',rightsReference:'Own test card'}],montagePlan:{events:[]}};
  const plan=change({editorialPlanVersion:'1.0.0',topicId:'roman-seo-02',parts,
    files:{'insert-a.png':sha256(path.join(folder,'insert-a.png'))},variants:{1:variant,2:variant,3:variant}});
  writeFileSync(path.join(folder,'editorial-plan.json'),JSON.stringify(plan));
  writeFileSync(path.join(folder,'kit.json'),JSON.stringify({topicId:'roman-seo-02',parts:kitFiles,editorialPlan:planName}));
  return folder;
}

test('kit with an editorial plan: plan and PNG copied into the job, checked by the launcher and frozen by hashes',async t=>{
  const h=setup(t),folder=editorialKit(h,'with-plan');h.kit('without-plan',{small:true});
  await h.text('/intake_local');
  assert.ok(h.buttons().some(b=>b.text.startsWith('with-plan ·')&&b.text.endsWith('· план монтажа')));
  assert.ok(h.buttons().some(b=>b.text.startsWith('without-plan ·')&&!b.text.includes('план')));
  await h.press(offerFor(h,'with-plan'),'cb-a');
  assert.match(h.sent.at(-1).text,/План монтажа: SHA [0-9a-f]{8} · PNG 1/);
  const job=h.intake.db.prepare('SELECT * FROM intake_jobs').get(),jobDir=path.join(h.root,job.id),copy=path.join(jobDir,'editorial');
  assert.deepEqual(readdirSync(copy).sort(),['editorial-plan.json','insert-a.png']);
  assert.equal(sha256(path.join(copy,'insert-a.png')),sha256(path.join(folder,'insert-a.png')));
  assert.equal(sha256(path.join(copy,'editorial-plan.json')),sha256(path.join(folder,'editorial-plan.json')));
  const report=JSON.parse(readFileSync(path.join(jobDir,'plan-v1.json'),'utf8'));
  assert.equal(realpathSync.native(path.dirname(report.editorialPlan.path)),realpathSync.native(copy),'launcher checked the job copy');
  assert.deepEqual(report.editorialPlan.files,{'insert-a.png':{sha256:sha256(path.join(folder,'insert-a.png')),bytes:pngBytes.length}});
  assert.match(report.steps.at(-1).command.join(' '),/--editorial-plan .*--editorial-public-directory rr\/incoming\/run-tg-/);
  await h.press(h.buttons()[0].callback_data,'cb-ok');
  assert.match(h.sent.at(-1).text,/хеши четырёх файлов, плана монтажа и его PNG/);
  assert.deepEqual(JSON.parse(readFileSync(path.join(jobDir,'confirmed.json'),'utf8')).editorialPlan,report.editorialPlan);
  await h.text('/intake_local');await h.press(offerFor(h,'without-plan'),'cb-b');  // without a plan: exactly as before
  const other=h.intake.db.prepare('SELECT * FROM intake_jobs WHERE id!=?').get(job.id),otherDir=path.join(h.root,other.id);
  assert.ok(!existsSync(path.join(otherDir,'editorial')));
  const plain=JSON.parse(readFileSync(path.join(otherDir,'plan-v1.json'),'utf8'));
  assert.ok(!('editorialPlan' in plain)&&!plain.steps.at(-1).command.includes('--editorial-plan'));
  await h.press(h.buttons()[0].callback_data,'cb-ok2');
  assert.ok(!('editorialPlan' in JSON.parse(readFileSync(path.join(otherDir,'confirmed.json'),'utf8'))));
  assert.ok(!h.sent.at(-1).text.includes('плана монтажа'));
});

test('editorial plan: unsafe names, links outside the kit, wrong sources or PNG hashes are rejected in the listing',async t=>{
  const h=setup(t);
  writeFileSync(path.join(h.dir,'outside.png'),pngBytes);
  for(const [name,bad] of [['png-dotdot','../outside.png'],['png-absolute',path.join(h.dir,'outside.png')],['png-nested','sub/insert-a.png'],['png-type','insert-a.txt']])
    editorialKit(h,name,{plan:p=>({...p,files:{[bad]:p.files['insert-a.png']}})});
  editorialKit(h,'plan-dotdot',{planName:'../editorial-plan.json'});
  editorialKit(h,'plan-kit',{planName:'kit.json'});
  editorialKit(h,'other-source',{plan:p=>({...p,parts:{...p.parts,h2:'0'.repeat(64)}})});
  editorialKit(h,'png-hash',{plan:p=>({...p,files:{'insert-a.png':'1'.repeat(64)}})});
  editorialKit(h,'other-topic',{plan:p=>({...p,topicId:'roman-seo-99'})});
  const linkedKit=editorialKit(h,'png-link');let linked=true;
  rmSync(path.join(linkedKit,'insert-a.png'));
  try{symlinkSync(path.join(h.dir,'outside.png'),path.join(linkedKit,'insert-a.png'),'file');}catch{linked=false;}
  await h.text('/intake_local');
  const text=h.sent.at(-1).text;
  for(const name of ['png-dotdot','png-absolute','png-nested','png-type','plan-dotdot','plan-kit'])
    assert.match(text,new RegExp(`✗ ${name}: план монтажа: недопустимое имя файла`));
  assert.match(text,/✗ other-source: план монтажа: относится к другим исходникам/);
  assert.match(text,/✗ png-hash: план монтажа: insert-a\.png не совпал по SHA-256/);
  assert.match(text,/✗ other-topic: план монтажа: другая тема/);
  if(linked)assert.match(text,/✗ png-link: план монтажа: insert-a\.png: файл вне папки комплекта/);
  else{assert.match(text,/✗ png-link: план монтажа: нет файла insert-a\.png/);t.diagnostic('file symlinks are not permitted for this user');}
  assert.equal(h.sent.at(-1).reply_markup,undefined);
  assert.equal(h.intake.db.prepare('SELECT count(*) n FROM intake_jobs').get().n,0);
  const c=setup(t);  // a second inbox: one page holds ten folders
  editorialKit(c,'png-case',{plan:p=>({...p,files:{...p.files,'INSERT-A.png':p.files['insert-a.png']}})});
  await c.text('/intake_local');
  assert.match(c.sent.at(-1).text,/✗ png-case: план монтажа: имена PNG различаются только регистром/);
});

test('editorial PNG changed after the listing or before confirmation: nothing copied or confirmed',async t=>{
  const h=setup(t),folder=editorialKit(h,'kit-png');
  await h.text('/intake_local');const offer=offerFor(h,'kit-png');
  appendFileSync(path.join(folder,'insert-a.png'),Buffer.from([0]));
  assert.equal((await h.press(offer)).stale,true);
  assert.match(h.sent.at(-1).text,/изменился после показа списка.*Ничего не скопировано/s);
  assert.deepEqual(existsSync(h.root)?readdirSync(h.root):[],[]);
  writeFileSync(path.join(folder,'insert-a.png'),pngBytes);
  await h.text('/intake_local');await h.press(offerFor(h,'kit-png'),'cb-2');
  const job=h.intake.db.prepare('SELECT * FROM intake_jobs').get();
  writeFileSync(path.join(h.root,job.id,'editorial','insert-a.png'),'tampered');
  assert.equal((await h.press(h.buttons()[0].callback_data,'cb-ok')).stale,true);
  assert.match(h.sent.at(-1).text,/План монтажа или его PNG изменились после проверки/);
  assert.equal(h.intake.db.prepare('SELECT state FROM intake_jobs').get().state,'collecting');
  assert.ok(!existsSync(path.join(h.root,job.id,'confirmed.json')));
});
