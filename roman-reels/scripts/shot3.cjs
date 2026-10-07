const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', proxy: { server: process.env.HTTPS_PROXY } });
  const ctx = await b.newContext({ ...devices['iPhone 14 Pro Max'], deviceScaleFactor: 2.5, locale: 'en-US' });
  const pg = await ctx.newPage();
  await pg.route('**/*', async (r) => { try { await r.fulfill({ response: await r.fetch() }); } catch (e) { await r.abort(); } });
  await pg.goto('https://claude.com/programs/startups', { waitUntil: 'networkidle', timeout: 60000 });
  await pg.waitForTimeout(2000);
  for (const t of ['Accept All Cookies', 'Accept all', 'Accept']) { const x = pg.getByRole('button', { name: t }); if (await x.count()) { await x.first().click().catch(()=>{}); break; } }
  const shots = [['Who can apply?', 'faq_who'], ['Do I need VC funding to apply?', 'faq_vc'], ['How long does an application review take?', 'faq_review']];
  for (const [q, f] of shots) {
    const el = pg.getByText(q, { exact: true }).first();
    await el.scrollIntoViewIfNeeded(); await el.click(); await pg.waitForTimeout(900);
    await pg.evaluate((y) => window.scrollTo(0, y), (await el.boundingBox()).y + await pg.evaluate(() => window.scrollY) - 120);
    await pg.waitForTimeout(500);
    await pg.screenshot({ path: `webshot/${f}.png` });
    await el.click(); await pg.waitForTimeout(600);
  }
  await b.close();
})();
