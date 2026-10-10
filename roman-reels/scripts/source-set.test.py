"""Three actual concat outputs: check each hook, shared body, seams and safety gates."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import factory_media as media

spec = importlib.util.spec_from_file_location("assembler", Path(__file__).with_name("assemble-source-set.py"))
assembler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assembler)


class SourceSetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        for name, color in [("h1", "red"), ("h2", "green"), ("h3", "yellow"), ("body", "blue")]:
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
                f"color=c={color}:s=108x192:r=25", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
                "-t", "0.16", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
                str(cls.root / f"{name}.mp4")], capture_output=True, timeout=30, check=True)
        cls.plan = {"assemblyVersion": "1.0.0", "mode": "development", "topicId": "test",
                    "body": {"localPath": "body.mp4", "sha256": media.sha256(cls.root / "body.mp4")},
                    "hooks": [{"hookNumber": n, "localPath": f"h{n}.mp4",
                               "sha256": media.sha256(cls.root / f"h{n}.mp4")} for n in [1, 2, 3]]}

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def source_root(self):
        return patch.object(media, "PUBLIC", self.root)

    def test_three_real_outputs_have_correct_hooks_and_same_body(self):
        with self.source_root():
            out = self.root / "outputs"
            result = assembler.assemble(self.plan, out)
        self.assertTrue(result["complete"])
        self.assertFalse(result["productionReady"])
        self.assertEqual(len(result["variants"]), 3)
        for variant in result["variants"]:
            video = out / variant["outputFile"]
            self.assertEqual(variant["parts"][1]["sha256"], self.plan["body"]["sha256"])
            self.assertTrue(variant["technicalQc"]["technicalPassed"])
            self.assertEqual(media.sha256(video), variant["sha256"])
            colors = []
            for t in [0.04, variant["bodyStart"] + 0.04]:
                r = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-ss", str(t),
                    "-i", str(video), "-frames:v", "1", "-vf", "scale=1:1", "-pix_fmt", "rgb24",
                    "-f", "rawvideo", "-"], capture_output=True, timeout=30, check=True)
                colors.append(tuple(r.stdout))
            red, green, blue = colors[0]
            if variant["hookNumber"] == 1:
                self.assertGreater(red, green + 50)
            elif variant["hookNumber"] == 2:
                self.assertGreater(green, red + 50)
            else:
                self.assertGreater(red, blue + 50)
                self.assertGreater(green, blue + 50)
            self.assertGreater(colors[1][2], max(colors[1][:2]) + 50)

    def test_missing_duplicate_hook_numbers_and_production_are_rejected_before_output(self):
        for change in [lambda p: p["hooks"].pop(),
                       lambda p: p["hooks"][2].update(hookNumber=1),
                       lambda p: p.update(mode="production")]:
            bad = copy.deepcopy(self.plan)
            change(bad)
            out = self.root / "must-not-exist"
            with self.source_root(), self.assertRaises(ValueError):
                assembler.assemble(bad, out)
            self.assertFalse(out.exists())

    def test_changed_bytes_and_duplicate_paths_are_rejected(self):
        for change in [lambda p: p["body"].update(sha256="0" * 64),
                       lambda p: p["hooks"][2].update(localPath="h1.mp4", sha256=p["hooks"][0]["sha256"])]:
            bad = copy.deepcopy(self.plan)
            change(bad)
            with self.source_root(), self.assertRaises(ValueError):
                assembler.verify(bad)

    def test_repeat_run_never_overwrites_existing_directory(self):
        out = self.root / "existing"
        out.mkdir()
        marker = out / "keep.txt"
        marker.write_text("history")
        with self.source_root(), self.assertRaises(FileExistsError):
            assembler.assemble(self.plan, out)
        self.assertEqual(marker.read_text(), "history")


if __name__ == "__main__":
    unittest.main()
