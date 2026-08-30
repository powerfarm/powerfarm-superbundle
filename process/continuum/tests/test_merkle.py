from __future__ import annotations

import hashlib
import unittest

from powerfarm.ledger import merkle_proof, merkle_root, verify_merkle_proof


class MerkleTests(unittest.TestCase):
    def test_proofs_for_odd_tree(self):
        leaves = [hashlib.sha256(f"event-{i}".encode()).hexdigest() for i in range(7)]
        root = merkle_root(leaves)
        for index, leaf in enumerate(leaves):
            proof = merkle_proof(leaves, index)
            self.assertTrue(verify_merkle_proof(leaf, index, proof, root))
            self.assertFalse(verify_merkle_proof("0" * 64, index, proof, root))
