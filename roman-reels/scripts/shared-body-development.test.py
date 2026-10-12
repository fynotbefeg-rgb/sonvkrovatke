"""Development orchestration guards and partial failures, no actual renderer/network."""
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import factory_media as media


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

pipeline = load('dev_pipeline', 'run-shared-body-development.py')
helpers = load('assembly_helpers', 'assembled-jobs.test.py')


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): helpers.AssembledJobTests.setUpClass()
    @classmethod
    def tearDownClass(cls): helpers.AssembledJobTests.tearDownClass()
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name) / 'public'; self.root.mkdir()
        for file in helpers.AssembledJobTests.root.glob('*.mp4'):
            shutil.copyfile(file, self.root / file.name)
        self.speech = copy.deepcopy(helpers.AssembledJobTests.speech)
        self.plan = {'assemblyVersion': '1.0.0', 'mode': 'development', 'topicId': 'test',
                     'body': {'localPath': 'body.mp4', 'sha256': self.speech['body']['sourceSha256']},
                     'hooks': [{'hookNumber': n, 'localPath': f'h{n}.mp4', 'sha256': self.speech[f'h{n}']['sourceSha256']} for n in [1, 2, 3]]}
        self.out = Path(self.temp.name) / 'output'
    def tearDown(self): self.temp.cleanup()
    def run_pipeline(self, renderer, hooks=(1, 2, 3)):
        with patch.object(media, 'PUBLIC', self.root):
            return pipeline.run(self.plan, self.speech['body'], {n: self.speech[f'h{n}'] for n in [1, 2, 3]},
                                'rr/incoming/new-run', self.out, render_hooks=hooks, renderer=renderer)

    def test_three_distinct_jobs_and_no_approval_or_fresh_asr_claim(self):
        jobs = []
        def renderer(job, *_):
            jobs.append(job)
            return {'technicalPassed': True, 'outputSha256': job['sourceVideo']['sha256']}
        report = self.run_pipeline(renderer)
        self.assertTrue(report['complete']); self.assertTrue(report['allThreeRendered'])
        self.assertFalse(report['freshRecognition']); self.assertFalse(report['productionReady'])
        self.assertEqual([j['hookNumber'] for j in jobs], [1, 2, 3])
        for job in jobs:
            self.assertEqual(job['approvalStatus'], 'pending_approval')
            self.assertNotIn('approval', job)
            self.assertGreater(job['wordTimings'][1]['start'], job['wordTimings'][0]['start'])

    def test_renderer_failure_leaves_complete_false_and_preserves_originals(self):
        calls = []
        def renderer(job, *_):
            calls.append(job['hookNumber'])
            if len(calls) == 2: raise ValueError('Render failure')
            return {'technicalPassed': True, 'outputSha256': job['sourceVideo']['sha256']}
        with self.assertRaises(ValueError): self.run_pipeline(renderer)
        report = json.loads((self.out / 'pipeline-report.json').read_text())
        self.assertFalse(report['complete']); self.assertEqual(len(report['renders']), 1)
        for source in [self.plan['body'], *self.plan['hooks']]:
            self.assertEqual(media.sha256(self.root / source['localPath']), source['sha256'])

    def test_unsafe_directory_production_or_wrong_hook_selection_fail_before_outputs(self):
        self.plan['mode'] = 'production'
        with self.assertRaises(ValueError): self.run_pipeline(lambda *_: None)
        self.assertFalse(self.out.exists())
        self.plan['mode'] = 'development'
        for hooks in [(), (1, 1), (4,), (True,)]:
            with self.assertRaises(ValueError): self.run_pipeline(lambda *_: None, hooks)
        with patch.object(media, 'PUBLIC', self.root), self.assertRaises(ValueError):
            pipeline.run(self.plan, {}, {}, '../escape', self.out)
        self.assertFalse(self.out.exists())

    def test_changed_speech_cache_blocks_before_assembly(self):
        self.speech['h2']['sourceSha256'] = '0' * 64
        with self.assertRaises(ValueError): self.run_pipeline(lambda *_: None)
        self.assertFalse(self.out.exists())
        self.assertFalse((self.root / 'rr/incoming/new-run').exists())


if __name__ == '__main__': unittest.main()
