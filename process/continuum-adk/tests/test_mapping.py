from __future__ import annotations

import pytest

from continuum_adk import DottedToolPolicy, MappingError, ToolMapping, kindify, subject_token
from continuum_adk.mapping import UNSPECIFIED


def test_default_projection_keeps_tools_distinguishable():
    policy = DottedToolPolicy()
    a = policy.project("search", {})
    b = policy.project("deploy", {})
    assert a.kind != b.kind
    assert a.kind == "tool.invoke.search"
    assert a.subject == "tool:search"


def test_strict_policy_requires_explicit_mapping():
    with pytest.raises(MappingError):
        DottedToolPolicy(strict=True).project("search", {})


def test_tool_names_are_coerced_into_continuum_kind_grammar():
    assert DottedToolPolicy().project("Read_Doc V2!", {}).kind == "tool.invoke.read_doc-v2"


def test_placeholder_token_is_readable_and_collision_resistant():
    policy = DottedToolPolicy({"read_doc": ToolMapping(kind="tool.invoke.read-doc", subject="doc:{doc_id}")})
    projection = policy.project("read_doc", {"doc_id": "RFC-42"})
    assert projection.subject.startswith("doc:rfc-42~")
    assert len(projection.subject.rsplit("~", 1)[1]) == 16


def test_lossy_normalizations_do_not_collide():
    assert subject_token("prod/db") != subject_token("prod db")
    assert subject_token("a" * 500) != subject_token("a" * 499 + "b")


def test_strict_missing_placeholder_is_refused():
    policy = DottedToolPolicy({"read_doc": ToolMapping(kind="tool.invoke.read-doc", subject="doc:{doc_id}")}, strict=True)
    with pytest.raises(MappingError):
        policy.project("read_doc", {})


def test_lenient_missing_placeholder_is_explicit():
    policy = DottedToolPolicy({"read_doc": ToolMapping(kind="tool.invoke.read-doc", subject="doc:{doc_id}")})
    assert policy.project("read_doc", {}).subject == f"doc:{UNSPECIFIED}"


def test_kindify_never_returns_empty():
    assert kindify("!!!") == "unnamed"
    assert kindify("") == "unnamed"
