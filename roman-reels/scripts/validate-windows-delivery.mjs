// Internal bounded stdin validator; prints metadata only, not client speech.
import {parseDelivery,MAX_DELIVERY_BYTES} from './windows-plan-delivery.mjs';
try {
  let bytes=Buffer.alloc(0);
  for await(const chunk of process.stdin){
    bytes=Buffer.concat([bytes,chunk]);
    if(bytes.length>MAX_DELIVERY_BYTES)throw Error('size');
  }
  const data=parseDelivery(bytes);
  console.log(JSON.stringify({status:data.status,deliveryId:data.deliveryId??null,
    generationAllowed:false,renderAllowed:false}));
} catch {console.error('Invalid staging-only delivery; no data published.');process.exitCode=1;}
