// Authenticated Bot API long polling only; this is NOT an HTTP webhook handler.
const verified=new WeakSet();
export const isVerifiedTelegramUpdate=update=>!!update&&verified.has(update);
const methods=['getMe','getUpdates','sendMessage','answerCallbackQuery'];
const kinds=['network','rate_limit','rate_limit_deferred','server_error','auth_failed','access_denied','conflict','invalid_request','protocol'];
const networkCodes=['ENOTFOUND','EAI_AGAIN','ECONNRESET','ETIMEDOUT','ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','ABORT_ERR'];
export class TelegramApiError extends Error {
  constructor(kind,{method,status,retryAfter,networkCode}={}){
    super('Telegram request failed');this.name='TelegramApiError';
    this.kind=kinds.includes(kind)?kind:'protocol';
    this.method=methods.includes(method)?method:'unknown';
    this.status=Number.isInteger(status)&&status>=100&&status<=599?status:null;
    this.retryAfter=Number.isInteger(retryAfter)&&retryAfter>=1&&retryAfter<=300?retryAfter:null;
    this.networkCode=networkCodes.includes(networkCode)?networkCode:'unknown';
    this.retryable=['network','rate_limit','server_error'].includes(this.kind);
  }
}
export function safeTelegramError(error){
  if(!(error instanceof TelegramApiError))return {kind:'configuration_or_state',retryable:false};
  return {kind:kinds.includes(error.kind)?error.kind:'protocol',method:methods.includes(error.method)?error.method:'unknown',
    status:Number.isInteger(error.status)&&error.status>=100&&error.status<=599?error.status:null,
    networkCode:networkCodes.includes(error.networkCode)?error.networkCode:'unknown',retryable:error.retryable===true};
}
function httpError(status,method,retryAfter){
  if(status===429&&retryAfter!==undefined&&(!Number.isInteger(retryAfter)||retryAfter<1))return new TelegramApiError('protocol',{status,method});
  if(status===429&&Number.isInteger(retryAfter)&&retryAfter>300)return new TelegramApiError('rate_limit_deferred',{status,method});
  const kind=status===429?'rate_limit':[500,502,503,504].includes(status)?'server_error':
    status===401?'auth_failed':status===403?'access_denied':status===409?'conflict':'invalid_request';
  return new TelegramApiError(kind,{status,method,retryAfter:kind==='rate_limit'?(retryAfter??30):retryAfter});
}
export function telegramApi({token,fetchImpl=fetch}={}) {
  if(typeof token!=='string'||!/^\d{5,16}:[A-Za-z0-9_-]{20,200}$/.test(token))throw Error('Private bot token required');
  async function call(method,body) {
    let response;
    try {
      response=await fetchImpl(`https://api.telegram.org/bot${token}/${method}`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
        redirect:'error',signal:AbortSignal.timeout(45000)});
    }catch(error){throw new TelegramApiError('network',{method,networkCode:error?.cause?.code??error?.code});}
    if(!response.body)throw response.ok?new TelegramApiError('protocol',{method}):httpError(response.status,method);
    const chunks=[];let size=0;
    try{for await(const chunk of response.body){size+=chunk.length;if(size>1048576)throw new TelegramApiError('protocol',{method});chunks.push(chunk);}}
    catch(error){if(error instanceof TelegramApiError)throw error;throw new TelegramApiError('network',{method,networkCode:error?.cause?.code??error?.code});}
    let value;
    try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    catch{throw response.ok?new TelegramApiError('protocol',{method}):httpError(response.status,method);}
    if(!response.ok||value?.ok!==true){
      const status=response.ok?value?.error_code:response.status;
      // Telegram callback acknowledgements expire sooner than stored updates.
      // This is only the spinner acknowledgement, never a queue/approval bypass.
      if(method==='answerCallbackQuery'&&status===400&&value?.description===
        'Bad Request: query is too old and response timeout expired or query ID is invalid')return false;
      throw httpError(status,method,value?.parameters?.retry_after);
    }
    if(!Object.hasOwn(value,'result'))throw new TelegramApiError('protocol',{method});
    return value.result;
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
