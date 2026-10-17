// Owner-entered configuration, DPAPI CurrentUser, outside Git. No discovery or
// extraction from source backups, browser cookies, GitHub or system credentials.
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {dpapi} from './source-uploader-auth.mjs';

export function validateWindowsTelegramConfig(data){
  const fields=['configVersion','botUsername','botToken','operatorIds','webhookUrl','webhookToken'];
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==fields.length||
    !Object.keys(data).every(k=>fields.includes(k))||data.configVersion!=='1.0.0'||data.botUsername!=='Factory_reels_bot'||
    typeof data.botToken!=='string'||!/^\d{5,16}:[A-Za-z0-9_-]{20,200}$/.test(data.botToken)||
    !Array.isArray(data.operatorIds)||data.operatorIds.length!==1||typeof data.operatorIds[0]!=='string'||
    !/^[1-9][0-9]{0,15}$/.test(data.operatorIds[0])||!Number.isSafeInteger(Number(data.operatorIds[0]))||
    typeof data.webhookUrl!=='string'||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(data.webhookUrl)||
    typeof data.webhookToken!=='string'||!data.webhookToken.trim()||data.webhookToken.length>4096||/[\r\n\u0000]/.test(data.webhookToken))
    throw Error('Private Telegram configuration invalid');
  return data;
}
export async function loadWindowsTelegramConfig({localAppData=process.env.LOCALAPPDATA,crypto=dpapi,read=readFile}={}){
  if(!localAppData||!path.isAbsolute(localAppData))throw Error('Windows local profile required');
  try{
    const bytes=await read(path.join(localAppData,'RomanReels','telegram-panel','config.dpapi'),'utf8');
    if(bytes.length>32768)throw Error();
    const plain=await crypto.unprotect(bytes);
    if(plain.length>16384)throw Error();
    return validateWindowsTelegramConfig(JSON.parse(plain));
  }catch{throw Error('Private Telegram configuration unavailable or invalid');}
}
