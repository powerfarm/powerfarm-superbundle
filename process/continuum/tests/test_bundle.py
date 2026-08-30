from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from powerfarm.bundle import export_bundle, verify_bundle
from powerfarm.crypto import generate_private_key, key_fingerprint, make_event_signature, public_jwk
from powerfarm.kernel import Kernel


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "institution.db"
        self.k = Kernel(self.db, identity_mode="embedded-test")
        genesis = self.k.init("director")
        self.k.append(branch="main", actor="director", office="director", kind="claim.assert", subject="claim:one", payload={"statement":"one"}, causes=[genesis.id])

    def tearDown(self):
        self.k.close()
        self.tmp.cleanup()

    def test_export_is_offline_verifiable(self):
        bundle = export_bundle(self.k)
        report = verify_bundle(bundle)
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["events"], 2)
        self.assertIn("main", bundle["merkle_roots"])


    def test_bundle_verifies_historical_event_signature_binding(self):
        key = generate_private_key()
        key_id = key_fingerprint(key.public_key())
        self.k.append(
            branch="main", actor="director", office="director",
            kind="identity.key.register", subject=f"key:{key_id}",
            payload={"principal": "director", "office": "director", "jwk": public_jwk(key.public_key())},
        )
        event = self.k.append(
            branch="main", actor="director", office="director", kind="claim.assert",
            subject="claim:signed-bundle", payload={"statement":"signed"},
        )
        self.k.attach_signature(
            make_event_signature(event, institution_id=self.k._institution_id_locked(), private_key=key).public()
        )
        bundle = export_bundle(self.k)
        self.assertEqual(len(bundle["signatures"]), 1)
        report = verify_bundle(bundle)
        self.assertTrue(report["ok"], report)

    def test_tampered_event_fails(self):
        bundle = export_bundle(self.k)
        bundle["events"][1]["payload"]["statement"] = "forged"
        report = verify_bundle(bundle)
        self.assertFalse(report["ok"])
        self.assertTrue(any("event hash mismatch" in e or "bundle digest mismatch" in e for e in report["errors"]))
