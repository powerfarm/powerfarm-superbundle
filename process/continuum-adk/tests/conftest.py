"""Shared fixtures. Real ADK integration tests self-skip when ADK is absent."""

from __future__ import annotations

import importlib.util
import os
import sys
import types

import pytest

ADK_AVAILABLE = importlib.util.find_spec("google.adk") is not None if importlib.util.find_spec("google") else False
os.environ["CONTINUUM_ADK_REAL_ADK"] = "1" if ADK_AVAILABLE else "0"

if not ADK_AVAILABLE:
    google = types.ModuleType("google")
    adk = types.ModuleType("google.adk")
    plugins = types.ModuleType("google.adk.plugins")
    base_plugin = types.ModuleType("google.adk.plugins.base_plugin")
    tools = types.ModuleType("google.adk.tools")
    base_tool = types.ModuleType("google.adk.tools.base_tool")

    class BasePlugin:
        def __init__(self, name: str): self.name = name

    class BaseTool:
        def __init__(self, name: str): self.name = name

    base_plugin.BasePlugin = BasePlugin
    base_tool.BaseTool = BaseTool
    sys.modules.update({
        "google": google,
        "google.adk": adk,
        "google.adk.plugins": plugins,
        "google.adk.plugins.base_plugin": base_plugin,
        "google.adk.tools": tools,
        "google.adk.tools.base_tool": base_tool,
    })

from powerfarm.kernel import Kernel
from governance import Grant, provision_office


@pytest.fixture
def kernel(tmp_path) -> Kernel:
    k = Kernel(str(tmp_path / "institution.db"), identity_mode="embedded-test")
    k.init("director-human")
    provision_office(
        k,
        "research",
        mandate="Investigate and report",
        principal="agent:researcher",
        grants=[
            Grant(action="tool.invoke.search", subject="tool:search"),
            Grant(action="tool.invoke.read-doc", subject="doc:*"),
        ],
        director="director-human",
    )
    yield k
    k.close()


@pytest.fixture
def bare_kernel(tmp_path) -> Kernel:
    k = Kernel(str(tmp_path / "bare.db"), identity_mode="embedded-test")
    k.init("director-human")
    provision_office(
        k,
        "research",
        mandate="Investigate",
        principal="agent:researcher",
        grants=[],
        director="director-human",
    )
    yield k
    k.close()
