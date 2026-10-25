"""Offline tests of the local kit window logic: no Telegram, ASR, render or network."""
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import local_kit as kit  # noqa: E402

NOW = datetime(2026, 10, 25, 12, 0, 0)


def digest(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


class LocalKitTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        base = Path(self.temp.name)
        self.inbox = base / 'inbox'
        self.inbox.mkdir()
        self.src = base / 'sources'
        self.src.mkdir()
        self.sources = {}
        for i, role in enumerate(kit.ROLES):
            file = self.src / f'Исходник {role}.MP4'
            file.write_bytes(bytes([i]) * (1000 + i))
            self.sources[role] = str(file)
        self.before = {r: (digest(f), os.stat(f).st_mtime_ns) for r, f in self.sources.items()}

    def tearDown(self):
        self.temp.cleanup()

    def assert_sources_untouched(self):
        self.assertEqual({r: (digest(f), os.stat(f).st_mtime_ns) for r, f in self.sources.items()}, self.before)

    def assert_nothing_created(self, *keep):
        self.assertEqual(sorted(p.name for p in self.inbox.iterdir()), sorted(keep))
        self.assert_sources_untouched()

    def test_kit_is_prepared_with_hashes_and_explicit_roles(self):
        result = kit.prepare('roman-seo-02', self.sources, self.inbox, NOW)
        folder = self.inbox / 'roman-seo-02-20261025-120000'
        self.assertEqual(result['path'], str(folder.resolve()))
        self.assertEqual(sorted(p.name for p in self.inbox.iterdir()), [folder.name], 'no temporary folder left')
        manifest = json.loads((folder / 'kit.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest, {'topicId': 'roman-seo-02', 'parts': {'body': 'body.mp4', 'h1': 'hook-1.mp4',
                                                                          'h2': 'hook-2.mp4', 'h3': 'hook-3.mp4'}})
        for role, name in manifest['parts'].items():
            self.assertEqual(digest(folder / name), self.before[role][0])
            self.assertEqual(result['parts'][role]['sha256'], self.before[role][0])
        self.assertEqual(sorted(p.name for p in folder.iterdir()), ['body.mp4', 'hook-1.mp4', 'hook-2.mp4', 'hook-3.mp4', 'kit.json'])
        self.assert_sources_untouched()
        self.assertEqual(kit.DONE, 'Комплект подготовлен. Открой /intake_local в боте.')

    def test_empty_fields_or_cancelled_choices_create_nothing(self):
        self.assertEqual(kit.check_form('', {}), ['Укажи тему комплекта', 'Не выбран файл: Основа', 'Не выбран файл: Хук 1',
                                                  'Не выбран файл: Хук 2', 'Не выбран файл: Хук 3'])
        for topic, sources in [('', self.sources), ('roman-seo-02', {**self.sources, 'h2': ''}),
                               ('roman-seo-02', {k: v for k, v in self.sources.items() if k != 'body'})]:
            with self.assertRaises(ValueError):
                kit.prepare(topic, sources, self.inbox, NOW)
        self.assert_nothing_created()

    def test_invalid_inputs_create_nothing(self):
        (self.src / 'clip.mov').write_bytes(b'x')
        (self.src / 'empty.mp4').write_bytes(b'')
        cases = [
            ('Roman SEO', self.sources, 'Тема'),
            ('roman-seo-02', {**self.sources, 'h1': str(self.src / 'clip.mov')}, 'MP4'),
            ('roman-seo-02', {**self.sources, 'h1': str(self.src / 'missing.mp4')}, 'не найден'),
            ('roman-seo-02', {**self.sources, 'h1': 'relative.mp4'}, 'полный путь'),
            ('roman-seo-02', {**self.sources, 'h1': str(self.src / 'empty.mp4')}, 'размер'),
            ('roman-seo-02', {**self.sources, 'h3': self.sources['h2']}, 'Один и тот же файл'),
            ('roman-seo-02', {**self.sources, 'h1': str(self.src)}, 'не найден'),
        ]
        for topic, sources, message in cases:
            with self.subTest(message), self.assertRaisesRegex(ValueError, message):
                kit.prepare(topic, sources, self.inbox, NOW)
        self.assert_nothing_created()
        with self.assertRaisesRegex(ValueError, 'не найдена'):
            kit.prepare('roman-seo-02', self.sources, self.inbox / 'missing', NOW)
        with self.assertRaisesRegex(ValueError, 'вне Git'):
            kit.prepare('roman-seo-02', self.sources, Path(__file__).parent, NOW)
        self.assert_nothing_created()

    def test_error_removes_only_this_operations_temporary_folder(self):
        other = self.inbox / '.preparing-other-operation'
        other.mkdir()
        (other / 'keep.mp4').write_bytes(b'other')
        done = self.inbox / 'older-kit'
        done.mkdir()
        original = kit._copy
        calls = []

        def failing(source, target):
            calls.append(target)
            if len(calls) == 3:
                raise OSError('disk full')
            return original(source, target)

        with patch.object(kit, '_copy', failing), self.assertRaisesRegex(OSError, 'disk full'):
            kit.prepare('roman-seo-02', self.sources, self.inbox, NOW)
        self.assertFalse(calls[0].parent.exists(), 'temporary folder of this operation removed')
        self.assertEqual((other / 'keep.mp4').read_bytes(), b'other')
        self.assert_nothing_created('.preparing-other-operation', 'older-kit')

    def test_source_changed_during_copy_is_refused(self):
        source = Path(self.sources['h1'])
        real_stat, real_copy = Path.stat, kit._copy
        inside = []

        def copy(src, target):
            inside.append(src)
            try:
                return real_copy(src, target)
            finally:
                inside.clear()

        def stat(self, *args, **kwargs):
            if inside and self == source:
                inside.append('stat')
                if len(inside) == 3:  # second stat inside the copy of h1: the file was changed meanwhile
                    source.write_bytes(source.read_bytes() + b'changed')
            return real_stat(self, *args, **kwargs)

        with patch.object(kit, '_copy', copy), patch.object(Path, 'stat', stat), self.assertRaisesRegex(ValueError, 'SHA-256'):
            kit.prepare('roman-seo-02', self.sources, self.inbox, NOW)
        self.assertEqual(list(self.inbox.iterdir()), [])

    def test_source_emptied_before_its_copy_is_refused(self):
        real_copy = kit._copy

        def copy(source, target):
            if source == Path(self.sources['h2']):
                source.write_bytes(b'')  # changed while earlier roles were copied
            return real_copy(source, target)

        with patch.object(kit, '_copy', copy), self.assertRaisesRegex(ValueError, 'размер'):
            kit.prepare('roman-seo-02', self.sources, self.inbox, NOW)
        self.assertEqual(list(self.inbox.iterdir()), [])

    def test_longest_topic_with_time_and_suffix_fits_the_intake_folder_limit(self):
        topic = ('roman-seo-long-' * 5)[:64]
        self.assertRegex(topic, kit.TOPIC)
        names = []
        for _ in range(3):  # second and third kits of the same second get -2 and -3
            result = kit.prepare(topic, self.sources, self.inbox, NOW)
            names.append(result['kit'])
            self.assertLessEqual(len(result['kit']), 64)
            self.assertRegex(result['kit'], kit.KIT)
            manifest = json.loads((Path(result['path']) / 'kit.json').read_text(encoding='utf-8'))
            self.assertEqual(manifest['topicId'], topic, 'only the folder name is shortened, not the topic')
        self.assertEqual([n[-3:] for n in names[1:]], ['0-2', '0-3'])
        self.assertLessEqual(len(f"{topic[:44]}-20261025-120000-99"), 64, 'the largest suffix still fits')

    def test_existing_folder_is_never_overwritten(self):
        taken = self.inbox / 'roman-seo-02-20261025-120000'
        taken.mkdir()
        (taken / 'kit.json').write_text('{}')
        result = kit.prepare('roman-seo-02', self.sources, self.inbox, NOW)
        self.assertEqual(result['kit'], 'roman-seo-02-20261025-120000-2')
        self.assertEqual((taken / 'kit.json').read_text(), '{}')
        long = kit.prepare('a' * 64, self.sources, self.inbox, NOW)
        self.assertRegex(long['kit'], kit.KIT)

    def test_kit_folder_appears_only_after_the_last_step(self):
        listed = []
        real_rename = os.rename

        def rename(a, b):
            listed.append(sorted(p.name for p in self.inbox.iterdir() if kit.KIT.fullmatch(p.name)))
            self.assertFalse(kit.KIT.fullmatch(Path(a).name), 'temporary name is never listed by the bot')
            self.assertTrue((Path(a) / 'kit.json').is_file())
            return real_rename(a, b)

        with patch.object(kit.os, 'rename', rename):
            kit.prepare('roman-seo-02', self.sources, self.inbox, NOW)
        self.assertEqual(listed, [[]])


