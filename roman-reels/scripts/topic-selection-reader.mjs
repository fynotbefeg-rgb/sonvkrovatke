// Authenticated read-only topic selection. No Actor/model/Sheets writes.
import {createHash} from 'node:crypto';
import {topicReferencePlan} from './topic-reference-plan.mjs';
const authenticated=new WeakMap();
const exact=(x,fields)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===fields.length&&Object.keys(x).every(k=>fields.includes(k));
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function validateTopicSnapshot(data,{now=Date.now()}={}) {
 const captured=Date.parse(data?.capturedAt);
 if(!Number.isFinite(now)||!exact(data,['ok','snapshotVersion','source','capturedAt','enabled','topics','scriptApprovalGranted','productionAllowed'])||data?.ok!==true||data.snapshotVersion!=='1.0.0'||data.source!=='apps_script_shared_review'||
  data.enabled!==true||data.scriptApprovalGranted!==false||data.productionAllowed!==false||
  !Number.isFinite(captured)||captured>now||now-captured>5*60000||!Array.isArray(data.topics)||data.topics.length>90)
  throw Error('Current enabled research-only snapshot required');
 const ids=new Set();
 for(const t of data.topics) {
  const approved=Date.parse(t?.approvedAt);
  if(!exact(t,['topicId','topicText','reviewRevision','topicHash','approvedBy','approvedAt','status'])||typeof t.topicId!=='string'||!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(t.topicId)||ids.has(t.topicId)||
   typeof t.topicText!=='string'||!t.topicText.trim()||!Number.isSafeInteger(t.reviewRevision)||t.reviewRevision<1||
   t.status!=='selected_for_research'||typeof t.approvedBy!=='string'||!t.approvedBy.trim()||
   !Number.isFinite(approved)||approved>captured||
   t.topicHash!==digest(['shared-review-v1',t.topicId,t.reviewRevision,'topic',t.topicText]))throw Error('Invalid or ambiguous topic receipt');
  ids.add(t.topicId);
 }
 return data;
}
async function requestTopicSnapshot({url,token,fetchImpl=fetch}={}) {
 if(typeof url!=='string'||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)||
  typeof token!=='string'||!token.trim()||/[\r\n]/.test(token))throw Error('Existing protected webhook configuration required');
 const signal=AbortSignal.timeout(30000);
 let response;
 try {
  response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({token,action:'get_topic_research_snapshot'}),redirect:'manual',signal});
  if([302,303].includes(response.status)) {
   const location=response.headers.get('location'),target=new URL(location||'',url);
   if(target.origin!=='https://script.googleusercontent.com'||target.pathname!=='/macros/echo'||target.username||target.password||target.hash||target.href.includes(token))throw Error('Unexpected response redirect');
   // Response-only GET: never forward the webhook token/body to the redirect.
   response=await fetchImpl(target.href,{method:'GET',redirect:'error',signal});
  }
  if(!response.ok)throw Error('Topic endpoint rejected request');
  const raw=await response.text();if(raw.length>200000)throw Error('Topic response too large');
  return JSON.parse(raw);
 } catch {throw Error('Topic snapshot unavailable or invalid; no fallback approval or automatic retry');}
}
export async function readTopicSnapshot(options={}) {
 const data=validateTopicSnapshot(await requestTopicSnapshot(options),{now:options.now??Date.now()});
 authenticated.set(data,digest(data));return data;
}
// Deployment health check only: disabled data never gains planner provenance.
export async function checkDisabledTopicSnapshot(options={}) {
 const data=await requestTopicSnapshot(options),now=options.now??Date.now(),captured=Date.parse(data?.capturedAt);
 if(!Number.isFinite(now)||!exact(data,['ok','snapshotVersion','source','capturedAt','enabled','topics','scriptApprovalGranted','productionAllowed'])||
  data.ok!==true||data.snapshotVersion!=='1.0.0'||data.source!=='apps_script_shared_review'||data.enabled!==false||
  data.scriptApprovalGranted!==false||data.productionAllowed!==false||!Array.isArray(data.topics)||data.topics.length!==0||
  !Number.isFinite(captured)||captured>now||now-captured>5*60000)
  throw Error('Expected current disabled research-only snapshot; no feature changes performed');
 return {enabled:false,topicCount:0,productionAllowed:false};
}
export function planForSelectedTopic(scope,batch,snapshot,{now=Date.now()}={}) {
 if(!snapshot||authenticated.get(snapshot)!==digest(snapshot))throw Error('Live authenticated snapshot required; a saved or modified JSON is not authority');
 validateTopicSnapshot(snapshot,{now});
 const selected=snapshot.topics.find(t=>t.topicId===scope?.topicId&&t.topicText===scope?.title);
 if(!selected)throw Error('Current exact topic not selected; narrow planning blocked');
 const plan=topicReferencePlan(scope,batch,{now});
 return {...plan,topicApprovalVerificationRequired:false,topicSelectionVerification:'authenticated_live_snapshot',
  selection:{topicId:selected.topicId,reviewRevision:selected.reviewRevision,topicHash:selected.topicHash,
    approvedAt:selected.approvedAt,capturedAt:snapshot.capturedAt},
  jobKey:digest([plan.jobKey,selected.topicHash,selected.approvedAt]),
  networkExecutionAllowed:false,geminiGenerationAllowed:false,romanApprovalGranted:false,productionReady:false};
}
