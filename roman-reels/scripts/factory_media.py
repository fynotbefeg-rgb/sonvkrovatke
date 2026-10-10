"""Local media checks shared by the development pipeline; no network or approvals."""
import hashlib
import json
import math
from pathlib import Path
import subprocess

PUBLIC = Path(__file__).resolve().parents[1] / "pv/public"


def public_source(relative):
    if not isinstance(relative, str) or not relative or "\\" in relative or ":" in relative:
        raise ValueError("Source must be a relative public path")
    if any(ord(c) < 32 for c in relative) or ".." in Path(relative).parts or Path(relative).is_absolute():
        raise ValueError("Unsafe source path")
    source = (PUBLIC / relative).resolve()
    if not source.is_relative_to(PUBLIC.resolve()) or not source.is_file():
        raise ValueError("Source is absent or outside public")
    return source


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def probe(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_format", "-show_streams",
                             "-of", "json", str(Path(path).resolve())],
                            capture_output=True, text=True, timeout=30, check=True)
    data = json.loads(result.stdout)
    videos = [s for s in data["streams"] if s.get("codec_type") == "video"]
    audios = [s for s in data["streams"] if s.get("codec_type") == "audio"]
    if len(videos) != 1 or not audios:
        raise ValueError("Need exactly one video stream and an audio stream")
    video = videos[0]
    duration = float(data["format"]["duration"])
    num, den = map(int, video["avg_frame_rate"].split("/"))
    fps = num / den
    if not math.isfinite(duration) or duration <= 0 or not math.isfinite(fps) or fps <= 0:
        raise ValueError("Invalid media duration/fps")
    return {"duration": duration, "width": video["width"], "height": video["height"],
            "fps": fps, "videoCodec": video["codec_name"], "audioCodec": audios[0]["codec_name"],
            "audioChannels": audios[0].get("channels", 0)}


def decode(path):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i",
                    str(Path(path).resolve()), "-map", "0:v:0", "-map", "0:a:0",
                    "-f", "null", "-"], capture_output=True, timeout=180, check=True)


def validate_intervals(intervals, duration):
    if not intervals:
        raise ValueError("No speech intervals")
    previous_end = 0
    for item in intervals:
        start, end = item["start"], item["end"]
        if (not isinstance(item["text"], str) or not item["text"].strip() or
                isinstance(start, bool) or isinstance(end, bool) or
                not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or
                not math.isfinite(start) or not math.isfinite(end) or
                not previous_end <= start < end <= duration):
            raise ValueError("Invalid/overlapping speech; timestamps are not repaired automatically")
        previous_end = end


def technical_qc(path, duration, fps):
    if not math.isfinite(duration) or duration <= 0 or not math.isfinite(fps) or fps <= 0:
        raise ValueError("Invalid expected duration/fps")
    metadata = probe(path)
    decode(path)
    checks = {
        "decode": True,
        "resolution": (metadata["width"], metadata["height"]) == (1080, 1920),
        "audio": metadata["audioChannels"] > 0,
        "duration": abs(metadata["duration"] - duration) <= max(0.1, 1 / fps + 0.01),
        "fps": abs(metadata["fps"] - fps) < 0.01,
        "codecs": metadata["videoCodec"] == "h264" and metadata["audioCodec"] == "aac",
    }
    return {"technicalPassed": all(checks.values()), "technicalChecks": checks,
            "outputSha256": sha256(path), "metadata": metadata,
            "productionReady": False,
            "remainingChecks": ["trusted_current_approval", "transcript_match", "montage_plan",
                                "visual_assets", "subtitle_layout", "visual_review"]}
