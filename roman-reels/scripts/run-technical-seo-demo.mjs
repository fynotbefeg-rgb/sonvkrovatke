// Bounded fixture checks, not a general crawler, Googlebot or autonomous AI audit.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {startSeoFixture,paths} from '../research/site-technical-seo/fixture-site.mjs';
const [dependencyRoot,executablePath,outputPath]=process.argv.slice(2);
if(!dependencyRoot||!executablePath||!outputPath)throw Error('Usage: dependencyRoot chromiumExecutable freshOutputDirectory');
const output=resolve(outputPath);
if(existsSync(output))throw Error('Fresh output directory required; evidence must not be overwritten');
const {chromium}=await import(pathToFileURL(join(resolve(dependencyRoot),'node_modules/playwright-core/index.mjs')));
const sandbox=process.env.SITE_AUDIT_DEMO_NO_SANDBOX!=='true';
const browser=await chromium.launch({executablePath:resolve(executablePath),headless:true,chromiumSandbox:sandbox});
mkdirSync(output,{recursive:true});
const variants=[];
try {
  for(const variant of ['broken','fixed']) {
    const fixture=await startSeoFixture(variant==='broken');
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    await context.route('**/*',route=>new URL(route.request().url()).origin===fixture.origin?route.continue():route.abort());
    try {
      const page=await context.newPage();page.setDefaultTimeout(5000);
      const pages=[];
      for(const path of paths){
        const response=await page.goto(fixture.origin+path);
        const values=await page.evaluate(()=>({title:document.title,
          description:document.querySelector('meta[name="description"]')?.content||'',
          robots:document.querySelector('meta[name="robots"]')?.content||'',
          canonical:document.querySelector('link[rel="canonical"]')?.href||'',h1Count:document.querySelectorAll('h1').length}));
        await page.screenshot({path:join(output,`${variant}-${path==='/'?'home':path.slice(1)}.png`),fullPage:true});
        pages.push({path,httpStatus:response.status(),...values});
      }
      // Request targets are fixed, local and controlled, never taken from an untrusted site.
      const robots=await context.request.get(fixture.origin+'/robots.txt');
      const robotsText=await robots.text();
      const sitemap=await context.request.get(fixture.origin+'/sitemap.xml');
      const sitemapText=await sitemap.text();
      const entries=[...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
      const sitemapStatuses=[];
      for(const target of entries){
        if(new URL(target).origin!==fixture.origin)throw Error('Off-origin sitemap refused');
        const response=await context.request.get(target);
        sitemapStatuses.push({path:new URL(target).pathname,status:response.status()});
      }
      const redirect=await context.request.get(fixture.origin+'/old-services',{maxRedirects:0});
      const missing=await context.request.get(fixture.origin+'/missing-test-page');
      const checks=[];
      const check=(id,priority,expected,observed,pass)=>checks.push({id,priority,expected,observed,status:pass?'PASS':'FAIL'});
      check('page-status','P1','Четыре заявленные страницы возвращают 200',pages.map(p=>({path:p.path,status:p.httpStatus})),pages.every(p=>p.httpStatus===200));
      // Literal directive check only; do not generalize this into a full RFC robots parser.
      check('robots-crawl','P1','Учебная коммерческая /services не закрыта от обхода',robotsText,robots.status()===200&&!/^Disallow:\s*\/services\s*$/mi.test(robotsText));
      check('index-directives','P1','На ожидаемых открытых страницах отсутствует noindex',pages.map(p=>({path:p.path,robots:p.robots})),pages.every(p=>!/(?:^|,)\s*(noindex|none)\s*(?:,|$)/i.test(p.robots)));
      check('sitemap','P2','Все 4 ожидаемые канонические страницы перечислены, записи возвращают 200',sitemapStatuses,sitemap.status()===200&&paths.every(p=>sitemapStatuses.some(e=>e.path===p))&&sitemapStatuses.every(e=>e.status===200));
      check('page-titles','P2','Непустые разные title по согласованному учебному требованию',pages.map(p=>({path:p.path,title:p.title})),pages.every(p=>p.title.trim())&&new Set(pages.map(p=>p.title)).size===paths.length);
      check('descriptions','P3','Описания заданы на всех страницах по учебному чек-листу',pages.map(p=>({path:p.path,description:p.description})),pages.every(p=>p.description.trim()));
      check('canonicals','P1','В этой модели каждая отличающаяся страница указывает на себя',pages.map(p=>({path:p.path,canonicalPath:new URL(p.canonical).pathname})),pages.every(p=>p.canonical===fixture.origin+p.path));
      check('heading-structure','P3','Один основной заголовок по договорённости для этого сайта',pages.map(p=>({path:p.path,h1Count:p.h1Count})),pages.every(p=>p.h1Count===1));
      check('legacy-redirect','P2','Постоянный переезд /old-services → /services: 301 или 308', {status:redirect.status(),location:redirect.headers().location},[301,308].includes(redirect.status())&&redirect.headers().location==='/services');
      check('missing-status','P2','Заведомо отсутствующая страница возвращает 404, не 200',{status:missing.status()},missing.status()===404);
      variants.push({variant,pages,checks,pass:checks.filter(c=>c.status==='PASS').length,fail:checks.filter(c=>c.status==='FAIL').length});
    }finally{await context.close();await fixture.close();}
  }
}finally{await browser.close();}
const inputHashes={};
for(const name of ['./run-technical-seo-demo.mjs','../research/site-technical-seo/fixture-site.mjs'])inputHashes[name]=createHash('sha256').update(readFileSync(new URL(name,import.meta.url))).digest('hex');
const report={checkedAt:new Date().toISOString(),synthetic:true,modelCalls:0,driver:'Manually authored bounded Playwright/HTTP checks',
  browserVersion:browser.version(),browserSandbox:sandbox,inputHashes,variants,
  productionReady:false,onePromptAuditTested:false,googleIndexVerified:false,
  limitations:['Four known synthetic URLs; not a general production crawler or all website states.',
    'robots is a literal fixture rule check; Googlebot groups, wildcard matching and X-Robots-Tag not implemented.',
    'noindex and canonical presence do not establish actual Google indexing or selected canonical.',
    'Title, description and H1 requirements are fixture-specific quality rules, not guarantees of ranking penalties.',
    'Sitemap is a discovery hint, not a guarantee; synthetic XML parser not for arbitrary input.',
    'Speed, field Core Web Vitals, Search Console, content strategy, backlinks, security and real CRM not measured.',
    'Local-demo sandbox opt-out only for this controlled loopback site.']};
writeFileSync(join(output,'audit-report.json'),JSON.stringify(report,null,2)+'\n');
assert.equal(variants[0].pass,1);assert.equal(variants[0].fail,9);
assert.equal(variants[1].pass,10);assert.equal(variants[1].fail,0);
console.log(JSON.stringify({output,broken:{pass:1,fail:9},fixed:{pass:10,fail:0},modelCalls:0}));
