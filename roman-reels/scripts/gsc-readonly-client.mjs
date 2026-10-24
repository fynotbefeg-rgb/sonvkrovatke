// Restricted API adapter for the future GSC MCP host. No built-in authentication or live CLI.
// The host must provide a fresh, separately authorised webmasters.readonly token.
export const GSC_READONLY_SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
export const GSC_PAGE='https://idco.ru/passivnyy-dohod';
const START='2026-07-10',END='2026-10-09';
const names=['list_properties','get_page_queries','inspect_page','get_recent_queries'];
export const GSC_READONLY_TOOLS=Object.freeze(names.map(name=>Object.freeze({name,
 description:name==='list_properties'?'Read available idco.ru properties':name==='get_recent_queries'?'Read at most 5 site-wide query rows for the 28 days ending 3 days ago':name==='get_page_queries'?'Read at most 10 page-filtered query rows for the fixed export period':'Read indexed inspection for the fixed page; not a live URL test',
 inputSchema: name==='list_properties'?{type:'object',properties:{},additionalProperties:false}:
 {type:'object',properties:{property:{type:'string'}},required:['property'],additionalProperties:false}})));
const propertyAllowed=p=>p==='https://idco.ru/';
function exactArgs(args,hasProperty) {
 return args&&typeof args==='object'&&!Array.isArray(args)&&Object.keys(args).length===(hasProperty?1:0)&&
 (!hasProperty||(Object.hasOwn(args,'property')&&propertyAllowed(args.property)));
}
async function boundedJson(response) {
 if(Number(response.headers.get('content-length'))>2*1024*1024||!response.body)throw Error('response');
 const reader=response.body.getReader(),chunks=[];let bytes=0;
 try {
  for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;
   if(bytes>2*1024*1024)throw Error('response');chunks.push(value);}
 }catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 const joined=new Uint8Array(bytes);let offset=0;for(const c of chunks){joined.set(c,offset);offset+=c.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));
}
export function createGscReadOnlyClient({readonlyTokenProvider,fetchImpl=fetch,now=Date.now}={}) {
 if(typeof readonlyTokenProvider!=='function'||typeof fetchImpl!=='function'||typeof now!=='function')throw Error('Explicit private readonly token provider required');
 const used=new Set();let properties=null,capturedAt=null,stopped=false;
 async function request(tool,route,body) {
  // Reserve before awaiting provider/fetch: no duplicate or concurrent retry within this session.
  if(stopped||used.has(tool))throw Error('GSC step unavailable; inspect before a new session');
  used.add(tool);
  try {
   if(!Number.isFinite(now()))throw Error('clock');
   const auth=await readonlyTokenProvider();
   // Provider contract only: does not independently prove granted scopes. No arbitrary cached Drive token.
   if(!auth||auth.scope!==GSC_READONLY_SCOPE||typeof auth.accessToken!=='string'||!auth.accessToken.trim()||
    /[\r\n]/.test(auth.accessToken)||!Number.isFinite(auth.expiresAt)||auth.expiresAt<=now())throw Error('auth');
   const response=await fetchImpl(route,{method:body?'POST':'GET',redirect:'error',
    headers:{Authorization:`Bearer ${auth.accessToken}`,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw Error('http');
   return await boundedJson(response);
  }catch{stopped=true;throw Error('GSC read failed; no automatic retry, fallback or permission escalation');}
 }
 return Object.freeze({async callTool(name,args={}) {
  if(!names.includes(name)||!exactArgs(args,name!=='list_properties'))throw Error('Unlisted tool or arguments');
  if(name==='list_properties') {
   const result=await request(name,'https://www.googleapis.com/webmasters/v3/sites');
   if(!result||!Array.isArray(result.siteEntry)||result.siteEntry.some(s=>!s||typeof s.siteUrl!=='string'||typeof s.permissionLevel!=='string')) {
    stopped=true;throw Error('Invalid property list');
   }
   properties=new Set(result.siteEntry.filter(s=>propertyAllowed(s.siteUrl)&&
    ['siteOwner','siteFullUser','siteRestrictedUser'].includes(s.permissionLevel)).map(s=>s.siteUrl));
   capturedAt=now();return {properties:[...properties],productionAllowed:false};
  }
  if(stopped||!properties||!properties.has(args.property)||!Number.isFinite(now())||now()<capturedAt||now()-capturedAt>300000)
   throw Error('Fresh authorised property listing and explicit exact property required');
  if(name==='get_recent_queries') {
   const day=ms=>new Date(ms).toISOString().slice(0,10),end=day(now()-3*864e5),start=day(now()-30*864e5);
   const result=await request(name,`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(args.property)}/searchAnalytics/query`,{
    startDate:start,endDate:end,dimensions:['query'],rowLimit:5,startRow:0,type:'web',dataState:'final'});
   if(!result||typeof result!=='object'||Array.isArray(result)||(result.rows!==undefined&&(!Array.isArray(result.rows)||result.rows.length>5))) {
    stopped=true;throw Error('Invalid bounded analytics result');
   }
   return {period:{startDate:start,endDate:end},data:result,productionAllowed:false};
  }
  if(name==='get_page_queries') {
   const result=await request(name,`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(args.property)}/searchAnalytics/query`,{
    startDate:START,endDate:END,dimensions:['query'],rowLimit:10,startRow:0,type:'web',dataState:'final',
    dimensionFilterGroups:[{groupType:'and',filters:[{dimension:'page',operator:'equals',expression:GSC_PAGE}]}]});
   if(!result||typeof result!=='object'||Array.isArray(result)||
    (result.rows!==undefined&&(!Array.isArray(result.rows)||result.rows.length>10))) {
    stopped=true;throw Error('Invalid bounded analytics result');
   }
   return {period:{startDate:START,endDate:END},page:GSC_PAGE,data:result,productionAllowed:false};
  }
  const result=await request(name,'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',{
   inspectionUrl:GSC_PAGE,siteUrl:args.property,languageCode:'ru-RU'});
  if(!result||typeof result.inspectionResult!=='object'||!result.inspectionResult) {
   stopped=true;throw Error('Invalid inspection result');
  }
  return {page:GSC_PAGE,liveUrlTest:false,data:result,productionAllowed:false};
 }});
}
