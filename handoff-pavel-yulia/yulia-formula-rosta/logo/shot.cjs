const {chromium}=require('playwright');(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:2000,height:300}});
for (const [c,n] of [['%23E3C186','Formula-rosta-logo-zoloto'],['%23024D2F','Formula-rosta-logo-zelenyi'],['%23FFFFFF','Formula-rosta-logo-belyi']]){
await p.goto('file://'+require('path').resolve('l.html')+'?c='+c);await p.waitForTimeout(500);
await (await p.$('#w')).screenshot({path:n+'.png',omitBackground:true});}
await b.close()})();
