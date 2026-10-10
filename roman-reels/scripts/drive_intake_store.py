"""A stable user-owned Drive JSON file stores intake state across Actions runners."""
import json
from drive_intake_client import DriveError

STATE_FILE_ID = "1hOa9obXHrlj-BKQw9vTfHYoUJ6gp5EYP"
STATE_FOLDER_ID = "1PojAtqPHjfg_uknzp66sOuZcoFVQqbhE"
MAX_STATE_BYTES = 10 * 1024 * 1024


class DriveStore:
    def __init__(self, client, single_writer=False):
        self.client = client
        self.single_writer = single_writer

    def load(self):
        metadata, metadata_etag = self.client.metadata(STATE_FILE_ID)
        if (metadata.get("mimeType") != "application/json" or metadata.get("trashed") is True
                or STATE_FOLDER_ID not in metadata.get("parents", [])
                or metadata.get("capabilities", {}).get("canEdit") is not True):
            raise DriveError("Drive journal identity or writer permission rejected")
        with self.client.request("GET", "files/" + STATE_FILE_ID, {"alt": "media"}) as response:
            data = response.read(MAX_STATE_BYTES + 1)
            etag = response.headers.get("ETag") or metadata_etag
        if len(data) > MAX_STATE_BYTES: raise DriveError("Drive journal size limit exceeded")
        after, _ = self.client.metadata(STATE_FILE_ID)
        if after["version"] != metadata["version"]: raise DriveError("Drive journal changed during read")
        if not etag and not self.single_writer:
            raise DriveError("Drive journal ETag unavailable; requires serialized Actions writer")
        return json.loads(data), {"etag": etag, "version": metadata["version"]}

    def verify_conditionals(self):
        state, revision = self.load()
        if not revision["etag"]:
            return False  # API observed without ETag. Workflow-level serialization is mandatory.
        # Same content, impossible ETag. A correct API rejects without modifying bytes.
        try:
            self.client.update_json(STATE_FILE_ID, state, '"roman-intake-stale-probe"')
        except DriveError as error:
            if error.status == 412: return True
            raise
        raise DriveError("Drive ignored conditional write; intake is blocked")

    def save(self, state, revision):
        current, _ = self.client.metadata(STATE_FILE_ID)
        if current["version"] != revision["version"]: raise DriveError("Drive journal revision conflict")
        self.client.update_json(STATE_FILE_ID, state, revision["etag"], single_writer=self.single_writer)
        actual, new_revision = self.load()
        if actual != state: raise DriveError("Drive journal write verification failed")
        return new_revision
