#!/usr/bin/env node
// One read-only Drive poll; stages data, never invokes the uploader or HeyGen.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {tokenProvider} from './source-uploader-auth.mjs';
import {driveClient} from './source-uploader.mjs';
import {receiveDelivery} from './windows-plan-delivery.mjs';

async function main() {
  if(process.argv.length!==2)throw new Error('This command takes no arguments; uses explicit local mailbox config');
  if(!process.env.LOCALAPPDATA&&!process.env.ROMAN_UPLOADER_HOME)throw new Error('Windows runtime home required');
  const home=process.env.ROMAN_UPLOADER_HOME||path.join(process.env.LOCALAPPDATA,'RomanReels','source-uploader');
  const raw=await readFile(path.join(home,'delivery-config.json'));
  if(raw.length>4096)throw new Error('Mailbox config too large');
  const config=JSON.parse(raw.toString('utf8'));
  const drive=driveClient({getToken:tokenProvider({tokenFile:path.join(home,'oauth-token.dpapi')})});
  const result=await receiveDelivery({drive,config,inbox:path.join(home,'received-plans')});
  console.log(JSON.stringify(result));
}
main().catch(()=>{console.error('Delivery not staged; check local mailbox configuration, auth and integrity. No jobs executed.');process.exitCode=1;});
