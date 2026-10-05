import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from platform_store import run


class PlatformStoreTests(unittest.TestCase):
    def test_platforms_and_domains_persist_across_connections(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "platforms.sqlite3"
            platform = run("add_platform", database, {"name": "Example Site"})
            run("add_domain", database, {"platformId": platform["id"], "domain": " Example.COM. "})
            run("add_domain", database, {"platformId": "discord", "domain": "extra.discord.example"})
            saved = run("list", database, {})
            self.assertEqual(saved["platforms"], [platform])
            self.assertEqual(saved["domains"][platform["id"]], ["example.com"])
            self.assertEqual(saved["domains"]["discord"], ["extra.discord.example"])

    def test_rejects_duplicates_and_invalid_domains(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "platforms.sqlite3"
            run("add_platform", database, {"name": "Example Site"})
            with self.assertRaisesRegex(ValueError, "already exists"):
                run("add_platform", database, {"name": "example site"})
            with self.assertRaisesRegex(ValueError, "already exists"):
                run("add_platform", database, {"name": "Steam"})
            with self.assertRaisesRegex(ValueError, "bare domain"):
                run("add_domain", database, {"platformId": "discord", "domain": "https://example.com"})
            with self.assertRaisesRegex(ValueError, "existing platform"):
                run("add_domain", database, {"platformId": "missing", "domain": "example.com"})
            run("add_domain", database, {"platformId": "discord", "domain": "example.com"})
            with self.assertRaisesRegex(ValueError, "already on this platform"):
                run("add_domain", database, {"platformId": "discord", "domain": "EXAMPLE.COM"})

    def test_removes_only_saved_custom_domains(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "platforms.sqlite3"
            run("add_domain", database, {"platformId": "discord", "domain": "z.example.com"})
            run("add_domain", database, {"platformId": "discord", "domain": "a.example.com"})
            self.assertEqual(run("list", database, {})["domains"]["discord"], ["a.example.com", "z.example.com"])
            self.assertEqual(run("remove_domain", database, {"platformId": "discord", "domain": " Z.EXAMPLE.COM. "}),
                             {"platformId": "discord", "domain": "z.example.com"})
            self.assertEqual(run("list", database, {})["domains"]["discord"], ["a.example.com"])
            with self.assertRaisesRegex(ValueError, "Only self-added"):
                run("remove_domain", database, {"platformId": "discord", "domain": "discord.com"})


if __name__ == "__main__":
    unittest.main()
