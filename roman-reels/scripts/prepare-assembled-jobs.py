"""Bind cached real part timings to verified development assemblies, never approve."""
import argparse
import copy
import importlib.util
import json
import math
from pathlib import Path

from factory_media import public_source, probe, decode, sha256, validate_intervals

spec = importlib.util.spec_from_file_location("development", Path(__file__).with_name("prepare-development-job.py"))
development = importlib.util.module_from_spec(spec)
spec.loader.exec_module(development)


def require(ok, message):
    if not ok:
        raise ValueError(message)


def shifted(intervals, offset):
    return [{**item, "start": round(item["start"] + offset, 6),
             "end": round(item["end"] + offset, 6)} for item in intervals]


def prepare(manifest, body, hooks, public_directory):
    require(manifest.get("assemblyVersion") == "1.0.0" and
            manifest.get("mode") == "development" and manifest.get("complete") is True and
            manifest.get("productionReady") is False, "Incomplete or unsupported assembly")
    variants = manifest["variants"]
    require(len(variants) == 3 and {v["hookNumber"] for v in variants} == {1, 2, 3}
            and set(hooks) == {1, 2, 3}, "Exactly three distinct hooks required")
    # Verify the actual original bytes and intervals, not just the cached transcript.
    development.prepare(body)
    for hook in hooks.values():
        development.prepare(hook)
    require(len({public_source(s["sourceRelativePath"]) for s in [body, *hooks.values()]}) == 4,
            "Hook and body files must be distinct")
    results = []
    for variant in sorted(variants, key=lambda v: v["hookNumber"]):
        number = variant["hookNumber"]
        hook = hooks[number]
        require(variant["reelId"] == f"R-{manifest['topicId']}-h{number}", "Assembly identity mismatch")
        require(variant["outputFile"] == variant["reelId"] + ".mp4", "Unexpected output filename")
        parts = variant["parts"]
        require(len(parts) == 2 and [p["role"] for p in parts] == ["hook", "body"],
                "Assembly must contain hook then body")
        cursor = 0
        for part, speech in zip(parts, [hook, body]):
            require(part["localPath"] == speech["sourceRelativePath"] and
                    part["sha256"] == speech["sourceSha256"] and
                    part["originalDuration"] == speech["sourceMetadata"]["duration"],
                    "Cached speech does not match assembly part")
            end = cursor + math.ceil(part["originalDuration"] * 25) / 25
            require(math.isclose(part["timelineStart"], cursor, abs_tol=1e-8) and
                    math.isclose(part["timelineEnd"], end, abs_tol=1e-8), "Part timeline changed")
            cursor = end
        offset = parts[1]["timelineStart"]
        require(math.isclose(variant["bodyStart"], offset, abs_tol=1e-8) and
                math.isclose(variant["duration"], cursor, abs_tol=1e-8), "Invalid body offset or duration")
        relative = str(Path(public_directory) / variant["outputFile"])
        source = public_source(relative)
        require(sha256(source) == variant["sha256"], "Assembled source checksum mismatch")
        metadata = probe(source)
        qc = variant["technicalQc"]
        require(qc.get("technicalPassed") is True and qc.get("productionReady") is False and
                qc.get("outputSha256") == variant["sha256"] and qc.get("metadata") == metadata,
                "Assembly QC does not match file")
        require(metadata["fps"] == 25 and metadata["width"] == 1080 and metadata["height"] == 1920
                and abs(metadata["duration"] - cursor) <= 0.04, "Unexpected assembly metadata")
        decode(source)
        words = copy.deepcopy(hook["wordTimings"]) + shifted(body["wordTimings"], offset)
        segments = copy.deepcopy(hook["speechSegments"]) + shifted(body["speechSegments"], offset)
        validate_intervals(words, metadata["duration"])
        validate_intervals(segments, metadata["duration"])
        # ASR text remains a development transcript, never an approved script.
        job = {"schemaVersion": "1.0.0", "mode": "development",
               "reelId": variant["reelId"], "topicId": manifest["topicId"], "hookNumber": number,
               "scriptVersion": 1, "hookText": hook["transcriptText"],
               "scriptText": hook["transcriptText"] + "\n\n" + body["transcriptText"],
               "approvalStatus": "pending_approval", "productionStatus": "transcribed",
               "sourceVideo": {"localPath": relative, "sha256": variant["sha256"],
                   "duration": metadata["duration"], "width": metadata["width"],
                   "height": metadata["height"], "fps": metadata["fps"], "origin": "repository_fixture"},
               "wordTimings": words, "speechSegments": segments}
        job["scriptHash"] = development.contract.legacy_hash(job)
        development.contract.validate(job)
        evidence = {"artifactVersion": "1.0.0", "mode": "development", "reelId": job["reelId"],
                    "alignmentMethod": "cached_part_timings_with_assembly_offset",
                    "sourceRelativePath": relative, "sourceSha256": variant["sha256"],
                    "bodyStart": offset, "hookWordCount": len(hook["wordTimings"]),
                    "bodyWordCount": len(body["wordTimings"]), "wordTimings": words,
                    "speechSegments": segments, "parts": [
                        {"role": role, "sourceSha256": speech["sourceSha256"],
                         "alignmentMethod": speech["alignmentMethod"], "offset": shift}
                        for role, speech, shift in [("hook", hook, 0), ("body", body, offset)]],
                    "needsSpeechReview": True, "productionReady": False,
                    "limitations": ["Not a new recognition or forced alignment of assembled audio",
                                    "ASR wording and acoustic seam require review",
                                    "No current approval receipt or production authorization"]}
        results.append((job, evidence))
    for speech in [body, *hooks.values()]:
        require(sha256(public_source(speech["sourceRelativePath"])) == speech["sourceSha256"],
                "Original part changed during preparation")
    for job, _ in results:
        require(sha256(public_source(job["sourceVideo"]["localPath"])) == job["sourceVideo"]["sha256"],
                "Assembly changed during preparation")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest")
    parser.add_argument("--body-speech", required=True)
    parser.add_argument("--hook-speech", nargs=3, required=True, help="h1 h2 h3 speech.json in order")
    parser.add_argument("--public-directory", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    read = lambda path: json.loads(Path(path).read_text(encoding="utf-8"))
    results = prepare(read(args.manifest), read(args.body_speech),
                      {i: read(path) for i, path in enumerate(args.hook_speech, 1)}, args.public_directory)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=False)  # Write only after all three variants validate.
    for job, evidence in results:
        for suffix, artifact in [("job", job), ("speech", evidence)]:
            (out / f"{job['reelId']}-{suffix}.json").write_text(
                json.dumps(artifact, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print("Three development jobs prepared; speech review and current approval still required.")
