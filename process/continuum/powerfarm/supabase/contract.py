from __future__ import annotations

import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "schema-drafts"


def migration_files() -> list[Path]:
    return sorted(ROOT.glob("*.sql"))


def migration_fingerprint() -> str:
    digest = hashlib.sha256()
    for path in migration_files():
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()
