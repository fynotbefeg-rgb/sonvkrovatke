#!/usr/bin/env node
// Read-only Version 4 deployment probe. No snapshot contents or secrets logged.
import {checkDisabledTopicSnapshot} from './topic-selection-reader.mjs';
try {
 await checkDisabledTopicSnapshot({url:process.env.ROMAN_REELS_WEBHOOK_URL,token:process.env.ROMAN_REELS_WEBHOOK_TOKEN});
 console.log('Topic snapshot check passed: enabled=false, topics=0, productionAllowed=false. No changes performed.');
} catch {
 console.error('Topic snapshot check failed. No changes performed; inspect deployment compatibility without exposing secrets.');
 process.exitCode=1;
}
