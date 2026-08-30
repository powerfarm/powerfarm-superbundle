from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from powerfarm.kernel import InstitutionalError, Kernel


class KernelTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "institution.db"
        self.k = Kernel(self.db, identity_mode="embedded-test")
        self.genesis = self.k.init("director-human")

    def tearDown(self):
        self.k.close()
        self.tmp.cleanup()

    def establish_ops(self):
        office = self.k.append(
            branch="main", actor="director-human", office="director",
            kind="office.create", subject="office:operations",
            payload={"mandate": "Operate institutional capabilities"},
        )
        occupancy = self.k.append(
            branch="main", actor="director-human", office="director",
            kind="occupancy.assign", subject="office:operations",
            payload={"principal": "worker-17", "definition": "model:alpha"},
        )
        grant = self.k.append(
            branch="main", actor="director-human", office="director",
            kind="authority.grant", subject="office:operations",
            payload={"grantee_office": "operations", "action": "claim.*", "subject": "claim:*"},
        )
        return office, occupancy, grant

    def test_authority_is_required_and_proven(self):
        _, _, grant = self.establish_ops()
        act = self.k.append(
            branch="main", actor="worker-17", office="operations",
            kind="claim.assert", subject="claim:uptime",
            payload={"statement": "service reachable"},
            causes=[self.genesis.id],
        )
        self.assertEqual(act.authority_ref, grant.id)
        proof = self.k.proof(act.id)
        self.assertTrue(any(e["type"] == "authority" for e in proof["edges"]))
        self.assertTrue(any(e["type"] == "cause" for e in proof["edges"]))

    def test_wrong_principal_cannot_speak_for_office(self):
        self.establish_ops()
        with self.assertRaises(InstitutionalError):
            self.k.append(
                branch="main", actor="intruder", office="operations",
                kind="claim.assert", subject="claim:uptime", payload={"statement": "fake"},
            )

    def test_capability_must_be_admitted_before_run(self):
        with self.assertRaises(InstitutionalError):
            self.k.append(
                branch="main", actor="director-human", office="director",
                kind="run.start", subject="run:1", payload={"capability": "capability:vision"},
            )
        evidence = self.k.append(
            branch="main", actor="director-human", office="director",
            kind="evidence.record", subject="evidence:vision-bench",
            payload={"claim": "vision capability passed acceptance"},
        )
        admit = self.k.append(
            branch="main", actor="director-human", office="director",
            kind="capability.admit", subject="capability:vision",
            payload={"descriptor": {"class": "inference", "version": "sha256:abc"}},
            causes=[evidence.id],
        )
        run = self.k.append(
            branch="main", actor="director-human", office="director",
            kind="run.start", subject="run:1", payload={"capability": "capability:vision"},
            causes=[admit.id],
        )
        self.assertEqual(self.k.state()["objects"]["run:1"]["status"], "running")
        self.assertEqual(run.causes, [admit.id])

    def test_counterfactual_branch_does_not_mutate_official_timeline(self):
        commitment = self.k.append(
            branch="main", actor="director-human", office="director",
            kind="commitment.open", subject="commitment:launch",
            payload={"statement": "Launch", "owner_office": "director"},
        )
        self.k.fork("cancel-launch", at_event=commitment.id, label="counterfactual")
        cancelled = self.k.append(
            branch="cancel-launch", actor="director-human", office="director",
            kind="commitment.cancel", subject="commitment:launch",
            payload={"reason": "counterfactual"}, causes=[commitment.id],
        )
        official = self.k.state("main")["objects"]["commitment:launch"]
        alternate = self.k.state("cancel-launch")["objects"]["commitment:launch"]
        self.assertEqual(official["status"], "open")
        self.assertEqual(alternate["status"], "cancelled")
        delta = self.k.diff("main", "cancel-launch")
        self.assertIn("commitment:launch", delta["changed"]["objects"])
        self.assertEqual(cancelled.branch_id, "cancel-launch")

    def test_hash_chain_audit(self):
        self.establish_ops()
        report = self.k.audit()
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["errors"], [])

    def test_blast_radius_crosses_authority_and_causal_edges(self):
        _, _, grant = self.establish_ops()
        claim = self.k.append(
            branch="main", actor="worker-17", office="operations",
            kind="claim.assert", subject="claim:ready",
            payload={"statement": "ready"},
        )
        result = self.k.append(
            branch="main", actor="director-human", office="director",
            kind="result.record", subject="result:launch",
            payload={"summary": "launchable"}, causes=[claim.id],
        )
        impact = self.k.impact(grant.id)
        impacted = {item["event"]["id"] for item in impact["affected"]}
        self.assertIn(claim.id, impacted)
        self.assertIn(result.id, impacted)
        self.assertGreaterEqual(impact["blast_radius"], 2)


if __name__ == "__main__":
    unittest.main()
