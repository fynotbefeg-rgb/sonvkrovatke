"""P1 only: unchanged full source timeline, keep its AAC audio without re-encoding."""
import json
import math
from pathlib import Path
import subprocess

from factory_media import probe, sha256


def decoded_audio_hash(path):
    result = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(path),
        "-map", "0:a:0", "-vn", "-c:a", "pcm_s16le", "-f", "hash", "-hash", "sha256", "-"],
        capture_output=True, text=True, check=True, timeout=120)
    return result.stdout.strip()


def audio_clock(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=start_time,duration,sample_rate", "-of", "json", str(path)],
        capture_output=True, text=True, check=True, timeout=30)
    stream = json.loads(result.stdout)["streams"][0]
    return {"start": float(stream["start_time"]), "duration": float(stream["duration"]),
            "sampleRate": int(stream["sample_rate"])}


def video_duration(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True, timeout=30)
    value = float(json.loads(result.stdout)["streams"][0]["duration"])
    if not math.isfinite(value) or value <= 0:
        raise ValueError("No finite video stream duration")
    return value


def preserve(source, rendered, output, expected_source_sha):
    if Path(output).exists():
        raise FileExistsError("Audio-preserved output already exists")
    if sha256(source) != expected_source_sha:
        raise ValueError("Source changed before audio preservation")
    original, video = probe(source), probe(rendered)
    # Container duration includes the delayed encoded audio tail we are replacing.
    if original["audioCodec"] != "aac" or abs(video_duration(source) - video_duration(rendered)) > 1 / video["fps"] + 0.01:
        raise ValueError("Audio preservation requires AAC source and unchanged full video duration")
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-n",
        "-i", str(rendered), "-i", str(source), "-map", "0:v:0", "-map", "1:a:0",
        "-c", "copy", "-map_metadata", "-1", "-movflags", "+faststart", str(output)],
        capture_output=True, check=True, timeout=120)
    source_pcm = decoded_audio_hash(source)
    if source_pcm != decoded_audio_hash(output) or sha256(source) != expected_source_sha:
        raise ValueError("Preserved source audio verification failed")
    clock, copied = audio_clock(source), audio_clock(output)
    tolerance = 1 / clock["sampleRate"]
    if (clock["sampleRate"] != copied["sampleRate"] or
            abs(clock["start"] - copied["start"]) > tolerance or
            abs(clock["duration"] - copied["duration"]) > tolerance):
        raise ValueError("Preserved audio timeline differs from source")
    # Verify decoded audio sample identity; current P1 composition has no cuts/speed changes.
    return {"strategy": "copy_original_aac_full_timeline", "decodedAudioHash": source_pcm,
            "sourceSha256": expected_source_sha, "audioClock": clock, "productionReady": False}
