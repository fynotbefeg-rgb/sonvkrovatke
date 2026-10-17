// Fixed fictional packet only. No production text or runtime secrets accepted.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {deliveryPlan} from './testing/delivery-fixture.mjs';
import {buildDelivery, parseDelivery, MAX_DELIVERY_BYTES} from './windows-plan-delivery.mjs';

export function probePlan() {
  const plan = deliveryPlan();
  for (const job of plan.jobs) job.localPath = path.win32.join('C:\\RomanReels\\transport-test-only', `${job.role}.mp4`);
  return plan;
}

export function inspectProbe(bytes, now = Date.now()) {
  if (!bytes.length || bytes.length > MAX_DELIVERY_BYTES) throw Error('size');
  const raw = JSON.parse(bytes.toString('utf8'));
  const data = raw.status === 'empty' ? parseDelivery(bytes, {now}) : parseDelivery(bytes, {now: raw.issuedAt});
  if (data.status !== 'empty' && (data.issuedAt > now || JSON.stringify(data.payload) !== JSON.stringify(probePlan())))
    throw Error('Not the fixed fictional probe');
  return {status: data.status, deliveryId: data.deliveryId ?? null, expired: data.status !== 'empty' && now >= data.expiresAt,
    generationAllowed: false, uploadAllowed: false, renderAllowed: false};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const mode = process.argv[2];
    if (process.argv.length !== 3 || !['build','inspect'].includes(mode)) throw Error('mode');
    if (mode === 'build') process.stdout.write(buildDelivery(probePlan(), {ttlMs: 900000}));
    else {
      let bytes = Buffer.alloc(0);
      for await (const chunk of process.stdin) {
        bytes = Buffer.concat([bytes, chunk]);
        if (bytes.length > MAX_DELIVERY_BYTES) throw Error('size');
      }
      console.log(JSON.stringify(inspectProbe(bytes)));
    }
  } catch { console.error('Fictional delivery probe rejected.'); process.exitCode = 1; }
}
