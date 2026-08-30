from __future__ import annotations

import unittest

from powerfarm.authority import AuthorityScope, Delegation, validate_delegation


class DelegationTests(unittest.TestCase):
    def test_contained_delegation(self):
        parent = Delegation("g1", "director", "ops", AuthorityScope("deploy.*", "service:*"), "2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z")
        child = Delegation("g2", "ops", "release", AuthorityScope("deploy.prod", "service:api"), "2026-02-01T00:00:00Z", "2026-12-01T00:00:00Z", "g1")
        self.assertEqual(validate_delegation(parent, child), [])

    def test_scope_escalation_is_rejected(self):
        parent = Delegation("g1", "director", "ops", AuthorityScope("deploy.*", "service:api"), "2026-01-01T00:00:00Z")
        child = Delegation("g2", "ops", "release", AuthorityScope("*", "*"), "2026-02-01T00:00:00Z", parent_grant_ref="g1")
        errors = validate_delegation(parent, child)
        self.assertTrue(any("scope exceeds" in e for e in errors))
