"""Create an unapproved development contract from real speech evidence."""
import argparse
import importlib.util
import json
from pathlib import Path

from factory_media import public_source, probe, sha256, validate_intervals

spec = importlib.util.spec_from_file_location("contract_validator", Path(__file__).with_name("validate-factory-job.py"))
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)


def prepare(speech):
    if (speech.get("artifactVersion") != "1.0.0" or speech.get("mode") != "development" or
            speech.get("alignmentMethod") not in ["whisper_word_timestamps_not_forced_alignment",
                                                 "hybrid_whisper_ctc_realign_invalid_segments"]):
        raise ValueError("Unsupported speech evidence")
    source = public_source(speech["sourceRelativePath"])
    if sha256(source) != speech["sourceSha256"]:
        raise ValueError("Speech/source checksum mismatch")
    if probe(source) != speech["sourceMetadata"]:
        raise ValueError("Speech/source metadata mismatch")
    duration = speech["sourceMetadata"]["duration"]
    validate_intervals(speech["wordTimings"], duration)
    validate_intervals(speech["speechSegments"], duration)
    metadata = speech["sourceMetadata"]
    job = {
        "schemaVersion": "1.0.0", "mode": "development",
        "reelId": "R-ai-body-fixture-h1", "topicId": "ai-body-fixture", "hookNumber": 1,
        "scriptVersion": 1, "hookText": " ".join(w["text"] for w in speech["wordTimings"][:5]),
        "scriptText": speech["transcriptText"], "approvalStatus": "pending_approval",
        "productionStatus": "transcribed", "sourceVideo": {
            "localPath": speech["sourceRelativePath"], "sha256": speech["sourceSha256"],
            "duration": duration, "width": metadata["width"], "height": metadata["height"],
            "fps": metadata["fps"], "origin": "repository_fixture"},
        "wordTimings": speech["wordTimings"], "speechSegments": speech["speechSegments"],
    }
    # hookText is a technical label from this body fixture, not a generated/approved hook.
    job["scriptHash"] = contract.legacy_hash(job)
    contract.validate(job)
    return job


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("speech")
    parser.add_argument("output")
    args = parser.parse_args()
    job = prepare(json.loads(Path(args.speech).read_text(encoding="utf-8")))
    with Path(args.output).open("x", encoding="utf-8") as stream:
        stream.write(json.dumps(job, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print("Development job prepared. No approval, generation, render or upload authorized.")
