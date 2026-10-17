// Offline, reproducible arithmetic. No AI output, site crawl or ranking claim.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function analyzeDemo(input){
 if(input?.synthetic!==true||!Array.isArray(input.rows)||!input.rows.length)throw Error('Explicit synthetic fixture required');
 const rows=input.rows.map(row=>{
  if(![row.impressions,row.clicks,row.position].every(Number.isFinite)||row.impressions<=0||row.clicks<0||row.clicks>row.impressions||row.position<1)throw Error('Invalid metrics');
  return {...row,ctrPercent:Number((row.clicks/row.impressions*100).toFixed(2))};
 });
 // Explicit demo heuristic, not a universal SEO benchmark.
 const candidates=rows.filter(row=>row.impressions>=1000&&row.position<=10&&row.ctrPercent<=2);
 return {synthetic:true,method:'impressions>=1000, position<=10, CTR<=2%; illustrative heuristic only',
  rows,candidates,limitations:['Учебные данные; реальный сайт не анализировался.','Средняя позиция не равна позиции каждого показа.','Низкий CTR не доказывает плохой заголовок; учитывать запросы, устройство, выдачу и период.','Нет эксперимента, доказанного роста трафика или экономии времени.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: prepare-seo-research-demo.mjs input.json output.json');
 const bytes=readFileSync(input);const result=analyzeDemo(JSON.parse(bytes));
 writeFileSync(output,JSON.stringify({...result,inputSha256:createHash('sha256').update(bytes).digest('hex')},null,2)+'\n');
 console.log('Computed synthetic demo; no site or AI service was contacted.');
}
