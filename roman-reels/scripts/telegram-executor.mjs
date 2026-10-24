// Executor of confirmed intake kits: the same SQLite DB and intake jobs, one montage at a time on this laptop.
// The bot only records an explicit request and starts a detached worker, so polling stays responsive. The worker
// rechecks hashes, runs the existing run-local-four-part.py --execute (concurrency 1, video cache 268435456),
// keeps steps, logs and results in the job folder and sends the finished reels. Nothing is retried automatically:
// a failure or an interrupted run stays "ошибка"; a repeated delivery never repeats the montage.
// Every process of a job (launcher, Python steps, Node/Remotion, browser, FFmpeg) is recorded by PID and creation
// time; no next montage starts and no run is declared interrupted while any of them is still alive.
import path from 'node:path';
import {execFile,spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {closeSync,existsSync,mkdirSync,openSync,readFileSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {TELEGRAM_CLOUD_UPLOAD_LIMIT} from './telegram-bot-api.mjs';
import {PARTS,ROLES,sha256} from './telegram-intake.mjs';

export const RUN_LABELS={waiting:'ожидает',running:'обрабатывается',done:'готово',failed:'ошибка'};
export const RENDER_CONCURRENCY=1;
export const VIDEO_CACHE_BYTES=268435456;
const HOOKS=[1,2,3];
const LAUNCHER=path.join(path.dirname(fileURLToPath(import.meta.url)),'run-local-four-part.py');
const short=error=>String(error?.message??error).slice(0,300);

export function ensureRunTables(db){
  db.exec(`CREATE TABLE IF NOT EXISTS intake_runs (
      job_id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('waiting','running','done','failed')),
      requested_by TEXT NOT NULL, requested_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
      pid INTEGER, executor TEXT, processes TEXT, step TEXT, error TEXT, result TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS intake_one_running ON intake_runs(state) WHERE state='running';
    CREATE TABLE IF NOT EXISTS intake_deliveries (
      job_id TEXT NOT NULL, hook INTEGER NOT NULL, kind TEXT NOT NULL, file TEXT NOT NULL, bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','sent','failed','too_large')),
      message_id INTEGER, PRIMARY KEY(job_id,hook));
    CREATE TABLE IF NOT EXISTS intake_executor_lock (
      id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, pid INTEGER NOT NULL, created TEXT, acquired_at TEXT NOT NULL);`);
}

// Explicit operator request for one confirmed job; a repeated press returns the existing run.
export function requestRun(db,jobId,actor,now=new Date()){
  const job=db.prepare(`SELECT * FROM intake_jobs WHERE id=? AND actor_id=?`).get(jobId,String(actor));
  if(!job||job.state!=='confirmed')return {refused:true};
  const created=Number(db.prepare(`INSERT OR IGNORE INTO intake_runs (job_id,state,requested_by,requested_at) VALUES (?,'waiting',?,?)`)
    .run(jobId,String(actor),now.toISOString()).changes)===1;
  return {created,run:db.prepare('SELECT * FROM intake_runs WHERE job_id=?').get(jobId)};
}

// Failed deliveries back to pending; the run itself stays done, so the montage is not repeated.
export function requestRedelivery(db,jobId,actor){
  const run=db.prepare(`SELECT * FROM intake_runs WHERE job_id=? AND requested_by=? AND state='done'`).get(jobId,String(actor));
  if(!run)return {refused:true};
  return {reset:Number(db.prepare(`UPDATE intake_deliveries SET state='pending' WHERE job_id=? AND state='failed'`).run(jobId).changes)};
}

// Work the executor can take on now: waiting runs or pending deliveries of finished runs.
export function hasQueuedWork(db){
  return !!db.prepare(`SELECT 1 FROM intake_runs WHERE state='waiting' UNION ALL
    SELECT 1 FROM intake_deliveries d JOIN intake_runs r ON r.job_id=d.job_id WHERE r.state='done' AND d.state='pending' LIMIT 1`).get();
}
// For /montage: a "running" row also needs a check, it may belong to an executor that died.
export function hasWork(db){
  return hasQueuedWork(db)||!!db.prepare(`SELECT 1 FROM intake_runs WHERE state='running' LIMIT 1`).get();
}

// Process table: PID, parent, creation time (identity against PID reuse), name, command line.
export function systemProcessTable(){
  return new Promise((resolve,reject)=>{
    const windows=process.platform==='win32';
    const [command,args]=windows?['powershell.exe',['-NoProfile','-NonInteractive','-Command',
      "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{p=$_.ProcessId;q=$_.ParentProcessId;"+
      "c=$(if($_.CreationDate){$_.CreationDate.ToUniversalTime().ToString('o')}else{''});n=$_.Name;l=$_.CommandLine} } | ConvertTo-Json -Compress"]]:
      ['ps',['-eo','pid=,ppid=,lstart=,args=']];
    execFile(command,args,{windowsHide:true,timeout:60000,maxBuffer:32*1024**2,encoding:'utf8'},(error,stdout)=>{
      if(error){reject(Error('process list unavailable'));return;}
      if(windows){const rows=JSON.parse(stdout||'[]');resolve((Array.isArray(rows)?rows:[rows]).map(r=>({pid:r.p,ppid:r.q,created:r.c,name:r.n,commandLine:r.l||''})));return;}
      resolve(stdout.split('\n').map(line=>/^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.*)$/.exec(line)).filter(Boolean)
        .map(m=>({pid:+m[1],ppid:+m[2],created:new Date(m[3]).toISOString(),name:path.basename(m[4].split(' ')[0]),commandLine:m[4]})));
    });
  });
}
// Windows: taskkill /T ends the whole tree of each root; elsewhere every descendant is killed explicitly.
export function systemKillTree(table,pids){
  if(process.platform==='win32'){for(const pid of pids)spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});return;}
  for(const p of descendants(table,pids,{includeRoots:true}))try{process.kill(p.pid,'SIGKILL');}catch{}
}

