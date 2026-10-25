// Synthetic multi-page site. Only loopback; no accounts, payments or outbound calls.
import {createServer} from 'node:http';

export async function startFixture(broken) {
  const state = {records: [], attempts: []};
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture.invalid');
    if (req.method === 'POST' && url.pathname === '/api/leads') {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 4096) break; }
      let data;
      try { data = JSON.parse(raw); } catch { res.writeHead(400); res.end(); return; }
      state.attempts.push(data);
      if (!broken && (!data.name?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || ''))) {
        res.writeHead(400, {'Content-Type': 'application/json'}); res.end('{"ok":false}'); return;
      }
      // Seeded defect: the delivery case shows success but is silently discarded.
      if (!(broken && data.caseId === 'delivery')) {
        if (broken || !state.records.some(r => r.caseId === data.caseId)) state.records.push(data);
      }
      res.writeHead(200, {'Content-Type': 'application/json'}); res.end('{"ok":true}'); return;
    }
    if (url.pathname === '/hero.svg') {
      res.writeHead(200, {'Content-Type': 'image/svg+xml'});
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#4157d9"/><text x="25" y="60" fill="white" font-size="25">DEMO: automation</text></svg>'); return;
    }
    const routes = {'/': 'Учебная мастерская', '/services': 'Услуги', '/pricing': 'Учебные цены', '/contact': 'Учебная заявка'};
    const title = routes[url.pathname];
    const status = title && !(broken && url.pathname === '/pricing') ? 200 : 404;
    res.writeHead(status, {'Content-Type': 'text/html; charset=utf-8'});
    if (status === 404) { res.end('<html lang="ru"><h1>404 — учебная ошибка</h1></html>'); return; }
    res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
      <style>body{font:18px Arial;margin:0;color:#17213b;background:#f5f7fc}main,header{padding:24px;max-width:900px;margin:auto}
      nav{display:flex;gap:18px}a{color:#253da5}img{max-width:100%}input,button{font:inherit;padding:12px;margin:8px 0}
      form{display:flex;flex-direction:column;max-width:500px}#menu{display:none}#panel{padding:16px;background:white}
      @media(max-width:600px){#menu{display:block}nav{display:none}nav.open{display:flex;flex-direction:column}
      #panel{${broken ? 'width:640px' : 'max-width:100%;box-sizing:border-box'}}}</style></head><body>
      <header><p>УЧЕБНЫЙ САЙТ — ВСЕ ДАННЫЕ ВЫМЫШЛЕНЫ</p><button id="menu" aria-expanded="false">Меню</button>
      <nav aria-label="Основная навигация"><a href="/">Главная</a><a href="/services">Услуги</a><a href="/pricing">Цены</a><a href="/contact">Заявка</a></nav></header>
      <main><h1>${title}</h1><div id="panel"><p>Проверяем страницы, мобильное меню и доставку учебной заявки.</p></div>
      ${url.pathname === '/' ? `<img alt="Учебная иллюстрация" src="${broken ? '/missing-hero.svg' : '/hero.svg'}">` : ''}
      ${url.pathname === '/contact' ? `<form><label>Имя<input name="name" ${broken ? '' : 'required'}></label>
      <label>Email<input name="email" type="${broken ? 'text' : 'email'}" ${broken ? '' : 'required'}></label>
      <button type="submit">Отправить учебную заявку</button></form><p id="result" role="status"></p>` : ''}
      </main><script>
      document.querySelector('#menu').onclick=()=>{${broken ? '/* seeded: no action */' : `const n=document.querySelector('nav');n.classList.toggle('open');document.querySelector('#menu').setAttribute('aria-expanded',String(n.classList.contains('open')));`}};
      const form=document.querySelector('form');if(form)form.onsubmit=async e=>{e.preventDefault();
        const data={name:form.elements.name.value,email:form.elements.email.value,caseId:new URLSearchParams(location.search).get('case')||'fixture'};
        const response=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
        document.querySelector('#result').textContent=response.ok?'Учебная заявка принята':'Ошибка';};
      </script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {origin: `http://127.0.0.1:${server.address().port}`, state,
    close: () => new Promise(resolve => server.close(resolve))};
}
