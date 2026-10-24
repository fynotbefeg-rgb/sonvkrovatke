import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evidenceReport} from './build-seo-evidence-report.mjs';
const fixture=()=>JSON.parse(readFileSync(new URL('../research/site-technical-seo/free-route-fixture-2026-10-11/audit-report.json',import.meta.url)));
test('renders observed counts with explicit synthetic and indexing limitations',()=>{
 const html=evidenceReport(fixture());assert.equal((html.match(/<article>/g)||[]).length,20);
 assert.ok(html.includes('без замечаний: 1. С замечаниями: 9.'));assert.ok(html.includes('без замечаний: 10. С замечаниями: 0.'));
 assert.ok(html.includes('Попадание в Google этим не гарантируется'));assert.ok(html.includes('ИИ не исправлял сайт'));
});
test('rejects altered summaries, duplicate checks or non-synthetic data',()=>{
 for(const edit of [r=>r.variants[0].pass=10,r=>r.variants[0].checks[1].id=r.variants[0].checks[0].id,r=>r.synthetic=false,r=>r.modelCalls=1,r=>r.variants[1].variant='broken']) {
  const r=fixture();edit(r);assert.throws(()=>evidenceReport(r));
 }
});
test('observations are escaped and cannot inject HTML or scripts',()=>{
 const r=fixture();r.variants[0].checks[0].observed='<script>alert(1)</script><img src=x onerror=alert(2)>';
 const html=evidenceReport(r);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;script&gt;'));
});
