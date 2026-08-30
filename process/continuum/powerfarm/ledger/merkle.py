from __future__ import annotations

import hashlib
from typing import Iterable

ZERO = hashlib.sha256(b"").hexdigest()


def _node(left: str, right: str) -> str:
    return hashlib.sha256(b"PFM1" + bytes.fromhex(left) + bytes.fromhex(right)).hexdigest()


def merkle_root(hashes: Iterable[str]) -> str:
    level = list(hashes)
    if not level:
        return ZERO
    for item in level:
        if len(item) != 64:
            raise ValueError("Merkle leaves must be SHA-256 hex")
        bytes.fromhex(item)
    while len(level) > 1:
        if len(level) % 2:
            level.append(level[-1])
        level = [_node(level[i], level[i + 1]) for i in range(0, len(level), 2)]
    return level[0]


def merkle_proof(hashes: list[str], index: int) -> list[dict[str, str]]:
    if not 0 <= index < len(hashes):
        raise IndexError(index)
    level = list(hashes)
    cursor = index
    proof: list[dict[str, str]] = []
    while len(level) > 1:
        if len(level) % 2:
            level.append(level[-1])
        sibling = cursor - 1 if cursor % 2 else cursor + 1
        proof.append({"side": "left" if sibling < cursor else "right", "hash": level[sibling]})
        cursor //= 2
        level = [_node(level[i], level[i + 1]) for i in range(0, len(level), 2)]
    return proof


def verify_merkle_proof(leaf: str, index: int, proof: list[dict[str, str]], root: str) -> bool:
    current = leaf
    cursor = index
    try:
        for step in proof:
            sibling = step["hash"]
            if step["side"] == "left":
                current = _node(sibling, current)
            elif step["side"] == "right":
                current = _node(current, sibling)
            else:
                return False
            cursor //= 2
        return current == root
    except (KeyError, ValueError):
        return False
