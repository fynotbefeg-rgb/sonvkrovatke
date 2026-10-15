#!/usr/bin/env node
// Read-only cloud check for one exact selected topic. No identities, titles, hashes or credentials in output.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readTopicSnapshot} from './topic-selection-reader.mjs';
export async function checkSelectedTopic({topicId,revision,topicText,...connection}) {
  if(typeof topicId!=='string'||!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(topicId)||
    !Number.isSafeInteger(revision)||revision<1||typeof topicText!=='string'||!topicText.trim())throw Error('Exact expected topic required');
  const snapshot=await readTopicSnapshot(connection);
  const topic=snapshot.topics.find(t=>t.topicId===topicId&&t.reviewRevision===revision&&t.topicText===topicText);
  return {topicApprovalVerified:Boolean(topic),topicId,expectedRevision:revision,
    status:topic?'selected_for_research':'not_verified',scriptApprovalGranted:false,approvalWrites:false,productionAllowed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const [topicId,revision,topicText]=process.argv.slice(2);
  if(process.argv.length!==5){console.error('Expected topic ID, revision and exact title');process.exitCode=1;}
  else checkSelectedTopic({topicId,revision:Number(revision),topicText,
    url:process.env.ROMAN_REELS_WEBHOOK_URL,token:process.env.ROMAN_REELS_WEBHOOK_TOKEN})
    .then(r=>{console.log(JSON.stringify(r));if(!r.topicApprovalVerified)process.exitCode=1;},()=>{
      console.error('Current topic approval could not be verified; no changes performed.');process.exitCode=1;
    });
}
