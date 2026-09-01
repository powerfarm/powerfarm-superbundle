"""Genesis creates an institution. Recovery must never create one.

Negative controls for institutional identity and continuity. Every one of these
was reachable before CREATE / OPEN / RESTORE were separated: a runtime that lost
its canonical store would open the empty substitute, bootstrap into it, and
answer as though it were the institution it had just lost.

Identity here is bound to nothing physical. The store moves between files in
`test_store_may_move_without_changing_institutional_identity`; the anchor does
not change.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from powerfarm.bundle.exporter import export_bundle
from powerfarm.institution_identity import InstitutionAnchor, InstitutionIdentityError
from powerfarm.kernel import Kernel
from powerfarm.registry import StaticRegistryDirectory


def directory() -> StaticRegistryDirectory:
    return StaticRegistryDirectory(
        offices={"director"},
        occupancies={"director": "human-1"},
    )


def create(path: Path) -> tuple[Kernel, InstitutionAnchor]:
    return Kernel.create_institution(path, "human-1", registry=directory())


def work(kernel: Kernel, n: int = 1) -> None:
    """Admit some ordinary history so a stale copy is distinguishable from a current one."""
    for index in range(n):
        kernel.append(
            branch="main",
            actor="human-1",
            office="director",
            kind="policy.declare",
            subject=f"policy:{index}",
            payload={"index": index},
            request_id=f"work-{index}",
        )


# ---------------------------------------------------------------------------
# CREATE
# ---------------------------------------------------------------------------

def test_create_founds_one_institution_and_publishes_its_anchor(tmp_path):
    kernel, anchor = create(tmp_path / "inst.db")
    try:
        assert anchor.institution_ref.startswith("inst_")
        assert anchor.genesis_ref.startswith("evt_")
        assert len(anchor.genesis_digest) == 64
        assert anchor.trust_root_ref and len(anchor.trust_root_ref) >= 16
        assert anchor.protocol_version == "powerfarm-continuum/v3"
        # The anchor names no file, host, engine or URL.
        rendered = str(anchor.public())
        assert str(tmp_path) not in rendered
        assert "inst.db" not in rendered
        assert kernel.anchor() == anchor
    finally:
        kernel.close()


def test_create_refuses_a_store_that_already_holds_an_institution(tmp_path):
    path = tmp_path / "inst.db"
    kernel, _ = create(path)
    kernel.close()
    with pytest.raises(InstitutionIdentityError, match="already holds one"):
        Kernel.create_institution(path, "human-1", registry=directory())


# ---------------------------------------------------------------------------
# OPEN — the substitute-store family
# ---------------------------------------------------------------------------

def test_canonical_store_disappears_and_an_empty_store_takes_its_place(tmp_path):
    """The exact fork the ADR 0014 harness found. It must now fail closed."""
    path = tmp_path / "inst.db"
    kernel, anchor = create(path)
    work(kernel)
    kernel.close()

    # The store is gone. Something else — a fresh volume, a new container, a
    # mistyped path — is where it used to be.
    shutil.move(str(path), str(tmp_path / "inst.db.lost"))

    with pytest.raises(InstitutionIdentityError, match="empty store is not authorization to bootstrap"):
        Kernel.open_institution(path, anchor, registry=directory())


def test_operator_runs_normal_startup_against_an_empty_store(tmp_path):
    """Normal startup is an OPEN. It never has the authority to found anything."""
    kernel = None
    with pytest.raises(InstitutionIdentityError, match="empty store is not authorization to bootstrap"):
        kernel = Kernel.open_institution(tmp_path / "absent.db", "inst_whatever", registry=directory())
    assert kernel is None


def test_an_opened_handle_can_never_run_genesis(tmp_path):
    path = tmp_path / "inst.db"
    kernel, anchor = create(path)
    kernel.close()

    opened = Kernel.open_institution(path, anchor, registry=directory())
    try:
        with pytest.raises(InstitutionIdentityError, match="not authorized to create an institution"):
            opened.init("human-1")
    finally:
        opened.close()


def test_bootstrap_cannot_be_run_a_second_time(tmp_path):
    path = tmp_path / "inst.db"
    kernel, _ = create(path)
    kernel.close()

    # Even a handle deliberately authorized to found an institution refuses to
    # found a second one in the same store.
    founder = Kernel(path, allow_genesis=True, registry=directory())
    try:
        with pytest.raises(Exception, match="already initialized"):
            founder.init("human-1")
    finally:
        founder.close()


def test_a_store_belonging_to_another_institution_is_refused(tmp_path):
    ours, our_anchor = create(tmp_path / "ours.db")
    ours.close()
    theirs, their_anchor = create(tmp_path / "theirs.db")
    theirs.close()

    assert our_anchor.institution_ref != their_anchor.institution_ref
    with pytest.raises(InstitutionIdentityError, match="institution_ref differs"):
        Kernel.open_institution(tmp_path / "theirs.db", our_anchor, registry=directory())


def test_right_institution_ref_with_incompatible_lineage_is_refused(tmp_path):
    """A store may carry the expected name and still not be that institution.

    Identity is not the `institution_ref` alone. Genesis is part of the anchor
    precisely so that a store which was handed the right name — by a restored
    metadata row, a copied identifier, or an operator error — cannot pass as the
    institution whose history it does not share.
    """
    ours, our_anchor = create(tmp_path / "ours.db")
    ours.close()
    theirs, _ = create(tmp_path / "theirs.db")
    theirs.close()

    # Give the other institution our name, leaving its own genesis in place.
    impostor = Kernel(tmp_path / "theirs.db", registry=directory())
    with impostor._write_transaction():
        impostor.db.execute(
            "UPDATE metadata SET value=? WHERE key='institution_id'",
            (our_anchor.institution_ref,),
        )
    impostor.close()

    with pytest.raises(InstitutionIdentityError, match="genesis"):
        Kernel.open_institution(tmp_path / "theirs.db", our_anchor, registry=directory())


def test_store_may_move_without_changing_institutional_identity(tmp_path):
    """The store is a location. The institution is not."""
    original = tmp_path / "a" / "inst.db"
    original.parent.mkdir()
    kernel, anchor = create(original)
    work(kernel, 2)
    key_file = kernel.key_path
    kernel.close()

    moved = tmp_path / "b" / "renamed.db"
    moved.parent.mkdir()
    for suffix in ("", "-wal", "-shm"):
        source = Path(f"{original}{suffix}")
        if source.exists():
            shutil.move(str(source), f"{moved}{suffix}")

    reopened = Kernel.open_institution(moved, anchor, registry=directory(), seal_key_path=key_file)
    try:
        assert reopened.anchor() == anchor
        assert len(reopened.events("main")) == 3
    finally:
        reopened.close()


# ---------------------------------------------------------------------------
# RESTORE
# ---------------------------------------------------------------------------

def test_legitimate_restore_preserves_institution_genesis_and_lineage(tmp_path):
    source_path = tmp_path / "inst.db"
    kernel, anchor = create(source_path)
    work(kernel, 3)
    bundle = export_bundle(kernel)
    witness = kernel.checkpoint()
    original_events = [event.id for event in kernel.events("main")]
    key_file = kernel.key_path
    kernel.close()

    restored = Kernel.restore_institution(
        tmp_path / "rebuilt.db",
        bundle=bundle,
        expect=anchor,
        witness=witness,
        registry=directory(),
        seal_key_path=key_file,
    )
    try:
        assert restored.anchor() == anchor
        assert [event.id for event in restored.events("main")] == original_events
        assert restored.audit()["ok"] is True
    finally:
        restored.close()


def test_restore_never_runs_genesis(tmp_path):
    kernel, anchor = create(tmp_path / "inst.db")
    work(kernel)
    bundle = export_bundle(kernel)
    key_file = kernel.key_path
    kernel.close()

    restored = Kernel.restore_institution(
        tmp_path / "rebuilt.db", bundle=bundle, expect=anchor,
        registry=directory(), seal_key_path=key_file,
    )
    try:
        genesis_acts = [event for event in restored.events("main") if event.kind == "system.genesis"]
        assert len(genesis_acts) == 1
        assert genesis_acts[0].id == anchor.genesis_ref
        with pytest.raises(InstitutionIdentityError, match="not authorized to create an institution"):
            restored.init("human-1")
    finally:
        restored.close()


def test_a_stale_restore_is_refused_when_a_later_witness_exists(tmp_path):
    """Carrying the right name is not continuity.

    The stale copy has the correct `institution_ref`, the correct genesis and a
    clean audit. It is still the wrong institution to run, because it has lost
    everything admitted after the witness was taken.
    """
    path = tmp_path / "inst.db"
    kernel, anchor = create(path)
    work(kernel, 1)
    stale_bundle = export_bundle(kernel)          # the old snapshot

    work(kernel, 3)                                # the institution moves on
    later_witness = kernel.checkpoint()            # and is witnessed there
    key_file = kernel.key_path
    kernel.close()

    # Identity alone accepts the stale copy.
    accepted = Kernel.restore_institution(
        tmp_path / "identity-only.db", bundle=stale_bundle, expect=anchor,
        registry=directory(), seal_key_path=key_file,
    )
    try:
        assert accepted.anchor() == anchor
    finally:
        accepted.close()

    # Continuity does not.
    with pytest.raises(InstitutionIdentityError, match="continuity"):
        Kernel.restore_institution(
            tmp_path / "rebuilt.db", bundle=stale_bundle, expect=anchor, witness=later_witness,
            registry=directory(), seal_key_path=key_file,
        )


def test_restore_refuses_a_bundle_from_another_institution(tmp_path):
    ours, our_anchor = create(tmp_path / "ours.db")
    ours.close()
    theirs, _ = create(tmp_path / "theirs.db")
    work(theirs)
    foreign_bundle = export_bundle(theirs)
    their_key = theirs.key_path
    theirs.close()

    with pytest.raises(InstitutionIdentityError, match="institution_ref differs|trust root differs"):
        Kernel.restore_institution(
            tmp_path / "rebuilt.db", bundle=foreign_bundle, expect=our_anchor,
            registry=directory(), seal_key_path=their_key,
        )


def test_restore_refuses_a_store_that_already_holds_an_institution(tmp_path):
    kernel, anchor = create(tmp_path / "inst.db")
    bundle = export_bundle(kernel)
    key_file = kernel.key_path
    kernel.close()

    with pytest.raises(InstitutionIdentityError, match="already holds an institution"):
        Kernel.restore_institution(
            tmp_path / "inst.db", bundle=bundle, expect=anchor,
            registry=directory(), seal_key_path=key_file,
        )


# ---------------------------------------------------------------------------
# The anchor itself
# ---------------------------------------------------------------------------

def test_an_anchor_cannot_disagree_with_its_own_digest(tmp_path):
    kernel, anchor = create(tmp_path / "inst.db")
    kernel.close()
    tampered = {**anchor.public(), "institution_ref": "inst_somebody_else"}
    with pytest.raises(InstitutionIdentityError, match="does not match its own content"):
        InstitutionAnchor.from_mapping(tampered)


def test_open_requires_an_expectation(tmp_path):
    with pytest.raises(InstitutionIdentityError, match="requires the institution it expects"):
        Kernel.open_institution(tmp_path / "inst.db", None, registry=directory())


def test_a_handle_cannot_both_expect_and_found_an_institution(tmp_path):
    with pytest.raises(InstitutionIdentityError, match="cannot also be authorized to create"):
        Kernel(tmp_path / "inst.db", expect="inst_x", allow_genesis=True, registry=directory())
