#!/usr/bin/env node
// Owned synthetic loopback server for an actual local browser/MCP demonstration.
import {startSeoFixture} from '../research/site-technical-seo/fixture-site.mjs';
const [variant,...extra]=process.argv.slice(2);
if(!['broken','fixed'].includes(variant)||extra.length)throw Error('Usage: serve-seo-fixture.mjs broken|fixed');
const fixture=await startSeoFixture(variant==='broken');
console.log(JSON.stringify({origin:fixture.origin,variant,synthetic:true,remoteModelCalls:0,productionReady:false}));
let closing=false;
async function shutdown(){if(closing)return;closing=true;await fixture.close();}
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
