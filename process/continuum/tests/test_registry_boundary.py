from pathlib import Path

import pytest

from powerfarm.kernel import InstitutionalError, Kernel
from powerfarm.registry import StaticRegistryDirectory


def kernel(tmp_path: Path, directory: StaticRegistryDirectory) -> Kernel:
    return Kernel(tmp_path / "institution.db", registry=directory)


def test_registry_is_source_of_office_and_occupancy(tmp_path: Path) -> None:
    directory = StaticRegistryDirectory(
        offices={"director", "operations"},
        occupancies={"director": "human-1", "operations": "agent-1"},
    )
    k = kernel(tmp_path, directory)
    k.init("human-1")
    grant = k.append(
        branch="main", actor="human-1", office="director", kind="authority.grant",
        subject="authority:operations",
        payload={"grantee_office": "operations", "action": "tool.invoke.search", "subject": "tool:search"},
    )
    assert grant.authority_ref == "constitutional:root"
    admitted = k.append(
        branch="main", actor="agent-1", office="operations", kind="tool.invoke.search",
        subject="tool:search", payload={"query_digest": "abc"},
    )
    assert admitted.authority_ref == grant.id


def test_process_cannot_create_or_assign_registry_identity(tmp_path: Path) -> None:
    directory = StaticRegistryDirectory(offices={"director"}, occupancies={"director": "human-1"})
    k = kernel(tmp_path, directory)
    k.init("human-1")
    with pytest.raises(InstitutionalError, match="belongs to Registry"):
        k.append(
            branch="main", actor="human-1", office="director", kind="office.create",
            subject="office:operations", payload={"mandate": "Operate"},
        )


def test_registry_occupancy_change_immediately_changes_process_admission(tmp_path: Path) -> None:
    directory = StaticRegistryDirectory(
        offices={"director", "operations"},
        occupancies={"director": "human-1", "operations": "agent-old"},
    )
    k = kernel(tmp_path, directory)
    k.init("human-1")
    k.append(
        branch="main", actor="human-1", office="director", kind="authority.grant",
        subject="authority:operations",
        payload={"grantee_office": "operations", "action": "tool.invoke.search", "subject": "tool:search"},
    )
    directory.occupancies["operations"] = "agent-new"
    with pytest.raises(InstitutionalError, match="does not bind principal agent-old"):
        k.append(
            branch="main", actor="agent-old", office="operations", kind="tool.invoke.search",
            subject="tool:search", payload={},
        )
    assert k.append(
        branch="main", actor="agent-new", office="operations", kind="tool.invoke.search",
        subject="tool:search", payload={},
    ).office == "operations"


def test_registry_backed_process_cannot_register_identity_keys(tmp_path: Path) -> None:
    directory = StaticRegistryDirectory(offices={"director"}, occupancies={"director": "human-1"})
    k = kernel(tmp_path, directory)
    k.init("human-1")
    with pytest.raises(InstitutionalError, match="belongs to Registry"):
        k.append(
            branch="main", actor="human-1", office="director", kind="identity.key.register",
            subject="key:" + "a" * 64,
            payload={"principal": "human-1", "office": "director", "jwk": {"kty": "EC"}},
        )


def test_registry_office_can_own_run_without_embedded_office_projection(tmp_path: Path) -> None:
    directory = StaticRegistryDirectory(
        offices={"director", "operations"},
        occupancies={"director": "human-1", "operations": "agent-1"},
    )
    k = kernel(tmp_path, directory)
    k.init("human-1")
    k.append(
        branch="main", actor="human-1", office="director", kind="authority.grant",
        subject="authority:operations:tool",
        payload={"grantee_office": "operations", "action": "tool.invoke.search", "subject": "tool:search"},
    )
    k.append(
        branch="main", actor="human-1", office="director", kind="authority.grant",
        subject="authority:operations:run",
        payload={"grantee_office": "operations", "action": "run.start", "subject": "run:*"},
    )
    events = k.append_batch([
        {
            "alias": "intent", "actor": "agent-1", "office": "operations",
            "kind": "tool.invoke.search", "subject": "tool:search", "payload": {},
        },
        {
            "actor": "agent-1", "office": "operations", "kind": "run.start",
            "subject": "run:registry-owned-office",
            "payload": {"owner_office": "operations"}, "causes": ["@intent"],
        },
    ])
    assert events[-1].kind == "run.start"


