#!/usr/bin/env node
// Detached montage worker started by the Telegram bot on an explicit «Запустить монтаж»; one sequential pass over
// the executor queue in the bot's SQLite DB, then exit. Laptop only; uses the bot's DPAPI config for replies.
import path from 'node:path';
import {existsSync,readFileSync} from 'node:fs';
import {ProductionQueue} from './production-queue.mjs';
import {telegramApi,safeTelegramError} from './telegram-bot-api.mjs';
import {loadWindowsTelegramConfig} from './windows-telegram-config.mjs';
import {ffmpegPreview,processRunner,runExecutor} from './telegram-executor.mjs';

async function main(){
  if(process.argv.length!==3||process.argv[2]!=='--windows')throw Error('Usage: --windows');
  if(process.env.GITHUB_ACTIONS==='true')throw Error('Laptop worker only');
  if(process.env.ROMAN_TELEGRAM_DEPLOYMENT_APPROVED!=='true')throw Error('Coordinator deployment not approved');
  const base=path.join(process.env.LOCALAPPDATA,'RomanReels');
  const config=await loadWindowsTelegramConfig();
  const api=telegramApi({token:config.botToken});
  const queue=new ProductionQueue(path.join(base,'telegram-panel','production.sqlite'));
  try{
    // Same local model, revision, browser and Python environment as the manual laptop runs.
    const modelPath=path.join(base,'asr-models','faster-whisper-small');
    const revisionFile=path.join(base,'asr-models','revision.txt');
    const modelRevision=existsSync(revisionFile)?readFileSync(revisionFile,'utf8').trim():'';
    const browser=process.env.ROMAN_BROWSER_EXECUTABLE||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const python=process.env.ROMAN_INTAKE_PYTHON||path.join(base,'asr-env','Scripts','python.exe');
    const missing=[[existsSync(path.join(modelPath,'model.bin')),'модель ASR'],[/^[0-9a-f]{40}$/.test(modelRevision),'ревизия модели'],
      [existsSync(browser),'браузер Edge'],[existsSync(python),'Python asr-env']].filter(([ok])=>!ok).map(([,name])=>name);
    if(missing.length){
      // Nothing is claimed, so waiting runs stay waiting; the operators are told why.
      for(const {requested_by:actor} of queue.db.prepare(`SELECT DISTINCT requested_by FROM intake_runs WHERE state='waiting'`).all())
        await api.send(Number(actor),`Исполнитель монтажа не готов: нет ${missing.join(', ')}. Задания остаются в очереди.`).catch(()=>{});
      throw Error('Executor prerequisites missing');
    }
    const result=await runExecutor({db:queue.db,root:path.join(base,'telegram-intake'),
      api,execute:processRunner({python}),makePreview:ffmpegPreview(),modelPath,modelRevision,browser,log:record=>console.log(JSON.stringify(record))});
    console.log(JSON.stringify({event:'executor_finished',...result}));
  }finally{queue.close();}
}
main().catch(error=>{console.error(JSON.stringify({event:'executor_stopped',...safeTelegramError(error)}));process.exitCode=1;});
