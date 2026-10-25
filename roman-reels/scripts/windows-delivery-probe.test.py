"""Fixed fictional cloud probe, Fake Drive only; no credentials or live calls."""
import importlib.util
import json
from pathlib import Path
import unittest

def load(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

probe=load('probe','windows_delivery_probe.py')
fixtures=load('fixtures','windows-plan-publisher.test.py')

class ProbeTests(unittest.TestCase):
    def run_probe(self,drive,action):
        return probe.run_probe(drive,fixtures.FILE,fixtures.FOLDER,fixtures.ACK,action)
    def prepared(self):
        drive=fixtures.AckDrive();drive.bytes=probe.node(probe.PROBE,['build']);return drive
    def test_inspection_empty_is_read_only(self):
        drive=fixtures.AckDrive();result=self.run_probe(drive,'inspect')
        self.assertEqual(result['status'],'empty');self.assertFalse(result['acknowledged']);self.assertEqual(drive.writes,0)
        self.assertFalse(result['generationAllowed']);self.assertFalse(result['uploadAllowed']);self.assertFalse(result['renderAllowed'])
    def test_publication_and_replay_keep_exact_envelope(self):
        drive=fixtures.AckDrive();self.assertEqual(self.run_probe(drive,'publish_fixture')['status'],'published')
        first=drive.bytes;self.assertEqual(self.run_probe(drive,'publish_fixture')['status'],'already_published')
        self.assertEqual(drive.bytes,first);self.assertEqual(drive.writes,1)
    def test_matched_receipt_is_inspected_without_renewal(self):
        drive=self.prepared();drive.ack=fixtures.acknowledgement(drive.bytes);first=drive.bytes
        self.assertTrue(self.run_probe(drive,'inspect')['acknowledged'])
        self.assertEqual(self.run_probe(drive,'publish_fixture')['status'],'already_acknowledged')
        self.assertEqual(drive.bytes,first);self.assertEqual(drive.writes,0)
    def test_real_or_modified_packet_is_never_overwritten_or_cleared(self):
        for action in ['inspect','publish_fixture','clear_acknowledged_fixture']:
            drive=fixtures.AckDrive();drive.bytes=fixtures.new_delivery();drive.ack=fixtures.acknowledgement(drive.bytes)
            with self.assertRaises(ValueError):self.run_probe(drive,action)
            self.assertEqual(drive.writes,0)
    def test_clear_requires_exact_receipt_and_preserves_ack_and_replay(self):
        drive=self.prepared()
        with self.assertRaises(ValueError):self.run_probe(drive,'clear_acknowledged_fixture')
        drive.ack=fixtures.acknowledgement(drive.bytes);ack=drive.ack
        self.assertEqual(self.run_probe(drive,'clear_acknowledged_fixture')['status'],'cleared_fixture')
        self.assertEqual(drive.bytes,probe.EMPTY);self.assertEqual(drive.ack,ack)
        self.assertEqual(self.run_probe(drive,'clear_acknowledged_fixture')['status'],'already_empty');self.assertEqual(drive.writes,1)
    def test_ambiguous_publication_or_clear_is_reconciled_without_duplicate_writes(self):
        drive=fixtures.AckDrive();drive.lose=True
        with self.assertRaises(fixtures.DriveError):self.run_probe(drive,'publish_fixture')
        self.assertEqual(self.run_probe(drive,'publish_fixture')['status'],'already_published')
        drive.ack=fixtures.acknowledgement(drive.bytes)
        with self.assertRaises(fixtures.DriveError):self.run_probe(drive,'clear_acknowledged_fixture')
        self.assertEqual(self.run_probe(drive,'clear_acknowledged_fixture')['status'],'already_empty');self.assertEqual(drive.writes,2)
    def test_expired_fixture_renewal_does_not_accept_old_receipt(self):
        drive=self.prepared();raw=json.loads(drive.bytes);raw['issuedAt']-=1200000;raw['expiresAt']-=1200000
        drive.bytes=json.dumps(raw).encode();old=drive.bytes
        self.assertTrue(self.run_probe(drive,'inspect')['expired'])
        self.assertEqual(self.run_probe(drive,'publish_fixture')['status'],'published');self.assertNotEqual(drive.bytes,old)
        drive.ack=fixtures.acknowledgement(old);self.assertFalse(self.run_probe(drive,'inspect')['acknowledged'])
        with self.assertRaises(ValueError):self.run_probe(drive,'clear_acknowledged_fixture')
    def test_wrong_slot_changed_metadata_or_auth_failure_makes_no_writes(self):
        for flag in ['ack_wrong_parent','ack_change','ack_corrupt','ack_auth','change']:
            drive=fixtures.AckDrive();setattr(drive,flag,True)
            with self.assertRaises((ValueError,fixtures.DriveError)):self.run_probe(drive,'publish_fixture')
            self.assertEqual(drive.writes,0)

if __name__ == '__main__':unittest.main()
