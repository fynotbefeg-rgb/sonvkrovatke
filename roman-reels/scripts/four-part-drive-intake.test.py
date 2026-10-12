"""Four-part Drive handoff using real synthetic media, never live services."""
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import drive_intake as intake
import factory_media as media

spec = importlib.util.spec_from_file_location('six_test_helpers', Path(__file__).with_name('drive-intake.test.py'))
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)


class FourPartTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        helpers.DriveIntakeTests.setUpClass()
        cls.packet = copy.deepcopy(helpers.DriveIntakeTests.packet)
        cls.packet['draftVersion'] = '3.0.0'
        cls.packet['sourceSet']['recordingParts'] = 4
        cls.packet['sourceSet'].pop('endings')
        topic = cls.packet['sourceSet']['topic_id']
        items = []
        for old in cls.packet['items']:
            if old['platform'] != 'instagram':
                continue
            item = copy.deepcopy(old)
            item.pop('platform')
            item['topic_id'] = topic
            item['version_id'] = f"R-{topic}-h{item['hook_id']}"
            item['script_text'] = '\n\n'.join([item['hook_text'], cls.packet['sourceSet']['body_text']])
            item['script_hash'] = intake.incoming.contract.legacy_hash({
                'reelId': item['version_id'], 'scriptVersion': item['script_revision'],
                'hookText': item['hook_text'], 'scriptText': item['script_text']})
            items.append(item)
        cls.packet['items'] = items

    @classmethod
    def tearDownClass(cls):
        helpers.DriveIntakeTests.tearDownClass()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'public'
        self.root.mkdir()
        self.source = Path(self.temp.name) / 'source'
        self.source.mkdir()
        self.packet = copy.deepcopy(type(self).packet)
        topic, version, parts = intake.incoming.expectations(self.packet)
        receipt = {'receiptVersion': '1.0.0', 'topicId': topic, 'scriptVersion': version, 'files': []}
        for part in parts:
            target = self.source / part['fileName']
            shutil.copyfile(helpers.DriveIntakeTests.source / part['fileName'], target)
            receipt['files'].append({'fileName': part['fileName'], 'sha256': media.sha256(target), 'textHash': part['textHash']})
        (self.source / 'recording-set.json').write_text(json.dumps(receipt))
        self.drive = helpers.FakeDrive(self.source, self.packet)
        self.store = helpers.MemoryStore()
        self.approvals = {'items': []}

    def tearDown(self):
        self.temp.cleanup()

    def scan(self):
        with patch.object(media, 'PUBLIC', self.root):
            return intake.scan(self.drive, intake.Journal(self.store), 'incoming', [self.packet], lambda: self.approvals, now=100)

    def test_four_downloads_receipt_and_restart_deduplication(self):
        self.assertEqual(self.scan()['downloadedSets'], 1)
        self.assertEqual(self.drive.downloads, 5)
        job = next(iter(self.store.state['jobs'].values()))
        self.assertEqual(job['partCount'], 4)
        self.assertEqual(len(job['sourceSha256']), 4)
        self.assertEqual(len(job['partTextHashes']), 4)
        self.assertEqual(job['status'], 'awaiting_approval')
        self.assertFalse(job['renderAllowed'])
        shutil.rmtree(self.root)
        self.root.mkdir()
        self.assertEqual(self.scan()['skippedSets'], 1)
        self.assertEqual(self.drive.downloads, 5)

    def test_exact_three_approvals_and_revocation(self):
        items = copy.deepcopy(self.packet['items'])
        for item in items:
            item.update(status='approved', approved_by='roman@example.test', approved_at='2026-10-12T00:00:00Z')
        self.approvals = {'items': items[:2]}
        self.scan()
        job = next(iter(self.store.state['jobs'].values()))
        self.assertEqual(job['status'], 'awaiting_approval')
        self.approvals = {'items': items}
        self.scan()
        job = next(iter(self.store.state['jobs'].values()))
        self.assertEqual(job['status'], 'source_set_ready')
        self.assertFalse(job['renderAllowed'])
        items[0]['script_hash'] = '0' * 64
        self.scan()
        job = next(iter(self.store.state['jobs'].values()))
        self.assertEqual(job['status'], 'awaiting_approval')

    def test_uploader_files_without_receipt_wait_and_do_not_download(self):
        del self.drive.files['recording-set.json']
        self.assertEqual(self.scan()['sets'][0]['status'], 'waiting_for_parts')
        slot = next(iter(self.store.state['waiting'].values()))
        self.assertEqual(slot['missing'], ['recording-set.json'])
        self.assertEqual(self.drive.downloads, 0)

    def test_no_silent_four_part_fallback_or_fake_endings(self):
        packet = copy.deepcopy(self.packet)
        packet['draftVersion'] = '2.0.0'
        with self.assertRaises((ValueError, KeyError)):
            intake.incoming.expectations(packet)
        packet = copy.deepcopy(self.packet)
        packet['sourceSet']['endings'] = [{'platform': 'instagram'}]
        with self.assertRaises(ValueError):
            intake.incoming.expectations(packet)
        packet = copy.deepcopy(self.packet)
        packet['items'][0]['script_text'] += ' changed'
        with self.assertRaises(ValueError):
            intake.incoming.expectations(packet)

    def test_bad_receipt_and_changed_remote_fail_closed(self):
        receipt = json.loads((self.source / 'recording-set.json').read_text())
        receipt['files'][0]['textHash'] = '0' * 64
        (self.source / 'recording-set.json').write_text(json.dumps(receipt))
        self.drive = helpers.FakeDrive(self.source, self.packet)
        self.assertEqual(self.scan()['sets'][0]['status'], 'manual_attention')
        self.assertEqual(self.drive.downloads, 1)

    def test_remote_changed_during_download_blocks_handoff(self):
        self.drive.change = True
        self.assertEqual(self.scan()['sets'][0]['status'], 'manual_attention')
        job = next(iter(self.store.state['jobs'].values()))
        self.assertFalse(job['downloadValidated'])
        self.assertFalse(job['renderAllowed'])

    def test_synthetic_never_reads_approval_or_authorizes_production(self):
        self.packet['syntheticFixtures'] = True
        def forbidden():
            raise AssertionError('Synthetic set must never consult real approvals')
        with patch.object(media, 'PUBLIC', self.root):
            report = intake.scan(self.drive, intake.Journal(self.store), 'incoming',
                                 [self.packet], forbidden, now=100)
        self.assertEqual(report['sets'][0]['status'], 'awaiting_approval')
        self.assertFalse(report['renderAllowed'])

    def test_plan_compatible_with_existing_four_part_assembler(self):
        self.scan()
        folder = next(self.root.glob('rr/incoming/_downloads/*/*'))
        relative = folder.relative_to(self.root).as_posix()
        with patch.object(media, 'PUBLIC', self.root):
            plan = intake.incoming.inspect(self.packet, relative)['plan']
            self.assertEqual(plan['assemblyVersion'], '1.0.0')
            self.assertNotIn('endings', plan)
            self.assertNotIn('textHash', plan['body'])
            body, hooks = intake.incoming.assembler.verify(plan)
            self.assertEqual(len(hooks), 3)
            self.assertGreater(body['metadata']['duration'], 0)


if __name__ == '__main__':
    unittest.main()
