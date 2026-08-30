from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from cryptography.hazmat.primitives.asymmetric import ec

from powerfarm.core.canonical import sha256_json
from powerfarm.core.time import utcnow
from powerfarm.core.errors import VerificationError

from .p256 import key_fingerprint, public_jwk, public_key_from_jwk, sign_digest, verify_digest

RECEIPT_FORMAT = "powerfarm.witness/v1"


@dataclass(frozen=True)
class WitnessReceipt:
    format: str
    witness: str
    key_id: str
    jwk: dict[str, Any]
    statement: dict[str, Any]
    statement_digest: str
    signature: str
    signed_at: str

    def public(self) -> dict[str, Any]:
        return {
            "format": self.format,
            "witness": self.witness,
            "key_id": self.key_id,
            "jwk": self.jwk,
            "statement": self.statement,
            "statement_digest": self.statement_digest,
            "signature": self.signature,
            "signed_at": self.signed_at,
        }

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "WitnessReceipt":
        return cls(
            format=str(value["format"]),
            witness=str(value["witness"]),
            key_id=str(value["key_id"]),
            jwk=dict(value["jwk"]),
            statement=dict(value["statement"]),
            statement_digest=str(value["statement_digest"]),
            signature=str(value["signature"]),
            signed_at=str(value["signed_at"]),
        )


def checkpoint_statement(checkpoint: dict[str, Any]) -> dict[str, Any]:
    if checkpoint.get("format") != "powerfarm-checkpoint/v1":
        raise VerificationError("unsupported checkpoint format")
    branches = checkpoint.get("branches")
    if not isinstance(branches, list):
        raise VerificationError("checkpoint branches missing")
    return {
        "institution_id": checkpoint.get("institution_id"),
        "checkpoint_digest": checkpoint.get("digest"),
        "branches": branches,
        "created_at": checkpoint.get("created_at"),
    }


def make_receipt(
    checkpoint: dict[str, Any],
    *,
    witness: str,
    private_key: ec.EllipticCurvePrivateKey,
    signed_at: str | None = None,
) -> WitnessReceipt:
    if not witness.strip():
        raise ValueError("witness name is required")
    statement = checkpoint_statement(checkpoint)
    digest = sha256_json(statement)
    pub = private_key.public_key()
    return WitnessReceipt(
        format=RECEIPT_FORMAT,
        witness=witness.strip(),
        key_id=key_fingerprint(pub),
        jwk=public_jwk(pub),
        statement=statement,
        statement_digest=digest,
        signature=sign_digest(private_key, digest),
        signed_at=signed_at or utcnow(),
    )


def verify_receipt(receipt: WitnessReceipt | dict[str, Any]) -> dict[str, Any]:
    item = receipt if isinstance(receipt, WitnessReceipt) else WitnessReceipt.from_dict(receipt)
    errors: list[str] = []
    if item.format != RECEIPT_FORMAT:
        errors.append("unsupported witness receipt format")
    digest = sha256_json(item.statement)
    if digest != item.statement_digest:
        errors.append("statement digest mismatch")
    try:
        public_key = public_key_from_jwk(item.jwk)
        if key_fingerprint(public_key) != item.key_id:
            errors.append("witness key fingerprint mismatch")
        if not verify_digest(public_key, item.statement_digest, item.signature):
            errors.append("witness signature invalid")
    except Exception as exc:
        errors.append(f"invalid witness key: {exc}")
    return {
        "ok": not errors,
        "witness": item.witness,
        "key_id": item.key_id,
        "statement_digest": item.statement_digest,
        "errors": errors,
    }


def verify_quorum(
    receipts: Iterable[WitnessReceipt | dict[str, Any]],
    *,
    threshold: int,
    trusted_key_ids: set[str] | None = None,
) -> dict[str, Any]:
    if threshold < 1:
        raise ValueError("quorum threshold must be at least one")
    reports = [verify_receipt(item) for item in receipts]
    valid = [r for r in reports if r["ok"]]
    if not valid:
        return {"ok": False, "threshold": threshold, "valid": 0, "errors": ["no valid receipts"], "receipts": reports}

    statement_digests = {r["statement_digest"] for r in valid}
    errors: list[str] = []
    if len(statement_digests) != 1:
        errors.append("valid witnesses signed different statements")

    unique_keys = {r["key_id"] for r in valid}
    if trusted_key_ids is not None:
        unique_keys &= trusted_key_ids
    if len(unique_keys) < threshold:
        errors.append(f"quorum not reached: {len(unique_keys)}/{threshold}")

    return {
        "ok": not errors,
        "threshold": threshold,
        "valid": len(unique_keys),
        "statement_digest": next(iter(statement_digests)) if len(statement_digests) == 1 else None,
        "errors": errors,
        "receipts": reports,
    }
