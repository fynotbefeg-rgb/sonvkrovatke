import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {dpapi} from './source-uploader-auth.mjs';
import {loadWindowsTelegramConfig,validateWindowsTelegramConfig} from './windows-telegram-config.mjs';
import {telegramApi} from './telegram-bot-api.mjs';

const config=()=>({configVersion:'1.0.0',botUsername:'Factory_reels_bot',botToken:'123456:offline_fake_bot_token_123456789',operatorIds:['123'],
 webhookUrl:'https://script.google.com/macros/s/offline_test/exec',webhookToken:'offline-webhook-secret'});
test('explicit DPAPI load uses only pinned local config file, no env/source credential discovery',async()=>{
 const home=path.resolve('offline-profile');let calls=0;
 const value=await loadWindowsTelegramConfig({localAppData:home,read:async(file)=>{
  assert.equal(file,path.join(home,'RomanReels','telegram-panel','config.dpapi'));calls++;return 'encrypted-only';
 },crypto:{unprotect:async(cipher)=>{assert.equal(cipher,'encrypted-only');return JSON.stringify(config());}}});
 assert.deepEqual(value,config());assert.equal(calls,1);
});
test('missing, oversized, broken ciphertext/plaintext fail with no secrets in errors',async()=>{
 const home=path.resolve('offline-profile');
 for(const options of [
  {read:async()=>{throw Error(config().botToken)}},
  {read:async()=> 'x'.repeat(32769)},
  {read:async()=> 'cipher',crypto:{unprotect:async()=>{throw Error(config().webhookToken)}}},
  {read:async()=> 'cipher',crypto:{unprotect:async()=> 'x'.repeat(16385)}},
  {read:async()=> 'cipher',crypto:{unprotect:async()=> '{broken'}}
 ])await assert.rejects(loadWindowsTelegramConfig({localAppData:home,...options}),e=>e.message==='Private Telegram configuration unavailable or invalid');
});
test('reject invalid bot, operator, endpoint, token and extra command fields',()=>{
 for(const change of [{botUsername:'other_bot'},{operatorIds:['123','456']},{operatorIds:['9999999999999999']},
  {webhookUrl:'https://example.test/exec'},{botToken:'invalid'},{webhookToken:'secret\n'},{command:'run'},{configVersion:'2.0.0'}])
  assert.throws(()=>validateWindowsTelegramConfig({...config(),...change}),/configuration invalid/);
});
test('getMe pins expected public bot identity and never starts polling',async()=>{
 const calls=[];const api=telegramApi({token:config().botToken,fetchImpl:async(url)=>{
  calls.push(url.split('/').at(-1));return new Response(JSON.stringify({ok:true,result:{is_bot:true,id:321,username:'other_bot'}}));
 }});
 await assert.rejects(api.identity('Factory_reels_bot'),/Invalid bot identity/);assert.deepEqual(calls,['getMe']);
});
test('Windows DPAPI real roundtrip stores ciphertext and loads private config',{skip:process.platform!=='win32'},async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'telegram-config-'));
 try{
  const cipher=await dpapi.protect(JSON.stringify(config()));
  assert.ok(!cipher.includes(config().botToken)&&!cipher.includes(config().webhookToken));
  const dir=path.join(home,'RomanReels','telegram-panel');await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'config.dpapi'),cipher);
  assert.deepEqual(await loadWindowsTelegramConfig({localAppData:home}),config());
 }finally{await rm(home,{recursive:true,force:true});}
});
