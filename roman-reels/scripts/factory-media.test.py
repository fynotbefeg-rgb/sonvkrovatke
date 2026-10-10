"""Meaningful local FFmpeg integration and speech safety tests, no model/network."""
import copy
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import factory_media as media
from preserve_source_audio import preserve, decoded_audio_hash

spec = importlib.util.spec_from_file_location("development", Path(__file__).with_name("prepare-development-job.py"))
development = importlib.util.module_from_spec(spec)
spec.loader.exec_module(development)

runner_spec = importlib.util.spec_from_file_location("runner", Path(__file__).with_name("run-development-montage.py"))
runner = importlib.util.module_from_spec(runner_spec)
runner_spec.loader.exec_module(runner)
alignment_spec = importlib.util.spec_from_file_location("alignment", Path(__file__).with_name("realign-development-speech.py"))
alignment = importlib.util.module_from_spec(alignment_spec)
alignment_spec.loader.exec_module(alignment)


class MediaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.video = Path(cls.tmp.name) / "fixture.mp4"
        cls.silent = Path(cls.tmp.name) / "silent.mp4"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
            "color=c=black:s=1080x1920:r=25", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
            "-t", "0.4", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "38",
            "-pix_fmt", "yuv420p", "-c:a", "aac", str(cls.video)], check=True, capture_output=True, timeout=30)
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(cls.video), "-c:v", "copy",
                        "-an", str(cls.silent)], check=True, capture_output=True, timeout=30)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_real_file_passes_technical_qc_but_never_authorizes_production(self):
        report = media.technical_qc(self.video, 0.4, 25)
        self.assertTrue(report["technicalPassed"])
        self.assertFalse(report["productionReady"])
        self.assertEqual(report["outputSha256"], media.sha256(self.video))
        self.assertIn("subtitle_layout", report["remainingChecks"])

    def test_wrong_duration_and_fps_fail(self):
        for duration, fps in [(10, 25), (0.4, 30)]:
            self.assertFalse(media.technical_qc(self.video, duration, fps)["technicalPassed"])

    def test_silent_and_corrupt_file_are_rejected(self):
        with self.assertRaises(ValueError):
            media.technical_qc(self.silent, 0.4, 25)
        corrupt = Path(self.tmp.name) / "broken.mp4"
        corrupt.write_bytes(b"not an mp4")
        with self.assertRaises(subprocess.CalledProcessError):
            media.technical_qc(corrupt, 0.4, 25)

    def test_path_traversal_urls_control_chars_and_symlink_escape(self):
        with tempfile.TemporaryDirectory() as public:
            Path(public, "escape.mp4").symlink_to(self.video)
            with patch.object(media, "PUBLIC", Path(public)):
                for value in ["../fixture.mp4", str(self.video), "https://x/video.mp4",
                              "..\\fixture.mp4", "bad\n.mp4", "escape.mp4"]:
                    with self.assertRaises(ValueError):
                        media.public_source(value)

    def test_unusable_word_times_are_rejected_without_interpolation(self):
        valid = [{"text": "Речь", "start": 0.1, "end": 0.2}, {"text": "тест", "start": 0.3, "end": 0.4}]
        media.validate_intervals(valid, 0.4)
        for key, value in [("start", 0.15), ("start", True), ("end", 0.3),
                           ("end", float("nan")), ("end", float("inf")), ("end", 0.5)]:
            bad = copy.deepcopy(valid)
            bad[1][key] = value
            original = copy.deepcopy(bad)
            with self.assertRaises(ValueError):
                media.validate_intervals(bad, 0.4)
            self.assertEqual(repr(bad), repr(original))

    def test_real_checksum_and_metadata_bind_development_job_to_bytes(self):
        speech = {"artifactVersion": "1.0.0", "mode": "development",
            "alignmentMethod": "whisper_word_timestamps_not_forced_alignment",
            "sourceRelativePath": "fixture.mp4", "sourceSha256": media.sha256(self.video),
            "sourceMetadata": media.probe(self.video), "transcriptText": "Тест",
            "wordTimings": [{"text": "Тест", "start": 0.1, "end": 0.3}],
            "speechSegments": [{"text": "Тест", "start": 0.1, "end": 0.3}]}
        with patch.object(development, "public_source", return_value=self.video):
            job = development.prepare(speech)
            self.assertEqual(job["approvalStatus"], "pending_approval")
            self.assertEqual(job["mode"], "development")
            self.assertNotIn("approval", job)
            with patch.object(runner, "public_source", return_value=self.video), \
                    patch.object(runner, "DIRECTOR", Path(self.tmp.name) / "missing-director.ts"), \
                    patch.object(subprocess, "run", wraps=subprocess.run) as process:
                with self.assertRaisesRegex(ValueError, "Claude Director not delivered"):
                    runner.run(job, Path(self.tmp.name) / "should-not-exist")
                self.assertFalse(Path(self.tmp.name, "should-not-exist").exists())
                self.assertTrue(all(call.args[0][0] != "npx" for call in process.call_args_list))
            for change in [lambda s: s.update(sourceSha256="0"*64),
                           lambda s: s["sourceMetadata"].update(duration=20),
                           lambda s: s.update(mode="production")]:
                bad = copy.deepcopy(speech)
                change(bad)
                with self.assertRaises(ValueError):
                    development.prepare(bad)

    def test_alignment_pronunciation_does_not_change_display_or_drop_numbers(self):
        self.assertEqual(alignment.label("Telegram,"), "телеграм")
        self.assertEqual(alignment.label("WhatsApp,"), "ватсап")
        self.assertEqual(alignment.label("Клиенты"), "клиенты")
        for text in ["10", "unknown-tool", "!"]:
            with self.assertRaises(ValueError):
                alignment.label(text)

    def test_remux_restores_original_audio_after_encoder_delay(self):
        delayed = Path(self.tmp.name) / "delayed.mp4"
        output = Path(self.tmp.name) / "preserved.mp4"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(self.video),
            "-c:v", "copy", "-af", "adelay=43:all=1", "-c:a", "aac", str(delayed)],
            capture_output=True, check=True, timeout=30)
        self.assertNotEqual(decoded_audio_hash(delayed), decoded_audio_hash(self.video))
        report = preserve(self.video, delayed, output, media.sha256(self.video))
        self.assertEqual(decoded_audio_hash(output), decoded_audio_hash(self.video))
        self.assertTrue(media.technical_qc(output, 0.4, 25)["technicalPassed"])
        self.assertFalse(report["productionReady"])
        before = media.sha256(output)
        with self.assertRaises(FileExistsError):
            preserve(self.video, delayed, output, media.sha256(self.video))
        self.assertEqual(before, media.sha256(output))

    def test_audio_preservation_rejects_changed_source_before_writing(self):
        output = Path(self.tmp.name) / "bad-audio-must-not-exist.mp4"
        with self.assertRaises(ValueError):
            preserve(self.video, self.video, output, "0" * 64)
        self.assertFalse(output.exists())

    def test_audio_preservation_rejects_changed_video_timeline(self):
        longer = Path(self.tmp.name) / "longer.mp4"
        output = Path(self.tmp.name) / "changed-timeline-must-not-exist.mp4"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(self.video),
            "-vf", "setpts=2*PTS", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "copy", str(longer)],
            capture_output=True, check=True, timeout=30)
        with self.assertRaises(ValueError):
            preserve(self.video, longer, output, media.sha256(self.video))
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
