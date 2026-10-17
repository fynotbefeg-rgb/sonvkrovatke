"""Shared-body montage plans: one Director plan for the common body, shifted into every hook variant.

The hook/body boundary comes only from the assembly manifest and the prepared evidence (cross-checked), never from
hookText or the first body word. Node runs the Director locally; no render, network, approval or publication.
"""
import json
import math
from pathlib import Path
import subprocess

DIRECTOR = Path(__file__).resolve().parents[1] / "pv/src/factory/director.ts"
_PLANS = """import {pathToFileURL} from 'node:url';
const {buildSharedBodyPlans}=await import(pathToFileURL(process.argv[1]).href);
let s='';for await(const chunk of process.stdin)s+=chunk;
process.stdout.write(JSON.stringify(buildSharedBodyPlans(JSON.parse(s))));"""
_VALIDATE = """import {pathToFileURL} from 'node:url';
const {validateMontagePlan}=await import(pathToFileURL(process.argv[1]).href);
let s='';for await(const chunk of process.stdin)s+=chunk;
const {job,plan}=JSON.parse(s);validateMontagePlan(job,plan);process.stdout.write('valid');"""


def require(ok, message):
    if not ok:
        raise ValueError(message)


def _director(script, payload, run):
    if not DIRECTOR.is_file():
        raise ValueError("Claude Director not delivered: expected pv/src/factory/director.ts")
    return run(["node", "--experimental-strip-types", "--input-type=module", "-e", script, str(DIRECTOR)],
               input=json.dumps(payload, ensure_ascii=False, allow_nan=False), text=True, encoding="utf-8",
               capture_output=True, timeout=60, check=True).stdout


def boundaries(manifest, results, body, hooks):
    """Director input: shared body timings/length and, per variant, the manifest boundary confirmed by evidence."""
    require(manifest.get("assemblyVersion") == "1.0.0", "Shared-body plans support the hook + body source-set v1 only")
    by_reel = {v["reelId"]: v for v in manifest["variants"]}
    require(len(by_reel) == len(manifest["variants"]) == len(results), "One prepared job per assembled variant")
    lengths, variants = set(), []
    for job, evidence in results:
        variant = by_reel.get(job["reelId"])
        require(variant is not None and evidence.get("reelId") == job["reelId"], "Job is not an assembled variant")
        parts = variant["parts"]
        require([p["role"] for p in parts] == ["hook", "body"], "Expected exactly hook + body parts")
        start = parts[1]["timelineStart"]
        require(math.isclose(parts[0]["timelineEnd"], start, abs_tol=1e-9) and
                math.isclose(variant["bodyStart"], start, abs_tol=1e-9) and
                math.isclose(evidence["bodyStart"], start, abs_tol=1e-9), "Body start differs between manifest and evidence")
        hook = hooks[job["hookNumber"]]
        require(parts[0]["sha256"] == hook["sourceSha256"] and parts[1]["sha256"] == body["sourceSha256"],
                "Assembly parts are not this hook and body")
        require(evidence["hookWordCount"] == len(hook["wordTimings"]) and
                evidence["bodyWordCount"] == len(body["wordTimings"]), "Word counts differ from the cached part timings")
        lengths.add(round(parts[1]["timelineEnd"] - start, 6))
        variants.append({"job": job, "hookWordCount": evidence["hookWordCount"], "bodyStart": start})
    require(len(lengths) == 1, "Shared body length differs between variants")
    # Body timings stay on the body file's own clock: leading silence is part of the shared timeline.
    return {"body": {"wordTimings": body["wordTimings"], "duration": lengths.pop()}, "variants": variants}


def build(manifest, results, body, hooks, run=subprocess.run):
    """Returns (shared body plan, {hookNumber: full plan}); every full plan already passed validateMontagePlan."""
    plans = json.loads(_director(_PLANS, boundaries(manifest, results, body, hooks), run))
    require(len(plans["variants"]) == len(results), "Director returned an unexpected number of plans")
    return plans["body"], {job["hookNumber"]: plan for (job, _), plan in zip(results, plans["variants"])}


def validate(job, plan, run=subprocess.run):
    """Standard Director validation of a supplied plan against its job (raises on any violation)."""
    try:
        require(_director(_VALIDATE, {"job": job, "plan": plan}, run) == "valid", "Montage plan rejected")
    except subprocess.CalledProcessError:
        raise ValueError("Montage plan rejected by Director validation") from None
