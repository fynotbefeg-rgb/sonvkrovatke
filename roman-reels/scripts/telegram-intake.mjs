// Four-MP4 intake over the authenticated panel: Основа / Хук 1 / Хук 2 / Хук 3 assigned by explicit buttons,
// or a local kit from one configured inbox folder whose kit.json maps the four files to roles.
// Files go to one new private folder per kit outside Git; the existing run-local-four-part.py checks the kit
// in plan mode only. Confirmation freezes the checked kit once. No ASR, render, Drive, Google or HeyGen here.
import path from 'node:path';
import {execFile} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {closeSync,constants,copyFileSync,existsSync,fsyncSync,lstatSync,mkdirSync,openSync,readdirSync,readFileSync,readSync,
  realpathSync,renameSync,rmSync,writeSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {TELEGRAM_CLOUD_DOWNLOAD_LIMIT,TelegramApiError} from './telegram-bot-api.mjs';
import {RUN_LABELS,ensureRunTables,hasWork,requestRedelivery,requestRun} from './telegram-executor.mjs';

export const ROLES={body:'Основа',h1:'Хук 1',h2:'Хук 2',h3:'Хук 3'};
export const PARTS=Object.keys(ROLES);
const TOPIC=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_FILES=8;
const OPEN=`state IN ('collecting','plan_ready')`;
const mb=n=>(n/1048576).toFixed(1).replace('.',',');
const limitText=`до ${TELEGRAM_CLOUD_DOWNLOAD_LIMIT/1048576} МБ каждый (предел облачного Bot API для ботов)`;
const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
// Streamed, so local originals larger than memory-friendly sizes are fine; a missing file counts as changed.
export function sha256(file){
  try{
    const fd=openSync(file,'r'),hash=createHash('sha256'),buffer=Buffer.allocUnsafe(1048576);
    try{let n;while((n=readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,n));}finally{closeSync(fd);}
    return hash.digest('hex');
  }catch{return null;}
}
const outside=(child,parent)=>{const r=path.relative(parent,child);return !!r&&(r.startsWith('..')||path.isAbsolute(r));};
// Local kits: <inbox>/<kit>/kit.json = {"topicId":"…","parts":{"body":"…mp4","h1":…,"h2":…,"h3":…}}.
// Names come only from the inbox listing and the manifest, never from Telegram text or callbacks.
const KIT=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const KIT_FILE=/^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,119}\.mp4$/iu;  // any alphabet; no separators, ':' or control characters
const LOCAL_MAX_BYTES=4*1024**3;
const MAX_KITS=10;
const OFFER_TTL_MS=900000;

export class FourPartIntake {
  // db: the existing ProductionQueue SQLite handle; one database and one polling lock for the bot.
  // startExecutor: starts the detached montage worker (never awaited for the montage itself); without it no montage button.
  constructor(db,{root,inbox,plan,startExecutor,now=()=>new Date()}={}) {
    if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Absolute private intake folder required');
    if(!outside(path.resolve(root),REPO))throw Error('Intake folder must stay outside the Git work tree');
    if(inbox!==undefined){
      if(typeof inbox!=='string'||!path.isAbsolute(inbox))throw Error('Absolute local kit inbox required');
      if(!outside(path.resolve(inbox),REPO))throw Error('Local kit inbox must stay outside the Git work tree');
      if(!outside(path.resolve(inbox),path.resolve(root))||!outside(path.resolve(root),path.resolve(inbox)))throw Error('Inbox and intake folders must be separate');
    }
    if(typeof plan!=='function')throw Error('Launcher plan runner required');
    if(startExecutor!==undefined&&typeof startExecutor!=='function')throw Error('Executor starter must be a function');
    Object.assign(this,{db,root,inbox,plan,startExecutor,now});
    db.exec(`CREATE TABLE IF NOT EXISTS intake_jobs (
        id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, topic_id TEXT NOT NULL, state TEXT NOT NULL,
        plan_version INTEGER NOT NULL DEFAULT 0, plan TEXT, created_at TEXT NOT NULL, confirmed_at TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS intake_one_open ON intake_jobs(actor_id) WHERE ${OPEN};
      CREATE TABLE IF NOT EXISTS intake_files (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, file_unique_id TEXT NOT NULL, role TEXT,
        name TEXT NOT NULL, bytes INTEGER NOT NULL, local_path TEXT NOT NULL, UNIQUE(job_id,file_unique_id));
      CREATE UNIQUE INDEX IF NOT EXISTS intake_one_role ON intake_files(job_id,role) WHERE role IS NOT NULL;
      CREATE TABLE IF NOT EXISTS intake_offers (
        id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, kit TEXT NOT NULL, topic_id TEXT NOT NULL,
        parts TEXT NOT NULL, expires_at INTEGER NOT NULL, job_id TEXT);`);
    ensureRunTables(db);
  }
  openJob(actor){return this.db.prepare(`SELECT * FROM intake_jobs WHERE actor_id=? AND ${OPEN}`).get(actor);}
  files(jobId){return this.db.prepare('SELECT * FROM intake_files WHERE job_id=? ORDER BY rowid').all(jobId);}
  jobDir(jobId){return path.join(this.root,jobId);}
  status(job){
    const assigned=new Map(this.files(job.id).filter(f=>f.role).map(f=>[f.role,f]));
    const missing=PARTS.filter(p=>!assigned.has(p));
    return {assigned,missing,text:PARTS.map(p=>`${assigned.has(p)?'✓':'—'} ${ROLES[p]}${assigned.has(p)?`: «${assigned.get(p).name}»`:''}`).join('\n')};
  }
}

