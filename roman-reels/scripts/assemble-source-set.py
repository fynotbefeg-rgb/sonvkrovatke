"""Assemble development sources: legacy 3 variants or 6 platform-ending variants."""
import argparse
import hashlib
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import subprocess

from jsonschema import Draft202012Validator
from factory_media import PUBLIC, public_source, probe, decode, sha256, technical_qc

SCHEMA = Path(__file__).resolve().parents[1] / "schemas/source-set-v1.schema.json"
SCHEMA_V2 = SCHEMA.with_name("source-set-v2.schema.json")
FPS = 25


def verify(plan):
    schema = json.loads(SCHEMA.read_text())
    Draft202012Validator.check_schema(schema)
    if not Draft202012Validator(schema).is_valid(plan):
        raise ValueError("Invalid source-set v1: development only, exactly 3 hooks and one body")
    if {h["hookNumber"] for h in plan["hooks"]} != {1, 2, 3}:
        raise ValueError("Hooks 1, 2, 3 must each appear once")
    entries = [plan["body"], *plan["hooks"]]
    paths = []
    result = []
    for entry in entries:
        path = public_source(entry["localPath"])
        if sha256(path) != entry["sha256"]:
            raise ValueError("Source part checksum mismatch")
        if path in paths:
            raise ValueError("Each hook and body must be a distinct file")
        paths.append(path)
        metadata = probe(path)
        decode(path)
        frames = math.ceil(metadata["duration"] * FPS)
        result.append({**entry, "path": path, "metadata": metadata,
                       "frames": frames, "normalizedDuration": frames / FPS})
    return result[0], sorted(result[1:], key=lambda h: h["hookNumber"])


def text_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def verify_platform_plan(plan):
    schema = json.loads(SCHEMA_V2.read_text())
    Draft202012Validator.check_schema(schema)
    if not Draft202012Validator(schema).is_valid(plan):
        raise ValueError("Invalid development source-set v2")
    if {h["hookNumber"] for h in plan["hooks"]} != {1, 2, 3}:
        raise ValueError("Hooks 1, 2, 3 must each appear once")
    if {e["platform"] for e in plan["endings"]} != {"instagram", "tiktok"}:
        raise ValueError("Distinct Instagram and TikTok endings required")
    entries = [plan["body"], *sorted(plan["hooks"], key=lambda h: h["hookNumber"]),
               *sorted(plan["endings"], key=lambda e: e["platform"])]
    paths, checksums, result = set(), set(), []
    for entry in entries:
        if text_hash(entry["text"]) != entry["textHash"]:
            raise ValueError("Part text changed; prepare a new recording/version binding")
        path = public_source(entry["localPath"])
        if path in paths or entry["sha256"] in checksums:
            raise ValueError("Six distinct source files required; duplicate path or bytes")
        if sha256(path) != entry["sha256"]:
            raise ValueError("Source part checksum mismatch")
        paths.add(path)
        checksums.add(entry["sha256"])
        metadata = probe(path)
        decode(path)
        frames = math.ceil(metadata["duration"] * FPS)
        result.append({**entry, "path": path, "metadata": metadata,
                       "frames": frames, "normalizedDuration": frames / FPS})
    for part in result:
        if sha256(part["path"]) != part["sha256"]:
            raise ValueError("Source changed during set verification")
    return result[0], result[1:4], result[4:]


def assemble_platform_plan(plan, output_directory):
    body, hooks, endings = verify_platform_plan(plan)
    out = Path(output_directory).resolve()
    out.mkdir(parents=True, exist_ok=False)
    evidence = {"assemblyVersion": "2.0.0", "mode": "development", "topicId": plan["topicId"],
                "scriptVersion": plan["scriptVersion"], "productionReady": False,
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "complete": False, "variants": []}
    manifest_path = out / "assembly.json"
    def save():
        manifest_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    save()
    for ending in endings:
        for hook in hooks:
            parts = [hook, body, ending]
            for part in parts:
                if sha256(part["path"]) != part["sha256"]:
                    raise ValueError("Source part changed during assembly")
            reel_id = f"R-{plan['topicId']}-{ending['platform']}-h{hook['hookNumber']}"
            pending = out / f"{reel_id}.partial.mp4"
            concatenate(hook, body, pending, ending=ending)
            duration = sum(p["normalizedDuration"] for p in parts)
            qc = technical_qc(pending, duration, FPS)
            (out / f"{reel_id}-technical-qc.json").write_text(json.dumps(qc, indent=2) + "\n")
            if not qc["technicalPassed"]:
                raise ValueError("Assembled source failed technical QC")
            for part in parts:
                if sha256(part["path"]) != part["sha256"]:
                    raise ValueError("Source part changed during assembly")
            output = out / f"{reel_id}.mp4"
            pending.rename(output)
            timeline, cursor = [], 0
            for role, part in zip(["hook", "body", "ending"], parts):
                end = cursor + part["normalizedDuration"]
                timeline.append({"role": role, "localPath": part["localPath"], "sha256": part["sha256"],
                    "text": part["text"], "textHash": part["textHash"],
                    "originalDuration": part["metadata"]["duration"],
                    "timelineStart": cursor, "timelineEnd": end})
                cursor = end
            evidence["variants"].append({"reelId": reel_id, "platform": ending["platform"],
                "hookNumber": hook["hookNumber"], "outputFile": output.name,
                "sha256": qc["outputSha256"], "duration": duration,
                "bodyStart": timeline[1]["timelineStart"], "endingStart": timeline[2]["timelineStart"],
                "technicalQc": qc, "parts": timeline})
            save()
            print(f"Assembled {reel_id}: {duration:.3f}s; development source only.", flush=True)
    for part in [body, *hooks, *endings]:
        if sha256(part["path"]) != part["sha256"]:
            raise ValueError("Source changed before assembly completion")
    evidence["complete"] = True
    save()
    return evidence