// A child must have been created after its parent, so a reused parent PID does not adopt unrelated processes.
function descendants(table,roots,{includeRoots=false}={}){
  const byPid=new Map(table.map(p=>[p.pid,p])),found=new Map();
  for(const pid of roots)if(includeRoots&&byPid.has(pid))found.set(pid,byPid.get(pid));
  let frontier=roots.filter(pid=>byPid.has(pid));
  while(frontier.length){
    const next=[];
    for(const parent of frontier)for(const p of table)
      if(p.ppid===parent&&!found.has(p.pid)&&!roots.includes(p.pid)&&!(byPid.get(parent)?.created>p.created&&p.created)){found.set(p.pid,p);next.push(p.pid);}
    frontier=next;
  }
  return [...found.values()];
}
// Identity: same PID and creation time. A root seen only at spawn (no snapshot yet) matches a process created
// within seconds of that spawn, never one that later received the same PID.
const same=(table,record)=>table.some(p=>p.pid===record.pid&&(record.created?p.created===record.created:
  record.spawnedAt?Math.abs(Date.parse(p.created)-Date.parse(record.spawnedAt))<=5000:false));

// Live processes of one run: recorded ones still alive (same PID and creation time), their descendants and anything
// whose command line names the job (its paths contain the job ID). The current executor itself never counts.
export function jobProcesses(table,run,selfPid=process.pid){
  const recorded=JSON.parse(run.processes||'[]').filter(r=>same(table,r)).map(r=>r.pid);
  const marked=table.filter(p=>p.pid!==selfPid&&p.commandLine.includes(run.job_id)).map(p=>p.pid);
  const roots=[...new Set([...recorded,...marked])];
  return descendants(table,roots,{includeRoots:true}).filter(p=>p.pid!==selfPid);
}

// One executor per laptop: a single lock row in the shared SQLite DB with the holder's PID, creation time and token.
// The holder is judged by a process table taken after the row was read, so a holder that wrote it is in that table
// unless it is really gone. A stale row is replaced only if it is still exactly that row (compare-and-swap on its
// token): of two executors recovering the same stale lock one wins, the loser cannot remove the winner's lock.
async function acquireLock(o){
  const self=o.self,db=o.db;
  for(let attempt=0;attempt<2;attempt++){
    if(Number(db.prepare(`INSERT OR IGNORE INTO intake_executor_lock (id,token,pid,created,acquired_at) VALUES (1,?,?,?,?)`)
      .run(self.token,self.pid,self.created,o.now().toISOString()).changes)===1)return true;
    const holder=db.prepare('SELECT * FROM intake_executor_lock WHERE id=1').get();
    if(!holder)continue;  // released in between: try to insert again
    const table=await o.processTable();
    if(!holder.created||same(table,holder))return false;  // live (or unidentifiable) holder: busy
    return Number(db.prepare(`UPDATE intake_executor_lock SET token=?,pid=?,created=?,acquired_at=? WHERE id=1 AND token=?`)
      .run(self.token,self.pid,self.created,o.now().toISOString(),holder.token).changes)===1;
  }
  return false;
}
// Only the current owner releases: a lock row with another token is left as it is.
function releaseLock(o){o.db.prepare('DELETE FROM intake_executor_lock WHERE id=1 AND token=?').run(o.self.token);}

