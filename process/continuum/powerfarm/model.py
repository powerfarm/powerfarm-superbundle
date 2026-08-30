from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Event:
    seq: int
    branch_index: int
    id: str
    branch_id: str
    request_id: str | None
    recorded_at: str
    effective_at: str
    actor: str
    office: str
    kind: str
    subject: str
    payload: dict[str, Any]
    causes: list[str]
    authority_ref: str
    intent_hash: str
    prev_hash: str
    hash: str
    seal: str

    def public(self) -> dict[str, Any]:
        return {
            "seq": self.seq,
            "branch_index": self.branch_index,
            "id": self.id,
            "branch_id": self.branch_id,
            "request_id": self.request_id,
            "recorded_at": self.recorded_at,
            "effective_at": self.effective_at,
            "actor": self.actor,
            "office": self.office,
            "kind": self.kind,
            "subject": self.subject,
            "payload": self.payload,
            "causes": self.causes,
            "authority_ref": self.authority_ref,
            "intent_hash": self.intent_hash,
            "prev_hash": self.prev_hash,
            "hash": self.hash,
            "seal": self.seal,
        }