def concatenate(hook, body, output, ending=None):
    parts = [hook, body] + ([ending] if ending is not None else [])
    filters = []
    for i, part in enumerate(parts):
        filters.append(f"[{i}:v:0]scale=1080:1920:force_original_aspect_ratio=increase,"
                       f"crop=1080:1920,setsar=1,fps={FPS},format=yuv420p,"
                       f"tpad=stop_mode=clone:stop_duration=0.04,trim=end_frame={part['frames']},"
                       f"setpts=PTS-STARTPTS[v{i}]")
        filters.append(f"[{i}:a:0]aresample=48000,aformat=channel_layouts=stereo,apad,"
                       f"atrim=duration={part['normalizedDuration']},asetpts=PTS-STARTPTS[a{i}]")
    filters.append("".join(f"[v{i}][a{i}]" for i in range(len(parts))) +
                   f"concat=n={len(parts)}:v=1:a=1[v][a]")
    inputs = [arg for part in parts for arg in ["-i", str(part["path"])]]
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-n",
        *inputs, "-filter_complex_threads", "1",
        "-filter_complex", ";".join(filters), "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-threads", "2",
        "-c:a", "aac", "-b:a", "192k", "-r", str(FPS), "-fps_mode", "cfr",
        "-movflags", "+faststart", str(output)],
        capture_output=True, timeout=600, check=True)


def assemble(plan, output_directory):
    if plan.get("assemblyVersion") == "2.0.0":
        return assemble_platform_plan(plan, output_directory)
    body, hooks = verify(plan)  # Verify the whole set before writing anything.
    out = Path(output_directory).resolve()
    out.mkdir(parents=True, exist_ok=False)  # No overwriting a previous run.
    evidence = {"assemblyVersion": "1.0.0", "mode": "development", "topicId": plan["topicId"],
                "createdAt": datetime.now(timezone.utc).isoformat(), "productionReady": False,
                "complete": False, "variants": []}
    manifest_path = out / "assembly.json"
    manifest_path.write_text(json.dumps(evidence, indent=2) + "\n")
    for hook in hooks:
        for part in [hook, body]:
            if sha256(part["path"]) != part["sha256"]:
                raise ValueError("Source part changed during assembly")
        reel_id = f"R-{plan['topicId']}-h{hook['hookNumber']}"
        pending = out / f"{reel_id}.partial.mp4"
        concatenate(hook, body, pending)
        duration = hook["normalizedDuration"] + body["normalizedDuration"]
        qc = technical_qc(pending, duration, FPS)
        (out / f"{reel_id}-technical-qc.json").write_text(json.dumps(qc, indent=2) + "\n")
        if not qc["technicalPassed"]:
            raise ValueError("Assembled source failed technical QC")
        for part in [hook, body]:
            if sha256(part["path"]) != part["sha256"]:
                raise ValueError("Source part changed during assembly")
        output = out / f"{reel_id}.mp4"
        pending.rename(output)
        # This is source assembly, not the professional final montage.
        evidence["variants"].append({"reelId": reel_id, "hookNumber": hook["hookNumber"],
            "outputFile": output.name, "sha256": qc["outputSha256"], "duration": duration,
            "bodyStart": hook["normalizedDuration"], "technicalQc": qc,
            "parts": [{"role": "hook", "localPath": hook["localPath"], "sha256": hook["sha256"],
                       "originalDuration": hook["metadata"]["duration"], "timelineStart": 0,
                       "timelineEnd": hook["normalizedDuration"]},
                      {"role": "body", "localPath": body["localPath"], "sha256": body["sha256"],
                       "originalDuration": body["metadata"]["duration"],
                       "timelineStart": hook["normalizedDuration"], "timelineEnd": duration}]})
        manifest_path.write_text(json.dumps(evidence, indent=2) + "\n")
        print(f"Assembled {reel_id}: {duration:.3f}s; development source only.", flush=True)
    evidence["complete"] = True
    manifest_path.write_text(json.dumps(evidence, indent=2) + "\n")
    return evidence


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("plan")
    parser.add_argument("--out", required=True, help="New output directory; no overwrite")
    args = parser.parse_args()
    assemble(json.loads(Path(args.plan).read_text(encoding="utf-8")), args.out)
