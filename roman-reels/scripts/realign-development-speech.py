"""Real acoustic CTC realignment for invalid ASR segments. No interpolated timestamps."""
import argparse
import copy
import importlib.metadata
import json
from pathlib import Path
import re
import subprocess
import time

from factory_media import public_source, sha256, validate_intervals

MODEL_ID = "jonatasgrosman/wav2vec2-large-xlsr-53-russian"
MODEL_REVISION = "2329100508896c6d9b157019803ab5601e6f3406"
# Pronunciation hints affect alignment labels only; display/transcript text stays unchanged.
ALIASES = {"telegram": "телеграм", "whatsapp": "ватсап", "claude": "клод"}


def label(text):
    normalized = re.sub(r"[^\w]", "", text.lower()).replace("ё", "е")
    normalized = ALIASES.get(normalized, normalized)
    if not normalized or not re.fullmatch(r"[а-я]+", normalized):
        raise ValueError("Unsupported alignment label; do not drop words/digits silently")
    return normalized


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("speech")
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--out", required=True, help="New file; original ASR is retained")
    args = parser.parse_args()
    original = json.loads(Path(args.speech).read_text(encoding="utf-8"))
    if original.get("mode") != "development":
        raise ValueError("Development evidence only")
    if Path(args.out).exists():
        raise ValueError("Refuse overwriting alignment evidence")
    source = public_source(original["sourceRelativePath"])
    if sha256(source) != original["sourceSha256"]:
        raise ValueError("Source checksum mismatch")
    artifact = copy.deepcopy(original)
    duration = original["sourceMetadata"]["duration"]
    targets = []
    offset = 0
    for index, segment in enumerate(original["rawSegments"]):
        count = len(segment["words"])
        try:
            validate_intervals(original["wordTimings"][offset:offset + count], duration)
        except ValueError:
            targets.append((index, offset, count))
        offset += count
    if offset != len(original["wordTimings"]) or not targets:
        raise ValueError("No matching invalid segment to realign")
    import numpy as np
    import torch
    import torchaudio
    from transformers import AutoModelForCTC, Wav2Vec2Processor
    torch.set_num_threads(2)
    started = time.perf_counter()
    model_path = Path(args.model_path).resolve()
    # Alignment needs the plain acoustic tokenizer, not the optional language-model decoder.
    processor = Wav2Vec2Processor.from_pretrained(str(model_path), local_files_only=True)
    model = AutoModelForCTC.from_pretrained(str(model_path), local_files_only=True,
                                          trust_remote_code=False, weights_only=True).eval()
    notes = []
    for index, offset, count in targets:
        segment = original["rawSegments"][index]
        start, end = segment["start"], segment["end"]
        if not 0 <= start < end <= duration:
            raise ValueError("Invalid source segment")
        result = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(source),
            "-ss", str(start), "-t", str(end - start), "-vn", "-ac", "1", "-ar", "16000",
            "-f", "f32le", "-"], capture_output=True, timeout=30, check=True)
        samples = np.frombuffer(result.stdout, dtype="<f4").copy()
        words = original["wordTimings"][offset:offset + count]
        labels = [label(w["text"]) for w in words]
        flattened = []
        ranges = []
        tokenizer = processor.tokenizer
        for i, normalized in enumerate(labels):
            ids = tokenizer(normalized, add_special_tokens=False).input_ids
            if not ids or tokenizer.unk_token_id in ids:
                raise ValueError("Unknown CTC tokens; do not guess timestamps")
            ranges.append((len(flattened), len(flattened) + len(ids)))
            flattened.extend(ids)
            if i != count - 1:
                flattened.append(tokenizer.word_delimiter_token_id)
        inputs = processor(samples, sampling_rate=16000, return_tensors="pt")
        with torch.inference_mode():
            log_probs = model(**inputs).logits.log_softmax(dim=-1)
            alignments, scores = torchaudio.functional.forced_align(
                log_probs, torch.tensor([flattened], dtype=torch.int32), blank=tokenizer.pad_token_id)
            spans = torchaudio.functional.merge_tokens(alignments[0], scores[0].exp(), blank=tokenizer.pad_token_id)
        if len(spans) != len(flattened):
            raise ValueError("Incomplete CTC alignment")
        ratio = len(samples) / 16000 / log_probs.shape[1]
        quality = []
        for i, (first, last) in enumerate(ranges):
            selected = spans[first:last]
            t0, t1 = start + selected[0].start * ratio, start + selected[-1].end * ratio
            artifact["wordTimings"][offset + i] = {"text": words[i]["text"], "start": t0, "end": t1}
            quality.append(float(sum(s.score * (s.end - s.start) for s in selected) /
                                 sum(s.end - s.start for s in selected)))
        notes.append({"segmentIndex": index, "wordOffset": offset, "wordCount": count,
                      "normalizedLabels": labels, "meanCharacterScores": quality})
    validate_intervals(artifact["wordTimings"], duration)
    validate_intervals(artifact["speechSegments"], duration)
    if sha256(source) != original["sourceSha256"]:
        raise ValueError("Source changed during alignment")
    artifact["alignmentMethod"] = "hybrid_whisper_ctc_realign_invalid_segments"
    artifact["realignment"] = {
        "model": MODEL_ID, "revision": MODEL_REVISION, "license": "Apache-2.0",
        "modelChecksums": {p.name: sha256(p) for p in sorted(model_path.iterdir()) if p.is_file()},
        "packages": {n: importlib.metadata.version(n) for n in ["torch", "torchaudio", "transformers"]},
        "device": "cpu", "threads": 2, "elapsedSeconds": round(time.perf_counter() - started, 3),
        "segments": notes,
        "limitation": "TorchAudio forced_align is deprecated in 2.8 and removed in 2.9; isolated experiment",
    }
    artifact["needsSpeechReview"] = True
    with Path(args.out).open("x", encoding="utf-8") as stream:
        stream.write(json.dumps(artifact, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print(f"Acoustic CTC alignment complete: {len(notes)} segment(s); speech review still required.")


if __name__ == "__main__":
    main()
