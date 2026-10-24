// Opt-in editorial drafts. Existing shared-body v1 callers are unchanged.
import {createHash} from 'node:crypto';
import {sharedBodyDrafts} from './shared-body-drafts.mjs';
import {scriptHash} from './approval-manifest.mjs';
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');
const triggers={instagram:'comment_keyword',tiktok:'dm_keyword'};
export function platformEndingDrafts(topicId,response,endings){
  sharedBodyDrafts(topicId,response); // Validate original body/hooks before variants.
  if(!Array.isArray(endings)||endings.length!==2)throw Error('Two platform endings required');
  const platforms=new Set();const items=[];
  for(const ending of endings){
    if(!ending||!Object.hasOwn(triggers,ending.platform)||platforms.has(ending.platform))throw Error('Distinct Instagram/TikTok endings required');
    platforms.add(ending.platform);
    if(ending.trigger!==triggers[ending.platform])throw Error('Unsupported platform trigger');
    if(typeof ending.text!=='string'||!ending.text.trim()||typeof ending.keyword!=='string'||!ending.keyword.trim())throw Error('Ending text and keyword required');
    if(!ending.text.toLocaleLowerCase('ru').includes(ending.keyword.toLocaleLowerCase('ru')))throw Error('Keyword missing from ending');
    if(ending.platform==='tiktok'&&/комментар/iu.test(ending.text))throw Error('TikTok ending must not request comments');
    if(ending.platform==='tiktok'&&!/личн/iu.test(ending.text))throw Error('TikTok ending must request a direct message');
    const variants=sharedBodyDrafts(`${topicId}-${ending.platform}`,{...response,body_text:response.body_text+'\n\n'+ending.text});
    for(const item of variants.items)items.push({...item,platform:ending.platform,
      root_topic_id:topicId,ending_text:ending.text,ending_hash:hash(ending.text),
      body_text_hash:hash(response.body_text),script_hash:scriptHash(item)});
  }
  return {draftVersion:'2.0.0',mode:'editorial',productionReady:false,items,
    sourceSet:{topic_id:topicId,body_text:response.body_text,body_text_hash:hash(response.body_text),
      hooks:response.hooks,endings:endings.map(e=>({...e,text_hash:hash(e.text),status:'pending_approval'})),
      recordingParts:6,status:'pending_approval'}};
}
