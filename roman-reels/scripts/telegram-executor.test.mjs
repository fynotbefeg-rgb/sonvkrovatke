// Offline: stub launcher/ffmpeg processes and a fake Bot API; real SQLite, files and hashes.
// No token, live Telegram, ASR, render, Drive, Google or HeyGen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ProductionQueue} from './production-queue.mjs';
import {telegramApi,TELEGRAM_CLOUD_UPLOAD_LIMIT} from './telegram-bot-api.mjs';
import {handleTelegramPanel} from './telegram-panel.mjs';
import {FourPartIntake} from './telegram-intake.mjs';
import {compareTimes,ffmpegPreview,jobProcesses,processRunner,runExecutor,systemProcessTable,VIDEO_CACHE_BYTES} from './telegram-executor.mjs';
import {execFileSync,spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const token='123456:only_offline_fake_token_123456789';
const digest=b=>createHash('sha256').update(b).digest('hex');
// Process-table row of an executor; stub tables always contain the executor itself.
const proc=(pid,created,commandLine='node run-intake-executor.mjs')=>({pid,ppid:1,created,name:'node.exe',commandLine});
const selfRow=proc(process.pid,'2026-10-24T08:00:00.0000000Z','node telegram-executor.test.mjs');

function setup(t){
  const dir=mkdtempSync(path.join(tmpdir(),'executor-')),root=path.join(dir,'intake');mkdirSync(root);
  const queue=new ProductionQueue(':memory:');
  t.after(()=>{queue.close();rmSync(dir,{recursive:true,force:true});});  // Windows: close SQLite before deleting
  const sent=[],documents=[];let batch=[],failDocument=()=>false,starts=0;
  const api=telegramApi({token,fetchImpl:async(url,options)=>{
    assert.equal(options.redirect,'error');
    const method=url.split('/').at(-1);
    if(method==='sendDocument'){
      assert.ok(options.body instanceof FormData,'multipart upload');
      const file=options.body.get('document'),caption=options.body.get('caption');
      if(failDocument(caption))return new Response(JSON.stringify({ok:false,error_code:502,description:'x'}),{status:502});
      documents.push({chat:options.body.get('chat_id'),name:file.name,bytes:file.size,caption});
      return new Response(JSON.stringify({ok:true,result:{message_id:100+documents.length}}));
    }
    const body=JSON.parse(options.body);
    if(method==='sendMessage')sent.push(body);
    return new Response(JSON.stringify({ok:true,result:method==='getUpdates'?batch:true}));
  }});
  const intake=new FourPartIntake(queue.db,{root,plan:async()=>({ok:false}),startExecutor:async()=>{starts++;}});
  const options={api,queue,allowedOperatorIds:['123'],readCurrentApprovals:async()=>({items:[]}),intake};
  let nextId=1;
  const deliver=async u=>{batch=[{update_id:nextId++,...u}];return handleTelegramPanel((await api.updates(0))[0],options);};
  const chat={from:{id:123},chat:{id:123,type:'private'}};
  // A confirmed job as the intake leaves it: four copies, saved plan and confirmed.json.
  const job=(id)=>{
    const jobDir=path.join(root,id),files=path.join(jobDir,'files');mkdirSync(files,{recursive:true});
    const inputs={};
    for(const p of ['body','h1','h2','h3']){const f=path.join(files,`${p}.mp4`),b=Buffer.from(`${id}-${p}`);writeFileSync(f,b);
      inputs[p]={path:f,sha256:digest(b),bytes:b.length,metadata:{duration:1,width:1080,height:1920}};}
    const plan={execute:false,output:path.join(jobDir,`run-${id}`),inputs};
    queue.db.prepare(`INSERT INTO intake_jobs (id,actor_id,topic_id,state,plan_version,plan,created_at,confirmed_at)
      VALUES (?,'123','roman-seo-01','confirmed',1,?,'2026-10-24T10:00:00Z','2026-10-24T10:01:00Z')`).run(id,JSON.stringify(plan));
    writeFileSync(path.join(jobDir,'confirmed.json'),JSON.stringify({jobId:id,parts:Object.fromEntries(Object.entries(inputs).map(([p,i])=>[p,{sha256:i.sha256}]))}));
    return {jobDir,plan};
  };
  const runs=[];
  // Stub of run-local-four-part.py --execute: writes the launch report and three renders like the real one.
  const execute=({sizes={},code=0,complete=true}={})=>async({args,stdout,stderr})=>{
    runs.push(args);writeFileSync(stdout,'stub launcher\n',{flag:'wx'});writeFileSync(stderr,'',{flag:'wx'});
    if(code)return code;
    const out=args[args.indexOf('--out')+1];mkdirSync(path.join(out,'montage'),{recursive:true});
    const renders=[1,2,3].map(n=>{const b=Buffer.alloc(sizes[n]??1000,n);mkdirSync(path.join(out,'montage',`h${n}`));
      writeFileSync(path.join(out,'montage',`h${n}`,'development.mp4'),b);return {hookNumber:n,technicalPassed:true,outputSha256:digest(b)};});
    writeFileSync(path.join(out,'launch-report.json'),JSON.stringify({complete,renderConcurrency:1,offthreadVideoCacheSizeInBytes:VIDEO_CACHE_BYTES,renders}));
    return 0;
  };
  const previews=[];
  const makePreview=(size=500)=>async(source,target)=>{previews.push(source);writeFileSync(target,Buffer.alloc(size,7),{flag:'wx'});};
  const executor=(more={})=>runExecutor({db:queue.db,root,api,execute:execute(),makePreview:makePreview(),
    modelPath:'C:/model',modelRevision:'a'.repeat(40),browser:'C:/edge.exe',now:()=>new Date('2026-10-24T11:00:00Z'),
    processTable:async()=>[selfRow],pollMs:50,settleMs:3000,...more});  // stub runs: no real child processes
  return {dir,root,queue,sent,documents,runs,previews,job,execute,makePreview,executor,starts:()=>starts,failDocument:f=>failDocument=f,
    text:text=>deliver({message:{...chat,text}}),
    press:(data,id='cb1')=>deliver({callback_query:{id,from:{id:123},message:{chat:{id:123,type:'private'}},data}}),
    buttons:()=>sent.at(-1).reply_markup?.inline_keyboard.flat()??[],
    hold:()=>queue.db.prepare('SELECT * FROM intake_executor_hold').get(),
    holdNotices:()=>sent.filter(m=>/^Очередь монтажа остановлена/.test(m.text)),
    // The operator presses «Проверено, продолжить очередь» on the hold message.
    confirm:()=>{const b=sent.filter(m=>/^Очередь монтажа остановлена/.test(m.text)).at(-1).reply_markup.inline_keyboard[0][0];
      return deliver({callback_query:{id:`cb-confirm-${nextId}`,from:{id:123},message:{chat:{id:123,type:'private'}},data:b.callback_data}});},
    run:id=>queue.db.prepare('SELECT * FROM intake_runs WHERE job_id=?').get(id)};
}

test('confirmed job waits for an explicit button; one queued run; executor runs, verifies and sends originals',async t=>{
  const h=setup(t),{jobDir,plan}=h.job('tg-20261024-07f1fd1a');
  await h.text('/montage');
  assert.match(h.sent.at(-1).text,/Подтверждены, монтаж не запускался: tg-20261024-07f1fd1a/);
  assert.equal(h.run('tg-20261024-07f1fd1a'),undefined,'an earlier confirmed job is never queued automatically');
  assert.equal(h.starts(),0);
  const button=h.buttons().find(b=>b.callback_data==='ix:tg-20261024-07f1fd1a');assert.ok(button);
  assert.equal((await h.press(button.callback_data,'cb-a')).queued,true);
  assert.match(h.sent.at(-1).text,/поставлен в очередь: ожидает.*Бот остаётся доступен/s);
  assert.equal((await h.press(button.callback_data,'cb-b')).queued,false);assert.match(h.sent.at(-1).text,/уже в очереди: ожидает/);
  assert.equal(h.queue.db.prepare('SELECT count(*) n FROM intake_runs').get().n,1);
  assert.equal(h.starts(),2,'the bot only starts the detached worker; it never runs the montage itself');
  const result=await h.executor();
  assert.deepEqual(result,{processed:1});
  const args=h.runs[0];
  assert.ok(args.includes('--execute'));assert.equal(args[args.indexOf('--out')+1],plan.output);
  assert.equal(args[args.indexOf('--body')+1],plan.inputs.body.path);
  assert.equal(h.run('tg-20261024-07f1fd1a').state,'done');
  assert.deepEqual(h.documents.map(d=>[d.name,d.bytes]),[1,2,3].map(n=>[`tg-20261024-07f1fd1a-h${n}.mp4`,1000]));
  assert.ok(h.documents.every(d=>d.chat==='123'&&/оригинал/.test(d.caption)));
  assert.ok(h.sent.some(m=>/обрабатывается/.test(m.text)));assert.match(h.sent.at(-1).text,/готово\. Отправлено рилсов: 3 из 3/);
  const exec=path.join(jobDir,'executor');
  for(const f of ['steps.json','result.json','launcher.stdout.log','launcher.stderr.log'])assert.ok(existsSync(path.join(exec,f)),f);
  assert.deepEqual(JSON.parse(readFileSync(path.join(exec,'steps.json'),'utf8')).map(s=>s.name),['verify-hashes','launcher','verify-results','prepare-delivery','done']);
  await h.text('/montage');assert.match(h.sent.at(-1).text,/tg-20261024-07f1fd1a · roman-seo-01: готово · отправлено 3 из 3/);
  assert.deepEqual(await h.executor(),{processed:0});assert.equal(h.runs.length,1);assert.equal(h.documents.length,3,'nothing repeated');
});

test('changed copy after confirmation fails before the launcher and is not retried',async t=>{
  const h=setup(t),{jobDir,plan}=h.job('tg-20261024-aaaaaaaa');
  await h.press('ix:tg-20261024-aaaaaaaa');
  writeFileSync(plan.inputs.h2.path,'tampered');
  await h.executor();
  const run=h.run('tg-20261024-aaaaaaaa');
  assert.equal(run.state,'failed');assert.match(run.error,/Хук 2: SHA-256 копии изменился/);
  assert.equal(h.runs.length,0,'launcher not started');
  assert.match(h.sent.at(-1).text,/ошибка на шаге verify-hashes.*Повтор автоматически не запускается/s);
  assert.ok(existsSync(path.join(jobDir,'executor','error.json')));
  assert.deepEqual(await h.executor(),{processed:0});
  await h.press('ix:tg-20261024-aaaaaaaa','cb-again');assert.match(h.sent.at(-1).text,/уже в очереди: ошибка/);
  assert.equal(h.run('tg-20261024-aaaaaaaa').state,'failed');
});

test('launcher failure keeps logs, reports ошибка and never re-runs automatically',async t=>{
  const h=setup(t),{jobDir}=h.job('tg-20261024-bbbbbbbb');
  await h.press('ix:tg-20261024-bbbbbbbb');
  await h.executor({execute:h.execute({code:3})});
  assert.equal(h.run('tg-20261024-bbbbbbbb').state,'failed');
  assert.match(h.sent.at(-1).text,/ошибка на шаге launcher — запускатель завершился с кодом 3/);
  assert.equal(readFileSync(path.join(jobDir,'executor','launcher.stdout.log'),'utf8'),'stub launcher\n');
  assert.deepEqual(JSON.parse(readFileSync(path.join(jobDir,'executor','error.json'),'utf8')).step,'launcher');
  await h.executor();assert.equal(h.runs.length,1);assert.equal(h.documents.length,0);
  await h.text('/montage');assert.match(h.sent.at(-1).text,/: ошибка — запускатель завершился с кодом 3/);
});

test('run interrupted by a restart becomes ошибка and holds the queue until the operator confirms a manual check',async t=>{
  const h=setup(t);h.job('tg-20261024-cccccccc');h.job('tg-20261024-dddddddd');
  await h.press('ix:tg-20261024-cccccccc','cb-c');await h.press('ix:tg-20261024-dddddddd','cb-d');
  const dead={pid:999999,created:'2026-10-24T09:00:00.0000000Z'};
  h.queue.db.prepare(`UPDATE intake_runs SET state='running',pid=999999,executor=?,step='launcher' WHERE job_id='tg-20261024-cccccccc'`).run(JSON.stringify(dead));
  assert.throws(()=>h.queue.db.prepare(`UPDATE intake_runs SET state='running' WHERE job_id='tg-20261024-dddddddd'`).run(),/UNIQUE/,'second running row impossible');
  h.queue.db.prepare(`INSERT INTO intake_executor_lock (id,token,pid,created,acquired_at) VALUES (1,'dead',?,?,'2026-10-24T09:00:00Z')`).run(dead.pid,dead.created);
  const holder=proc(dead.pid,dead.created);
  assert.deepEqual(await h.executor({processTable:async()=>[selfRow,holder]}),{lockBusy:true,processed:0},'live lock holder: nothing claimed');
  assert.equal(h.runs.length,0);assert.equal(h.run('tg-20261024-cccccccc').state,'running');assert.equal(h.hold(),undefined,'a live holder is no hold');
  // Same PID, other creation time: the PID was reused by another process, so the lock is stale.
  assert.deepEqual(await h.executor({processTable:async()=>[selfRow,{...holder,created:'2026-10-24T10:30:00.0000000Z'}]}),{processed:0,blocked:true});
  const c=h.run('tg-20261024-cccccccc');
  assert.equal(c.state,'failed');assert.match(c.error,/прервано на шаге launcher/);
  assert.equal(h.holdNotices().length,1);assert.match(h.holdNotices()[0].text,/tg-20261024-cccccccc прерван на шаге launcher.*ручная проверка/s);
  assert.equal(h.run('tg-20261024-dddddddd').state,'waiting','crash: the queue holds');
  assert.deepEqual(await h.executor(),{processed:0,blocked:true});assert.equal(h.holdNotices().length,1,'not repeated');
  await h.confirm();
  assert.match(h.sent.at(-1).text,/Ручная проверка подтверждена/);
  await h.executor();
  assert.equal(h.runs.length,1,'only the other job ran');assert.equal(h.run('tg-20261024-dddddddd').state,'done');
  assert.equal(h.run('tg-20261024-cccccccc').state,'failed','not retried');
  assert.equal(h.queue.db.prepare('SELECT count(*) n FROM intake_executor_lock').get().n,0,'released by its owner');
});

test('render over the 50 MB upload limit: original kept locally, viewing copy sent',async t=>{
  const h=setup(t),{plan}=h.job('tg-20261024-eeeeeeee');
  await h.press('ix:tg-20261024-eeeeeeee');
  await h.executor({execute:h.execute({sizes:{2:TELEGRAM_CLOUD_UPLOAD_LIMIT+1}})});
  assert.deepEqual(h.previews,[path.join(plan.output,'montage','h2','development.mp4')]);
  assert.equal(readFileSync(h.previews[0]).length,TELEGRAM_CLOUD_UPLOAD_LIMIT+1,'original untouched');
  assert.deepEqual(h.documents.map(d=>d.bytes),[1000,500,1000]);
  assert.match(h.documents[1].caption,/копия для просмотра \(оригинал на ноутбуке\)/);
  const t2=setup(t);t2.job('tg-20261024-ffffffff');await t2.press('ix:tg-20261024-ffffffff');
  await t2.executor({execute:t2.execute({sizes:{3:TELEGRAM_CLOUD_UPLOAD_LIMIT+1}}),makePreview:t2.makePreview(TELEGRAM_CLOUD_UPLOAD_LIMIT+1)});
  assert.equal(t2.documents.length,2);assert.match(t2.sent.at(-1).text,/Больше лимита Telegram 50 МБ.*хук 3/s);
});

test('failed delivery is resent on request without repeating the montage',async t=>{
  const h=setup(t);h.job('tg-20261024-12345678');
  await h.press('ix:tg-20261024-12345678');
  h.failDocument(caption=>/хуком 3/.test(caption));
  await h.executor();
  assert.equal(h.documents.length,2);assert.match(h.sent.at(-1).text,/Отправлено рилсов: 2 из 3.*Не отправлены: хук 3/s);
  await h.text('/montage');
  const retry=h.buttons().find(b=>b.callback_data==='id:tg-20261024-12345678');assert.ok(retry);
  h.failDocument(()=>false);
  const before=h.starts();
  assert.equal((await h.press(retry.callback_data,'cb-retry')).redelivery,1);assert.equal(h.starts(),before+1);
  await h.executor();
  assert.equal(h.runs.length,1,'montage ran once');
  assert.deepEqual(h.documents.map(d=>d.name.slice(-6)),['h1.mp4','h2.mp4','h3.mp4']);
  await h.press(retry.callback_data,'cb-retry2');assert.match(h.sent.at(-1).text,/Неотправленных рилсов нет/);
});

test('sendDocument refuses files over the Telegram upload limit before any request',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'executor-doc-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let calls=0;const api=telegramApi({token,fetchImpl:async()=>{calls++;return new Response('{}');}});
  const big=path.join(dir,'big.mp4');writeFileSync(big,Buffer.alloc(TELEGRAM_CLOUD_UPLOAD_LIMIT+1));
  await assert.rejects(api.sendDocument(123,big),/upload limit/);assert.equal(calls,0);
});

