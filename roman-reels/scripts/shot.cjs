const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', proxy: { server: process.env.HTTPS_PROXY } });
  const ctx = await b.newContext({ ...devices['iPhone 14 Pro Max'], deviceScaleFactor: 2.5, locale: 'en-US' });
  const pg = await ctx.newPage();
  // запросы идут через Node (проверка TLS по CA-бандлу среды), браузер получает уже проверенные ответы
  await pg.route('**/*', async (r) => { try { const resp = await r.fetch(); await r.fulfill({ response: resp }); } catch (e) { await r.abort(); } });
  for (const [u, f] of [['https://claude.com/programs/startups', 'startups'], ['https://www.anthropic.com/supported-countries', 'countries']]) {
    try {
      await pg.goto(u, { waitUntil: 'networkidle', timeout: 60000 });
      await pg.waitForTimeout(2500);
      // закрыть баннер cookies, если есть
      for (const t of ['Accept All Cookies', 'Accept all', 'Accept', 'Reject All Cookies']) {
        const btn = pg.getByRole('button', { name: t }); if (await btn.count()) { await btn.first().click().catch(()=>{}); break; }
      }
      await pg.waitForTimeout(800);
      await pg.screenshot({ path: `webshot/${f}.png`, fullPage: true });
      console.log('ok', f, await pg.title());
    } catch (e) { console.log('fail', f, e.message.slice(0, 200)); }
  }
  await b.close();
})();
