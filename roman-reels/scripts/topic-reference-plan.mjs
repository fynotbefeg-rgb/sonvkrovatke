// Offline metadata triage. Never trusts a file as Roman approval or starts research.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const text=x=>typeof x==='string'&&x.trim()&&x.length<=1000;
const normalized=x=>x.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
const count=x=>Number.isSafeInteger(x)&&x>=0?x:null;
function contains(caption,term) {
 const escaped=normalized(term).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','u').test(normalized(caption));
}
export function validateTopicScope(scope) {
 const fields=['scopeVersion','topicId','topicRevision','title','businessTask','focusGroups','queries'];
 if(!scope||Object.keys(scope).length!==fields.length||Object.keys(scope).some(k=>!fields.includes(k))||
  scope.scopeVersion!=='1.0.0'||typeof scope.topicId!=='string'||!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(scope.topicId||'')||
  !Number.isSafeInteger(scope.topicRevision)||scope.topicRevision<1||!text(scope.title))throw Error('Bound exact-topic scope required; no approval flags accepted');
 if(!scope.businessTask||['actor','input','operation','output'].some(k=>!text(scope.businessTask[k])))throw Error('Concrete business workflow required');
 if(!Array.isArray(scope.focusGroups)||scope.focusGroups.length<2||scope.focusGroups.length>5||
  scope.focusGroups.some(g=>!Array.isArray(g)||!g.length||g.length>20||g.some(t=>!text(t)||t.trim().length<2||t.length>100)))throw Error('Two to five narrow term groups required');
 if(!Array.isArray(scope.queries)||!scope.queries.length||scope.queries.length>12||scope.queries.some(q=>!q||
  !['instagram','tiktok','youtube'].includes(q.platform)||!text(q.query)))throw Error('Bounded topic queries required');
 return scope;
}
export function topicReferencePlan(scope,batch,{now=Date.now()}={}) {
 validateTopicScope(scope);
 if(!Number.isFinite(now)||!batch||!Array.isArray(batch.items)||batch.items.length>200)throw Error('Bounded saved metadata batch required');
 const checked=Date.parse(batch.checkedAt??batch.collectedAt),fresh=Number.isFinite(checked)&&checked<=now&&now-checked<=7*86400000;
 const accepted=[],rejected=[],seen=new Map();let duplicates=0;
 for(const item of batch.items) {
  const reasons=[];const id=item?.shortcode;
  if(typeof id!=='string'||!/^[-\w]{5,40}$/.test(id)||item.url!==`https://www.instagram.com/reel/${id}/`||
   typeof item.owner!=='string'||! /^[A-Za-z0-9._]{1,30}$/.test(item.owner))reasons.push('invalid_identity');
  if(typeof id==='string'&&seen.has(id)) {
   if(sha(seen.get(id))!==sha(item))throw Error('Conflicting duplicate Reel metadata; inspect saved batch');
   duplicates++;continue;
  }
  if(typeof id==='string')seen.set(id,item);
  const published=Date.parse(item?.publishedAt);
  if(!Number.isFinite(published)||published>now)reasons.push('unknown_or_future_publication');
  else if(now-published>60*86400000)reasons.push('older_than_60_days');
  if(!fresh)reasons.push('stale_or_unknown_metrics');
  const views=count(item?.views),plays=count(item?.plays),popularity=Math.max(views??-1,plays??-1);
  if(popularity<0)reasons.push('views_and_plays_unknown');else if(popularity<100000)reasons.push('below_100000');
  const caption=typeof item?.caption==='string'&&item.caption.length<=16000?item.caption:'';
  const matched=scope.focusGroups.map(g=>g.filter(t=>contains(caption,t)));
  if(matched.some(g=>!g.length))reasons.push('narrow_topic_terms_missing');
  if(reasons.length){rejected.push({shortcode:typeof id==='string'?id:null,reasons});continue;}
  accepted.push({shortcode:id,url:item.url,owner:item.owner,publishedAt:item.publishedAt,views,plays,
   likes:count(item.likes),comments:count(item.comments),reach:null,matchedTerms:matched,
   metadataOnly:true,videoInspectionRequired:true,primaryCounterVerificationRequired:true});
 }
 accepted.sort((a,b)=>Math.max(b.views??0,b.plays??0)-Math.max(a.views??0,a.plays??0)||a.shortcode.localeCompare(b.shortcode));
 const scopeHash=sha(scope),batchHash=sha(batch);
 return {planVersion:'1.0.0',checkedAt:new Date(now).toISOString(),topicId:scope.topicId,topicRevision:scope.topicRevision,
  scopeHash,batchHash,jobKey:sha(['narrow-research-plan-v1',scopeHash,batchHash]),
  status:accepted.length?'metadata_candidates_need_review':'no_metadata_candidates',
  policy:{maxPublicationAgeDays:60,maxMetricAgeDays:7,minPublicViewsOrPlays:100000,maxDetailCandidates:2},
  queries:scope.queries,discoveryAdapterStatus:{instagram:'existing profile/direct-Reel collector; keyword discovery not connected',
   tiktok:'not_connected',youtube:'not_connected'},
  candidates:accepted,rejected,identicalDuplicatesSkipped:duplicates,proposedDetailUrls:accepted.slice(0,2).map(c=>c.url),
  topicApprovalVerificationRequired:true,paidBudgetVerificationRequired:true,networkExecutionAllowed:false,
  geminiGenerationAllowed:false,eligibleForRomanReview:false,romanApprovalGranted:false,productionReady:false,
  nextChecks:['Fresh authenticated topic selection and revision','Approved bounded research budget and applicable Actor schema/pricing',
   'Actually inspect video and speech for concrete process relevance','Verify counters against source and disclose unknown reach',
   'Test free audience workflow and complete factual/editorial review before script generation']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const [scopeFile,batchFile,output]=process.argv.slice(2);if(!scopeFile||!batchFile||!output)throw Error('Usage: scope.json saved-metadata.json NEW-plan.json');
 const load=p=>{const bytes=readFileSync(p);if(bytes.length>2*1024*1024)throw Error('Input too large');return JSON.parse(bytes);};
 const result=topicReferencePlan(load(scopeFile),load(batchFile));writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(`Offline triage: ${result.candidates.length} candidates, ${result.rejected.length} rejected. No calls, approvals or generation.`);
}
