// Read-only, synthetic fixture report. No model, crawling or site modifications.
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const guidance={
 'page-status':'Проверить маршруты и ответы указанных страниц; затем повторить HTTP-проверку.',
 'robots-crawl':'Если учебная /services должна быть открыта для обхода, убрать её запрет и повторить проверку robots.txt. Это не подтверждает индексацию.',
 'index-directives':'Для страниц, которые в этом стенде должны быть открыты для индексации, снять noindex и повторить проверку директив. Попадание в Google этим не гарантируется.',
 'sitemap':'В учебной карте перечислить ожидаемые канонические страницы, исключить отсутствующие URL; проверить их HTTP-ответы.',
 'page-titles':'По требованиям этого стенда задать непустые разные title; повторно проверить значения.',
 'descriptions':'По учебному чек-листу добавить описания; проверить наличие. Это не гарантия ранжирования.',
 'canonicals':'В этом стенде разные самостоятельные страницы должны ссылаться canonical на себя; проверить адреса. Не переносить правило на дубликаты без анализа.',
 'heading-structure':'Проверить заголовки по требованиям этого стенда; число H1 само по себе не доказывает SEO-ошибку на любом сайте.',
 'legacy-redirect':'Настроить ожидаемый редирект учебного старого URL и перепроверить статус и Location.',
 'missing-status':'Отсутствующий учебный URL должен возвращать 404; после правки повторить запрос.'
};
const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function evidenceReport(report) {
 if(report?.synthetic!==true||report.modelCalls!==0||!Array.isArray(report.variants)||report.variants.length!==2)throw Error('Expected the two-state synthetic scanner fixture only');
 if(new Set(report.variants.map(v=>v.variant)).size!==2||!report.variants.every(v=>['broken','fixed'].includes(v.variant)))throw Error('Missing or duplicate fixture state');
 const sections=report.variants.map(v=>{
  const checks=v.checks;
  if(!Array.isArray(checks)||checks.length!==10||new Set(checks.map(c=>c.id)).size!==10||checks.some(c=>!Object.hasOwn(guidance,c.id)||!['PASS','FAIL'].includes(c.status)||typeof c.expected!=='string'||!Object.hasOwn(c,'observed')))throw Error('Incomplete or unsupported evidence checks');
  const pass=checks.filter(c=>c.status==='PASS').length,fail=checks.length-pass;
  if(v.pass!==pass||v.fail!==fail)throw Error('Summary disagrees with actual check statuses');
  return `<section><h2>${v.variant==='broken'?'До: учебные ошибки':'После: заранее исправленный стенд'}</h2><p>Проверок без замечаний: ${pass}. С замечаниями: ${fail}.</p>`+checks.map(c=>`<article><h3>${escape(c.id)} — ${c.status==='PASS'?'Проверка пройдена':'Нужна проверка/правка'}</h3><p>${escape(c.expected)}</p><details><summary>Наблюдение</summary><pre>${escape(JSON.stringify(c.observed,null,2))}</pre></details><p>${c.status==='FAIL'?'Предлагаемый шаг: '+escape(guidance[c.id]):'Замечаний по этой проверке нет; это не результат полного аудита.'}</p></article>`).join('')+'</section>';
 }).join('');
 return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Учебная техническая SEO-проверка</title><style>body{max-width:850px;margin:24px auto;padding:0 16px;font:17px/1.5 system-ui;color:#172033}article{border:1px solid #ccd4df;border-radius:10px;padding:12px;margin:12px 0}h3{font-size:18px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}aside{background:#fff3d5;padding:14px;border-radius:10px}</style><h1>Учебная техническая SEO-проверка</h1><aside>Вымышленный сайт. Статусы рассчитаны скриптом по ограниченному чек-листу. Два состояния подготовлены заранее; ИИ не исправлял сайт. Фактическая индексация Google, трафик, позиции, скорость и полный аудит не измерены. Предложения ниже не выполнялись автоматически.</aside>${sections}<p>Данные наблюдения: ${escape(report.checkedAt)}. Без вызовов модели или платных API.</p></html>`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: input-audit-report.json NEW-output.html');
 const bytes=readFileSync(input);if(bytes.length>2*1024*1024)throw Error('Input too large');
 writeFileSync(output,evidenceReport(JSON.parse(bytes)),{flag:'wx'});console.log('Saved synthetic evidence report. No model calls, approvals or writes to services.');
}
