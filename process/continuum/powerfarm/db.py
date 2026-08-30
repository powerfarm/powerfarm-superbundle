from __future__ import annotations

import os
import sqlite3
from pathlib import Path

SCHEMA_VERSION = 3
APP_ID = 0x50464333  # "PFC3"
LEGACY_APP_ID_V2 = 0x50464332  # "PFC2"

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES branches(id),
    fork_event_id TEXT,
    created_at TEXT NOT NULL,
    label TEXT,
    canonical INTEGER NOT NULL DEFAULT 0 CHECK(canonical IN (0, 1)),
    seal TEXT NOT NULL CHECK(length(seal) = 64),
    CHECK(parent_id IS NULL OR parent_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_canonical_branch
    ON branches(canonical) WHERE canonical = 1;

CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_index INTEGER NOT NULL CHECK(branch_index > 0),
    id TEXT NOT NULL UNIQUE,
    branch_id TEXT NOT NULL REFERENCES branches(id),
    request_id TEXT,
    recorded_at TEXT NOT NULL,
    effective_at TEXT NOT NULL,
    actor TEXT NOT NULL,
    office TEXT NOT NULL,
    kind TEXT NOT NULL,
    subject TEXT NOT NULL,
    payload TEXT NOT NULL CHECK(json_valid(payload) AND json_type(payload) = 'object'),
    causes TEXT NOT NULL CHECK(json_valid(causes) AND json_type(causes) = 'array'),
    authority_ref TEXT NOT NULL,
    intent_hash TEXT NOT NULL CHECK(length(intent_hash) = 64),
    prev_hash TEXT NOT NULL CHECK(length(prev_hash) = 64),
    hash TEXT NOT NULL UNIQUE CHECK(length(hash) = 64),
    seal TEXT NOT NULL CHECK(length(seal) = 64),
    UNIQUE(branch_id, branch_index),
    UNIQUE(branch_id, request_id),
    UNIQUE(branch_id, prev_hash)
);

CREATE INDEX IF NOT EXISTS idx_events_branch_index ON events(branch_id, branch_index);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
CREATE INDEX IF NOT EXISTS idx_events_subject ON events(subject);
CREATE INDEX IF NOT EXISTS idx_events_recorded_at ON events(recorded_at);
CREATE INDEX IF NOT EXISTS idx_events_effective_at ON events(effective_at);

CREATE TABLE IF NOT EXISTS event_signatures (
    event_id TEXT NOT NULL REFERENCES events(id),
    key_id TEXT NOT NULL CHECK(length(key_id) = 64),
    signer TEXT NOT NULL,
    office TEXT NOT NULL,
    algorithm TEXT NOT NULL CHECK(algorithm = 'ES256'),
    jwk TEXT NOT NULL CHECK(json_valid(jwk) AND json_type(jwk) = 'object'),
    statement_digest TEXT NOT NULL CHECK(length(statement_digest) = 64),
    signature TEXT NOT NULL,
    signed_at TEXT NOT NULL,
    PRIMARY KEY(event_id, key_id)
);

