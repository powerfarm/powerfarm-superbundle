from __future__ import annotations

from decimal import Decimal

from continuum_adk.evidence import AllowlistedEvidence, DigestOnlyEvidence, digest_summary, stable_bytes


def test_float_is_digestible_without_json_float_in_ledger_summary():
    summary = digest_summary({"temperature": 0.7, "ratio": float("inf")})
    assert len(summary["sha256"]) == 64
    assert b'"$float":"0.7"' in stable_bytes({"temperature": 0.7})


def test_digest_policy_does_not_persist_secret_values():
    policy = DigestOnlyEvidence()
    evidence = policy.arguments("login", {"password": "correct horse battery staple", "token": "sk-secret"})
    text = repr(evidence)
    assert "correct horse" not in text
    assert "sk-secret" not in text


def test_unknown_object_repr_is_hashed_not_disclosed():
    class Secret:
        def __repr__(self): return "Secret(token=super-secret)"
    raw = stable_bytes(Secret())
    assert b"super-secret" not in raw
    assert b"$repr_sha256" in raw


def test_allowlist_discloses_only_named_fields_and_tags_float():
    policy = AllowlistedEvidence(argument_fields={"search": frozenset({"query", "temperature"})}, result_fields={})
    evidence = policy.arguments("search", {"query": "edge", "password": "secret", "temperature": Decimal("0.7")})
    assert evidence["disclosed"]["query"] == "edge"
    assert evidence["disclosed"]["temperature"] == {"$decimal": "0.7"}
    assert "password" not in evidence["disclosed"]


def test_large_integer_is_tagged_before_allowlisted_ledger_payload():
    policy = AllowlistedEvidence(argument_fields={"calc": frozenset({"n"})}, result_fields={})
    evidence = policy.arguments("calc", {"n": 2**80})
    assert evidence["disclosed"]["n"] == {"$int": str(2**80)}


def test_mapping_key_stringification_collision_is_preserved_in_digest_input():
    raw = stable_bytes({1: "integer-key", "1": "string-key"})
    assert b'"$map"' in raw
    assert b"integer-key" in raw and b"string-key" in raw
