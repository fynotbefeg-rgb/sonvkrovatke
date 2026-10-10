// Read-only recovery of the already-paid probe. No Actor creation or retries.
import {readdirSync,readFileSync} from 'node:fs';
import {sanitize} from './apify-reference-research.mjs';
for (const name of readdirSync('saved-research').filter(n=>/^run-\d+\.json$/.test(n))) {
  const journal=JSON.parse(readFileSync(`saved-research/${name}`,'utf8'));
  console.log(JSON.stringify({journal}));
  if(!/^[A-Za-z0-9]+$/.test(journal.datasetId??'')) continue;
  const response=await fetch(`https://api.apify.com/v2/datasets/${journal.datasetId}/items?clean=true&format=json&limit=16`,
    {headers:{Authorization:`Bearer ${process.env.APIFY_TOKEN}`},redirect:'error'});
  if(!response.ok) throw Error(`Read-only dataset HTTP ${response.status}`);
  const items=await response.json();
  if(!Array.isArray(items)||items.length>15) throw Error('Unexpected size');
  console.log('PUBLIC_CANDIDATES '+JSON.stringify(items.map(i=>({...sanitize(i,false),caption:typeof i.caption==='string'?i.caption.slice(0,1800):null}))));
}
