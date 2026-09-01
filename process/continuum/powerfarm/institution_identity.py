"""Institutional identity and its continuity across stores.

    Genesis creates an institution. Recovery must never create one.

The law this module exists to enforce is that losing or replacing the canonical
store can never let a runtime quietly create a new institution and mistake it for
the previous one.

Identity is therefore anchored to nothing physical. No hostname, no file path, no
database URL, no engine. The store may move, be rebuilt, or change technology
entirely; the institution and its continuity may not. The anchor is derived from
what the institution *is*:

    institution_ref     the identity assigned once, at genesis
    genesis_ref         the identifier of the genesis act
    genesis_digest      the hash of the genesis act itself
    trust_root_ref      the fingerprint of the institutional seal key
    protocol_version    the storage/protocol format the anchor was written under

`anchor_digest` binds those five together so one value can be carried, compared,
and pinned by a runtime that must open exactly one institution and no other.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from powerfarm.core.canonical import sha256_json
from powerfarm.core.errors import InstitutionalError

ANCHOR_FORMAT = "powerfarm.institution-anchor/v1"
GENESIS_KIND = "system.genesis"
GENESIS_SUBJECT = "institution:powerfarm"


class InstitutionIdentityError(InstitutionalError):
    """Raised when a store is not the institution the caller expected."""


@dataclass(frozen=True)
class InstitutionAnchor:
    """An immutable, location-independent statement of which institution this is."""

    institution_ref: str
    genesis_ref: str
    genesis_digest: str
    trust_root_ref: str
    protocol_version: str

    @property
    def anchor_digest(self) -> str:
        return sha256_json(self.body())

    def body(self) -> dict[str, Any]:
        return {
            "format": ANCHOR_FORMAT,
            "institution_ref": self.institution_ref,
            "genesis_ref": self.genesis_ref,
            "genesis_digest": self.genesis_digest,
            "trust_root_ref": self.trust_root_ref,
            "protocol_version": self.protocol_version,
        }

    def public(self) -> dict[str, Any]:
        return {**self.body(), "anchor_digest": self.anchor_digest}

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "InstitutionAnchor":
        if not isinstance(value, Mapping):
            raise InstitutionIdentityError("institution anchor must be an object")
        if value.get("format") not in (None, ANCHOR_FORMAT):
            raise InstitutionIdentityError(f"unsupported institution anchor format: {value.get('format')}")
        try:
            anchor = cls(
                institution_ref=str(value["institution_ref"]),
                genesis_ref=str(value["genesis_ref"]),
                genesis_digest=str(value["genesis_digest"]),
                trust_root_ref=str(value["trust_root_ref"]),
                protocol_version=str(value["protocol_version"]),
            )
        except KeyError as exc:
            raise InstitutionIdentityError(f"institution anchor is missing {exc.args[0]}") from exc
        declared = value.get("anchor_digest")
        if declared is not None and str(declared) != anchor.anchor_digest:
            raise InstitutionIdentityError("institution anchor digest does not match its own content")
        return anchor

    def differences(self, other: "InstitutionAnchor") -> list[str]:
        """Name every way `other` fails to be this institution.

        Reported field by field on purpose. "Wrong institution" and "right
        institution, wrong genesis" are different accidents and lead to
        different recovery actions.
        """
        reasons: list[str] = []
        if self.institution_ref != other.institution_ref:
            reasons.append(
                f"institution_ref differs: expected {self.institution_ref}, store holds {other.institution_ref}"
            )
        if self.genesis_ref != other.genesis_ref:
            reasons.append(f"genesis_ref differs: expected {self.genesis_ref}, store holds {other.genesis_ref}")
        if self.genesis_digest != other.genesis_digest:
            reasons.append("genesis act digest differs: the store's genesis is not the expected genesis")
        if self.trust_root_ref != other.trust_root_ref:
            reasons.append("trust root differs: the store is sealed under a different institutional key")
        if self.protocol_version != other.protocol_version:
            reasons.append(
                f"protocol version differs: expected {self.protocol_version}, store holds {other.protocol_version}"
            )
        return reasons


def coerce_expectation(value: Any) -> InstitutionAnchor | str | None:
    """Accept an anchor, an anchor mapping, or a bare institution_ref."""
    if value is None:
        return None
    if isinstance(value, InstitutionAnchor):
        return value
    if isinstance(value, Mapping):
        return InstitutionAnchor.from_mapping(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            raise InstitutionIdentityError("expected institution reference is empty")
        return text
    raise InstitutionIdentityError("expected institution must be an anchor, a mapping, or an institution_ref")
