import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("runner", Path(__file__).with_name("run-development-montage.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class AssetsTest(unittest.TestCase):
    def test_no_assets_keeps_legacy_runner_usable(self):
        runner.check_visual_assets([])

    def test_asset_must_exist_and_stay_under_public(self):
        with tempfile.TemporaryDirectory() as directory, patch("factory_media.PUBLIC", Path(directory)):
            for path in ["missing.svg", "../outside.svg", "/tmp/outside.svg"]:
                with self.assertRaises(ValueError):
                    runner.check_visual_assets([dict(type="image", localPath=path, rightsReference="own")])

    def test_image_rights_and_type_are_required(self):
        with tempfile.TemporaryDirectory() as directory, patch("factory_media.PUBLIC", Path(directory)):
            Path(directory, "demo.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
            base = dict(type="image", localPath="demo.svg", rightsReference="original demo")
            runner.check_visual_assets([base])
            for patch_fields in [dict(type="video"), dict(rightsReference=" ")]:
                with self.assertRaises(ValueError):
                    runner.check_visual_assets([{**base, **patch_fields}])


if __name__ == "__main__":
    unittest.main()
