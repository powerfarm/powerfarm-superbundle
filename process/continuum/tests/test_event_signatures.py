from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from powerfarm.crypto import generate_private_key, key_fingerprint, make_event_signature, public_jwk
from powerfarm.kernel import InstitutionalError, Kernel


class EventSignatureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "institution.db"
        self.k = Kernel(self.db, identity_mode="embedded-test")
        self.k.init("director")
        self.key = generate_private_key()
        self.key_id = key_fingerprint(self.key.public_key())
        self.k.append(
            branch="main", actor="director", office="director",
            kind="identity.key.register", subject=f"key:{self.key_id}",
            payload={"principal": "director", "office": "director", "jwk": public_jwk(self.key.public_key())},
        )

    def tearDown(self):
        self.k.close()
        self.tmp.cleanup()

    def test_registered_key_can_sign_event_and_audit_verifies_it(self):
        event = self.k.append(
            branch="main", actor="director", office="director",
            kind="claim.assert", subject="claim:signed", payload={"statement": "signed"},
        )
        signature = make_event_signature(event, institution_id=self.k._institution_id_locked(), private_key=self.key).public()
        attached = self.k.attach_signature(signature)
        self.assertEqual(attached["key_id"], self.key_id)
        report = self.k.audit()
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["signatures"], 1)

    def test_unregistered_key_is_rejected(self):
        event = self.k.append(
            branch="main", actor="director", office="director",
            kind="claim.assert", subject="claim:nope", payload={"statement": "nope"},
        )
        other = generate_private_key()
        signature = make_event_signature(event, institution_id=self.k._institution_id_locked(), private_key=other).public()
        with self.assertRaises(InstitutionalError):
            self.k.attach_signature(signature)


    def test_repeated_signing_with_same_registered_key_is_idempotent(self):
        event = self.k.append(
            branch="main", actor="director", office="director",
            kind="claim.assert", subject="claim:retry-sign", payload={"statement": "signed"},
        )
        first = make_event_signature(event, institution_id=self.k._institution_id_locked(), private_key=self.key).public()
        one = self.k.attach_signature(first)
        second = make_event_signature(
            event, institution_id=self.k._institution_id_locked(), private_key=self.key, signed_at=first["signed_at"]
        ).public()
        two = self.k.attach_signature(second)
        self.assertEqual(one["event_id"], two["event_id"])
        self.assertEqual(one["key_id"], two["key_id"])
        self.assertEqual(len(self.k.signature_rows(event.id)), 1)

    def test_revoked_key_cannot_sign_future_event(self):
        self.k.append(
            branch="main", actor="director", office="director",
            kind="identity.key.revoke", subject=f"key:{self.key_id}", payload={"key_id": self.key_id},
        )
        event = self.k.append(
            branch="main", actor="director", office="director",
            kind="claim.assert", subject="claim:after-revoke", payload={"statement": "after"},
        )
        signature = make_event_signature(event, institution_id=self.k._institution_id_locked(), private_key=self.key).public()
        with self.assertRaises(InstitutionalError):
            self.k.attach_signature(signature)
