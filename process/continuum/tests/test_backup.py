from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from powerfarm.kernel import Kernel
from powerfarm.ops.backup import create_backup, verify_backup


class BackupTests(unittest.TestCase):
    def test_backup_roundtrip_and_tamper(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            db = root / "institution.db"
            k = Kernel(db, identity_mode="embedded-test")
            try:
                k.init("director")
                backup = root / "backup.db"
                manifest = create_backup(k, backup)
            finally:
                k.close()
            report = verify_backup(backup, manifest["manifest_path"])
            self.assertTrue(report["ok"], report)
            with backup.open("ab") as fh:
                fh.write(b"tamper")
            report = verify_backup(backup, manifest["manifest_path"])
            self.assertFalse(report["ok"])