class WindowTest(unittest.TestCase):
    def setUp(self):
        try:
            import tkinter
        except ImportError as error:
            self.skipTest(f'tkinter unavailable: {error}')
        try:
            self.root = tkinter.Tk()
        except tkinter.TclError as error:  # no display (CI)
            self.skipTest(f'no display for tkinter: {error}')
        self.root.withdraw()
        spec = importlib.util.spec_from_file_location('kit_window', Path(__file__).with_name('local-kit-window.py'))
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.window = self.module.KitWindow(self.root)

    def tearDown(self):
        self.root.destroy()

    def test_cancelled_choice_and_empty_fields_do_nothing(self):
        self.window.paths['body'].set('C:/kept.mp4')
        with patch.object(self.module.filedialog, 'askopenfilename', return_value=''):
            self.window.choose('body')
        self.assertEqual(self.window.paths['body'].get(), 'C:/kept.mp4')
        with patch.object(self.module.messagebox, 'showwarning') as warning, \
                patch.object(self.module.local_kit, 'prepare') as prepare:
            self.window.submit()
        prepare.assert_not_called()
        self.assertIn('Укажи тему комплекта', warning.call_args.args[1])

    def test_window_cannot_be_closed_while_preparing(self):
        self.window.busy = True
        with patch.object(self.module.messagebox, 'showinfo') as info, patch.object(self.root, 'destroy') as destroy:
            self.window.close()
        info.assert_called_once()
        destroy.assert_not_called()


if __name__ == '__main__':
    unittest.main()
