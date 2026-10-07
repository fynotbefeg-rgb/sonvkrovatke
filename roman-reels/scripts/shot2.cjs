const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', proxy: { server: process.env.HTTPS_PROXY } });
  const ctx = await b.newContext({ ...devices['iPhone 14 Pro Max'], deviceScaleFactor: 2.5, locale: 'en-US' });
  const pg = await ctx.newPage();
  await pg.route('**/*', async (r) => { try { await r.fulfill({ response: await r.fetch() }); } catch (e) { await r.abort(); } });
  const closeCookies = async () => { for (const t of ['Accept All Cookies', 'Accept all', 'Accept']) { const x = pg.getByRole('button', { name: t }); if (await x.count()) { await x.first().click().catch(()=>{}); break; } } };
  await pg.goto('https://claude.com/programs/startups', { waitUntil: 'networkidle', timeout: 60000 });
  await pg.waitForTimeout(2000); await closeCookies();
  for (const q of ['Who can apply?', 'Do I need VC funding to apply?', 'How long does an application review take?']) {
    const el = pg.getByText(q, { exact: true }).first();
    await el.scrollIntoViewIfNeeded(); await el.click().catch(()=>{}); await pg.waitForTimeout(700);
  }
  const who = pg.getByText('Who can apply?', { exact: true }).first();
  await who.scrollIntoViewIfNeeded(); await pg.waitForTimeout(500);
  await pg.screenshot({ path: 'webshot/faq.png', fullPage: true });
  const bb = await who.boundingBox(); const sy = await pg.evaluate(() => window.scrollY);
  console.log('who_y', bb.y + sy);
  const rv = pg.getByText('How long does an application review take?', { exact: true }).first();
  const bb2 = await rv.boundingBox(); console.log('review_y', bb2.y + await pg.evaluate(() => window.scrollY));
  const ans = await pg.evaluate(() => document.body.innerText.match(/Who can apply\?[\s\S]{0,600}/)?.[0]);
  console.log(ans);
  await pg.goto('https://www.anthropic.com/supported-countries', { waitUntil: 'networkidle', timeout: 60000 });
  await pg.waitForTimeout(1500); await closeCookies();
  for (const c of ['Georgia', 'Kazakhstan', 'Russia', 'Belarus']) {
    const n = await pg.getByText(c, { exact: true }).count();
    let y = null; if (n) { const e = pg.getByText(c, { exact: true }).first(); await e.scrollIntoViewIfNeeded(); const bb = await e.boundingBox(); y = bb.y + await pg.evaluate(() => window.scrollY); }
    console.log('country', c, n, y);
  }
  await b.close();
})();
