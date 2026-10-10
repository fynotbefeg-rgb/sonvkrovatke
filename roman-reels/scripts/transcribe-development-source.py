"""Real CPU speech extraction for a development fixture; never starts production."""
import argparse
from datetime import datetime, timezone
import importlib.metadata
import json
from pathlib import Path
import time

from factory_media import public_source, probe, decode, sha256, validate_intervals


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, help="Path relative to pv/public")
    parser.add_argument("--model-path", required=True, help="Already downloaded local model")
    parser.add_argument("--model-revision", required=True)
    parser.add_argument("--out", required=True, help="New output directory")
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--disable-vad", action="store_true")
    parser.add_argument("--vocabulary", default="", help="Optional term hints, not replacement speech")
    args = parser.parse_args()
    if not 1 <= args.threads <= 8:
        parser.error("threads must be 1..8")
    model_path = Path(args.model_path).resolve()
    if not (model_path / "model.bin").is_file():
        parser.error("Model must already exist locally; no automatic model download")
    source = public_source(args.source)
    metadata = probe(source)
    decode(source)
    original_sha = sha256(source)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=False)
    from faster_whisper import WhisperModel
    started = time.perf_counter()
    model = WhisperModel(str(model_path), device="cpu", compute_type="int8",
                         cpu_threads=args.threads, local_files_only=True)
    segments, info = model.transcribe(str(source), language="ru", beam_size=5,
                                     word_timestamps=True, vad_filter=not args.disable_vad,
                                     initial_prompt=args.vocabulary or None,
                                     condition_on_previous_text=False)
    raw = []
    words = []
    speech = []
    for segment in segments:
        segment_words = []
        for word in segment.words or []:
            item = {"text": word.word.strip(), "start": word.start, "end": word.end}
            words.append(item)
            segment_words.append({**item, "probability": word.probability})
        speech.append({"text": segment.text.strip(), "start": segment.start, "end": segment.end})
        raw.append({**speech[-1], "words": segment_words,
                    "avgLogprob": segment.avg_logprob, "noSpeechProbability": segment.no_speech_prob})
    elapsed = time.perf_counter() - started
    packages = {name: importlib.metadata.version(name) for name in
                ["faster-whisper", "ctranslate2", "onnxruntime", "av", "tokenizers"]}
    model_checksums = {p.name: sha256(p) for p in sorted(model_path.iterdir()) if p.is_file()}
    artifact = {
        "artifactVersion": "1.0.0", "mode": "development", "sourceRelativePath": args.source,
        "sourceSha256": original_sha, "sourceMetadata": metadata,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "transcriber": {"model": "Systran/faster-whisper-small", "revision": args.model_revision,
                        "modelChecksums": model_checksums, "packages": packages,
                        "device": "cpu", "computeType": "int8", "threads": args.threads,
                        "beamSize": 5, "vadFilter": not args.disable_vad,
                        "vocabularyHints": args.vocabulary, "language": info.language,
                        "elapsedSeconds": round(elapsed, 3)},
        "transcriptText": " ".join(s["text"] for s in speech),
        "wordTimings": words, "speechSegments": speech, "rawSegments": raw,
        "alignmentMethod": "whisper_word_timestamps_not_forced_alignment",
        "needsSpeechReview": True, "productionReady": False,
    }
    # Preserve raw evidence even when structural validation fails; never interpolate.
    (out / "speech.json").write_text(json.dumps(artifact, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    validate_intervals(words, metadata["duration"])
    validate_intervals(speech, metadata["duration"])
    if sha256(source) != original_sha:
        raise ValueError("Source changed during transcription")
    print(f"Real speech extracted: {len(words)} words in {elapsed:.1f}s; development only, review needed.")


if __name__ == "__main__":
    main()
