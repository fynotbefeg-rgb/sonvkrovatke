"""Check existing Actions OAuth against the verified incoming folder; no writes."""
import json
import os
from pathlib import Path
import tempfile
from drive_intake_client import DriveClient, DriveError

INCOMING = "1Qs3YJQB9Hr8H7B0Fa7MWlwsQ0LLGBPoQ"
ASSETS = "1bLzHi6K1HxXesmRj_dhghCsWk5spcPuf"

if __name__ == "__main__":
    try:
        content = os.environ.get("RCLONE_CONFIG_CONTENT")
        if not content: raise DriveError("Existing RCLONE_CONFIG secret is unavailable")
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "rclone.conf"
            config.write_text(content);config.chmod(0o600)
            client = DriveClient(config, INCOMING)
            with client.request("GET", "about", {"fields": "user(emailAddress)"}) as response:
                identity = json.load(response)["user"]["emailAddress"]
            print(json.dumps({"actionsDriveAccount": identity}))
            metadata, _ = client.metadata(INCOMING)
            if metadata["mimeType"] != "application/vnd.google-apps.folder" or ASSETS not in metadata["parents"]:
                raise DriveError("Incoming folder identity/parent mismatch")
            files = client.children(INCOMING)
            report = {"incomingId": INCOMING, "credential": "existing_actions_rclone_oauth",
                      "readVerified": True, "canAddChildren": metadata.get("capabilities", {}).get("canAddChildren", False),
                      "fileCount": len(files), "productionStarted": False}
            Path(os.environ.get("RUNNER_TEMP", "/tmp"), "drive-intake-access.json").write_text(json.dumps(report, indent=2)+"\n")
            print(json.dumps(report))
    except DriveError as error:
        raise SystemExit(str(error)) from None
