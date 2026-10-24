#!/usr/bin/env node
// Explicitly deployed persistent trusted coordinator only. Never an Actions runner
// or a Windows host given copied cloud secrets. No network call at module import.
import path from 'node:path';
import {mkdir,chmod} from 'node:fs/promises';
import {ProductionQueue} from './production-queue.mjs';
import {withLock} from './source-uploader.mjs';
import {readApprovedQueue} from './approved-four-part-jobs.mjs';
import {telegramApi,safeTelegramError} from './telegram-bot-api.mjs';
import {pollTelegramPanelOnce} from './telegram-panel.mjs';
import {loadWindowsTelegramConfig} from './windows-telegram-config.mjs';
import {readReviewStatuses} from './review-status-reader.mjs';
import {runTelegramPoller} from './telegram-poll-recovery.mjs';
import {readCandidateCatalog} from './telegram-candidates.mjs';
import {FourPartIntake,launcherPlanner} from './telegram-intake.mjs';

async function main(){
  const mode=process.argv[2],windows=mode?.startsWith('--windows-');
  if(process.argv.length!==3||!['--once','--serve','--windows-once','--windows-serve','--windows-check-config','--windows-check-access'].includes(mode))throw Error('Choose explicit poll mode');
  if(process.env.GITHUB_ACTIONS==='true')throw Error('Persistent coordinator required');
  const config=windows?await loadWindowsTelegramConfig():null;
  if(mode==='--windows-check-config'){console.log(JSON.stringify({configValid:true,botUsername:config.botUsername,operators:config.operatorIds.length,generationAllowed:false,renderAllowed:false}));return;}
  const url=config?.webhookUrl??process.env.ROMAN_REELS_WEBHOOK_URL,token=config?.webhookToken??process.env.ROMAN_REELS_WEBHOOK_TOKEN;
  if(!url||!token)throw Error('Existing protected approvals unavailable');
  if(mode==='--windows-check-access'){
    const snapshot=await readApprovedQueue({url,token});
    console.log(JSON.stringify({authenticatedRead:true,approvedItems:snapshot.items.length,googleWrites:false,generationAllowed:false,renderAllowed:false}));return;
  }
  if(process.env.ROMAN_TELEGRAM_DEPLOYMENT_APPROVED!=='true')throw Error('Persistent coordinator deployment not approved');
  const file=windows?path.join(process.env.LOCALAPPDATA,'RomanReels','telegram-panel','production.sqlite'):process.env.ROMAN_TELEGRAM_QUEUE_PATH;
  if(!file||!path.isAbsolute(file)||!file.endsWith('.sqlite'))throw Error('Private persistent DB path required');
  const ids=config?.operatorIds??(process.env.TELEGRAM_OPERATOR_IDS??'').split(',');
  if(ids.some(id=>!/^[1-9][0-9]{0,15}$/.test(id)))throw Error('Explicit authorized operators required');
  const api=telegramApi({token:config?.botToken??process.env.TELEGRAM_BOT_TOKEN});
  process.umask(0o077);await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  await withLock(`${file}.lock`,async()=>{
    const queue=new ProductionQueue(file);await chmod(file,0o600);
    // Kit folders stay outside Git next to the private DB; the launcher is only called in plan mode,
    // with the same Python environment the laptop's ASR runs use.
    const intakeRoot=windows?path.join(process.env.LOCALAPPDATA,'RomanReels','telegram-intake'):process.env.ROMAN_TELEGRAM_INTAKE_DIR;
    const inbox=windows?path.join(process.env.LOCALAPPDATA,'RomanReels','telegram-inbox'):process.env.ROMAN_TELEGRAM_INBOX_DIR;
    const intake=intakeRoot&&path.isAbsolute(intakeRoot)?new FourPartIntake(queue.db,{root:intakeRoot,inbox:inbox&&path.isAbsolute(inbox)?inbox:undefined,
      plan:launcherPlanner({python:process.env.ROMAN_INTAKE_PYTHON||(windows?path.join(process.env.LOCALAPPDATA,'RomanReels','asr-env','Scripts','python.exe'):'python3')})}):undefined;
    try{
      await runTelegramPoller({identify:()=>api.identity(config?.botUsername),
        poll:botId=>pollTelegramPanelOnce({api,botId,queue,allowedOperatorIds:ids,
          readCurrentApprovals:()=>readApprovedQueue({url,token}),intake,readReviewStatus:()=>readReviewStatuses({url,token}),
          readCandidates:()=>readCandidateCatalog(windows?path.join(process.env.LOCALAPPDATA,'RomanReels','telegram-panel','candidate-topics.json'):process.env.ROMAN_TELEGRAM_CANDIDATES_PATH)}),
        continuous:['--serve','--windows-serve'].includes(mode),log:record=>console.log(JSON.stringify(record))});
    }finally{queue.close();}
  });
}
main().catch(error=>{console.error(JSON.stringify({event:'telegram_stopped',...safeTelegramError(error),generationAllowed:false,renderAllowed:false}));process.exitCode=1;});
