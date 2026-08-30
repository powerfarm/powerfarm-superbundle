from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from pathlib import Path
from typing import Any

from powerfarm.core.files import atomic_write_json, secure_permissions
from powerfarm.core.time import utcnow
from powerfarm.kernel import Kernel

BACKUP_FORMAT = "powerfarm.backup/v1"


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def create_backup(kernel: Kernel, target: str | Path) -> dict[str, Any]:
    """Create a transactionally consistent SQLite backup without copying trust keys."""
    destination = Path(target)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise ValueError("backup target already exists")

    with kernel._read_snapshot():
        audit = kernel.audit()
        if not audit["ok"]:
            raise ValueError("refusing to back up an institution that fails audit")
        out = sqlite3.connect(str(destination), isolation_level=None)
        try:
            kernel.db.backup(out)
            result = out.execute("PRAGMA integrity_check").fetchone()
            if result is None or result[0] != "ok":
                raise ValueError("backup SQLite integrity_check failed")
        finally:
            out.close()
        secure_permissions(destination, 0o600)
        manifest = {
            "format": BACKUP_FORMAT,
            "created_at": utcnow(),
            "institution_id": kernel._institution_id_locked(),
            "database_file": destination.name,
            "database_sha256": sha256_file(destination),
            "database_size": destination.stat().st_size,
            "checkpoint": kernel.checkpoint(),
            "seal_key_included": False,
        }
    manifest_path = destination.with_suffix(destination.suffix + ".manifest.json")
    atomic_write_json(manifest_path, manifest)
    return {**manifest, "manifest_path": str(manifest_path)}


def verify_backup(database: str | Path, manifest: str | Path) -> dict[str, Any]:
    db_path = Path(database)
    manifest_value = json.loads(Path(manifest).read_text(encoding="utf-8"))
    errors: list[str] = []
    if manifest_value.get("format") != BACKUP_FORMAT:
        errors.append("unsupported backup manifest")
    if not db_path.is_file():
        errors.append("database backup does not exist")
    else:
        digest = sha256_file(db_path)
        if digest != manifest_value.get("database_sha256"):
            errors.append("database SHA-256 differs from manifest")
        if db_path.stat().st_size != manifest_value.get("database_size"):
            errors.append("database size differs from manifest")
        try:
            uri = f"file:{db_path.resolve().as_posix()}?mode=ro"
            db = sqlite3.connect(uri, uri=True)
            try:
                result = db.execute("PRAGMA integrity_check").fetchone()
                if result is None or result[0] != "ok":
                    errors.append("SQLite integrity_check failed")
            finally:
                db.close()
        except sqlite3.Error as exc:
            errors.append(f"cannot open backup: {exc}")
    return {
        "ok": not errors,
        "errors": errors,
        "database": str(db_path),
        "database_sha256": sha256_file(db_path) if db_path.is_file() else None,
        "institution_id": manifest_value.get("institution_id"),
        "seal_key_included": bool(manifest_value.get("seal_key_included", False)),
    }