const roleButtons=fileId=>({inline_keyboard:[
  [{text:ROLES.body,callback_data:`ir:${fileId}:body`}],
  [{text:ROLES.h1,callback_data:`ir:${fileId}:h1`},{text:ROLES.h2,callback_data:`ir:${fileId}:h2`},{text:ROLES.h3,callback_data:`ir:${fileId}:h3`}]]});

// Temp file in the same folder, flushed, then renamed: readers see the old or the complete new file.
function writeAtomic(file,text){
  const temp=`${file}.${randomUUID()}.tmp`;
  try{const fd=openSync(temp,'wx');try{writeSync(fd,text);fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,file);}
  finally{rmSync(temp,{force:true});}
}

function summary(job,report){
  const lines=PARTS.map(p=>{const i=report.inputs[p],m=i.metadata;
    return `${ROLES[p]}: ${mb(i.bytes)} МБ · ${m.duration.toFixed(2)} с · ${m.width}×${m.height} · SHA ${i.sha256.slice(0,8)}`;});
  return `Комплект ${job.id} · тема ${job.topic_id}\n${lines.join('\n')}\n\n`+
    'Запускатель проверил комплект в режиме плана: файлы читаются и декодируются, все четыре разные. '+
    'ASR и рендер не запускались. Подтверждение фиксирует этот комплект один раз.';
}

async function runPlan(intake,job,api,actor){
  const {assigned}=intake.status(job);
  const parts=Object.fromEntries(PARTS.map(p=>[p,assigned.get(p).local_path]));
  let result;
  try{result=await intake.plan({parts,topicId:job.topic_id,out:path.join(intake.jobDir(job.id),`run-${job.id}`)});}
  catch{result={ok:false,error:'запускатель недоступен'};}
  if(!result?.ok){
    await api.send(actor,`Комплект не прошёл проверку запускателем: ${String(result?.error??'неизвестная ошибка').slice(0,300)}\n`+
      'Замени файл и назначь роль заново (или нажми роль ещё раз, чтобы повторить проверку); локальный комплект — '+
      '/intake_cancel, исправь папку и /intake_local. Ничего не запущено.');
    return {planned:false};
  }
  const version=job.plan_version+1;
  const changed=intake.db.prepare(`UPDATE intake_jobs SET state='plan_ready',plan_version=?,plan=? WHERE id=? AND state='collecting' AND plan_version=?`)
    .run(version,JSON.stringify(result.report),job.id,job.plan_version).changes;
  if(Number(changed)!==1)return {planned:false};
  const record=path.join(intake.jobDir(job.id),`plan-v${version}.json`);
  if(!existsSync(record))writeAtomic(record,JSON.stringify(result.report,null,2)+'\n');
  return {planned:true,...await sendSummary(intake,job.id,api,actor)};
}

// The saved plan is the source of the summary: a lost reply is re-sent from the DB, never planned again.
async function sendSummary(intake,jobId,api,actor){
  const job=intake.db.prepare(`SELECT * FROM intake_jobs WHERE id=? AND state='plan_ready'`).get(jobId);
  await api.send(actor,summary(job,JSON.parse(job.plan)),{inline_keyboard:[[{text:'Подтвердить запуск',callback_data:`ic:${job.id}:${job.plan_version}`}]]});
  return {summarySent:true,planVersion:job.plan_version};
}

