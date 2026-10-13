"""One pre-created user-owned Drive mailbox, one trusted cloud writer.

This is data delivery only, never avatar/render execution or approval authority.
No file creation, no overwriting a different outstanding plan, no blind write retry.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

from drive_intake_client import DriveClient, DriveError

MAX_BYTES = 65536
FOLDER = 'application/vnd.google-apps.folder'
ASSETS = '1bLzHi6K1HxXesmRj_dhghCsWk5spcPuf'
VALIDATOR = Path(__file__).with_name('validate-windows-delivery.mjs')


def require(ok, message):
    if not ok: raise ValueError(message)


def validated(bytes_):
    require(0 < len(bytes_) <= MAX_BYTES, 'Delivery exceeds byte cap')
    reply = subprocess.run(['node', str(VALIDATOR)], input=bytes_, capture_output=True, timeout=20)
    require(reply.returncode == 0, 'Staging-only delivery failed validation')
    return json.loads(reply.stdout), json.loads(bytes_)


def stable(file):
    return {k:file.get(k) for k in ['id','name','mimeType','parents','size','md5Checksum','version','trashed']}


def publish(client, file_id, folder_id, bytes_, single_writer=False):
    require(single_writer is True, 'Explicit serialized cloud writer required')
    require(all(isinstance(x,str) and re.fullmatch(r'[A-Za-z0-9_-]{10,100}',x) for x in [file_id,folder_id]), 'Pinned mailbox IDs required')
    new_meta, new = validated(bytes_)
    require(new_meta['status'] == 'staging_only', 'Publisher does not clear an outstanding delivery')
    folder,_ = client.metadata(folder_id)
    require(folder.get('name') == '_windows-jobs' and folder.get('mimeType') == FOLDER and not folder.get('trashed') and
            ASSETS in folder.get('parents',[]), 'Mailbox must be in project assets folder')
    before,etag = client.metadata(file_id)
    require(before.get('id') == file_id and before.get('name') == 'source-plan-v1.json' and
            before.get('mimeType') == 'application/json' and not before.get('trashed') and
            folder_id in before.get('parents',[]) and 0 < int(before.get('size',0)) <= MAX_BYTES,
            'Mailbox identity mismatch')
    with tempfile.TemporaryDirectory() as directory:
        old_file=Path(directory)/'old.json'; client.download(file_id,old_file,MAX_BYTES)
        old_bytes=old_file.read_bytes()
    require(len(old_bytes) == int(before['size']) and hashlib.md5(old_bytes,usedforsecurity=False).hexdigest() == before.get('md5Checksum'), 'Mailbox checksum mismatch')
    old=json.loads(old_bytes)
    if old.get('status') == 'empty':
        require(old == {'deliveryVersion':'1.0.0','status':'empty','generationAllowed':False,'renderAllowed':False}, 'Invalid empty mailbox')
    else:
        # Expired same plan may be renewed; a different plan is never lost by overwrite.
        require(old.get('deliveryVersion') == '1.0.0' and old.get('status') == 'staging_only' and
                old.get('generationAllowed') is False and old.get('renderAllowed') is False and
                old.get('deliveryId') == new_meta['deliveryId'] and old.get('payload') == new['payload'],
                'A different outstanding delivery must be reconciled first')
    current,_ = client.metadata(file_id)
    require(stable(current) == stable(before), 'Mailbox changed before write')
    if old_bytes == bytes_:
        return {'status':'already_published','deliveryId':new_meta['deliveryId'],'generationAllowed':False,'renderAllowed':False}
    # Preserve input bytes: payload hash depends on original JSON object key order.
    client.update_json_bytes(file_id,bytes_,etag,single_writer=True)
    after,_ = client.metadata(file_id)
    require(after.get('name') == before['name'] and after.get('mimeType') == before['mimeType'] and
            after.get('parents') == before.get('parents') and not after.get('trashed') and
            int(after.get('size',0)) == len(bytes_) and hashlib.md5(bytes_,usedforsecurity=False).hexdigest() == after.get('md5Checksum'),
            'Published metadata does not match; inspect without blind retry')
    with tempfile.TemporaryDirectory() as directory:
        check=Path(directory)/'check.json';client.download(file_id,check,MAX_BYTES)
        require(check.read_bytes() == bytes_, 'Published readback differs; inspect without blind retry')
    return {'status':'published','deliveryId':new_meta['deliveryId'],'generationAllowed':False,'renderAllowed':False}


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('delivery');args=parser.parse_args()
    try:
        require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('ROMAN_DELIVERY_SINGLE_WRITER') == 'true', 'Only configured serialized cloud workflow may publish')
        with Path(args.delivery).open('rb') as stream:bytes_=stream.read(MAX_BYTES+1)
        validated(bytes_)  # Before credentials/network.
        info=os.environ.get('GDRIVE_SA_JSON');require(bool(info),'Existing cloud Drive credential required')
        client=DriveClient.service_account(json.loads(info))
        print(json.dumps(publish(client,os.environ.get('ROMAN_WINDOWS_DELIVERY_FILE_ID'),
                                 os.environ.get('ROMAN_WINDOWS_DELIVERY_FOLDER_ID'),bytes_,single_writer=True)))
    except (ValueError,DriveError,OSError,subprocess.SubprocessError,KeyError,TypeError):
        raise SystemExit('Windows delivery not confirmed; inspect auth/config/state privately. No jobs executed.') from None
