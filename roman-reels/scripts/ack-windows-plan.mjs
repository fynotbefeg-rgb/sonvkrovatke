#!/usr/bin/env node
// One bounded poll: stage the delivery (as receive-windows-plan.mjs) and, only after the whole package is
// saved and re-verified, write the receipt acknowledgement. Never invokes the uploader, HeyGen or rendering.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {tokenProvider} from './source-uploader-auth.mjs';
import {driveClient} from './source-uploader.mjs';
import {acknowledgeDelivery} from './windows-plan-ack.mjs';

async function main() {
  if (process.argv.length !== 2) throw new Error('This command takes no arguments; uses explicit local mailbox/ack config');
  if (!process.env.LOCALAPPDATA && !process.env.ROMAN_UPLOADER_HOME) throw new Error('Windows runtime home required');
  const home = process.env.ROMAN_UPLOADER_HOME || path.join(process.env.LOCALAPPDATA, 'RomanReels', 'source-uploader');
  const config = async name => {
    const raw = await readFile(path.join(home, name));
    if (raw.length > 4096) throw new Error('Config too large');
    return JSON.parse(raw.toString('utf8'));
  };
  const drive = driveClient({getToken: tokenProvider({tokenFile: path.join(home, 'oauth-token.dpapi')})});
  const result = await acknowledgeDelivery({drive, config: await config('delivery-config.json'), ackConfig: await config('delivery-ack-config.json'),
    inbox: path.join(home, 'received-plans'), ackStore: path.join(home, 'delivery-acks')});
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error('Delivery not acknowledged; check local mailbox/ack configuration, auth and integrity. No jobs executed.'); process.exitCode = 1; });
