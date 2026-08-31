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
        def __init__(self, database, *, read_only, seal_key_path, registry):
            observed.update(
                database=database,
                read_only=read_only,
                seal_key_path=seal_key_path,
                registry=registry,
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
        "closed": True,
    }
    assert '"initialized": true' in capsys.readouterr().out
