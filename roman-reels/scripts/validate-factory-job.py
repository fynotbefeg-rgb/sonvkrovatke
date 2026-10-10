"""Offline candidate-contract validation. Does not authorize production or read secrets."""
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys

from jsonschema import Draft202012Validator, FormatChecker

SCHEMA = Path(__file__).resolve().parents[1] / "schemas/factory-job-v1.schema.json"


def legacy_hash(job):
    # Use the existing JS serialization exactly, including Unicode edge cases.
    values = [job["reelId"], job["scriptVersion"], job["hookText"], job["scriptText"]]
    result = subprocess.run(
        ["node", "-e", "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(s))))"],
        input=json.dumps(values, ensure_ascii=True), text=True, capture_output=True, check=True,
    )
    return hashlib.sha256(result.stdout.encode("utf-8")).hexdigest()


def validate(job):
    schema = json.loads(SCHEMA.read_text())
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(job), key=lambda e: str(list(e.path)))
    if errors:
        # Report paths, never the input text or credentials embedded in values.
        raise ValueError("Schema rejected at " + ", ".join("/".join(map(str, e.path)) or "root" for e in errors))

    def require(ok, reason):
        if not ok:
            raise ValueError(reason)

    def finite(value):
        if isinstance(value, dict):
            return all(finite(v) for v in value.values())
        if isinstance(value, list):
            return all(finite(v) for v in value)
        return not isinstance(value, float) or math.isfinite(value)

    require(finite(job), "Non-finite number")
    require(job["reelId"] == f'R-{job["topicId"]}-h{job["hookNumber"]}', "Reel identity mismatch")
    require(job["scriptHash"] == legacy_hash(job), "Legacy script hash mismatch")
    if "approval" in job:
        require(job["approval"]["scriptHash"] == job["scriptHash"], "Approval hash mismatch")
    duration = job.get("sourceVideo", {}).get("duration")
    for field in ("wordTimings", "speechSegments"):
        if field not in job:
            continue
        require(duration is not None, "Timed speech needs sourceVideo")
        previous_end = 0
        for interval in job[field]:
            require(previous_end <= interval["start"] < interval["end"] <= duration,
                    "Speech intervals overlap, are unordered or exceed source")
            previous_end = interval["end"]
    assets = job.get("visualAssets", [])
    asset_ids = {a["id"] for a in assets}
    require(len(asset_ids) == len(assets), "Duplicate asset IDs")
    words = job.get("wordTimings", [])
    seen_events = set()
    for event in job.get("montagePlan", {}).get("events", []):
        require(duration is not None, "Montage needs sourceVideo")
        require(event["id"] not in seen_events, "Duplicate event IDs")
        seen_events.add(event["id"])
        require(0 <= event["start"] < event["end"] <= duration, "Event exceeds source")
        first, last = event["wordStart"], event["wordEnd"]
        require(first <= last < len(words), "Unknown word anchor")
        require(event["start"] <= words[first]["start"] and event["end"] >= words[last]["end"],
                "Event does not cover its word anchors")
        require("assetId" not in event or event["assetId"] in asset_ids, "Unknown asset")
    if "renderSettings" in job:
        settings = job["renderSettings"]
        safe = settings["safeZone"]
        require(safe["left"] + safe["right"] < settings["width"] and
                safe["top"] + safe["bottom"] < settings["height"], "Empty safe zone")
    return job


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python validate-factory-job.py <job.json>")
    try:
        validate(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")))
    except (ValueError, OSError, subprocess.SubprocessError):
        sys.exit("Candidate contract rejected; inspect input privately. No production action taken.")
    print("Candidate contract valid. Fresh trusted approval and real file QC still required.")
