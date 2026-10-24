"""One bounded authenticated cloud scan; no paid APIs, renders, or approval writes."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

from drive_intake import Journal, scan, self_test_packet, incoming
from drive_intake_client import DriveClient, DriveError
from drive_intake_store import DriveStore

INCOMING = "1Qs3YJQB9Hr8H7B0Fa7MWlwsQ0LLGBPoQ"
ASSETS = "1bLzHi6K1HxXesmRj_dhghCsWk5spcPuf"
SCRIPT_DIR = Path(__file__).resolve().parent


def load_packets(file):
    """Explicit operator-supplied registry; validate before credentials or network."""
    with Path(file).open("rb") as stream:
        data = stream.read(2 * 1024 * 1024 + 1)
    if len(data) > 2 * 1024 * 1024:
        raise ValueError("Packet registry exceeds byte limit")
    packets = json.loads(data)
    if isinstance(packets, dict):
        packets = [packets]
    if not isinstance(packets, list) or not 1 <= len(packets) <= 30:
        raise ValueError("Registry must contain 1..30 explicit packets")
    slots = set()
    for packet in packets:
        if not isinstance(packet, dict):
            raise ValueError("Packet must be an object")
        if "syntheticFixtures" in packet and type(packet["syntheticFixtures"]) is not bool:
            raise ValueError("syntheticFixtures must be a boolean")
        topic, version, _ = incoming.expectations(packet)
        slot = (topic, version)
        if slot in slots:
            raise ValueError("Duplicate topic/revision packet")
        slots.add(slot)
    return packets


def current_approvals():
    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / "approvals.json"
        response = subprocess.run(["node", str(SCRIPT_DIR / "check-production-queue.mjs"), str(output)],
            capture_output=True, timeout=45)
        if response.returncode: raise DriveError("Authenticated full-script approvals unavailable; no handoff allowed")
        return json.loads(output.read_text())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="One bounded Drive intake; never renders")
    parser.add_argument("--packets", type=Path, help="Explicit packet JSON; no change to scheduled defaults")
    args = parser.parse_args()
    try:
        synthetic = os.environ.get("ROMAN_INTAKE_SELF_TEST") == "true"
        if args.packets and synthetic:
            raise ValueError("Custom packets cannot use the legacy six-part self-test switch")
        packets = load_packets(args.packets or SCRIPT_DIR.parent / "research/platform-ending-drafts-v2.json")
        value = os.environ.get("GDRIVE_SA_JSON")
        if not value: raise DriveError("Existing GDRIVE_SA_JSON secret unavailable")
        client = DriveClient.service_account(json.loads(value))
        metadata, _ = client.metadata(INCOMING)
        if metadata.get("mimeType") != "application/vnd.google-apps.folder" or ASSETS not in metadata.get("parents", []):
            raise DriveError("Incoming identity mismatch")
        serialized = (os.environ.get("GITHUB_ACTIONS") == "true" and
                      os.environ.get("ROMAN_INTAKE_SINGLE_WRITER") == "true")
        store = DriveStore(client, single_writer=serialized)
        conditional = store.verify_conditionals()
        journal = Journal(store)
        if synthetic:
            packets = [self_test_packet(packets[0])]
            # Reset only a FAILED synthetic fixture for a deliberate diagnostic rerun.
            # Real source sets and validated fixtures are never reset by this path.
            changed = False
            for job in journal.state["jobs"].values():
                if job.get("syntheticFixtures") is True and job["topicId"] == packets[0]["sourceSet"]["topic_id"] and job["status"] == "manual_attention":
                    job.update(status="superseded", attempts=0, leaseUntil=0,
                               selfTestResets=job.get("selfTestResets", 0)+1)
                    changed = True
            if changed: journal.save()
        feedback = json.loads((SCRIPT_DIR.parent / "research/roman-editorial-feedback-v1.json").read_text())
        if feedback.get("feedbackVersion") != "1.0.0" or not isinstance(feedback.get("rejectedSourceSets"), list):
            raise DriveError("Editorial feedback unavailable or invalid; intake remains blocked")
        report = scan(client, journal, INCOMING, packets, current_approvals,
                      rejected_source_sets=feedback["rejectedSourceSets"])
        report.update(stateSequence=journal.state["sequence"], durableState=True, syntheticFixtures=all(p.get("syntheticFixtures") is True for p in packets),
                      writerProtection="etag_conditional" if conditional else "serialized_actions_with_content_hash_checks")
        Path(os.environ.get("RUNNER_TEMP", "/tmp"), "drive-intake-report.json").write_text(json.dumps(report, indent=2)+"\n")
        print(json.dumps(report))
        print(f"IntakeSummary downloaded={report['downloadedSets']} skipped={report['skippedSets']} sequence={report['stateSequence']} synthetic={synthetic}")
        if any(item["status"] == "manual_attention" for item in report["sets"]):
            raise DriveError("Intake needs attention; diagnostic state persisted, production remains blocked")
    except (DriveError, ValueError, OSError, KeyError, TypeError) as error:
        raise SystemExit(str(error)) from None
