#!/usr/bin/env node
// Exactly one read-only account request. No Actors, tasks, datasets or paid runs.
import {pathToFileURL} from 'node:url';

export async function checkApifyAccess(token, fetchImpl = fetch) {
  if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) throw Error('Missing or invalid APIFY_TOKEN');
  let response;
  try {
    response = await fetchImpl('https://api.apify.com/v2/users/me', {
      method: 'GET', headers: {Authorization: `Bearer ${token.trim()}`},
      redirect: 'error', signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw Error('Apify account check failed: connection, timeout or redirect error');
  }
  if (response.status === 401 || response.status === 403) throw Error(`Apify rejected access (HTTP ${response.status}); check token permissions`);
  if (!response.ok) throw Error(`Apify account check failed (HTTP ${response.status}); no Actors started`);
  let payload;
  try { payload = await response.json(); } catch { throw Error('Apify account response was not JSON'); }
  if (!payload || typeof payload.data?.id !== 'string' || !payload.data.id) throw Error('Unexpected Apify account response');
  return {ok: true, actor_runs_started: 0};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkApifyAccess(process.env.APIFY_TOKEN);
    console.log('Apify account access verified. No Actors started.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
