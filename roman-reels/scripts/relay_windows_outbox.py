"""Serialized cloud relay: pinned outbox slot -> existing mailbox publisher, after a fresh Node approval decision.

Python only moves verified Drive bytes. It never builds or forwards an approval queue: the decision, including the
fresh authenticated readApprovedQueue call, happens inside relay-windows-outbox.mjs. Data transport only.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from importlib.util import spec_from_file_location, module_from_spec

from drive_intake_client import DriveClient, DriveError

spec=spec_from_file_location('publisher',Path(__file__).with_name('publish-windows-plan.py'))
publisher=module_from_spec(spec);spec.loader.exec_module(publisher)
DECIDER=Path(__file__).with_name('relay-windows-outbox.mjs')
FLAGS={'generationAllowed':False,'uploadAllowed':False,'renderAllowed':False}
NAMES={'mailbox':'source-plan-v1.json','ack':'source-plan-ack-v1.json','outbox':'source-plan-outbox-v1.json'}
LIMITS={'mailbox':65536,'ack':4096,'outbox':65536}


def read_pinned(client,file_id,folder_id,kind):
    before,_=client.metadata(file_id)
    publisher.require(before.get('id') == file_id and before.get('name') == NAMES[kind] and
        before.get('mimeType') == 'application/json' and not before.get('trashed') and folder_id in before.get('parents',[]) and
        0 < int(before.get('size',0)) <= LIMITS[kind],'Pinned relay slot identity mismatch')
    with tempfile.TemporaryDirectory() as directory:
        target=Path(directory)/'slot.json';client.download(file_id,target,LIMITS[kind]);body=target.read_bytes()
    publisher.require(len(body) == int(before['size']) and
        hashlib.md5(body,usedforsecurity=False).hexdigest() == before.get('md5Checksum'),'Relay slot checksum mismatch')
    after,_=client.metadata(file_id)
    publisher.require(publisher.stable(before) == publisher.stable(after),'Relay slot changed while reading')
    return body,before


def node_decide(outbox,mailbox,ack):
    payload=json.dumps({k:base64.b64encode(v).decode() for k,v in {'outbox':outbox,'mailbox':mailbox,'ack':ack}.items()}).encode()
    result=subprocess.run(['node',str(DECIDER)],input=payload,capture_output=True,timeout=60)
    publisher.require(result.returncode == 0,'Relay decision not confirmed')
    return json.loads(result.stdout)


def relay(client,mailbox_id,folder_id,ack_id,outbox_id,decide=node_decide):
    ids=[mailbox_id,folder_id,ack_id,outbox_id]
    publisher.require(all(isinstance(x,str) and re.fullmatch(r'[A-Za-z0-9_-]{10,100}',x) for x in ids) and len(set(ids)) == 4,
        'Four separate pinned relay IDs required')
    folder,_=client.metadata(folder_id)
    publisher.require(folder.get('name') == '_windows-jobs' and folder.get('mimeType') == publisher.FOLDER and
        publisher.ASSETS in folder.get('parents',[]) and not folder.get('trashed'),'Relay folder mismatch')
    outbox,outbox_meta=read_pinned(client,outbox_id,folder_id,'outbox')
    mailbox,mailbox_meta=read_pinned(client,mailbox_id,folder_id,'mailbox')
    ack,ack_meta=read_pinned(client,ack_id,folder_id,'ack')
    decision=decide(outbox,mailbox,ack)
    publisher.require(isinstance(decision,dict) and decision.get('generationAllowed') is False and decision.get('renderAllowed') is False,
        'Relay decision invalid')
    if decision.get('status') != 'publish':
        return {**FLAGS,'status':decision.get('status'),'reason':decision.get('reason')}
    publisher.require(decision.get('outboxSha256') == hashlib.sha256(outbox).hexdigest(),'Relay decision is for different bytes')
    # Source bytes must be unchanged right before the single serialized write.
    for file_id,meta in [(outbox_id,outbox_meta),(mailbox_id,mailbox_meta),(ack_id,ack_meta)]:
        current,_=client.metadata(file_id)
        publisher.require(publisher.stable(current) == publisher.stable(meta),'Relay source changed before publication')
    result=publisher.publish(client,mailbox_id,folder_id,outbox,single_writer=True,ack_file_id=ack_id)
    return {**FLAGS,'status':result['status'],'reason':decision.get('reason')}


if __name__ == '__main__':
    try:
        publisher.require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('ROMAN_DELIVERY_SINGLE_WRITER') == 'true' and
            os.environ.get('ROMAN_WINDOWS_OUTBOX_RELAY_APPROVED') == 'true','Explicit serialized cloud relay required')
        ids=[os.environ.get(k) for k in ['ROMAN_WINDOWS_DELIVERY_FILE_ID','ROMAN_WINDOWS_DELIVERY_FOLDER_ID',
                                         'ROMAN_WINDOWS_DELIVERY_ACK_FILE_ID','ROMAN_WINDOWS_OUTBOX_FILE_ID']]
        publisher.require(all(isinstance(x,str) and re.fullmatch(r'[A-Za-z0-9_-]{10,100}',x) for x in ids) and len(set(ids)) == 4,
            'Configure four separate pinned IDs before authentication')
        publisher.require(bool(os.environ.get('ROMAN_REELS_WEBHOOK_URL')) and bool(os.environ.get('ROMAN_REELS_WEBHOOK_TOKEN')),
            'Existing protected approval reader configuration required')
        credential=os.environ.get('GDRIVE_SA_JSON');publisher.require(bool(credential),'Existing cloud Drive credential required')
        client=DriveClient.service_account(json.loads(credential))
        print(json.dumps(relay(client,*ids)))
    except (ValueError,DriveError,OSError,KeyError,TypeError,subprocess.SubprocessError) as error:
        text=str(error)
        if isinstance(error,DriveError):reason=f'drive_http_{error.status}' if error.status else 'drive_error'
        elif type(error) is ValueError and text.isascii() and len(text) <= 120 and not re.search(r'[A-Za-z0-9_-]{20,}',text):reason=text
        else:reason=type(error).__name__
        print(json.dumps({'status':'relay_not_confirmed','reason':reason,**FLAGS}))
        raise SystemExit('Relay not confirmed; inspect private configuration and slot state. No production executed.') from None
