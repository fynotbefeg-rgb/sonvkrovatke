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
import {ffmpegPreview,processRunner,runExecutor,systemKillTree,systemProcessTable,VIDEO_CACHE_BYTES} from './telegram-executor.mjs';
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
    processTable:async()=>[selfRow],killTree:()=>{},pollMs:50,settleMs:3000,...more});  // stub runs: no real child processes
  return {dir,root,queue,sent,documents,runs,previews,job,execute,makePreview,executor,starts:()=>starts,failDocument:f=>failDocument=f,
    text:text=>deliver({message:{...chat,text}}),
    press:(data,id='cb1')=>deliver({callback_query:{id,from:{id:123},message:{chat:{id:123,type:'private'}},data}}),
    buttons:()=>sent.at(-1).reply_markup?.inline_keyboard.flat()??[],
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

test('run interrupted by a restart becomes ошибка; the next waiting job still runs; one montage at a time',async t=>{
  const h=setup(t);h.job('tg-20261024-cccccccc');h.job('tg-20261024-dddddddd');
  await h.press('ix:tg-20261024-cccccccc','cb-c');await h.press('ix:tg-20261024-dddddddd','cb-d');
  const dead={pid:999999,created:'2026-10-24T09:00:00.0000000Z'};
  h.queue.db.prepare(`UPDATE intake_runs SET state='running',pid=999999,executor=?,step='launcher' WHERE job_id='tg-20261024-cccccccc'`).run(JSON.stringify(dead));
  assert.throws(()=>h.queue.db.prepare(`UPDATE intake_runs SET state='running' WHERE job_id='tg-20261024-dddddddd'`).run(),/UNIQUE/,'second running row impossible');
  h.queue.db.prepare(`INSERT INTO intake_executor_lock (id,token,pid,created,acquired_at) VALUES (1,'dead',?,?,'2026-10-24T09:00:00Z')`).run(dead.pid,dead.created);
  const holder=proc(dead.pid,dead.created);
  assert.deepEqual(await h.executor({processTable:async()=>[selfRow,holder]}),{lockBusy:true,processed:0},'live lock holder: nothing claimed');
  assert.equal(h.runs.length,0);assert.equal(h.run('tg-20261024-cccccccc').state,'running');
  // Same PID, other creation time: the PID was reused by another process, so the lock is stale.
  await h.executor({processTable:async()=>[selfRow,{...holder,created:'2026-10-24T10:30:00.0000000Z'}]});
  const c=h.run('tg-20261024-cccccccc');
  assert.equal(c.state,'failed');assert.match(c.error,/прервано на шаге launcher/);
  assert.ok(h.sent.some(m=>/tg-20261024-cccccccc: ошибка — прерван на шаге launcher.*не запускается/s.test(m.text)));
  assert.equal(h.runs.length,1,'only the other job ran');assert.equal(h.run('tg-20261024-dddddddd').state,'done');
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
const nodeChild=(args,{detached=false}={})=>{const c=spawn(process.execPath,args,{detached,stdio:'ignore',windowsHide:true});if(detached)c.unref();return c;};
const isLive=async pid=>(await systemProcessTable()).some(p=>p.pid===pid);
async function waitGone(pid,ms=15000){const end=Date.now()+ms;while(Date.now()<end){if(!await isLive(pid))return true;await delay(300);}return false;}
const realOptions={processTable:systemProcessTable,killTree:systemKillTree,trackMs:200,pollMs:200,settleMs:15000};

test('processRunner: missing Python is a clear error; log files closed once and removable',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'executor-nopy-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const missing=path.join(dir,'no-such-python.exe');
  await assert.rejects(processRunner({python:missing})({args:['x.py'],stdout:path.join(dir,'o.log'),stderr:path.join(dir,'e.log')}),
    err=>/Python не найден/.test(err.message)&&!/EBADF/.test(err.message));
  rmSync(path.join(dir,'o.log'));rmSync(path.join(dir,'e.log'));  // Windows refuses to delete a file that is still open
  await delay(200);  // a late second close would surface here as an uncaught EBADF
});

test('timeout ends the whole tree of the launcher, grandchildren included',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'executor-tree-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const pidFile=path.join(dir,'grandchild.pid');
  const script=`const {spawn}=require('child_process');const g=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});`+
    `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(g.pid));setInterval(()=>{},1000);`;
  const code=await processRunner({python:process.execPath})({args:['-e',script],stdout:path.join(dir,'o.log'),stderr:path.join(dir,'e.log'),timeoutMs:2500});
  assert.equal(code,'timeout');
  const grandchild=Number(readFileSync(pidFile,'utf8'));
  assert.ok(await waitGone(grandchild),'grandchild killed with the tree');
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
  process.kill(recorded.pid);assert.ok(await waitGone(recorded.pid));
  await h.executor({...realOptions});
  assert.equal(h.run('tg-20261024-99999999').state,'failed');assert.match(h.run('tg-20261024-99999999').error,/прервано на шаге launcher/);
  assert.equal(h.runs.length,1,'the other job runs only now; the interrupted one is not repeated');
  assert.equal(h.run('tg-20261024-88888888').state,'done');
});

test('processes left after the launcher are recorded, ended before the run finishes, and do not leak into the next job',async t=>{
  const h=setup(t);const {jobDir}=h.job('tg-20261024-77777777');h.job('tg-20261024-66666666');
  await h.press('ix:tg-20261024-77777777','cb-1');await h.press('ix:tg-20261024-66666666','cb-2');
  const pidFile=path.join(h.dir,'orphan.pid');
  // Launcher stand-in: starts a lingering grandchild and exits 0 without results.
  const script=`const {spawn}=require('child_process');const g=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});g.unref();`+
    `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(g.pid));setTimeout(()=>process.exit(0),1500);`;
  let first=true;
  const execute=async options=>{
    if(!first)return h.execute()(options);first=false;
    return processRunner({python:process.execPath})({...options,args:['-e',script]});
  };
  await h.executor({...realOptions,execute});
  const orphan=Number(readFileSync(pidFile,'utf8'));t.after(()=>{try{process.kill(orphan);}catch{}});
  assert.equal(await isLive(orphan),false,'orphaned grandchild ended by settle');
  const recorded=JSON.parse(readFileSync(path.join(jobDir,'executor','processes.json'),'utf8'));
  assert.ok(recorded.some(p=>p.pid===orphan),'grandchild recorded by the tracker');
  assert.equal(h.run('tg-20261024-77777777').state,'failed');
  assert.equal(h.run('tg-20261024-66666666').state,'done');
});

test('a failed run whose processes outlive the kill attempt blocks the next montage',async t=>{
  const h=setup(t);h.job('tg-20261024-55555555');h.job('tg-20261024-44444444');
  await h.press('ix:tg-20261024-55555555','cb-1');await h.press('ix:tg-20261024-44444444','cb-2');
  const survivor=nodeChild(['-e','setInterval(()=>{},1000)'],{detached:true});t.after(()=>{try{process.kill(survivor.pid);}catch{}});
  await delay(500);
  const created=(await systemProcessTable()).find(p=>p.pid===survivor.pid).created;
  h.queue.db.prepare(`UPDATE intake_runs SET state='failed',processes=? WHERE job_id='tg-20261024-55555555'`).run(JSON.stringify([{pid:survivor.pid,created}]));
  assert.deepEqual(await h.executor({...realOptions}),{processed:0,blocked:true});
  assert.equal(h.run('tg-20261024-44444444').state,'waiting');
  process.kill(survivor.pid);assert.ok(await waitGone(survivor.pid));
  await h.executor({...realOptions});
  assert.equal(h.run('tg-20261024-44444444').state,'done');
});

test('two executors recover the same stale lock: the loser with an outdated snapshot neither interrupts nor claims',async t=>{
  const h=setup(t);h.job('tg-20261024-33333333');h.job('tg-20261024-22222222');h.job('tg-20261024-11111111');
  for(const [id,cb] of [['tg-20261024-33333333','cb-1'],['tg-20261024-22222222','cb-2'],['tg-20261024-11111111','cb-3']])await h.press(`ix:${id}`,cb);
  // Executor D died holding the lock while running job 3; jobs 2 and 1 wait.
  const D=proc(999998,'2026-10-24T09:00:00.0000000Z'),A=proc(5001,'2026-10-24T10:00:00.0000000Z'),B=proc(5002,'2026-10-24T10:00:01.0000000Z');
  h.queue.db.prepare(`INSERT INTO intake_executor_lock (id,token,pid,created,acquired_at) VALUES (1,'token-d',?,?,'2026-10-24T09:00:00Z')`).run(D.pid,D.created);
  h.queue.db.prepare(`UPDATE intake_runs SET state='running',pid=?,executor=?,step='launcher' WHERE job_id='tg-20261024-33333333'`)
    .run(D.pid,JSON.stringify({pid:D.pid,created:D.created,token:'token-d'}));
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
  assert.equal(h.run('tg-20261024-33333333').state,'failed','recovered once, by the winner');
  assert.equal(h.sent.filter(m=>/tg-20261024-33333333: ошибка — прерван/.test(m.text)).length,1,'one interruption notice');
  const running=h.run('tg-20261024-22222222');
  assert.equal(running.state,'running');assert.equal(JSON.parse(running.executor).pid,B.pid,'B runs job 2');
  assert.equal(h.run('tg-20261024-11111111').state,'waiting','the loser claimed nothing');
  // A second attempt while B works: the holder is read first, so the fresh table contains B — busy, no recovery.
  assert.deepEqual(await h.executor({pid:A.pid,processTable:async()=>[A,B]}),{lockBusy:true,processed:0});
  assert.equal(h.run('tg-20261024-22222222').state,'running','the live run of B is not declared interrupted');
  assert.equal(h.queue.db.prepare('SELECT pid FROM intake_executor_lock').get().pid,B.pid);
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
