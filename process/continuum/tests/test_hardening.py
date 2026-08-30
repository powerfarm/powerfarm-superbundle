from __future__ import annotations

import os
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from powerfarm.kernel import InstitutionalError, Kernel, canonical_json, sha256_json
from powerfarm.security import seal as make_seal
from powerfarm.server import is_loopback_host


class HardeningTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "institution.db"
        self.k = Kernel(self.db, identity_mode="embedded-test")
        self.genesis = self.k.init("director-human")

    def tearDown(self):
        self.k.close()
        self.tmp.cleanup()

    def establish_ops(self, *, action: str = "claim.*", subject: str = "claim:*"):
        self.k.append(
            branch="main", actor="director-human", office="director",
            kind="office.create", subject="office:operations",
            payload={"mandate": "Operate"},
        )
        self.k.append(
            branch="main", actor="director-human", office="director",
            kind="occupancy.assign", subject="office:operations",
            payload={"principal": "worker-17"},
        )
        return self.k.append(
            branch="main", actor="director-human", office="director",
            kind="authority.grant", subject="office:operations",
            payload={"grantee_office": "operations", "action": action, "subject": subject},
        )

    def test_seal_key_is_external_and_private(self):
        key_path = Path(f"{self.db}.sealkey")
        self.assertTrue(key_path.exists())
        self.assertEqual(key_path.stat().st_size, 32)
        if os.name == "posix":
            self.assertEqual(key_path.stat().st_mode & 0o077, 0)
        raw_db = self.db.read_bytes()
        self.assertNotIn(key_path.read_bytes(), raw_db)

    def test_db_rewrite_and_hash_recalculation_still_fails_hmac(self):
        event = self.k.append(
            branch="main", actor="director-human", office="director",
            kind="claim.assert", subject="claim:tamper",
            payload={"statement": "original"},
        )
        row = self.k.db.execute("SELECT * FROM events WHERE id=?", (event.id,)).fetchone()
        assert row is not None
        payload = {"statement": "forged"}
        body = {
            "branch_index": int(row["branch_index"]),
            "id": str(row["id"]),
            "branch_id": str(row["branch_id"]),
            "request_id": row["request_id"],
            "recorded_at": str(row["recorded_at"]),
            "effective_at": str(row["effective_at"]),
            "actor": str(row["actor"]),
            "office": str(row["office"]),
            "kind": str(row["kind"]),
            "subject": str(row["subject"]),
            "payload": payload,
            "causes": [],
            "authority_ref": str(row["authority_ref"]),
            "intent_hash": str(row["intent_hash"]),
            "prev_hash": str(row["prev_hash"]),
        }
        forged_hash = sha256_json(body)
        self.k.db.execute(
            "UPDATE events SET payload=?, hash=? WHERE id=?",
            (canonical_json(payload), forged_hash, event.id),
        )
        report = self.k.audit()
        self.assertFalse(report["ok"])
        self.assertTrue(any("HMAC seal mismatch" in error for error in report["errors"]), report)

    def test_branch_metadata_tamper_is_detected(self):
        self.k.fork("alt", label="original")
        self.k.db.execute("UPDATE branches SET label='forged' WHERE id='alt'")
        report = self.k.audit()
        self.assertFalse(report["ok"])
        self.assertTrue(any("branch seal mismatch" in error for error in report["errors"]), report)

    def test_idempotent_retry_returns_same_event_and_conflict_is_rejected(self):
        first = self.k.append(
            branch="main", actor="director-human", office="director",
            kind="claim.assert", subject="claim:idempotent",
            payload={"statement": "same"}, request_id="request-001",
        )
        second = self.k.append(
            branch="main", actor="director-human", office="director",
            kind="claim.assert", subject="claim:idempotent",
            payload={"statement": "same"}, request_id="request-001",
        )
        self.assertEqual(first.id, second.id)
        with self.assertRaises(InstitutionalError):
            self.k.append(
                branch="main", actor="director-human", office="director",
                kind="claim.assert", subject="claim:idempotent",
                payload={"statement": "different"}, request_id="request-001",
            )

    def test_compare_and_set_head_rejects_stale_writer(self):
        head = self.k.head()["head"]
        self.k.append(
            branch="main", actor="director-human", office="director",
            kind="claim.assert", subject="claim:first", payload={"statement": "first"},
        )
        with self.assertRaisesRegex(InstitutionalError, "stale head"):
            self.k.append(
                branch="main", actor="director-human", office="director",
                kind="claim.assert", subject="claim:stale", payload={"statement": "stale"},
                expected_head=head,
            )

    def test_future_grant_cannot_authorize_present_act(self):
        self.k.append(
            branch="main", actor="director-human", office="director",
            kind="office.create", subject="office:future",
            payload={"mandate": "Future office"},
        )
        self.k.append(
            branch="main", actor="director-human", office="director",
            kind="occupancy.assign", subject="office:future",
            payload={"principal": "future-worker"},
        )
        future = "2099-01-01T00:00:00Z"
        self.k.append(
            branch="main", actor="director-human", office="director",
            kind="authority.grant", subject="office:future",
            payload={"grantee_office": "future", "action": "claim.*", "subject": "claim:*"},
            effective_at=future,
        )
        with self.assertRaisesRegex(InstitutionalError, "lacks authority"):
            self.k.append(
                branch="main", actor="future-worker", office="future",
                kind="claim.assert", subject="claim:not-yet",
                payload={"statement": "too early"},
            )

    def test_non_root_cannot_escalate_delegation_even_if_granted_grant_action(self):
        self.k.append(
            branch="main", actor="director-human", office="director",
            kind="office.create", subject="office:operations",
            payload={"mandate": "Operate"},
        )
        self.k.append(
            branch="main", actor="director-human", office="director",
            kind="office.create", subject="office:child",
            payload={"mandate": "Child"},
        )
        self.k.append(
            branch="main", actor="director-human", office="director",
            kind="occupancy.assign", subject="office:operations",
            payload={"principal": "worker-17"},
        )
        self.k.append(
            branch="main", actor="director-human", office="director",
            kind="authority.grant", subject="office:operations",
            payload={"grantee_office": "operations", "action": "authority.grant", "subject": "office:*"},
        )
        with self.assertRaisesRegex(InstitutionalError, "only the root office"):
            self.k.append(
                branch="main", actor="worker-17", office="operations",
                kind="authority.grant", subject="office:child",
                payload={"grantee_office": "child", "action": "*", "subject": "*"},
            )

    def test_cause_cannot_be_effective_after_consequence(self):
        evidence = self.k.append(
            branch="main", actor="director-human", office="director",
            kind="evidence.record", subject="evidence:future",
            payload={"claim": "future"}, effective_at="2099-01-01T00:00:00Z",
        )
        with self.assertRaisesRegex(InstitutionalError, "causes cannot become effective"):
            self.k.append(
                branch="main", actor="director-human", office="director",
                kind="result.record", subject="result:now",
                payload={"summary": "impossible"}, causes=[evidence.id],
            )

    def test_transaction_time_cutoff_makes_bitemporal_query_real(self):
        claim = self.k.append(
            branch="main", actor="director-human", office="director",
            kind="claim.assert", subject="claim:retro",
            payload={"statement": "recorded later"}, effective_at=self.genesis.effective_at,
        )
        known_before = self.k.state("main", effective_at=claim.recorded_at, known_at=self.genesis.recorded_at)
        known_after = self.k.state("main", effective_at=claim.recorded_at, known_at=claim.recorded_at)
        self.assertNotIn("claim:retro", known_before["objects"])
        self.assertIn("claim:retro", known_after["objects"])

    def test_payload_rejects_floats_and_hostile_branch_names(self):
        with self.assertRaises(ValueError):
            self.k.append(
                branch="main", actor="director-human", office="director",
                kind="claim.assert", subject="claim:float", payload={"x": 0.1},
            )
        with self.assertRaises(ValueError):
            self.k.fork('bad\"><script>alert(1)</script>')

    def test_root_office_cannot_be_retired_or_vacated(self):
        with self.assertRaisesRegex(InstitutionalError, "root office"):
            self.k.append(
                branch="main", actor="director-human", office="director",
                kind="office.retire", subject="office:director", payload={},
            )
        with self.assertRaisesRegex(InstitutionalError, "root office"):
            self.k.append(
                branch="main", actor="director-human", office="director",
                kind="occupancy.vacate", subject="office:director", payload={},
            )

    def test_read_only_kernel_cannot_mutate(self):
        ro = Kernel(self.db, read_only=True)
        try:
            self.assertEqual(ro.audit()["ok"], True)
            with self.assertRaisesRegex(InstitutionalError, "read-only"):
                ro.append(
                    branch="main", actor="director-human", office="director",
                    kind="claim.assert", subject="claim:nope", payload={"statement": "nope"},
                )
        finally:
            ro.close()

    def test_concurrent_writers_serialize_without_forking_one_branch(self):
        self.establish_ops()

        def write(i: int) -> str:
            k = Kernel(self.db, identity_mode="embedded-test")
            try:
                event = k.append(
                    branch="main", actor="worker-17", office="operations",
                    kind="claim.assert", subject=f"claim:concurrent-{i}",
                    payload={"statement": f"claim-{i}"}, request_id=f"concurrent-{i}",
                )
                return event.id
            finally:
                k.close()

        with ThreadPoolExecutor(max_workers=8) as pool:
            ids = list(pool.map(write, range(24)))
        self.assertEqual(len(ids), len(set(ids)))
        report = self.k.audit()
        self.assertTrue(report["ok"], report)
        events = self.k.events()
        local_indices = [e.branch_index for e in events]
        self.assertEqual(local_indices, list(range(1, len(events) + 1)))

    def test_audit_reads_one_consistent_snapshot_during_concurrent_writes(self):
        self.establish_ops()
        reader = Kernel(self.db, read_only=True)

        def writer():
            k = Kernel(self.db, identity_mode="embedded-test")
            try:
                for i in range(30):
                    k.append(
                        branch="main", actor="worker-17", office="operations",
                        kind="claim.assert", subject=f"claim:snapshot-{i}",
                        payload={"statement": str(i)}, request_id=f"snapshot-{i}",
                    )
                    time.sleep(0.001)
            finally:
                k.close()

        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(writer)
                while not future.done():
                    report = reader.audit()
                    self.assertTrue(report["ok"], report)
                future.result()
            self.assertTrue(reader.audit()["ok"])
        finally:
            reader.close()

    def test_external_checkpoint_detects_valid_database_rollback(self):
        anchored = self.k.append(
            branch="main", actor="director-human", office="director",
            kind="claim.assert", subject="claim:anchor", payload={"statement": "anchored"},
        )
        checkpoint = self.k.checkpoint()
        self.k.append(
            branch="main", actor="director-human", office="director",
            kind="claim.assert", subject="claim:after", payload={"statement": "after"},
        )
        self.assertTrue(self.k.verify_checkpoint(checkpoint)["ok"])

        # Simulate a rollback to a previously valid prefix. The ordinary chain
        # remains internally valid, so only the external checkpoint can detect it.
        self.k.db.execute("DELETE FROM events WHERE branch_id='main' AND branch_index>=?", (anchored.branch_index,))
        self.assertTrue(self.k.audit()["ok"])
        verified = self.k.verify_checkpoint(checkpoint)
        self.assertFalse(verified["ok"])
        self.assertTrue(any("anchored head" in error for error in verified["errors"]), verified)

    def test_checkpoint_allows_legitimate_forward_progress(self):
        checkpoint = self.k.checkpoint()
        for i in range(3):
            self.k.append(
                branch="main", actor="director-human", office="director",
                kind="claim.assert", subject=f"claim:forward-{i}", payload={"statement": str(i)},
            )
        self.assertTrue(self.k.audit()["ok"])
        self.assertTrue(self.k.verify_checkpoint(checkpoint)["ok"])

    def test_observatory_refuses_public_bind_by_default(self):
        self.assertTrue(is_loopback_host("127.0.0.1"))
        self.assertTrue(is_loopback_host("::1"))
        self.assertFalse(is_loopback_host("0.0.0.0"))

    def test_semantic_replay_detects_forgery_even_with_resealed_row(self):
        self.establish_ops()
        event = self.k.append(
            branch="main", actor="worker-17", office="operations",
            kind="claim.assert", subject="claim:legit", payload={"statement": "legit"},
        )
        row = self.k.db.execute("SELECT * FROM events WHERE id=?", (event.id,)).fetchone()
        assert row is not None
        body = {
            "branch_index": int(row["branch_index"]),
            "id": str(row["id"]),
            "branch_id": str(row["branch_id"]),
            "request_id": row["request_id"],
            "recorded_at": str(row["recorded_at"]),
            "effective_at": str(row["effective_at"]),
            "actor": "intruder",
            "office": str(row["office"]),
            "kind": str(row["kind"]),
            "subject": str(row["subject"]),
            "payload": {"statement": "legit"},
            "causes": [],
            "authority_ref": str(row["authority_ref"]),
            "intent_hash": sha256_json({
                "actor": "intruder", "office": str(row["office"]), "kind": str(row["kind"]),
                "subject": str(row["subject"]), "payload": {"statement": "legit"}, "causes": [],
                "effective_at": str(row["effective_at"]),
            }),
            "prev_hash": str(row["prev_hash"]),
        }
        digest = sha256_json(body)
        institution_id = self.k._metadata_locked("institution_id")
        assert institution_id is not None and self.k._key is not None
        event_seal = make_seal(self.k._key, institution_id, f"event:{event.id}", digest)
        self.k.db.execute(
            "UPDATE events SET actor=?, intent_hash=?, hash=?, seal=? WHERE id=?",
            ("intruder", body["intent_hash"], digest, event_seal, event.id),
        )
        report = self.k.audit()
        self.assertFalse(report["ok"])
        self.assertTrue(any("did not occupy office" in error for error in report["errors"]), report)


if __name__ == "__main__":
    unittest.main()
