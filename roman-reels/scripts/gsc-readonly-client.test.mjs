import test from 'node:test';
import assert from 'node:assert/strict';
import {createGscReadOnlyClient,GSC_READONLY_TOOLS,GSC_READONLY_SCOPE,GSC_PAGE} from './gsc-readonly-client.mjs';
const time=Date.parse('2026-10-15T10:00:00Z'),property='sc-domain:idco.ru';
function setup({fetch,auth}={}) {
 const calls=[],clock={value:time};let tokens=0;
 const client=createGscReadOnlyClient({now:()=>clock.value,readonlyTokenProvider:async()=>{tokens++;return auth||{scope:GSC_READONLY_SCOPE,accessToken:'FAKE_PRIVATE_TOKEN',expiresAt:time+3600000};},
  fetchImpl:async(url,init)=>{calls.push({url,init});return fetch?fetch(url,init):Response.json(url.endsWith('/sites')?
   {siteEntry:[{siteUrl:property,permissionLevel:'siteOwner'},{siteUrl:'sc-domain:other.example',permissionLevel:'siteOwner'}]}:
   url.endsWith('index:inspect')?{inspectionResult:{indexStatusResult:{verdict:'NEUTRAL'}}}:{rows:[]});}});
 return {client,calls,clock,tokens:()=>tokens};
}
test('only three tools; unknown methods and extra arguments refuse before auth or HTTP',async()=>{
 const s=setup();assert.equal(GSC_READONLY_TOOLS.length,3);
 for(const name of ['submit_sitemap','delete_sitemap','add_site','delete_site','manage_sitemaps','reauthenticate','constructor','sites.add'])
  await assert.rejects(s.client.callTool(name,{property}));
 await assert.rejects(s.client.callTool('list_properties',{url:'https://evil.example'}));
 await assert.rejects(s.client.callTool('inspect_page',{property,page:'https://evil.example'}));
 assert.equal(s.calls.length,0);assert.equal(s.tokens(),0);
});
test('explicit returned property required; no default, foreign or unverified property',async()=>{
 const s=setup();await assert.rejects(s.client.callTool('get_page_queries',{property}));
 const list=await s.client.callTool('list_properties');assert.deepEqual(list.properties,[property]);
 for(const p of ['https://idco.ru/','sc-domain:other.example','https://idco.ru@evil.example/'])
  await assert.rejects(s.client.callTool('get_page_queries',{property:p}));
 assert.equal(s.calls.length,1);
});
test('one exact page query and one indexed inspection; no fabricated rows or live-test claim',async()=>{
 const s=setup();await s.client.callTool('list_properties');
 const analytics=await s.client.callTool('get_page_queries',{property});assert.deepEqual(analytics.data.rows,[]);
 const q=JSON.parse(s.calls[1].init.body);assert.deepEqual(q.dimensions,['query']);assert.equal(q.rowLimit,10);
 assert.equal(q.startDate,'2026-07-10');assert.equal(q.endDate,'2026-10-09');
 assert.equal(q.dimensionFilterGroups[0].filters[0].expression,GSC_PAGE);
 assert.equal(q.dimensionFilterGroups[0].filters[0].operator,'equals');
 const inspection=await s.client.callTool('inspect_page',{property});assert.equal(inspection.liveUrlTest,false);
 assert.deepEqual(JSON.parse(s.calls[2].init.body),{inspectionUrl:GSC_PAGE,siteUrl:property,languageCode:'ru-RU'});
 assert.equal(inspection.productionAllowed,false);assert.equal(s.calls.length,3);
 for(const c of s.calls){assert.equal(c.init.redirect,'error');assert.ok(!c.url.includes('FAKE_PRIVATE_TOKEN'));}
});
test('broad or expired token provider contract rejected with generic errors before HTTP',async()=>{
 for(const auth of [{scope:'https://www.googleapis.com/auth/webmasters',accessToken:'FAKE_PRIVATE_TOKEN',expiresAt:time+1000},
  {scope:GSC_READONLY_SCOPE,accessToken:'FAKE_PRIVATE_TOKEN',expiresAt:time}]) {
  const s=setup({auth});await assert.rejects(s.client.callTool('list_properties'),e=>!e.message.includes('FAKE_PRIVATE_TOKEN'));
  assert.equal(s.calls.length,0);
 }
});
test('network failure, denial and redirects stop all reads without retry or token output',async()=>{
 for(const fetch of [()=>{throw Error('FAKE_PRIVATE_TOKEN');},()=>new Response('denied',{status:403}),()=>new Response('',{status:302})]) {
  const s=setup({fetch});await assert.rejects(s.client.callTool('list_properties'),e=>!e.message.includes('FAKE_PRIVATE_TOKEN'));
  await assert.rejects(s.client.callTool('list_properties'));assert.equal(s.calls.length,1);
 }
});
test('concurrent duplicate calls reserve the step before waiting for HTTP',async()=>{
 const s=setup();await s.client.callTool('list_properties');
 const outcomes=await Promise.allSettled([s.client.callTool('get_page_queries',{property}),s.client.callTool('get_page_queries',{property})]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(s.calls.length,2);
});
test('stale listing, invalid clocks and oversized/invalid data fail closed',async()=>{
 const bad=setup();bad.clock.value=NaN;await assert.rejects(bad.client.callTool('list_properties'));assert.equal(bad.calls.length,0);
 const s=setup();await s.client.callTool('list_properties');s.clock.value+=300001;
 await assert.rejects(s.client.callTool('inspect_page',{property}));s.clock.value=NaN;
 await assert.rejects(s.client.callTool('get_page_queries',{property}));assert.equal(s.calls.length,1);
 for(const fetch of [()=>Response.json({siteEntry:[]},{headers:{'Content-Length':'2097153'}}),()=>Response.json({siteEntry:null}),()=>new Response('{')]) {
  const z=setup({fetch});await assert.rejects(z.client.callTool('list_properties'));await assert.rejects(z.client.callTool('list_properties'));assert.equal(z.calls.length,1);
 }
});
