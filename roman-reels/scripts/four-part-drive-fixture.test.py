"""Pinned live-probe boundaries, with fake Drive and real local synthetic media."""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import patch, Mock

import factory_media as media
from drive_intake_client import DriveClient
import drive_intake as intake


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

probe = load('four_probe', 'check-four-part-drive-fixture.py')
helpers = load('probe_helpers', 'drive-intake.test.py')


class FixtureProbeTests(unittest.TestCase):
    def test_pinned_packet_and_corruption_fail_before_network(self):
        self.assertTrue(probe.fixture_packet()['syntheticFixtures'])
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'packet.json'
            file.write_bytes(probe.PACKET.read_bytes() + b'\n')
            with patch.object(probe, 'PACKET', file), self.assertRaises(ValueError):
                probe.fixture_packet()

    def test_readonly_oauth_scope(self):
        create = Mock()
        google, oauth = ModuleType('google'), ModuleType('google.oauth2')
        oauth.service_account = SimpleNamespace(Credentials=SimpleNamespace(from_service_account_info=create))
        google.oauth2 = oauth
        with patch.dict(sys.modules, {'google': google, 'google.oauth2': oauth}), patch.object(DriveClient, 'refresh'):
            DriveClient.service_account({'unused': True}, readonly=True)
            self.assertEqual(create.call_args.kwargs['scopes'], ['https://www.googleapis.com/auth/drive.readonly'])
        self.assertFalse(hasattr(probe.ReadOnlyDrive(object()), 'request'))
        self.assertFalse(hasattr(probe.ReadOnlyDrive(object()), 'update_json'))

    def test_probe_downloads_four_parts_without_approval_or_drive_writes(self):
        helpers.DriveIntakeTests.setUpClass()
        try:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory) / 'public'; root.mkdir()
                source = Path(directory) / 'sources'; source.mkdir()
                packet = probe.fixture_packet()
                topic, version, parts = intake.incoming.expectations(packet)
                receipt = {'receiptVersion': '1.0.0', 'topicId': topic, 'scriptVersion': version, 'files': []}
                for part in parts:
                    file = source / part['fileName']
                    shutil.copyfile(helpers.DriveIntakeTests.source / part['fileName'], file)
                    receipt['files'].append({'fileName': file.name, 'sha256': media.sha256(file), 'textHash': part['textHash']})
                (source / 'recording-set.json').write_text(json.dumps(receipt))
                client = helpers.FakeDrive(source, packet)
                client.files['topic']['parents'] = [probe.INCOMING]
                with patch.object(media, 'PUBLIC', root):
                    report = probe.check_fixture(client, assemble_output=Path(directory) / 'assembled')
                self.assertTrue(report['ok'])
                self.assertEqual(client.downloads, 5)
                self.assertFalse(report['driveWrites'])
                self.assertFalse(report['approvalReads'])
                self.assertFalse(report['durableState'])
                self.assertFalse(report['renderAllowed'])
                self.assertEqual(len(report['parts']), 4)
                self.assertTrue(report['assembly']['complete'])
                self.assertFalse(report['assembly']['productionReady'])
                self.assertFalse(report['assembly']['professionalMontage'])
                self.assertEqual(len(report['assembly']['variants']), 3)
                for variant in report['assembly']['variants']:
                    self.assertTrue(variant['technicalPassed'])
                    self.assertGreater(variant['duration'], variant['bodyStart'])
                self.assertEqual(len(list((Path(directory) / 'assembled').glob('*.mp4'))), 3)
                self.assertEqual(list((Path(directory) / 'assembled').glob('*.partial.mp4')), [])
        finally:
            helpers.DriveIntakeTests.tearDownClass()


if __name__ == '__main__': unittest.main()
