"""Remotion launch through Node: command shape, error messages and the installed CLI help. No render, no network."""
import importlib.util
import json
from pathlib import Path, PurePosixPath, PureWindowsPath
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("runner", Path(__file__).with_name("run-development-montage.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

PACKAGE = {"name": "@remotion/cli", "bin": {"remotion": "bin/entry-point.js", "remotionb": "other.js"}}


def fake_pv(root, bin_field=None, create_entry=True, write_package=True):
    pv = Path(root) / "Мой проект pv"  # space and Cyrillic on purpose
    package_dir = pv / "node_modules/@remotion/cli"
    package_dir.mkdir(parents=True)
    if write_package:
        package = dict(PACKAGE)
        if bin_field is not None:
            package["bin"] = bin_field
        (package_dir / "package.json").write_text(json.dumps(package), encoding="utf-8")
    if create_entry:
        (package_dir / "bin").mkdir()
        (package_dir / "bin/entry-point.js").write_text("// fixture entry\n", encoding="utf-8")
    return pv


class RemotionLaunchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

    def test_entry_point_comes_from_package_json_not_from_a_guessed_path(self):
        pv = fake_pv(self.temp.name)
        entry = runner.remotion_cli_entry(pv)
        self.assertEqual(entry, (pv / "node_modules/@remotion/cli/bin/entry-point.js").resolve())
        self.assertNotEqual(entry.name, "remotion-cli.js")  # the real package's file name is not assumed

    def test_missing_cli_or_bad_package_json_gives_clear_errors_without_launching_anything(self):
        for kwargs, text in [({"write_package": False}, "npm ci"),
                             ({"bin_field": {"remotionb": "x.js"}}, "does not declare"),
                             ({"bin_field": "remotion-cli.js"}, "does not declare"),
                             ({"create_entry": False}, "entry point is missing"),
                             ({"bin_field": {"remotion": "../../../../escape.js"}}, "entry point is missing")]:
            with self.subTest(kwargs=kwargs):
                pv = fake_pv(tempfile.mkdtemp(dir=self.temp.name), **kwargs)
                with patch.object(subprocess, "run", side_effect=AssertionError("nothing must be started")):
                    with self.assertRaises(ValueError) as caught:
                        runner.remotion_cli_entry(pv)
                self.assertIn(text, str(caught.exception))
        missing = Path(self.temp.name) / "no-such-pv"
        with self.assertRaises(ValueError) as caught:
            runner.remotion_cli_entry(missing)
        self.assertIn("npm ci", str(caught.exception))

    def test_missing_node_is_a_clear_error_and_nothing_is_downloaded(self):
        pv = fake_pv(self.temp.name)
        with patch.object(runner.shutil, "which", return_value=None), \
                patch.object(subprocess, "run", side_effect=AssertionError("nothing must be started")):
            with self.assertRaises(ValueError) as caught:
                runner.render_with_remotion("out.mp4", "props.json", [], pv=pv)
        self.assertIn("Node.js was not found", str(caught.exception))
        self.assertIn("nothing is downloaded", str(caught.exception))

    def test_command_is_one_argument_per_item_for_windows_and_posix_paths(self):
        cases = {
            "windows": (PureWindowsPath(r"C:\Program Files\nodejs\node.exe"),
                        PureWindowsPath(r"C:\Users\Иван Петров\проект pv\node_modules\@remotion\cli\bin\entry-point.js"),
                        PureWindowsPath(r"D:\Мои видео\out dir\remotion-encoded.mp4"),
                        PureWindowsPath(r"D:\Мои видео\out dir\montage-job.json"),
                        PureWindowsPath(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")),
            "posix": (PurePosixPath("/usr/local/bin/node"),
                      PurePosixPath("/home/иван петров/проект pv/node_modules/@remotion/cli/bin/entry-point.js"),
                      PurePosixPath("/tmp/мои видео/out dir/remotion-encoded.mp4"),
                      PurePosixPath("/tmp/мои видео/out dir/montage-job.json"),
                      PurePosixPath("/opt/chromium dir/chrome")),
        }
        for name, (node, entry, video, props, browser) in cases.items():
            with self.subTest(os=name):
                command = runner.remotion_render_command(node, entry, video, props, ["--browser-executable", str(browser)])
                self.assertEqual(command, [
                    str(node), str(entry), "render", "RomanFactoryV1", str(video), "--props", str(props),
                    "--codec", "h264", "--audio-codec", "aac", "--crf", "18", "--concurrency", "2",
                    "--browser-executable", str(browser)])
                self.assertTrue(all(isinstance(item, str) for item in command))
                self.assertIn(str(video), command)  # a path with spaces stays a single item
                self.assertNotIn("npx", command)

    def test_subprocess_options_are_kept_and_no_shell_is_used(self):
        pv = fake_pv(self.temp.name)
        calls = []
        with patch.object(runner.shutil, "which", return_value="/fake/node"):
            runner.render_with_remotion(Path("o u t/remotion-encoded.mp4"), Path("o u t/montage-job.json"),
                                        ["--browser-executable", "/fake/edge"], pv=pv,
                                        run=lambda *args, **kwargs: calls.append((args, kwargs)))
        (args, kwargs), = calls
        command = args[0]
        self.assertIsInstance(command, list)
        self.assertEqual(command[0], "/fake/node")
        self.assertEqual(command[1], str(runner.remotion_cli_entry(pv)))
        self.assertEqual(kwargs, {"cwd": pv, "timeout": 900, "check": True})
        self.assertNotIn("shell", kwargs)

    def test_run_checks_node_and_cli_before_creating_any_output(self):
        pv = Path(self.temp.name) / "pv-without-node-modules"
        pv.mkdir()
        with patch.object(runner, "PV", pv), patch.object(runner, "check_input", return_value=None):
            with self.assertRaises(ValueError) as caught:
                runner.run({"sourceVideo": {"fps": 25}}, Path(self.temp.name) / "out")
        self.assertIn("npm ci", str(caught.exception))
        self.assertFalse((Path(self.temp.name) / "out").exists())

    def test_runner_source_no_longer_starts_npx(self):
        source = Path(runner.__file__).read_text(encoding="utf-8") if hasattr(runner, "__file__") else \
            Path(__file__).with_name("run-development-montage.py").read_text(encoding="utf-8")
        self.assertNotIn('"npx"', source)
        self.assertIn("render_with_remotion(", source.split("def run(", 1)[1])

    @unittest.skipUnless((runner.PV / "node_modules/@remotion/cli/package.json").is_file()
                         and runner.shutil.which("node"), "Remotion dependencies or Node are not installed here")
    def test_installed_cli_answers_the_help_command_without_rendering(self):
        entry = runner.remotion_cli_entry()
        result = subprocess.run([runner.find_node(), str(entry), "render", "--help"], cwd=runner.PV,
                                capture_output=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stderr[-400:])
        self.assertIn(b"render", result.stdout.lower())


if __name__ == "__main__":
    unittest.main()
