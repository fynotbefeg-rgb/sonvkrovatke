import test from 'node:test';
import assert from 'node:assert/strict';
import {checkApifyAccess} from './check-apify-access.mjs';

test('access check only reads the fixed account endpoint with bearer auth', async () => {
  let calls = 0;
  const result = await checkApifyAccess(' local-test-token ', async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.apify.com/v2/users/me');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'Bearer local-test-token');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body, undefined);
    assert.ok(options.signal);
    return {ok: true, status: 200, json: async () => ({data: {id: 'test-user', email: 'private@example.test'}})};
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, {ok: true, actor_runs_started: 0});
});

test('missing and unsafe tokens fail before making any request', async () => {
  for (const token of [undefined, '', ' ', 'token\nheader']) {
    await assert.rejects(checkApifyAccess(token, () => assert.fail('Unexpected request')), /APIFY_TOKEN/);
  }
});

test('API and network failures do not echo response bodies or credentials', async () => {
  const token = 'private-test-token';
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(checkApifyAccess(token, async () => ({ok: false, status,
      text: () => assert.fail('Must not log API error body')})), error => {
      assert.ok(error.message.includes(String(status)));
      assert.ok(!error.message.includes(token));
      return true;
    });
  }
  await assert.rejects(checkApifyAccess(token, async () => { throw Error(token); }), error => !error.message.includes(token));
});

test('malformed account responses fail closed', async () => {
  await assert.rejects(checkApifyAccess('test-token', async () => ({ok: true, json: async () => { throw Error('private data'); }})), /not JSON/);
  await assert.rejects(checkApifyAccess('test-token', async () => ({ok: true, json: async () => ({data: {}})})), /Unexpected/);
});
