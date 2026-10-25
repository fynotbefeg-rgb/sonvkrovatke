#!/usr/bin/env node
// Read-only local editorial preflight; save blockers without sending or generating.
import {readFileSync,writeFileSync} from 'node:fs';
import {assessEditorialRelease} from './editorial-release.mjs';
const [draftFile,reviewFile,output]=process.argv.slice(2);
if(!draftFile||!reviewFile||!output)throw Error('Usage: check-editorial-release.mjs drafts.json release-review.json NEW-report.json');
const result=assessEditorialRelease(JSON.parse(readFileSync(draftFile,'utf8')),JSON.parse(readFileSync(reviewFile,'utf8')));
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log('Eligible for Roman review:',result.eligibleForRomanReview,'Blockers:',result.blockers.map(b=>b.id).join(', '));
console.log('No model calls, Sheets changes, approvals or production.');
if(!result.eligibleForRomanReview)process.exitCode=2;
