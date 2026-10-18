"""Launcher orchestration with stub processes: no ASR model, no render, no network."""
import contextlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import factory_media as media


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

launcher = load('local_four_launcher', 'run-local-four-part.py')
helpers = load('local_four_helpers', 'assembled-jobs.test.py')


class Done:
    def __init__(self, code): self.returncode = code


class LauncherTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): helpers.AssembledJobTests.setUpClass()
    @classmethod
    def tearDownClass(cls): helpers.AssembledJobTests.tearDownClass()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); root = Path(self.temp.name)
        self.public = root / 'Мой pv' / 'public'; (self.public / 'rr/incoming').mkdir(parents=True)
        (root / 'downloads').mkdir()
        self.parts = {}
        for part in launcher.PARTS:
            self.parts[part] = root / 'downloads' / f'HeyGen {part}.mp4'  # spaces/Cyrillic in the path
            shutil.copyfile(helpers.AssembledJobTests.root / f'{part}.mp4', self.parts[part])
        self.model = root / 'model'; self.model.mkdir(); (self.model / 'model.bin').write_bytes(b'stub')
        self.browser = root / 'edge.exe'; self.browser.write_bytes(b'stub')
        self.out = root / 'results' / 'run-1'
        self.calls = []
        patcher = patch.object(media, 'PUBLIC', self.public); patcher.start(); self.addCleanup(patcher.stop)

    def tearDown(self): self.temp.cleanup()

    def stub(self, fail=None):
        def runner(command, cwd=None, stdout=None, stderr=None, check=None):
            name = 'montage' if command[1].endswith('run-shared-body-development.py') else 'asr-' + Path(command[command.index('--out') + 1]).name
            self.calls.append((name, command))
            stdout.write(f'stub {name}\n')
            if name == fail: return Done(1)
            if name == 'montage':
                out = Path(command[command.index('--out') + 1]); out.mkdir()
                (out / 'pipeline-report.json').write_text(json.dumps({'complete': True, 'renders': [{'hookNumber': 1}]}))
            else:
                out = Path(command[command.index('--out') + 1]); out.mkdir(parents=True)
                (out / 'speech.json').write_text('{}')
            return Done(0)
        return runner

    def launch(self, **options):
        values = dict(model_path=self.model, model_revision='rev', browser=self.browser, runner=self.stub())
        values.update(options)
        return launcher.run(self.parts, 'local-test', self.out, **values)

    def nothing_created(self):
        self.assertFalse(self.out.exists())
        self.assertEqual(list((self.public / 'rr/incoming').iterdir()), [])

    def test_default_is_plan_only_with_hashes_and_laptop_settings(self):
        report = self.launch(runner=lambda *a, **k: self.fail('no ASR or render step may start in plan mode'))
        self.nothing_created()
        self.assertFalse(report['execute']); self.assertFalse(report['productionReady'])
        self.assertEqual(report['approvalStatus'], 'pending_approval'); self.assertTrue(report['needsSpeechReview'])
        for part in launcher.PARTS:
            self.assertEqual(report['inputs'][part]['sha256'], media.sha256(self.parts[part]))
        self.assertEqual([s['name'] for s in report['steps']], ['asr-body', 'asr-h1', 'asr-h2', 'asr-h3', 'montage'])
        self.assertTrue(all(s['status'] == 'planned' for s in report['steps']))
        montage = report['steps'][-1]['command']
        self.assertEqual(montage[montage.index('--render-concurrency') + 1], '1')
        self.assertEqual(montage[montage.index('--offthreadvideo-cache-size-in-bytes') + 1], '268435456')
        self.assertTrue(montage[1].endswith('run-shared-body-development.py'))
        self.assertTrue(all(s['command'][1].endswith('transcribe-development-source.py') for s in report['steps'][:4]))

    def test_execute_runs_existing_scripts_in_order_and_keeps_evidence(self):
        report = self.launch(execute=True)
        self.assertEqual([c[0] for c in self.calls], ['asr-body', 'asr-h1', 'asr-h2', 'asr-h3', 'montage'])
        self.assertTrue(report['complete']); self.assertFalse(report['productionReady'])
        self.assertEqual(report['approvalStatus'], 'pending_approval')
        saved = json.loads((self.out / 'launch-report.json').read_text(encoding='utf-8'))
        self.assertEqual([s['status'] for s in saved['steps']], ['passed'] * 5)
        self.assertTrue(all('seconds' in s and s['exitCode'] == 0 for s in saved['steps']))
        for step in saved['steps']:
            self.assertTrue((self.out / f"logs/{step['name']}.stdout.log").is_file())
        source_set = json.loads((self.out / 'source-set.json').read_text(encoding='utf-8'))
        for part in launcher.PARTS:
            copy = self.public / f'rr/incoming/run-1-parts/{part}.mp4'
            self.assertEqual(media.sha256(copy), media.sha256(self.parts[part]))
        self.assertEqual(source_set['body']['localPath'], 'rr/incoming/run-1-parts/body.mp4')
        asr = dict(self.calls)['asr-h2']
        self.assertEqual(asr[asr.index('--source') + 1], 'rr/incoming/run-1-parts/h2.mp4')
        montage = dict(self.calls)['montage']
        self.assertEqual(montage[montage.index('--public-directory') + 1], 'rr/incoming/run-1-assembled')

    def test_relative_model_path_is_resolved_against_the_callers_folder(self):
        caller = Path(self.temp.name)
        self.assertNotEqual(caller.resolve(), launcher.SCRIPTS)
        with contextlib.chdir(caller):  # the user's folder, not SCRIPTS where the children run
            report = self.launch(model_path=Path('model'), execute=True)
        expected = str(self.model.resolve())
        for step in report['steps'][:4]:
            self.assertEqual(step['command'][step['command'].index('--model-path') + 1], expected)
        asr = dict(self.calls)['asr-body']
        self.assertTrue(Path(asr[asr.index('--model-path') + 1]).is_absolute())

    def test_failure_stops_without_retry_and_is_recorded(self):
        with self.assertRaises(RuntimeError): self.launch(execute=True, runner=self.stub(fail='asr-h2'))
        self.assertEqual([c[0] for c in self.calls], ['asr-body', 'asr-h1', 'asr-h2'])
        saved = json.loads((self.out / 'launch-report.json').read_text(encoding='utf-8'))
        self.assertEqual([s['status'] for s in saved['steps']], ['passed', 'passed', 'failed', 'planned', 'planned'])
        self.assertFalse(saved['complete'])

    def test_invalid_inputs_are_rejected_before_anything_is_created(self):
        cases = [
            dict(parts={**self.parts, 'h3': self.parts['h1']}),
            dict(parts={**self.parts, 'h2': Path(self.temp.name) / 'missing.mp4'}),
            dict(topic='Bad Topic'), dict(out=Path(self.temp.name) / 'bad name!'),
            dict(render_hooks=(1, 1)), dict(render_hooks=(4,)),
            dict(execute=True, model_path=None), dict(execute=True, browser=None),
            dict(execute=True, model_path=Path(self.temp.name) / 'no-model'),
        ]
        for case in cases:
            with self.subTest(case=case):
                parts, topic, out = case.pop('parts', self.parts), case.pop('topic', 'local-test'), case.pop('out', self.out)
                values = dict(model_path=self.model, model_revision='rev', browser=self.browser,
                              runner=lambda *a, **k: self.fail('nothing may start'))
                values.update(case)
                with self.assertRaises((ValueError, OSError)): launcher.run(parts, topic, out, **values)
                self.nothing_created()
        bad = Path(self.temp.name) / 'not-video.mp4'; bad.write_bytes(b'not a video')
        with self.assertRaises((ValueError, subprocess.CalledProcessError)):
            launcher.run({**self.parts, 'body': bad}, 'local-test', self.out)
        self.nothing_created()

    def test_existing_output_or_public_folder_is_never_overwritten(self):
        self.out.mkdir(parents=True); (self.out / 'keep.txt').write_text('keep')
        with self.assertRaises(ValueError): self.launch(execute=True)
        self.assertEqual((self.out / 'keep.txt').read_text(), 'keep'); self.assertEqual(self.calls, [])
        other = Path(self.temp.name) / 'results' / 'run-2'
        (self.public / 'rr/incoming/run-2-assembled').mkdir()
        with self.assertRaises(ValueError):
            launcher.run(self.parts, 'local-test', other, self.model, 'rev', self.browser, execute=True, runner=self.stub())
        self.assertFalse(other.exists()); self.assertEqual(self.calls, [])

    def test_command_line_defaults_to_plan_and_rejects_bad_input_with_exit_2(self):
        script = Path(__file__).with_name('run-local-four-part.py')
        help_text = subprocess.run([sys.executable, str(script), '--help'], capture_output=True, text=True,
                                   encoding='utf-8', timeout=60).stdout
        self.assertIn('--execute', help_text)
        args = [sys.executable, str(script), '--topic-id', 'local-test', '--out', str(self.out)]
        for part in launcher.PARTS:
            args += [f'--{part}', str(Path(self.temp.name) / 'missing.mp4')]
        run = subprocess.run(args, capture_output=True, timeout=60)
        self.assertEqual(run.returncode, 2); self.assertFalse(self.out.exists())


if __name__ == '__main__': unittest.main()
