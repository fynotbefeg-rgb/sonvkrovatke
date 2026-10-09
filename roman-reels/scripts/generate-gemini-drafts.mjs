#!/usr/bin/env node
// Generates draft Reels scripts using Gemini REST API. Never approves or publishes.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const key=process.env.GEMINI_API_KEY;
if(!key){console.error('Missing GEMINI_API_KEY');process.exit(1);}
const input=process.argv[2],output=process.argv[3];
if(!input||!output){console.error('Usage: node generate-gemini-drafts.mjs topics.json output.json');process.exit(2);}
const topics=JSON.parse(readFileSync(input,'utf8'));
if(!Array.isArray(topics)||topics.length<1||topics.length>30)throw Error('Expected array of 1–30 topics');
for(const t of topics)if(!t||!(/^[a-z0-9][a-z0-9_-]*$/).test(t.topic_id)||typeof t.topic!=='string'||!t.topic.trim())throw Error('Each topic requires topic_id and topic');
if(new Set(topics.map(x=>x.topic_id)).size!==topics.length)throw Error('Duplicate topic IDs');
// Query the models actually available to this API key instead of assuming a model ID.
const listResponse=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{headers:{'x-goog-api-key':key}});
if(!listResponse.ok)throw Error(`Cannot list Gemini models: HTTP ${listResponse.status} ${(await listResponse.text()).slice(0,250)}`);
const modelList=await listResponse.json();
const supported=(modelList.models||[]).filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>m.name.replace(/^models\//,''));
const preferred=process.env.GEMINI_MODEL;
const candidates=(preferred?[preferred]:['gemini-3-flash-preview','gemini-2.5-flash-lite','gemini-2.5-flash','gemini-2.0-flash-lite','gemini-2.0-flash']).filter(m=>supported.includes(m));
if(!candidates.length)throw Error('No preferred generateContent model listed. Available: '+supported.join(', '));
console.log('Candidate models:',candidates.join(', '));
const items=[];
for(const t of topics){
 const prompt=`Ты сценарист коротких вертикальных видео для Романа. Тема: ${t.topic}. Контекст бренда: ${t.context||'Не задан; не придумывай факты о Романе, продукте или результатах клиентов.'}. Подготовь ровно 3 разных хука и 3 полных сценария на русском языке, каждый 100–160 слов. Не выдумывай статистику, отзывы, медицинские обещания и личный опыт Романа. Ответ только JSON: {"versions":[{"hook_id":1,"hook_text":"...","script_text":"..."},{"hook_id":2,...},{"hook_id":3,...}]}. Каждый сценарий должен соответствовать своему хуку.`;
 let response,body;
 const errors=[];
 for(const model of candidates){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  for(let attempt=0;attempt<3;attempt++){
   response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.7}})});
   if(response.ok)break;
   const message=await response.text();
   if(response.status===404){
    errors.push(`${model}: HTTP 404 (${message.slice(0,180)})`);
    console.log(`Model ${model} returned 404; trying next listed model`);
    break;
   }
   if(![429,500,502,503,504].includes(response.status)||attempt===2)throw Error(`Gemini HTTP ${response.status} on ${model}: ${message.slice(0,400)}`);
   await new Promise(r=>setTimeout(r,1500*(attempt+1)));
  }
  if(response.ok){console.log('Gemini model used:',model);break;}
 }
 if(!response?.ok)throw Error('All listed Gemini models failed: '+errors.join('; '));
 body=await response.json();
 const raw=body.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('');
 if(!raw)throw Error(`Empty Gemini response for ${t.topic_id}`);
 const parsed=JSON.parse(raw);
 if(!Array.isArray(parsed.versions)||parsed.versions.length!==3)throw Error(`Expected 3 versions for ${t.topic_id}`);
 for(const v of parsed.versions){
  if(![1,2,3].includes(v.hook_id)||typeof v.hook_text!=='string'||!v.hook_text.trim()||typeof v.script_text!=='string'||!v.script_text.trim())throw Error('Invalid Gemini version');
  items.push({topic_id:t.topic_id,hook_id:v.hook_id,version_id:`R-${t.topic_id}-h${v.hook_id}`,script_revision:1,hook_text:v.hook_text,script_text:v.script_text,status:'pending_approval'});
 }
 console.log(`Drafted: ${t.topic_id}`);
}
if(new Set(items.map(x=>x.version_id)).size!==items.length)throw Error('Duplicate version IDs');
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({items},null,2)+'\n');
console.log(`Wrote ${items.length} drafts to ${output}; nothing was approved or sent to HeyGen.`);