async function receiveFile(intake,update,actor,api){
  const message=update.message;
  if(message.video||message.animation){
    await api.send(actor,'Видео, отправленное как «видео», Telegram может пережать. Отправь MP4 как файл (документ), '+limitText+'.');
    return {rejected:'compressed_video'};
  }
  const job=intake.openJob(String(actor));
  if(!job){await api.send(actor,'Сначала открой комплект: /intake <тема>, например /intake roman-seo-01.');return {rejected:'no_job'};}
  const doc=message.document,name=typeof doc.file_name==='string'?doc.file_name.slice(0,120):'без имени';
  if(!(/\.mp4$/i.test(name)||doc.mime_type==='video/mp4')){await api.send(actor,`«${name}» не MP4. Нужны четыре MP4.`);return {rejected:'not_mp4'};}
  if(!Number.isSafeInteger(doc.file_size)||doc.file_size<1||doc.file_size>TELEGRAM_CLOUD_DOWNLOAD_LIMIT){
    await api.send(actor,`«${name}»${Number.isSafeInteger(doc.file_size)?` — ${mb(doc.file_size)} МБ`:''}: бот принимает файлы ${limitText}. `+
      'Файл крупнее этим способом не скачать, а сжатая копия — уже не оригинал. Файл не принят.');
    return {rejected:'too_large'};
  }
  if(typeof doc.file_unique_id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(doc.file_unique_id))throw Error('Invalid Telegram file');
  const known=intake.db.prepare('SELECT * FROM intake_files WHERE job_id=? AND file_unique_id=?').get(job.id,doc.file_unique_id);
  if(known){await api.send(actor,`«${known.name}» уже получен. Что это?`,roleButtons(known.id));return {duplicate:true};}
  if(intake.files(job.id).length>=MAX_FILES){await api.send(actor,`В комплекте уже ${MAX_FILES} файлов. Отмени его: /intake_cancel.`);return {rejected:'too_many'};}
  const info=await api.fileInfo(doc.file_id);
  if(info.size>TELEGRAM_CLOUD_DOWNLOAD_LIMIT)throw Error('Telegram file over limit');
  const id=randomUUID(),files=path.join(intake.jobDir(job.id),'files'),target=path.join(files,`${id}.mp4`),partial=`${target}.part`;
  mkdirSync(files,{recursive:true});
  const bytes=await api.download(info.filePath,partial);
  if(bytes!==info.size)throw Error('Telegram file size mismatch');
  renameSync(partial,target);
  intake.db.prepare('INSERT INTO intake_files VALUES (?,?,?,NULL,?,?,?)').run(id,job.id,doc.file_unique_id,name,bytes,target);
  await api.send(actor,`Получен «${name}», ${mb(bytes)} МБ. Что это?`,roleButtons(id));
  return {received:true};
}

