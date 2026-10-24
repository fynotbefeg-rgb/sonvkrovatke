// Four-MP4 intake over the authenticated panel: Основа / Хук 1 / Хук 2 / Хук 3 assigned by explicit buttons.
// Files go to one new private folder per kit outside Git; the existing run-local-four-part.py checks the kit
// in plan mode only. Confirmation freezes the checked kit once. No ASR, render, Drive, Google or HeyGen here.
import path from 'node:path';
import {execFile} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,renameSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {TELEGRAM_CLOUD_DOWNLOAD_LIMIT,TelegramApiError} from './telegram-bot-api.mjs';

export const ROLES={body:'Основа',h1:'Хук 1',h2:'Хук 2',h3:'Хук 3'};
const PARTS=Object.keys(ROLES);
const TOPIC=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_FILES=8;
const OPEN=`state IN ('collecting','plan_ready')`;
const mb=n=>(n/1048576).toFixed(1).replace('.',',');
const limitText=`до ${TELEGRAM_CLOUD_DOWNLOAD_LIMIT/1048576} МБ каждый (предел облачного Bot API для ботов)`;
const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const sha256=file=>{try{return createHash('sha256').update(readFileSync(file)).digest('hex');}catch{return null;}};  // missing file counts as changed

export class FourPartIntake {
  // db: the existing ProductionQueue SQLite handle; one database and one polling lock for the bot.
  constructor(db,{root,plan,now=()=>new Date()}={}) {
    if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Absolute private intake folder required');
    const inRepo=path.relative(REPO,path.resolve(root));
    if(!inRepo||!inRepo.startsWith('..')&&!path.isAbsolute(inRepo))throw Error('Intake folder must stay outside the Git work tree');
    if(typeof plan!=='function')throw Error('Launcher plan runner required');
    Object.assign(this,{db,root,plan,now});
    db.exec(`CREATE TABLE IF NOT EXISTS intake_jobs (
        id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, topic_id TEXT NOT NULL, state TEXT NOT NULL,
        plan_version INTEGER NOT NULL DEFAULT 0, plan TEXT, created_at TEXT NOT NULL, confirmed_at TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS intake_one_open ON intake_jobs(actor_id) WHERE ${OPEN};
      CREATE TABLE IF NOT EXISTS intake_files (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, file_unique_id TEXT NOT NULL, role TEXT,
        name TEXT NOT NULL, bytes INTEGER NOT NULL, local_path TEXT NOT NULL, UNIQUE(job_id,file_unique_id));
      CREATE UNIQUE INDEX IF NOT EXISTS intake_one_role ON intake_files(job_id,role) WHERE role IS NOT NULL;`);
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
      'Замени файл и назначь роль заново (или нажми роль ещё раз, чтобы повторить проверку). Ничего не запущено.');
    return {planned:false};
  }
  const version=job.plan_version+1;
  const changed=intake.db.prepare(`UPDATE intake_jobs SET state='plan_ready',plan_version=?,plan=? WHERE id=? AND state='collecting' AND plan_version=?`)
    .run(version,JSON.stringify(result.report),job.id,job.plan_version).changes;
  if(Number(changed)!==1)return {planned:false};
  const record=path.join(intake.jobDir(job.id),`plan-v${version}.json`);
  if(!existsSync(record))writeFileSync(record,JSON.stringify(result.report,null,2)+'\n',{flag:'wx'});
  await api.send(actor,summary(job,result.report),{inline_keyboard:[[{text:'Подтвердить запуск',callback_data:`ic:${job.id}:${version}`}]]});
  return {planned:true,planVersion:version};
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
  return {assigned:true,missing:missing.length};
}

async function confirm(intake,data,actor,api){
  const [,jobId,version]=data.split(':');
  const job=intake.db.prepare('SELECT * FROM intake_jobs WHERE id=? AND actor_id=?').get(jobId,String(actor));
  if(!job){await api.send(actor,'Комплект не найден.');return {stale:true};}
  if(job.state==='confirmed'){
    ensureConfirmation(intake,job);
    await api.send(actor,`Комплект ${job.id} уже подтверждён (${job.confirmed_at}). Повторное нажатие ничего не запускает.`);
    return {alreadyConfirmed:true};
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
    'Исполнение — ASR, монтаж трёх рилсов и их отправка — этим участком ещё не подключено и не запущено.');
  return {confirmed:true,executeStarted:false};
}

// Frozen launch request for the later executor; written once, never overwritten.
function ensureConfirmation(intake,job){
  const file=path.join(intake.jobDir(job.id),'confirmed.json');
  if(existsSync(file))return;
  const report=JSON.parse(job.plan);
  writeFileSync(file,JSON.stringify({schemaVersion:'1.0.0',jobId:job.id,topicId:job.topic_id,confirmedAt:job.confirmed_at,
    confirmedBy:job.actor_id,planVersion:job.plan_version,launcher:'run-local-four-part.py',out:report.output,
    parts:Object.fromEntries(PARTS.map(p=>[p,{path:report.inputs[p].path,sha256:report.inputs[p].sha256,bytes:report.inputs[p].bytes}])),
    executeStarted:false,productionReady:false,approvalStatus:'pending_approval'},null,2)+'\n',{flag:'wx'});
}

async function command(intake,text,actor,api){
  const [cmd,arg,...rest]=text.trim().split(/\s+/);
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
      (missing.length?`Не хватает: ${missing.map(p=>ROLES[p]).join(', ')}.`:job.state==='plan_ready'?'Комплект проверен, ждёт подтверждения.':'Все роли назначены.')+
      (arg?'\nНовый комплект — после /intake_cancel.':''));
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
    'После каждого файла выбери роль: Основа, Хук 1, Хук 2 или Хук 3.');
  return {created:id};
}

// Returns null when the update is not an intake update.
export async function handleFourPartIntake(update,actor,{api,intake}){
  const message=update.message,data=update.callback_query?.data??message?.text;
  const isFile=!!(message?.document||message?.video||message?.animation);
  const isIntake=isFile||(typeof data==='string'&&(/^\/intake(_cancel)?(\s|$)/.test(data)||/^ir:[a-f0-9-]{36}:(body|h1|h2|h3)$/.test(data)||/^ic:tg-\d{8}-[a-f0-9]{8}:[1-9]\d{0,5}$/.test(data)));
  if(!isIntake)return null;
  if(!intake){await api.send(actor,'Приём файлов на этом координаторе не подключён.');return {blocked:true};}
  try{
    if(isFile)return await receiveFile(intake,update,actor,api);
    if(data.startsWith('ir:'))return await assignRole(intake,data,actor,api);
    if(data.startsWith('ic:'))return await confirm(intake,data,actor,api);
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
