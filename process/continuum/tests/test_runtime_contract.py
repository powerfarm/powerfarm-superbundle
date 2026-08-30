from __future__ import annotations

import unittest

from powerfarm.runtime.envelope import validate_execution_envelope
from powerfarm.runtime.receipt import RuntimeReceipt, receipt_to_act
from powerfarm.runtime.supabase_bridge import run_row_to_receipt


class RuntimeContractTests(unittest.TestCase):
    def test_envelope_validation(self):
        value = {
            "envelope_version": "powerfarm.execution/v0.1",
            "principal_ref": "p", "workspace_ref": "w", "capability_ref": "crm.lookup",
            "gadget_ref": "crm", "gadget_revision": 4,
            "gadget_revision_hash": "a" * 64, "gadget_definition_hash": "b" * 64,
            "operation": "lookup", "run_grant_ref": "g", "authority_version": 1,
            "input": {"id": "42"},
        }
        envelope = validate_execution_envelope(value)
        self.assertEqual(envelope.revision_ref, "crm@4")

    def test_supabase_run_is_only_a_receipt(self):
        row = {
            "id": "r1", "status": "completed", "capability_ref": "crm.lookup",
            "gadget_id": "crm", "gadget_version": "1.2.0", "run_grant_id": "g1",
            "started_at": "2026-01-01T00:00:00Z", "ended_at": "2026-01-01T00:00:01Z",
            "result": {"name": "Ada"}, "error": None, "workspace_id": "w",
            "engine": "adk", "engine_ref": "s", "definition_hash": "c" * 64,
            "authority_version": 1,
        }
        receipt = run_row_to_receipt(row)
        act = receipt_to_act(receipt)
        self.assertEqual(act["kind"], "run.finish")
        self.assertEqual(act["payload"]["receipt_digest"], receipt.digest())
