// Executor of confirmed intake kits: the same SQLite DB and intake jobs, one montage at a time on this laptop.
// The bot only records an explicit request and starts a detached worker, so polling stays responsive. The worker
// rechecks hashes, runs the existing run-local-four-part.py --execute (concurrency 1, video cache 268435456),
// keeps steps, logs and results in the job folder and sends the finished reels. Nothing is retried automatically:
// a failure or an interrupted run stays "ошибка"; a repeated delivery never repeats the montage.
// Every process of a job (launcher, Python steps, Node/Remotion, browser, FFmpeg) is recorded by PID and creation
// time; no next montage starts and no run is declared interrupted while any of them is alive or its state is unknown.
// The executor never ends montage processes or anyone else's: after a timeout it stops waiting and fails the run.
// After a timeout, a crash or any unconfirmed state the queue gets a standing hold that only the operator's explicit
// confirmation of a manual check lifts; processes disappearing do not lift it, and nothing is retried.
// Known limit of the first version: a detached descendant whose intermediate parent lived and exited between two
// snapshots (3 s), without the job ID in its command line, cannot be linked to the job and may be missed.
import path from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
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
      pid INTEGER, executor TEXT, processes TEXT, step TEXT, error TEXT, result TEXT, checked_at TEXT, checked_by TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS intake_one_running ON intake_runs(state) WHERE state='running';
    CREATE TABLE IF NOT EXISTS intake_deliveries (
      job_id TEXT NOT NULL, hook INTEGER NOT NULL, kind TEXT NOT NULL, file TEXT NOT NULL, bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','sent','failed','too_large')),
      message_id INTEGER, PRIMARY KEY(job_id,hook));
    CREATE TABLE IF NOT EXISTS intake_executor_lock (
      id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, pid INTEGER NOT NULL, created TEXT, acquired_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS intake_executor_hold (
      id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, reason TEXT NOT NULL, job_id TEXT, created_at TEXT NOT NULL);`);
}

// Standing hold of the montage queue (one row). Set on a timeout, a crash or an unconfirmed state; announced once.
export const currentHold=db=>db.prepare('SELECT * FROM intake_executor_hold WHERE id=1').get();
export const holdText=reason=>`Очередь монтажа остановлена: ${reason}. Нужна ручная проверка процессов на ноутбуке. `+
  'Следующий монтаж и повтор автоматически не запускаются; исчезновение процессов само очередь не возобновляет. '+
  'После проверки нажми «Проверено, продолжить очередь».';
export const holdButton=token=>({inline_keyboard:[[{text:'Проверено, продолжить очередь',callback_data:`iu:${token}`}]]});
// The operator confirms the manual check of exactly this hold: it is lifted, and records of earlier runs whose state
// could not be confirmed stop blocking (processes still visibly alive keep blocking and set a new hold).
export function confirmManualCheck(db,token,actor,now=new Date()){
  db.exec('BEGIN IMMEDIATE');
  try{
    const cleared=Number(db.prepare('DELETE FROM intake_executor_hold WHERE id=1 AND token=?').run(token).changes)===1;
    if(cleared)db.prepare(`UPDATE intake_runs SET checked_at=?,checked_by=? WHERE state IN ('done','failed') AND processes IS NOT NULL AND checked_at IS NULL`)
      .run(now.toISOString(),String(actor));
    db.exec('COMMIT');
    return {cleared};
  }catch(error){db.exec('ROLLBACK');throw error;}
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

// Process table: PID, parent, creation time (identity against PID reuse), name, command line. The execFile timeout
// bounds only this diagnostic query (our own PowerShell); montage processes and other processes are never ended.
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
// Creation times compared at full precision (Windows gives 100 ns ticks): ISO strings normalised to 9 fraction
// digits and compared as text, never rounded to milliseconds. NaN when a time cannot be read.
const exact=s=>{const m=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(s??'');return m?`${m[1]}.${(m[2]??'').padEnd(9,'0')}`:null;};
export function compareTimes(a,b){const x=exact(a),y=exact(b);return x===null||y===null?NaN:x<y?-1:x>y?1:0;}
const notAfter=(a,b)=>compareTimes(a,b)<=0;  // false for unreadable times

// A bounded wait for the process list: null when it fails or does not answer in time.
async function boundedTable(processTable,ms){
  let timer;
  try{return await Promise.race([processTable(),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),ms);})]);}
  catch{return null;}
  finally{clearTimeout(timer);}
}

// Identity of a recorded process against a fresh table: 'alive' (that PID with the same readable creation time),
// 'gone' (no process holds the PID, or only ones with another readable creation time: the PID was reused), or
// 'unknown' (the PID is held but a creation time is missing or unreadable on either side). An approximate start time
// is never taken as identity; unknown blocks exactly like alive.
function stateOf(table,record){
  const holders=table.filter(p=>p.pid===record.pid);
  if(!holders.length)return 'gone';
  if(!exact(record.created))return 'unknown';
  if(holders.some(p=>compareTimes(p.created,record.created)===0))return 'alive';
  return holders.every(p=>exact(p.created))?'gone':'unknown';
}

// Processes of one run, split by proof; all three groups block the queue. Owned: recorded ones alive (same PID and
// creation time), anything whose command line names the job (its paths contain the job ID), their descendants, and
// an orphan whose recorded parent has exited, if the orphan was created no later than the last snapshot that saw that
// parent holding its PID. Uncertain: an orphan created after that moment (the PID may have been reused), a process
// whose relation to a job process cannot be ordered because a creation time is missing, and their descendants.
// Unknown: records whose PID is held by a process that cannot be identified (no creation time on either side).
// The current executor never counts.
export function jobProcesses(table,run,selfPid=process.pid){
  const records=JSON.parse(run.processes||'[]'),byPid=new Map(table.map(p=>[p.pid,p]));
  const owned=new Map(),uncertain=new Map(),unknown=[];
  for(const r of records){
    const state=stateOf(table,r);
    if(state==='alive')(r.uncertain?uncertain:owned).set(r.pid,byPid.get(r.pid));
    else if(state==='unknown')unknown.push({pid:r.pid,created:r.created??null,name:r.name});
  }
  for(const p of table)if(p.commandLine.includes(run.job_id)){uncertain.delete(p.pid);owned.set(p.pid,p);}
  const linkOf=p=>{
    const parent=byPid.get(p.ppid),recorded=records.filter(r=>r.pid===p.ppid);
    if(parent){
      const job=owned.has(parent.pid)?owned:uncertain.has(parent.pid)?uncertain:null,order=compareTimes(parent.created,p.created);
      if(order<=0)return job;  // a live process created before p has held the parent PID ever since: it is p's parent
      if(Number.isNaN(order))return job||recorded.length?uncertain:null;  // cannot be ordered: no proof either way
      // The live holder was created after p: it reused the PID, p's real parent has exited.
    }
    if(!exact(p.created))return recorded.length?uncertain:null;
    // The latest recorded holder of that PID created before p.
    const holder=recorded.filter(r=>notAfter(r.created,p.created)).sort((a,b)=>compareTimes(b.created,a.created))[0];
    if(holder)return !holder.uncertain&&notAfter(p.created,holder.lastSeen)?owned:uncertain;
    return recorded.some(r=>!exact(r.created))?uncertain:null;  // a root recorded without its creation time
  };
  for(let changed=true;changed;){
    changed=false;
    for(const p of table){
      if(p.pid===selfPid||owned.has(p.pid)||uncertain.has(p.pid))continue;
      const target=linkOf(p);if(target){target.set(p.pid,p);changed=true;}
    }
  }
  owned.delete(selfPid);uncertain.delete(selfPid);
  return {owned:[...owned.values()],uncertain:[...uncertain.values()],unknown:unknown.filter(r=>r.pid!==selfPid)};
}
const liveOf=(table,run,selfPid)=>{const {owned,uncertain,unknown}=jobProcesses(table,run,selfPid);return [...owned,...uncertain,...unknown];};

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
    const table=await boundedTable(o.processTable,o.listMs);
    const state=table?stateOf(table,holder):'unknown';
    if(state==='alive')return 'busy';
    if(state==='unknown')return 'unverifiable';  // holder cannot be identified or the list is unavailable
    return Number(db.prepare(`UPDATE intake_executor_lock SET token=?,pid=?,created=?,acquired_at=? WHERE id=1 AND token=?`)
      .run(self.token,self.pid,self.created,o.now().toISOString(),holder.token).changes)===1||'busy';
  }
  return 'busy';
}
// Only the current owner releases: a lock row with another token is left as it is.
function releaseLock(o){o.db.prepare('DELETE FROM intake_executor_lock WHERE id=1 AND token=?').run(o.self.token);}

async function notify(o,actor,text,markup){try{await o.api.send(Number(actor),text,markup);}catch{o.log?.({event:'executor_notify_failed'});}}

// Sets the standing hold; only the call that creates it notifies, so repeated passes never repeat the message.
// Recipients: the operator of the affected job and of waiting or running jobs, else the operator of the latest run.
async function hold(o,reason,jobId=null){
  const token=randomBytes(4).toString('hex');
  const created=Number(o.db.prepare('INSERT OR IGNORE INTO intake_executor_hold (id,token,reason,job_id,created_at) VALUES (1,?,?,?,?)')
    .run(token,reason,jobId,o.now().toISOString()).changes)===1;
  o.log?.({event:'executor_hold',created});
  if(!created)return;
  let actors=o.db.prepare(`SELECT DISTINCT requested_by FROM intake_runs WHERE job_id=? OR state IN ('waiting','running')`).all(jobId);
  if(!actors.length)actors=o.db.prepare('SELECT requested_by FROM intake_runs ORDER BY rowid DESC LIMIT 1').all();
  for(const {requested_by} of actors)await notify(o,requested_by,holdText(reason),holdButton(token));
}

// Holding the lock means no other executor runs. A "running" row is declared interrupted only after its executor
// and every recorded or marked process of the job are gone; it fails and is never re-run automatically.
async function recoverInterrupted(o,table){
  let blocked=false;
  for(const run of o.db.prepare(`SELECT * FROM intake_runs WHERE state='running'`).all()){
    const executor=run.executor?JSON.parse(run.executor):null;
    const live=liveOf(table,run,o.pid);
    if((executor&&executor.token!==o.self.token&&stateOf(table,executor)!=='gone')||live.length){
      blocked=true;o.log?.({event:'executor_previous_still_running',processes:live.length});
      await hold(o,`монтаж ${run.job_id} в статусе «обрабатывается», но его исполнитель или процессы ещё работают либо не опознаны`,run.job_id);
      continue;
    }
    o.db.prepare(`UPDATE intake_runs SET state='failed',finished_at=?,error=? WHERE job_id=? AND state='running'`)
      .run(o.now().toISOString(),`прервано на шаге ${run.step??'неизвестно'} (перезапуск или сбой)`,run.job_id);
    await hold(o,`монтаж ${run.job_id} прерван на шаге ${run.step??'неизвестно'} (перезапуск или сбой); видимых процессов задания нет`,run.job_id);
  }
  return blocked;
}

// Processes of finished or failed runs that outlived their run still block the next montage. After the operator's
// confirmed manual check, records whose identity cannot be confirmed no longer block; visibly alive ones still do.
function lingering(o,table){
  return o.db.prepare(`SELECT job_id,processes,checked_at FROM intake_runs WHERE state IN ('done','failed') AND processes IS NOT NULL`).all()
    .find(run=>{const {owned,uncertain,unknown}=jobProcesses(table,run,o.pid);return owned.length||uncertain.length||(!run.checked_at&&unknown.length);});
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
  const known=new Map();let timer=null,busy=false;
  const save=()=>{
    const list=[...known.values()];
    o.db.prepare('UPDATE intake_runs SET processes=? WHERE job_id=?').run(JSON.stringify(list),run.job_id);
    writeJson(path.join(exec,'processes.json'),list);
  };
  const current=()=>({job_id:run.job_id,processes:JSON.stringify([...known.values()])});
  const running=new Map();  // PID of a direct child -> whether it has not exited yet (its handle is still held)
  // Records every live process of the job with the time of the snapshot (taken before the table was read, so the
  // process held its PID at least until then); orphans are later linked to an exited parent through this time.
  // A direct child recorded at spawn without a creation time is identified only while it has not exited: then Node
  // still holds its handle and the PID cannot belong to anyone else. Otherwise it stays unidentified (unknown).
  const observe=(table,seenAt)=>{
    for(const [pid,isRunning] of running){
      const p=table.find(x=>x.pid===pid);
      if(known.has(`${pid}:`)&&isRunning()&&exact(p?.created)){
        known.delete(`${pid}:`);known.set(`${pid}:${p.created}`,{pid,ppid:p.ppid,created:p.created,name:p.name,lastSeen:seenAt});
      }
    }
    const {owned,uncertain,unknown}=jobProcesses(table,current(),o.pid);
    for(const [list,flag] of [[owned,false],[uncertain,true]])for(const p of list){
      const key=`${p.pid}:${p.created}`;
      known.set(key,{...known.get(key),pid:p.pid,ppid:p.ppid,created:p.created,name:p.name,lastSeen:seenAt,...(flag?{uncertain:true}:{})});
    }
    save();
    return [...owned,...uncertain,...unknown];
  };
  const snapshot=async()=>{
    if(busy)return;busy=true;
    try{const seenAt=new Date().toISOString();observe(await o.processTable(),seenAt);}
    catch{o.log?.({event:'executor_process_snapshot_failed'});}
    finally{busy=false;}
  };
  return {
    onSpawn:(pid,isRunning=()=>false)=>{running.set(pid,isRunning);known.set(`${pid}:`,{pid,created:null,spawnedAt:new Date().toISOString()});
      save();snapshot();timer??=setInterval(snapshot,o.trackMs);},
    stop:()=>{clearInterval(timer);timer=null;},
    // After a step that ended normally: wait (about settleMs, each list wait bounded by listMs; nothing is ended) until
    // no process of the job is alive or unidentified. Returns what is left; an unavailable process list throws.
    async waitEnd(){
      const deadline=Date.now()+o.settleMs;
      for(;;){
        const seenAt=new Date().toISOString(),table=await boundedTable(o.processTable,o.listMs);
        if(!table)throw Error('process list unavailable');
        const left=observe(table,seenAt);
        if(!left.length||Date.now()>=deadline)return left;
        await delay(o.pollMs);
      }
    }
  };
}

const duration=ms=>ms>=3600000?`${Math.round(ms/3600000)} ч`:ms>=60000?`${Math.round(ms/60000)} мин`:`${Math.round(ms/1000)} с`;
const manualCheck=reason=>Object.assign(Error(`${reason} — нужна ручная проверка процессов на ноутбуке`),{hold:true});

async function executeRun(o,run){
  const job=o.db.prepare('SELECT * FROM intake_jobs WHERE id=?').get(run.job_id);
  const dir=path.join(o.root,run.job_id),exec=path.join(dir,'executor'),steps=[];
  const step=name=>{
    steps.push({name,at:o.now().toISOString()});
    o.db.prepare('UPDATE intake_runs SET step=? WHERE job_id=?').run(name,run.job_id);
    if(existsSync(exec))writeFileSync(path.join(exec,'steps.json'),JSON.stringify(steps,null,2)+'\n');
  };
  let track=null;
  // After each step: an unavailable process list, or a process that outlived the step or cannot be identified, stops
  // this run and the queue; nothing is ended automatically, the operator checks the laptop.
  const waitEnd=async what=>{
    let left;
    try{left=await track.waitEnd();}
    catch{throw manualCheck(`не удалось проверить завершение процессов (${what}): список процессов недоступен`);}
    if(left.length)throw manualCheck(`процессы (${what}) не завершились или не опознаны: PID ${left.map(p=>p.pid).join(', ')}`);
  };
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
    if(code==='timeout')throw manualCheck(`превышено время монтажа (${duration(o.timeoutMs)}): запускатель не завершён, процессы автоматически не останавливаются`);
    await waitEnd('запускатель');
    if(code!==0)throw Error(`запускатель завершился с кодом ${code}`);
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
      let previewError=null;
      try{await o.makePreview(r.file,preview,{onSpawn:track.onSpawn});}catch(error){previewError=error;}finally{track.stop();}
      if(previewError?.timedOut)throw manualCheck(`${previewError.message}: FFmpeg не завершён, процессы автоматически не останавливаются`);
      await waitEnd('FFmpeg');
      if(previewError)throw previewError;
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
    // Nothing to send (every reel over the limit even as a viewing copy): the final message is sent now.
    if(!deliveries.some(d=>d.state==='pending'))await summarize(o,job.id);
    return {done:true};
  }catch(error){
    track?.stop();
    o.db.prepare(`UPDATE intake_runs SET state='failed',finished_at=?,error=? WHERE job_id=? AND state='running'`)
      .run(o.now().toISOString(),short(error),run.job_id);
    if(existsSync(exec))writeFileSync(path.join(exec,'error.json'),JSON.stringify({step:steps.at(-1)?.name??null,error:short(error),steps},null,2)+'\n');
    if(error.hold)await hold(o,`монтаж ${run.job_id}: ошибка на шаге ${steps.at(-1)?.name??'подготовка'} — ${short(error)}`,run.job_id);
    else await notify(o,run.requested_by,`Монтаж ${run.job_id}: ошибка на шаге ${steps.at(-1)?.name??'подготовка'} — ${short(error)}\n`+
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
  for(const jobId of touched)await summarize(o,jobId);
  return touched.size;
}

// Final message of a finished run: what was sent, what was not and why, where the originals are kept.
async function summarize(o,jobId){
  const all=o.db.prepare('SELECT * FROM intake_deliveries WHERE job_id=? ORDER BY hook').all(jobId);
  const run=o.db.prepare('SELECT * FROM intake_runs WHERE job_id=?').get(jobId);
  const sent=all.filter(d=>d.state==='sent').length,failed=all.filter(d=>d.state==='failed'),large=all.filter(d=>d.state==='too_large');
  await notify(o,run.requested_by,`Монтаж ${jobId}: готово. Отправлено рилсов: ${sent} из ${all.length}.`+
    (failed.length?`\nНе отправлены: хук ${failed.map(d=>d.hook).join(', ')} — повтор отправки в /montage (монтаж не повторяется).`:'')+
    (large.length?`\nБольше лимита Telegram 50 МБ даже в копии просмотра, не отправлены: хук ${large.map(d=>d.hook).join(', ')}. Оригиналы на ноутбуке:\n`+
      large.map(d=>d.file).join('\n'):'')+
    '\nОригиналы сохранены на ноутбуке. Речь всё ещё требует проверки, к публикации не готово.');
}

const tableOrNull=o=>boundedTable(o.processTable,o.listMs);


// Sequential pass: deliveries of finished runs first, then waiting runs one by one, until nothing is left.
// A pass that finds live processes of an earlier run claims nothing and leaves the run as it is.
export async function runExecutor(options){
  const o={now:()=>new Date(),pid:process.pid,processTable:systemProcessTable,
    trackMs:3000,pollMs:1000,settleMs:60000,listMs:90000,timeoutMs:4*3600000,...options};
  ensureRunTables(o.db);
  const listDown='список процессов недоступен — завершение процессов прежних заданий не подтверждено';
  const me=(await tableOrNull(o))?.find(p=>p.pid===o.pid);
  if(!exact(me?.created)){await hold(o,`${listDown} (исполнитель не смог опознать себя)`);return {processed:0,blocked:true};}
  o.self={pid:o.pid,created:me.created,token:randomUUID()};
  let processed=0;
  for(;;){
    const lock=await acquireLock(o);
    if(lock!==true){
      if(lock==='unverifiable')await hold(o,'блокировку исполнителя держит процесс, который нельзя опознать, или список процессов недоступен');
      return {lockBusy:true,processed};
    }
    let blocked=false;
    try{
      // Recovery judges only with a table taken after the lock is held. Without a process list nothing is checked,
      // so nothing is declared interrupted and no next montage starts. A standing hold blocks until confirmed.
      let table=await tableOrNull(o);
      if(!table){blocked=true;await hold(o,listDown);}
      else blocked=await recoverInterrupted(o,table)||!!currentHold(o.db);
      while(!blocked){
        await deliverPending(o);
        table=await tableOrNull(o);
        if(!table){blocked=true;await hold(o,listDown);break;}
        const left=lingering(o,table);
        if(left){blocked=true;await hold(o,`процессы задания ${left.job_id} ещё работают или их состояние не подтверждено`,left.job_id);break;}
        const run=claim(o);
        if(!run)break;
        processed++;
        await executeRun(o,run);
        if(currentHold(o.db))blocked=true;
      }
    }finally{releaseLock(o);}
    if(blocked)return {processed,blocked:true};
    // Work queued between the last check and the lock release would otherwise wait for the next button press.
    if(!hasQueuedWork(o.db))return {processed};
  }
}

// Launcher process: log files are closed exactly once. At the time limit the runner stops waiting and returns
// 'timeout' without depending on close; nothing is ended (the run fails and the queue stays blocked).
export function processRunner({python}){
  return ({args,stdout,stderr,onSpawn,timeoutMs=4*3600000})=>new Promise((resolve,reject)=>{
    let out,err;
    try{out=openSync(stdout,'wx');err=openSync(stderr,'wx');}
    catch(error){if(out!==undefined)closeSync(out);reject(error);return;}
    let finished=false,exited=false,timer=null;
    const finish=(settle,value)=>{if(finished)return;finished=true;clearTimeout(timer);closeSync(out);closeSync(err);settle(value);};
    let child;
    try{child=spawn(python,args,{cwd:path.dirname(LAUNCHER),windowsHide:true,stdio:['ignore',out,err],env:{...process.env,PYTHONIOENCODING:'utf-8'}});}
    catch(error){finish(reject,Error(`запускатель не стартовал: ${error.code??error.message}`));return;}
    child.once('exit',()=>{exited=true;});
    child.once('spawn',()=>{onSpawn?.(child.pid,()=>!exited);timer=setTimeout(()=>finish(resolve,'timeout'),timeoutMs);});
    child.once('error',error=>finish(reject,Error(error.code==='ENOENT'?`Python не найден: ${python}`:`запускатель не стартовал: ${error.code??error.message}`)));
    child.once('close',code=>finish(resolve,code));
  });
}

// 720 px wide viewing copy for Telegram; the audio stream is copied unchanged, the original is untouched.
// Bounded in time: at the limit the copy fails (error.timedOut) without waiting for close; FFmpeg is not ended.
export const PREVIEW_TIMEOUT_MS=30*60000;
const ffmpegCommand=(source,target)=>['ffmpeg',['-nostdin','-v','error','-n','-i',source,'-vf','scale=720:-2','-c:v','libx264','-crf','26',
  '-preset','veryfast','-c:a','copy','-movflags','+faststart',target]];
export function ffmpegPreview({timeoutMs=PREVIEW_TIMEOUT_MS,command=ffmpegCommand}={}){
  return (source,target,{onSpawn}={})=>new Promise((resolve,reject)=>{
    // ffmpeg -n leaves an existing file alone but still exits 0, so an old copy is refused explicitly.
    if(existsSync(target)){reject(Error('ffmpeg exit: preview already exists'));return;}
    const [program,args]=command(source,target);
    const child=spawn(program,args,{windowsHide:true,stdio:'ignore'});
    let finished=false,exited=false,timer=null;
    const finish=(settle,value)=>{if(finished)return;finished=true;clearTimeout(timer);settle(value);};
    child.once('exit',()=>{exited=true;});
    child.once('spawn',()=>{
      onSpawn?.(child.pid,()=>!exited);
      timer=setTimeout(()=>finish(reject,Object.assign(Error(`копия просмотра не готова за ${duration(timeoutMs)}`),{timedOut:true})),timeoutMs);
    });
    child.once('error',error=>finish(reject,error));
    child.once('close',code=>code===0?finish(resolve):finish(reject,Error(`ffmpeg exit ${code}`)));
  });
}
