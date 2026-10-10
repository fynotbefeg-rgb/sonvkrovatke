"""Real synthetic MP4 downloads via a fake Drive, with durable restart and revocation."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import factory_media as media
import drive_intake as intake
from drive_intake_client import DriveError
from drive_intake_store import DriveStore


class MemoryStore:
    def __init__(self): self.state=intake.empty_state();self.revision=0
    def load(self): return copy.deepcopy(self.state),self.revision
    def save(self,state,revision):
        if revision!=self.revision:raise DriveError("Conflicting writer")
        self.state=copy.deepcopy(state);self.revision+=1;return self.revision


class FakeDrive:
    def __init__(self,source,packet):
        self.files={};self.paths={};self.downloads=0;self.corrupt=False;self.change=False;self.fail=False
        self.files['topic']={'id':'topic','name':packet['sourceSet']['topic_id'],'mimeType':intake.FOLDER,'parents':['incoming']}
        self.files['version']={'id':'version','name':'v1','mimeType':intake.FOLDER,'parents':['topic']}
        for p in source.iterdir():
            key=p.name
            self.paths[key]=p
            self.files[key]={'id':key,'name':key,'mimeType':'application/json' if key.endswith('.json') else 'video/mp4',
                'parents':['version'],'version':'1','size':str(p.stat().st_size),
                'md5Checksum':hashlib.md5(p.read_bytes(),usedforsecurity=False).hexdigest(),'trashed':False}
    def metadata(self,key):return copy.deepcopy(self.files[key]),None
    def children(self,folder):return [copy.deepcopy(v) for v in self.files.values() if folder in v.get('parents',[])]
    def download(self,key,target,max_bytes):
        self.downloads+=1
        if self.fail:raise DriveError('Temporary download error',status=503)
        shutil.copyfile(self.paths[key],target)
        if self.corrupt and key.endswith('.mp4'):Path(target).write_bytes(b'wrong')
        if self.change and key.endswith('.mp4'):self.files[key]['version']='2'


class DriveIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();cls.source=Path(cls.temp.name)/'source';cls.source.mkdir()
        cls.packet=json.loads((Path(__file__).resolve().parents[1]/'research/platform-ending-drafts-v2.json').read_text())[0]
        topic,version,parts=intake.incoming.expectations(cls.packet)
        receipt={'receiptVersion':'1.0.0','topicId':topic,'scriptVersion':version,'files':[]}
        for n,part in enumerate(parts):
            path=cls.source/part['fileName']
            subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i',f'color=c=blue:s=108x192:r=25',
                '-f','lavfi','-i',f'sine=frequency={300+n*200}:sample_rate=48000','-t','0.16',
                '-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',str(path)],capture_output=True,check=True,timeout=30)
            receipt['files'].append({'fileName':part['fileName'],'sha256':media.sha256(path),'textHash':part['textHash']})
        (cls.source/'recording-set.json').write_text(json.dumps(receipt))

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def setUp(self):
        self.work=tempfile.TemporaryDirectory();self.root=Path(self.work.name)
        self.store=MemoryStore();self.drive=FakeDrive(self.source,self.packet)
        self.approvals={'items':[]}
    def tearDown(self):self.work.cleanup()
    def approved(self):
        items=copy.deepcopy(self.packet['items'])
        for i in items:i.update(status='approved',approved_by='test-roman@example.test',approved_at='2026-10-10T00:00:00Z')
        return {'items':items}
    def run_scan(self,now=100):
        with patch.object(media,'PUBLIC',self.root):
            return intake.scan(self.drive,intake.Journal(self.store),'incoming',[self.packet],lambda:self.approvals,now)

    def test_pending_downloads_real_files_once_and_survives_fresh_runner(self):
        first=self.run_scan()
        self.assertEqual(first['downloadedSets'],1);self.assertEqual(self.drive.downloads,7)
        job=next(iter(self.store.state['jobs'].values()))
        self.assertEqual(job['status'],'awaiting_approval');self.assertTrue(job['downloadValidated']);self.assertFalse(job['renderAllowed'])
        shutil.rmtree(self.root);self.root.mkdir()  # Simulate loss of all runner files.
        second=self.run_scan(200)
        self.assertEqual(second['skippedSets'],1);self.assertEqual(self.drive.downloads,7)
        self.assertEqual(len(self.store.state['jobs']),1)

    def test_all_six_exact_approvals_required_and_revocation_downgrades_handoff(self):
        self.approvals=self.approved();self.approvals['items'].pop();self.run_scan()
        self.assertEqual(next(iter(self.store.state['jobs'].values()))['status'],'awaiting_approval')
        self.approvals=self.approved();self.run_scan()
        self.assertEqual(next(iter(self.store.state['jobs'].values()))['status'],'source_set_ready')
        self.approvals['items'][0]['script_text']='Changed approved text';self.run_scan()
        self.assertEqual(next(iter(self.store.state['jobs'].values()))['status'],'awaiting_approval')
        self.assertEqual(self.drive.downloads,7)

    def test_changed_remote_version_creates_new_input_key_and_supersedes_old(self):
        self.run_scan();old=next(iter(self.store.state['jobs']))
        self.drive.files['hook-1.mp4']['version']='2';self.run_scan(200)
        self.assertEqual(len(self.store.state['jobs']),2)
        self.assertEqual(self.store.state['jobs'][old]['status'],'superseded')
        self.assertEqual(self.drive.downloads,14)

    def test_deleted_part_invalidates_previously_ready_set(self):
        self.approvals=self.approved();self.run_scan()
        del self.drive.files['body.mp4'];r=self.run_scan(200)
        self.assertEqual(r['sets'][0]['status'],'waiting_for_parts')
        self.assertEqual(next(iter(self.store.state['jobs'].values()))['status'],'superseded')

    def test_ambiguous_name_and_empty_folder_never_download(self):
        duplicate=copy.deepcopy(self.drive.files['body.mp4']);duplicate['id']='duplicate'
        self.drive.files['duplicate']=duplicate
        self.assertEqual(self.run_scan()['sets'][0]['status'],'manual_attention');self.assertEqual(self.drive.downloads,0)
        self.drive.files={};self.assertEqual(self.run_scan()['sets'][0]['status'],'waiting_for_parts')

    def test_wrong_bytes_or_mid_download_change_fail_closed_without_auto_retry(self):
        for flag in ['corrupt','change']:
            self.store=MemoryStore();self.drive=FakeDrive(self.source,self.packet);setattr(self.drive,flag,True)
            self.run_scan()
            job=next(iter(self.store.state['jobs'].values()))
            self.assertEqual(job['status'],'manual_attention');self.assertFalse(job['downloadValidated'])

    def test_transient_download_failure_retries_and_recovery_has_one_job(self):
        self.drive.fail=True;self.run_scan()
        self.assertEqual(next(iter(self.store.state['jobs'].values()))['status'],'retryable_error')
        self.drive.fail=False;self.run_scan(200)
        self.assertEqual(len(self.store.state['jobs']),1)
        self.assertEqual(next(iter(self.store.state['jobs'].values()))['attempts'],2)
        self.assertTrue(next(iter(self.store.state['jobs'].values()))['downloadValidated'])

    def test_retry_limit_stops_repeated_network_failures(self):
        self.drive.fail=True
        for n in range(4):self.run_scan(100+n*100)
        job=next(iter(self.store.state['jobs'].values()))
        self.assertEqual(job['attempts'],3);self.assertEqual(job['status'],'manual_attention')
        self.assertEqual(self.drive.downloads,3)

    def test_live_lease_skips_and_expired_lease_recovers(self):
        self.run_scan();key=next(iter(self.store.state['jobs']))
        job=self.store.state['jobs'][key];job.update(status='downloading',leaseUntil=300,downloadValidated=False)
        self.assertEqual(self.run_scan(200)['sets'][0]['status'],'downloading');self.assertEqual(self.drive.downloads,7)
        self.assertEqual(self.run_scan(301)['downloadedSets'],1)
        self.assertEqual(self.drive.downloads,14)

    def test_corrupted_journal_and_stale_writer_are_rejected(self):
        self.run_scan();key=next(iter(self.store.state['jobs']))
        self.store.state['jobs'][key]['renderAllowed']=True
        with self.assertRaises(ValueError):intake.Journal(self.store)
        store=MemoryStore();a=intake.Journal(store);b=intake.Journal(store)
        a.waiting('a:v1','waiting_for_parts')
        with self.assertRaises(DriveError):b.waiting('b:v1','waiting_for_parts')

    def test_state_without_etag_requires_explicit_serialized_writer(self):
        class NoEtag:
            def metadata(self,key):return {'mimeType':'application/json','parents':['1PojAtqPHjfg_uknzp66sOuZcoFVQqbhE'],'version':'1','capabilities':{'canEdit':True}},None
            def request(self,*args):
                import io
                stream=io.BytesIO(json.dumps(intake.empty_state()).encode());stream.headers={};return stream
        with self.assertRaises(DriveError):DriveStore(NoEtag()).load()
        state,revision=DriveStore(NoEtag(),single_writer=True).load()
        self.assertEqual(state,intake.empty_state());self.assertIsNone(revision['etag'])

    def test_drive_store_ignores_metadata_only_changes_but_rejects_changed_content(self):
        class JsonDrive:
            def __init__(self):self.body=json.dumps(intake.empty_state()).encode();self.version=0
            def metadata(self,key):
                self.version+=1
                return {'mimeType':'application/json','parents':['1PojAtqPHjfg_uknzp66sOuZcoFVQqbhE'],'version':str(self.version),'capabilities':{'canEdit':True}},None
            def request(self,*args):
                import io
                stream=io.BytesIO(self.body);stream.headers={};return stream
            def update_json(self,key,data,etag,single_writer=False):self.body=json.dumps(data).encode()
        client=JsonDrive();store=DriveStore(client,single_writer=True)
        state,revision=store.load();state['sequence']=1
        updated=store.save(state,revision)
        self.assertNotEqual(updated['contentHash'],revision['contentHash'])
        client.body=json.dumps({**state,'sequence':2}).encode()
        with self.assertRaises(DriveError):store.save({**state,'sequence':3},updated)


if __name__=='__main__':unittest.main()