def test_registry_backed_signature_uses_registry_key_binding(tmp_path: Path) -> None:
    from powerfarm.crypto import generate_private_key, key_fingerprint, make_event_signature, public_jwk

    key = generate_private_key()
    key_id = key_fingerprint(key.public_key())
    directory = StaticRegistryDirectory(
        offices={"director"},
        occupancies={"director": "human-1"},
        keys={
            key_id: {
                "key_id": key_id,
                "principal": "human-1",
                "office": "director",
                "jwk": public_jwk(key.public_key()),
            }
        },
    )
    k = kernel(tmp_path, directory)
    k.init("human-1")
    event = k.append(
        branch="main", actor="human-1", office="director",
        kind="claim.assert", subject="claim:registry-key", payload={"statement": "signed"},
    )
    signature = make_event_signature(
        event, institution_id=k._institution_id_locked(), private_key=key
    ).public()
    attached = k.attach_signature(signature)
    assert attached["key_id"] == key_id
    assert k.audit()["ok"] is True


def test_run_takeover_survives_registry_occupancy_replacement(tmp_path: Path) -> None:
    from datetime import timedelta
    from powerfarm.projection import parse_time

    directory = StaticRegistryDirectory(
        offices={"director", "operations"},
        occupancies={"director": "human-1", "operations": "agent-old"},
        occupancy_refs={"operations": "pf.occupancy.agent-old"},
        identity_refs={"agent-old": "pf.identity.agent-old", "agent-new": "pf.identity.agent-new"},
    )
    k = kernel(tmp_path, directory)
    k.init("human-1")
    k.append(
        branch="main", actor="human-1", office="director", kind="authority.grant",
        subject="authority:operations:run",
        payload={"grantee_office": "operations", "action": "run.start", "subject": "run:*"},
    )
    start = k.append(
        branch="main", actor="agent-old", office="operations", kind="run.start",
        subject="run:durable-office-work", payload={"owner_office": "operations"},
    )

    switch_dt = parse_time(start.recorded_at) + timedelta(microseconds=1)
    switch_at = switch_dt.isoformat(timespec="microseconds").replace("+00:00", "Z")
    directory.set_occupancy(
        "operations", "agent-new", effective_at=switch_at,
        occupancy_ref="pf.occupancy.agent-new", identity_ref="pf.identity.agent-new",
    )

    with pytest.raises(InstitutionalError, match="does not bind principal agent-old"):
        k.append(
            branch="main", actor="agent-old", office="operations", kind="run.finish",
            subject=start.subject, payload={"result": {"status": "too-late"}}, causes=[start.id],
        )

    takeover = k.append(
        branch="main", actor="agent-new", office="operations", kind="run.takeover",
        subject=start.subject,
        payload={
            "previous_actor": "agent-old",
            "successor_actor": "agent-new",
            "previous_occupancy_ref": "pf.occupancy.agent-old",
            "successor_occupancy_ref": "pf.occupancy.agent-new",
            "card_ref": "pf.card.durable-office-work",
            "reconciliation_ref": "pf.reconciliation.durable-office-work",
        },
        causes=[start.id], request_id="takeover-durable-office-work",
    )
    assert takeover.authority_ref == f"continuation:{start.id}"

    resume = k.append(
        branch="main", actor="agent-new", office="operations", kind="run.resume",
        subject=start.subject,
        payload={
            "card_ref": "pf.card.durable-office-work",
            "beat_ref": "pf.beat.reissued",
            "attempt_ref": "pf.attempt.same",
            "reconciliation_ref": "pf.reconciliation.durable-office-work",
        },
        causes=[takeover.id], request_id="resume-durable-office-work",
    )
    assert resume.authority_ref == f"continuation:{takeover.id}"

    finish = k.append(
        branch="main", actor="agent-new", office="operations", kind="run.finish",
        subject=start.subject, payload={"result": {"status": "completed"}},
        causes=[resume.id], request_id="finish-durable-office-work",
    )
    assert finish.authority_ref == f"continuation:{resume.id}"
    state = k.state("main")
    assert state["objects"][start.subject]["status"] == "completed"
    assert state["objects"][start.subject]["current_actor"] == "agent-new"
    assert k.audit()["ok"] is True


def test_writable_kernel_requires_registry_unless_embedded_test_is_explicit(tmp_path: Path):
    from powerfarm.kernel import InstitutionalError

    with pytest.raises(InstitutionalError, match="requires a RegistryDirectory"):
        Kernel(str(tmp_path / "implicit-legacy.db"))

    explicit = Kernel(str(tmp_path / "explicit-test.db"), identity_mode="embedded-test")
    try:
        explicit.init("director-human")
    finally:
        explicit.close()
