// Private Drive delivery is data transport only, never approval authority or execution.
import {createHash} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {validateFourPartPacket} from './build-four-part-receipt.mjs';
import {validateJob, withLock} from './source-uploader.mjs';

export const MAX_DELIVERY_BYTES = 65536;
export const MAILBOX_NAME = 'source-plan-v1.json';
export const MAILBOX_FOLDER = '_windows-jobs';
export const emptyDelivery = () => ({deliveryVersion:'1.0.0',status:'empty',generationAllowed:false,renderAllowed:false});
const require = (ok, message) => {if(!ok)throw new Error(message);};
const exact = (o,keys) => o && typeof o==='object' && !Array.isArray(o) && Object.keys(o).length===keys.length && Object.keys(o).every(k=>keys.includes(k));
const hash = b => createHash('sha256').update(b).digest('hex');
const digest = x => hash(JSON.stringify(x));
const textHash = s => hash(s);
const roles = ['body','hook-1','hook-2','hook-3'];
const planKeys = ['planVersion','topicId','scriptVersion','generationAllowed','uploadPerformed','renderAllowed',
  'currentApprovalRecheckRequired','jobs','packet','status','planKey'];

export function validateDeliveryPlan(plan) {
  require(exact(plan,planKeys) && plan.planVersion==='1.0.0' && plan.status==='planned' &&
    plan.generationAllowed===false && plan.uploadPerformed===false && plan.renderAllowed===false &&
    plan.currentApprovalRecheckRequired===true && /^[a-f0-9]{64}$/.test(plan.planKey), 'Staging-only complete source plan required');
  require(exact(plan.packet,['draftVersion','mode','productionReady','sourceSet','items']), 'Unexpected packet fields');
  require(exact(plan.packet.sourceSet,['topic_id','recordingParts','status','body_text','body_text_hash','hooks']), 'Unexpected source-set fields');
  for (const h of plan.packet.sourceSet.hooks) require(exact(h,['hook_id','hook_text']), 'Unexpected hook fields');
  for (const i of plan.packet.items) require(exact(i,['topic_id','hook_id','version_id','script_revision','hook_text','script_text','script_hash','status']), 'Unexpected variant fields');
  const {source,version}=validateFourPartPacket(plan.packet);
  require(plan.topicId===source.topic_id && plan.scriptVersion===version && Array.isArray(plan.jobs) && plan.jobs.length===4, 'Plan topic/revision mismatch');
  require(new Set(plan.jobs.map(j=>j.role)).size===4 && new Set(plan.jobs.map(j=>j.jobId)).size===4, 'Duplicate delivery role/job');
  for(const job of plan.jobs) {
    require(exact(job,['schemaVersion','jobId','topicId','scriptVersion','role','localPath','heygenTitle','textHash']), 'Unexpected job fields');
    // This validation runs on the consuming Windows host; never execute its paths here.
    validateJob(job, {pathStyle:/^[A-Za-z]:[\\/]/.test(job.localPath)?'windows':'native'});
    require(!/[\u0000-\u001f]/.test(job.localPath) && !job.localPath.split(/[\\/]/).includes('..'), 'Unsafe delivery file path');
    const text=job.role==='body'?source.body_text:source.hooks.find(h=>job.role===`hook-${h.hook_id}`)?.hook_text;
    require(roles.includes(job.role) && job.topicId===plan.topicId && job.scriptVersion===version &&
      text && job.textHash===textHash(text) && job.jobId===`rr-${plan.planKey.slice(0,40)}-${job.role}`, 'Job/text binding mismatch');
  }
  const canonicalPath = file => /^[A-Za-z]:[\\/]/.test(file)?path.win32.resolve(file).toLowerCase():path.resolve(file);
  require(new Set(plan.jobs.map(j=>canonicalPath(j.localPath))).size===4, 'Distinct delivery files required');
  return plan;
}

export function buildDelivery(plan,{now=Date.now(),ttlMs=300000}={}) {
  validateDeliveryPlan(plan);
  require(Number.isSafeInteger(now) && Number.isSafeInteger(ttlMs) && ttlMs>0 && ttlMs<=900000, 'Invalid delivery clock/lifetime');
  const bytes=Buffer.from(JSON.stringify({deliveryVersion:'1.0.0',status:'staging_only',issuedAt:now,expiresAt:now+ttlMs,
    deliveryId:digest(plan),generationAllowed:false,renderAllowed:false,payload:plan}));
  require(bytes.length<=MAX_DELIVERY_BYTES,'Delivery exceeds byte cap');
  return bytes;
}

export function parseDelivery(bytes,{now=Date.now()}={}) {
  require(bytes.length>0 && bytes.length<=MAX_DELIVERY_BYTES,'Invalid delivery size');
  const data=JSON.parse(Buffer.from(bytes).toString('utf8'));
  if(exact(data,['deliveryVersion','status','generationAllowed','renderAllowed']) &&
     data.deliveryVersion==='1.0.0' && data.status==='empty' && data.generationAllowed===false && data.renderAllowed===false) return data;
  require(exact(data,['deliveryVersion','status','issuedAt','expiresAt','deliveryId','generationAllowed','renderAllowed','payload']) &&
    data.deliveryVersion==='1.0.0' && data.status==='staging_only' && data.generationAllowed===false && data.renderAllowed===false &&
    Number.isSafeInteger(now) && Number.isSafeInteger(data.issuedAt) && Number.isSafeInteger(data.expiresAt) &&
    data.issuedAt<=now && now<data.expiresAt && data.expiresAt>data.issuedAt && data.expiresAt-data.issuedAt<=900000 &&
    data.deliveryId===digest(data.payload),'Invalid, expired or changed delivery');
  validateDeliveryPlan(data.payload);
  return data;
}

