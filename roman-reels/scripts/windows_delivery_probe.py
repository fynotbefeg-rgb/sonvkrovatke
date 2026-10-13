"""Manual serialized cloud probe. Only fixed fictional data; never reads bot approvals."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from drive_intake_client import DriveClient, DriveError
from importlib.util import spec_from_file_location, module_from_spec

spec=spec_from_file_location('publisher',Path(__file__).with_name('publish-windows-plan.py'))
publisher=module_from_spec(spec);spec.loader.exec_module(publisher)
PROBE=Path(__file__).with_name('windows-delivery-probe.mjs')
EMPTY=b'{"deliveryVersion":"1.0.0","status":"empty","generationAllowed":false,"renderAllowed":false}'

def node(script,args=(),input=None):
    result=subprocess.run(['node',str(script),*args],input=input,capture_output=True,timeout=20)
    publisher.require(result.returncode == 0,'Fictional probe validation failed')
    return result.stdout

def read_slot(client,file_id,folder_id,name,limit):
    before,etag=client.metadata(file_id)
    publisher.require(before.get('id') == file_id and before.get('name') == name and
        before.get('mimeType') == 'application/json' and not before.get('trashed') and folder_id in before.get('parents',[]) and
        0 < int(before.get('size',0)) <= limit,'Pinned probe slot identity mismatch')
    with tempfile.TemporaryDirectory() as directory:
        target=Path(directory)/'slot.json';client.download(file_id,target,limit);body=target.read_bytes()
    publisher.require(len(body) == int(before['size']) and
        hashlib.md5(body,usedforsecurity=False).hexdigest() == before.get('md5Checksum'),'Probe slot checksum mismatch')
    after,_=client.metadata(file_id)
    publisher.require(publisher.stable(before) == publisher.stable(after),'Probe slot changed while reading')
    return body,before,etag

def run_probe(client,file_id,folder_id,ack_id,action):
    publisher.require(action in ['inspect','publish_fixture','clear_acknowledged_fixture'],'Unknown probe action')
    import re
    publisher.require(all(isinstance(x,str) and re.fullmatch(r'[A-Za-z0-9_-]{10,100}',x) for x in [file_id,folder_id,ack_id]) and
        len({file_id,folder_id,ack_id}) == 3,'Separate pinned probe IDs required')
    folder,_=client.metadata(folder_id)
    publisher.require(folder.get('name') == '_windows-jobs' and folder.get('mimeType') == publisher.FOLDER and
        publisher.ASSETS in folder.get('parents',[]) and not folder.get('trashed'),'Probe folder mismatch')
    body,before,etag=read_slot(client,file_id,folder_id,'source-plan-v1.json',65536)
    info=json.loads(node(PROBE,['inspect'],body))  # refuses any real or modified plan, even with valid receipt
    ack,_,_=read_slot(client,ack_id,folder_id,'source-plan-ack-v1.json',4096)
    command="import {isAcknowledged,parseAckSlot} from './windows-plan-ack.mjs';let s='';for await(const c of process.stdin)s+=c;const x=JSON.parse(s);const a=Buffer.from(x.ack,'base64');parseAckSlot(a);console.log(JSON.stringify({matched:isAcknowledged(Buffer.from(x.body,'base64'),a)}));"
    result=subprocess.run(['node','--input-type=module','-e',command],cwd=PROBE.parent,
        input=json.dumps({'body':base64.b64encode(body).decode(),'ack':base64.b64encode(ack).decode()}).encode(),capture_output=True,timeout=20)
    publisher.require(result.returncode == 0,'Probe acknowledgement invalid')
    matched=json.loads(result.stdout)['matched']
    base={'generationAllowed':False,'uploadAllowed':False,'renderAllowed':False,'acknowledged':matched}
    if action == 'inspect':return {**base,'status':info['status'],'expired':info['expired']}
    if action == 'publish_fixture':
        # A matched receipt is left intact for inspection. Replays must not renew its exact envelope.
        if matched:return {**base,'status':'already_acknowledged'}
        if info['status'] != 'empty' and not info['expired']:return {**base,'status':'already_published'}
        current,_=client.metadata(file_id)
        publisher.require(publisher.stable(current) == publisher.stable(before),'Probe changed before publication')
        fresh=node(PROBE,['build'])
        published=publisher.publish(client,file_id,folder_id,fresh,single_writer=True,ack_file_id=ack_id)
        return {**base,'status':published['status']}
    if info['status'] == 'empty':return {**base,'status':'already_empty'}
    publisher.require(info['status'] != 'empty' and matched,'Only an exactly acknowledged fictional packet can be cleared')
    current,_=client.metadata(file_id)
    publisher.require(publisher.stable(current) == publisher.stable(before),'Probe changed before clearing')
    client.update_json_bytes(file_id,EMPTY,etag,single_writer=True)
    check,_,_=read_slot(client,file_id,folder_id,'source-plan-v1.json',65536)
    publisher.require(check == EMPTY,'Clear readback mismatch; inspect without blind retry')
    return {**base,'status':'cleared_fixture'}

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['inspect','publish_fixture','clear_acknowledged_fixture']);args=parser.parse_args()
    try:
        publisher.require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('ROMAN_DELIVERY_SINGLE_WRITER') == 'true' and
            os.environ.get('ROMAN_WINDOWS_DELIVERY_PROBE_APPROVED') == 'true','Explicit serialized cloud probe required')
        import re
        ids=[os.environ.get(key) for key in ['ROMAN_WINDOWS_DELIVERY_FILE_ID','ROMAN_WINDOWS_DELIVERY_FOLDER_ID','ROMAN_WINDOWS_DELIVERY_ACK_FILE_ID']]
        publisher.require(all(isinstance(x,str) and re.fullmatch(r'[A-Za-z0-9_-]{10,100}',x) for x in ids) and
            len(set(ids)) == 3,'Configure three separate pinned IDs before authentication')
        credential=os.environ.get('GDRIVE_SA_JSON');publisher.require(bool(credential),'Existing cloud Drive credential required')
        client=DriveClient.service_account(json.loads(credential),readonly=args.action == 'inspect')
        print(json.dumps(run_probe(client,*ids,args.action)))
    except (ValueError,DriveError,OSError,KeyError,TypeError,subprocess.SubprocessError):
        raise SystemExit('Probe not confirmed; inspect private configuration and slot state. No production executed.') from None
