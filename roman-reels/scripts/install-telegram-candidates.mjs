#!/usr/bin/env node
// Explicit local data install only. Does not launch/poll bot or call Google.
import {installCandidateCatalog} from './telegram-candidates.mjs';
async function main(){
  if(process.argv.length!==3||!process.env.LOCALAPPDATA)throw Error('Explicit source and Windows profile required');
  console.log(JSON.stringify(await installCandidateCatalog(process.argv[2],process.env.LOCALAPPDATA)));
}
main().catch(()=>{console.error('Candidate catalog not installed; inspect input privately. No approvals or jobs changed.');process.exitCode=1;});
