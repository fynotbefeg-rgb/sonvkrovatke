"""Integration entrypoint for the Claude engine; development-only, no upload/approval."""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess

from factory_media import public_source, probe, sha256, technical_qc
from preserve_source_audio import preserve
import shared_body_plans as shared_plans

ROOT = Path(__file__).resolve().parents[1]
PV = ROOT / "pv"
DIRECTOR = PV / "src/factory/director.ts"
COMPOSITION_ID = "RomanFactoryV1"
RENDER_TIMEOUT_SECONDS = 900
ALLOWED_RENDER_CONCURRENCY = (1, 2)
DEFAULT_RENDER_CONCURRENCY = 2
# OffthreadVideo frame cache; None keeps Remotion's own default (the flag is not passed at all).
MIN_VIDEO_CACHE_BYTES = 64 * 1024 * 1024
MAX_VIDEO_CACHE_BYTES = 8 * 1024 * 1024 * 1024


def check_render_concurrency(value):
    """Only 1 or 2 parallel Remotion workers; checked before anything is created or started."""
    if type(value) is not int or value not in ALLOWED_RENDER_CONCURRENCY:
        raise ValueError("render_concurrency must be 1 or 2")
    return value


def check_video_cache_size(value):
    """None (Remotion default) or whole bytes in 64 MiB..8 GiB; checked before anything is created or started."""
    if value is None:
        return None
    if type(value) is not int or not MIN_VIDEO_CACHE_BYTES <= value <= MAX_VIDEO_CACHE_BYTES:
        raise ValueError("video_cache_size_in_bytes must be a whole number of bytes from 67108864 to 8589934592")
    return value


def find_node():
    """Node executable from PATH; nothing is downloaded or installed automatically."""
    node = shutil.which("node")
    if node is None:
        raise ValueError("Node.js was not found on PATH; install Node.js first (nothing is downloaded automatically)")
    return node


def remotion_cli_entry(pv=PV):
    """Entry point of the installed @remotion/cli, taken from its own package.json (never guessed).

    Launching it through Node avoids npx, which is npx.cmd on Windows and cannot be started without a shell.
    """
    package_file = Path(pv) / "node_modules/@remotion/cli/package.json"
    if not package_file.is_file():
        raise ValueError("Install locked Remotion dependencies with npm ci first")
    try:
        bin_field = json.loads(package_file.read_text(encoding="utf-8")).get("bin")
    except (OSError, ValueError):
        raise ValueError("Installed @remotion/cli package.json is unreadable") from None
    entry = bin_field.get("remotion") if isinstance(bin_field, dict) else None
    if not isinstance(entry, str) or not entry:
        raise ValueError("Installed @remotion/cli does not declare a remotion entry point")
    path = (package_file.parent / entry).resolve()
    if not path.is_file() or not path.is_relative_to(package_file.parent.resolve()):
        raise ValueError("Installed @remotion/cli entry point is missing")
    return path


def remotion_render_command(node, entry, raw_video, props, browser_args=(), concurrency=DEFAULT_RENDER_CONCURRENCY,
                            video_cache_size_in_bytes=None):
    """Argument list for the render; every path is one list item, so spaces and non-ASCII need no quoting."""
    cache = check_video_cache_size(video_cache_size_in_bytes)
    cache_args = [] if cache is None else ["--offthreadvideo-cache-size-in-bytes", str(cache)]
    return [str(node), str(entry), "render", COMPOSITION_ID, str(raw_video), "--props", str(props),
            "--codec", "h264", "--audio-codec", "aac", "--crf", "18",
            "--concurrency", str(check_render_concurrency(concurrency)), *cache_args, *browser_args]


def render_with_remotion(raw_video, props, browser_args, pv=PV, run=subprocess.run,
                         concurrency=DEFAULT_RENDER_CONCURRENCY, video_cache_size_in_bytes=None):
    check_render_concurrency(concurrency)
    check_video_cache_size(video_cache_size_in_bytes)
    command = remotion_render_command(find_node(), remotion_cli_entry(pv), raw_video, props, browser_args, concurrency,
                                      video_cache_size_in_bytes)
    return run(command, cwd=pv, timeout=RENDER_TIMEOUT_SECONDS, check=True)  # list, never shell=True