test('real runners: launcher process logs and exit code; ffmpeg viewing copy keeps the audio stream',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'executor-run-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const code=await processRunner({python:process.execPath})({args:['-e','console.log("step");console.error("warn");process.exit(2)'],
    stdout:path.join(dir,'out.log'),stderr:path.join(dir,'err.log')});
  assert.equal(code,2);assert.equal(readFileSync(path.join(dir,'out.log'),'utf8').trim(),'step');assert.equal(readFileSync(path.join(dir,'err.log'),'utf8').trim(),'warn');
  const source=path.join(dir,'render.mp4'),copy=path.join(dir,'copy.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=1080x1920:r=25:d=1','-f','lavfi','-i','sine=frequency=440:duration=1',
    '-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',source]);
  const before=readFileSync(source);
  await ffmpegPreview()(source,copy);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',copy]).toString()).streams;
  assert.equal(probe.find(s=>s.codec_type==='video').width,720);
  const audio=f=>execFileSync('ffmpeg',['-v','error','-i',f,'-map','0:a','-c','copy','-f','md5','-']).toString();
  assert.equal(audio(copy),audio(source),'audio packets copied unchanged');
  assert.ok(readFileSync(source).equals(before),'original untouched');
  await assert.rejects(ffmpegPreview()(source,copy),/ffmpeg exit/,'never overwrites an existing copy');
});

