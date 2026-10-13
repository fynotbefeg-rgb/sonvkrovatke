// Local editorial candidates only. No Google flags, approval receipts or writes.
import {open,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const maxBytes=65536;
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&Object.keys(o).every(k=>keys.includes(k));
const literal=(s,max)=>typeof s==='string'&&s.trim()&&s.length<=max&&!/[\u0000-\u001f]/.test(s);
export function validateCandidateCatalog(data){
  if(!exact(data,['catalogVersion','reviewApprovalGranted','generationAllowed','renderAllowed','topics'])||
    data.catalogVersion!=='1.0.0'||data.reviewApprovalGranted!==false||data.generationAllowed!==false||data.renderAllowed!==false||
    !Array.isArray(data.topics)||data.topics.length>90||Buffer.byteLength(JSON.stringify(data))>maxBytes)throw Error('Invalid candidate catalog');
  const ids=new Set();
  for(const topic of data.topics){
    if(!exact(topic,['candidateId','title','businessTask','referenceUrl','evidenceNote','reviewStatus'])||
      !literal(topic.candidateId,100)||!/^[a-z0-9][a-z0-9_-]*$/.test(topic.candidateId)||ids.has(topic.candidateId)||
      !literal(topic.title,200)||!literal(topic.businessTask,400)||!literal(topic.evidenceNote,400)||
      !literal(topic.referenceUrl,512)||topic.reviewStatus!=='awaiting_roman_review')throw Error('Invalid candidate topic');
    const url=new URL(topic.referenceUrl);
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||
      !['instagram.com','www.instagram.com','tiktok.com','www.tiktok.com','youtube.com','www.youtube.com','youtu.be'].includes(url.hostname))throw Error('Invalid candidate reference');
    ids.add(topic.candidateId);
  }
  return data;
}
export async function readCandidateBytes(file){
  if(typeof file!=='string'||!file)throw Error('Candidate path required');
  const handle=await open(file,'r');
  try{
    const bytes=Buffer.alloc(maxBytes+1);let size=0;
    while(size<bytes.length){const read=await handle.read(bytes,size,bytes.length-size,null);if(!read.bytesRead)break;size+=read.bytesRead;}
    if(!size||size>maxBytes)throw Error('Candidate file exceeds byte cap');
    return bytes.subarray(0,size);
  }finally{await handle.close();}
}
export async function readCandidateCatalog(file){
  try{return validateCandidateCatalog(JSON.parse((await readCandidateBytes(file)).toString('utf8')));}
  catch{throw Error('Candidate catalog unavailable or invalid');}
}
export async function installCandidateCatalog(source,localAppData){
  if(typeof localAppData!=='string'||!path.isAbsolute(localAppData))throw Error('Windows local profile required');
  const bytes=await readCandidateBytes(source),catalog=validateCandidateCatalog(JSON.parse(bytes.toString('utf8')));
  const home=path.join(localAppData,'RomanReels','telegram-panel'),destination=path.join(home,'candidate-topics.json');
  await mkdir(home,{recursive:true,mode:0o700});
  try{await writeFile(destination,bytes,{flag:'wx',mode:0o600});}
  catch(error){if(error.code!=='EEXIST')throw error;if(!(await readCandidateBytes(destination)).equals(bytes))throw Error('Different candidate catalog exists');
    return {status:'already_installed',generationAllowed:false,renderAllowed:false};}
  if(!(await readCandidateBytes(destination)).equals(bytes))throw Error('Candidate copy differs');
  return {status:'installed',topics:catalog.topics.length,generationAllowed:false,renderAllowed:false};
}
