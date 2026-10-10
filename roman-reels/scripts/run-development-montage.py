"""Integration entrypoint for the Claude engine; development-only, no upload/approval."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess

from factory_media import public_source, probe, sha256, technical_qc

ROOT = Path(__file__).resolve().parents[1]
PV = ROOT / "pv"
DIRECTOR = PV / "src/factory/director.ts"
COMPOSITION_ID = "RomanFactoryV1"

spec = importlib.util.spec_from_file_location("contract", Path(__file__).with_name("validate-factory-job.py"))
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)


def check_input(job):
    contract.validate(job)
    if job["mode"] != "development" or job["productionStatus"] != "transcribed":
        raise ValueError("This runner accepts only development/transcribed jobs")
    source = public_source(job["sourceVideo"]["localPath"])
    if sha256(source) != job["sourceVideo"]["sha256"]:
        raise ValueError("Source checksum mismatch")
    metadata = probe(source)
    for key in ["duration", "width", "height", "fps"]:
        if metadata[key] != job["sourceVideo"][key]:
            raise ValueError("Source metadata mismatch")
    if not DIRECTOR.is_file():
        raise ValueError("Claude Director not delivered: expected pv/src/factory/director.ts")


def run(job, output_directory):
    check_input(job)
    if not (PV / "node_modules/@remotion/cli/package.json").is_file():
        raise ValueError("Install locked Remotion dependencies with npm ci first")
    source = job["sourceVideo"]
    job = {**job, "visualAssets": [], "renderSettings": {
        "width": 1080, "height": 1920, "fps": source["fps"], "codec": "h264", "audioCodec": "aac",
        "safeZone": {"top": 200, "right": 120, "bottom": 320, "left": 100}}}
    bridge = """import {pathToFileURL} from 'node:url';
const {buildMontagePlan}=await import(pathToFileURL(process.argv[1]).href);
let s='';for await(const chunk of process.stdin)s+=chunk;
const plan=await buildMontagePlan(JSON.parse(s));process.stdout.write(JSON.stringify(plan));"""
    response = subprocess.run(["node", "--experimental-strip-types", "--input-type=module", "-e",
                               bridge, str(DIRECTOR)], input=json.dumps(job), text=True,
                              capture_output=True, timeout=60, check=True)
    job.update(montagePlan=json.loads(response.stdout), productionStatus="montage_ready")
    contract.validate(job)
    output = Path(output_directory).resolve()
    output.mkdir(parents=True, exist_ok=False)
    props = output / "montage-job.json"
    props.write_text(json.dumps(job, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    video = output / "development.mp4"
    # --no-install prevents fetching an unexpected CLI; Node deps must be installed first.
    subprocess.run(["npx", "--no-install", "remotion", "render", COMPOSITION_ID, str(video),
                    "--props", str(props), "--codec", "h264", "--audio-codec", "aac",
                    "--crf", "18", "--concurrency", "2"], cwd=PV, timeout=900, check=True)
    job.update(productionStatus="rendered", outputPath=str(video))
    contract.validate(job)
    report = technical_qc(video, source["duration"], source["fps"])
    (output / "technical-qc.json").write_text(json.dumps(report, indent=2) + "\n")
    # No qc_passed/production delivery: geometry, plan/assets and speech review are separate gates.
    (output / "rendered-job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if not report["technicalPassed"]:
        raise ValueError("Technical QC failed; no delivery")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("job")
    parser.add_argument("--out", required=True, help="New output directory")
    args = parser.parse_args()
    try:
        run(json.loads(Path(args.job).read_text(encoding="utf-8")), args.out)
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        # Static validation reasons only; process response bodies are not printed.
        raise SystemExit(str(error) if isinstance(error, ValueError) else "Local montage failed; inspect logs privately.")
    print("Development render and technical QC passed. Publication remains disabled.")
