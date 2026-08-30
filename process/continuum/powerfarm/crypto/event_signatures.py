from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from cryptography.hazmat.primitives.asymmetric import ec

from powerfarm.core.canonical import sha256_json
from powerfarm.core.time import utcnow
from powerfarm.model import Event
from powerfarm.projection import parse_time

from .p256 import key_fingerprint, public_jwk, public_key_from_jwk, sign_digest, verify_digest

SIGNATURE_FORMAT = "powerfarm.event-signature/v1"


@dataclass(frozen=True)
class EventSignature:
    event_id: str
    key_id: str
    signer: str
    office: str
    algorithm: str
    jwk: dict[str, Any]
    statement_digest: str
    signature: str
    signed_at: str

    def public(self) -> dict[str, Any]:
        return {
            "format": SIGNATURE_FORMAT,
            "event_id": self.event_id,
            "key_id": self.key_id,
            "signer": self.signer,
            "office": self.office,
            "algorithm": self.algorithm,
            "jwk": self.jwk,
            "statement_digest": self.statement_digest,
            "signature": self.signature,
            "signed_at": self.signed_at,
        }


def signature_statement(event: Event, institution_id: str, signed_at: str) -> dict[str, Any]:
    return {
        "format": SIGNATURE_FORMAT,
        "institution_id": institution_id,
        "event_id": event.id,
        "event_hash": event.hash,
        "branch_id": event.branch_id,
        "branch_index": event.branch_index,
        "actor": event.actor,
        "office": event.office,
        "recorded_at": event.recorded_at,
        "signed_at": signed_at,
    }


def make_event_signature(
    event: Event,
    *,
    institution_id: str,
    private_key: ec.EllipticCurvePrivateKey,
    signed_at: str | None = None,
) -> EventSignature:
    actual_signed_at = signed_at or utcnow()
    statement = signature_statement(event, institution_id, actual_signed_at)
    digest = sha256_json(statement)
    pub = private_key.public_key()
    return EventSignature(
        event_id=event.id,
        key_id=key_fingerprint(pub),
        signer=event.actor,
        office=event.office,
        algorithm="ES256",
        jwk=public_jwk(pub),
        statement_digest=digest,
        signature=sign_digest(private_key, digest),
        signed_at=actual_signed_at,
    )


def verify_event_signature(
    signature: EventSignature | dict[str, Any],
    event: Event,
    *,
    institution_id: str,
) -> list[str]:
    value = signature.public() if isinstance(signature, EventSignature) else dict(signature)
    errors: list[str] = []
    if value.get("format", SIGNATURE_FORMAT) != SIGNATURE_FORMAT:
        errors.append("unsupported event signature format")
    if value.get("event_id") != event.id:
        errors.append("signature references different event")
    if value.get("signer") != event.actor:
        errors.append("signature signer differs from event actor")
    if value.get("office") != event.office:
        errors.append("signature office differs from event office")
    statement = signature_statement(event, institution_id, str(value.get("signed_at", "")))
    digest = sha256_json(statement)
    if value.get("statement_digest") != digest:
        errors.append("event signature statement digest mismatch")
    try:
        jwk = dict(value["jwk"])
        pub = public_key_from_jwk(jwk)
        if key_fingerprint(pub) != value.get("key_id"):
            errors.append("event signature key fingerprint mismatch")
        if not verify_digest(pub, digest, str(value.get("signature", ""))):
            errors.append("event signature cryptographic verification failed")
    except Exception as exc:
        errors.append(f"invalid event signature key: {exc}")
    return errors


def key_binding_at(
    events: Iterable[Event],
    *,
    key_id: str,
    principal: str,
    office: str,
    at_recorded: str,
) -> dict[str, Any] | None:
    """Resolve a key binding from root-authorized key registration/revocation acts."""
    cutoff = parse_time(at_recorded)
    binding: dict[str, Any] | None = None
    for event in events:
        if parse_time(event.recorded_at) > cutoff:
            continue
        if parse_time(event.effective_at) > cutoff:
            continue
        if event.kind == "identity.key.register" and event.subject == f"key:{key_id}":
            payload = event.payload
            if payload.get("principal") == principal and payload.get("office") == office:
                binding = {
                    "key_id": key_id,
                    "principal": principal,
                    "office": office,
                    "jwk": payload.get("jwk"),
                    "registered_by": event.id,
                    "registered_at": event.recorded_at,
                }
        elif event.kind == "identity.key.revoke" and str(event.payload.get("key_id")) == key_id:
            binding = None
    return binding
