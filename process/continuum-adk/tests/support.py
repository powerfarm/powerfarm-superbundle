from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from continuum_adk.execution_slice import execution_refs_from_slice


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _seal(value: dict) -> dict:
    out = json.loads(_canonical(value))
    out.pop("slice_sha256", None)
    out["slice_sha256"] = "sha256:" + hashlib.sha256(_canonical(out).encode("utf-8")).hexdigest()
    return out


def make_execution_slice(
    *,
    actor: str = "agent:researcher",
    office: str = "research",
    tool_name: str = "search",
    kind: str = "tool.invoke.search",
    subject: str = "tool:search",
    card_ref: str = "pf.card.adk-test",
    beat_ref: str = "pf.beat.adk-test",
    attempt_ref: str = "pf.attempt.adk-test",
) -> dict:
    safe_actor = actor.lower().replace(":", "-").replace("_", "-")
    base = {
        "contract_version": "powerfarm.execution-slice.v3",
        "card": {
            "ref": card_ref,
            "generation": 1,
            "revision": 1,
            "content_sha256": "sha256:" + "b" * 64,
        },
        "principal": {"actor": actor, "office": office},
        "institutional": {
            "identity_ref": f"pf.identity.{safe_actor}",
            "office_ref": f"pf.office.{office}",
            "occupancy_ref": f"pf.occupancy.{safe_actor}",
            "direction_ref": "pf.direction.adk-test",
            "responsibility_ref": None,
            "authority_ref": "continuum:projected-at-admission",
            "run_ref": None,
            "run_grant_ref": None,
            "ecs_sha256": "a" * 64,
        },
        "circulation": {"beat_ref": beat_ref, "attempt_ref": attempt_ref},
        "capability": {"tool_name": tool_name, "kind": kind, "subject": subject},
        "resources": {
            "energy_remaining": {
                "beats": 2,
                "model_tokens": 100000,
                "tool_calls": 20,
                "network_calls": 20,
                "compute_ms": 600000,
                "sandbox_ms": 600000,
                "wall_ms": 900000,
                "human_attention_ms": 600000,
            },
            "cost": {"currency": "USD", "remaining_micros": 10000000},
        },
    }
    first = _seal(base)
    refs = execution_refs_from_slice(first)
    base["institutional"]["run_ref"] = refs.run_ref
    return _seal(base)


@dataclass
class StaticExecutionSlice:
    value: dict

    def __call__(self, _context, *, tool_name, kind, subject):
        return self.value