// Harmless real processes: Node children instead of Python/Remotion/browser; the job ID in a command line is the marker.
// The executor never ends processes; only the tests end what they started.
const nodeChild=(args,{detached=false}={})=>{const c=spawn(process.execPath,args,{detached,stdio:'ignore',windowsHide:true});if(detached)c.unref();return c;};
const isLive=async pid=>(await systemProcessTable()).some(p=>p.pid===pid);
async function waitGone(pid,ms=15000){const end=Date.now()+ms;while(Date.now()<end){if(!await isLive(pid))return true;await delay(300);}return false;}
const endAll=pids=>{for(const pid of pids)try{process.kill(pid);}catch{}};
const realOptions={processTable:systemProcessTable,trackMs:200,pollMs:200,settleMs:3000};
const hang=`setInterval(()=>{},1000)`;
// The grandchild is detached: a plain Node child on Windows is ended together with its parent (libuv job object).
const withGrandchild=pidFile=>`const {spawn}=require('child_process');const g=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});g.unref();`+
  `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(g.pid));setInterval(()=>{},1000);`;

test('processRunner: missing Python is a clear error; log files closed once and removable',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'executor-nopy-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const missing=path.join(dir,'no-such-python.exe');
  await assert.rejects(processRunner({python:missing})({args:['x.py'],stdout:path.join(dir,'o.log'),stderr:path.join(dir,'e.log')}),
    err=>/Python не найден/.test(err.message)&&!/EBADF/.test(err.message));
  rmSync(path.join(dir,'o.log'));rmSync(path.join(dir,'e.log'));  // Windows refuses to delete a file that is still open
  await delay(200);  // a late second close would surface here as an uncaught EBADF
});

