"""Inspect a six-part recording receipt and prepare a development-only source set.

No Drive downloads, approval writes, speech recognition or production authorization.
The receipt declares which text was recorded; actual speech still needs verification.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import re

import factory_media as media


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


assembler = load("incoming_assembler", "assemble-source-set.py")
contract = load("incoming_contract", "validate-factory-job.py")


def require(ok, message):
    if not ok:
        raise ValueError(message)


def expectations(packet):
    require(packet.get("draftVersion") == "2.0.0" and packet.get("mode") == "editorial"
            and packet.get("productionReady") is False, "Unsupported editorial packet")
    source = packet["sourceSet"]
    topic = source["topic_id"]
    require(isinstance(topic, str) and re.fullmatch(r"[a-z0-9][a-z0-9_-]*", topic), "Invalid topic ID")
    require(source["recordingParts"] == 6 and len(source["hooks"]) == 3 and
            {h["hook_id"] for h in source["hooks"]} == {1, 2, 3} and
            len(source["endings"]) == 2 and
            {e["platform"] for e in source["endings"]} == {"instagram", "tiktok"},
            "Exactly three hooks, one body, two endings required")
    require(source["status"] == "pending_approval", "Development packet must remain pending")
    items = packet["items"]
    versions = {item["script_revision"] for item in items}
    require(len(items) == 6 and len(versions) == 1, "One revision and six full texts required")
    version = next(iter(versions))
    require(type(version) is int and 1 <= version <= 9007199254740991, "Invalid script revision")
    expected = [{"fileName": "body.mp4", "text": source["body_text"], "role": "body"}]
    expected += [{"fileName": f"hook-{h['hook_id']}.mp4", "role": "hook",
                  "hookNumber": h["hook_id"], "text": h["hook_text"]}
                 for h in sorted(source["hooks"], key=lambda h: h["hook_id"])]
    for e in sorted(source["endings"], key=lambda e: e["platform"]):
        require(assembler.text_hash(e["text"]) == e["text_hash"], "Ending text hash mismatch")
        expected.append({"fileName": f"ending-{e['platform']}.mp4", "role": "ending",
                         "platform": e["platform"], "text": e["text"]})
    require(assembler.text_hash(source["body_text"]) == source["body_text_hash"], "Body text hash mismatch")
    seen = set()
    for item in items:
        key = (item["platform"], item["hook_id"])
        require(key not in seen and key[0] in {"instagram", "tiktok"} and key[1] in {1, 2, 3},
                "Duplicate or unknown full-text variant")
        seen.add(key)
        hook = next(h for h in source["hooks"] if h["hook_id"] == item["hook_id"])
        ending = next(e for e in source["endings"] if e["platform"] == item["platform"])
        text = "\n\n".join([hook["hook_text"], source["body_text"], ending["text"]])
        job = {"reelId": f"R-{topic}-{item['platform']}-h{item['hook_id']}",
               "scriptVersion": version, "hookText": hook["hook_text"], "scriptText": text}
        require(item["version_id"] == job["reelId"] and item["hook_text"] == job["hookText"]
                and item["script_text"] == text and item["script_hash"] == contract.legacy_hash(job)
                and item["status"] == "pending_approval", "Full-text binding mismatch")
    for part in expected:
        require(isinstance(part["text"], str) and part["text"].strip(), "Empty part text")
        part["textHash"] = assembler.text_hash(part["text"])
    return topic, version, expected


def inspect(packet, relative_directory):
    topic, version, expected = expectations(packet)
    # Validate the directory even when it is empty. Never traverse outside public.
    require(isinstance(relative_directory, str) and relative_directory and
            not Path(relative_directory).is_absolute() and ".." not in Path(relative_directory).parts
            and not any(c in relative_directory for c in ["\\", ":"])
            and not any(ord(c) < 32 for c in relative_directory), "Unsafe incoming directory")
    root = (media.PUBLIC / relative_directory).resolve()
    incoming = (media.PUBLIC / "rr/incoming").resolve()
    require(root.is_relative_to(incoming) and root.is_dir(), "Incoming directory absent or outside rr/incoming")
    base = {"mode": "development", "productionReady": False, "topicId": topic,
            "scriptVersion": version, "needsSpeechReview": True}
    receipt_path = root / "recording-set.json"
    missing = [p["fileName"] for p in expected if not (root / p["fileName"]).is_file()]
    if not receipt_path.is_file():
        return {**base, "status": "waiting_for_parts", "missing": [*missing, "recording-set.json"]}
    require(receipt_path.resolve().is_relative_to(root), "Receipt is outside incoming directory")
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    require(set(receipt) == {"receiptVersion", "topicId", "scriptVersion", "files"}
            and receipt["receiptVersion"] == "1.0.0" and receipt["topicId"] == topic
            and type(receipt["scriptVersion"]) is int and receipt["scriptVersion"] == version,
            "Receipt topic/revision mismatch")
    files = receipt["files"]
    require(isinstance(files, list) and len(files) == 6, "Six declared source files required")
    declared = {}
    for entry in files:
        require(set(entry) == {"fileName", "sha256", "textHash"} and
                entry["fileName"] not in declared, "Invalid or duplicate receipt entry")
        require(isinstance(entry["sha256"], str) and re.fullmatch(r"[a-f0-9]{64}", entry["sha256"]),
                "Invalid source checksum")
        declared[entry["fileName"]] = entry
    require(set(declared) == {p["fileName"] for p in expected}, "Unexpected source filenames")
    for part in expected:
        require(declared[part["fileName"]]["textHash"] == part["textHash"],
                "Recording belongs to a different text/version")
    if missing:
        return {**base, "status": "waiting_for_parts", "missing": missing}
    plan = {"assemblyVersion": "2.0.0", "mode": "development", "topicId": topic,
            "scriptVersion": version, "hooks": [], "endings": []}
    for part in expected:
        entry = {"localPath": (Path(relative_directory) / part["fileName"]).as_posix(),
                 "sha256": declared[part["fileName"]]["sha256"],
                 "text": part["text"], "textHash": part["textHash"]}
        require((root / part["fileName"]).resolve().is_relative_to(root), "Source escaped incoming directory")
        if part["role"] == "body":
            plan["body"] = entry
        elif part["role"] == "hook":
            plan["hooks"].append({**entry, "hookNumber": part["hookNumber"]})
        else:
            plan["endings"].append({**entry, "platform": part["platform"]})
    assembler.verify_platform_plan(plan)  # Full decode/SHA/text checks before marking complete.
    return {**base, "status": "ready_for_development_assembly", "missing": [], "plan": plan}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("drafts", help="Editorial packet or array of packets")
    parser.add_argument("--topic", required=True)
    parser.add_argument("--incoming", required=True, help="Relative public path under rr/incoming")
    parser.add_argument("--out", required=True, help="New source-set plan file, no overwrite")
    args = parser.parse_args()
    packets = json.loads(Path(args.drafts).read_text(encoding="utf-8"))
    if isinstance(packets, dict):
        packets = [packets]
    selected = [p for p in packets if p["sourceSet"]["topic_id"] == args.topic]
    require(len(selected) == 1, "Select exactly one topic")
    report = inspect(selected[0], args.incoming)
    if "plan" in report:
        with Path(args.out).open("x", encoding="utf-8") as stream:
            stream.write(json.dumps(report["plan"], ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "plan"}, ensure_ascii=False))
