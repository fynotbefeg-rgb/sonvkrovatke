import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const dir=process.env.RESEARCH_DIRECTORY;
if(existsSync(dir)) for(const name of readdirSync(dir).filter(n=>/^(run|result)-\d+\.json$/.test(n))) {
  const data=JSON.parse(readFileSync(join(dir,name),'utf8'));
  if(name.startsWith('run-')) {console.log('RUN_STATUS '+JSON.stringify(data));continue;}
  for(const item of data.items) {
    // Exclude CDN URLs and all signed query strings from logs.
    let video=null;
    if(typeof item.downloadedVideo==='string') {
      const url=new URL(item.downloadedVideo);
      if(url.origin==='https://api.apify.com'&&/^\/v2\/key-value-stores\/[A-Za-z0-9]+\/records\//.test(url.pathname))video=url.origin+url.pathname;
    }
    const safe={shortcode:item.shortcode,owner:item.owner,plays:item.plays,likes:item.likes,
      comments:item.comments,duration:item.duration,transcript:item.transcript,downloadedVideo:video};
    const encoded=Buffer.from(JSON.stringify(safe)).toString('base64');
    for(let n=0;n<encoded.length;n+=2000)console.log(`DETAIL_PART ${item.shortcode} ${n/2000} ${encoded.slice(n,n+2000)}`);
  }
}
