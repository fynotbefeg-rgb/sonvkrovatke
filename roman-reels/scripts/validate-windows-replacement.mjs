// Internal bounded validator. Keeps exact envelope bytes; emits no scripts or IDs.
import {parseDelivery, MAX_DELIVERY_BYTES} from './windows-plan-delivery.mjs';
import {mayReplaceDelivery, MAX_ACK_BYTES} from './windows-plan-ack.mjs';

try {
  let input = Buffer.alloc(0);
  for await (const chunk of process.stdin) {
    input = Buffer.concat([input, chunk]);
    if (input.length > 190000) throw Error('size');
  }
  const request = JSON.parse(input.toString('utf8'));
  if (!request || Object.keys(request).sort().join(',') !== 'ack,current,next') throw Error('fields');
  function decode(value, max) {
    if (typeof value !== 'string') throw Error('type');
    const bytes = Buffer.from(value, 'base64');
    if (!bytes.length || bytes.length > max || bytes.toString('base64') !== value) throw Error('encoding');
    return bytes;
  }
  const currentBytes = decode(request.current, MAX_DELIVERY_BYTES);
  const nextBytes = decode(request.next, MAX_DELIVERY_BYTES);
  const ackBytes = request.ack === null ? null : decode(request.ack, MAX_ACK_BYTES);
  // An expired outstanding delivery must remain inspectable, never silently cleared.
  const old = JSON.parse(currentBytes.toString('utf8'));
  if (old.status === 'empty') parseDelivery(currentBytes);
  else {
    if (!Number.isSafeInteger(old.issuedAt) || old.issuedAt > Date.now()) throw Error('clock');
    parseDelivery(currentBytes, {now: old.issuedAt});
  }
  parseDelivery(nextBytes);
  const decision = mayReplaceDelivery({currentBytes, ackBytes, nextBytes});
  if (!decision.allowed) throw Error('outstanding');
  console.log(JSON.stringify({allowed: true, reason: decision.reason, generationAllowed: false, renderAllowed: false}));
} catch {
  console.error('Replacement not confirmed; no data published.');
  process.exitCode = 1;
}
