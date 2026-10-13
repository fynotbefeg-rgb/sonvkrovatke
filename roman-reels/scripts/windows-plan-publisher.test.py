"""Offline single-slot publisher integrity/restart tests; no real Google calls."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest

from drive_intake_client import DriveError
spec=importlib.util.spec_from_file_location('publisher',Path(__file__).with_name('publish-windows-plan.py'))
publisher=importlib.util.module_from_spec(spec);spec.loader.exec_module(publisher)
FILE='mailbox-file-0001';FOLDER='mailbox-folder-0001'
EMPTY=json.dumps({'deliveryVersion':'1.0.0','status':'empty','generationAllowed':False,'renderAllowed':False}).encode()


def new_delivery(alternate=False):
    fixture=Path(__file__).with_name('testing')/'delivery-fixture.mjs'
    envelope=Path(__file__).with_name('windows-plan-delivery.mjs')
    command=f"import {{deliveryPlan}} from '{fixture.resolve().as_uri()}';import {{buildDelivery}} from '{envelope.resolve().as_uri()}';const p=deliveryPlan();"
    if alternate:command+="p.jobs[0].localPath='/tmp/other-body.mp4';"
    command+='process.stdout.write(buildDelivery(p));'
    return subprocess.run(['node','--input-type=module','-e',command],capture_output=True,check=True,timeout=20).stdout


class FakeDrive:
    def __init__(self):
        self.bytes=EMPTY;self.writes=0;self.version=1;self.lose=False;self.corrupt=False;self.change=False;self.calls=0
    def metadata(self,id):
        self.calls+=1
        if id==FOLDER:return {'id':id,'name':'_windows-jobs','mimeType':publisher.FOLDER,'parents':[publisher.ASSETS]},None
        return {'id':id,'name':'source-plan-v1.json','mimeType':'application/json','parents':[FOLDER],
                'size':str(len(self.bytes)),'md5Checksum':hashlib.md5(self.bytes,usedforsecurity=False).hexdigest(),'version':str(self.version),'trashed':False},None
    def download(self,id,target,max_bytes):
        Path(target).write_bytes(self.bytes if not (self.corrupt and self.writes) else self.bytes+b' ')
        if self.change:self.version+=1
    def update_json_bytes(self,id,body,etag,single_writer=False):
        assert single_writer is True
        self.bytes=body;self.writes+=1;self.version+=1
        if self.lose:raise DriveError('Ambiguous write response',status=503)


class PublisherTests(unittest.TestCase):
    def test_write_verified_and_repeat_does_not_write_again(self):
        drive=FakeDrive();body=new_delivery()
        result=publisher.publish(drive,FILE,FOLDER,body,single_writer=True)
        self.assertEqual(result['status'],'published');self.assertFalse(result['generationAllowed'])
        self.assertEqual(drive.bytes,body);self.assertEqual(drive.writes,1)
        self.assertEqual(publisher.publish(drive,FILE,FOLDER,body,single_writer=True)['status'],'already_published')
        self.assertEqual(drive.writes,1)

    def test_different_outstanding_plan_is_not_lost_by_overwrite(self):
        drive=FakeDrive();first=new_delivery();publisher.publish(drive,FILE,FOLDER,first,single_writer=True)
        with self.assertRaises(ValueError):publisher.publish(drive,FILE,FOLDER,new_delivery(True),single_writer=True)
        self.assertEqual(drive.bytes,first);self.assertEqual(drive.writes,1)

    def test_ambiguous_write_not_retried_and_next_pass_reconciles_bytes(self):
        drive=FakeDrive();drive.lose=True;body=new_delivery()
        with self.assertRaises(DriveError):publisher.publish(drive,FILE,FOLDER,body,single_writer=True)
        self.assertEqual(drive.writes,1)
        self.assertEqual(publisher.publish(drive,FILE,FOLDER,body,single_writer=True)['status'],'already_published')
        self.assertEqual(drive.writes,1)

    def test_readback_corruption_or_concurrent_metadata_change_blocks(self):
        drive=FakeDrive();drive.corrupt=True
        with self.assertRaises(ValueError):publisher.publish(drive,FILE,FOLDER,new_delivery(),single_writer=True)
        self.assertEqual(drive.writes,1)
        changed=FakeDrive();changed.change=True
        with self.assertRaises(ValueError):publisher.publish(changed,FILE,FOLDER,new_delivery(),single_writer=True)
        self.assertEqual(changed.writes,0)

    def test_writer_false_invalid_ids_or_invalid_payload_fail_before_network(self):
        for file_id,body,single in [(FILE,new_delivery(),False),('https://evil.example',new_delivery(),True),(FILE,b'{}',True),(FILE,b'x'*65537,True)]:
            drive=FakeDrive()
            with self.assertRaises(ValueError):publisher.publish(drive,file_id,FOLDER,body,single_writer=single)
            self.assertEqual(drive.calls,0);self.assertEqual(drive.writes,0)


if __name__=='__main__':unittest.main()
