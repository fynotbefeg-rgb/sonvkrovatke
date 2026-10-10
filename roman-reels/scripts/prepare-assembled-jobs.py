"""Bind cached real part timings to verified development assemblies, never approve."""
import argparse
import copy
import hashlib
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


def prepare(manifest, body, hooks, public_directory, endings=None):
    platform_mode = manifest.get("assemblyVersion") == "2.0.0"
    require(manifest.get("assemblyVersion") in {"1.0.0", "2.0.0"} and
            manifest.get("mode") == "development" and manifest.get("complete") is True and
            manifest.get("productionReady") is False, "Incomplete or unsupported assembly")
    variants = manifest["variants"]
    require(len(variants) == (6 if platform_mode else 3) and {v["hookNumber"] for v in variants} == {1, 2, 3}
            and set(hooks) == {1, 2, 3}, "Exactly three distinct hooks required")
    if platform_mode:
        require(endings is not None and set(endings) == {"instagram", "tiktok"},
                "Real speech timings for both endings required")
        require({(v["platform"], v["hookNumber"]) for v in variants} ==
                {(p, n) for p in endings for n in [1, 2, 3]}, "Exactly six distinct platform variants required")
        require(type(manifest.get("scriptVersion")) is int and 1 <= manifest["scriptVersion"] <= 9007199254740991,
                "Invalid recording script revision")
    else:
        require(endings is None, "Legacy assembly must not ignore endings")
    # Verify the actual original bytes and intervals, not just the cached transcript.
    development.prepare(body)
    all_speech = [body, *hooks.values(), *(endings.values() if platform_mode else [])]
    for speech in all_speech[1:]:
        development.prepare(speech)
    require(len({public_source(s["sourceRelativePath"]) for s in all_speech}) == len(all_speech),
            "Source part files must be distinct")
    results = []
    for variant in sorted(variants, key=lambda v: v["hookNumber"]):
        number = variant["hookNumber"]
        hook = hooks[number]
        topic = manifest["topicId"] + (f"-{variant['platform']}" if platform_mode else "")
        require(variant["reelId"] == f"R-{topic}-h{number}", "Assembly identity mismatch")
        require(variant["outputFile"] == variant["reelId"] + ".mp4", "Unexpected output filename")
        parts = variant["parts"]
        speeches = [hook, body] + ([endings[variant["platform"]]] if platform_mode else [])
        roles = ["hook", "body"] + (["ending"] if platform_mode else [])
        require(len(parts) == len(roles) and [p["role"] for p in parts] == roles,
                "Incorrect assembly part order")
        cursor = 0
        for part, speech in zip(parts, speeches):
            require(part["localPath"] == speech["sourceRelativePath"] and
                    part["sha256"] == speech["sourceSha256"] and
                    part["originalDuration"] == speech["sourceMetadata"]["duration"],
                    "Cached speech does not match assembly part")
            if platform_mode:
                require(isinstance(part.get("text"), str) and part["text"].strip() and
                        hashlib.sha256(part["text"].encode("utf-8")).hexdigest() == part.get("textHash"),
                        "Declared part text hash mismatch")
            end = cursor + math.ceil(part["originalDuration"] * 25) / 25
            require(math.isclose(part["timelineStart"], cursor, abs_tol=1e-8) and
                    math.isclose(part["timelineEnd"], end, abs_tol=1e-8), "Part timeline changed")
            cursor = end
        offset = parts[1]["timelineStart"]
        require(math.isclose(variant["bodyStart"], offset, abs_tol=1e-8) and
                math.isclose(variant["duration"], cursor, abs_tol=1e-8), "Invalid body offset or duration")
        if platform_mode:
            require(math.isclose(variant["endingStart"], parts[2]["timelineStart"], abs_tol=1e-8),
                    "Invalid ending offset")
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
        words, segments = [], []
        for part, speech in zip(parts, speeches):
            start = part["timelineStart"]
            words += shifted(speech["wordTimings"], start) if start else copy.deepcopy(speech["wordTimings"])
            segments += shifted(speech["speechSegments"], start) if start else copy.deepcopy(speech["speechSegments"])
        validate_intervals(words, metadata["duration"])
        validate_intervals(segments, metadata["duration"])
        # ASR text remains a development transcript, never an approved script.
        job = {"schemaVersion": "1.0.0", "mode": "development",
               "reelId": variant["reelId"], "topicId": topic, "hookNumber": number,
               "scriptVersion": manifest["scriptVersion"] if platform_mode else 1, "hookText": hook["transcriptText"],
               "scriptText": "\n\n".join(s["transcriptText"] for s in speeches),
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
                        for role, speech, shift in zip(roles, speeches, [p["timelineStart"] for p in parts])],
                    "needsSpeechReview": True, "productionReady": False,
                    "limitations": ["Not a new recognition or forced alignment of assembled audio",
                                    "ASR wording and acoustic seam require review",
                                    "No current approval receipt or production authorization"]}
        results.append((job, evidence))
        if platform_mode:
            evidence.update(platform=variant["platform"], endingStart=variant["endingStart"],
                            endingWordCount=len(speeches[2]["wordTimings"]),
                            declaredTextHashes=[p["textHash"] for p in parts])
    for speech in all_speech:
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
    parser.add_argument("--instagram-ending-speech")
    parser.add_argument("--tiktok-ending-speech")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    read = lambda path: json.loads(Path(path).read_text(encoding="utf-8"))
    require(bool(args.instagram_ending_speech) == bool(args.tiktok_ending_speech), "Both ending speech files required")
    endings = ({"instagram": read(args.instagram_ending_speech), "tiktok": read(args.tiktok_ending_speech)}
               if args.instagram_ending_speech else None)
    results = prepare(read(args.manifest), read(args.body_speech),
                      {i: read(path) for i, path in enumerate(args.hook_speech, 1)}, args.public_directory, endings)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=False)  # Write only after every variant validates.
    for job, evidence in results:
        for suffix, artifact in [("job", job), ("speech", evidence)]:
            (out / f"{job['reelId']}-{suffix}.json").write_text(
                json.dumps(artifact, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"{len(results)} development jobs prepared; speech review and current approval still required.")
