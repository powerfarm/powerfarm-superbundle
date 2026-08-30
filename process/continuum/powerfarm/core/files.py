from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


def secure_permissions(path: str | Path, mode: int = 0o600) -> None:
    try:
        os.chmod(Path(path), mode)
    except OSError:
        pass


def _fsync_parent(path: Path) -> None:
    if os.name != "posix":
        return
    try:
        fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    except OSError:
        pass


def atomic_write_bytes(path: str | Path, data: bytes, *, mode: int = 0o600) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb", closefd=True) as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(temporary, target)
        secure_permissions(target, mode)
        _fsync_parent(target)
        return target
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def atomic_write_json(path: str | Path, value: dict[str, Any], *, mode: int = 0o600) -> Path:
    data = (
        json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False)
        + "\n"
    ).encode("utf-8")
    return atomic_write_bytes(path, data, mode=mode)
