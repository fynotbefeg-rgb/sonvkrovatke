// Recover only the bounded pending draft from a known generation artifact.
import {readFileSync} from 'node:fs';
import {validateManifest,scriptHash} from './approval-manifest.mjs';
import {createHash} from 'node:crypto';
const data=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(data.productionReady!==false||data.editorialReviewRequired!==true||data.items?.length!==3||data.source_sets?.length!==1)
 throw Error('Expected three pending research-backed drafts');
validateManifest(data);
const source=data.source_sets[0];
if(source.body_revision!==2||source.status!=='pending_approval'||source.body_text_hash!==createHash('sha256').update(source.body_text).digest('hex'))throw Error('Invalid body snapshot');
for(const item of data.items){
 if(item.status!=='pending_approval'||item.script_revision!==2||item.topic_id!==source.topic_id||item.script_hash!==scriptHash(item)||
    item.script_text!==item.hook_text+'\n\n'+source.body_text)throw Error('Invalid pending review item');
}
// No raw transport response, headers, environment, or credential values.
const output={items:data.items,source_sets:data.source_sets,productionReady:false,editorialReviewRequired:true,
 provenance:{author:data.provenance?.author,model:data.provenance?.model,generatedAt:data.provenance?.generatedAt,
 usageMetadata:data.provenance?.usageMetadata,actualCostUsd:null,briefSha256:data.provenance?.briefSha256,
 evidenceIds:data.provenance?.evidenceIds,limitations:data.provenance?.limitations,syntheticDemo:true,clientCaseTested:false}};
const serialized=JSON.stringify(output);
if(serialized.length>24000)throw Error('Draft exceeds bounded review output');
console.log('GeminiDraftReview '+serialized);