test('executor death: a running job with live processes is not declared interrupted and blocks the next montage',async t=>{
  const h=setup(t);h.job('tg-20261024-99999999');h.job('tg-20261024-88888888');
  await h.press('ix:tg-20261024-99999999','cb-1');await h.press('ix:tg-20261024-88888888','cb-2');
  // The previous executor died (its PID is gone); an orphaned job process still runs: marked by the job ID,
  // and a second one recorded only by PID and creation time.
  const marked=nodeChild(['-e','setInterval(()=>{},1000)','tg-20261024-99999999'],{detached:true});
  const recorded=nodeChild(['-e','setInterval(()=>{},1000)'],{detached:true});
  t.after(()=>{for(const c of [marked,recorded])try{process.kill(c.pid);}catch{}});
  await delay(500);
  const created=(await systemProcessTable()).find(p=>p.pid===recorded.pid).created;
  h.queue.db.prepare(`UPDATE intake_runs SET state='running',pid=999999,executor=?,processes=?,step='launcher' WHERE job_id='tg-20261024-99999999'`)
    .run(JSON.stringify({pid:999999,created:'2026-10-24T09:00:00.0000000Z'}),JSON.stringify([{pid:recorded.pid,created}]));
  h.queue.db.prepare(`UPDATE intake_runs SET state='waiting' WHERE job_id='tg-20261024-88888888'`).run();
  // /montage alone (no waiting/pending needed for this) starts a check of the stuck run.
  h.queue.db.prepare(`UPDATE intake_runs SET state='failed' WHERE job_id='tg-20261024-88888888'`).run();
  const before=h.starts();await h.text('/montage');assert.equal(h.starts(),before+1,'/montage triggers the check');
  h.queue.db.prepare(`UPDATE intake_runs SET state='waiting' WHERE job_id='tg-20261024-88888888'`).run();
  assert.deepEqual(await h.executor({...realOptions}),{processed:0,blocked:true});
  assert.equal(h.run('tg-20261024-99999999').state,'running','not declared interrupted while its processes live');
  assert.equal(h.run('tg-20261024-88888888').state,'waiting');assert.equal(h.runs.length,0,'next montage not started');
  process.kill(marked.pid);assert.ok(await waitGone(marked.pid));
  assert.deepEqual(await h.executor({...realOptions}),{processed:0,blocked:true},'recorded process still alive');
  assert.equal(h.holdNotices().length,1,'one hold notice for the stuck run');
  process.kill(recorded.pid);assert.ok(await waitGone(recorded.pid));
  assert.deepEqual(await h.executor({...realOptions}),{processed:0,blocked:true},'processes gone: the hold stays');
  assert.equal(h.run('tg-20261024-99999999').state,'failed');assert.match(h.run('tg-20261024-99999999').error,/прервано на шаге launcher/);
  assert.equal(h.runs.length,0);assert.equal(h.holdNotices().length,1,'not repeated');
  await h.confirm();await h.executor({...realOptions});
  assert.equal(h.runs.length,1,'the other job runs only after the confirmation; the interrupted one is not repeated');
  assert.equal(h.run('tg-20261024-88888888').state,'done');
});

test('a failed run whose processes outlive it blocks the next montage until they end and the operator confirms',async t=>{
  const h=setup(t);h.job('tg-20261024-55555555');h.job('tg-20261024-44444444');
  await h.press('ix:tg-20261024-55555555','cb-1');await h.press('ix:tg-20261024-44444444','cb-2');
  const survivor=nodeChild(['-e','setInterval(()=>{},1000)'],{detached:true});t.after(()=>{try{process.kill(survivor.pid);}catch{}});
  await delay(500);
  const created=(await systemProcessTable()).find(p=>p.pid===survivor.pid).created;
  h.queue.db.prepare(`UPDATE intake_runs SET state='failed',processes=? WHERE job_id='tg-20261024-55555555'`).run(JSON.stringify([{pid:survivor.pid,created}]));
  assert.deepEqual(await h.executor({...realOptions}),{processed:0,blocked:true});
  assert.equal(h.run('tg-20261024-44444444').state,'waiting');
  // Confirming while the process is still visible: the queue resumes the check, sees it and holds again (one notice).
  await h.confirm();
  assert.deepEqual(await h.executor({...realOptions}),{processed:0,blocked:true});
  assert.equal(h.holdNotices().length,2,'a new hold after the confirmation, announced once');
  process.kill(survivor.pid);assert.ok(await waitGone(survivor.pid));
  assert.deepEqual(await h.executor({...realOptions}),{processed:0,blocked:true},'gone, but the hold stays until confirmed');
  await h.confirm();await h.executor({...realOptions});
  assert.equal(h.run('tg-20261024-44444444').state,'done');
});

