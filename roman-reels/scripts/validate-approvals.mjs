#!/usr/bin/env node
// Validates a Roman Reels approval manifest. No network calls or external dependencies.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const file=process.argv[2];
if (!file) {console.error('Usage: node validate-approvals.mjs <manifest.json>');process.exit(2);}
let data;
try {data=JSON.parse(readFileSync(file,'utf8'));} catch(e){console.error('Invalid JSON:',e.message);process.exit(1);}
if (!data || !Array.isArray(data.items)) {console.error('Manifest must contain items array');process.exit(1);}
const seen=new Set();
let approved=0, pending=0;
const problems=[];
for (const [i,item] of data.items.entries()) {
 const label='items['+i+']';
 if (!item || typeof item!=='object') {problems.push(label+': expected object');continue;}
 const {topic_id,hook_id,version_id,script_revision,hook_text,script_text,status,approved_by,approved_at,script_hash}=item;
 if (!/^[a-z0-9][a-z0-9_-]*$/.test(topic_id??'')) problems.push(label+': invalid topic_id');
 if (![1,2,3].includes(hook_id)) problems.push(label+': hook_id must be 1, 2 or 3');
 if (version_id!==`R-${topic_id}-h${hook_id}`) problems.push(label+': version_id mismatch');
 if (seen.has(version_id)) problems.push(label+': duplicate version_id');
 seen.add(version_id);
 if (!Number.isInteger(script_revision)||script_revision<1) problems.push(label+': invalid script_revision');
 if (typeof hook_text!=='string'||!hook_text.trim()) problems.push(label+': empty hook_text');
 if (typeof script_text!=='string'||!script_text.trim()) problems.push(label+': empty script_text');
 if (!['pending_approval','approved','rejected'].includes(status)) problems.push(label+': invalid status');
 const digest=createHash('sha256').update(JSON.stringify([version_id,script_revision,hook_text,script_text])).digest('hex');
 if (status==='approved') {
   approved++;
   if (typeof approved_by!=='string'||!approved_by.trim()) problems.push(label+': approved_by required');
   if (typeof approved_at!=='string'||!/^\\d{4}-\\d{2}-\\d{2}T/.test(approved_at)||Number.isNaN(Date.parse(approved_at))) problems.push(label+': approved_at must be ISO timestamp');
   if (script_hash!==digest) problems.push(label+': script_hash does not match approved text/revision');
 } else {pending++;if (approved_by||approved_at) problems.push(label+': unapproved item cannot contain approval metadata');}
}
if (problems.length) {problems.forEach(x=>console.error('ERROR:',x));process.exit(1);}
console.log(`Approval manifest valid: ${data.items.length} total, ${approved} approved, ${pending} not approved.`);
console.log('No HeyGen or rendering jobs were started.');
