// Retry the whole poll from its durable cursor, not individual writes blindly.
// The existing queue revalidates approvals and deduplicates callback effects.
import {setTimeout as delay} from 'node:timers/promises';
import {TelegramApiError,safeTelegramError} from './telegram-bot-api.mjs';

export async function runTelegramPoller({identify,poll,continuous=false,wait=delay,log=()=>{},shouldStop=()=>false}={}){
  if(typeof identify!=='function'||typeof poll!=='function')throw Error('Poller callbacks required');
  let botId=null,failures=0,cycles=0;
  while(!shouldStop()){
    try{
      if(botId===null){botId=await identify();log({event:'telegram_identity_verified'});}
      const result=await poll(botId);cycles++;failures=0;
      log({event:'telegram_poll_completed',processed:result.processed});
      if(!continuous)return {cycles};
    }catch(error){
      if(!(error instanceof TelegramApiError)||!error.retryable||!continuous)throw error;
      failures=Math.min(failures+1,30);
      const waitMs=Math.max(Math.min(30000,1000*2**Math.min(failures-1,5)),(error.retryAfter??0)*1000);
      log({event:'telegram_retry_wait',...safeTelegramError(error),consecutiveFailures:failures,waitMs});
      if(shouldStop())break;
      await wait(waitMs);
    }
  }
  return {cycles,stopped:true};
}
