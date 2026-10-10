"""Bounded six-part Drive scan with a durable single-writer journal and approval gate.

Only downloads/validates inputs and registers source-set handoffs; never renders,
generates avatars, changes approvals or publishes. The next stage must recheck approval.
"""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import time
import uuid

import factory_media as media
from drive_intake_client import DriveError

spec = importlib.util.spec_from_file_location("incoming", Path(__file__).with_name("prepare-incoming-source-set.py"))
incoming = importlib.util.module_from_spec(spec)
spec.loader.exec_module(incoming)

FOLDER = "application/vnd.google-apps.folder"
LEASE_SECONDS = 1800
MAX_SET_BYTES = 1024 * 1024 * 1024
MAX_RECEIPT_BYTES = 65536
SELF_TEST_TOPIC = "intake-self-test-20261010"


def self_test_packet(packet):
    packet = copy.deepcopy(packet)
    packet["sourceSet"]["topic_id"] = SELF_TEST_TOPIC
    packet["syntheticFixtures"] = True
    for item in packet["items"]:
        item["topic_id"] = f"{SELF_TEST_TOPIC}-{item['platform']}"
        item["root_topic_id"] = SELF_TEST_TOPIC
        item["version_id"] = f"R-{item['topic_id']}-h{item['hook_id']}"
        job = {"reelId": item["version_id"], "scriptVersion": item["script_revision"],
               "hookText": item["hook_text"], "scriptText": item["script_text"]}
        item["script_hash"] = incoming.contract.legacy_hash(job)
    return packet


def require(ok, message):
    if not ok: raise ValueError(message)