test('two executors recover the same stale lock: the loser with an outdated snapshot neither interrupts nor claims',async t=>{
  const h=setup(t);h.job('tg-20261024-22222222');h.job('tg-20261024-11111111');
  for(const [id,cb] of [['tg-20261024-22222222','cb-2'],['tg-20261024-11111111','cb-3']])await h.press(`ix:${id}`,cb);
  // Executor D died holding the lock between runs; jobs 2 and 1 wait.
  const D=proc(999998,'2026-10-24T09:00:00.0000000Z'),A=proc(5001,'2026-10-24T10:00:00.0000000Z'),B=proc(5002,'2026-10-24T10:00:01.0000000Z');
  h.queue.db.prepare(`INSERT INTO intake_executor_lock (id,token,pid,created,acquired_at) VALUES (1,'token-d',?,?,'2026-10-24T09:00:00Z')`).run(D.pid,D.created);
  // B holds its montage until released, so its lock and its running row are live while A tries.
  let release,started;const gate=new Promise(r=>release=r),inside=new Promise(r=>started=r);
  const blockingExecute=async options=>{started();await gate;return h.execute()(options);};
  let bDone;
  // A: identity, then reads holder D; its next table was taken before B appeared (outdated), and B wins meanwhile.
  let aCalls=0;
  const aTable=async()=>{
    aCalls++;
    if(aCalls===2){bDone=h.executor({pid:B.pid,processTable:async()=>[A,B],execute:blockingExecute});await inside;}
    return [A];  // neither D nor B: D is gone, B is missing from the outdated snapshot
  };
  const a=await h.executor({pid:A.pid,processTable:aTable});
  assert.deepEqual(a,{lockBusy:true,processed:0},'compare-and-swap on token-d fails: B already replaced it');
  const lock=h.queue.db.prepare('SELECT * FROM intake_executor_lock').get();
  assert.equal(lock.pid,B.pid,'the winner keeps its lock');
  const running=h.run('tg-20261024-22222222');
  assert.equal(running.state,'running');assert.equal(JSON.parse(running.executor).pid,B.pid,'B runs job 2');
  assert.equal(h.run('tg-20261024-11111111').state,'waiting','the loser claimed nothing');
  // A second attempt while B works: the holder is read first, so the fresh table contains B — busy, no recovery.
  assert.deepEqual(await h.executor({pid:A.pid,processTable:async()=>[A,B]}),{lockBusy:true,processed:0});
  assert.equal(h.run('tg-20261024-22222222').state,'running','the live run of B is not declared interrupted');
  assert.equal(h.queue.db.prepare('SELECT pid FROM intake_executor_lock').get().pid,B.pid);
  assert.equal(h.hold(),undefined,'a live competitor is not a hold');
  release();
  assert.deepEqual(await bDone,{processed:2});
  assert.equal(h.run('tg-20261024-22222222').state,'done');assert.equal(h.run('tg-20261024-11111111').state,'done');
  assert.equal(h.runs.length,2,'each montage ran once');
  assert.equal(h.queue.db.prepare('SELECT count(*) n FROM intake_executor_lock').get().n,0);
});

test('only the owner releases the lock: a row with another token survives the old owner finishing',async t=>{
  const h=setup(t);h.job('tg-20261024-0000000a');await h.press('ix:tg-20261024-0000000a');
  const C=proc(5003,'2026-10-24T10:00:02.0000000Z');
  // While the executor works, its lock row is (wrongly) replaced by C; finishing must not delete C's lock.
  const execute=async options=>{
    h.queue.db.prepare(`UPDATE intake_executor_lock SET token='token-c',pid=?,created=? WHERE id=1`).run(C.pid,C.created);
    return h.execute()(options);
  };
  await h.executor({execute,processTable:async()=>[selfRow,C]});
  assert.equal(h.run('tg-20261024-0000000a').state,'done');
  assert.equal(h.queue.db.prepare('SELECT token FROM intake_executor_lock').get()?.token,'token-c');
});

test('orphan linking through an exited recorded parent respects creation time and PID reuse',()=>{
  const T=n=>`2026-10-24T10:00:${String(n).padStart(2,'0')}.0000000Z`;
  const run={job_id:'tg-20261024-0000000d',processes:JSON.stringify([{pid:100,ppid:1,created:T(0),name:'python.exe',lastSeen:T(5)}])};
  const child=(pid,ppid,n)=>({...proc(pid,T(n),'node step.js'),ppid});
  const pids=list=>list.map(p=>p.pid).sort((a,b)=>a-b);
  // Parent 100 has exited. 200 was created while 100 was seen holding its PID: owned, with its child 201.
  // 300 was created after the last sighting of 100: the PID may have been reused, so only uncertain (with 301).
  let r=jobProcesses([selfRow,child(200,100,3),child(201,200,4),child(300,100,7),child(301,300,8),child(500,999,1)],run,process.pid);
  assert.deepEqual(pids(r.owned),[200,201]);assert.deepEqual(pids(r.uncertain),[300,301]);
  // PID 100 reused by an unrelated process created at :06. Same PID alone proves nothing: its children 300 and 400
  // are not the job's; 200 (created before the reuser) is still linked to the recorded parent.
  r=jobProcesses([selfRow,proc(100,T(6),'unrelated.exe'),child(200,100,3),child(300,100,7),child(400,100,9)],run,process.pid);
  assert.deepEqual(pids(r.owned),[200]);assert.deepEqual(r.uncertain,[]);
  // A record with the same PID but another creation time is not the live process.
  r=jobProcesses([selfRow,proc(100,T(6),'unrelated.exe')],run,process.pid);
  assert.deepEqual(r.owned,[]);assert.deepEqual(r.uncertain,[]);
});

test('creation times within one millisecond keep their order; a same-millisecond PID reuser is not taken as the parent',()=>{
  assert.equal(compareTimes('2026-10-24T10:00:05.1231000Z','2026-10-24T10:00:05.1239000Z'),-1);
  assert.equal(compareTimes('2026-10-24T10:00:05.123Z','2026-10-24T10:00:05.1230000Z'),0);
  assert.ok(Number.isNaN(compareTimes('','2026-10-24T10:00:05.123Z')));
  const run={job_id:'tg-20261024-0000002a',processes:JSON.stringify([{pid:100,ppid:1,created:'2026-10-24T10:00:00.0000000Z',lastSeen:'2026-10-24T10:00:05.123Z'}])};
  const child=(pid,ppid,created)=>({...proc(pid,created,'node step.js'),ppid});
  // 200 was created 0.1 ms after the last sighting of its exited parent; 100 was then reused 0.8 ms later.
  let r=jobProcesses([selfRow,child(200,100,'2026-10-24T10:00:05.1231000Z'),proc(100,'2026-10-24T10:00:05.1239000Z','unrelated.exe'),
    child(300,100,'2026-10-24T10:00:05.1239500Z')],run,process.pid);
  assert.deepEqual(r.uncertain.map(p=>p.pid),[200],'linked to the recorded parent, but after its last sighting: uncertain');
  assert.deepEqual(r.owned,[],'the reuser and its child 300 are not the job\'s');
  r=jobProcesses([selfRow,child(201,100,'2026-10-24T10:00:05.1229999Z')],run,process.pid);
  assert.deepEqual(r.owned.map(p=>p.pid),[201],'created before the last sighting: owned');
});

