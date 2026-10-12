// Google Drive OAuth for the Windows source uploader: installed-app loopback flow with PKCE, refresh token
// encrypted with Windows DPAPI (CurrentUser) outside Git. Tokens and client secrets are never printed or logged.
import {createHash, randomBytes} from 'node:crypto';
import {promises as fs} from 'node:fs';
import {spawn} from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import {AuthError} from './source-uploader.mjs';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function powershell(script, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {windowsHide: true});
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new AuthError('Windows DPAPI operation failed')));
    child.stdin.end(input);
  });
}
const DPAPI = 'Add-Type -AssemblyName System.Security; $s = [Console]::In.ReadToEnd();';
export const dpapi = {
  protect: text => powershell(`${DPAPI} [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($s), $null, 'CurrentUser'))`, text),
  unprotect: text => powershell(`${DPAPI} [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($s.Trim()), $null, 'CurrentUser')))`, text),
};

// OAuth client of type "Desktop app": a Google client JSON ({"installed": {...}}) or the existing local
// rclone remote [roman-drive]. Only client_id/client_secret are read; rclone's own token is not used.
export async function loadClient(file) {
  const text = await fs.readFile(file, 'utf8');
  if (file.endsWith('.json')) {
    const data = JSON.parse(text).installed;
    if (!data?.client_id || !data?.client_secret) throw new AuthError('Client JSON must be a Desktop app OAuth client');
    return {clientId: data.client_id, clientSecret: data.client_secret};
  }
  const section = text.split(/^\[/m).find(s => s.startsWith('roman-drive]')) || '';
  const value = key => (section.split(/\r?\n/).find(l => l.startsWith(`${key} `) || l.startsWith(`${key}=`)) || '').replace(/^[^=]*=\s*/, '').trim();
  if (!value('client_id') || !value('client_secret')) throw new AuthError('rclone remote roman-drive has no own OAuth client');
  return {clientId: value('client_id'), clientSecret: value('client_secret')};
}

export function tokenProvider({tokenFile, crypto = dpapi, fetchImpl = fetch, now = Date.now}) {
  let cached = null;
  return async function getToken({force = false} = {}) {
    if (cached && !force && cached.expiresAt - 60000 > now()) return cached.accessToken;
    let stored;
    try { stored = JSON.parse(await crypto.unprotect(await fs.readFile(tokenFile, 'utf8'))); }
    catch { throw new AuthError('No usable uploader authorization; run the auth command'); }
    let response;
    try {
      response = await fetchImpl(TOKEN_URL, {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({client_id: stored.clientId, client_secret: stored.clientSecret, refresh_token: stored.refreshToken, grant_type: 'refresh_token'})});
    } catch { throw new AuthError('Token refresh connection failed'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) throw new AuthError(`Token refresh refused (${response.status}${data.error ? ' ' + data.error : ''})`);
    cached = {accessToken: data.access_token, expiresAt: now() + (data.expires_in || 0) * 1000};
    return cached.accessToken;
  };
}

// One interactive login by the owner. Requests only the Drive scope; the browser opens on this laptop.
export async function login({client, tokenFile, crypto = dpapi, fetchImpl = fetch, open = url => spawn('cmd.exe', ['/c', 'start', '""', `"${url}"`], {windowsVerbatimArguments: true, windowsHide: true}), timeoutMs = 300000}) {
  const verifier = randomBytes(48).toString('base64url');
  const state = randomBytes(16).toString('hex');
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const redirect = `http://127.0.0.1:${server.address().port}/`;
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({client_id: client.clientId, redirect_uri: redirect,
    response_type: 'code', scope: DRIVE_SCOPE, access_type: 'offline', prompt: 'consent', state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'});
  try {
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new AuthError('Login timed out')), timeoutMs);
      server.on('request', (req, res) => {
        const params = new URL(req.url, redirect).searchParams;
        if (!params.has('state') && !params.has('error')) { res.writeHead(404).end(); return; }
        const ok = params.get('state') === state && params.get('code');
        res.writeHead(200, {'content-type': 'text/plain; charset=utf-8'}).end(ok ? 'Готово, окно можно закрыть.' : 'Вход не выполнен.');
        clearTimeout(timer);
        ok ? resolve(params.get('code')) : reject(new AuthError(`Login refused${params.get('error') ? ': ' + params.get('error') : ''}`));
      });
      open(url);
    });
    const response = await fetchImpl(TOKEN_URL, {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({code, client_id: client.clientId, client_secret: client.clientSecret, redirect_uri: redirect,
        grant_type: 'authorization_code', code_verifier: verifier})});
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.refresh_token) throw new AuthError(`Code exchange refused (${response.status}${data.error ? ' ' + data.error : ''})`);
    if (!String(data.scope || '').split(' ').includes(DRIVE_SCOPE)) throw new AuthError('Drive scope was not granted');
    await fs.mkdir(path.dirname(tokenFile), {recursive: true});
    await fs.writeFile(tokenFile, await crypto.protect(JSON.stringify({clientId: client.clientId, clientSecret: client.clientSecret,
      refreshToken: data.refresh_token, scope: data.scope, createdAt: new Date().toISOString()})));
    return {scope: data.scope};
  } finally { server.close(); }
}
