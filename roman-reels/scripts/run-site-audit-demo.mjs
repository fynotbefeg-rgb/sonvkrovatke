// Saved browser scenarios against our synthetic site, not a Claude/AI audit.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {startFixture} from '../research/mcp-site-audit-current/fixture-site.mjs';

const [dependencyRoot, executablePath, outputPath] = process.argv.slice(2);
if (!dependencyRoot || !executablePath || !outputPath) throw Error('Usage: run-site-audit-demo.mjs dependencyRoot executablePath freshOutputDirectory');
const output = resolve(outputPath);
if (existsSync(output)) throw Error('Fresh output directory required; do not overwrite evidence');
const {chromium} = await import(pathToFileURL(join(resolve(dependencyRoot), 'node_modules/playwright-core/index.mjs')));
const sandbox = process.env.SITE_AUDIT_DEMO_NO_SANDBOX !== 'true';
const browser = await chromium.launch({executablePath: resolve(executablePath), headless: true, chromiumSandbox: sandbox});
mkdirSync(output, {recursive: true});

const scenarios = [
  {id: 'pages', requirement: 'Все четыре ожидаемые страницы доступны', async run(page, fixture) {
    const observed = [];
    for (const route of ['/', '/services', '/pricing', '/contact']) {
      const response = await page.goto(fixture.origin + route);
      observed.push({route, httpStatus: response.status()});
    }
    return {observed, pass: observed.every(r => r.httpStatus === 200)};
  }},
  {id: 'image', requirement: 'Иллюстрация главной страницы загружена', async run(page, fixture) {
    await page.goto(fixture.origin);
    const observed = await page.locator('img').evaluate(img => ({loaded: img.complete && img.naturalWidth > 0, path: new URL(img.src).pathname}));
    return {observed, pass: observed.loaded};
  }},
  {id: 'desktop-navigation', requirement: 'По ссылке меню открываются услуги', async run(page, fixture) {
    await page.goto(fixture.origin);
    await page.getByRole('link', {name: 'Услуги', exact: true}).click();
    const observed = {path: new URL(page.url()).pathname, heading: await page.locator('h1').innerText()};
    return {observed, pass: observed.path === '/services' && observed.heading === 'Услуги'};
  }},
  {id: 'mobile-menu', mobile: true, requirement: 'Мобильное меню раскрывается и позволяет открыть заявку', async run(page, fixture) {
    await page.goto(fixture.origin);
    await page.getByRole('button', {name: 'Меню', exact: true}).click();
    const visible = await page.getByRole('link', {name: 'Заявка', exact: true}).isVisible();
    if (visible) await page.getByRole('link', {name: 'Заявка', exact: true}).click();
    const observed = {menuVisible: visible, path: new URL(page.url()).pathname};
    return {observed, pass: visible && observed.path === '/contact'};
  }},
  {id: 'mobile-layout', mobile: true, requirement: 'На главной нет горизонтального переполнения при ширине 390', async run(page, fixture) {
    await page.goto(fixture.origin);
    const observed = await page.evaluate(() => ({viewport: innerWidth, contentWidth: document.documentElement.scrollWidth}));
    return {observed, pass: observed.contentWidth <= observed.viewport};
  }},
  ...['empty', 'invalid-email'].map(id => ({id, requirement: id === 'empty' ? 'Пустая форма не отправляется' : 'Некорректный email не отправляется', async run(page, fixture) {
    await page.goto(fixture.origin + '/contact?case=' + id);
    if (id === 'invalid-email') {
      await page.getByRole('textbox', {name: 'Имя', exact: true}).fill('Учебный клиент');
      await page.getByRole('textbox', {name: 'Email', exact: true}).fill('not-an-email');
    }
    const browserValid = await page.locator('form').evaluate(form => form.checkValidity());
    if (browserValid) await submit(page);
    else await page.getByRole('button', {name: 'Отправить учебную заявку'}).click();
    const observed = {browserValid, requestsToReceiver: fixture.state.attempts.length};
    return {observed, pass: !browserValid && observed.requestsToReceiver === 0};
  }})),
  {id: 'delivery', requirement: 'Заявка действительно появилась в учебном приёмнике', async run(page, fixture) {
    await fill(page, fixture, 'delivery'); await submit(page);
    const observed = {successNotice: await page.getByRole('status').innerText(), receiverRecords: structuredClone(fixture.state.records)};
    return {observed, pass: observed.receiverRecords.length === 1 && observed.receiverRecords[0].email === 'demo@fixture.example' && observed.receiverRecords[0].caseId === 'delivery'};
  }},
  {id: 'duplicate', requirement: 'Повтор той же заявки не создаёт вторую запись', async run(page, fixture) {
    await fill(page, fixture, 'duplicate'); await submit(page); await submit(page);
    const observed = {requestsToReceiver: fixture.state.attempts.length, receiverRecords: structuredClone(fixture.state.records)};
    return {observed, pass: observed.requestsToReceiver === 2 && observed.receiverRecords.length === 1 && observed.receiverRecords[0].caseId === 'duplicate'};
  }},
];

