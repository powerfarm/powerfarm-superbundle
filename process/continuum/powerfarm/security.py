from __future__ import annotations

import hashlib
import hmac
import os
import stat
from pathlib import Path

KEY_BYTES = 32


class SealKeyError(RuntimeError):
    pass


def default_key_path(db_path: str | Path) -> Path:
    return Path(f"{Path(db_path)}.sealkey")


def _check_key_file(path: Path) -> None:
    st = path.lstat()
    if stat.S_ISLNK(st.st_mode):
        raise SealKeyError(f"refusing symlink seal key: {path}")
    if not stat.S_ISREG(st.st_mode):
        raise SealKeyError(f"seal key is not a regular file: {path}")
    if os.name == "posix" and (st.st_mode & 0o077):
        raise SealKeyError(f"seal key permissions must be 0600: {path}")


def load_seal_key(path: Path) -> bytes:
    if not path.exists():
        raise SealKeyError(f"missing seal key: {path}")
    _check_key_file(path)
    data = path.read_bytes()
    if len(data) != KEY_BYTES:
        raise SealKeyError(f"seal key must be exactly {KEY_BYTES} bytes")
    return data


def load_or_create_seal_key(path: Path) -> bytes:
    try:
        return load_seal_key(path)
    except SealKeyError:
        if path.exists():
            raise

    path.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    key = os.urandom(KEY_BYTES)
    try:
        fd = os.open(path, flags, 0o600)
    except FileExistsError:
        return load_seal_key(path)
    try:
        with os.fdopen(fd, "wb", closefd=True) as fh:
            fh.write(key)
            fh.flush()
            os.fsync(fh.fileno())
    except Exception:
        try:
            path.unlink(missing_ok=True)
        finally:
            raise
    _check_key_file(path)
    if os.name == "posix":
        try:
            dir_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except OSError:
            pass
    return key


def key_id(key: bytes) -> str:
    return hashlib.sha256(key).hexdigest()[:24]


def seal(key: bytes, institution_id: str, domain: str, digest: str) -> str:
    message = f"powerfarm-continuum/v2\n{institution_id}\n{domain}\n{digest}".encode("utf-8")
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def verify_seal(key: bytes, institution_id: str, domain: str, digest: str, signature: str) -> bool:
    return hmac.compare_digest(seal(key, institution_id, domain, digest), signature)