async function notify(o,actor,text){try{await o.api.send(Number(actor),text);}catch{o.log?.({event:'executor_notify_failed'});}}

// Holding the lock means no other executor runs. A "running" row is declared interrupted only after its executor
// and every recorded or marked process of the job are gone; it fails and is never re-run automatically.
async function recoverInterrupted(o,table){
  let blocked=false;
  for(const run of o.db.prepare(`SELECT * FROM intake_runs WHERE state='running'`).all()){
    const executor=run.executor?JSON.parse(run.executor):null;
    const live=jobProcesses(table,run,o.pid);
    if((executor&&executor.token!==o.self.token&&same(table,executor))||live.length){
      blocked=true;o.log?.({event:'executor_previous_still_running',processes:live.length});continue;
    }
    o.db.prepare(`UPDATE intake_runs SET state='failed',finished_at=?,error=? WHERE job_id=? AND state='running'`)
      .run(o.now().toISOString(),`прервано на шаге ${run.step??'неизвестно'} (перезапуск или сбой)`,run.job_id);
    await notify(o,run.requested_by,`Монтаж ${run.job_id}: ошибка — прерван на шаге ${run.step??'неизвестно'} (перезапуск или сбой). `+
      'Процессы задания завершены. Повтор автоматически не запускается. Логи — в папке задания, executor.');
  }
  return blocked;
}

// Processes of finished or failed runs that outlived their run (e.g. after a timeout) still block the next montage.
function lingering(o,table){
  return o.db.prepare(`SELECT job_id,processes FROM intake_runs WHERE state IN ('done','failed') AND processes IS NOT NULL`).all()
    .some(run=>jobProcesses(table,run,o.pid).length>0);
}

function claim(o){
  const db=o.db;db.exec('BEGIN IMMEDIATE');
  try{
    const run=db.prepare(`SELECT * FROM intake_runs WHERE state='waiting' ORDER BY rowid LIMIT 1`).get();
    if(run)db.prepare(`UPDATE intake_runs SET state='running',started_at=?,pid=?,executor=?,step='claimed' WHERE job_id=? AND state='waiting'`)
      .run(o.now().toISOString(),o.pid,JSON.stringify(o.self),run.job_id);
    db.exec('COMMIT');
    return run?db.prepare('SELECT * FROM intake_runs WHERE job_id=?').get(run.job_id):null;
  }catch(error){db.exec('ROLLBACK');throw error;}
}

function writeJson(file,data){const temp=`${file}.tmp`;writeFileSync(temp,JSON.stringify(data,null,2)+'\n');renameSync(temp,file);}

// Records the trees of the job's own child processes (launcher, FFmpeg) while they run, in the DB and processes.json.
function tracker(o,run,exec){
  const roots=new Set(),known=new Map();let timer=null,busy=false;
  const save=()=>{
    const list=[...known.values()];
    o.db.prepare('UPDATE intake_runs SET processes=? WHERE job_id=?').run(JSON.stringify(list),run.job_id);
    writeJson(path.join(exec,'processes.json'),list);
  };
  const snapshot=async()=>{
    if(busy)return;busy=true;
    try{const table=await o.processTable();
      for(const p of descendants(table,[...roots],{includeRoots:true})){
        if(known.get(`${p.pid}:`)&&same([p],known.get(`${p.pid}:`)))known.delete(`${p.pid}:`);  // spawn placeholder now identified
        if(!known.has(`${p.pid}:${p.created}`))known.set(`${p.pid}:${p.created}`,{pid:p.pid,ppid:p.ppid,created:p.created,name:p.name});
      }
      save();}
    catch{o.log?.({event:'executor_process_snapshot_failed'});}
    finally{busy=false;}
  };
  return {
    onSpawn:pid=>{roots.add(pid);known.set(`${pid}:`,{pid,created:null,spawnedAt:new Date().toISOString()});save();snapshot();timer??=setInterval(snapshot,o.trackMs);},
    stop:()=>{clearInterval(timer);timer=null;},
    // After the step: end any process of the job that is still alive and wait until all are gone.
    async settle(){
      const deadline=Date.now()+o.settleMs;
      for(let killed=false;;){
        const table=await o.processTable();
        const live=jobProcesses(table,{job_id:run.job_id,processes:JSON.stringify([...known.values()])},o.pid);
        if(!live.length)return true;
        if(!killed){o.killTree(table,live.map(p=>p.pid));killed=true;}
        if(Date.now()>deadline)return false;
        await delay(o.pollMs);
      }
    }
  };
}

