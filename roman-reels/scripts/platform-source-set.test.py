"""Six real synthetic MP4s: intake binding, assembly order and ending speech offsets."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import factory_media as media


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


intake = load("intake", "prepare-incoming-source-set.py")
assembler = intake.assembler
combined = load("combined", "prepare-assembled-jobs.py")


class PlatformSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        cls.relative = "rr/incoming/test/v1"
        cls.incoming = cls.root / cls.relative
        cls.incoming.mkdir(parents=True)
        cls.packet = json.loads((Path(__file__).resolve().parents[1] /
            "research/platform-ending-drafts-v2.json").read_text())[0]
        topic, version, expected = intake.expectations(cls.packet)
        colors = ["blue", "red", "green", "yellow", "magenta", "cyan"]
        cls.receipt = {"receiptVersion": "1.0.0", "topicId": topic, "scriptVersion": version, "files": []}
        cls.speech = {}
        for i, (part, color) in enumerate(zip(expected, colors)):
            source = cls.incoming / part["fileName"]
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
                f"color=c={color}:s=108x192:r=25", "-f", "lavfi", "-i",
                f"sine=frequency={400+i*200}:sample_rate=48000", "-t", "0.16",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(source)],
                capture_output=True, timeout=30, check=True)
            checksum = media.sha256(source)
            cls.receipt["files"].append({"fileName": part["fileName"], "sha256": checksum,
                                          "textHash": part["textHash"]})
            # Deliberately synthetic timings and text; not a real transcription or approval.
            text = part["fileName"]
            cls.speech[text] = {"artifactVersion": "1.0.0", "mode": "development",
                "alignmentMethod": "whisper_word_timestamps_not_forced_alignment",
                "sourceRelativePath": f"{cls.relative}/{text}", "sourceSha256": checksum,
                "sourceMetadata": media.probe(source), "transcriptText": text,
                "wordTimings": [{"text": text, "start": 0.02, "end": 0.12}],
                "speechSegments": [{"text": text, "start": 0.02, "end": 0.12}]}
        cls.receipt_path = cls.incoming / "recording-set.json"
        cls.receipt_path.write_text(json.dumps(cls.receipt))
        with patch.object(media, "PUBLIC", cls.root):
            cls.plan = intake.inspect(cls.packet, cls.relative)["plan"]
            cls.manifest = assembler.assemble(cls.plan, cls.root / "assembled")

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def inspect(self, packet=None, directory=None):
        with patch.object(media, "PUBLIC", self.root):
            return intake.inspect(packet or self.packet, directory or self.relative)

    def jobs(self, manifest=None, endings=None):
        with patch.object(media, "PUBLIC", self.root):
            return combined.prepare(manifest or self.manifest, self.speech["body.mp4"],
                {n: self.speech[f"hook-{n}.mp4"] for n in [1, 2, 3]}, "assembled",
                endings if endings is not None else {p: self.speech[f"ending-{p}.mp4"] for p in ["instagram", "tiktok"]})

    def test_six_real_outputs_have_correct_parts_qc_and_shared_body(self):
        self.assertTrue(self.manifest["complete"])
        self.assertFalse(self.manifest["productionReady"])
        self.assertEqual(len(self.manifest["variants"]), 6)
        for variant in self.manifest["variants"]:
            self.assertEqual([p["role"] for p in variant["parts"]], ["hook", "body", "ending"])
            self.assertEqual(variant["parts"][1]["sha256"], self.plan["body"]["sha256"])
            self.assertTrue(variant["technicalQc"]["technicalPassed"])
            video = self.root / "assembled" / variant["outputFile"]
            self.assertEqual(media.sha256(video), variant["sha256"])
            self.assertAlmostEqual(variant["duration"], 0.48)
            for part in variant["parts"]:
                def pixel(path, time):
                    return subprocess.check_output(["ffmpeg", "-nostdin", "-v", "error", "-ss", str(time),
                        "-i", str(path), "-frames:v", "1", "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], timeout=30)
                original = pixel(self.root / part["localPath"], 0.04)
                output = pixel(video, part["timelineStart"] + 0.04)
                self.assertTrue(all(abs(a-b) < 15 for a,b in zip(original, output)))

    def test_incomplete_set_waits_without_creating_output(self):
        folder = self.root / "rr/incoming/empty"
        folder.mkdir()
        result = self.inspect(directory="rr/incoming/empty")
        self.assertEqual(result["status"], "waiting_for_parts")
        self.assertEqual(len(result["missing"]), 7)
        self.assertNotIn("plan", result)
        (folder / "recording-set.json").write_text(json.dumps(self.receipt))
        self.assertEqual(len(self.inspect(directory="rr/incoming/empty")["missing"]), 6)

    def test_changed_receipt_text_version_topic_and_names_rejected(self):
        changes = [lambda r:r.update(scriptVersion=2), lambda r:r.update(scriptVersion=True),
                   lambda r:r.update(topicId="another-topic"),
                   lambda r:r["files"][0].update(textHash="0"*64),
                   lambda r:r["files"][0].update(fileName="../body.mp4"),
                   lambda r:r["files"][1].update(fileName="body.mp4"),
                   lambda r:r["files"][0].update(sha256="0"*64)]
        try:
            for change in changes:
                bad=copy.deepcopy(self.receipt);change(bad)
                self.receipt_path.write_text(json.dumps(bad))
                with self.assertRaises(ValueError): self.inspect()
        finally:
            self.receipt_path.write_text(json.dumps(self.receipt))

    def test_mixed_editorial_text_is_not_silently_rebound(self):
        for change in [lambda p:p["sourceSet"].update(body_text="Changed"),
                       lambda p:p["items"][0].update(script_text="Changed"),
                       lambda p:p["items"][0].update(script_revision=2)]:
            bad=copy.deepcopy(self.packet);change(bad)
            with self.assertRaises(ValueError): self.inspect(packet=bad)

    def test_unsafe_paths_and_symlinked_source_are_rejected(self):
        for path in ["../outside", "/tmp", "rr\\incoming", "rr/incoming/../../", "rr/other"]:
            with self.assertRaises(ValueError): self.inspect(directory=path)
        path = self.incoming / "body.mp4"
        backup = path.with_suffix(".backup")
        path.rename(backup)
        try:
            path.symlink_to(self.root / "assembled" / self.manifest["variants"][0]["outputFile"])
            with self.assertRaises(ValueError): self.inspect()
        finally:
            path.unlink();backup.rename(path)

    def test_schema_duplicates_text_changes_production_and_silent_media_rejected(self):
        for change in [lambda p:p.update(mode="production"), lambda p:p.update(scriptVersion=True),
                       lambda p:p["endings"].pop(),
                       lambda p:p["endings"][1].update(platform="instagram"),
                       lambda p:p["hooks"][1].update(hookNumber=1),
                       lambda p:p["body"].update(text="Changed"),
                       lambda p:p["hooks"][1].update(localPath=p["hooks"][0]["localPath"],sha256=p["hooks"][0]["sha256"])]:
            bad=copy.deepcopy(self.plan);change(bad)
            out=self.root / "must-not-exist"
            with patch.object(media,"PUBLIC",self.root),self.assertRaises(ValueError): assembler.assemble(bad,out)
            self.assertFalse(out.exists())
        source = self.incoming / "body.mp4"
        original = source.read_bytes()
        try:
            source.write_bytes(b"broken mp4")
            with self.assertRaises(ValueError): self.inspect()
            subprocess.run(["ffmpeg","-nostdin","-v","error","-y","-f","lavfi","-i",
                "color=c=blue:s=108x192:r=25","-t","0.16","-c:v","libx264",str(source)],check=True,capture_output=True)
            bad=copy.deepcopy(self.plan);bad["body"]["sha256"]=media.sha256(source)
            with patch.object(media,"PUBLIC",self.root),self.assertRaises(ValueError): assembler.assemble(bad,self.root/"silent-output")
            self.assertFalse((self.root/"silent-output").exists())
        finally: source.write_bytes(original)

    def test_six_jobs_have_real_part_offsets_and_unapproved_asr_text(self):
        original=copy.deepcopy(self.speech)
        jobs=self.jobs()
        self.assertEqual(len(jobs),6)
        for job,evidence in jobs:
            platform=evidence["platform"]
            self.assertEqual(job["topicId"],f"{self.plan['topicId']}-{platform}")
            self.assertEqual(job["scriptVersion"],self.plan["scriptVersion"])
            self.assertEqual(job["wordTimings"][-1]["text"],f"ending-{platform}.mp4")
            self.assertAlmostEqual(job["wordTimings"][-1]["start"],0.34)
            self.assertAlmostEqual(job["speechSegments"][-1]["end"],0.44)
            self.assertEqual(job["approvalStatus"],"pending_approval")
            self.assertNotIn("approval",job)
            self.assertTrue(evidence["needsSpeechReview"])
        self.assertEqual(self.speech,original)
        self.assertEqual(len({j["scriptHash"] for j,_ in jobs}),6)

    def test_missing_stale_or_swapped_ending_speech_and_bad_manifest_rejected(self):
        with self.assertRaises(ValueError): self.jobs(endings={})
        swapped={"instagram":self.speech["ending-tiktok.mp4"],"tiktok":self.speech["ending-instagram.mp4"]}
        with self.assertRaises(ValueError): self.jobs(endings=swapped)
        stale=copy.deepcopy({p:self.speech[f"ending-{p}.mp4"] for p in ["instagram","tiktok"]})
        stale["tiktok"]["sourceSha256"]="0"*64
        with self.assertRaises(ValueError): self.jobs(endings=stale)
        for change in [lambda m:m.update(complete=False),lambda m:m["variants"].pop(),
                       lambda m:m["variants"][1].update(hookNumber=1),
                       lambda m:m["variants"][0].update(endingStart=0),
                       lambda m:m["variants"][0]["parts"][2].update(text="Changed")]:
            bad=copy.deepcopy(self.manifest);change(bad)
            with self.assertRaises(ValueError): self.jobs(manifest=bad)

    def test_repeat_assembly_cannot_overwrite_existing_files(self):
        marker=self.root / "assembled/keep.txt";marker.write_text("keep")
        with patch.object(media,"PUBLIC",self.root),self.assertRaises(FileExistsError):
            assembler.assemble(self.plan,self.root/"assembled")
        self.assertEqual(marker.read_text(),"keep")

    def test_source_changed_during_concat_never_marks_assembly_complete(self):
        source=self.incoming/"body.mp4"
        original=source.read_bytes()
        real_concat=assembler.concatenate
        def change_source(*args, **kwargs):
            real_concat(*args, **kwargs)
            source.write_bytes(original+b"changed during assembly")
        out=self.root/"interrupted"
        try:
            with patch.object(media,"PUBLIC",self.root),patch.object(assembler,"concatenate",side_effect=change_source),self.assertRaises(ValueError):
                assembler.assemble(self.plan,out)
            self.assertFalse(json.loads((out/"assembly.json").read_text())["complete"])
            self.assertEqual(list(out.glob("R-*.mp4")),list(out.glob("R-*.partial.mp4")))
        finally: source.write_bytes(original)


if __name__ == "__main__": unittest.main()
