from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable

from .model import Event
from .validation import scope_matches


def parse_time(value: str) -> datetime:
    text = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        raise ValueError("institutional timestamps must be timezone-aware")
    return dt.astimezone(timezone.utc)


@dataclass
class InstitutionalState:
    root_office: str | None = None
    offices: dict[str, dict[str, Any]] = field(default_factory=dict)
    occupancies: dict[str, dict[str, Any]] = field(default_factory=dict)
    grants: dict[str, dict[str, Any]] = field(default_factory=dict)
    objects: dict[str, dict[str, Any]] = field(default_factory=dict)
    last_event: str | None = None

    def public(self) -> dict[str, Any]:
        return {
            "root_office": self.root_office,
            "offices": self.offices,
            "occupancies": self.occupancies,
            "grants": self.grants,
            "objects": self.objects,
            "last_event": self.last_event,
        }


def _object(state: InstitutionalState, subject: str, kind: str) -> dict[str, Any]:
    current = state.objects.setdefault(subject, {"subject": subject, "type": kind, "history": []})
    current.setdefault("type", kind)
    current.setdefault("history", [])
    return current


def apply_event(state: InstitutionalState, event: Event) -> None:
    p = event.payload
    k = event.kind

    if k == "system.genesis":
        root = str(p["root_office"])
        principal = str(p["principal"])
        state.root_office = root
        state.offices[root] = {
            "id": root,
            "mandate": p.get("mandate", "Root institutional authority"),
            "created_by": event.id,
            "active": True,
        }
        state.occupancies[root] = {
            "principal": principal,
            "assigned_by": event.id,
            "since": event.effective_at,
        }
    elif k == "office.create":
        office_id = event.subject.removeprefix("office:")
        state.offices[office_id] = {
            "id": office_id,
            "mandate": p.get("mandate", ""),
            "created_by": event.id,
            "active": True,
        }
    elif k == "office.retire":
        office_id = event.subject.removeprefix("office:")
        if office_id in state.offices:
            state.offices[office_id]["active"] = False
            state.offices[office_id]["retired_by"] = event.id
        state.occupancies.pop(office_id, None)
    elif k == "occupancy.assign":
        office_id = event.subject.removeprefix("office:")
        state.occupancies[office_id] = {
            "principal": str(p["principal"]),
            "definition": p.get("definition"),
            "assigned_by": event.id,
            "since": event.effective_at,
        }
    elif k == "occupancy.vacate":
        office_id = event.subject.removeprefix("office:")
        state.occupancies.pop(office_id, None)
    elif k == "authority.grant":
        state.grants[event.id] = {
            "id": event.id,
            "grantee_office": str(p["grantee_office"]),
            "action": str(p.get("action", "*")),
            "subject": str(p.get("subject", "*")),
            "valid_from": event.effective_at,
            "valid_until": p.get("valid_until"),
            "revoked": False,
            "granted_by": event.office,
            "granted_by_event": event.id,
        }
    elif k == "authority.revoke":
        grant_id = str(p["grant_id"])
        if grant_id in state.grants:
            state.grants[grant_id]["revoked"] = True
            state.grants[grant_id]["revoked_by"] = event.id
            state.grants[grant_id]["revoked_at"] = event.effective_at
    elif k == "commitment.open":
        o = _object(state, event.subject, "commitment")
        o.update({
            "status": "open",
            "statement": p.get("statement"),
            "owner_office": p.get("owner_office"),
            "due_at": p.get("due_at"),
            "opened_by": event.id,
        })
    elif k == "commitment.resolve":
        o = _object(state, event.subject, "commitment")
        o.update({"status": "resolved", "resolution": p.get("resolution"), "resolved_by": event.id})
    elif k == "commitment.cancel":
        o = _object(state, event.subject, "commitment")
        o.update({"status": "cancelled", "cancelled_by": event.id})
    elif k == "run.start":
        o = _object(state, event.subject, "run")
        o.update({
            "status": "running",
            "owner_office": p.get("owner_office", event.office),
            "capability": p.get("capability"),
            "started_by": event.id,
            "current_actor": event.actor,
            "current_office": event.office,
        })
    elif k == "run.takeover":
        o = _object(state, event.subject, "run")
        o.setdefault("takeovers", []).append({
            "event_id": event.id,
            "previous_actor": p.get("previous_actor"),
            "successor_actor": p.get("successor_actor", event.actor),
            "previous_occupancy_ref": p.get("previous_occupancy_ref"),
            "successor_occupancy_ref": p.get("successor_occupancy_ref"),
            "reconciliation_ref": p.get("reconciliation_ref"),
            "card_ref": p.get("card_ref"),
        })
        o.update({
            "status": "running",
            "current_actor": event.actor,
            "current_office": event.office,
            "last_takeover_by": event.id,
        })
    elif k == "run.resume":
        o = _object(state, event.subject, "run")
        o.setdefault("resumes", []).append({
            "event_id": event.id,
            "actor": event.actor,
            "office": event.office,
            "beat_ref": p.get("beat_ref"),
            "attempt_ref": p.get("attempt_ref"),
            "reconciliation_ref": p.get("reconciliation_ref"),
        })
        o.update({
            "status": "running",
            "current_actor": event.actor,
            "current_office": event.office,
            "last_resume_by": event.id,
        })
    elif k == "run.finish":
        o = _object(state, event.subject, "run")
        o.update({"status": "completed", "result": p.get("result"), "finished_by": event.id})
    elif k == "run.fail":
        o = _object(state, event.subject, "run")
        o.update({"status": "failed", "error": p.get("error"), "failed_by": event.id})
    elif k == "gap.observe":
        o = _object(state, event.subject, "gap")
        o.update({"status": "open", "statement": p.get("statement"), "observed_by": event.id})
    elif k == "gap.close":
        o = _object(state, event.subject, "gap")
        o.update({"status": "closed", "resolution": p.get("resolution"), "closed_by": event.id})
    elif k == "evidence.record":
        o = _object(state, event.subject, "evidence")
        o.update({"status": "recorded", "claim": p.get("claim"), "uri": p.get("uri"), "recorded_by": event.id})
    elif k == "artifact.record":
        o = _object(state, event.subject, "artifact")
        o.update({"status": "recorded", "uri": p.get("uri"), "sha256": p.get("sha256"), "recorded_by": event.id})
    elif k == "capability.admit":
        o = _object(state, event.subject, "capability")
        o.update({"status": "admitted", "descriptor": p.get("descriptor"), "admitted_by": event.id})
    elif k == "capability.revoke":
        o = _object(state, event.subject, "capability")
        o.update({"status": "revoked", "reason": p.get("reason"), "revoked_by": event.id})
    elif k == "claim.assert":
        o = _object(state, event.subject, "claim")
        o.update({"status": "asserted", "statement": p.get("statement"), "asserted_by": event.id})
    elif k == "result.record":
        o = _object(state, event.subject, "result")
        o.update({"status": "recorded", "summary": p.get("summary"), "recorded_by": event.id})
    else:
        o = _object(state, event.subject, k.split(".", 1)[0] if "." in k else "act")
        o.update({"status": p.get("status", o.get("status", "observed")), "last_kind": k})

    if event.subject in state.objects:
        history = state.objects[event.subject].setdefault("history", [])
        history.append(event.id)
        state.objects[event.subject]["last_event"] = event.id
    state.last_event = event.id


