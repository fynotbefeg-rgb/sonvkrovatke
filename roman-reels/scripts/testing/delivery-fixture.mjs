// Fictional data for offline transport tests only; no real approvals or media.
import {createHash} from 'node:crypto';
import path from 'node:path';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function deliveryPlan() {
  const topicId='transport-test',scriptVersion=1,body='Synthetic transport body',planKey='a'.repeat(64);
  const hooks=[1,2,3].map(hook_id=>({hook_id,hook_text:`Synthetic hook ${hook_id}`}));
  const packet={draftVersion:'3.0.0',mode:'editorial',productionReady:false,
    sourceSet:{topic_id:topicId,recordingParts:4,status:'pending_approval',body_text:body,body_text_hash:hash(body),hooks},
    items:hooks.map(h=>{const id=`R-${topicId}-h${h.hook_id}`,script=`${h.hook_text}\n\n${body}`;
      return {topic_id:topicId,hook_id:h.hook_id,version_id:id,script_revision:1,hook_text:h.hook_text,
        script_text:script,script_hash:hash(JSON.stringify([id,1,h.hook_text,script])),status:'pending_approval'};})};
  const jobs=['body','hook-1','hook-2','hook-3'].map(role=>({schemaVersion:'1.0.0',jobId:`rr-${planKey.slice(0,40)}-${role}`,
    topicId,scriptVersion,role,localPath:path.resolve(`offline-fixture/${role}.mp4`),heygenTitle:null,
    textHash:hash(role==='body'?body:hooks.find(h=>role===`hook-${h.hook_id}`).hook_text)}));
  return {planVersion:'1.0.0',topicId,scriptVersion,generationAllowed:false,uploadPerformed:false,renderAllowed:false,
    currentApprovalRecheckRequired:true,jobs,packet,status:'planned',planKey};
}
