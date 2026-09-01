"""A Setting must know which institution it serves before it can act for one.

Negative controls for the Microsoft Agent Framework startup path. The controller
can admit acts and cause external effects, so it must declare the institution it
expects rather than trusting whatever Kernel it was handed.
"""

from __future__ import annotations

import pytest

from continuum_maf import ContinuumFunctionController, DottedToolPolicy, PINNED_MAF_REVISION_REF, ToolMapping
from powerfarm.institution_identity import InstitutionIdentityError
from powerfarm.kernel import Kernel
from powerfarm.registry import StaticRegistryDirectory

from conftest import bootstrap


def institution(tmp_path, name: str) -> Kernel:
    directory = StaticRegistryDirectory(
        offices={"director", "operations"},
        occupancies={"director": "human-1", "operations": "agent-1"},
    )
    kernel, _ = Kernel.create_institution(tmp_path / f"{name}.db", "human-1", registry=directory)
    for index, (action, subject) in enumerate([("tool.invoke.search", "tool:search"), ("run.start", "run:*")]):
        kernel.append(
            branch="main", actor="human-1", office="director", kind="authority.grant",
            subject=f"authority:operations:{index}",
            payload={"grantee_office": "operations", "action": action, "subject": subject},
            request_id=f"grant-{index}",
        )
    return kernel


def build(kernel, expect):
    return ContinuumFunctionController(
        kernel=kernel,
        expect_institution=expect,
        policy=DottedToolPolicy({"search": ToolMapping(kind="tool.invoke.search", subject="tool:search")}),
        revision_ref=PINNED_MAF_REVISION_REF,
    )


def test_correct_anchor_starts_the_setting(tmp_path):
    kernel = institution(tmp_path, "ours")
    try:
        assert build(kernel, kernel.anchor()).institution == kernel.anchor()
    finally:
        kernel.close()


def test_no_declared_institution_refuses_before_any_work(tmp_path):
    kernel = institution(tmp_path, "ours")
    try:
        with pytest.raises(InstitutionIdentityError, match="requires the institution it expects to serve"):
            build(kernel, None)
    finally:
        kernel.close()


def test_wrong_anchor_refuses_before_any_work(tmp_path):
    ours = institution(tmp_path, "ours")
    theirs = institution(tmp_path, "theirs")
    try:
        with pytest.raises(InstitutionIdentityError, match="not the expected institution"):
            build(ours, theirs.anchor())
    finally:
        ours.close()
        theirs.close()


def test_an_inherited_kernel_is_re_verified_rather_than_trusted(tmp_path):
    ours = institution(tmp_path, "ours")
    theirs = institution(tmp_path, "theirs")
    try:
        with pytest.raises(InstitutionIdentityError, match="not the expected institution"):
            build(theirs, ours.anchor())
    finally:
        ours.close()
        theirs.close()


def test_a_refused_controller_never_reaches_admission(tmp_path):
    """The refusal is at construction, so nothing downstream can be attempted."""
    ours = institution(tmp_path, "ours")
    theirs = institution(tmp_path, "theirs")
    before = len(ours.events("main"))
    try:
        with pytest.raises(InstitutionIdentityError):
            build(ours, theirs.anchor())
        assert len(ours.events("main")) == before
    finally:
        ours.close()
        theirs.close()
