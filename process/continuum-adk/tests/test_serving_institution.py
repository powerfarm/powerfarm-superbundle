"""A Setting must know which institution it serves before it can act for one.

Negative controls for the ADK startup path. A ContinuumPlugin can admit acts and
cause external effects, so it is a mutable startup path and must declare the
institution it expects rather than trusting whatever Kernel it was handed.

This is continuity of institutional identity. It is not authentication and it is
not Authority; it comes before both.
"""

from __future__ import annotations

import pytest

from continuum_adk import (
    ActorFromAgent,
    ContinuumPlugin,
    DottedToolPolicy,
    ExecutionSliceFromContext,
    StaticOffice,
    ToolMapping,
)
from powerfarm.institution_identity import InstitutionIdentityError
from powerfarm.kernel import Kernel
from governance import Grant, provision_office

POLICY = DottedToolPolicy(
    {"search": ToolMapping(kind="tool.invoke.search", subject="tool:search")},
    strict=True,
)


def institution(tmp_path, name: str) -> Kernel:
    kernel, _ = Kernel.create_institution(
        tmp_path / f"{name}.db", "director-human", identity_mode="embedded-test"
    )
    provision_office(
        kernel, "research", mandate="research", principal="agent:researcher",
        grants=[Grant(action="tool.invoke.search", subject="tool:search")],
        director="director-human", with_run_lifecycle=True,
    )
    return kernel


def build(kernel, expect):
    return ContinuumPlugin(
        kernel=kernel,
        expect_institution=expect,
        office=StaticOffice("research"),
        actor=ActorFromAgent(),
        execution_slice=ExecutionSliceFromContext(),
        policy=POLICY,
        revision_ref="build:abc123",
    )


def test_correct_anchor_starts_the_setting(tmp_path):
    kernel = institution(tmp_path, "ours")
    try:
        plugin = build(kernel, kernel.anchor())
        assert plugin.institution == kernel.anchor()
    finally:
        kernel.close()


def test_a_bare_institution_ref_is_accepted_as_an_expectation(tmp_path):
    kernel = institution(tmp_path, "ours")
    try:
        plugin = build(kernel, kernel.anchor().institution_ref)
        assert plugin.institution.institution_ref == kernel.anchor().institution_ref
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


def test_wrong_institution_ref_refuses_before_any_work(tmp_path):
    kernel = institution(tmp_path, "ours")
    try:
        with pytest.raises(InstitutionIdentityError, match="expects institution inst_"):
            build(kernel, "inst_" + "0" * 32)
    finally:
        kernel.close()


def test_a_matching_ref_with_a_different_genesis_still_refuses(tmp_path):
    """Identity is not the name. An anchor carries the genesis for this reason."""
    ours = institution(tmp_path, "ours")
    theirs = institution(tmp_path, "theirs")
    try:
        forged = type(ours.anchor())(
            institution_ref=ours.anchor().institution_ref,
            genesis_ref=theirs.anchor().genesis_ref,
            genesis_digest=theirs.anchor().genesis_digest,
            trust_root_ref=ours.anchor().trust_root_ref,
            protocol_version=ours.anchor().protocol_version,
        )
        with pytest.raises(InstitutionIdentityError, match="genesis"):
            build(ours, forged)
    finally:
        ours.close()
        theirs.close()


def test_an_inherited_kernel_is_re_verified_rather_than_trusted(tmp_path):
    """A parent validating once does not vouch for what it passes down.

    The Setting derives the anchor from the Kernel it was actually handed, so a
    caller that validated one institution and then passed a handle to a different
    one is caught at the Setting, not merely upstream.
    """
    ours = institution(tmp_path, "ours")
    theirs = institution(tmp_path, "theirs")
    try:
        validated_upstream = ours.anchor()          # what the parent checked
        with pytest.raises(InstitutionIdentityError, match="not the expected institution"):
            build(theirs, validated_upstream)       # what the parent actually passed
    finally:
        ours.close()
        theirs.close()
