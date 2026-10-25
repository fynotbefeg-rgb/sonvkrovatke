import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareSharedReview} from './prepare-shared-review.mjs';
import {scriptHash} from './approval-manifest.mjs';
const draft=()=>({items:[1,2,3].map(hook_id=>({topic_id:'test',hook_id,version_id:`R-test-h${hook_id}`,script_revision:2,
 hook_text:`Хук ${hook_id}`,script_text:`Хук ${hook_id}\n\nОснова 👀`,status:'pending_approval'})),source_sets:[{topic_id:'test',body_revision:2,body_text:'Основа 👀'}]});
test('preparation preserves exact Unicode parts and does not mutate drafts or approve',()=>{
 const d=draft(),original=JSON.stringify(d),p=prepareSharedReview(d,'test','Тема');
 assert.equal(p.bodyText,'Основа 👀');assert.deepEqual(p.hooks.map(h=>h.id),[1,2,3]);
 assert.deepEqual(p.endings,[]);assert.equal(JSON.stringify(d),original);assert.equal(p.approved_by,undefined);
});
test('wrong body, changed hook/full speech, hashes, mixed revisions or approval are rejected',()=>{
 const corrupt=[d=>d.source_sets[0].body_text='Другая основа',d=>d.items[0].script_text='Другая речь',
  d=>d.items[0].script_hash='0'.repeat(64),d=>d.items[0].script_revision=3,
  d=>{d.items[0].status='approved';d.items[0].approved_by='test@example.test';d.items[0].approved_at='2026-10-10T00:00:00Z';d.items[0].script_hash=scriptHash(d.items[0]);}];
 for(const change of corrupt) {const d=draft();change(d);assert.throws(()=>prepareSharedReview(d,'test','Тема'));}
});
test('real pending SEO v6 and existing six-platform packet remain exact',()=>{
 const seo=JSON.parse(readFileSync(new URL('../research/site-technical-seo/reviewed-revision6.json',import.meta.url)));
 const p=prepareSharedReview(seo,'ai-seo-audit','SEO-проверка сайта');assert.equal(p.revision,6);
 assert.equal(p.bodyText,seo.source_sets[0].body_text);
 const platforms=JSON.parse(readFileSync(new URL('../research/platform-ending-drafts-v2.json',import.meta.url)))[0];
 const pp=prepareSharedReview(platforms,'ai-seo-audit','SEO-проверка сайта');assert.equal(pp.endings.length,2);
 assert.equal(pp.endings.find(e=>e.platform==='tiktok').text,platforms.sourceSet.endings.find(e=>e.platform==='tiktok').text);
});
