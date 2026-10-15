// Private Windows Gemini setup. No API calls or changes to process/user environment.
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {dpapi} from './source-uploader-auth.mjs';
import {ledgerSummary} from './gemini-bounded-client.mjs';

const fail = () => { throw new Error('Private Gemini configuration unavailable or invalid'); };
const exact = (x, keys) => x && !Array.isArray(x) && Object.keys(x).sort().join(',') === [...keys].sort().join(',');
export function validateGeminiConfig(x) {
  if (!exact(x, ['configVersion','apiKey','projectName','quotaTierReported']) || x.configVersion !== '1.0.0' ||
      typeof x.apiKey !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(x.apiKey) ||
      typeof x.projectName !== 'string' || !x.projectName.trim() || x.projectName.length > 200 ||
      /[\r\n\x00]/.test(x.projectName) || x.quotaTierReported !== 'Free') fail();
  return x;
}
export function geminiPaths(localAppData) {
  if (!localAppData || !path.isAbsolute(localAppData)) fail();
  const home = path.join(localAppData,'RomanReels','gemini');
  return {home, config:path.join(home,'config.dpapi'), marker:path.join(home,'gemini-ledger-store.json'), ledger:path.join(home,'gemini-ledger.json')};
}
export async function loadGeminiConfig(file, {crypto=dpapi}={}) {
  try {
    const stat=await fs.stat(file); if (!stat.isFile() || stat.size<1 || stat.size>16384) fail();
    return validateGeminiConfig(JSON.parse(await crypto.unprotect(await fs.readFile(file,'utf8'))));
  } catch { fail(); }
}
const MARKER={storeVersion:'1.0.0',purpose:'roman-gemini-weekly-budget'};
async function createOrVerify(file, value, valid) {
  try {
    const handle=await fs.open(file,'wx',0o600);
    try { await handle.writeFile(JSON.stringify(value,null,2)+'\n'); await handle.sync(); }
    finally { await handle.close(); }
  } catch(error) {
    if(error.code!=='EEXIST') throw error;
    if(!valid(JSON.parse(await fs.readFile(file,'utf8')))) throw new Error('Existing Gemini store refused; nothing overwritten');
  }
}
export async function assertStoreLocation(home) {
  const resolved=path.resolve(home), temp=path.resolve(tmpdir());
  const inside=(parent,child)=>{const rel=path.relative(parent,child);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
  if(inside(temp,resolved)) throw new Error('Persistent Gemini store cannot live in a temporary folder');
  // Walk real parent paths too: do not accept an apparent external path pointing into a Git tree.
  const actual=await fs.realpath(resolved);
  if(inside(temp,actual)) throw new Error('Persistent Gemini store cannot resolve into a temporary folder');
  for(let d=actual;;d=path.dirname(d)) {
    try {await fs.lstat(path.join(d,'.git'));throw new Error('Gemini store must live outside Git');}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(path.dirname(d)===d)break;
  }
}
export async function initializeGeminiStore(paths, {checkLocation=assertStoreLocation}={}) {
  await fs.mkdir(paths.home,{recursive:true,mode:0o700});
  await checkLocation(paths.home);
  await createOrVerify(paths.marker,MARKER,x=>exact(x,['storeVersion','purpose'])&&x.storeVersion===MARKER.storeVersion&&x.purpose===MARKER.purpose);
  // Validate an existing ledger BEFORE any attempt to create; never reset counters on rerun.
  try {await fs.lstat(paths.ledger);await ledgerSummary(paths.ledger);}
  catch(error){if(error.code!=='ENOENT')throw error;}
  await createOrVerify(paths.ledger,{ledgerVersion:'1.0.0',requests:[]},()=>true);
  return ledgerSummary(paths.ledger);
}
export async function checkGeminiStore(paths) {
  await assertStoreLocation(paths.home);
  const marker=JSON.parse(await fs.readFile(paths.marker,'utf8'));
  if(!exact(marker,['storeVersion','purpose'])||marker.storeVersion!==MARKER.storeVersion||marker.purpose!==MARKER.purpose)throw new Error('Gemini store marker invalid');
  await fs.stat(paths.ledger); // Missing journal is a setup error, not a new weekly allowance.
  return ledgerSummary(paths.ledger);
}