test('without a process list nothing is claimed or interrupted; a run whose end cannot be checked fails and holds the queue',async t=>{
  const h=setup(t);h.job('tg-20261024-0000001a');h.job('tg-20261024-0000001b');
  await h.press('ix:tg-20261024-0000001a','cb-1');await h.press('ix:tg-20261024-0000001b','cb-2');
  // Unavailable from the very first query: the executor cannot even identify itself.
  assert.deepEqual(await h.executor({processTable:async()=>{throw Error('down');}}),{processed:0,blocked:true});
  assert.equal(h.holdNotices().length,1);assert.match(h.holdNotices()[0].text,/список процессов недоступен/);
  await h.confirm();
  let calls=0;
  const afterIdentity=async()=>{if(++calls>1)throw Error('process list unavailable');return [selfRow];};
  assert.deepEqual(await h.executor({processTable:afterIdentity}),{processed:0,blocked:true});
  assert.equal(h.run('tg-20261024-0000001a').state,'waiting');assert.equal(h.runs.length,0,'nothing claimed');
  assert.equal(h.queue.db.prepare('SELECT count(*) n FROM intake_executor_lock').get().n,0);
  assert.equal(h.holdNotices().length,2);
  await h.confirm();
  // The list becomes unavailable after the launcher: the end of its processes cannot be checked.
  let down=false;
  const execute=async options=>{const code=await h.execute()(options);down=true;return code;};
  assert.deepEqual(await h.executor({processTable:async()=>{if(down)throw Error('x');return [selfRow];},execute}),{processed:1,blocked:true});
  const a=h.run('tg-20261024-0000001a');
  assert.equal(a.state,'failed');assert.match(a.error,/не удалось проверить завершение процессов \(запускатель\)/);
  assert.equal(h.run('tg-20261024-0000001b').state,'waiting','next montage not started');assert.equal(h.runs.length,1);
  assert.match(h.holdNotices().at(-1).text,/tg-20261024-0000001a: ошибка на шаге launcher/);
});

test('every reel over the limit even as a viewing copy: final message with the reason and originals, shown in /montage',async t=>{
  const h=setup(t),{plan}=h.job('tg-20261024-0000000f');await h.press('ix:tg-20261024-0000000f');
  const big=TELEGRAM_CLOUD_UPLOAD_LIMIT+1;
  await h.executor({execute:h.execute({sizes:{1:big,2:big,3:big}}),makePreview:h.makePreview(big)});
  assert.equal(h.run('tg-20261024-0000000f').state,'done');assert.equal(h.documents.length,0);
  const last=h.sent.at(-1).text;
  assert.match(last,/готово\. Отправлено рилсов: 0 из 3\.\nБольше лимита Telegram 50 МБ даже в копии просмотра, не отправлены: хук 1, 2, 3\. Оригиналы на ноутбуке:/);
  for(const n of [1,2,3])assert.ok(last.includes(path.join(plan.output,'montage',`h${n}`,'development.mp4')),`path of h${n}`);
  await h.text('/montage');
  const status=h.sent.at(-1).text;
  assert.match(status,/готово · отправлено 0 из 3 · не отправлены, больше 50 МБ даже в копии просмотра: хук 1, 2, 3 — оригиналы на ноутбуке: /);
  assert.ok(status.includes(path.join(plan.output,'montage')));
});

