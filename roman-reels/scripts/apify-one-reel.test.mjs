import test from 'node:test';
import assert from 'node:assert/strict';
import {reelPlan, collectOneReel} from './apify-one-reel.mjs';
const url = 'https://www.instagram.com/reel/Dd-BrltxRS1/';

test('plan accepts only one HTTPS Reel and disables paid add-ons', () => {
  const plan = reelPlan(url + '?igsh=tracking');
  assert.equal(plan.reel_url, url);
  assert.equal(plan.max_total_charge_usd, 0.05);
  assert.deepEqual(plan.input.username, [url]);
  for (const key of ['includeSharesCount', 'includeTranscript', 'includeDownloadedVideo']) assert.equal(plan.input[key], false);
  for (const bad of ['https://www.instagram.com/profile/', 'https://example.com/reel/id/', 'http://instagram.com/reel/id/', 'https://user:password@instagram.com/reel/id/']) assert.throws(() => reelPlan(bad));
});

test('creation is impossible without explicit approval', async () => {
  await assert.rejects(collectOneReel(reelPlan(url), {token: 'test-token', fetchImpl: () => assert.fail('Paid request')}), /approval/);
});

test('one budget-capped POST, exact dataset match and sanitized output', async () => {
  const calls = [], saved = [];
  const responses = [
    {data: {id: 'testRun', status: 'RUNNING'}},
    {data: {id: 'testRun', status: 'SUCCEEDED', defaultDatasetId: 'testDataset', usageTotalUsd: 0.0036}},
    [{shortCode: 'Dd-BrltxRS1', ownerUsername: 'testauthor', caption: 'Test caption', likesCount: 5,
      videoPlayCount: 100, videoUrl: 'https://private-signed-url', latestComments: [{text: 'Exclude'}]}],
  ];
  const plan = {...reelPlan(url), actor: 'other-actor', max_total_charge_usd: 100, input: {username: ['other-profile']}};
  const result = await collectOneReel(plan, {token: 'test-token', approved: true, saveRun: data => saved.push(data), sleep: async () => {},
    fetchImpl: async (requestUrl, options) => {
      calls.push({requestUrl, options});
      return {ok: true, json: async () => responses.shift()};
    }});
  assert.equal(calls.filter(x => x.options.method === 'POST').length, 1);
  assert.ok(calls[0].requestUrl.includes('/actors/apify~instagram-reel-scraper/runs?maxTotalChargeUsd=0.05&timeout=120&restartOnError=false'));
  assert.deepEqual(JSON.parse(calls[0].options.body), reelPlan(url).input);
  assert.ok(calls.every(x => !x.requestUrl.includes('test-token') && x.options.redirect === 'error'));
  assert.equal(saved[0].run_id, 'testRun');
  assert.equal(result.owner_username, 'testauthor');
  assert.equal(result.views, null);
  assert.equal(result.plays, 100);
  assert.ok(!JSON.stringify(result).includes('private-signed-url'));
  assert.equal(result.latestComments, undefined);
});

test('ambiguous creation failure is not retried or echoed', async () => {
  let calls = 0;
  await assert.rejects(collectOneReel(reelPlan(url), {token: 'secret-token', approved: true,
    fetchImpl: async () => { calls++; throw Error('secret-token'); }}), error => {
      assert.ok(!error.message.includes('secret-token'));
      return true;
    });
  assert.equal(calls, 1);
});

test('different Reel output is rejected', async () => {
  const responses = [{data: {id: 'testRun', status: 'SUCCEEDED', defaultDatasetId: 'dataset'}}, [{shortCode: 'OtherReel'}]];
  await assert.rejects(collectOneReel(reelPlan(url), {token: 'test-token', approved: true,
    fetchImpl: async () => ({ok: true, json: async () => responses.shift()})}), /matching Reel/);
});
