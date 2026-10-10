// Real Playwright MCP protocol against our own synthetic site; no live accounts.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const [dependencyRoot,browserExecutable,outputDirectory]=process.argv.slice(2);
if(!dependencyRoot||!browserExecutable||!outputDirectory)throw Error('Usage: run-mcp-site-demo.mjs dependencyRoot browserExecutable outputDirectory');
const {Client}=await import(pathToFileURL(join(dependencyRoot,'node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js')));
const {StdioClientTransport}=await import(pathToFileURL(join(dependencyRoot,'node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js')));
const template=readFileSync(new URL('../research/mcp-site-check/demo-site.html',import.meta.url),'utf8');
const requests=[];
const server=createServer((req,res)=>{
 const fixed=req.url==='/fixed';let status=200,html;
 if(req.url==='/'||fixed)html=template.replace('{{LEAD_PATH}}',fixed?'/contact':'/missing-lead');
 else if(req.url==='/contact')html='<html lang="ru"><title>Контакты — учебный сайт</title><h1>Форма заявки доступна</h1><p>Учебная страница; данные не отправляются.</p></html>';
 else{status=404;html='<html lang="ru"><title>404 — учебный сайт</title><h1>404: Страница заявки не найдена</h1><p>Учебная ошибка, не сайт клиента.</p></html>';}
 requests.push({path:req.url,httpStatus:status});res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const output=resolve(outputDirectory);mkdirSync(output,{recursive:true});
const transport=new StdioClientTransport({command:process.execPath,args:[join(dependencyRoot,'node_modules/@playwright/mcp/cli.js'),
 '--headless','--isolated',...(process.env.MCP_DEMO_NO_SANDBOX==='true'?['--no-sandbox']:[]),'--executable-path',resolve(browserExecutable),'--output-dir',output,'--allowed-origins',origin],cwd:resolve('roman-reels'),env:{...process.env}});
const client=new Client({name:'roman-research-demo',version:'1.0.0'},{capabilities:{}});
const calls=[];
async function tool(name,args){
 const result=await client.callTool({name,arguments:args});calls.push(name);
 let text=result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
 const snapshotFile=text.match(/\[Snapshot\]\(([^)]+\.yml)\)/)?.[1];
 if(snapshotFile){
  const absolute=resolve('roman-reels',snapshotFile);
  if(!absolute.startsWith(output+'/'))throw Error('Snapshot outside bounded demo directory');
  text+='\n'+readFileSync(absolute,'utf8');
 }
 if(result.isError)throw Error(`MCP ${name} failed: ${text.slice(0,800)}`);return text;
}
try{
 await client.connect(transport);
 const list=await client.listTools();
 for(const name of ['browser_navigate','browser_click','browser_take_screenshot'])if(!list.tools.some(t=>t.name===name))throw Error('Required MCP tool unavailable: '+name);
 const findings=[];
 for(const [path,label,expected] of [['/','broken',404],['/fixed','fixed',200]]){
  const snapshot=await tool('browser_navigate',{url:origin+path});
  writeFileSync(join(output,label+'-before.txt'),snapshot);
  const ref=snapshot.match(/link "Оставить заявку" \[ref=([^\]]+)\]/)?.[1];
  if(!ref)throw Error('CTA missing from actual MCP accessibility snapshot');
  await tool('browser_take_screenshot',{type:'png',filename:join(output,label+'-before.png')});
  const clicked=await tool('browser_click',{element:'Оставить заявку',target:ref});
  writeFileSync(join(output,label+'-after.txt'),clicked);
  await tool('browser_take_screenshot',{type:'png',filename:join(output,label+'-after.png')});
  const target=label==='broken'?'/missing-lead':'/contact';
  const actual=requests.filter(r=>r.path===target).at(-1)?.httpStatus;
  if(actual!==expected||!clicked.includes(label==='broken'?'404':'Форма заявки доступна'))throw Error('Actual navigation does not match expected demo state');
  findings.push({fixture:label,button:'Оставить заявку',destination:target,httpStatus:actual,snapshotFile:label+'-after.txt',screenshotFile:label+'-after.png'});
 }
 const version=JSON.parse(readFileSync(join(dependencyRoot,'node_modules/@playwright/mcp/package.json'),'utf8')).version;
 const report={checkedAt:new Date().toISOString(),synthetic:true,realClientSiteTested:false,mcpPackage:'@playwright/mcp',mcpVersion:version,browserSandbox:process.env.MCP_DEMO_NO_SANDBOX!=='true',
  inputSha256:createHash('sha256').update(template).digest('hex'),method:'Actual MCP stdio tools; programmatic driver, not a connected Claude session',
  candidates:[findings[0]],findings,calls,generationCalls:0,limits:['Учебный сайт с намеренно сломанной ссылкой.','Claude Code здесь не запускался; его конфигурация проверена только по официальной документации.','Проверка не измеряет потерянные заявки, продажи или SEO-позиции.','Установка MCP сама по себе не создаёт ежедневное расписание.']};
 writeFileSync(join(output,'demo-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await client.close().catch(()=>{});await new Promise(r=>server.close(r));}
