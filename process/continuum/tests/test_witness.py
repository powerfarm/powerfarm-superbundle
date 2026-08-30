from __future__ import annotations

import copy
import tempfile
import unittest
from pathlib import Path

from powerfarm.crypto import generate_private_key, make_receipt, verify_quorum, verify_receipt
from powerfarm.kernel import Kernel


class WitnessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "institution.db"
        self.k = Kernel(self.db, identity_mode="embedded-test")
        self.k.init("director")
        self.checkpoint = self.k.checkpoint()

    def tearDown(self):
        self.k.close()
        self.tmp.cleanup()

    def test_receipt_and_quorum(self):
        a = make_receipt(self.checkpoint, witness="lab-a", private_key=generate_private_key())
        b = make_receipt(self.checkpoint, witness="lab-b", private_key=generate_private_key())
        self.assertTrue(verify_receipt(a)["ok"])
        report = verify_quorum([a, b], threshold=2)
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["valid"], 2)

    def test_tamper_breaks_signature(self):
        key = generate_private_key()
        receipt = make_receipt(self.checkpoint, witness="lab-a", private_key=key).public()
        receipt["statement"]["institution_id"] = "inst_" + "0" * 32
        report = verify_receipt(receipt)
        self.assertFalse(report["ok"])
        self.assertIn("statement digest mismatch", report["errors"])

    def test_quorum_rejects_different_checkpoints(self):
        a = make_receipt(self.checkpoint, witness="lab-a", private_key=generate_private_key())
        self.k.append(branch="main", actor="director", office="director", kind="claim.assert", subject="claim:x", payload={"statement":"x"})
        b = make_receipt(self.k.checkpoint(), witness="lab-b", private_key=generate_private_key())
        report = verify_quorum([a, b], threshold=2)
        self.assertFalse(report["ok"])
        self.assertTrue(any("different statements" in e for e in report["errors"]))