def project(
    events: Iterable[Event],
    effective_at: str | None = None,
    recorded_at: str | None = None,
) -> InstitutionalState:
    cutoff_effective = parse_time(effective_at) if effective_at is not None else None
    cutoff_recorded = parse_time(recorded_at) if recorded_at is not None else None
    indexed = list(enumerate(events))
    if cutoff_recorded is not None:
        indexed = [(i, e) for i, e in indexed if parse_time(e.recorded_at) <= cutoff_recorded]
    if cutoff_effective is not None:
        indexed = [(i, e) for i, e in indexed if parse_time(e.effective_at) <= cutoff_effective]
    indexed.sort(key=lambda pair: (parse_time(pair[1].effective_at), pair[0]))
    state = InstitutionalState()
    for _, event in indexed:
        apply_event(state, event)
    return state


def matching_authorities(state: InstitutionalState, office: str, action: str, subject: str, now: str) -> list[str]:
    if state.root_office == office:
        return ["constitutional:root"]
    now_dt = parse_time(now)
    candidates: list[tuple[int, str]] = []
    for grant_id, grant in state.grants.items():
        if grant["revoked"] or grant["grantee_office"] != office:
            continue
        valid_from = grant.get("valid_from")
        if valid_from and parse_time(str(valid_from)) > now_dt:
            continue
        until = grant.get("valid_until")
        if until and parse_time(str(until)) <= now_dt:
            continue
        if scope_matches(action, str(grant["action"])) and scope_matches(subject, str(grant["subject"])):
            specificity = len(str(grant["action"]).rstrip("*")) + len(str(grant["subject"]).rstrip("*"))
            candidates.append((specificity, grant_id))
    candidates.sort(key=lambda item: (-item[0], item[1]))
    return [grant_id for _, grant_id in candidates]


def matching_authority(state: InstitutionalState, office: str, action: str, subject: str, now: str) -> str | None:
    matches = matching_authorities(state, office, action, subject, now)
    return matches[0] if matches else None


def authority_ref_valid(
    state: InstitutionalState,
    authority_ref: str,
    office: str,
    action: str,
    subject: str,
    now: str,
) -> bool:
    return authority_ref in matching_authorities(state, office, action, subject, now)


def reconcile(state: InstitutionalState, now: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    now_dt = parse_time(now)

    for office_id, office in state.offices.items():
        if office.get("active") and office_id not in state.occupancies:
            findings.append({
                "severity": "warning",
                "code": "office.unoccupied",
                "subject": f"office:{office_id}",
                "message": "Active office has no current occupancy.",
            })

    for subject, obj in state.objects.items():
        if obj.get("type") == "commitment" and obj.get("status") == "open":
            due = obj.get("due_at")
            if due and parse_time(str(due)) < now_dt:
                findings.append({
                    "severity": "critical",
                    "code": "commitment.overdue",
                    "subject": subject,
                    "message": f"Commitment overdue since {due}.",
                })
            owner = obj.get("owner_office")
            if owner and owner not in state.occupancies:
                findings.append({
                    "severity": "warning",
                    "code": "commitment.owner_unoccupied",
                    "subject": subject,
                    "message": f"Owner office {owner} is not occupied.",
                })
        if obj.get("type") == "run" and obj.get("status") == "running":
            capability = obj.get("capability")
            if capability:
                cap = state.objects.get(str(capability))
                if not cap or cap.get("status") != "admitted":
                    findings.append({
                        "severity": "critical",
                        "code": "run.capability_not_admitted",
                        "subject": subject,
                        "message": f"Running with non-admitted capability {capability}.",
                    })
    return findings