def digest(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def empty_state():
    return {"stateVersion": "1.0.0", "sequence": 0, "jobs": {}, "waiting": {}}


class Journal:
    """Store provides load() and save(state, revision); conflicting writers fail closed."""
    def __init__(self, store):
        self.store = store
        self.state, self.revision = store.load()
        require(self.state.get("stateVersion") == "1.0.0" and type(self.state.get("sequence")) is int
                and self.state["sequence"] >= 0 and isinstance(self.state.get("jobs"), dict)
                and isinstance(self.state.get("waiting"), dict), "Invalid durable journal")
        for key, job in self.state["jobs"].items():
            require(re.fullmatch(r"[a-f0-9]{64}", key) and job.get("key") == key and
                    job.get("status") in {"downloading", "awaiting_approval", "source_set_ready", "retryable_error", "manual_attention", "superseded"}
                    and job.get("renderAllowed") is False
                    and key == digest([job["slot"], job["sourceFiles"], job["scriptHashes"]]),
                    "Invalid durable job")

    def save(self):
        self.state["sequence"] += 1
        self.revision = self.store.save(self.state, self.revision)

    def waiting(self, slot, reason, missing=None):
        for job in self.state["jobs"].values():
            if job["slot"] == slot and job["status"] in {"awaiting_approval", "source_set_ready"}:
                job.update(status="superseded", renderAllowed=False, nextStage="revalidate_inputs")
        self.state["waiting"][slot] = {"reason": reason, "missing": missing or []}
        self.save()

    def claim(self, key, slot, metadata, now):
        previous = self.state["jobs"].get(key)
        if (previous and previous["status"] in {"awaiting_approval", "source_set_ready"} and
                (len(previous.get("sourceSha256", {})) != 6 or len(previous.get("partTextHashes", {})) != 6)):
            previous.update(status="superseded", attempts=0)  # Reverify older validation records once.
        if previous and previous["status"] in {"awaiting_approval", "source_set_ready", "manual_attention"}:
            return None, previous
        if previous and previous["status"] == "downloading" and previous["leaseUntil"] > now:
            return None, previous
        if previous and previous.get("attempts", 0) >= 3:
            previous.update(status="manual_attention", leaseUntil=0, nextStage="retry_limit_reached")
            self.save()
            return None, previous
        for old_key, job in self.state["jobs"].items():
            if job["slot"] == slot and old_key != key and job["status"] != "superseded":
                job["status"] = "superseded"
        token = str(uuid.uuid4())
        job = {"key": key, "slot": slot, "status": "downloading", "claimToken": token,
               "leaseUntil": now + LEASE_SECONDS, "attempts": (previous or {}).get("attempts", 0) + 1,
               "downloadValidated": False, "renderAllowed": False, **metadata}
        self.state["jobs"][key] = job
        self.state["waiting"].pop(slot, None)
        self.save()  # Persist claim BEFORE network work.
        return token, job

    def finish(self, key, token, status, **details):
        job = self.state["jobs"][key]
        require(job["status"] == "downloading" and job["claimToken"] == token, "Lost job lease")
        job.update(status=status, leaseUntil=0, **details)
        self.save()


def one_child(client, folder_id, name, mime):
    files = [f for f in client.children(folder_id) if f["name"] == name]
    if not files: return None
    require(len(files) == 1 and files[0]["mimeType"] == mime, "Ambiguous or invalid Drive child")
    return files[0]


def stable(file):
    return {k: file.get(k) for k in ["id", "name", "mimeType", "parents", "size", "md5Checksum", "version", "trashed"]}


def checked_download(client, file, target, max_bytes):
    size = int(file.get("size", 0))
    require(0 < size <= max_bytes and isinstance(file.get("md5Checksum"), str)
            and re.fullmatch(r"[a-f0-9]{32}", file["md5Checksum"]), "Invalid Drive size/checksum")
    before, _ = client.metadata(file["id"])
    require(stable(before) == stable(file), "Source changed before download")
    partial = target.with_name(target.name + ".partial")
    client.download(file["id"], partial, max_bytes)
    require(partial.stat().st_size == size, "Truncated Drive download")
    md5 = hashlib.md5(usedforsecurity=False)
    with partial.open("rb") as stream:
        while block := stream.read(1024 * 1024): md5.update(block)
    require(md5.hexdigest() == file["md5Checksum"], "Downloaded Drive checksum mismatch")
    after, _ = client.metadata(file["id"])
    require(stable(after) == stable(file), "Source changed during download")
    partial.rename(target)


def approvals_match(packet, snapshot):
    # Snapshot is supplied only by the trusted workflow's authenticated reader.
    # Validation verifies exact receipt/text consistency, not a person's identity.
    require(isinstance(snapshot, dict) and isinstance(snapshot.get("items"), list), "Invalid approval snapshot")
    approved = {}
    for item in snapshot["items"]:
        key = item["version_id"]
        require(key not in approved, "Duplicate approval identity")
        if item.get("status") != "approved": continue
        require(isinstance(item.get("approved_by"), str) and item["approved_by"].strip()
                and isinstance(item.get("approved_at"), str) and item["approved_at"].strip(), "Missing approval receipt")
        approved[key] = item
    for draft in packet["items"]:
        item = approved.get(draft["version_id"])
        if not item: return False
        for field in ["topic_id", "hook_id", "script_revision", "hook_text", "script_text", "script_hash"]:
            if item.get(field) != draft[field]: return False
    return True


def scan(client, journal, incoming_id, packets, approval_loader, now=None, rejected_source_sets=()):
    now = time.time() if now is None else now
    require(len(packets) <= 30, "Too many topics in one bounded scan")
    report = {"sets": [], "downloadedSets": 0, "skippedSets": 0, "renderAllowed": False}
    for packet in packets:
        topic, version, expected = incoming.expectations(packet)
        slot = f"{topic}:v{version}"
        token, key = None, None
        try:
            # Owner-relayed editorial rejection is a veto, never an approval.
            # Match the exact body and revision; later revisions remain reviewable.
            rejected = any(record.get("topicId") == topic and
                           record.get("scriptVersion") == version and
                           record.get("bodyTextHash") == packet["sourceSet"]["body_text_hash"]
                           for record in rejected_source_sets)
            if rejected:
                journal.waiting(slot, "script_revision_rejected")
                report["sets"].append({"slot": slot, "status": "awaiting_script_revision"})
                continue
            topic_folder = one_child(client, incoming_id, topic, FOLDER)
            folder = one_child(client, topic_folder["id"], f"v{version}", FOLDER) if topic_folder else None
            if not folder:
                journal.waiting(slot, "waiting_for_parts", [p["fileName"] for p in expected])
                report["sets"].append({"slot": slot, "status": "waiting_for_parts"});continue
            files = client.children(folder["id"])
            by_name = {}
            names = {p["fileName"] for p in expected} | {"recording-set.json"}
            for file in files:
                if file["name"] not in names: continue
                require(file["name"] not in by_name, "Ambiguous source filename")
                require(folder["id"] in file.get("parents", []), "Source is outside topic/version folder")
                by_name[file["name"]] = file
            missing = sorted(names - set(by_name))
            if missing:
                journal.waiting(slot, "waiting_for_parts", missing)
                report["sets"].append({"slot": slot, "status": "waiting_for_parts"});continue
            require(all(by_name[p["fileName"]]["mimeType"] == "video/mp4" for p in expected), "Expected MP4 parts")
            require(by_name["recording-set.json"]["mimeType"] in {"application/json", "text/plain"}, "Invalid receipt MIME type")
            require(sum(int(f.get("size", 0)) for f in by_name.values()) <= MAX_SET_BYTES, "Source set exceeds byte cap")
            source_info = {name: stable(file) for name, file in sorted(by_name.items())}
            key = digest([slot, source_info, [i["script_hash"] for i in packet["items"]]])
            token, job = journal.claim(key, slot, {"topicId": topic, "scriptVersion": version,
                "sourceFiles": source_info, "scriptHashes": [i["script_hash"] for i in packet["items"]],
                "syntheticFixtures": packet.get("syntheticFixtures") is True}, now)
            if token is None:
                if job["status"] in {"awaiting_approval", "source_set_ready"}:
                    # Revocation is checked even for an unchanged already validated set.
                    current = not packet.get("syntheticFixtures") and approvals_match(packet, approval_loader())
                    job["status"] = "source_set_ready" if current else "awaiting_approval"
                    job["renderAllowed"] = False
                    job["nextStage"] = "assemble_then_verify_speech" if current else "wait_for_exact_full_script_approval"
                    journal.save()
                report["skippedSets"] += 1
                report["sets"].append({"slot": slot, "key": key, "status": job["status"]});continue
            relative = f"rr/incoming/_downloads/{key}/{token}"
            root = media.PUBLIC / relative
            root.mkdir(parents=True, exist_ok=False)
            checked_download(client, by_name["recording-set.json"], root / "recording-set.json", MAX_RECEIPT_BYTES)
            # Text/version receipt is checked before downloading large files.
            result = incoming.inspect(packet, relative)
            require(result["status"] == "waiting_for_parts", "Unexpected pre-download intake state")
            for part in expected:
                checked_download(client, by_name[part["fileName"]], root / part["fileName"], MAX_SET_BYTES)
            result = incoming.inspect(packet, relative)
            require("plan" in result, "Downloaded source set failed intake")
            # Recheck ALL remote IDs/versions after whole-set validation.
            for name, file in by_name.items():
                current, _ = client.metadata(file["id"])
                require(stable(current) == stable(file), "Source changed during set validation")
            allowed = not packet.get("syntheticFixtures") and approvals_match(packet, approval_loader())
            status = "source_set_ready" if allowed else "awaiting_approval"
            verified_parts = [result["plan"]["body"], *result["plan"]["hooks"], *result["plan"]["endings"]]
            # This is a durable source-set handoff, not an authorized render job.
            journal.finish(key, token, status, downloadValidated=True,
                variantIds=[i["version_id"] for i in packet["items"]],
                sourceSha256={Path(p["localPath"]).name: p["sha256"] for p in verified_parts},
                partTextHashes={Path(p["localPath"]).name: p["textHash"] for p in verified_parts},
                nextStage="assemble_then_verify_speech" if allowed else "wait_for_exact_full_script_approval")
            report["downloadedSets"] += 1
            report["sets"].append({"slot": slot, "key": key, "status": status})
        except (ValueError, OSError, DriveError) as error:
            if token:
                retryable = isinstance(error, DriveError) and error.status not in {400, 401, 403, 404}
                journal.finish(key, token, "retryable_error" if retryable else "manual_attention", errorCode=type(error).__name__,
                               errorReason=str(error)[:200],
                               nextStage="inspect_and_retry_input_only")
            else:
                if key in journal.state["jobs"] and journal.state["jobs"][key]["status"] == "source_set_ready":
                    journal.state["jobs"][key].update(status="awaiting_approval", nextStage="recheck_live_approval")
                journal.waiting(slot, "manual_attention")
            report["sets"].append({"slot": slot, "status": "manual_attention", "errorCode": type(error).__name__,
                                   "errorReason": str(error)[:200]})
    return report
