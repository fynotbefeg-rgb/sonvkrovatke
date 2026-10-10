"""Drive API transport using the existing rclone OAuth remote, never logging secrets."""
import configparser
import json
from pathlib import Path
import subprocess
import urllib.error
import urllib.parse
import urllib.request


class DriveError(RuntimeError):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


class DriveClient:
    def __init__(self, config_file, incoming_id):
        self.config_file = Path(config_file)
        self.incoming_id = incoming_id
        self.refresh()

    @classmethod
    def service_account(cls, info):
        from google.oauth2 import service_account
        instance = cls.__new__(cls)
        instance.credentials = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/drive"])
        instance.refresh()
        return instance

    def refresh(self):
        if getattr(self, "credentials", None) is not None:
            from google.auth.transport.requests import Request
            try:
                self.credentials.refresh(Request())
                self.token = self.credentials.token
                return
            except Exception:
                raise DriveError("Drive service-account authentication failed; no credential details logged") from None
        result = subprocess.run(["rclone", "--config", str(self.config_file), "lsf", "roman-drive:",
            "--drive-root-folder-id", self.incoming_id, "--max-depth", "1", "--retries", "1"],
            capture_output=True, timeout=60)
        if result.returncode:
            raise DriveError("Drive OAuth connection failed; no token details logged")
        config = configparser.ConfigParser(interpolation=None)
        config.read(self.config_file)
        try:
            self.token = json.loads(config["roman-drive"]["token"])["access_token"]
        except (KeyError, ValueError):
            raise DriveError("Existing roman-drive OAuth token unavailable") from None

    def request(self, method, path, query=None, body=None, etag=None, upload=False):
        base = "https://www.googleapis.com/" + ("upload/drive/v3/" if upload else "drive/v3/")
        url = base + path + ("?" + urllib.parse.urlencode(query) if query else "")
        headers = {"Authorization": "Bearer " + self.token, "Cache-Control": "no-cache"}
        if body is not None:
            headers["Content-Type"] = "application/json; charset=utf-8"
        if etag:
            headers["If-Match"] = etag
        for attempt in range(2):
            try:
                response = urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers, method=method), timeout=60)
                return response
            except urllib.error.HTTPError as error:
                code = error.code
                error.close()
                if code == 401 and attempt == 0 and method == "GET":
                    self.refresh();headers["Authorization"] = "Bearer " + self.token
                    continue
                raise DriveError(f"Drive {method} failed: HTTP {code}", status=code) from None
            except (OSError, TimeoutError):
                # Writes are never blindly retried after an ambiguous response.
                raise DriveError(f"Drive {method} connection failed; inspect state before retry") from None

    def metadata(self, file_id):
        with self.request("GET", "files/" + urllib.parse.quote(file_id, safe=""),
                          {"fields": "id,name,mimeType,parents,size,md5Checksum,version,trashed,capabilities"}) as response:
            return json.load(response), response.headers.get("ETag")

    def children(self, folder_id):
        files, page = [], None
        while True:
            query = {"q": f"'{folder_id}' in parents and trashed = false", "pageSize": 100,
                     "fields": "nextPageToken,files(id,name,mimeType,parents,size,md5Checksum,version,trashed)"}
            if page: query["pageToken"] = page
            with self.request("GET", "files", query) as response: data = json.load(response)
            files += data.get("files", [])
            if len(files) > 500: raise DriveError("Drive inventory limit exceeded")
            page = data.get("nextPageToken")
            if not page: return files

    def download(self, file_id, destination, max_bytes):
        count = 0
        with self.request("GET", "files/" + urllib.parse.quote(file_id, safe=""), {"alt": "media"}) as response:
            with Path(destination).open("xb") as stream:
                while block := response.read(1024 * 1024):
                    count += len(block)
                    if count > max_bytes: raise DriveError("Drive download size limit exceeded")
                    stream.write(block)
        return count

    def update_json(self, file_id, data, etag, single_writer=False):
        if not etag and not single_writer: raise DriveError("Drive state has no ETag or serialized writer")
        body = json.dumps(data, ensure_ascii=False, allow_nan=False).encode("utf-8")
        with self.request("PATCH", "files/" + urllib.parse.quote(file_id, safe=""),
            {"uploadType": "media", "fields": "id,version"}, body, etag, upload=True) as response:
            return json.load(response)