async function fill(page, fixture, id) {
  await page.goto(fixture.origin + '/contact?case=' + id);
  await page.getByRole('textbox', {name: 'Имя', exact: true}).fill('Учебный клиент');
  await page.getByRole('textbox', {name: 'Email', exact: true}).fill('demo@fixture.example');
}
async function submit(page) {
  await Promise.all([page.waitForResponse(response => new URL(response.url()).pathname === '/api/leads'),
    page.getByRole('button', {name: 'Отправить учебную заявку'}).click()]);
  await page.getByRole('status').filter({hasText: 'Учебная заявка принята'}).waitFor();
}

const variants = [];
try {
  for (const variant of ['broken', 'fixed']) {
    const fixture = await startFixture(variant === 'broken');
    const checks = [];
    try {
      for (const scenario of scenarios) {
        fixture.state.records.length = 0; fixture.state.attempts.length = 0;
        const viewport = scenario.mobile ? {width: 390, height: 844} : {width: 1280, height: 800};
        const context = await browser.newContext({viewport});
        await context.route('**/*', route => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
        const page = await context.newPage(); page.setDefaultTimeout(5000);
        const consoleErrors = [], networkErrors = [];
        page.on('pageerror', error => consoleErrors.push(error.message));
        page.on('response', response => {if (response.status() >= 400) networkErrors.push({path: new URL(response.url()).pathname, status: response.status()});});
        const screenshot = `${variant}-${scenario.id}.png`;
        let result;
        try {
          const finding = await scenario.run(page, fixture);
          result = {id: scenario.id, expected: scenario.requirement, status: finding.pass ? 'PASS' : 'FAIL', observed: finding.observed};
        } catch (error) {
          result = {id: scenario.id, expected: scenario.requirement, status: 'BLOCKED', error: error.message.slice(0,1200)};
        }
        await page.screenshot({path: join(output, screenshot), fullPage: true});
        checks.push({...result, viewport, screenshot, consoleErrors, networkErrors});
        await context.close();
      }
    } finally {await fixture.close();}
    variants.push({variant, checks, pass: checks.filter(c => c.status === 'PASS').length,
      fail: checks.filter(c => c.status === 'FAIL').length, blocked: checks.filter(c => c.status === 'BLOCKED').length});
  }
} finally {await browser.close();}

const version = JSON.parse(readFileSync(join(resolve(dependencyRoot), 'node_modules/playwright-core/package.json'))).version;
const hashes = {};
for (const name of ['../research/mcp-site-audit-current/fixture-site.mjs', './run-site-audit-demo.mjs'])
  hashes[name] = createHash('sha256').update(readFileSync(new URL(name, import.meta.url))).digest('hex');
const report = {checkedAt: new Date().toISOString(), synthetic: true, driver: 'Saved, manually authored Playwright browser scenarios',
  playwrightVersion: version, browserVersion: browser.version(), browserSandbox: sandbox, modelCalls: 0,
  claudeSessionTested: false, mcpProtocolUsed: false, onePromptAuditTested: false, productionReady: false,
  inputHashes: hashes, variants,
  coverage: {expectedPages: ['/', '/services', '/pricing', '/contact'], savedScenarios: scenarios.map(s => s.id),
    notTested: ['real CRM/email', 'live phone', 'SEO', 'security', 'performance', 'accessibility audit', 'Firefox/WebKit', 'authenticated roles', 'all possible states']},
  limitations: ['Synthetic seeded site, not a client audit.', 'Known scenarios were authored by Codex; no autonomous discovery or model-generated tests.',
    'Mobile viewport emulation, not an iPhone.', 'Receipt verified in an in-memory local receiver, not persistent external CRM.',
    'No CI scheduler or Test Agents/healer run.', 'Disabled browser sandbox only if explicit local-demo opt-in; do not reuse for real sites.']};
writeFileSync(join(output, 'audit-report.json'), JSON.stringify(report, null, 2) + '\n');
// Success means the regression suite distinguishes known defects, not that broken site passed.
assert.equal(variants[0].blocked, 0); assert.equal(variants[0].fail, 8); assert.equal(variants[0].pass, 1);
assert.equal(variants[1].blocked, 0); assert.equal(variants[1].fail, 0); assert.equal(variants[1].pass, 9);
console.log(JSON.stringify({output, broken: {pass: variants[0].pass, fail: variants[0].fail}, fixed: {pass: variants[1].pass, fail: variants[1].fail}, modelCalls: 0}));
