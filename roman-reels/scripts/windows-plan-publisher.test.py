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
ACK='acknowledgement-file-0001'
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


def acknowledgement(body):
    data=json.loads(body)
    return json.dumps({'ackVersion':'1.0.0','status':'received','deliveryId':data['deliveryId'],
        'contentSha256':hashlib.sha256(body).hexdigest(),'topicId':data['payload']['topicId'],
        'scriptVersion':data['payload']['scriptVersion'],'planKey':data['payload']['planKey'],'jobCount':4,
        'issuedAt':data['issuedAt'],'expiresAt':data['expiresAt'],'receivedAt':data['issuedAt'],
        'generationAllowed':False,'uploadAllowed':False,'renderAllowed':False,'currentApprovalRecheckRequired':True}).encode()


class AckDrive(FakeDrive):
    def __init__(self):
        super().__init__();self.ack=b'{"ackVersion":"1.0.0","status":"empty"}';self.ack_version=1
        self.ack_reads=0;self.ack_wrong_parent=False;self.ack_change=False;self.ack_auth=False;self.ack_corrupt=False
    def metadata(self,id):
        if id != ACK:return super().metadata(id)
        if self.ack_auth:raise DriveError('Authentication failed',status=403)
        return {'id':id,'name':'source-plan-ack-v1.json','mimeType':'application/json',
            'parents':['foreign-folder' if self.ack_wrong_parent else FOLDER],
            'size':str(len(self.ack)),'md5Checksum':hashlib.md5(self.ack,usedforsecurity=False).hexdigest(),
            'version':str(self.ack_version),'trashed':False},None
    def download(self,id,target,max_bytes):
        if id != ACK:return super().download(id,target,max_bytes)
        self.ack_reads+=1
        Path(target).write_bytes(self.ack+b' ' if self.ack_corrupt else self.ack)
        if self.ack_change:self.ack_version+=1
    def update_json_bytes(self,id,body,etag,single_writer=False):
        assert id == FILE, 'Publisher must never modify acknowledgement storage'
        return super().update_json_bytes(id,body,etag,single_writer=single_writer)


class AcknowledgedPublisherTests(unittest.TestCase):
    def ready(self):
        drive=AckDrive();first=new_delivery();drive.bytes=first;drive.ack=acknowledgement(first)
        return drive,first,new_delivery(True)
    def publish(self,drive,body):
        return publisher.publish(drive,FILE,FOLDER,body,single_writer=True,ack_file_id=ACK)

    def test_exact_acknowledgement_advances_and_repeat_after_restart_does_not_write(self):
        drive,first,next_=self.ready();ack=drive.ack
        self.assertEqual(self.publish(drive,next_)['status'],'published')
        self.assertEqual(self.publish(drive,next_)['status'],'already_published')
        self.assertEqual(drive.writes,1);self.assertEqual(drive.ack,ack)

    def test_empty_stale_wrong_text_and_inconsistent_acknowledgements_block(self):
        for field,value in [('status','empty'),('contentSha256','0'*64),('deliveryId','0'*64),
                            ('topicId','different-topic'),('scriptVersion',99),('issuedAt',0),('generationAllowed',True)]:
            with self.subTest(field=field):
                drive,first,next_=self.ready();ack=json.loads(drive.ack);ack[field]=value;drive.ack=json.dumps(ack).encode()
                with self.assertRaises(ValueError):self.publish(drive,next_)
                self.assertEqual(drive.bytes,first);self.assertEqual(drive.writes,0)

    def test_wrong_slot_changed_metadata_bad_checksum_and_auth_failure_block(self):
        for flag in ['ack_wrong_parent','ack_change','ack_corrupt','ack_auth']:
            with self.subTest(flag=flag):
                drive,first,next_=self.ready();setattr(drive,flag,True)
                with self.assertRaises((ValueError,DriveError)):self.publish(drive,next_)
                self.assertEqual(drive.bytes,first);self.assertEqual(drive.writes,0)

    def test_same_plan_renewal_does_not_require_acknowledgement(self):
        drive,first,_=self.ready();renewed=json.loads(first);renewed['expiresAt']+=1000
        body=json.dumps(renewed).encode();drive.ack_auth=True
        self.assertEqual(self.publish(drive,body)['status'],'published');self.assertEqual(drive.ack_reads,0)

    def test_expired_delivery_can_advance_only_with_exact_historical_acknowledgement(self):
        drive,first,next_=self.ready();old=json.loads(first);old['issuedAt']-=1200000;old['expiresAt']-=1200000
        drive.bytes=json.dumps(old).encode();drive.ack=acknowledgement(drive.bytes)
        self.assertEqual(self.publish(drive,next_)['status'],'published')
        drive.bytes=json.dumps(old).encode();drive.ack=b'{"ackVersion":"1.0.0","status":"empty"}'
        with self.assertRaises(ValueError):self.publish(drive,next_)
        self.assertEqual(drive.writes,1)

    def test_lost_response_after_advancement_reconciles_without_another_write(self):
        drive,_,next_=self.ready();drive.lose=True
        with self.assertRaises(DriveError):self.publish(drive,next_)
        self.assertEqual(self.publish(drive,next_)['status'],'already_published');self.assertEqual(drive.writes,1)

    def test_ack_id_alias_or_invalid_id_rejected_before_network(self):
        for id in [FILE,FOLDER,'https://example.com']:
            drive=AckDrive()
            with self.assertRaises(ValueError):
                publisher.publish(drive,FILE,FOLDER,new_delivery(),single_writer=True,ack_file_id=id)
            self.assertEqual(drive.calls,0);self.assertEqual(drive.writes,0)


if __name__=='__main__':unittest.main()
