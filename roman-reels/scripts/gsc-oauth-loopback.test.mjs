import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,rm,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {newPkce,buildAuthUrl,GSC_SCOPE,protect,unprotect,gscDir,saveToken,waitForCallback} from './gsc-oauth-loopback.mjs';
test('PKCE S256 challenge matches verifier; state is unique',()=>{
 const a=newPkce(),b=newPkce();
 assert.equal(a.challenge,createHash('sha256').update(a.verifier).digest('base64url'));
 assert.ok(a.verifier.length>=43);assert.notEqual(a.state,b.state);
});
test('consent URL requests only webmasters.readonly with S256 and loopback redirect',()=>{
 const u=new URL(buildAuthUrl({clientId:'cid',redirectUri:'http://127.0.0.1:5555/',challenge:'ch',state:'st'}));
 assert.equal(u.searchParams.get('scope'),GSC_SCOPE);assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 assert.equal(u.searchParams.get('redirect_uri'),'http://127.0.0.1:5555/');assert.equal(u.searchParams.get('response_type'),'code');
 assert.ok(!u.search.includes('client_secret')&&!u.search.includes('drive'));
});
test('DPAPI round trip hides plaintext (Windows only)',{skip:process.platform!=='win32'},()=>{
 const blob=protect('FAKE_PRIVATE_TOKEN');assert.ok(!blob.includes('FAKE_PRIVATE_TOKEN'));
 assert.equal(unprotect(blob),'FAKE_PRIVATE_TOKEN');
});
test('private store: missing, blank or relative LOCALAPPDATA and any Git work tree are refused before anything is created',async x=>{
 const root=await mkdtemp(path.join(tmpdir(),'rr-gsc-'));x.after(()=>rm(root,{recursive:true,force:true}));
 for(const bad of [undefined,'',' ','relative/dir','.\here'])assert.throws(()=>gscDir({LOCALAPPDATA:bad}),/absolute LOCALAPPDATA/);
 assert.throws(()=>gscDir({}),/absolute LOCALAPPDATA/);
 const repo=path.join(root,'repo');await mkdir(path.join(repo,'.git'),{recursive:true});await mkdir(path.join(repo,'sub'));
 for(const base of [repo,path.join(repo,'sub'),path.join(repo,'not-created-yet')])assert.throws(()=>gscDir({LOCALAPPDATA:base}),/outside any Git work tree/);
 assert.throws(()=>saveToken({scope:GSC_SCOPE,refreshToken:'FAKE'},{LOCALAPPDATA:path.join(repo,'sub')}),/Git work tree/);
 assert.throws(()=>saveToken({scope:GSC_SCOPE,refreshToken:'FAKE'},{LOCALAPPDATA:'relative'}),/absolute LOCALAPPDATA/);
 assert.deepEqual((await readdir(repo)).sort(),['.git','sub','not-created-yet'].filter(n=>n!=='not-created-yet').sort());
 assert.deepEqual(await readdir(path.join(repo,'sub')),[]);
 const ok=await mkdtemp(path.join(tmpdir(),'rr-gsc-ok-'));x.after(()=>rm(ok,{recursive:true,force:true}));
 assert.equal(gscDir({LOCALAPPDATA:ok}),path.join(ok,'RomanReels','gsc'));assert.deepEqual(await readdir(ok),[]);
});
async function callbackHarness(x,state='STATE_OK') {
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));x.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port+'/';
 const outcome={};const wait=waitForCallback({server,redirectUri:base,state,timeoutMs:20000}).then(v=>{outcome.code=v;},e=>{outcome.error=e.message;});
 const hit=async q=>(await fetch(base+'?'+q)).text();
 const settled=async()=>{await new Promise(r=>setTimeout(r,30));return 'code' in outcome||'error' in outcome;};
 return {hit,wait,outcome,settled};
}
test('OAuth callback: foreign or missing state never settles the wait, even with error or code',async x=>{
 const h=await callbackHarness(x);
 for(const q of ['state=EVIL&error=access_denied','error=access_denied','state=EVIL&code=STOLEN','code=NOSTATE','state=STATE_OK','state=STATE_OK&code=']){
  assert.equal(await h.hit(q),'invalid');assert.equal(await h.settled(),false,q);
 }
 assert.notEqual(await h.hit('state=STATE_OK&code=REAL_CODE'),'invalid');await h.wait;
 assert.equal(h.outcome.code,'REAL_CODE');
});
test('OAuth callback: only a request with our state can deny',async x=>{
 const h=await callbackHarness(x);
 assert.equal(await h.hit('state=EVIL&error=access_denied'),'invalid');assert.equal(await h.settled(),false);
 assert.equal(await h.hit('state=STATE_OK&error=access_denied'),'denied');await h.wait;
 assert.equal(h.outcome.error,'denied');assert.ok(!('code' in h.outcome));
});