CREATE INDEX IF NOT EXISTS idx_event_signatures_key ON event_signatures(key_id, event_id);
"""


def _configure(db: sqlite3.Connection, *, read_only: bool) -> None:
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 10000")
    db.execute("PRAGMA trusted_schema = OFF")
    db.execute("PRAGMA recursive_triggers = OFF")
    if read_only:
        db.execute("PRAGMA query_only = ON")
    else:
        db.execute("PRAGMA journal_mode = WAL")
        db.execute("PRAGMA synchronous = FULL")
        db.execute("PRAGMA secure_delete = ON")
        db.execute("PRAGMA wal_autocheckpoint = 1000")


def _harden_runtime(db: sqlite3.Connection) -> None:
    # Disable SQLite features this kernel never needs. Use getattr so the
    # hardening remains compatible with Python 3.11, where some dbconfig
    # constants/methods are not exposed yet.
    config_names = [
        ("SQLITE_DBCONFIG_DEFENSIVE", True),
        ("SQLITE_DBCONFIG_TRUSTED_SCHEMA", False),
        ("SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION", False),
        ("SQLITE_DBCONFIG_ENABLE_TRIGGER", False),
        ("SQLITE_DBCONFIG_DQS_DDL", False),
        ("SQLITE_DBCONFIG_DQS_DML", False),
        ("SQLITE_DBCONFIG_ENABLE_FKEY", True),
    ]
    setconfig = getattr(db, "setconfig", None)
    if setconfig is not None:
        for name, enabled in config_names:
            option = getattr(sqlite3, name, None)
            if option is None:
                continue
            try:
                setconfig(option, enabled)
            except (AttributeError, sqlite3.NotSupportedError):
                pass

    limit_specs = [
        ("SQLITE_LIMIT_LENGTH", 2 * 1024 * 1024),
        ("SQLITE_LIMIT_SQL_LENGTH", 1024 * 1024),
        ("SQLITE_LIMIT_ATTACHED", 0),
        ("SQLITE_LIMIT_COLUMN", 256),
        ("SQLITE_LIMIT_COMPOUND_SELECT", 32),
        ("SQLITE_LIMIT_EXPR_DEPTH", 128),
        ("SQLITE_LIMIT_FUNCTION_ARG", 64),
        ("SQLITE_LIMIT_LIKE_PATTERN_LENGTH", 4096),
        ("SQLITE_LIMIT_TRIGGER_DEPTH", 0),
        ("SQLITE_LIMIT_VARIABLE_NUMBER", 256),
        ("SQLITE_LIMIT_WORKER_THREADS", 0),
    ]
    setlimit = getattr(db, "setlimit", None)
    if setlimit is not None:
        for name, limit in limit_specs:
            category = getattr(sqlite3, name, None)
            if category is None:
                continue
            try:
                setlimit(category, limit)
            except (AttributeError, sqlite3.NotSupportedError):
                pass


def connect(path: str | Path, *, read_only: bool = False) -> sqlite3.Connection:
    resolved = Path(path)
    if read_only:
        if not resolved.exists():
            raise FileNotFoundError(resolved)
        uri = f"file:{resolved.resolve().as_posix()}?mode=ro"
        db = sqlite3.connect(uri, uri=True, check_same_thread=False, isolation_level=None, timeout=10.0)
    else:
        resolved.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(str(resolved), check_same_thread=False, isolation_level=None, timeout=10.0)
    _configure(db, read_only=read_only)
    return db


def open_database(path: str | Path, *, read_only: bool = False) -> sqlite3.Connection:
    db = connect(path, read_only=read_only)
    if read_only:
        version = int(db.execute("PRAGMA user_version").fetchone()[0])
        if version != SCHEMA_VERSION:
            db.close()
            raise RuntimeError(f"unsupported database schema version {version}; expected {SCHEMA_VERSION}")
        application_id = int(db.execute("PRAGMA application_id").fetchone()[0])
        if application_id != APP_ID:
            db.close()
            raise RuntimeError("database application_id does not identify Powerfarm Continuum v0.3")
        _harden_runtime(db)
        return db

    version = int(db.execute("PRAGMA user_version").fetchone()[0])
    if version not in (0, 2, SCHEMA_VERSION):
        db.close()
        raise RuntimeError(f"unsupported database schema version {version}; expected {SCHEMA_VERSION}")
    existing_events = db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='events'"
    ).fetchone()
    if version == 0 and existing_events is not None:
        columns = {str(row[1]) for row in db.execute("PRAGMA table_info(events)").fetchall()}
        if "seal" not in columns or "branch_index" not in columns:
            db.close()
            raise RuntimeError("legacy pre-v2 Continuum database detected; export/recreate it before using v0.3")
    application_id_before = int(db.execute("PRAGMA application_id").fetchone()[0])
    if version == 2 and application_id_before != LEGACY_APP_ID_V2:
        db.close()
        raise RuntimeError("schema v2 database does not identify Powerfarm Continuum v0.2")
    db.executescript(SCHEMA)
    if version == 2:
        db.execute(
            "UPDATE metadata SET value='powerfarm-continuum/v3' "
            "WHERE key='format' AND value='powerfarm-continuum/v2'"
        )
    if version in (0, 2):
        db.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        db.execute(f"PRAGMA application_id = {APP_ID}")
    application_id = int(db.execute("PRAGMA application_id").fetchone()[0])
    if application_id != APP_ID:
        db.close()
        raise RuntimeError("database application_id does not identify Powerfarm Continuum v0.3")
    db.commit()
    _harden_runtime(db)

    try:
        os.chmod(Path(path), 0o600)
    except OSError:
        pass
    return db
