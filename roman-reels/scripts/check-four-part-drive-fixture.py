"""Read-only check of the exact synthetic Windows-uploaded four-part fixture.

No shared Drive journal, approval reader, avatar, render, or publication.
"""
import copy
import hashlib
import json
import os
from pathlib import Path

from drive_intake import Journal, empty_state, scan
from drive_intake_client import DriveClient, DriveError

ROOT = Path(__file__).resolve().parents[1]
PACKET = ROOT / 'research/windows-receipt-test-20261012/packet.json'
PACKET_SHA = 'e9524729a2103ef2211d1eb79cf886d74a83f02d78dacf250fbad805845263c3'
INCOMING = '1Qs3YJQB9Hr8H7B0Fa7MWlwsQ0LLGBPoQ'


def fixture_packet():
    raw = PACKET.read_bytes()
    if hashlib.sha256(raw).hexdigest() != PACKET_SHA:
        raise ValueError('Pinned synthetic packet checksum mismatch')
    packet = json.loads(raw)
    if packet.get('syntheticFixtures') is not True or packet.get('productionReady') is not False:
        raise ValueError('Synthetic-only fixture required')
    if packet['sourceSet']['topic_id'] != 'windows-receipt-test-20261012':
        raise ValueError('Unexpected fixture topic')
    if any(i.get('status') != 'pending_approval' for i in packet['items']):
        raise ValueError('No approvals allowed in fixture')
    return packet


class ReadOnlyDrive:
    def __init__(self, client): self.client = client
    def children(self, *args): return self.client.children(*args)
    def metadata(self, *args): return self.client.metadata(*args)
    def download(self, *args): return self.client.download(*args)
    # Deliberately no write transport or cloud journal method.


class LocalStore:
    def __init__(self): self.state = empty_state(); self.revision = 0
    def load(self): return copy.deepcopy(self.state), self.revision
    def save(self, state, revision):
        if revision != self.revision: raise ValueError('Local validation state conflict')
        self.state = copy.deepcopy(state); self.revision += 1
        return self.revision


def check_fixture(client):
    packet = fixture_packet()
    def forbidden_approval():
        raise ValueError('Synthetic fixture must never read approval service')
    store = LocalStore()
    report = scan(ReadOnlyDrive(client), Journal(store), INCOMING, [packet], forbidden_approval)
    jobs = list(store.state['jobs'].values())
    ok = (report['downloadedSets'] == 1 and len(jobs) == 1 and
          jobs[0]['downloadValidated'] is True and jobs[0]['status'] == 'awaiting_approval' and
          len(jobs[0]['sourceSha256']) == 4 and len(jobs[0]['partTextHashes']) == 4 and
          report['renderAllowed'] is False)
    return {'ok': ok, 'packetSha256': PACKET_SHA, 'syntheticFixtures': True,
            'validationOnly': True, 'durableState': False, 'driveWrites': False,
            'approvalReads': False, 'renderAllowed': False, 'scan': report,
            'parts': jobs[0].get('sourceSha256', {}) if jobs else {}}


if __name__ == '__main__':
    try:
        fixture_packet()  # Pin check BEFORE credentials/network.
        info = os.environ.get('GDRIVE_SA_JSON')
        if not info: raise DriveError('Existing Drive credential unavailable')
        client = DriveClient.service_account(json.loads(info), readonly=True)
        report = check_fixture(client)
        output = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'four-part-drive-fixture-report.json'
        output.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report))
        if not report['ok']: raise DriveError('Synthetic fixture did not pass full four-part intake')
    except (DriveError, ValueError, OSError, KeyError, TypeError) as error:
        raise SystemExit(str(error)) from None
