"""Technical file QC only; never marks a production job qc_passed."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

from factory_media import technical_qc


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("--duration", type=float, required=True)
    parser.add_argument("--fps", type=float, required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    report = technical_qc(args.video, args.duration, args.fps)
    report["checkedAt"] = datetime.now(timezone.utc).isoformat()
    with Path(args.out).open("x", encoding="utf-8") as stream:
        stream.write(json.dumps(report, indent=2, allow_nan=False) + "\n")
    if not report["technicalPassed"]:
        raise SystemExit("Technical QC failed; production status unchanged.")
    print("Technical QC passed; approval, plan, subtitles and visual review still required.")