async function executeRun(o,run){
  const job=o.db.prepare('SELECT * FROM intake_jobs WHERE id=?').get(run.job_id);
  const dir=path.join(o.root,run.job_id),exec=path.join(dir,'executor'),steps=[];
  const step=name=>{
    steps.push({name,at:o.now().toISOString()});
    o.db.prepare('UPDATE intake_runs SET step=? WHERE job_id=?').run(name,run.job_id);
    if(existsSync(exec))writeFileSync(path.join(exec,'steps.json'),JSON.stringify(steps,null,2)+'\n');
  };
  let track=null;
  try{
    if(job?.state!=='confirmed')throw Error('комплект не подтверждён');
    mkdirSync(exec);  // one attempt per job: an existing executor folder is never reused
    track=tracker(o,run,exec);
    step('verify-hashes');
    const plan=JSON.parse(job.plan),confirmed=JSON.parse(readFileSync(path.join(dir,'confirmed.json'),'utf8'));
    for(const p of PARTS){
      if(confirmed.parts?.[p]?.sha256!==plan.inputs[p].sha256)throw Error(`${ROLES[p]}: confirmed.json не совпадает с подтверждённым планом`);
      if(sha256(plan.inputs[p].path)!==plan.inputs[p].sha256)throw Error(`${ROLES[p]}: SHA-256 копии изменился после подтверждения`);
    }
    await notify(o,run.requested_by,`Монтаж ${job.id} (${job.topic_id}): обрабатывается — ASR и три рендера по очереди. Бот остаётся доступен.`);
    step('launcher');
    const args=[LAUNCHER,...PARTS.flatMap(p=>[`--${p}`,plan.inputs[p].path]),'--topic-id',job.topic_id,'--out',plan.output,
      '--model-path',o.modelPath,'--model-revision',o.modelRevision,'--browser-executable',o.browser,'--execute'];
    let code;
    try{code=await o.execute({args,stdout:path.join(exec,'launcher.stdout.log'),stderr:path.join(exec,'launcher.stderr.log'),onSpawn:track.onSpawn,timeoutMs:o.timeoutMs});}
    finally{track.stop();}
    if(!await track.settle())throw Error('процессы запускателя не завершились; следующий монтаж ждёт их завершения');
    if(code!==0)throw Error(code==='timeout'?'превышено время монтажа; дерево процессов остановлено':`запускатель завершился с кодом ${code}`);
    step('verify-results');
    const report=JSON.parse(readFileSync(path.join(plan.output,'launch-report.json'),'utf8'));
    if(report.complete!==true||report.renderConcurrency!==RENDER_CONCURRENCY||report.offthreadVideoCacheSizeInBytes!==VIDEO_CACHE_BYTES)
      throw Error('отчёт запускателя неполный или с другими настройками рендера');
    const results=HOOKS.map(n=>{
      const render=report.renders?.find(r=>r.hookNumber===n),file=path.join(plan.output,'montage',`h${n}`,'development.mp4');
      if(!render||!existsSync(file))throw Error(`нет рендера хука ${n}`);
      const digest=sha256(file);
      if(digest!==render.outputSha256)throw Error(`рендер хука ${n} не совпал по SHA-256 с отчётом`);
      return {hook:n,file,bytes:statSync(file).size,sha256:digest};
    });
    step('prepare-delivery');
    const deliveries=[];
    for(const r of results){
      if(r.bytes<=TELEGRAM_CLOUD_UPLOAD_LIMIT){deliveries.push({...r,kind:'original',state:'pending'});continue;}
      // The original stays local; Telegram gets a separate viewing copy when it fits the upload limit.
      const preview=path.join(exec,`h${r.hook}-preview-720.mp4`);
      try{await o.makePreview(r.file,preview,{onSpawn:track.onSpawn});}finally{track.stop();}
      if(!await track.settle())throw Error('FFmpeg не завершился; следующий монтаж ждёт его завершения');
      const bytes=statSync(preview).size;
      deliveries.push(bytes<=TELEGRAM_CLOUD_UPLOAD_LIMIT?{hook:r.hook,file:preview,bytes,sha256:sha256(preview),kind:'preview',state:'pending'}:
        {...r,kind:'original',state:'too_large'});
    }
    const result={jobId:job.id,topicId:job.topic_id,renders:results,deliveries,launchReport:path.join(plan.output,'launch-report.json'),
      renderConcurrency:RENDER_CONCURRENCY,offthreadVideoCacheSizeInBytes:VIDEO_CACHE_BYTES,productionReady:false,needsSpeechReview:true};
    writeFileSync(path.join(exec,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    step('done');
    const db=o.db;db.exec('BEGIN IMMEDIATE');
    try{
      for(const d of deliveries)db.prepare('INSERT INTO intake_deliveries VALUES (?,?,?,?,?,?,?,NULL)')
        .run(job.id,d.hook,d.kind,d.file,d.bytes,d.sha256,d.state);
      db.prepare(`UPDATE intake_runs SET state='done',finished_at=?,result=? WHERE job_id=? AND state='running'`)
        .run(o.now().toISOString(),JSON.stringify(result),job.id);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return {done:true};
  }catch(error){
    track?.stop();
    o.db.prepare(`UPDATE intake_runs SET state='failed',finished_at=?,error=? WHERE job_id=? AND state='running'`)
      .run(o.now().toISOString(),short(error),run.job_id);
    if(existsSync(exec))writeFileSync(path.join(exec,'error.json'),JSON.stringify({step:steps.at(-1)?.name??null,error:short(error),steps},null,2)+'\n');
    await notify(o,run.requested_by,`Монтаж ${run.job_id}: ошибка на шаге ${steps.at(-1)?.name??'подготовка'} — ${short(error)}\n`+
      'Повтор автоматически не запускается. Шаги и логи — в папке задания, executor.');
    return {failed:true};
  }
}

async function deliverPending(o){
  const rows=o.db.prepare(`SELECT d.*,r.requested_by,j.topic_id FROM intake_deliveries d JOIN intake_runs r ON r.job_id=d.job_id
    JOIN intake_jobs j ON j.id=d.job_id WHERE r.state='done' AND d.state='pending' ORDER BY d.job_id,d.hook`).all();
  const touched=new Set();
  for(const d of rows){
    touched.add(d.job_id);
    let state='failed',messageId=null;
    try{
      if(sha256(d.file)!==d.sha256)throw Error('file changed');
      ({messageId}=await o.api.sendDocument(Number(d.requested_by),d.file,{fileName:`${d.job_id}-h${d.hook}.mp4`,
        caption:`Рилс с хуком ${d.hook} · ${d.topic_id} · ${d.kind==='preview'?'копия для просмотра (оригинал на ноутбуке)':'оригинал'}`}));
      state='sent';
    }catch{o.log?.({event:'executor_delivery_failed',hook:d.hook});}
    o.db.prepare('UPDATE intake_deliveries SET state=?,message_id=? WHERE job_id=? AND hook=? AND state=?').run(state,messageId,d.job_id,d.hook,'pending');
  }
  for(const jobId of touched){
    const all=o.db.prepare('SELECT * FROM intake_deliveries WHERE job_id=? ORDER BY hook').all(jobId);
    const run=o.db.prepare('SELECT * FROM intake_runs WHERE job_id=?').get(jobId);
    const sent=all.filter(d=>d.state==='sent').length,failed=all.filter(d=>d.state==='failed'),large=all.filter(d=>d.state==='too_large');
    await notify(o,run.requested_by,`Монтаж ${jobId}: готово. Отправлено рилсов: ${sent} из ${all.length}.`+
      (failed.length?`\nНе отправлены: хук ${failed.map(d=>d.hook).join(', ')} — повтор отправки в /montage (монтаж не повторяется).`:'')+
      (large.length?`\nБольше лимита Telegram 50 МБ даже в копии просмотра, лежат на ноутбуке: хук ${large.map(d=>d.hook).join(', ')}.`:'')+
      '\nОригиналы сохранены на ноутбуке. Речь всё ещё требует проверки, к публикации не готово.');
  }
  return touched.size;
}

// Sequential pass: deliveries of finished runs first, then waiting runs one by one, until nothing is left.
// A pass that finds live processes of an earlier run claims nothing and leaves the run as it is.
export async function runExecutor(options){
  const o={now:()=>new Date(),pid:process.pid,processTable:systemProcessTable,killTree:systemKillTree,
    trackMs:3000,pollMs:1000,settleMs:60000,timeoutMs:4*3600000,...options};
  ensureRunTables(o.db);
  const me=(await o.processTable()).find(p=>p.pid===o.pid);
  if(!me?.created)throw Error('own process not in process table');
  o.self={pid:o.pid,created:me.created,token:randomUUID()};
  let processed=0;
  for(;;){
    if(!await acquireLock(o))return {lockBusy:true,processed};
    let blocked=false;
    try{
      // Recovery judges only with a table taken after the lock is held.
      let table=await o.processTable();
      blocked=await recoverInterrupted(o,table);
      while(!blocked){
        await deliverPending(o);
        table=await o.processTable();
        if(lingering(o,table)){blocked=true;o.log?.({event:'executor_waiting_for_previous_processes'});break;}
        const run=claim(o);
        if(!run)break;
        processed++;
        await executeRun(o,run);
      }
    }finally{releaseLock(o);}
    if(blocked)return {processed,blocked:true};
    // Work queued between the last check and the lock release would otherwise wait for the next button press.
    if(!hasQueuedWork(o.db))return {processed};
  }
}

// Launcher process: log files are closed exactly once; on timeout the whole process tree is ended.
export function processRunner({python,processTable=systemProcessTable,killTree=systemKillTree}){
  return ({args,stdout,stderr,onSpawn,timeoutMs=4*3600000})=>new Promise((resolve,reject)=>{
    let out,err;
    try{out=openSync(stdout,'wx');err=openSync(stderr,'wx');}
    catch(error){if(out!==undefined)closeSync(out);reject(error);return;}
    let finished=false,timedOut=false,timer=null;
    const finish=(settle,value)=>{if(finished)return;finished=true;clearTimeout(timer);closeSync(out);closeSync(err);settle(value);};
    let child;
    try{child=spawn(python,args,{cwd:path.dirname(LAUNCHER),windowsHide:true,stdio:['ignore',out,err],env:{...process.env,PYTHONIOENCODING:'utf-8'}});}
    catch(error){finish(reject,Error(`запускатель не стартовал: ${error.code??error.message}`));return;}
    child.once('spawn',()=>{
      onSpawn?.(child.pid);
      timer=setTimeout(async()=>{timedOut=true;try{killTree(await processTable(),[child.pid]);}catch{child.kill();}},timeoutMs);
    });
    child.once('error',error=>finish(reject,Error(error.code==='ENOENT'?`Python не найден: ${python}`:`запускатель не стартовал: ${error.code??error.message}`)));
    child.once('close',code=>finish(resolve,timedOut?'timeout':code));
  });
}

// 720 px wide viewing copy for Telegram; the audio stream is copied unchanged, the original is untouched.
export function ffmpegPreview(){
  return (source,target,{onSpawn}={})=>new Promise((resolve,reject)=>{
    // ffmpeg -n leaves an existing file alone but still exits 0, so an old copy is refused explicitly.
    if(existsSync(target)){reject(Error('ffmpeg exit: preview already exists'));return;}
    const child=spawn('ffmpeg',['-nostdin','-v','error','-n','-i',source,'-vf','scale=720:-2','-c:v','libx264','-crf','26','-preset','veryfast',
      '-c:a','copy','-movflags','+faststart',target],{windowsHide:true,stdio:'ignore'});
    child.once('spawn',()=>onSpawn?.(child.pid));
    child.once('error',reject);
    child.once('close',code=>code===0?resolve():reject(Error(`ffmpeg exit ${code}`)));
  });
}
