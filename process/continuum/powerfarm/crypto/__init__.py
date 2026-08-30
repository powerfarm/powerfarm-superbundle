"""Public-key witnesses for external Continuum attestations."""

from .p256 import (
    generate_private_key,
    key_fingerprint,
    load_private_key,
    load_public_key,
    public_jwk,
    save_private_key,
    save_public_key,
    sign_digest,
    verify_digest,
)
from .event_signatures import EventSignature, key_binding_at, make_event_signature, verify_event_signature
from .witness import (
    WitnessReceipt,
    make_receipt,
    verify_receipt,
    verify_quorum,
)

__all__ = [
    "generate_private_key",
    "key_fingerprint",
    "load_private_key",
    "load_public_key",
    "public_jwk",
    "save_private_key",
    "save_public_key",
    "sign_digest",
    "verify_digest",
    "EventSignature",
    "key_binding_at",
    "make_event_signature",
    "verify_event_signature",
    "WitnessReceipt",
    "make_receipt",
    "verify_receipt",
    "verify_quorum",
]
