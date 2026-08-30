from __future__ import annotations

import os
import stat
from pathlib import Path
from typing import Any

from powerfarm.kernel import Kernel


def _mode(path: Path) -> str | None:
    try:
        return oct(stat.S_IMODE(path.stat().st_mode))
    except OSError:
        return None


def doctor(kernel: Kernel) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    def add(name: str, ok: bool, detail: Any) -> None:
        checks.append({"check": name, "ok": bool(ok), "detail": detail})

    db_path = kernel.path
    key_path = kernel.key_path
    add("database_exists", db_path.is_file(), str(db_path))
    add("database_permissions", _mode(db_path) in {"0o600", "0o400"}, _mode(db_path))
    add("seal_key_exists", key_path.is_file(), str(key_path))
    add("seal_key_permissions", _mode(key_path) in {"0o600", "0o400"}, _mode(key_path))
    if os.name == "posix" and key_path.exists():
        add("seal_key_not_group_world_readable", (key_path.stat().st_mode & 0o077) == 0, _mode(key_path))

    with kernel._read_snapshot():
        integrity = kernel.db.execute("PRAGMA integrity_check").fetchone()
        add("sqlite_integrity", bool(integrity and integrity[0] == "ok"), integrity[0] if integrity else None)
        fk = kernel.db.execute("PRAGMA foreign_key_check").fetchall()
        add("foreign_keys", not fk, len(fk))
        trusted = kernel.db.execute("PRAGMA trusted_schema").fetchone()
        add("trusted_schema_off", bool(trusted and int(trusted[0]) == 0), trusted[0] if trusted else None)
        audit = kernel.audit()
        add("institutional_audit", bool(audit["ok"]), audit["errors"][:10])
        main = kernel.head("main")
        add("main_has_head", bool(main.get("head")) and int(main.get("events", 0)) > 0, main)

    return {
        "ok": all(item["ok"] for item in checks),
        "checks": checks,
        "database": str(db_path),
        "seal_key": str(key_path),
    }