async function assignRole(intake,data,actor,api){
  const [,fileId,role]=data.split(':');
  const file=intake.db.prepare('SELECT f.*,j.actor_id,j.state FROM intake_files f JOIN intake_jobs j ON j.id=f.job_id WHERE f.id=?').get(fileId);
  if(!file||file.actor_id!==String(actor)||!['collecting','plan_ready'].includes(file.state)){
    await api.send(actor,'Кнопка устарела: комплект закрыт или подтверждён. Открой /intake.');return {stale:true};
  }
  const db=intake.db;let changed=false;
  db.exec('BEGIN IMMEDIATE');
  try{
    if(file.role!==role){
      db.prepare('UPDATE intake_files SET role=NULL WHERE job_id=? AND role=?').run(file.job_id,role);
      db.prepare('UPDATE intake_files SET role=? WHERE id=?').run(role,fileId);
      // Any change after a plan withdraws the old summary and its confirmation button.
      db.prepare(`UPDATE intake_jobs SET state='collecting',plan=NULL,plan_version=plan_version+1 WHERE id=? AND state='plan_ready'`).run(file.job_id);
      changed=true;
    }
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  const job=intake.openJob(String(actor)),{missing,text}=intake.status(job);
  await api.send(actor,`«${file.name}» → ${ROLES[role]}${changed?'':' (уже было)'}\n${text}`+
    (missing.length?`\n\nНе хватает: ${missing.map(p=>ROLES[p]).join(', ')}. Запуск недоступен, пока комплект неполный.`:''));
  if(!missing.length&&job.state==='collecting')return {assigned:true,...await runPlan(intake,job,api,actor)};
  if(!missing.length&&job.state==='plan_ready')return {assigned:true,restored:true,...await sendSummary(intake,job.id,api,actor)};
  return {assigned:true,missing:missing.length};
}

async function confirm(intake,data,actor,api){
  const [,jobId,version]=data.split(':');
  const job=intake.db.prepare('SELECT * FROM intake_jobs WHERE id=? AND actor_id=?').get(jobId,String(actor));
  if(!job){await api.send(actor,'Комплект не найден.');return {stale:true};}
  if(job.state==='confirmed'){
    const restored=ensureConfirmation(intake,job);
    await api.send(actor,`Комплект ${job.id} уже подтверждён (${job.confirmed_at}). Повторное нажатие ничего не запускает.`+
      (restored?'\nФайл фиксации восстановлен из подтверждённого состояния.':''),montageButton(intake,job.id));
    return {alreadyConfirmed:true,confirmationRestored:restored};
  }
  if(job.state!=='plan_ready'||String(job.plan_version)!==version){
    await api.send(actor,'Кнопка устарела: комплект изменился или отменён. Подтверждай последнюю сводку.');return {stale:true};
  }
  const report=JSON.parse(job.plan);
  const changedPart=PARTS.find(p=>sha256(report.inputs[p].path)!==report.inputs[p].sha256);
  if(changedPart){
    intake.db.prepare(`UPDATE intake_jobs SET state='collecting',plan=NULL,plan_version=plan_version+1 WHERE id=? AND state='plan_ready'`).run(job.id);
    await api.send(actor,`${ROLES[changedPart]}: файл изменился после проверки. Назначь роль заново.`);return {stale:true};
  }
  const at=intake.now().toISOString();
  const changed=intake.db.prepare(`UPDATE intake_jobs SET state='confirmed',confirmed_at=? WHERE id=? AND state='plan_ready' AND plan_version=?`)
    .run(at,job.id,job.plan_version).changes;
  if(Number(changed)!==1){await api.send(actor,'Кнопка устарела. Открой /intake.');return {stale:true};}
  ensureConfirmation(intake,{...job,state:'confirmed',confirmed_at:at});
  await api.send(actor,`Комплект ${job.id} подтверждён и зафиксирован (хеши четырёх файлов).\n`+
    (intake.startExecutor?'Монтаж (ASR и три рилса) запускается отдельной кнопкой «Запустить монтаж».':
      'Исполнение — ASR, монтаж трёх рилсов и их отправка — на этом координаторе не подключено и не запущено.'),montageButton(intake,job.id));
  return {confirmed:true,executeStarted:false};
}

// Montage: an explicit request per confirmed job; the worker is started in the background, never awaited here.
const montageButton=(intake,jobId)=>intake.startExecutor&&!intake.db.prepare('SELECT 1 FROM intake_runs WHERE job_id=?').get(jobId)?
  {inline_keyboard:[[{text:'Запустить монтаж',callback_data:`ix:${jobId}`}]]}:undefined;

async function kickExecutor(intake,api,actor){
  try{await intake.startExecutor();return true;}
  catch{await api.send(actor,'Исполнитель не запустился. Задание осталось в очереди; проверь ноутбук и открой /montage.');return false;}
}

async function startMontage(intake,data,actor,api){
  if(!intake.startExecutor){await api.send(actor,'Монтаж на этом координаторе не подключён.');return {blocked:true};}
  const jobId=data.slice(3),result=requestRun(intake.db,jobId,actor,intake.now());
  if(result.refused){await api.send(actor,'Монтаж доступен только для подтверждённого комплекта.');return {refused:true};}
  const run=result.run;
  await api.send(actor,result.created?`Монтаж ${jobId} поставлен в очередь: ожидает. Бот остаётся доступен; о начале и результате сообщу.`:
    `Монтаж ${jobId} уже в очереди: ${RUN_LABELS[run.state]}${run.error?` (${run.error})`:''}. Повтор не создаётся.`);
  const started=run.state==='waiting'&&await kickExecutor(intake,api,actor);
  return {queued:result.created,state:run.state,executorStarted:!!started};
}

async function redeliver(intake,data,actor,api){
  if(!intake.startExecutor){await api.send(actor,'Монтаж на этом координаторе не подключён.');return {blocked:true};}
  const jobId=data.slice(3),result=requestRedelivery(intake.db,jobId,actor);
  if(result.refused){await api.send(actor,'Повтор отправки доступен только для готового монтажа.');return {refused:true};}
  await api.send(actor,result.reset?`Повторяю отправку рилсов задания ${jobId}: ${result.reset}. Монтаж не повторяется.`:'Неотправленных рилсов нет.');
  const started=result.reset>0&&await kickExecutor(intake,api,actor);
  return {redelivery:result.reset,executorStarted:!!started};
}

async function montageStatus(intake,actor,api){
  if(!intake.startExecutor){await api.send(actor,'Монтаж на этом координаторе не подключён.');return {blocked:true};}
  const runs=intake.db.prepare(`SELECT r.*,j.topic_id FROM intake_runs r JOIN intake_jobs j ON j.id=r.job_id
    WHERE r.requested_by=? ORDER BY r.rowid DESC LIMIT 10`).all(String(actor));
  const ready=intake.db.prepare(`SELECT j.id,j.topic_id FROM intake_jobs j LEFT JOIN intake_runs r ON r.job_id=j.id
    WHERE j.actor_id=? AND j.state='confirmed' AND r.job_id IS NULL ORDER BY j.rowid DESC LIMIT 5`).all(String(actor));
  const buttons=[];
  const lines=runs.map(r=>{
    const d=intake.db.prepare('SELECT state,count(*) n FROM intake_deliveries WHERE job_id=? GROUP BY state').all(r.job_id);
    const count=s=>d.find(x=>x.state===s)?.n??0;
    if(r.state==='done'&&count('failed'))buttons.push([{text:`Повторить отправку ${r.job_id}`,callback_data:`id:${r.job_id}`}]);
    return `${r.job_id} · ${r.topic_id}: ${RUN_LABELS[r.state]}${r.state==='running'&&r.step?` (шаг ${r.step})`:''}`+
      (r.state==='done'?` · отправлено ${count('sent')} из ${d.reduce((n,x)=>n+x.n,0)}`:'')+(r.state==='failed'&&r.error?` — ${r.error}`:'');
  });
  for(const j of ready)buttons.push([{text:`Запустить монтаж ${j.id}`,callback_data:`ix:${j.id}`}]);
  await api.send(actor,(lines.length?`Монтаж:\n${lines.join('\n')}`:'Запусков монтажа пока нет.')+
    (ready.length?`\n\nПодтверждены, монтаж не запускался: ${ready.map(j=>`${j.id} · ${j.topic_id}`).join(', ')}.`:'')+
    '\nПосле ошибки или перезапуска повтор автоматически не запускается.',buttons.length?{inline_keyboard:buttons}:undefined);
  if(hasWork(intake.db))await kickExecutor(intake,api,actor);  // e.g. a worker that could not start earlier
  return {runs:runs.length,ready:ready.length};
}

// Frozen launch request for the later executor, derived only from the confirmed DB row. An existing file counts
// only if it parses to exactly that content; a missing or damaged file is rewritten atomically. Returns true if rewritten.
function ensureConfirmation(intake,job){
  const file=path.join(intake.jobDir(job.id),'confirmed.json');
  const report=JSON.parse(job.plan);
  const expected={schemaVersion:'1.0.0',jobId:job.id,topicId:job.topic_id,confirmedAt:job.confirmed_at,
    confirmedBy:job.actor_id,planVersion:job.plan_version,launcher:'run-local-four-part.py',out:report.output,
    parts:Object.fromEntries(PARTS.map(p=>[p,{path:report.inputs[p].path,sha256:report.inputs[p].sha256,bytes:report.inputs[p].bytes}])),
    executeStarted:false,productionReady:false,approvalStatus:'pending_approval'};
  try{if(isDeepStrictEqual(JSON.parse(readFileSync(file,'utf8')),expected))return false;}catch{}
  writeAtomic(file,JSON.stringify(expected,null,2)+'\n');
  return true;
}

// One kit folder directly inside the inbox; symlinks and anything resolving elsewhere are refused.
function readKit(inbox,kit){
  if(!KIT.test(kit))return {ok:false,reason:'недопустимое имя папки'};
  const base=realpathSync(inbox),dir=path.join(base,kit);
  const info=lstatSync(dir,{throwIfNoEntry:false});
  if(!info?.isDirectory()||info.isSymbolicLink()||path.dirname(realpathSync(dir))!==base)return {ok:false,reason:'не папка внутри входящей'};
  const manifestFile=path.join(dir,'kit.json'),manifestInfo=lstatSync(manifestFile,{throwIfNoEntry:false});
  if(!manifestInfo?.isFile()||manifestInfo.size>65536)return {ok:false,reason:'нет kit.json'};
  let manifest;
  try{manifest=JSON.parse(readFileSync(manifestFile,'utf8'));}catch{return {ok:false,reason:'kit.json не читается'};}
  if(!manifest||typeof manifest!=='object'||Object.keys(manifest).some(k=>!['topicId','parts'].includes(k))||
    typeof manifest.topicId!=='string'||!TOPIC.test(manifest.topicId)||!manifest.parts||typeof manifest.parts!=='object'||Array.isArray(manifest.parts))
    return {ok:false,reason:'kit.json: нужны topicId латиницей и parts'};
  const extra=Object.keys(manifest.parts).filter(k=>!PARTS.includes(k));
  if(extra.length)return {ok:false,reason:`kit.json: лишние роли ${extra.join(', ').slice(0,60)}`};
  const missing=PARTS.filter(p=>manifest.parts[p]===undefined);
  if(missing.length)return {ok:false,reason:`неполный, нет: ${missing.map(p=>ROLES[p]).join(', ')}`};
  const parts={},seen=new Set();
  for(const p of PARTS){
    const name=manifest.parts[p];
    // Plain file name in the kit folder only: no separators, drive letters, '..' or symlinks.
    if(typeof name!=='string'||!KIT_FILE.test(name)||path.basename(name)!==name||name.includes('..'))
      return {ok:false,reason:`${ROLES[p]}: недопустимое имя файла`};
    if(seen.has(name.toLowerCase()))return {ok:false,reason:'один файл назначен двум ролям'};
    seen.add(name.toLowerCase());
    const file=path.join(dir,name),stat=lstatSync(file,{throwIfNoEntry:false});
    if(!stat)return {ok:false,reason:`неполный, нет файла: ${ROLES[p]}`};
    if(!stat.isFile()||stat.isSymbolicLink()||path.dirname(realpathSync(file))!==realpathSync(dir))return {ok:false,reason:`${ROLES[p]}: файл вне папки комплекта`};
    if(stat.size<1||stat.size>LOCAL_MAX_BYTES)return {ok:false,reason:`${ROLES[p]}: размер вне допустимого`};
    parts[p]={name,bytes:stat.size,sha256:sha256(file),source:file};
  }
  return {ok:true,topicId:manifest.topicId,parts};
}

// Pages over every kit folder, valid or not, so old or broken folders never hide later kits.
async function listLocal(intake,actor,api,page=0){
  if(!intake.inbox){await api.send(actor,'Папка входящих комплектов на этом координаторе не настроена.');return {blocked:true};}
  if(intake.openJob(String(actor))){await api.send(actor,'Уже открыт комплект. Сначала заверши его или /intake_cancel.');return {blocked:true};}
  let all;
  try{all=readdirSync(intake.inbox,{withFileTypes:true}).filter(e=>e.isDirectory()&&KIT.test(e.name)).map(e=>e.name).sort();}
  catch{await api.send(actor,'Папка входящих комплектов недоступна.');return {blocked:true};}
  const pages=Math.max(1,Math.ceil(all.length/MAX_KITS));
  if(page>=pages){await api.send(actor,'Такой страницы списка нет. Открой /intake_local заново.');return {stale:true};}
  const entries=all.slice(page*MAX_KITS,(page+1)*MAX_KITS);
  const now=intake.now().getTime(),buttons=[],rejected=[];
  for(const kit of entries){
    let result;
    try{result=readKit(intake.inbox,kit);}catch{result={ok:false,reason:'не читается'};}
    if(!result.ok){rejected.push(`✗ ${kit}: ${result.reason}`);continue;}
    const id=randomUUID(),parts=Object.fromEntries(PARTS.map(p=>[p,{name:result.parts[p].name,bytes:result.parts[p].bytes,sha256:result.parts[p].sha256}]));
    intake.db.prepare('INSERT INTO intake_offers VALUES (?,?,?,?,?,?,NULL)').run(id,String(actor),kit,result.topicId,JSON.stringify(parts),now+OFFER_TTL_MS);
    const total=PARTS.reduce((n,p)=>n+parts[p].bytes,0);
    buttons.push([{text:`${kit} · ${result.topicId} · ${mb(total)} МБ`,callback_data:`il:${id}`}]);
  }
  const nav=[...(page>0?[{text:'Назад',callback_data:`ilp:${page-1}`}]:[]),...(page+1<pages?[{text:'Далее',callback_data:`ilp:${page+1}`}]:[])];
  if(nav.length)buttons.push(nav);
  await api.send(actor,(pages>1?`Страница ${page+1} из ${pages} (папок: ${all.length}).\n`:'')+
    (buttons.length-(nav.length?1:0)?`Готовые локальные комплекты: ${buttons.length-(nav.length?1:0)}. Выбери один — файлы будут скопированы в папку задания и проверены запускателем в режиме плана.`:
    `Готовых локальных комплектов ${pages>1?'на этой странице ':''}нет.`)+(rejected.length?`\n\nНе приняты:\n${rejected.join('\n')}`:''),buttons.length?{inline_keyboard:buttons}:undefined);
  return {offered:buttons.length-(nav.length?1:0),rejected:rejected.length,page,pages};
}

async function selectLocal(intake,data,actor,api){
  const offer=intake.db.prepare('SELECT * FROM intake_offers WHERE id=? AND actor_id=?').get(data.slice(3),String(actor));
  if(!offer){await api.send(actor,'Кнопка устарела. Открой /intake_local.');return {stale:true};}
  if(offer.job_id){  // replay or double click: continue the existing job, never copy again
    const job=intake.db.prepare('SELECT * FROM intake_jobs WHERE id=?').get(offer.job_id);
    if(job.state==='plan_ready')return {replayed:true,...await sendSummary(intake,job.id,api,actor)};
    // Saved but the reply was lost before the plan: check the existing copies now.
    if(job.state==='collecting'&&!intake.status(job).missing.length)return {replayed:true,...await runPlan(intake,job,api,actor)};
    await api.send(actor,`Этот выбор уже создал комплект ${job.id} (${job.state==='confirmed'?'подтверждён':job.state==='cancelled'?'отменён':'на проверке'}). Повтор ничего не копирует.`);
    return {replayed:true};
  }
  if(offer.expires_at<=intake.now().getTime()){await api.send(actor,'Список устарел. Открой /intake_local заново.');return {stale:true};}
  if(intake.openJob(String(actor))){await api.send(actor,'Уже открыт комплект. Сначала заверши его или /intake_cancel.');return {blocked:true};}
  const offered=JSON.parse(offer.parts);
  const taken=intake.db.prepare(`SELECT o.job_id FROM intake_offers o JOIN intake_jobs j ON j.id=o.job_id
    WHERE o.kit=? AND o.parts=? AND j.state!='cancelled'`).get(offer.kit,offer.parts);
  if(taken){await api.send(actor,`Этот комплект уже взят в задание ${taken.job_id}. Повторно не копирую.`);return {duplicate:true};}
  const current=readKit(intake.inbox,offer.kit);
  const changed=current.ok?PARTS.find(p=>['name','bytes','sha256'].some(k=>current.parts[p][k]!==offered[p][k])):null;
  if(!current.ok||changed||current.topicId!==offer.topic_id){
    await api.send(actor,`Комплект ${offer.kit} изменился после показа списка${changed?`: ${ROLES[changed]}`:current.ok?'':` (${current.reason})`}. `+
      'Открой /intake_local заново. Ничего не скопировано.');
    return {stale:true,changed:changed??true};
  }
  const day=intake.now().toISOString().slice(0,10).replaceAll('-','');
  const id=`tg-${day}-${randomBytes(4).toString('hex')}`,files=path.join(intake.jobDir(id),'files');
  mkdirSync(files,{recursive:true});
  const copies={};
  for(const p of PARTS){
    const target=path.join(files,`${randomUUID()}.mp4`);
    copyFileSync(current.parts[p].source,target,constants.COPYFILE_EXCL);
    if(sha256(target)!==offered[p].sha256){
      rmSync(intake.jobDir(id),{recursive:true,force:true});  // only the folder created just now for this job
      await api.send(actor,`${ROLES[p]}: копия не совпала по SHA-256 с исходником (файл менялся во время копирования). Открой /intake_local заново.`);
      return {stale:true,changed:p};
    }
    copies[p]=target;
  }
  const db=intake.db;
  db.exec('BEGIN IMMEDIATE');
  try{
    if(Number(db.prepare('UPDATE intake_offers SET job_id=? WHERE id=? AND job_id IS NULL').run(id,offer.id).changes)!==1)throw Error('Offer already used');
    db.prepare(`INSERT INTO intake_jobs (id,actor_id,topic_id,state,created_at) VALUES (?,?,?,'collecting',?)`).run(id,String(actor),offer.topic_id,intake.now().toISOString());
    for(const p of PARTS)db.prepare('INSERT INTO intake_files VALUES (?,?,?,?,?,?,?)')
      .run(randomUUID(),id,`local-${p}`,p,`${offer.kit}/${offered[p].name}`,offered[p].bytes,copies[p]);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  const job=intake.openJob(String(actor));
  await api.send(actor,`Комплект ${id} · тема ${offer.topic_id} из локальной папки ${offer.kit}\n${intake.status(job).text}\nКопии совпали по SHA-256, проверяю запускателем.`);
  return {local:true,...await runPlan(intake,job,api,actor)};
}

async function command(intake,text,actor,api){
  const [cmd,arg,...rest]=text.trim().split(/\s+/);
  if(cmd==='/montage')return montageStatus(intake,actor,api);
  if(cmd==='/intake_local'){
    if(arg){await api.send(actor,'Пути и аргументы не принимаются: комплекты берутся только из настроенной папки входящих. Отправь /intake_local без текста.');return {rejected:'argument'};}
    return listLocal(intake,actor,api);
  }
  const job=intake.openJob(String(actor));
  if(cmd==='/intake_cancel'){
    if(!job){await api.send(actor,'Открытого комплекта нет.');return {ignored:true};}
    intake.db.prepare(`UPDATE intake_jobs SET state='cancelled' WHERE id=? AND ${OPEN}`).run(job.id);
    await api.send(actor,`Комплект ${job.id} отменён. Полученные файлы остались в его папке, ничего не запускалось.`);
    return {cancelled:true};
  }
  if(job){
    const {missing,text:status}=intake.status(job);
    await api.send(actor,`${arg?'Уже открыт комплект':'Комплект'} ${job.id} · тема ${job.topic_id}\n${status}\n\n`+
      (missing.length?`Не хватает: ${missing.map(p=>ROLES[p]).join(', ')}.`:job.state==='plan_ready'?'Комплект проверен, ждёт подтверждения.':'Все роли назначены, проверяю запускателем.')+
      (arg?'\nНовый комплект — после /intake_cancel.':''));
    if(job.state==='plan_ready')return {status:true,restored:true,...await sendSummary(intake,job.id,api,actor)};
    if(!missing.length)return {status:true,...await runPlan(intake,job,api,actor)};  // e.g. reply lost before the plan
    return {status:true};
  }
  if(!arg||rest.length||!TOPIC.test(arg)){
    await api.send(actor,'Укажи тему латиницей: /intake roman-seo-01');return {ignored:true};
  }
  const day=intake.now().toISOString().slice(0,10).replaceAll('-','');
  const id=`tg-${day}-${randomBytes(4).toString('hex')}`;
  mkdirSync(intake.root,{recursive:true});
  mkdirSync(intake.jobDir(id));
  intake.db.prepare(`INSERT INTO intake_jobs (id,actor_id,topic_id,state,created_at) VALUES (?,?,?,'collecting',?)`)
    .run(id,String(actor),arg,intake.now().toISOString());
  await api.send(actor,`Комплект ${id} · тема ${arg}\nПришли четыре MP4 как файлы (документом, не «видео»), ${limitText}. `+
    'После каждого файла выбери роль: Основа, Хук 1, Хук 2 или Хук 3. Файлы крупнее — через папку ноутбука: /intake_cancel, затем /intake_local.');
  return {created:id};
}

// Returns null when the update is not an intake update.
export async function handleFourPartIntake(update,actor,{api,intake}){
  const message=update.message,data=update.callback_query?.data??message?.text;
  const isFile=!!(message?.document||message?.video||message?.animation);
  const isIntake=isFile||(typeof data==='string'&&(/^\/(intake(_cancel|_local)?|montage)(\s|$)/.test(data)||/^i[xd]:tg-\d{8}-[a-f0-9]{8}$/.test(data)||/^il:[a-f0-9-]{36}$/.test(data)||/^ilp:(0|[1-9]\d{0,3})$/.test(data)||/^ir:[a-f0-9-]{36}:(body|h1|h2|h3)$/.test(data)||/^ic:tg-\d{8}-[a-f0-9]{8}:[1-9]\d{0,5}$/.test(data)));
  if(!isIntake)return null;
  if(!intake){await api.send(actor,'Приём файлов на этом координаторе не подключён.');return {blocked:true};}
  try{
    if(isFile)return await receiveFile(intake,update,actor,api);
    if(data.startsWith('ir:'))return await assignRole(intake,data,actor,api);
    if(data.startsWith('ic:'))return await confirm(intake,data,actor,api);
    if(data.startsWith('il:'))return await selectLocal(intake,data,actor,api);
    if(data.startsWith('ilp:'))return await listLocal(intake,actor,api,Number(data.slice(4)));
    if(data.startsWith('ix:'))return await startMontage(intake,data,actor,api);
    if(data.startsWith('id:'))return await redeliver(intake,data,actor,api);
    return await command(intake,data,actor,api);
  }catch(error){
    // Replies keep the panel's delivery semantics; a transient download error retries the poll from its cursor.
    // Anything else caused by one file or button must not stop the coordinator.
    if(error instanceof TelegramApiError&&(error.method==='sendMessage'||error.retryable))throw error;
    await api.send(actor,'Не получилось обработать этот файл или кнопку. Ничего не запущено; проверь /intake и пришли файл заново.');
    return {failed:true};
  }
}

// Owner-facing wording: the role instead of a private file path; launcher's own text otherwise.
function launcherError(message,parts){
  if(!message)return 'запускатель завершился с ошибкой';
  const part=PARTS.find(p=>message.includes(path.basename(parts[p])));
  if(/ffprobe|ffmpeg|Need exactly one video stream|Invalid media/.test(message))
    return `${part?ROLES[part]:'Один из файлов'}: не читается или не декодируется как видео с аудио`;
  return PARTS.reduce((text,p)=>text.replaceAll(parts[p],ROLES[p]),message);
}

const LAUNCHER=path.join(path.dirname(fileURLToPath(import.meta.url)),'run-local-four-part.py');
// Plan mode only: no --execute and no model/browser arguments, so the launcher cannot start ASR or rendering.
export function launcherPlanner({python='python',launcher=LAUNCHER,timeoutMs=600000}={}){
  return ({parts,topicId,out})=>new Promise(resolve=>{
    const args=[launcher,...PARTS.flatMap(p=>[`--${p}`,parts[p]]),'--topic-id',topicId,'--out',out];
    if(args.includes('--execute'))throw Error('Plan mode only');
    execFile(python,args,{cwd:path.dirname(launcher),timeout:timeoutMs,maxBuffer:4194304,windowsHide:true,encoding:'utf8',
      env:{...process.env,PYTHONIOENCODING:'utf-8'}},(error,stdout,stderr)=>{
      if(error){resolve({ok:false,error:launcherError(/Not started: (.*)/.exec(stderr)?.[1],parts)});return;}
      try{
        const report=JSON.parse(stdout);
        if(report.execute!==false||report.steps?.some(s=>s.status!=='planned'))throw Error();
        resolve({ok:true,report});
      }catch{resolve({ok:false,error:'неожиданный ответ запускателя'});}
    });
  });
}
