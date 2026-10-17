// PKCE loopback OAuth for the Desktop client "roman-reels-gsc-readonly". Scope: webmasters.readonly only.
// Tokens are stored per Windows user with DPAPI outside Git. Nothing secret is printed or logged.
import {createHash,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
export const GSC_SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
export const GSC_ACCOUNT='fynotbefeg@gmail.com';
const AUTH='https://accounts.google.com/o/oauth2/v2/auth',TOKEN='https://oauth2.googleapis.com/token';
const ENTROPY='roman-reels-gsc-readonly-v1';
const b64u=b=>Buffer.from(b).toString('base64url');
// Private store location: LOCALAPPDATA must be set, absolute and outside any Git work tree. Checked before any folder or file is created.
export function gscDir(env=process.env) {
 const base=env.LOCALAPPDATA;
 if(typeof base!=='string'||!base.trim()||!isAbsolute(base))throw Error('Private GSC store requires an absolute LOCALAPPDATA');
 const dir=resolve(base,'RomanReels','gsc');
 for(let d=dir;;d=dirname(d)){
  if(existsSync(join(d,'.git')))throw Error('Private GSC store must live outside any Git work tree');
  if(dirname(d)===d)break;
 }
 return dir;
}
export const tokenPath=env=>join(gscDir(env),'token.dpapi');
export function newPkce() {
 const verifier=b64u(randomBytes(48));
 return {verifier,challenge:b64u(createHash('sha256').update(verifier).digest()),state:b64u(randomBytes(24))};
}
export function buildAuthUrl({clientId,redirectUri,challenge,state}) {
 const u=new URL(AUTH);
 for(const [k,v] of Object.entries({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:GSC_SCOPE,
  state,code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',prompt:'consent',login_hint:GSC_ACCOUNT}))
  u.searchParams.set(k,v);
 return u.toString();
}
const PS=op=>['-NoProfile','-NonInteractive','-Command',
 `Add-Type -AssemblyName System.Security;$e=[Text.Encoding]::UTF8.GetBytes('${ENTROPY}');$i=[Console]::In.ReadToEnd().Trim();`+
 (op==='p'?`[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($i),$e,'CurrentUser'))`:
  `[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($i),$e,'CurrentUser'))`)];
const dpapi=(op,input)=>{
 if(process.platform!=='win32')throw Error('DPAPI requires Windows');
 return execFileSync('powershell.exe',PS(op),{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','ignore']}).trim();
};
export const protect=text=>dpapi('p',text);
export const unprotect=blob=>dpapi('u',blob);
export function saveToken(record,env=process.env) {
 if(record.scope!==GSC_SCOPE)throw Error('scope');
 const dir=gscDir(env);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'token.dpapi'),protect(JSON.stringify(record)),{mode:0o600});
}
function loadClient(file) {
 const j=JSON.parse(readFileSync(file,'utf8')).installed;
 if(!j||!j.client_id||!j.client_secret)throw Error('client file');
 return {id:j.client_id,secret:j.client_secret};
}
async function tokenCall(body) {
 const r=await fetch(TOKEN,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams(body),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('token endpoint refused');
 return r.json();
}
// Provider for createGscReadOnlyClient: refreshes from the DPAPI refresh token; refuses any other scope.
export function createStoredTokenProvider({clientFile,now=Date.now}={}) {
 return async()=>{
  const rec=JSON.parse(unprotect(readFileSync(tokenPath(),'utf8')));
  if(rec.scope!==GSC_SCOPE)throw Error('scope');
  if(rec.accessToken&&rec.expiresAt>now()+60000)return {scope:GSC_SCOPE,accessToken:rec.accessToken,expiresAt:rec.expiresAt};
  const c=loadClient(clientFile),t=await tokenCall({client_id:c.id,client_secret:c.secret,grant_type:'refresh_token',refresh_token:rec.refreshToken});
  if(t.scope!==GSC_SCOPE||!t.access_token)throw Error('scope');
  const next={...rec,accessToken:t.access_token,expiresAt:now()+Number(t.expires_in)*1000};saveToken(next);
  return {scope:GSC_SCOPE,accessToken:next.accessToken,expiresAt:next.expiresAt};
 };
}
// State is checked first: a request with a foreign or missing state is answered 'invalid' and NEVER settles the wait,
// even when it carries error or code. Only a request with our state may deny or deliver the code.
export function waitForCallback({server,redirectUri,state,timeoutMs}) {
 return new Promise((resolveCode,reject)=>{
  const timer=setTimeout(()=>reject(Error('timeout')),timeoutMs);
  server.on('request',(req,res)=>{
   const q=new URL(req.url,redirectUri).searchParams;res.setHeader('Content-Type','text/plain; charset=utf-8');
   if(q.get('state')!==state){res.end('invalid');return;}
   if(q.get('error')){res.end('denied');clearTimeout(timer);reject(Error('denied'));return;}
   if(!q.get('code')){res.end('invalid');return;}
   res.end('Roman Reels: можно закрыть вкладку.');clearTimeout(timer);resolveCode(q.get('code'));
  });
 });
}
// CLI: starts the loopback listener and publishes ONLY the non-secret consent URL. The owner presses Allow.
export async function run({clientFile,timeoutMs=15*60*1000}={}) {
 const dir=gscDir(); // validate the private store before reading the client file, opening a port or creating anything
 const c=loadClient(clientFile),p=newPkce();
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const redirectUri=`http://127.0.0.1:${server.address().port}/`;
 const url=buildAuthUrl({clientId:c.id,redirectUri,challenge:p.challenge,state:p.state});
 mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'pending-consent-url.txt'),url);
 console.log('CONSENT_URL_READY');
 const code=await waitForCallback({server,redirectUri,state:p.state,timeoutMs}).finally(()=>server.close());
 const t=await tokenCall({client_id:c.id,client_secret:c.secret,code,code_verifier:p.verifier,grant_type:'authorization_code',redirect_uri:redirectUri});
 if(t.scope!==GSC_SCOPE||!t.refresh_token||!t.access_token)throw Error('unexpected scope or missing refresh token; nothing stored');
 saveToken({scope:GSC_SCOPE,refreshToken:t.refresh_token,accessToken:t.access_token,expiresAt:Date.now()+Number(t.expires_in)*1000,account:GSC_ACCOUNT});
 console.log('TOKEN_STORED_DPAPI');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const clientFile=process.argv[2];
 if(!clientFile||!existsSync(clientFile)){console.error('usage: node gsc-oauth-loopback.mjs <client_secret.json>');process.exit(2);}
 run({clientFile}).catch(e=>{console.error('OAuth stopped:',e.message);process.exit(1);});
}