def check_visual_assets(assets):
    """Verify supplied local assets instead of silently dropping them at render time."""
    for asset in assets:
        path = public_source(asset["localPath"])
        if asset["type"] != "image" or path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".svg"}:
            raise ValueError("Development interface assets must be local images")
        if not asset.get("rightsReference", "").strip():
            raise ValueError("Visual asset rights reference is required")

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
    check_visual_assets(job.get("visualAssets", []))


def run(job, output_directory, browser_executable=None, montage_plan=None,
        render_concurrency=DEFAULT_RENDER_CONCURRENCY, video_cache_size_in_bytes=None):
    """montage_plan: optional precomputed plan (shared-body mode); it must pass Director validation and the contract.

    render_concurrency: 1 or 2 Remotion workers (default 2); quality, resolution and codec settings do not change.
    video_cache_size_in_bytes: optional OffthreadVideo cache limit; None keeps Remotion's default.
    """
    check_render_concurrency(render_concurrency)
    check_video_cache_size(video_cache_size_in_bytes)
    check_input(job)
    remotion_cli_entry(PV)  # fail fast, before any output is created
    find_node()
    source = job["sourceVideo"]
    job = {**job, "visualAssets": job.get("visualAssets", []), "renderSettings": {
        "width": 1080, "height": 1920, "fps": source["fps"], "codec": "h264", "audioCodec": "aac",
        "safeZone": {"top": 200, "right": 120, "bottom": 320, "left": 100}}}
    bridge = """import {pathToFileURL} from 'node:url';
const {buildMontagePlan}=await import(pathToFileURL(process.argv[1]).href);
let s='';for await(const chunk of process.stdin)s+=chunk;
const plan=await buildMontagePlan(JSON.parse(s));process.stdout.write(JSON.stringify(plan));"""
    if montage_plan is None:
        response = subprocess.run(["node", "--experimental-strip-types", "--input-type=module", "-e",
                                   bridge, str(DIRECTOR)], input=json.dumps(job), text=True, encoding="utf-8",
                                  capture_output=True, timeout=60, check=True)
        plan = json.loads(response.stdout)
    else:
        plan = montage_plan
        shared_plans.validate(job, plan)
    job.update(montagePlan=plan, productionStatus="montage_ready")
    contract.validate(job)
    output = Path(output_directory).resolve()
    output.mkdir(parents=True, exist_ok=False)
    props = output / "montage-job.json"
    props.write_text(json.dumps(job, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    raw_video = output / "remotion-encoded.mp4"
    video = output / "development.mp4"
    # Only the locally installed CLI is run (Node deps must be installed first); nothing is fetched.
    browser_args = []
    if browser_executable is not None:
        browser = Path(browser_executable).resolve(strict=True)
        if not browser.is_file():
            raise ValueError("Browser executable must be a local file")
        browser_args = ["--browser-executable", str(browser)]
    render_with_remotion(raw_video, props, browser_args, concurrency=render_concurrency,
                         video_cache_size_in_bytes=video_cache_size_in_bytes)
    audio_report = preserve(public_source(source["localPath"]), raw_video, video, source["sha256"])
    (output / "source-audio-preservation.json").write_text(json.dumps(audio_report, indent=2) + "\n")
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
    parser.add_argument("--browser-executable", help="Optional already installed local Chromium binary")
    args = parser.parse_args()
    try:
        run(json.loads(Path(args.job).read_text(encoding="utf-8")), args.out, args.browser_executable)
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        # Static validation reasons only; process response bodies are not printed.
        raise SystemExit(str(error) if isinstance(error, ValueError) else "Local montage failed; inspect logs privately.")
    print("Development render and technical QC passed. Publication remains disabled.")