test('the executor contains no process-termination commands',()=>{
  const source=readFileSync(new URL('./telegram-executor.mjs',import.meta.url),'utf8');
  for(const forbidden of [/taskkill/i,/process\.kill\(/,/\.kill\(/,/SIGKILL|SIGTERM/,/spawnSync/,/Stop-Process/i,/wmic/i])
    assert.doesNotMatch(source,forbidden);
});

test('timeout: the runner returns at the limit without waiting for close and ends nothing',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'executor-limit-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const pidFile=path.join(dir,'grandchild.pid');let pid;
  const started=Date.now();
  const code=await processRunner({python:process.execPath})({args:['-e',withGrandchild(pidFile)],stdout:path.join(dir,'o.log'),stderr:path.join(dir,'e.log'),
    timeoutMs:1500,onSpawn:p=>{pid=p;}});
  const grandchild=Number(readFileSync(pidFile,'utf8'));t.after(()=>endAll([pid,grandchild]));
  assert.equal(code,'timeout');assert.ok(Date.now()-started<4000,'returned at the limit');
  assert.equal(await isLive(pid),true,'child left running');assert.equal(await isLive(grandchild),true,'grandchild left running');
  let ffpid;
  await assert.rejects(ffmpegPreview({timeoutMs:1000,command:()=>[process.execPath,['-e',hang]]})(path.join(dir,'in.mp4'),path.join(dir,'out.mp4'),{onSpawn:p=>{ffpid=p;}}),
    e=>e.timedOut===true&&/копия просмотра не готова за 1 с/.test(e.message));
  t.after(()=>endAll([ffpid]));
  assert.equal(await isLive(ffpid),true,'FFmpeg stand-in left running');
});

test('launcher timeout: no result delivered, operator told to check, queue blocked until the processes are gone; no retry',async t=>{
  const h=setup(t);h.job('tg-20261024-0000002b');h.job('tg-20261024-0000002c');
  await h.press('ix:tg-20261024-0000002b','cb-1');await h.press('ix:tg-20261024-0000002c','cb-2');
  const pidFile=path.join(h.dir,'grandchild.pid');let first=true,pid;
  const runner=processRunner({python:process.execPath});
  const execute=async options=>{if(!first)return h.execute()(options);first=false;
    return runner({...options,args:['-e',withGrandchild(pidFile)],onSpawn:(p,running)=>{pid=p;options.onSpawn(p,running);}});};
  const more={...realOptions,timeoutMs:1500,execute};
  assert.deepEqual(await h.executor(more),{processed:1,blocked:true});
  const grandchild=Number(readFileSync(pidFile,'utf8'));t.after(()=>endAll([pid,grandchild]));
  const b=h.run('tg-20261024-0000002b');
  assert.equal(b.state,'failed');assert.match(b.error,/превышено время монтажа \(2 с\).*нужна ручная проверка/s);
  assert.equal(h.queue.db.prepare(`SELECT count(*) n FROM intake_deliveries WHERE job_id='tg-20261024-0000002b'`).get().n,0,'nothing delivered');
  assert.equal(h.documents.length,0);
  assert.equal(h.holdNotices().length,1);
  assert.match(h.holdNotices()[0].text,/tg-20261024-0000002b: ошибка на шаге launcher — превышено время монтажа.*ручная проверка.*не запускаются/s);
  assert.equal(h.run('tg-20261024-0000002c').state,'waiting');
  assert.equal(await isLive(pid),true);assert.equal(await isLive(grandchild),true,'the executor ended nothing');
  assert.deepEqual(await h.executor(more),{processed:0,blocked:true},'still blocked');
  endAll([pid]);assert.ok(await waitGone(pid));
  assert.deepEqual(await h.executor(more),{processed:0,blocked:true},'the grandchild still blocks');
  endAll([grandchild]);assert.ok(await waitGone(grandchild));
  assert.deepEqual(await h.executor(more),{processed:0,blocked:true},'all gone, but the hold stays until confirmed');
  assert.equal(h.holdNotices().length,1,'no repeated notices');
  await h.confirm();await h.executor(more);
  assert.equal(h.run('tg-20261024-0000002c').state,'done');assert.equal(h.run('tg-20261024-0000002b').state,'failed','not retried');
});

test('processes left after a normal launcher exit: waited for within the bound, not ended; the run fails and the queue waits',async t=>{
  const h=setup(t);const {jobDir}=h.job('tg-20261024-77777777');h.job('tg-20261024-66666666');
  await h.press('ix:tg-20261024-77777777','cb-1');await h.press('ix:tg-20261024-66666666','cb-2');
  const pidFile=path.join(h.dir,'orphan.pid');
  // Launcher stand-in: starts a lingering grandchild and exits 0.
  const script=`const {spawn}=require('child_process');const g=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});g.unref();`+
    `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(g.pid));setTimeout(()=>process.exit(0),1500);`;
  let first=true;
  const execute=async options=>{if(!first)return h.execute()(options);first=false;
    return processRunner({python:process.execPath})({...options,args:['-e',script]});};
  const started=Date.now();
  assert.deepEqual(await h.executor({...realOptions,execute}),{processed:1,blocked:true});
  const orphan=Number(readFileSync(pidFile,'utf8'));t.after(()=>endAll([orphan]));
  assert.ok(Date.now()-started<15000,'bounded wait');
  assert.equal(await isLive(orphan),true,'not ended by the executor');
  assert.ok(JSON.parse(readFileSync(path.join(jobDir,'executor','processes.json'),'utf8')).some(p=>p.pid===orphan),'recorded');
  const run=h.run('tg-20261024-77777777');
  assert.equal(run.state,'failed');assert.match(run.error,new RegExp(`процессы \\(запускатель\\) не завершились или не опознаны: PID ${orphan}.*ручная проверка`,'s'));
  assert.equal(h.run('tg-20261024-66666666').state,'waiting');
  endAll([orphan]);assert.ok(await waitGone(orphan));
  await h.confirm();await h.executor({...realOptions,execute});
  assert.equal(h.run('tg-20261024-66666666').state,'done');
});

test('launcher exits leaving orphans: proven and uncertain ones both block, nothing is ended',async t=>{
  const h=setup(t);h.job('tg-20261024-0000000b');h.job('tg-20261024-0000000c');
  await h.press('ix:tg-20261024-0000000b','cb-1');await h.press('ix:tg-20261024-0000000c','cb-2');
  let world=[selfRow];
  const processTable=async()=>world.slice();
  let first=true;
  const execute=async options=>{
    if(!first)return h.execute()(options);first=false;
    const L=proc(7001,new Date().toISOString(),'python.exe run-local-four-part.py');world.push(L);
    let exited=false;options.onSpawn(L.pid,()=>!exited);
    await delay(150);  // snapshots see the launcher alive and identify it (it has not exited)
    // The launcher exits before the next snapshot, leaving a child created while it was seen and one created later.
    exited=true;world=world.filter(p=>p!==L);
    world.push({...proc(7002,L.created,'node render.js'),ppid:L.pid},{...proc(7003,new Date(Date.now()+3600000).toISOString(),'node other.js'),ppid:L.pid});
    return 0;
  };
  const more={processTable,trackMs:30,pollMs:20,settleMs:300};
  assert.deepEqual(await h.executor({...more,execute}),{processed:1,blocked:true});
  const b=h.run('tg-20261024-0000000b');
  assert.equal(b.state,'failed');assert.match(b.error,/не завершились или не опознаны: PID 7002, 7003/);
  const recorded=JSON.parse(b.processes);
  assert.ok(recorded.some(p=>p.pid===7001&&p.created),'root identified while its handle was held');
  assert.ok(recorded.some(p=>p.pid===7002&&!p.uncertain)&&recorded.some(p=>p.pid===7003&&p.uncertain));
  assert.equal(h.run('tg-20261024-0000000c').state,'waiting');
  world=world.filter(p=>p.pid!==7002);
  assert.deepEqual(await h.executor({...more,execute}),{processed:0,blocked:true},'the uncertain one blocks too');
  world=world.filter(p=>p.pid!==7003);
  await h.confirm();await h.executor({...more,execute});
  assert.equal(h.run('tg-20261024-0000000c').state,'done');assert.equal(h.run('tg-20261024-0000000b').state,'failed');
});

test('viewing copy timeout: the run fails without waiting for FFmpeg, nothing is sent or ended, the queue waits',async t=>{
  const h=setup(t);h.job('tg-20261024-0000000e');h.job('tg-20261024-0000000d');
  await h.press('ix:tg-20261024-0000000e','cb-1');await h.press('ix:tg-20261024-0000000d','cb-2');
  const pidFile=path.join(h.dir,'ffmpeg-child.pid');let ffpid;
  const preview=ffmpegPreview({timeoutMs:1500,command:()=>[process.execPath,['-e',withGrandchild(pidFile)]]});
  const makePreview=(source,target,options)=>preview(source,target,{onSpawn:(p,running)=>{ffpid=p;options.onSpawn(p,running);}});
  let first=true;
  const execute=async options=>{const big=first;first=false;return h.execute(big?{sizes:{1:TELEGRAM_CLOUD_UPLOAD_LIMIT+1}}:{})(options);};
  assert.deepEqual(await h.executor({...realOptions,execute,makePreview}),{processed:1,blocked:true});
  const grandchild=Number(readFileSync(pidFile,'utf8'));t.after(()=>endAll([ffpid,grandchild]));
  const run=h.run('tg-20261024-0000000e');
  assert.equal(run.state,'failed');assert.match(run.error,/копия просмотра не готова за 2 с: FFmpeg не завершён.*ручная проверка/s);
  assert.equal(h.documents.length,0,'nothing sent as ready');
  assert.equal(await isLive(ffpid),true);assert.equal(await isLive(grandchild),true,'FFmpeg tree not ended by the executor');
  assert.equal(h.run('tg-20261024-0000000d').state,'waiting');
  endAll([ffpid,grandchild]);assert.ok(await waitGone(ffpid));assert.ok(await waitGone(grandchild));
  await h.confirm();await h.executor({...realOptions,execute,makePreview});
  assert.equal(h.run('tg-20261024-0000000d').state,'done');assert.equal(h.runs.length,2,'not retried');
});

test('unknown identity blocks: a start time within seconds or an empty creation time is never proof',async t=>{
  const run=(processes)=>({job_id:'tg-20261024-0000003a',processes:JSON.stringify(processes)});
  const placeholder={pid:300,created:null,spawnedAt:'2026-10-24T10:00:00.000Z'};
  // The root exited before any snapshot identified it; PID 300 is now held by a process created 1 s later.
  let r=jobProcesses([selfRow,proc(300,'2026-10-24T10:00:01.0000000Z','x.exe')],run([placeholder]),process.pid);
  assert.deepEqual(r.owned,[]);assert.deepEqual(r.unknown.map(p=>p.pid),[300],'held PID, identity unknown: blocks');
  r=jobProcesses([selfRow],run([placeholder]),process.pid);
  assert.deepEqual([...r.owned,...r.uncertain,...r.unknown],[],'PID free: the original is surely gone');
  // An empty creation time in the table for a recorded PID: unknown, blocks.
  r=jobProcesses([selfRow,proc(301,'','x.exe')],run([{pid:301,created:'2026-10-24T10:00:00.0000000Z'}]),process.pid);
  assert.deepEqual(r.unknown.map(p=>p.pid),[301]);
  // A child of a job process whose creation time is unreadable cannot be ordered: uncertain, blocks.
  r=jobProcesses([selfRow,proc(400,'2026-10-24T10:00:00.0000000Z','node tg-20261024-0000003a'),{...proc(401,'','child.exe'),ppid:400}],run([]),process.pid);
  assert.deepEqual(r.uncertain.map(p=>p.pid),[401]);
  // Executor level: a failed run with such a record keeps the next job waiting.
  const h=setup(t);h.job('tg-20261024-0000003b');h.job('tg-20261024-0000003c');
  await h.press('ix:tg-20261024-0000003b','cb-1');await h.press('ix:tg-20261024-0000003c','cb-2');
  h.queue.db.prepare(`UPDATE intake_runs SET state='failed',processes=? WHERE job_id='tg-20261024-0000003b'`).run(JSON.stringify([placeholder]));
  const table=async()=>[selfRow,proc(300,'2026-10-24T10:00:01.0000000Z','x.exe')];
  assert.deepEqual(await h.executor({processTable:table}),{processed:0,blocked:true});
  assert.equal(h.run('tg-20261024-0000003c').state,'waiting');
  // After the operator's confirmed check an unidentifiable record no longer blocks; the lock case is next.
  await h.confirm();
  // A lock holder whose PID shows no creation time is not proven gone: busy, nothing recovered or claimed.
  h.queue.db.prepare(`UPDATE intake_runs SET processes=NULL WHERE job_id='tg-20261024-0000003b'`).run();
  h.queue.db.prepare(`INSERT INTO intake_executor_lock (id,token,pid,created,acquired_at) VALUES (1,'t',5009,'2026-10-24T09:00:00.0000000Z','x')`).run();
  assert.deepEqual(await h.executor({processTable:async()=>[selfRow,proc(5009,'','node.exe')]}),{lockBusy:true,processed:0});
  assert.equal(h.run('tg-20261024-0000003c').state,'waiting');
  assert.match(h.holdNotices().at(-1).text,/блокировку исполнителя держит процесс, который нельзя опознать/);
  h.queue.db.prepare('DELETE FROM intake_executor_lock').run();  // the operator checked: holder 5009 is not an executor
  await h.confirm();
  await h.executor({processTable:async()=>[selfRow,proc(300,'2026-10-24T10:00:01.0000000Z','x.exe')]});
  assert.equal(h.run('tg-20261024-0000003c').state,'done','proceeds once the PID is free');
});

test('hold without waiting jobs, stale confirmation, and a montage request while held',async t=>{
  const h=setup(t);h.job('tg-20261024-0000004a');h.job('tg-20261024-0000004b');
  await h.press('ix:tg-20261024-0000004a','cb-1');
  // A stuck «обрабатывается» with a live process and no waiting jobs: its operator still gets one notice.
  const dead={pid:999997,created:'2026-10-24T09:00:00.0000000Z'},child=proc(6001,'2026-10-24T09:00:01.0000000Z','python.exe');
  h.queue.db.prepare(`UPDATE intake_runs SET state='running',executor=?,processes=?,step='launcher' WHERE job_id='tg-20261024-0000004a'`)
    .run(JSON.stringify(dead),JSON.stringify([{pid:child.pid,created:child.created}]));
  const table=async()=>[selfRow,child];
  assert.deepEqual(await h.executor({processTable:table}),{processed:0,blocked:true});
  assert.deepEqual(await h.executor({processTable:table}),{processed:0,blocked:true});
  assert.equal(h.holdNotices().length,1,'one notice, no waiting job needed');
  assert.equal(h.holdNotices()[0].chat_id,123);assert.match(h.holdNotices()[0].text,/tg-20261024-0000004a в статусе «обрабатывается»/);
  assert.equal(h.run('tg-20261024-0000004a').state,'running','not declared interrupted while its process lives');
  const stale='iu:00000000';
  await h.press(stale,'cb-stale');assert.match(h.sent.at(-1).text,/подтверждение уже не действует/);assert.ok(h.hold());
  // A montage request while held is queued and told about the hold.
  await h.press('ix:tg-20261024-0000004b','cb-2');
  assert.match(h.sent.at(-1).text,/поставлен в очередь: ожидает.*Очередь монтажа остановлена/s);
  assert.equal(h.buttons()[0].callback_data,`iu:${h.hold().token}`);
  await h.text('/montage');assert.match(h.sent.at(-1).text,/^Очередь монтажа остановлена/);
  assert.equal(h.buttons()[0].callback_data,`iu:${h.hold().token}`);
  assert.equal(h.holdNotices().length,2,'/montage shows the hold (the executor does not send it again)');
});
