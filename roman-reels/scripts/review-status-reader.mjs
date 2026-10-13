// Read-only display metadata; cannot create tickets or prove production approval.
const exact=(x,fields)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===fields.length&&Object.keys(x).every(k=>fields.includes(k));
const parts=['topic','body','hook1','hook2','hook3'];
const states=['pending','approved','not_approved','unverified','binding_changed','not_created'];
export function validateReviewStatusSnapshot(data,{now=Date.now()}={}){
  const captured=Date.parse(data?.capturedAt);
  if(!exact(data,['ok','snapshotVersion','source','capturedAt','enabled','topics','approvalWrites','productionAllowed'])||data.ok!==true||
    data.snapshotVersion!=='1.0.0'||data.source!=='apps_script_review_status'||typeof data.enabled!=='boolean'||
    data.approvalWrites!==false||data.productionAllowed!==false||!Number.isFinite(now)||!Number.isFinite(captured)||captured>now||now-captured>300000||
    !Array.isArray(data.topics)||data.topics.length>90||(!data.enabled&&data.topics.length))throw Error('Invalid current review status');
  const ids=new Set();
  for(const t of data.topics){
    if(!exact(t,['topicId','title','reviewRevision','kind','components'])||typeof t.topicId!=='string'||!/^[a-z0-9][a-z0-9_-]*$/.test(t.topicId)||
      t.topicId.length>8000||ids.has(t.topicId)||typeof t.title!=='string'||!t.title.trim()||t.title.length>160||/[\u0000-\u001f]/.test(t.title)||
      !Number.isSafeInteger(t.reviewRevision)||t.reviewRevision<1||!['topic_only','shared'].includes(t.kind)||
      !exact(t.components,parts)||parts.some(p=>!states.includes(t.components[p]))||t.components.topic==='not_created'||
      (t.kind==='topic_only'&&parts.slice(1).some(p=>t.components[p]!=='not_created'))||
      (t.kind==='shared'&&parts.some(p=>t.components[p]==='not_created')))throw Error('Invalid topic review status');
    ids.add(t.topicId);
  }
  return data;
}
export async function readReviewStatuses({url,token,fetchImpl=fetch,now=Date.now()}={}){
  try{
    if(typeof url!=='string'||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)||
      typeof token!=='string'||!token.trim()||/[\r\n]/.test(token))throw Error();
    const signal=AbortSignal.timeout(30000);
    let response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({token,action:'get_review_status_snapshot'}),redirect:'manual',signal});
    if([302,303].includes(response.status)){
      const target=new URL(response.headers.get('location')||'',url);
      if(target.origin!=='https://script.googleusercontent.com'||target.pathname!=='/macros/echo'||target.username||target.password||
        target.hash||target.href.includes(token)||target.href.includes(encodeURIComponent(token)))throw Error();
      response=await fetchImpl(target.href,{method:'GET',redirect:'error',signal});
    }
    if(!response.ok||!response.body)throw Error();
    let size=0;const chunks=[];
    for await(const chunk of response.body){size+=chunk.length;if(size>200000)throw Error();chunks.push(chunk);}
    return validateReviewStatusSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8')),{now});
  }catch{throw Error('Current detailed review status unavailable; no saved fallback');}
}
