"""Cloud outbox relay over a Fake Drive; the approval decision is injected (its Node side has its own tests).
No credentials, no network. Python only moves verified bytes and calls the existing publisher."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest


def load(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


relay=load('relay','relay_windows_outbox.py')
fixtures=load('fixtures','windows-plan-publisher.test.py')
publisher=relay.publisher
DriveError=fixtures.DriveError
FILE,FOLDER,ACK,OUTBOX=fixtures.FILE,fixtures.FOLDER,fixtures.ACK,'outbox-slot-file-0001'
EMPTY_ACK=b'{"ackVersion":"1.0.0","status":"empty"}'
EMPTY_OUTBOX=b'{"outboxVersion":"1.0.0","status":"empty"}'
md5=lambda b:hashlib.md5(b,usedforsecurity=False).hexdigest()
sha=lambda b:hashlib.sha256(b).hexdigest()


class RelayDrive:
    def __init__(self,outbox=EMPTY_OUTBOX,mailbox=fixtures.EMPTY):
        self.files={FILE:{'name':'source-plan-v1.json','bytes':mailbox},ACK:{'name':'source-plan-ack-v1.json','bytes':EMPTY_ACK},
                    OUTBOX:{'name':'source-plan-outbox-v1.json','bytes':outbox}}
        for f in self.files.values():f.update(version=1,parent=FOLDER)
        self.writes=0;self.lose=False;self.change_on_read=None;self.corrupt=None;self.calls=0
    def metadata(self,id):
        self.calls+=1
        if id == FOLDER:return {'id':id,'name':'_windows-jobs','mimeType':publisher.FOLDER,'parents':[publisher.ASSETS],'trashed':False},None
        f=self.files[id]
        return {'id':id,'name':f['name'],'mimeType':'application/json','parents':[f['parent']],'size':str(len(f['bytes'])),
                'md5Checksum':md5(f['bytes']),'version':str(f['version']),'trashed':False},'etag-'+str(f['version'])
    def download(self,id,target,max_bytes):
        body=self.files[id]['bytes']
        Path(target).write_bytes(body+b' ' if self.corrupt == id else body)
        if self.change_on_read == id:self.files[id]['version']+=1
    def update_json_bytes(self,id,body,etag,single_writer=False):
        assert id == FILE and single_writer is True,'Relay may only write the mailbox through the publisher'
        f=self.files[id];f['bytes']=body;f['version']+=1;self.writes+=1
        if self.lose:raise DriveError('Ambiguous write response',status=503)


def decider(status='publish',reason='mailbox_empty',same_as=None):
    def decide(outbox,mailbox,ack):
        current=status
        if same_as is None and mailbox == outbox:current='already_published'
        return {'status':current,'reason':reason,'generationAllowed':False,'renderAllowed':False,'outboxSha256':sha(outbox)}
    return decide


class RelayTests(unittest.TestCase):
    def run_relay(self,drive,decide):
        return relay.relay(drive,FILE,FOLDER,ACK,OUTBOX,decide=decide)

    def test_publish_once_then_repeat_by_new_process_is_already_published(self):
        envelope=fixtures.new_delivery();drive=RelayDrive(outbox=envelope)
        result=self.run_relay(drive,decider())
        self.assertEqual(result['status'],'published');self.assertEqual(drive.files[FILE]['bytes'],envelope);self.assertEqual(drive.writes,1)
        self.assertFalse(result['generationAllowed']);self.assertFalse(result['renderAllowed'])
        self.assertEqual(self.run_relay(drive,decider())['status'],'already_published');self.assertEqual(drive.writes,1)
        self.assertEqual(drive.files[OUTBOX]['bytes'],envelope);self.assertEqual(drive.files[ACK]['bytes'],EMPTY_ACK)

    def test_lost_response_is_resolved_by_reading_without_a_second_write(self):
        envelope=fixtures.new_delivery();drive=RelayDrive(outbox=envelope);drive.lose=True
        with self.assertRaises(DriveError):self.run_relay(drive,decider())
        drive.lose=False
        self.assertEqual(self.run_relay(drive,decider())['status'],'already_published');self.assertEqual(drive.writes,1)

    def test_revoked_changed_stale_or_blocked_decisions_never_write(self):
        for status,reason in [('approval_changed_or_revoked',None),('outbox_expired',None),('blocked','previous_not_acknowledged'),('nothing_to_relay',None)]:
            drive=RelayDrive(outbox=fixtures.new_delivery())
            result=self.run_relay(drive,decider(status,reason,same_as=False))
            self.assertEqual(result['status'],status);self.assertEqual(drive.writes,0)

    def test_failed_or_mismatched_decision_never_writes(self):
        def failing(outbox,mailbox,ack):raise ValueError('Relay decision not confirmed')
        drive=RelayDrive(outbox=fixtures.new_delivery())
        with self.assertRaises(ValueError):self.run_relay(drive,failing)
        def other_bytes(outbox,mailbox,ack):
            return {'status':'publish','reason':'mailbox_empty','generationAllowed':False,'renderAllowed':False,'outboxSha256':'0'*64}
        with self.assertRaises(ValueError):self.run_relay(drive,other_bytes)
        def permissive(outbox,mailbox,ack):
            return {'status':'publish','generationAllowed':True,'renderAllowed':False,'outboxSha256':sha(outbox)}
        with self.assertRaises(ValueError):self.run_relay(drive,permissive)
        self.assertEqual(drive.writes,0)

    def test_foreign_metadata_or_corrupt_bytes_refused_before_decision(self):
        for mutate in [lambda d:d.files[OUTBOX].update(parent='foreign-folder'),lambda d:d.files[OUTBOX].update(name='other.json'),
                       lambda d:d.files[ACK].update(parent='foreign-folder'),lambda d:setattr(d,'corrupt',OUTBOX),
                       lambda d:setattr(d,'corrupt',FILE),lambda d:setattr(d,'change_on_read',OUTBOX)]:
            drive=RelayDrive(outbox=fixtures.new_delivery());mutate(drive);called=[]
            def decide(*args):called.append(1);return decider()(*args)
            with self.assertRaises(ValueError):self.run_relay(drive,decide)
            self.assertEqual(called,[]);self.assertEqual(drive.writes,0)

    def test_source_changed_between_decision_and_write_is_not_published(self):
        drive=RelayDrive(outbox=fixtures.new_delivery())
        def decide_then_change(outbox,mailbox,ack):
            result=decider()(outbox,mailbox,ack);drive.files[ACK]['version']+=1;return result
        with self.assertRaises(ValueError):self.run_relay(drive,decide_then_change)
        self.assertEqual(drive.writes,0)

    def test_publisher_gate_still_blocks_an_unacknowledged_different_plan(self):
        current=fixtures.new_delivery(alternate=True);drive=RelayDrive(outbox=fixtures.new_delivery(),mailbox=current)
        with self.assertRaises(ValueError):self.run_relay(drive,decider(same_as=False))
        self.assertEqual(drive.writes,0);self.assertEqual(drive.files[FILE]['bytes'],current)

    def test_pinned_ids_must_be_four_distinct_values(self):
        drive=RelayDrive()
        with self.assertRaises(ValueError):relay.relay(drive,FILE,FOLDER,ACK,FILE,decide=decider())
        with self.assertRaises(ValueError):relay.relay(drive,FILE,FOLDER,ACK,'bad id',decide=decider())
        self.assertEqual(drive.calls,0)

    def test_node_decider_receives_only_slot_bytes_never_a_queue(self):
        seen={}
        class Result:returncode=0;stdout=json.dumps({'status':'nothing_to_relay','generationAllowed':False,'renderAllowed':False}).encode()
        def fake_run(args,input,capture_output,timeout):
            seen['args']=args;seen['keys']=sorted(json.loads(input).keys());return Result()
        original=relay.subprocess.run;relay.subprocess.run=fake_run
        try:relay.node_decide(b'a',b'b',b'c')
        finally:relay.subprocess.run=original
        self.assertEqual(seen['keys'],['ack','mailbox','outbox']);self.assertEqual(seen['args'][1],str(relay.DECIDER))


if __name__ == '__main__':
    unittest.main()
