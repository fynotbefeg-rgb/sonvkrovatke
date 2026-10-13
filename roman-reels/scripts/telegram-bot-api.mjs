// Authenticated Bot API long polling only; this is NOT an HTTP webhook handler.
const verified=new WeakSet();
export const isVerifiedTelegramUpdate=update=>!!update&&verified.has(update);
export function telegramApi({token,fetchImpl=fetch}={}) {
  if(typeof token!=='string'||!/^\d{5,16}:[A-Za-z0-9_-]{20,200}$/.test(token))throw Error('Private bot token required');
  async function call(method,body) {
    try {
      const response=await fetchImpl(`https://api.telegram.org/bot${token}/${method}`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
        redirect:'error',signal:AbortSignal.timeout(45000)});
      if(!response.ok||!response.body)throw Error();
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>1048576)throw Error();chunks.push(chunk);}
      const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(value.ok!==true||!Object.hasOwn(value,'result'))throw Error();
      return value.result;
    }catch{throw Error('Telegram request failed; no automatic network retry');}
  }
  return {
    async identity(expectedUsername){const bot=await call('getMe',{});if(bot?.is_bot!==true||!Number.isSafeInteger(bot.id)||bot.id<=0||
      (expectedUsername!==undefined&&bot.username!==expectedUsername))throw Error('Invalid bot identity');return String(bot.id);},
    async updates(offset){
      if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid update offset');
      const data=await call('getUpdates',{offset,limit:20,timeout:20,allowed_updates:['message','callback_query']});
      if(!Array.isArray(data)||data.length>20||data.some((u,i)=>!u||!Number.isSafeInteger(u.update_id)||u.update_id<offset||u.update_id>=Number.MAX_SAFE_INTEGER||(i&&u.update_id<=data[i-1].update_id)))throw Error('Invalid Telegram batch');
      data.forEach(u=>verified.add(u));return data;
    },
    async send(chatId,text,reply_markup){
      if(!Number.isSafeInteger(chatId)||chatId<=0||typeof text!=='string'||text.length>4000)throw Error('Invalid panel message');
      return call('sendMessage',{chat_id:chatId,text,...(reply_markup?{reply_markup}:{}),disable_web_page_preview:true});
    },
    async answer(id){if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw Error('Invalid callback ID');return call('answerCallbackQuery',{callback_query_id:id});}
  };
}
