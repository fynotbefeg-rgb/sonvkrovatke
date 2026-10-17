// Owned loopback-only teaching fixture. Defects are deliberately seeded.
import {createServer} from 'node:http';
export const paths = ['/', '/services', '/pricing', '/contact'];
export async function startSeoFixture(broken) {
  const titles = ['Учебная мастерская', 'Услуги автоматизации', 'Учебные цены', 'Контакты'];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture.invalid');
    const origin = `http://127.0.0.1:${server.address().port}`;
    if (req.method !== 'GET') {res.writeHead(405); res.end(); return;}
    if (url.pathname === '/robots.txt') {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end(`User-agent: *\nDisallow: ${broken ? '/services' : ''}\nSitemap: ${origin}/sitemap.xml\n`); return;
    }
    if (url.pathname === '/sitemap.xml') {
      const entries = broken ? ['/', '/pricing', '/contact', '/gone'] : paths;
      res.writeHead(200, {'Content-Type': 'application/xml'});
      res.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(p => `<url><loc>${origin}${p}</loc></url>`).join('')}</urlset>`); return;
    }
    if (url.pathname === '/old-services') {
      res.writeHead(broken ? 302 : 301, {Location: broken ? '/' : '/services'}); res.end(); return;
    }
    const index = paths.indexOf(url.pathname);
    if (index < 0) {
      // Existing gone sitemap URL really 404; unknown requested URL is soft-404 in broken state.
      res.writeHead(broken && url.pathname === '/missing-test-page' ? 200 : 404, {'Content-Type':'text/html; charset=utf-8'});
      res.end('<!doctype html><html lang="ru"><title>Не найдено</title><h1>Страница не найдена</h1></html>'); return;
    }
    const title = broken && index === 1 ? titles[0] : titles[index];
    const canonical = broken && index === 1 ? '/' : paths[index];
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${title}</title><meta name="robots" content="${broken && index === 0 ? 'noindex' : 'index,follow'}">
      ${broken && index === 1 ? '' : `<meta name="description" content="${titles[index]}: вымышленная учебная страница, не предложение услуг.">`}
      <link rel="canonical" href="${origin}${canonical}"><style>body{font:20px Arial;max-width:900px;margin:30px auto;padding:20px;background:#f5f7fc;color:#17213b}nav{display:flex;gap:15px;flex-wrap:wrap}</style></head>
      <body><p>УЧЕБНЫЙ САЙТ: СПЕЦИАЛЬНО ЗАЛОЖЕННЫЕ SEO-ОШИБКИ</p>
      <nav>${paths.map((p,i)=>`<a href="${p}">${titles[i]}</a>`).join('')}</nav>
      <h1>${titles[index]}</h1>${broken && index === 0 ? '<h1>Второй основной заголовок</h1>' : ''}
      <p>Демонстрация автоматического сбора технических данных. Не клиентский сайт.</p></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