const stable = f => JSON.stringify([f?.id,f?.name,f?.mimeType,f?.parents,f?.size,f?.md5Checksum,f?.sha256Checksum,f?.trashed]);
function metadataOk(file,config) {
  return file && file.id===config.fileId && file.name===MAILBOX_NAME && !file.trashed && file.mimeType==='application/json' &&
    file.parents?.includes(config.folderId) && Number(file.size)>0 && Number(file.size)<=MAX_DELIVERY_BYTES && /^[a-f0-9]{32}$/.test(file.md5Checksum);
}

// Re-reads every staged file from disk and checks it against the verified delivery.
export async function verifyStaged(destination,data) {
  const old=JSON.parse(await fs.readFile(path.join(destination,'payload.json'),'utf8'));
  require(digest(old)===data.deliveryId,'Existing staged data changed');
  const packet=JSON.parse(await fs.readFile(path.join(destination,'packet.json'),'utf8'));
  require(digest(packet)===digest(data.payload.packet),'Staged packet changed');
  const entries=await fs.readdir(path.join(destination,'jobs'));
  require(entries.length===4 && entries.every(name=>roles.some(role=>name===`${role}.json`)), 'Staged jobs changed');
  for(const job of data.payload.jobs) {
    const saved=JSON.parse(await fs.readFile(path.join(destination,'jobs',`${job.role}.json`),'utf8'));
    require(digest(saved)===digest(job),'Staged job changed');
  }
  const receipt=JSON.parse(await fs.readFile(path.join(destination,'delivery.json'),'utf8'));
  require(receipt.deliveryId===data.deliveryId && receipt.generationAllowed===false && receipt.renderAllowed===false &&
    receipt.currentApprovalRecheckRequired===true,'Staged safety flags changed');
}

// afterVerified({data,contentSha256,destination}) runs under the receive lock only once the whole
// staged package has been saved and re-read successfully (used by the acknowledgement step).
export async function receiveDelivery({drive,config,inbox,now=Date.now,afterVerified=null}) {
  const clock=typeof now==='function'?now:()=>now;
  require(exact(config,['fileId','folderId']) && [config.fileId,config.folderId].every(s=>typeof s==='string' && /^[A-Za-z0-9_-]{10,100}$/.test(s)), 'Pinned mailbox file/folder config required');
  const folder=await drive.get(config.folderId);
  require(folder && !folder.trashed && folder.name===MAILBOX_FOLDER && folder.mimeType==='application/vnd.google-apps.folder', 'Mailbox folder mismatch');
  const before=await drive.get(config.fileId);require(metadataOk(before,config),'Mailbox file identity/metadata mismatch');
  const bytes=await drive.readJsonBytes(config.fileId,MAX_DELIVERY_BYTES);
  require(bytes.length===Number(before.size) && createHash('md5').update(bytes).digest('hex')===before.md5Checksum &&
    (!before.sha256Checksum||hash(bytes)===before.sha256Checksum),'Mailbox downloaded bytes mismatch');
  const after=await drive.get(config.fileId);require(stable(before)===stable(after),'Mailbox changed during read');
  const data=parseDelivery(bytes,{now:clock()});
  const result={generationAllowed:false,uploadStarted:false,renderAllowed:false};
  if(data.status==='empty')return {...result,status:'waiting'};
  const root=path.resolve(inbox);await fs.mkdir(root,{recursive:true,mode:0o700});
  return withLock(path.join(root,'receive.lock'),async()=>{
    const destination=path.join(root,data.deliveryId), pending=path.join(root,`${data.deliveryId}.partial`);
    let exists=false;
    try {const stat=await fs.lstat(destination);require(stat.isDirectory()&&!stat.isSymbolicLink(),'Unsafe staged directory');exists=true;}
    catch(error){if(error.code!=='ENOENT')throw error;}
    const contentSha256=hash(bytes);
    const finish=async status=>{
      const extra=afterVerified?await afterVerified({data,contentSha256,destination}):{};
      return {...result,status,deliveryId:data.deliveryId,...(status==='received'?{jobs:4}:{}),...extra};
    };
    if(exists) {
      await verifyStaged(destination,data);
      return finish('already_received');
    }
    // A previous crash remains visible; never overwrite or silently clear partial data.
    await fs.mkdir(pending,{recursive:false,mode:0o700});
    const write=(name,value)=>fs.writeFile(path.join(pending,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
    await write('payload.json',data.payload);await write('packet.json',data.payload.packet);
    await fs.mkdir(path.join(pending,'jobs'),{mode:0o700});
    for(const job of data.payload.jobs)await write(`jobs/${job.role}.json`,job);
    await write('delivery.json',{deliveryId:data.deliveryId,receivedAt:clock(),expiresAt:data.expiresAt,
      generationAllowed:false,renderAllowed:false,currentApprovalRecheckRequired:true});
    require(clock()<data.expiresAt,'Delivery expired before staging completed');
    await fs.rename(pending,destination);
    await verifyStaged(destination,data);
    return finish('received');
  });
}
