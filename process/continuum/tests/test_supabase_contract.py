from __future__ import annotations

import unittest

from powerfarm.supabase import migration_files, migration_fingerprint


class SupabaseContractTests(unittest.TestCase):
    def test_candidate_migrations_are_present_and_read_boundary_denies_writes(self):
        files = migration_files()
        self.assertGreaterEqual(len(files), 4)
        combined = "\n".join(path.read_text(encoding="utf-8") for path in files)
        self.assertIn("create schema if not exists continuum", combined.lower())
        self.assertIn("revoke all on all tables in schema continuum from anon, authenticated", combined.lower())
        self.assertEqual(len(migration_fingerprint()), 64)
