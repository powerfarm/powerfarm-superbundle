from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from powerfarm.db import APP_ID, LEGACY_APP_ID_V2, SCHEMA_VERSION
from powerfarm.kernel import Kernel


class UpgradeV2Tests(unittest.TestCase):
    def test_v2_database_upgrades_in_place_to_v3(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "institution.db"
            k = Kernel(path, identity_mode="embedded-test")
            try:
                k.init("director")
                before = k.head("main")
            finally:
                k.close()

            raw = sqlite3.connect(path)
            try:
                raw.execute("DROP TABLE event_signatures")
                raw.execute("UPDATE metadata SET value='powerfarm-continuum/v2' WHERE key='format'")
                raw.execute("PRAGMA user_version = 2")
                raw.execute(f"PRAGMA application_id = {LEGACY_APP_ID_V2}")
                raw.commit()
            finally:
                raw.close()

            upgraded = Kernel(path, identity_mode="embedded-test")
            try:
                self.assertEqual(upgraded.db.execute("PRAGMA user_version").fetchone()[0], SCHEMA_VERSION)
                self.assertEqual(upgraded.db.execute("PRAGMA application_id").fetchone()[0], APP_ID)
                self.assertEqual(upgraded.head("main")["head"], before["head"])
                self.assertTrue(upgraded.audit()["ok"])
                table = upgraded.db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='event_signatures'").fetchone()
                self.assertIsNotNone(table)
            finally:
                upgraded.close()
