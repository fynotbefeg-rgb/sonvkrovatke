"""Development diagnostic: compare sampled decoded audio across assembly offsets."""
import argparse
from array import array
import json
import math
from pathlib import Path
import subprocess
import sys

from factory_media import public_source, sha256


def samples(path, start):
    result = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(path),
        "-af", f"atrim=start={start}:duration=1,asetpts=PTS-STARTPTS", "-vn",
        "-ar", "16000", "-ac", "1", "-f", "f32le", "-"],
        capture_output=True, check=True, timeout=60)
    values = array("f")
    values.frombytes(result.stdout)
    if sys.byteorder != "little":
        values.byteswap()
    return values


def check(manifest, directory):
    if manifest.get("mode") != "development" or manifest.get("complete") is not True:
        raise ValueError("Complete development assembly required")
    checks = []
    for variant in manifest["variants"]:
        output = public_source(str(Path(directory) / variant["outputFile"]))
        if sha256(output) != variant["sha256"]:
            raise ValueError("Assembled bytes changed")
        for part in variant["parts"]:
            source = public_source(part["localPath"])
            if sha256(source) != part["sha256"] or part["originalDuration"] < 1.4:
                raise ValueError("Changed or too short source for one-second sampling")
            positions = sorted({0.2, round(part["originalDuration"] / 2, 3),
                                round(part["originalDuration"] - 1.2, 3)})
            for pos in positions:
                mapped = pos + part["timelineStart"]
                x, y = samples(source, pos), samples(output, mapped)
                if len(x) != 16000 or len(y) != len(x):
                    raise ValueError("Audio window length mismatch")
                mx, my = math.fsum(x) / len(x), math.fsum(y) / len(y)
                xx, yy = [v - mx for v in x], [v - my for v in y]
                denominator = math.sqrt(math.fsum(v*v for v in xx) * math.fsum(v*v for v in yy))
                if denominator <= 0:
                    raise ValueError("Silent window cannot verify timing")
                score = math.fsum(a*b for a, b in zip(xx, yy)) / denominator
                checks.append({"hookNumber": variant["hookNumber"], "role": part["role"],
                    "sourceSha256": part["sha256"], "assembledSha256": variant["sha256"],
                    "sourcePosition": pos, "assembledPosition": round(mapped, 6), "windowSeconds": 1,
                    "correlation": round(score, 6), "passed": score > 0.95})
            if sha256(source) != part["sha256"]:
                raise ValueError("Source changed during check")
        if sha256(output) != variant["sha256"]:
            raise ValueError("Assembly changed during check")
    return {"artifactVersion": "1.0.0", "mode": "development",
            "method": "decoded_PCM_16k_mono_zero_lag_Pearson", "minimumCorrelation": 0.95,
            "checks": checks, "passed": bool(checks) and all(c["passed"] for c in checks),
            "productionReady": False,
            "limitations": ["Sampled windows, not all audio",
                            "Does not validate transcript wording or word alignment precision"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest")
    parser.add_argument("--public-directory", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    report = check(json.loads(Path(args.manifest).read_text()), args.public_directory)
    with Path(args.out).open("x") as stream:
        stream.write(json.dumps(report, indent=2, allow_nan=False) + "\n")
    if not report["passed"]:
        raise ValueError("Sampled audio mapping failed")
    print(f"Sampled audio mapping passed: {len(report['checks'])} windows; development only.")
