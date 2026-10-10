"""One bounded authenticated cloud scan; no paid APIs, renders, or approval writes."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

from drive_intake import Journal, scan
from drive_intake_client import DriveClient, DriveError
from drive_intake_store import DriveStore

INCOMING = "1Qs3YJQB9Hr8H7B0Fa7MWlwsQ0LLGBPoQ"
ASSETS = "1bLzHi6K1HxXesmRj_dhghCsWk5spcPuf"
SCRIPT_DIR = Path(__file__).resolve().parent


def current_approvals():
    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / "approvals.json"
        response = subprocess.run(["node", str(SCRIPT_DIR / "check-production-queue.mjs"), str(output)],
            capture_output=True, timeout=45)
        if response.returncode: raise DriveError("Authenticated full-script approvals unavailable; no handoff allowed")
        return json.loads(output.read_text())


if __name__ == "__main__":
    try:
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
        packets = json.loads((SCRIPT_DIR.parent / "research/platform-ending-drafts-v2.json").read_text())
        report = scan(client, journal, INCOMING, packets, current_approvals)
        report.update(stateSequence=journal.state["sequence"], durableState=True,
                      writerProtection="etag_conditional" if conditional else "serialized_actions_with_content_hash_checks")
        Path(os.environ.get("RUNNER_TEMP", "/tmp"), "drive-intake-report.json").write_text(json.dumps(report, indent=2)+"\n")
        print(json.dumps(report))
    except (DriveError, ValueError) as error:
        raise SystemExit(str(error)) from None
