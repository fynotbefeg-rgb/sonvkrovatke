"""Optional editorial plan: binding to originals/ASR/PNG, unsafe paths, shared body, prior behaviour without a plan.

Real synthetic MP4s, real Director validation and contract; the renderer is a stub, nothing is rendered.
"""
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib

import editorial_plan as editorial
import factory_media as media


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

pipeline = load('editorial_pipeline', 'run-shared-body-development.py')
launcher = load('editorial_launcher', 'run-local-four-part.py')
helpers = load('editorial_helpers', 'assembled-jobs.test.py')


def png(color):
    chunk = lambda kind, data: struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress(b'\x00' + bytes(color))) + chunk(b'IEND', b''))


class EditorialPlanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): helpers.AssembledJobTests.setUpClass()
    @classmethod
    def tearDownClass(cls): helpers.AssembledJobTests.tearDownClass()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); base = Path(self.temp.name)
        self.root = base / 'public'; self.root.mkdir()
        for file in helpers.AssembledJobTests.root.glob('*.mp4'):
            shutil.copyfile(file, self.root / file.name)
        self.speech = copy.deepcopy(helpers.AssembledJobTests.speech)
        self.source_set = {'assemblyVersion': '1.0.0', 'mode': 'development', 'topicId': 'test',
                           'body': {'localPath': 'body.mp4', 'sha256': self.speech['body']['sourceSha256']},
                           'hooks': [{'hookNumber': n, 'localPath': f'h{n}.mp4', 'sha256': self.speech[f'h{n}']['sourceSha256']}
                                     for n in [1, 2, 3]]}
        self.kit = base / 'kit'; self.kit.mkdir()
        (self.kit / 'insert-a.png').write_bytes(png([200, 30, 30]))
        self.assets = self.root / 'rr/incoming/run-editorial'
        self.automatic = self.automatic_run()
        self.plan = self.reviewed_plan()

    def tearDown(self): self.temp.cleanup()

    def run_pipeline(self, renderer, out, editorial_plan=True, public='rr/incoming/new-run'):
        options = {}
        if editorial_plan:
            (self.kit / 'editorial-plan.json').write_text(json.dumps(self.plan, ensure_ascii=False), encoding='utf-8')
            if not self.assets.exists():
                self.assets.mkdir(parents=True)
                for name in self.plan['files']:
                    shutil.copyfile(self.kit / name, self.assets / name)
            options = {'editorial_plan_file': self.kit / 'editorial-plan.json', 'editorial_directory': 'rr/incoming/run-editorial'}
        with patch.object(media, 'PUBLIC', self.root):
            return pipeline.run(self.source_set, self.speech['body'], {n: self.speech[f'h{n}'] for n in [1, 2, 3]},
                                public, out, renderer=renderer, **options)

    def automatic_run(self):
        received = {}
        def renderer(job, *_, montage_plan=None, **__):
            received[job['hookNumber']] = (job, montage_plan)
            return {'technicalPassed': True, 'outputSha256': job['sourceVideo']['sha256']}
        report = self.run_pipeline(renderer, Path(self.temp.name) / 'automatic', editorial_plan=False, public='rr/incoming/auto')
        self.assertNotIn('editorialPlan', report)
        self.manifest = json.loads((self.root / 'rr/incoming/auto/assembly.json').read_text(encoding='utf-8'))
        return received

    def reviewed_plan(self):
        """What the review produces: corrected text on the ASR intervals, one PNG insert in the shared body."""
        variants = {}
        for n, (job, plan) in self.automatic.items():
            body_start = next(v['bodyStart'] for v in self.manifest['variants'] if v['hookNumber'] == n)
            words = [{**w, 'text': w['text'].replace('Основа', 'Основа исправлена')} for w in job['wordTimings']]
            events = [e for e in plan['events'] if e['type'] == 'caption' or e['start'] < body_start]
            caption = next(e for e in events if e['id'].startswith('body-'))
            events.insert(events.index(caption) + 1, {
                'id': 'body-interface-a', 'type': 'interface', 'start': caption['start'], 'end': caption['end'],
                'wordStart': caption['wordStart'], 'wordEnd': caption['wordEnd'], 'assetId': 'insert-a',
                'animation': 'fade', 'position': 'top', 'layer': 2, 'transition': 'fade', 'respectSafeZone': True})
            variants[str(n)] = {'assembledSha256': job['sourceVideo']['sha256'], 'hookText': job['hookText'],
                                'scriptText': job['scriptText'].replace('Основа', 'Основа исправлена'),
                                'wordTimings': words, 'speechSegments': job['speechSegments'],
                                'visualAssets': [{'id': 'insert-a', 'type': 'image', 'file': 'insert-a.png',
                                                  'rightsReference': 'Own test card'}],
                                'montagePlan': {'events': events}}
        return copy.deepcopy({'editorialPlanVersion': '1.0.0', 'topicId': 'test',
                'parts': {'body': self.speech['body']['sourceSha256'],
                          **{f'h{n}': self.speech[f'h{n}']['sourceSha256'] for n in [1, 2, 3]}},
                'files': {'insert-a.png': media.sha256(self.kit / 'insert-a.png')}, 'variants': variants})

    def rejected(self, pattern=None):
        """The edited run must stop before the first render."""
        self.attempt = getattr(self, 'attempt', 0) + 1
        out = Path(self.temp.name) / f'edited-{self.attempt}'
        def renderer(*_, **__): raise AssertionError('no render may start')
        with self.assertRaises(ValueError) as caught:
            self.run_pipeline(renderer, out, public=f'rr/incoming/edited-{self.attempt}')
        if pattern:
            self.assertRegex(str(caught.exception), pattern)
        report = out / 'pipeline-report.json'
        if report.exists():
            self.assertEqual(json.loads(report.read_text())['renders'], [])
        return out

    def test_reviewed_plan_replaces_only_subtitles_assets_and_plan_and_passes_director_and_contract(self):
        received = {}
        def renderer(job, *_, montage_plan=None, **__):
            received[job['hookNumber']] = (job, montage_plan)
            return {'technicalPassed': True, 'outputSha256': job['sourceVideo']['sha256']}
        out = Path(self.temp.name) / 'edited'
        report = self.run_pipeline(renderer, out)
        self.assertTrue(report['complete'])
        self.assertEqual(report['editorialPlan']['sha256'], media.sha256(self.kit / 'editorial-plan.json'))
        for n, (job, plan) in received.items():
            auto_job, _ = self.automatic[n]
            variant = self.plan['variants'][str(n)]
            self.assertEqual(plan, variant['montagePlan'])
            self.assertEqual(job['wordTimings'], variant['wordTimings'])
            self.assertIn('Основа исправлена', job['scriptText'])
            self.assertEqual(job['visualAssets'][0]['localPath'], 'rr/incoming/run-editorial/insert-a.png')
            self.assertEqual({**job['sourceVideo'], 'localPath': None}, {**auto_job['sourceVideo'], 'localPath': None})
            self.assertEqual(job['sourceVideo']['localPath'], 'rr/incoming/new-run/' + Path(auto_job['sourceVideo']['localPath']).name)
            for key in ['mode', 'approvalStatus', 'productionStatus', 'reelId', 'topicId', 'hookNumber',
                        'schemaVersion', 'scriptVersion']:
                self.assertEqual(job[key], auto_job[key], key)
            self.assertNotIn('renderSettings', job); self.assertNotIn('approval', job)
            saved = json.loads((out / f"{job['reelId']}-editorial-plan.json").read_text(encoding='utf-8'))
            self.assertEqual(saved, plan)
            with patch.object(media, 'PUBLIC', self.root):
                pipeline.montage.check_supplied_plan(job, plan)  # the standard Director + contract checks

    def test_without_plan_the_automatic_plans_reach_the_renderer_as_before(self):
        for n, (job, plan) in self.automatic.items():
            self.assertEqual(job['visualAssets'] if 'visualAssets' in job else [], [])
            self.assertEqual(plan['events'][0]['type'], 'caption')
        self.assertFalse(any(p.name.endswith('-editorial-plan.json') for p in (Path(self.temp.name) / 'automatic').iterdir()))

    def test_substituted_source_part_is_rejected_before_any_output(self):
        self.plan['parts']['h2'] = '0' * 64
        out = self.rejected('parts differ')
        self.assertFalse(out.exists())

    def test_substituted_assembled_source_is_rejected_before_render(self):
        self.plan['variants']['3']['assembledSha256'] = '1' * 64
        self.rejected('assembled source')

    def test_changed_png_or_public_copy_is_rejected(self):
        (self.kit / 'insert-a.png').write_bytes(png([0, 0, 255]))
        self.assertFalse(self.rejected('SHA-256 mismatch').exists())
        (self.kit / 'insert-a.png').write_bytes(png([200, 30, 30]))
        self.assets.mkdir(parents=True, exist_ok=True); (self.assets / 'insert-a.png').write_bytes(png([1, 2, 3]))
        self.rejected('public copy')

    def test_unsafe_names_and_links_outside_the_kit_are_rejected(self):
        outside = Path(self.temp.name) / 'outside.png'; outside.write_bytes(png([9, 9, 9]))
        for name in ['../outside.png', 'sub/insert-a.png', 'C:insert-a.png', '..png', 'insert-a.txt']:
            with self.subTest(name=name):
                self.plan = self.reviewed_plan(); self.plan['files'] = {name: media.sha256(outside)}
                for variant in self.plan['variants'].values():
                    variant['visualAssets'][0]['file'] = name
                self.assertFalse(self.rejected('unsafe file name|outside|regular file').exists())
        self.plan = self.reviewed_plan()
        (self.kit / 'insert-a.png').unlink()
        self.plan['files'] = {'insert-a.png': media.sha256(outside)}
        try:
            os.symlink(outside, self.kit / 'insert-a.png')
        except OSError:  # Windows without the symlink privilege: the same check, with the link reported by the OS stubbed
            shutil.copyfile(outside, self.kit / 'insert-a.png')
            original = Path.is_symlink
            with patch.object(Path, 'is_symlink', lambda p: p.name == 'insert-a.png' or original(p)):
                self.assertFalse(self.rejected('regular file').exists())
            return
        self.assertFalse(self.rejected('regular file|outside').exists())

    def test_plan_cannot_replace_source_settings_or_approval(self):
        for key, value in [('sourceVideo', {'localPath': 'other.mp4'}), ('approvalStatus', 'approved'),
                           ('renderSettings', {'width': 720}), ('productionStatus', 'rendered'), ('mode', 'production')]:
            with self.subTest(key=key):
                self.plan = self.reviewed_plan(); self.plan['variants']['1'][key] = value
                self.assertFalse(self.rejected('keys must be exactly').exists())
        self.plan = self.reviewed_plan(); self.plan['variants']['1']['montagePlan']['renderSettings'] = {'fps': 30}
        self.assertFalse(self.rejected('only events').exists())
        self.plan = self.reviewed_plan(); self.plan['variants']['1']['visualAssets'][0]['localPath'] = '../../x.png'
        self.assertFalse(self.rejected('asset must be').exists())
        self.plan = self.reviewed_plan(); self.plan['approval'] = {'approvedBy': 'x'}
        self.assertFalse(self.rejected('top-level keys').exists())

    def test_word_intervals_must_be_asr_intervals(self):
        self.plan['variants']['2']['wordTimings'][0]['end'] += 0.01
        self.rejected('not on ASR end')
        self.plan = self.reviewed_plan(); self.plan['variants']['1']['wordTimings'].pop()
        self.rejected('do not cover all ASR words')
        self.plan = self.reviewed_plan(); self.plan['variants']['1']['speechSegments'][0]['start'] += 0.01
        self.rejected('segments differ')
        # The last hook word merged with the first body word would hide a body correction from the comparison.
        self.plan = self.reviewed_plan(); words = self.plan['variants']['2']['wordTimings']
        hook_last = max(i for i, w in enumerate(words) if w['start'] < self.body_start(2))
        words[hook_last:hook_last + 2] = [{'text': 'слито', 'start': words[hook_last]['start'], 'end': words[hook_last + 1]['end']}]
        self.rejected('joins hook and body')

    def body_start(self, n):
        return next(v['bodyStart'] for v in self.manifest['variants'] if v['hookNumber'] == n)

    def test_hook_event_reaching_into_the_body_is_rejected(self):
        events = self.plan['variants']['1']['montagePlan']['events']
        hook = next(e for e in events if e['id'].startswith('hook-'))
        hook['end'] = self.body_start(1) + 0.04
        self.rejected('crosses the hook/body boundary')

    def test_plan_changed_after_confirmation_or_png_names_by_case_are_rejected(self):
        (self.kit / 'editorial-plan.json').write_text(json.dumps(self.plan), encoding='utf-8')
        confirmed = media.sha256(self.kit / 'editorial-plan.json')
        editorial.load(self.kit / 'editorial-plan.json', confirmed)
        self.plan['variants']['1']['hookText'] = 'Другой хук'
        (self.kit / 'editorial-plan.json').write_text(json.dumps(self.plan), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'confirmed SHA-256'):
            editorial.load(self.kit / 'editorial-plan.json', confirmed)
        with patch.object(media, 'PUBLIC', self.root), self.assertRaisesRegex(ValueError, 'confirmed SHA-256'):
            pipeline.run(self.source_set, self.speech['body'], {n: self.speech[f'h{n}'] for n in [1, 2, 3]},
                         'rr/incoming/sha-run', Path(self.temp.name) / 'sha-run', renderer=lambda *a, **k: None,
                         editorial_plan_file=self.kit / 'editorial-plan.json', editorial_directory='rr/incoming/auto',
                         editorial_sha256=confirmed)
        self.assertFalse((Path(self.temp.name) / 'sha-run').exists())
        self.plan = self.reviewed_plan(); self.plan['files']['INSERT-A.png'] = self.plan['files']['insert-a.png']
        (self.kit / 'editorial-plan.json').write_text(json.dumps(self.plan), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'only by case'):
            editorial.load(self.kit / 'editorial-plan.json')

    def test_insert_replaced_during_the_renders_fails_the_run(self):
        calls = []
        def renderer(job, *_, **__):
            calls.append(job['hookNumber'])
            if len(calls) == 1:
                (self.assets / 'insert-a.png').write_bytes(png([0, 255, 0]))
            return {'technicalPassed': True, 'outputSha256': job['sourceVideo']['sha256']}
        out = Path(self.temp.name) / 'swapped'
        with self.assertRaisesRegex(ValueError, 'public copy'):
            self.run_pipeline(renderer, out)
        self.assertEqual(calls, [1], 'no further variant is rendered with a different insert')
        self.assertFalse(json.loads((out / 'pipeline-report.json').read_text())['complete'])

    def test_merged_words_cover_consecutive_asr_words(self):
        asr = [{'text': 'с', 'start': 0.0, 'end': 0.1}, {'text': 'его', 'start': 0.1, 'end': 0.3}, {'text': 'сайта', 'start': 0.3, 'end': 0.5}]
        merged = [{'text': 'SEO', 'start': 0.0, 'end': 0.3}, {'text': 'сайта', 'start': 0.3, 'end': 0.5}]
        editorial._check_words(merged, asr, 1, boundary=2)  # body starts at «сайта»: the merge stays in the hook
        with self.assertRaisesRegex(ValueError, 'joins hook and body'):
            editorial._check_words(merged, asr, 1, boundary=1)
        with self.assertRaises(ValueError):
            editorial._check_words([{'text': 'SEO', 'start': 0.1, 'end': 0.3}, {'text': 'сайта', 'start': 0.3, 'end': 0.5}], asr, 1, 2)

    def test_shared_body_or_its_montage_must_match_in_all_variants(self):
        events = self.plan['variants']['2']['montagePlan']['events']
        next(e for e in events if e['id'] == 'body-interface-a')['animation'] = 'pop'
        self.rejected('shared body')
        self.plan = self.reviewed_plan()
        words = self.plan['variants']['3']['wordTimings']; words[-1] = {**words[-1], 'text': 'Другая основа'}
        self.rejected('shared body')

    def test_director_rejection_stops_before_the_first_render(self):
        events = self.plan['variants']['3']['montagePlan']['events']
        next(e for e in events if e['id'] == 'body-interface-a')['assetId'] = 'missing'
        for variant in self.plan['variants'].values():
            next(e for e in variant['montagePlan']['events'] if e['id'] == 'body-interface-a')['assetId'] = 'missing'
        self.rejected()

    def test_launcher_plan_mode_checks_the_plan_and_adds_it_only_when_given(self):
        base = Path(self.temp.name); public = base / 'pv' / 'public'; (public / 'rr/incoming').mkdir(parents=True)
        parts = {p: self.root / f'{p}.mp4' for p in launcher.PARTS}
        (self.kit / 'editorial-plan.json').write_text(json.dumps({**self.plan, 'topicId': 'local-test'}), encoding='utf-8')
        with patch.object(media, 'PUBLIC', public):
            plain = launcher.run(parts, 'local-test', base / 'results/run-1')
            edited = launcher.run(parts, 'local-test', base / 'results/run-1', editorial_plan=self.kit / 'editorial-plan.json')
            with self.assertRaises(ValueError):
                launcher.run(parts, 'other-topic', base / 'results/run-1', editorial_plan=self.kit / 'editorial-plan.json')
        self.assertNotIn('editorialPlan', plain); self.assertNotIn('editorial', plain['publicDirectories'])
        self.assertEqual(plain['steps'][-1]['command'], [c for c in edited['steps'][-1]['command']][:len(plain['steps'][-1]['command'])])
        command = edited['steps'][-1]['command']
        self.assertEqual(command[command.index('--editorial-public-directory') + 1], 'rr/incoming/run-1-editorial')
        self.assertEqual(command[command.index('--editorial-plan-sha256') + 1], edited['editorialPlan']['sha256'])
        with patch.object(media, 'PUBLIC', public), self.assertRaisesRegex(ValueError, 'confirmed SHA-256'):
            launcher.run(parts, 'local-test', base / 'results/run-1', editorial_plan=self.kit / 'editorial-plan.json',
                         editorial_sha256='0' * 64)
        self.assertEqual(edited['editorialPlan']['files']['insert-a.png']['sha256'], self.plan['files']['insert-a.png'])
        self.assertFalse((base / 'results').exists()); self.assertEqual(list((public / 'rr/incoming').iterdir()), [])


if __name__ == '__main__':
    unittest.main()
