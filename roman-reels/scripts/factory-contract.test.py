"""Synthetic fixture tests only: no real transcript, approval, network or render."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("factory_validator", Path(__file__).with_name("validate-factory-job.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture():
    job = {
        "schemaVersion": "1.0.0", "mode": "development", "reelId": "R-fixture-h1",
        "topicId": "fixture", "hookNumber": 1, "scriptVersion": 1,
        "hookText": "Тест", "scriptText": "Тест автоматизации.",
        "approvalStatus": "pending_approval", "productionStatus": "montage_ready",
        "sourceVideo": {"localPath": "synthetic-not-real.mp4", "sha256": "0" * 64,
                        "duration": 2, "width": 1080, "height": 1920, "fps": 25},
        "wordTimings": [{"text": "Тест", "start": 0.2, "end": 0.5},
                        {"text": "автоматизации", "start": 0.7, "end": 1.5}],
        "speechSegments": [{"text": "Тест автоматизации", "start": 0.2, "end": 1.5}],
        "visualAssets": [],
        "montagePlan": {"events": [{"id": "card-1", "type": "card", "start": 0.2,
            "end": 1.5, "wordStart": 0, "wordEnd": 1, "animation": "fade", "position": "top",
            "layer": 1, "transition": "none", "respectSafeZone": True}]},
        "renderSettings": {"width": 1080, "height": 1920, "fps": 25, "codec": "h264",
            "audioCodec": "aac", "safeZone": {"top": 200, "right": 100, "bottom": 300, "left": 100}},
    }
    job["scriptHash"] = module.legacy_hash(job)
    return job


class ContractTests(unittest.TestCase):
    def test_valid_development_fixture_and_queued_stage(self):
        job = fixture()
        module.validate(job)
        for key in ["sourceVideo", "wordTimings", "speechSegments", "visualAssets", "montagePlan", "renderSettings"]:
            del job[key]
        job["productionStatus"] = "queued"
        module.validate(job)

    def test_rejects_pending_production_and_missing_approval(self):
        for status in ["pending_approval", "approved"]:
            job = fixture()
            job.update(mode="production", approvalStatus=status)
            with self.assertRaises(ValueError):
                module.validate(job)

    def test_hash_matches_existing_javascript_unicode_semantics(self):
        import json
        import subprocess
        job = fixture()
        job["hookText"] = 'Кавычки " и emoji 🧠\n'
        job["scriptText"] = "Русский текст\u2028\ud800"
        job["scriptHash"] = module.legacy_hash(job)
        original = subprocess.run(["node", "--input-type=module", "-e",
            "import {scriptHash} from './approval-manifest.mjs';let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>process.stdout.write(scriptHash(JSON.parse(s))));"],
            cwd=Path(__file__).parent, input=json.dumps({"version_id": job["reelId"],
                "script_revision": job["scriptVersion"], "hook_text": job["hookText"],
                "script_text": job["scriptText"]}), text=True, capture_output=True, check=True)
        self.assertEqual(job["scriptHash"], original.stdout)
        module.validate(job)
        job["scriptText"] += "!"
        with self.assertRaises(ValueError):
            module.validate(job)

    def test_hash_does_not_depend_on_the_system_text_encoding(self):
        # A child process whose locale encoding is forced to cp1252 on any OS. Node writes UTF-8: 0xD0 0x81 ("Ё")
        # contains 0x81, which cp1252 cannot decode, so decoding with the system code page breaks the subprocess reader.
        import json
        import subprocess
        import sys
        child = r'''
import hashlib, importlib.util, json, locale, subprocess, sys
locale.getencoding = lambda: "cp1252"
locale.getpreferredencoding = lambda do_setlocale=True: "cp1252"
control = subprocess.run(["node", "-e", "process.stdout.write(Buffer.from('d081', 'hex'))"],
                         capture_output=True, text=True)  # default decoding, as the old legacy_hash did
spec = importlib.util.spec_from_file_location("v", sys.argv[1])
v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)
job = {"reelId": "R-юникод-h1", "scriptVersion": 1, "hookText": "Ёлка 😀  ", "scriptText": "Привет, мир! Ё\ud800"}
values = [job["reelId"], job["scriptVersion"], job["hookText"], job["scriptText"]]
# Reference: the same Node serialization read as raw bytes, so no text decoding is involved at all.
raw = subprocess.run(["node", "-e", "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(s))))"],
                     input=json.dumps(values, ensure_ascii=True).encode("ascii"), capture_output=True, check=True).stdout
print(json.dumps({"encoding": locale.getencoding(), "controlBroken": control.stdout is None,
                  "hash": v.legacy_hash(job), "expected": hashlib.sha256(raw).hexdigest(),
                  "nonAscii": any(b > 127 for b in raw)}))
'''
        run = subprocess.run([sys.executable, "-c", child, str(Path(__file__).with_name("validate-factory-job.py"))],
                             capture_output=True, timeout=60)  # bytes: the control's traceback is in the console code page
        self.assertEqual(run.returncode, 0, run.stderr.decode("utf-8", "replace")[-800:])
        result = json.loads(run.stdout.decode("ascii"))
        self.assertEqual(result["encoding"], "cp1252")
        self.assertTrue(result["controlBroken"], "the forced encoding must reproduce the original decoding failure")
        self.assertTrue(result["nonAscii"], "the reference serialization must contain non-ASCII UTF-8 bytes")
        self.assertEqual(result["hash"], result["expected"])

    def test_rejects_stale_approval_bad_identity_and_future_version(self):
        for mutation in [lambda j: j.update(reelId="R-other-h1"),
                         lambda j: j.update(schemaVersion="2.0.0"),
                         lambda j: j.update(approvalStatus="approved", approval={
                             "approvedBy": "synthetic", "approvedAt": "2026-10-10T00:00:00Z",
                             "scriptHash": "1"*64, "receiptReference": "synthetic"})]:
            job = fixture()
            mutation(job)
            with self.assertRaises(ValueError):
                module.validate(job)

    def test_rejects_invalid_timings_anchors_assets_and_safe_zone(self):
        job = fixture()
        for target, field, value in [("word", "start", 0.1), ("word", "end", 3),
                                     ("event", "wordEnd", 99), ("event", "end", 0.3),
                                     ("event", "assetId", "missing"), ("event", "end", float("inf"))]:
            bad = copy.deepcopy(job)
            obj = bad["wordTimings"][1] if target == "word" else bad["montagePlan"]["events"][0]
            obj[field] = value
            with self.assertRaises(ValueError):
                module.validate(bad)
        job["renderSettings"]["safeZone"]["bottom"] = 1920
        with self.assertRaises(ValueError):
            module.validate(job)

    def test_rejects_false_ready_and_missing_stage_outputs(self):
        for stage in ["rendered", "qc_passed"]:
            job = fixture()
            job["productionStatus"] = stage
            with self.assertRaises(ValueError):
                module.validate(job)
            job["outputPath"] = "synthetic-output.mp4"
            if stage == "qc_passed":
                with self.assertRaises(ValueError):
                    module.validate(job)
        job = fixture()
        del job["wordTimings"]
        with self.assertRaises(ValueError):
            module.validate(job)


if __name__ == "__main__":
    unittest.main()
