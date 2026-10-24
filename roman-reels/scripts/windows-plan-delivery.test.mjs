import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {buildDelivery,parseDelivery,receiveDelivery,emptyDelivery,MAILBOX_NAME,MAILBOX_FOLDER} from './windows-plan-delivery.mjs';
import {deliveryPlan} from './testing/delivery-fixture.mjs';
import {driveClient} from './source-uploader.mjs';
const now=Date.now(), hash=(bytes,type='sha256')=>createHash(type).update(bytes).digest('hex');
const config={fileId:'mailbox-file-0001',folderId:'mailbox-folder-0001'};
class FakeDrive {
  constructor(bytes){this.bytes=bytes;this.calls=[];this.meta={id:config.fileId,name:MAILBOX_NAME,mimeType:'application/json',parents:[config.folderId],size:String(bytes.length),md5Checksum:hash(bytes,'md5'),sha256Checksum:hash(bytes),trashed:false};}
  async get(id){this.calls.push(['get',id]);return id===config.folderId?{id,name:MAILBOX_FOLDER,mimeType:'application/vnd.google-apps.folder',trashed:false}:structuredClone(this.meta);}
  async readJsonBytes(id){this.calls.push(['read',id]);if(this.change)this.meta.md5Checksum='0'.repeat(32);return this.bytes;}
}
async function setup(t,bytes=buildDelivery(deliveryPlan(),{now})){
  const root=await mkdtemp(path.join(tmpdir(),'delivery-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'jobs'));await writeFile(path.join(root,'jobs','untouched.json'),'untouched');
  return {root,inbox:path.join(root,'received-plans'),drive:new FakeDrive(bytes),config,now};
}

test('empty mailbox waits, no staging/Drive writes or active uploader job changes',async t=>{
  const s=await setup(t,Buffer.from(JSON.stringify(emptyDelivery())));const r=await receiveDelivery(s);
  assert.equal(r.status,'waiting');assert.equal(r.generationAllowed,false);assert.equal(r.uploadStarted,false);
  await assert.rejects(readFile(s.inbox));assert.equal(await readFile(path.join(s.root,'jobs','untouched.json'),'utf8'),'untouched');
});

test('valid plan stages exactly four compatible jobs, neutral packet and immutable payload',async t=>{
  const s=await setup(t);const r=await receiveDelivery(s);assert.equal(r.status,'received');assert.equal(r.jobs,4);
  const dir=path.join(s.inbox,r.deliveryId);assert.equal((await readdir(path.join(dir,'jobs'))).length,4);
  const packet=JSON.parse(await readFile(path.join(dir,'packet.json')));assert.equal(packet.productionReady,false);
  const record=JSON.parse(await readFile(path.join(dir,'delivery.json')));assert.equal(record.currentApprovalRecheckRequired,true);
  assert.equal(record.generationAllowed,false);assert.equal(record.renderAllowed,false);
  assert.equal(await readFile(path.join(s.root,'jobs','untouched.json'),'utf8'),'untouched');
  assert.equal(r.uploadStarted,false);
});

test('fresh process replay verifies saved data without duplicate staging or overwrite',async t=>{
  const s=await setup(t);const first=await receiveDelivery(s);const dir=path.join(s.inbox,first.deliveryId);
  const before=await readFile(path.join(dir,'delivery.json'),'utf8');
  const second=await receiveDelivery({...s,drive:new FakeDrive(s.drive.bytes)});
  assert.equal(second.status,'already_received');assert.equal(second.deliveryId,first.deliveryId);
  assert.equal(await readFile(path.join(dir,'delivery.json'),'utf8'),before);assert.equal((await readdir(s.inbox)).length,1);
});

test('tampered staged job blocks repeat and is never overwritten',async t=>{
  const s=await setup(t);const r=await receiveDelivery(s);const file=path.join(s.inbox,r.deliveryId,'jobs','body.json');
  await writeFile(file,JSON.stringify({command:'never execute'}));await assert.rejects(receiveDelivery(s),/Staged job changed/);
  assert.deepEqual(JSON.parse(await readFile(file)),{command:'never execute'});
});

test('wrong pinned ID/name/MIME/parent/checksum refuses data before staging',async t=>{
  for(const change of [m=>m.name='other',m=>m.mimeType='text/plain',m=>m.parents=['elsewhere'],m=>m.md5Checksum='0'.repeat(32),m=>m.id='other']){
    const s=await setup(t);change(s.drive.meta);await assert.rejects(receiveDelivery(s));await assert.rejects(readdir(s.inbox));
  }
});

test('changed Drive content or missing auth never stages and never retries writes',async t=>{
  const s=await setup(t);s.drive.change=true;await assert.rejects(receiveDelivery(s),/changed during read/);await assert.rejects(readdir(s.inbox));
  const a=await setup(t);a.drive.get=async()=>{throw Error('auth denied')};await assert.rejects(receiveDelivery(a));await assert.rejects(readdir(a.inbox));
});

test('expired/future/corrupted payload, execution flags and unexpected commands fail closed',()=>{
  const bytes=buildDelivery(deliveryPlan(),{now});assert.throws(()=>parseDelivery(bytes,{now:now+300000}));assert.throws(()=>parseDelivery(bytes,{now:now-1}));
  for(const change of [d=>d.generationAllowed=true,d=>d.payload.jobs[0].command='no',d=>d.payload.jobs[0].textHash='0'.repeat(64),d=>d.payload.jobs[0].localPath='../escape.mp4']){
    const d=JSON.parse(bytes);change(d);d.deliveryId=hash(JSON.stringify(d.payload));assert.throws(()=>parseDelivery(Buffer.from(JSON.stringify(d)),{now}));
  }
  assert.throws(()=>parseDelivery(Buffer.alloc(65537),{now}));
});

test('Windows paths validated on cloud without opening them or accepting duplicate case aliases',()=>{
  const p=deliveryPlan();for(const j of p.jobs)j.localPath=`C:\\RomanReels\\downloads\\${j.role}.mp4`;
  assert.equal(parseDelivery(buildDelivery(p,{now}),{now}).status,'staging_only');
  p.jobs[1].localPath=p.jobs[0].localPath.toLowerCase();assert.throws(()=>buildDelivery(p,{now}),/Distinct/);
});

test('partial crash data blocks safely, no overwrite or activation',async t=>{
  const s=await setup(t);const id=parseDelivery(s.drive.bytes,{now}).deliveryId;const partial=path.join(s.inbox,`${id}.partial`);
  await mkdir(partial,{recursive:true});await writeFile(path.join(partial,'marker'),'keep');
  await assert.rejects(receiveDelivery(s));assert.equal(await readFile(path.join(partial,'marker'),'utf8'),'keep');
  await assert.rejects(readdir(path.join(s.inbox,id)));
});

test('Drive bounded JSON transport uses only pinned GET and stops oversized response',async()=>{
  const calls=[];const d=driveClient({getToken:async()=> 'test-token',fetchImpl:async(u,o)=>{calls.push([u,o]);return new Response('x'.repeat(10));}});
  assert.equal((await d.readJsonBytes(config.fileId,10)).length,10);assert.ok(calls[0][0].includes('files/mailbox-file-0001?alt=media'));
  assert.equal(calls[0][1].method,undefined);assert.equal(calls[0][1].redirect,'error');assert.equal(calls[0][1].body,undefined);
  await assert.rejects(d.readJsonBytes(config.fileId,9),{code:'delivery_too_large'});
});
