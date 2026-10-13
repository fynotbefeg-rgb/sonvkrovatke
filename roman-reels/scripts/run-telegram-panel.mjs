#!/usr/bin/env node
// Explicitly deployed persistent trusted coordinator only. Never an Actions runner
// or a Windows host given copied cloud secrets. No network call at module import.
import path from 'node:path';
import {mkdir,chmod} from 'node:fs/promises';
import {ProductionQueue} from './production-queue.mjs';
import {withLock} from './source-uploader.mjs';
import {readApprovedQueue} from './approved-four-part-jobs.mjs';
import {telegramApi} from './telegram-bot-api.mjs';
import {pollTelegramPanelOnce} from './telegram-panel.mjs';

async function main(){
  if(process.argv.length!==3||!['--once','--serve'].includes(process.argv[2]))throw Error('Choose explicit poll mode');
  if(process.env.ROMAN_TELEGRAM_DEPLOYMENT_APPROVED!=='true'||process.env.GITHUB_ACTIONS==='true')throw Error('Persistent coordinator deployment not approved');
  const file=process.env.ROMAN_TELEGRAM_QUEUE_PATH;
  if(!file||!path.isAbsolute(file)||!file.endsWith('.sqlite'))throw Error('Private persistent DB path required');
  const ids=(process.env.TELEGRAM_OPERATOR_IDS??'').split(',');
  if(ids.some(id=>!/^[1-9][0-9]{0,15}$/.test(id)))throw Error('Explicit authorized operators required');
  const url=process.env.ROMAN_REELS_WEBHOOK_URL,token=process.env.ROMAN_REELS_WEBHOOK_TOKEN;
  if(!url||!token)throw Error('Existing protected approvals unavailable');
  const api=telegramApi({token:process.env.TELEGRAM_BOT_TOKEN});
  process.umask(0o077);await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  await withLock(`${file}.lock`,async()=>{
    const queue=new ProductionQueue(file);await chmod(file,0o600);
    try{
      const botId=await api.identity();
      do{
        const result=await pollTelegramPanelOnce({api,botId,queue,allowedOperatorIds:ids,
          readCurrentApprovals:()=>readApprovedQueue({url,token})});
        console.log(JSON.stringify(result));
      }while(process.argv[2]==='--serve');
    }finally{queue.close();}
  });
}
main().catch(()=>{console.error('Telegram panel stopped; inspect configuration privately. No avatar generation or rendering performed.');process.exitCode=1;});
