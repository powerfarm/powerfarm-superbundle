from __future__ import annotations

import pytest

from powerfarm.kernel import InstitutionalError, Kernel


def _office(k: Kernel, *, run_start: bool = True):
    director = "director-human"
    k.append(branch="main", actor=director, office="director", kind="office.create", subject="office:research", payload={"mandate":"research"})
    k.append(branch="main", actor=director, office="director", kind="occupancy.assign", subject="office:research", payload={"principal":"agent:researcher"})
    k.append(branch="main", actor=director, office="director", kind="authority.grant", subject="office:research", payload={"grantee_office":"research","action":"tool.invoke.search","subject":"tool:search"})
    start_grant = None
    if run_start:
        start_grant = k.append(branch="main", actor=director, office="director", kind="authority.grant", subject="office:research", payload={"grantee_office":"research","action":"run.start","subject":"run:*"})
    return start_grant


def test_atomic_batch_rolls_back_intent_when_run_start_is_refused(tmp_path):
    k = Kernel(str(tmp_path / "institution.db"), identity_mode="embedded-test")
    k.init("director-human")
    _office(k, run_start=False)
    before = len(k.events())

    with pytest.raises(InstitutionalError):
        k.append_batch([
            {
                "alias": "intent",
                "actor": "agent:researcher",
                "office": "research",
                "kind": "tool.invoke.search",
                "subject": "tool:search",
                "payload": {"args_sha256": "0" * 64},
                "request_id": "call-1-intent",
            },
            {
                "alias": "run",
                "actor": "agent:researcher",
                "office": "research",
                "kind": "run.start",
                "subject": "run:call-1",
                "payload": {"owner_office": "research"},
                "causes": ["@intent"],
                "request_id": "call-1-run",
            },
        ])

    assert len(k.events()) == before
    assert not any(e.request_id in {"call-1-intent", "call-1-run"} for e in k.events())
    k.close()


def test_atomic_batch_is_idempotent_as_a_group(tmp_path):
    k = Kernel(str(tmp_path / "institution.db"), identity_mode="embedded-test")
    k.init("director-human")
    _office(k)
    batch = [
        {
            "alias": "intent",
            "actor": "agent:researcher",
            "office": "research",
            "kind": "tool.invoke.search",
            "subject": "tool:search",
            "payload": {"args_sha256": "1" * 64},
            "request_id": "call-2-intent",
        },
        {
            "alias": "run",
            "actor": "agent:researcher",
            "office": "research",
            "kind": "run.start",
            "subject": "run:call-2",
            "payload": {"owner_office": "research"},
            "causes": ["@intent"],
            "request_id": "call-2-run",
        },
    ]
    first = k.append_batch(batch)
    count = len(k.events())
    second = k.append_batch(batch)
    assert len(k.events()) == count
    assert [e.id for e in first] == [e.id for e in second]
    k.close()


def test_run_outcome_inherits_start_authority_after_revocation(tmp_path):
    k = Kernel(str(tmp_path / "institution.db"), identity_mode="embedded-test")
    k.init("director-human")
    start_grant = _office(k)
    admitted = k.append_batch([
        {
            "alias": "intent",
            "actor": "agent:researcher",
            "office": "research",
            "kind": "tool.invoke.search",
            "subject": "tool:search",
            "payload": {"args_sha256": "2" * 64},
            "request_id": "call-3-intent",
        },
        {
            "alias": "run",
            "actor": "agent:researcher",
            "office": "research",
            "kind": "run.start",
            "subject": "run:call-3",
            "payload": {"owner_office": "research"},
            "causes": ["@intent"],
            "request_id": "call-3-run",
        },
    ])
    intent, run = admitted

    k.append(
        branch="main",
        actor="director-human",
        office="director",
        kind="authority.revoke",
        subject="office:research",
        payload={"grant_id": start_grant.id},
    )

    finish = k.append(
        branch="main",
        actor="agent:researcher",
        office="research",
        kind="run.finish",
        subject="run:call-3",
        payload={"result": {"sha256": "3" * 64}},
        causes=[run.id, intent.id],
        request_id="call-3-outcome",
    )
    assert finish.authority_ref == f"continuation:{run.id}"
    assert k.state()["objects"]["run:call-3"]["status"] == "completed"
    assert k.audit()["ok"]
    k.close()
