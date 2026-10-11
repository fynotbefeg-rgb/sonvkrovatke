// Fail-closed eligibility to show a draft to Roman; NEVER grants production approval.
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateManifest,scriptHash} from './approval-manifest.mjs';
import {editorialRulesVersion,editorialRulesSha256} from './editorial-rules.mjs';
const projectRoot=fileURLToPath(new URL('../../',import.meta.url));
const criteria=['task','reference','setup','demo','claims','costs_limits','body_hooks','approval'];
const nonempty=x=>typeof x==='string'&&Boolean(x.trim());
const hash=x=>createHash('sha256').update(x).digest('hex');
function proof(e,root) {
 if(!e||!nonempty(e.path)||!/^[a-f0-9]{64}$/.test(e.sha256)||!e.path.startsWith('roman-reels/research/'))throw Error('Research artifact path/hash required');
 const base=realpathSync(root),path=realpathSync(resolve(base,e.path)),local=relative(base,path);
 if(local.startsWith('..'+sep)||local==='..'||!local.startsWith('roman-reels'+sep+'research'+sep)||statSync(path).size>2*1024*1024)throw Error('Artifact outside bounded research scope');
 const bytes=readFileSync(path);
 if(hash(bytes)!==e.sha256)throw Error('Research artifact changed since editorial review');
 return bytes;
}
export function assessEditorialRelease(manifest,review,{root=projectRoot,now=Date.now()}={}) {
 const blockers=[];const block=(id,message)=>blockers.push({id,message});
 let items=[];
 try {
  items=validateManifest(manifest);
  if(items.length!==3||items.some(i=>i.status!=='pending_approval')||new Set(items.map(i=>i.topic_id)).size!==1||
    new Set(items.map(i=>i.script_revision)).size!==1||new Set(items.map(i=>i.hook_id)).size!==3)throw Error('One pending topic with three exact hooks required');
  const source=manifest.source_sets?.find(s=>s.topic_id===items[0].topic_id);
  if(!source||!nonempty(source.body_text)||source.body_revision!==items[0].script_revision||source.body_text_hash!==hash(source.body_text)||
    items.some(i=>i.script_text!==i.hook_text+'\n\n'+source.body_text))throw Error('Exact common body snapshot required');
  if(items.some(i=>i.script_hash&&i.script_hash!==scriptHash(i)))throw Error('Draft script hash mismatch');
 } catch(error) {block('draft',error.message);}
 if(!review||review.reviewVersion!=='1.0.0')block('review','Bound exact-text editorial release review required');
 const bindings=review?.scriptHashes;
 if(items.length!==3||!Array.isArray(bindings)||bindings.length!==3||new Set(bindings?.map(b=>b.versionId)).size!==3||
   items.some(i=>!bindings?.some(b=>b.versionId===i.version_id&&b.scriptHash===scriptHash(i))))block('text_binding','Review does not cover current exact speech');
 if(review?.rulesVersion!==editorialRulesVersion||review?.rulesSha256!==editorialRulesSha256)block('rules','Current editorial policy review required');
 const task=review?.businessTask;
 if(!task||['actor','input','operation','output','extraValue'].some(k=>!nonempty(task[k])))block('task','Specify operator, input, action, output and value beyond a generic chat prompt');
 const reference=review?.reference;
 try {
  if(!reference||!['instagram','tiktok','youtube'].includes(reference.platform))throw Error('Supported external video reference required');
  const record=JSON.parse(proof(reference.evidence,root));
  const url=new URL(record.url);
  const videoId=/^[A-Za-z0-9_-]{11}$/;
  const watch=['www.youtube.com','youtube.com'].includes(url.hostname)&&url.pathname==='/watch'&&videoId.test(url.searchParams.get('v')||'')&&[...url.searchParams.keys()].length===1;
  const supported=reference.platform==='instagram'?url.hostname==='www.instagram.com'&&/^\/reel\/[\w-]+\/$/.test(url.pathname):
    reference.platform==='tiktok'?url.hostname==='www.tiktok.com'&&/^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname):
    watch||(['www.youtube.com','youtube.com'].includes(url.hostname)&&/^\/shorts\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname))||
    (url.hostname==='youtu.be'&&/^\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname));
  if(!supported||url.protocol!=='https:'||(url.search&&!watch)||url.hash)throw Error('Direct clean video link required');
  const published=Date.parse(record.publishedAt??record.publishedDate),checked=Date.parse(record.checkedAt);
  if(!Number.isFinite(published)||published>now||now-published>60*86400000)throw Error('Reference older than 60 days or publication date unknown');
  if(!Number.isFinite(checked)||checked>now||now-checked>7*86400000)throw Error('Current metric verification required (within 7 days)');
  const counts=record.primaryEmbed?{views:record.primaryEmbed.videoViewCount}:record.primaryCounters;
  const popular=counts&&['views','plays'].some(k=>Number.isFinite(counts[k])&&counts[k]>=100000);
  if(!popular)throw Error('At least 100000 source-verified public views/plays required; aggregator alone is insufficient');
  if(!['frames_and_transcript','continuous_playback'].includes(reference.inspectionMode)||!nonempty(reference.relevance))throw Error('Document actual inspection and exact business-process relevance');
 } catch(error) {block('reference',error.message);}
 const demo=review?.demonstration;
 if(!demo||demo.status!=='tested'||demo.workflowMatchesScript!==true||demo.syntheticDisclosed!==true||
    !Array.isArray(demo.artifacts)||!demo.artifacts.length||!Array.isArray(demo.steps)||!demo.steps.length||
    demo.steps.some(s=>!s||s.status!=='pass'||['action','observed','verification'].some(k=>!nonempty(s[k])))) {
  block('demo','Run the actual proposed workflow and document verified output; a prepared prompt is not a tested demonstration');
 } else for(const artifact of demo.artifacts)try {proof(artifact,root);}catch(error){block('demo_artifact',error.message);}
 const checks=review?.criteria;
 if(!Array.isArray(checks)||checks.length!==criteria.length||new Set(checks.map(c=>c.id)).size!==criteria.length||
    criteria.some(id=>!checks.some(c=>c.id===id&&c.status==='pass'&&nonempty(c.note)&&Array.isArray(c.evidence)&&c.evidence.length&&c.evidence.every(nonempty))))
  block('editorial','All eight criteria need a substantive reviewer decision and supporting evidence');
 if(!nonempty(review?.reviewer)||review?.semanticReviewCompleted!==true)block('semantic','Separate semantic/factual review must be completed; structural checks cannot prove usefulness');
 if(review?.romanApprovalGranted!==false)block('approval','Editorial review must not claim Roman approved the text');
 return {gateVersion:'1.0.0',checkedAt:new Date(now).toISOString(),eligibleForRomanReview:blockers.length===0,
   productionReady:false,romanApprovalGranted:false,semanticFactCheckAutomated:false,blockers};
}
export function requireEditorialRelease(manifest,review,options) {
 const result=assessEditorialRelease(manifest,review,options);
 if(!result.eligibleForRomanReview)throw Error('Editorial release blocked: '+result.blockers.map(b=>b.id+': '+b.message).join('; '));
 return result;
}
