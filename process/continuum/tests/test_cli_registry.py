from __future__ import annotations

from powerfarm import cli


def _commands() -> set[str]:
    subparsers = next(
        action for action in cli.parser()._actions
        if getattr(action, "choices", None)
    )
    return set(subparsers.choices)


def test_registry_owned_mutations_are_not_exposed_by_process_cli():
    commands = _commands()
    assert "office" not in commands
    assert "occupy" not in commands
    assert "key-register" not in commands
    assert "key-revoke" not in commands


def test_kernel_commands_use_registry_directory_from_environment(monkeypatch, tmp_path, capsys):
    registry = object()
    observed = {}

    class FakeDirectory:
        @classmethod
        def from_env(cls):
            return registry

    class FakeKernel:
        def __init__(self, database, *, read_only, seal_key_path, registry, expect=None, allow_genesis=None):
            observed.update(
                database=database,
                read_only=read_only,
                seal_key_path=seal_key_path,
                registry=registry,
                expect=expect,
                allow_genesis=allow_genesis,
            )
            self.path = database

        def initialized(self):
            return True

        def close(self):
            observed["closed"] = True

    monkeypatch.setattr(cli, "PostgrestRegistryDirectory", FakeDirectory)
    monkeypatch.setattr(cli, "Kernel", FakeKernel)

    cli.main(["--db", str(tmp_path / "institution.db"), "upgrade"])

    assert observed == {
        "database": str(tmp_path / "institution.db"),
        "read_only": False,
        "seal_key_path": None,
        "registry": registry,
        "expect": None,
        "allow_genesis": None,
        "closed": True,
    }
    assert '"initialized": true' in capsys.readouterr().out


def test_pinned_invocations_carry_the_expected_institution_into_the_kernel(monkeypatch, tmp_path, capsys):
    """--expect-institution must actually reach the kernel.

    The refusal lives in the kernel, so a CLI that accepted the flag and dropped
    it would look correct and protect nothing.
    """
    observed = {}

    class FakeDirectory:
        @classmethod
        def from_env(cls):
            return object()

    class FakeKernel:
        def __init__(self, database, *, read_only, seal_key_path, registry, expect=None, allow_genesis=None):
            observed.update(expect=expect, allow_genesis=allow_genesis)
            self.path = database

        def initialized(self):
            return True

        def close(self):
            pass

    monkeypatch.setattr(cli, "PostgrestRegistryDirectory", FakeDirectory)
    monkeypatch.setattr(cli, "Kernel", FakeKernel)

    cli.main([
        "--db", str(tmp_path / "institution.db"),
        "--expect-institution", "inst_expected",
        "upgrade",
    ])
    capsys.readouterr()
    assert observed == {"expect": "inst_expected", "allow_genesis": None}


def test_genesis_is_refused_on_a_pinned_invocation(monkeypatch, tmp_path, capsys):
    """Genesis creates an institution. Recovery must never create one."""
    import pytest

    class FakeDirectory:
        @classmethod
        def from_env(cls):
            return object()

    monkeypatch.setattr(cli, "PostgrestRegistryDirectory", FakeDirectory)

    with pytest.raises(SystemExit, match="cannot be combined with init"):
        cli.main([
            "--db", str(tmp_path / "institution.db"),
            "--expect-institution", "inst_expected",
            "init", "--director", "human-1", "--create-new-institution",
        ])


def test_genesis_requires_an_explicit_ceremony_flag():
    """`init` cannot be reached by an ordinary startup that omits a flag."""
    import pytest

    with pytest.raises(SystemExit):
        cli.parser().parse_args(["--db", "x.db", "init", "--director", "human-1"])

    args = cli.parser().parse_args(
        ["--db", "x.db", "init", "--director", "human-1", "--create-new-institution"]
    )
    assert args.create_new_institution is True


def test_the_cli_exposes_create_open_and_restore_as_distinct_verbs():
    commands = _commands()
    assert "init" in commands       # CREATE, gated behind --create-new-institution
    assert "restore" in commands    # RESTORE, never runs genesis
    assert "anchor" in commands     # the value an OPEN must present
