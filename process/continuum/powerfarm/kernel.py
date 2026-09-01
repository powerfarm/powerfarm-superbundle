from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import uuid
from collections import deque
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path
from typing import Any, Iterable, Iterator

from .core.errors import InstitutionalError
from .db import APP_ID, SCHEMA_VERSION, open_database
from .institution_identity import (
    GENESIS_KIND,
    GENESIS_SUBJECT,
    InstitutionAnchor,
    InstitutionIdentityError,
    coerce_expectation,
)
from .model import Event
from .registry import RegistryDirectory
from .projection import (
    authority_ref_valid,
    matching_authority,
    parse_time,
    project,
    reconcile,
)
from .security import (
    SealKeyError,
    default_key_path,
    key_id,
    load_or_create_seal_key,
    load_seal_key,
    seal as make_seal,
    verify_seal,
)
from .crypto.event_signatures import key_binding_at, verify_event_signature
from .crypto.p256 import key_fingerprint, public_key_from_jwk
from .validation import (
    ValidationError,
    normalize_causes,
    normalize_payload,
    normalize_timestamp,
    utcnow,
    validate_branch,
    validate_event_id,
    validate_hash,
    validate_kind,
    validate_label,
    validate_ref,
    validate_request_id,
    validate_scope_pattern,
)

ZERO_HASH = "0" * 64
MAX_GRAPH_NODES = 100_000
IDENTITY_MODE_REGISTRY = "registry"
IDENTITY_MODE_EMBEDDED_TEST = "embedded-test"
IDENTITY_MODE_READ_ONLY = "read-only"


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def row_event(row: sqlite3.Row) -> Event:
    return Event(
        seq=int(row["seq"]),
        branch_index=int(row["branch_index"]),
        id=str(row["id"]),
        branch_id=str(row["branch_id"]),
        request_id=str(row["request_id"]) if row["request_id"] is not None else None,
        recorded_at=str(row["recorded_at"]),
        effective_at=str(row["effective_at"]),
        actor=str(row["actor"]),
        office=str(row["office"]),
        kind=str(row["kind"]),
        subject=str(row["subject"]),
        payload=json.loads(row["payload"]),
        causes=json.loads(row["causes"]),
        authority_ref=str(row["authority_ref"]),
        intent_hash=str(row["intent_hash"]),
        prev_hash=str(row["prev_hash"]),
        hash=str(row["hash"]),
        seal=str(row["seal"]),
    )


class Kernel:
    def __init__(
        self,
        path: str | Path,
        *,
        read_only: bool = False,
        seal_key_path: str | Path | None = None,
        registry: RegistryDirectory | None = None,
        identity_mode: str | None = None,
        expect: Any = None,
        allow_genesis: bool | None = None,
    ):
        self.path = Path(path)
        self.read_only = read_only
        # Genesis creates an institution. Recovery must never create one.
        #
        # A handle that names the institution it expects is by definition an
        # operational handle, not a founding one, so it can never run genesis.
        # Losing the store then produces a refusal instead of a second
        # institution wearing the first one's name.
        self._expect = coerce_expectation(expect)
        self._allow_genesis = (self._expect is None) if allow_genesis is None else bool(allow_genesis)
        if self._expect is not None and self._allow_genesis:
            raise InstitutionIdentityError(
                "a Kernel that expects a specific institution cannot also be authorized to create one"
            )
        if identity_mode is None:
            if registry is not None:
                identity_mode = IDENTITY_MODE_REGISTRY
            elif read_only:
                identity_mode = IDENTITY_MODE_READ_ONLY
            else:
                raise InstitutionalError(
                    "writable Continuum Kernel requires a RegistryDirectory; "
                    "tests that intentionally exercise the retired embedded directory must pass "
                    "identity_mode='embedded-test' explicitly"
                )
        if identity_mode not in {IDENTITY_MODE_REGISTRY, IDENTITY_MODE_EMBEDDED_TEST, IDENTITY_MODE_READ_ONLY}:
            raise ValueError(f"unsupported identity_mode: {identity_mode}")
        if identity_mode == IDENTITY_MODE_REGISTRY and registry is None:
            raise InstitutionalError("identity_mode='registry' requires a RegistryDirectory")
        if identity_mode == IDENTITY_MODE_EMBEDDED_TEST and registry is not None:
            raise ValueError("identity_mode='embedded-test' cannot be combined with RegistryDirectory")
        if identity_mode == IDENTITY_MODE_READ_ONLY and not read_only:
            raise ValueError("identity_mode='read-only' is only valid for read-only Kernel handles")
        self.identity_mode = identity_mode
        self.registry = registry
        self.key_path = Path(seal_key_path) if seal_key_path is not None else default_key_path(self.path)
        self._lock = threading.RLock()
        try:
            self.db = open_database(self.path, read_only=read_only)
        except (OSError, sqlite3.Error, RuntimeError) as exc:
            raise InstitutionalError(f"cannot open institution database: {exc}") from exc
        self._key: bytes | None = None
        try:
            self._load_security_if_initialized()
            if self._expect is not None:
                self._assert_expected_institution()
        except Exception:
            self.db.close()
            raise

    def close(self) -> None:
        with self._lock:
            self.db.close()

    def _metadata_locked(self, key: str) -> str | None:
        row = self.db.execute("SELECT value FROM metadata WHERE key=?", (key,)).fetchone()
        return str(row[0]) if row is not None else None

    def _load_security_if_initialized(self) -> None:
        with self._lock:
            main = self.db.execute("SELECT 1 FROM branches WHERE id='main'").fetchone()
            if main is None:
                return
            institution_id = self._metadata_locked("institution_id")
            expected_key_id = self._metadata_locked("seal_key_id")
            if not institution_id or not expected_key_id:
                raise InstitutionalError("institution metadata is incomplete")
            try:
                key = load_seal_key(self.key_path)
            except SealKeyError as exc:
                raise InstitutionalError(str(exc)) from exc
            if key_id(key) != expected_key_id:
                raise InstitutionalError("seal key fingerprint does not match institution metadata")
            self._key = key

    def _institution_id_locked(self) -> str:
        value = self._metadata_locked("institution_id")
        if not value:
            raise InstitutionalError("institution has no identity metadata")
        return value

    def _require_key_locked(self) -> bytes:
        if self._key is None:
            raise InstitutionalError("institution seal key is unavailable")
        return self._key

    def _ensure_writable(self) -> None:
        if self.read_only:
            raise InstitutionalError("kernel is opened read-only")

    @contextmanager
    def _read_snapshot(self) -> Iterator[None]:
        """Hold one SQLite snapshot across a compound read.

        This prevents audit/projection/checkpoint operations from observing a
        mix of commits when another process writes to the WAL concurrently.
        Nested reads inside an existing read/write transaction reuse it.
        """
        with self._lock:
            started = not self.db.in_transaction
            if started:
                self.db.execute("BEGIN")
            try:
                yield
            finally:
                if started and self.db.in_transaction:
                    self.db.execute("ROLLBACK")

    @contextmanager
    def _write_transaction(self) -> Iterator[None]:
        self._ensure_writable()
        with self._lock:
            try:
                self.db.execute("BEGIN IMMEDIATE")
            except sqlite3.Error as exc:
                raise InstitutionalError(f"cannot acquire institutional write lock: {exc}") from exc
            try:
                yield
            except Exception:
                self.db.execute("ROLLBACK")
                raise
            else:
                self.db.execute("COMMIT")

    def initialized(self) -> bool:
        with self._read_snapshot():
            row = self.db.execute("SELECT 1 FROM branches WHERE id='main'").fetchone()
            return row is not None

    def _branch_body(
        self,
        *,
        branch_id: str,
        parent_id: str | None,
        fork_event_id: str | None,
        created_at: str,
        label: str | None,
        canonical: int,
    ) -> dict[str, Any]:
        return {
            "id": branch_id,
            "parent_id": parent_id,
            "fork_event_id": fork_event_id,
            "created_at": created_at,
            "label": label,
            "canonical": canonical,
        }

    def _seal_digest_locked(self, domain: str, digest: str) -> str:
        return make_seal(
            self._require_key_locked(),
            self._institution_id_locked(),
            domain,
            digest,
        )



    # ---- CREATE / OPEN / RESTORE ------------------------------------------
    #
    # `init()` used to mean all three at once, which is why losing a store could
    # be mistaken for founding one. They are now separate verbs with separate
    # preconditions.

    @classmethod
    def create_institution(
        cls,
        path: str | Path,
        director_principal: str,
        mandate: str = "Direction, legitimacy, and commitments",
        *,
        root_office: str = "director",
        **kwargs: Any,
    ) -> tuple["Kernel", InstitutionAnchor]:
        """CREATE: the genesis ceremony. Founds one institution, once.

        Refuses a store that already holds an institution. Returns the anchor,
        which is the value every later OPEN must present. Nothing else in the
        system may reach this path implicitly.
        """
        kernel = cls(path, allow_genesis=True, **kwargs)
        try:
            if kernel.initialized():
                raise InstitutionIdentityError(
                    "refusing to create an institution in a store that already holds one; "
                    "open it instead"
                )
            kernel.init(director_principal, mandate, root_office=root_office)
            return kernel, kernel.anchor()
        except Exception:
            kernel.close()
            raise

    @classmethod
    def open_institution(cls, path: str | Path, expect: Any, **kwargs: Any) -> "Kernel":
        """OPEN: attach to one already-existing institution, named in advance.

        Fails closed when the store is empty, when it holds a different
        institution, when its genesis differs, or when its lineage does not
        belong to the expected institution. The returned handle can never run
        genesis.
        """
        if expect is None:
            raise InstitutionIdentityError(
                "open_institution requires the institution it expects; "
                "opening whatever happens to be present is how a substitute store "
                "becomes a second institution"
            )
        return cls(path, expect=expect, **kwargs)

    @classmethod
    def restore_institution(
        cls,
        path: str | Path,
        *,
        bundle: dict[str, Any],
        expect: Any,
        witness: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> "Kernel":
        """RESTORE: rebuild an existing institution. Never runs genesis.

        The bundle supplies the institution; `expect` says which institution it
        is required to be; `witness` — a checkpoint taken from the institution
        before it was lost — proves the restored copy continues the last
        witnessed state rather than merely carrying its name.

        Restoring without a witness is permitted and is honestly weaker: it
        proves identity, not currency. A stale copy is only detectable against a
        later witness, so pass one whenever one exists.
        """
        from .bundle.verifier import verify_bundle

        expected = coerce_expectation(expect)
        if expected is None:
            raise InstitutionIdentityError("restore_institution requires the institution it expects")

        verification = verify_bundle(bundle)
        if not verification["ok"]:
            raise InstitutionIdentityError(
                "refusing to restore from a bundle that does not verify: " + "; ".join(verification["errors"])
            )

        kernel = cls(path, allow_genesis=False, **kwargs)
        try:
            if kernel.initialized():
                raise InstitutionIdentityError(
                    "refusing to restore into a store that already holds an institution"
                )
            kernel._restore_from_bundle(bundle)
            kernel._expect = expected
            kernel._load_security_if_initialized()
            kernel._assert_expected_institution()
            if witness is not None:
                kernel.assert_continuity(witness)
            return kernel
        except Exception:
            kernel.close()
            raise

    def _restore_from_bundle(self, bundle: dict[str, Any]) -> None:
        """Reinstate branches, events and signatures exactly as exported.

        This writes the ledger back verbatim. It deliberately does not mint an
        act of any kind: restoring an institution is not an event in its own
        history.
        """
        metadata = bundle.get("metadata")
        branches = bundle.get("branches")
        events = bundle.get("events")
        if not isinstance(metadata, dict) or not isinstance(branches, list) or not isinstance(events, list):
            raise InstitutionIdentityError("bundle is not restorable: missing metadata, branches or events")
        signatures = bundle.get("signatures") or []
        with self._write_transaction():
            self.db.executemany(
                "INSERT INTO metadata(key,value) VALUES(?,?)",
                [(str(key), str(value)) for key, value in sorted(metadata.items())],
            )
            for branch in sorted(branches, key=lambda item: (item.get("parent_id") is not None, str(item.get("id")))):
                self.db.execute(
                    "INSERT INTO branches(id,parent_id,fork_event_id,created_at,label,canonical,seal) VALUES(?,?,?,?,?,?,?)",
                    (
                        str(branch["id"]), branch.get("parent_id"), branch.get("fork_event_id"),
                        str(branch["created_at"]), branch.get("label"), int(branch.get("canonical", 0)),
                        str(branch["seal"]),
                    ),
                )
            for event in sorted(events, key=lambda item: int(item["seq"])):
                self.db.execute(
                    "INSERT INTO events(seq,branch_index,id,branch_id,request_id,recorded_at,effective_at,"
                    "actor,office,kind,subject,payload,causes,authority_ref,intent_hash,prev_hash,hash,seal) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        int(event["seq"]), int(event["branch_index"]), str(event["id"]), str(event["branch_id"]),
                        event.get("request_id"), str(event["recorded_at"]), str(event["effective_at"]),
                        str(event["actor"]), str(event["office"]), str(event["kind"]), str(event["subject"]),
                        canonical_json(event["payload"]), canonical_json(event["causes"]),
                        str(event["authority_ref"]), str(event["intent_hash"]), str(event["prev_hash"]),
                        str(event["hash"]), str(event["seal"]),
                    ),
                )
            for signature in signatures:
                self.db.execute(
                    "INSERT INTO event_signatures(event_id,key_id,signer,office,algorithm,jwk,statement_digest,signature,signed_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?)",
                    (
                        str(signature["event_id"]), str(signature["key_id"]), str(signature["signer"]),
                        str(signature["office"]), str(signature.get("algorithm", "ES256")),
                        canonical_json(signature["jwk"]), str(signature["statement_digest"]),
                        str(signature["signature"]), str(signature["signed_at"]),
                    ),
                )

    # ---- institutional identity -------------------------------------------
    #
    #   Genesis creates an institution. Recovery must never create one.

    def _genesis_event_locked(self) -> Event | None:
        row = self.db.execute(
            "SELECT * FROM events WHERE branch_id='main' AND kind=? AND subject=? ORDER BY branch_index LIMIT 1",
            (GENESIS_KIND, GENESIS_SUBJECT),
        ).fetchone()
        return row_event(row) if row is not None else None

    def _anchor_locked(self) -> InstitutionAnchor:
        """Derive this store's institutional anchor from the ledger itself.

        Derived rather than read from a metadata column on purpose: the genesis
        act is the fact, and a metadata row is only a cache of it. Anything that
        rewrote metadata alone would still be caught here.
        """
        if self.db.execute("SELECT 1 FROM branches WHERE id='main'").fetchone() is None:
            raise InstitutionIdentityError("store holds no institution: there is no main branch")
        genesis = self._genesis_event_locked()
        if genesis is None:
            raise InstitutionIdentityError("store holds no institution: there is no genesis act")
        institution_ref = self._metadata_locked("institution_id")
        trust_root = self._metadata_locked("seal_key_id")
        protocol = self._metadata_locked("format")
        if not institution_ref or not trust_root or not protocol:
            raise InstitutionIdentityError("institution metadata is incomplete")
        return InstitutionAnchor(
            institution_ref=institution_ref,
            genesis_ref=genesis.id,
            genesis_digest=genesis.hash,
            trust_root_ref=trust_root,
            protocol_version=protocol,
        )

    def anchor(self) -> InstitutionAnchor:
        """This institution's location-independent identity.

        Carries nothing physical. The store may move between files, hosts or
        engines without changing a single field.
        """
        with self._read_snapshot():
            return self._anchor_locked()

    def _assert_expected_institution(self) -> None:
        """Fail closed unless this store holds exactly the expected institution."""
        expected = self._expect
        if expected is None:
            return
        with self._lock:
            if self.db.execute("SELECT 1 FROM branches WHERE id='main'").fetchone() is None:
                raise InstitutionIdentityError(
                    "refusing to open an empty store as an existing institution: "
                    "an empty store is not authorization to bootstrap. Use an explicit "
                    "create or restore operation."
                )
            actual = self._anchor_locked()
            if isinstance(expected, str):
                if actual.institution_ref != expected:
                    raise InstitutionIdentityError(
                        f"store holds institution {actual.institution_ref}, not the expected {expected}"
                    )
                return
            reasons = expected.differences(actual)
            if reasons:
                raise InstitutionIdentityError(
                    "store does not hold the expected institution: " + "; ".join(reasons)
                )

    def assert_continuity(self, checkpoint: dict[str, Any]) -> dict[str, Any]:
        """Prove this store continues the last witnessed state, not merely its name.

        A stale copy carries the right `institution_ref` and the right genesis and
        is still the wrong institution to run: it has lost everything admitted
        after the witness. `verify_checkpoint` already answers exactly that
        question — every anchored head must still be in the current history — so
        continuity reuses it rather than inventing a second witness mechanism.
        """
        result = self.verify_checkpoint(checkpoint)
        if not result["ok"]:
            raise InstitutionIdentityError(
                "store does not demonstrate continuity with the witnessed state: "
                + "; ".join(result["errors"])
            )
        return result

    def init(
        self,
        director_principal: str,
        mandate: str = "Direction, legitimacy, and commitments",
        *,
        root_office: str = "director",
    ) -> Event:
        if not self._allow_genesis:
            raise InstitutionIdentityError(
                "this Kernel is not authorized to create an institution. "
                "Genesis creates an institution; recovery must never create one. "
                "Use Kernel.create_institution() for a deliberate genesis ceremony, or "
                "Kernel.restore_institution() to rebuild an existing one."
            )
        director_principal = validate_ref(director_principal, "director principal", max_len=256)
        root_office = validate_ref(root_office, "root office", max_len=128)
        now_for_registry = utcnow()
        if self.registry is not None:
            if not self.registry.office_exists(root_office, at=now_for_registry):
                raise InstitutionalError(f"Registry does not contain root office {root_office}")
            if not self.registry.occupancy_matches(root_office, director_principal, at=now_for_registry):
                raise InstitutionalError(
                    f"Registry does not bind principal {director_principal} to root office {root_office}"
                )
        payload = normalize_payload({
            "root_office": root_office,
            "principal": director_principal,
            "mandate": str(mandate),
            "identity_source": "registry" if self.identity_mode == IDENTITY_MODE_REGISTRY else "embedded-test-directory",
        })
        with self._write_transaction():
            if self.db.execute("SELECT 1 FROM branches WHERE id='main'").fetchone() is not None:
                raise InstitutionalError("Institution already initialized")
            try:
                self._key = load_or_create_seal_key(self.key_path)
            except SealKeyError as exc:
                raise InstitutionalError(str(exc)) from exc

            now = utcnow()
            institution_id = f"inst_{uuid.uuid4().hex}"
            metadata = {
                "institution_id": institution_id,
                "seal_key_id": key_id(self._require_key_locked()),
                "created_at": now,
                "format": "powerfarm-continuum/v3",
            }
            self.db.executemany(
                "INSERT INTO metadata(key,value) VALUES(?,?)",
                list(metadata.items()),
            )
            branch_body = self._branch_body(
                branch_id="main",
                parent_id=None,
                fork_event_id=None,
                created_at=now,
                label="official",
                canonical=1,
            )
            branch_digest = sha256_json(branch_body)
            branch_seal = self._seal_digest_locked("branch:main", branch_digest)
            self.db.execute(
                "INSERT INTO branches(id,parent_id,fork_event_id,created_at,label,canonical,seal) VALUES(?,?,?,?,?,?,?)",
                ("main", None, None, now, "official", 1, branch_seal),
            )
            return self._append_unchecked_locked(
                branch="main",
                actor=director_principal,
                office=root_office,
                kind="system.genesis",
                subject="institution:powerfarm",
                payload=payload,
                causes=[],
                effective_at=now,
                authority_ref="constitutional:genesis",
                recorded_at=now,
                request_id=None,
            )

    def branch_rows(self) -> list[dict[str, Any]]:
        with self._read_snapshot():
            rows = self.db.execute("SELECT * FROM branches ORDER BY created_at,id").fetchall()
            return [dict(row) for row in rows]

    def _branch_locked(self, branch: str) -> sqlite3.Row:
        row = self.db.execute("SELECT * FROM branches WHERE id=?", (branch,)).fetchone()
        if row is None:
            raise InstitutionalError(f"Unknown branch: {branch}")
        return row

    def _local_event_rows_locked(self, branch: str) -> list[sqlite3.Row]:
        return self.db.execute(
            "SELECT * FROM events WHERE branch_id=? ORDER BY branch_index",
            (branch,),
        ).fetchall()

    def _local_events_locked(self, branch: str) -> list[Event]:
        return [row_event(r) for r in self._local_event_rows_locked(branch)]

    def _event_locked(self, event_id: str) -> Event:
        row = self.db.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
        if row is None:
            raise InstitutionalError(f"Unknown event: {event_id}")
        return row_event(row)

    def _events_locked(self, branch: str, seen: set[str] | None = None) -> list[Event]:
        seen = set() if seen is None else seen
        if branch in seen:
            raise InstitutionalError(f"Branch ancestry cycle detected at {branch}")
        seen.add(branch)
        b = self._branch_locked(branch)
        local = self._local_events_locked(branch)
        parent = b["parent_id"]
        if parent is None:
            seen.remove(branch)
            return local
        parent_events = self._events_locked(str(parent), seen)
        fork_event_id = str(b["fork_event_id"])
        prefix: list[Event] = []
        found = False
        for event in parent_events:
            prefix.append(event)
            if event.id == fork_event_id:
                found = True
                break
        seen.remove(branch)
        if not found:
            raise InstitutionalError(f"Fork point {fork_event_id} is not in parent history")
        return prefix + local

    def events(self, branch: str = "main") -> list[Event]:
        branch = validate_branch(branch)
        with self._read_snapshot():
            return self._events_locked(branch)

    def event(self, event_id: str) -> Event:
        event_id = validate_event_id(event_id)
        with self._read_snapshot():
            return self._event_locked(event_id)

    def state(
        self,
        branch: str = "main",
        effective_at: str | None = None,
        known_at: str | None = None,
    ) -> dict[str, Any]:
        branch = validate_branch(branch)
        effective = normalize_timestamp(effective_at, "effective_at") if effective_at is not None else None
        known = normalize_timestamp(known_at, "known_at") if known_at is not None else None
        with self._read_snapshot():
            return project(self._events_locked(branch), effective, known).public()

    def _head_hash_locked(self, branch: str) -> str:
        row = self.db.execute(
            "SELECT hash FROM events WHERE branch_id=? ORDER BY branch_index DESC LIMIT 1",
            (branch,),
        ).fetchone()
        if row is not None:
            return str(row[0])
        b = self._branch_locked(branch)
        if b["parent_id"] is None:
            return ZERO_HASH
        return self._event_locked(str(b["fork_event_id"])).hash

    def _next_branch_index_locked(self, branch: str) -> int:
        row = self.db.execute(
            "SELECT branch_index FROM events WHERE branch_id=? ORDER BY branch_index DESC LIMIT 1",
            (branch,),
        ).fetchone()
        return 1 if row is None else int(row[0]) + 1

    def head(self, branch: str = "main") -> dict[str, Any]:
        branch = validate_branch(branch)
        with self._read_snapshot():
            self._branch_locked(branch)
            return {
                "branch": branch,
                "head": self._head_hash_locked(branch),
                "local_index": self._next_branch_index_locked(branch) - 1,
                "events": len(self._events_locked(branch)),
            }

    def _next_recorded_at_locked(self, history: list[Event]) -> str:
        now = parse_time(utcnow())
        if history:
            latest = max(parse_time(e.recorded_at) for e in history)
            if now <= latest:
                now = latest + timedelta(microseconds=1)
        return now.isoformat(timespec="microseconds").replace("+00:00", "Z")

    def _authority_for_state(
        self,
        state,
        actor: str,
        office: str,
        kind: str,
        subject: str,
        recorded_at: str,
    ) -> str:
        if self.registry is not None:
            if not self.registry.office_exists(office, at=recorded_at):
                raise InstitutionalError(f"Registry does not contain active office {office}")
            if not self.registry.occupancy_matches(office, actor, at=recorded_at):
                raise InstitutionalError(f"Registry does not bind principal {actor} to office {office}")
        else:
            if office not in state.offices or not state.offices[office].get("active"):
                raise InstitutionalError(f"Office {office} does not exist or is retired")
            occupancy = state.occupancies.get(office)
            if occupancy is None or occupancy.get("principal") != actor:
                raise InstitutionalError(f"Principal {actor} does not occupy office {office}")
        authority = matching_authority(state, office, kind, subject, recorded_at)
        if authority is None:
            raise InstitutionalError(f"Office {office} lacks authority for {kind} on {subject}")
        return authority

    def _continuation_authority_locked(
        self,
        history_by_id: dict[str, Event],
        *,
        actor: str,
        office: str,
        kind: str,
        subject: str,
        causes: list[str],
    ) -> str | None:
        """Return narrowly inherited authority for an already-admitted run.

        A run is institutional work owned by its Office, not by the transient
        principal that happened to start it.  Continuation acts never create a
        new grant.  They may only descend from the exact running subject and
        remain in the same Office.

        ``run.takeover`` allows a new current Registry occupant of the same
        Office to accept custody from ``run.start`` or a prior takeover.
        ``run.resume`` confirms a concrete re-entry after a Heartime reissue.
        Terminal outcomes may descend from the start, takeover, or resume that
        admitted the actor currently reporting the consequence.

        Current occupancy is checked separately before inherited authority is
        accepted, so an old occupant cannot close or resume a run after Registry
        has replaced it.
        """
        if kind not in {"run.takeover", "run.resume", "run.finish", "run.fail"}:
            return None
        for cause_id in causes:
            cause = history_by_id.get(cause_id)
            if cause is None or cause.subject != subject or cause.office != office:
                continue
            if kind == "run.takeover" and cause.kind in {"run.start", "run.takeover"}:
                return f"continuation:{cause.id}"
            if kind == "run.resume" and cause.kind in {"run.start", "run.takeover", "run.resume"} and cause.actor == actor:
                return f"continuation:{cause.id}"
            if kind in {"run.finish", "run.fail"} and cause.kind in {"run.start", "run.takeover", "run.resume"} and cause.actor == actor:
                return f"continuation:{cause.id}"
        return None

    def _append_normalized_locked(
        self,
        *,
        branch: str,
        actor: str,
        office: str,
        kind: str,
        subject: str,
        payload_n: dict[str, Any],
        causes_n: list[str],
        effective_explicit: str | None,
        request_id_n: str | None,
        expected: str | None = None,
    ) -> Event:
        """Append one fully-normalized event inside an existing write transaction."""
        if self.db.execute("SELECT 1 FROM branches WHERE id='main'").fetchone() is None:
            raise InstitutionalError("Institution is not initialized")
        self._branch_locked(branch)

        if request_id_n is not None:
            row = self.db.execute(
                "SELECT * FROM events WHERE branch_id=? AND request_id=?",
                (branch, request_id_n),
            ).fetchone()
            if row is not None:
                existing = row_event(row)
                same = (
                    existing.actor == actor
                    and existing.office == office
                    and existing.kind == kind
                    and existing.subject == subject
                    and existing.payload == payload_n
                    and existing.causes == causes_n
                    and (effective_explicit is None or existing.effective_at == effective_explicit)
                )
                if not same:
                    raise InstitutionalError("request_id already exists with a different institutional intent")
                return existing

        current_head = self._head_hash_locked(branch)
        if expected is not None and current_head != expected:
            raise InstitutionalError(f"stale head: expected {expected}, current {current_head}")

        history = self._events_locked(branch)
        recorded_at = self._next_recorded_at_locked(history)
        effective = effective_explicit or recorded_at
        if history and parse_time(effective) < parse_time(history[0].effective_at):
            raise InstitutionalError("effective_at cannot predate institutional genesis")

        by_id = {e.id: e for e in history}
        missing = [c for c in causes_n if c not in by_id]
        if missing:
            raise InstitutionalError(f"Causes not in branch history: {', '.join(missing)}")
        temporal = [c for c in causes_n if parse_time(by_id[c].effective_at) > parse_time(effective)]
        if temporal:
            raise InstitutionalError(f"causes cannot become effective after their consequence: {', '.join(temporal)}")

        continuation = self._continuation_authority_locked(
            by_id,
            actor=actor,
            office=office,
            kind=kind,
            subject=subject,
            causes=causes_n,
        )
        if continuation is not None:
            # Continuation inherits authority from an already-admitted run, but
            # never inherits stale occupancy.  The current actor must still be
            # the Registry/embedded occupant of the same Office.
            authority_state = project(history, effective_at=recorded_at, recorded_at=recorded_at)
            if self.registry is not None:
                if not self.registry.office_exists(office, at=recorded_at):
                    raise InstitutionalError(f"Registry does not contain active office {office}")
                if not self.registry.occupancy_matches(office, actor, at=recorded_at):
                    raise InstitutionalError(f"Registry does not bind principal {actor} to office {office}")
            else:
                occupancy = authority_state.occupancies.get(office)
                if occupancy is None or occupancy.get("principal") != actor:
                    raise InstitutionalError(f"Principal {actor} does not occupy office {office}")
            authority_ref = continuation
        else:
            authority_state = project(history, effective_at=recorded_at, recorded_at=recorded_at)
            authority_ref = self._authority_for_state(
                authority_state, actor, office, kind, subject, recorded_at,
            )

        semantic_state = project(history, effective_at=effective, recorded_at=recorded_at)
        self._validate_semantics_state(
            semantic_state,
            by_id,
            actor=actor,
            office=office,
            kind=kind,
            subject=subject,
            payload=payload_n,
            causes=causes_n,
            effective_at=effective,
            authority_ref=authority_ref,
        )
        return self._append_unchecked_locked(
            branch=branch,
            actor=actor,
            office=office,
            kind=kind,
            subject=subject,
            payload=payload_n,
            causes=causes_n,
            effective_at=effective,
            authority_ref=authority_ref,
            recorded_at=recorded_at,
            request_id=request_id_n,
        )

    def _normalize_known_payload(self, kind: str, payload: dict[str, Any] | None) -> dict[str, Any]:
        p = normalize_payload(payload)
        if kind == "occupancy.assign" and "principal" in p:
            p["principal"] = validate_ref(str(p["principal"]), "payload.principal", max_len=256)
        if kind == "authority.grant":
            if "grantee_office" in p:
                p["grantee_office"] = validate_ref(str(p["grantee_office"]), "payload.grantee_office", max_len=128)
            p["action"] = validate_scope_pattern(str(p.get("action", "*")), "payload.action")
            p["subject"] = validate_scope_pattern(str(p.get("subject", "*")), "payload.subject")
            if "valid_until" in p:
                p["valid_until"] = normalize_timestamp(str(p["valid_until"]), "payload.valid_until")
        if kind == "authority.revoke" and "grant_id" in p:
            p["grant_id"] = validate_event_id(str(p["grant_id"]))
        if kind == "commitment.open":
            if "owner_office" in p and p["owner_office"] is not None:
                p["owner_office"] = validate_ref(str(p["owner_office"]), "payload.owner_office", max_len=128)
            if "due_at" in p and p["due_at"] is not None:
                p["due_at"] = normalize_timestamp(str(p["due_at"]), "payload.due_at")
        if kind == "run.start":
            if "owner_office" in p and p["owner_office"] is not None:
                p["owner_office"] = validate_ref(str(p["owner_office"]), "payload.owner_office", max_len=128)
            if "capability" in p and p["capability"] is not None:
                p["capability"] = validate_ref(str(p["capability"]), "payload.capability")
        if kind in {"run.takeover", "run.resume"}:
            for field in ("previous_actor", "successor_actor"):
                if field in p and p[field] is not None:
                    p[field] = validate_ref(str(p[field]), f"payload.{field}", max_len=256)
            for field in ("previous_occupancy_ref", "successor_occupancy_ref", "card_ref", "beat_ref", "attempt_ref", "reconciliation_ref"):
                if field in p and p[field] is not None:
                    p[field] = validate_ref(str(p[field]), f"payload.{field}", max_len=256)
        if kind == "artifact.record" and p.get("sha256") is not None:
            p["sha256"] = validate_hash(str(p["sha256"]).lower(), "payload.sha256")
        return normalize_payload(p)

    def append(
        self,
        *,
        branch: str,
        actor: str,
        office: str,
        kind: str,
        subject: str,
        payload: dict[str, Any] | None = None,
        causes: Iterable[str] = (),
        effective_at: str | None = None,
        request_id: str | None = None,
        expected_head: str | None = None,
    ) -> Event:
        branch = validate_branch(branch)
        actor = validate_ref(actor, "actor", max_len=256)
        office = validate_ref(office, "office", max_len=128)
        kind = validate_kind(kind)
        subject = validate_ref(subject, "subject")
        payload_n = self._normalize_known_payload(kind, payload)
        causes_n = normalize_causes(causes)
        request_id_n = validate_request_id(request_id)
        effective_explicit = normalize_timestamp(effective_at, "effective_at") if effective_at is not None else None
        expected = validate_hash(expected_head, "expected_head") if expected_head is not None else None

        with self._write_transaction():
            return self._append_normalized_locked(
                branch=branch,
                actor=actor,
                office=office,
                kind=kind,
                subject=subject,
                payload_n=payload_n,
                causes_n=causes_n,
                effective_explicit=effective_explicit,
                request_id_n=request_id_n,
                expected=expected,
            )

    def append_batch(
        self,
        events: Iterable[dict[str, Any]],
        *,
        branch: str = "main",
        expected_head: str | None = None,
    ) -> list[Event]:
        """Atomically admit a causally-linked group of institutional acts.

        Each item accepts the same fields as :meth:`append` except ``branch``.
        An optional ``alias`` lets later items refer to an earlier event as
        ``"@alias"`` in ``causes``. If any item is refused or invalid, the
        entire batch is rolled back. ``request_id`` idempotency still applies
        per event.
        """
        branch_n = validate_branch(branch)
        expected = validate_hash(expected_head, "expected_head") if expected_head is not None else None
        raw_items = list(events)
        if not raw_items:
            return []

        prepared: list[dict[str, Any]] = []
        aliases_seen: set[str] = set()
        for index, raw in enumerate(raw_items):
            if not isinstance(raw, dict):
                raise ValidationError(f"batch event {index} must be an object")
            alias_raw = raw.get("alias")
            alias = None
            if alias_raw is not None:
                alias = validate_ref(str(alias_raw), f"batch event {index} alias", max_len=64)
                if alias.startswith("@") or alias in aliases_seen:
                    raise ValidationError(f"batch event {index} alias is invalid or duplicated")
                aliases_seen.add(alias)
            raw_causes = list(raw.get("causes", ()))
            for cause in raw_causes:
                if isinstance(cause, str) and cause.startswith("@"):
                    continue
                validate_event_id(str(cause))
            prepared.append({
                "alias": alias,
                "actor": validate_ref(str(raw["actor"]), "actor", max_len=256),
                "office": validate_ref(str(raw["office"]), "office", max_len=128),
                "kind": validate_kind(str(raw["kind"])),
                "subject": validate_ref(str(raw["subject"]), "subject"),
                "payload_n": self._normalize_known_payload(str(raw["kind"]), raw.get("payload")),
                "raw_causes": raw_causes,
                "effective_explicit": (
                    normalize_timestamp(str(raw["effective_at"]), "effective_at")
                    if raw.get("effective_at") is not None else None
                ),
                "request_id_n": validate_request_id(raw.get("request_id")),
            })

        with self._write_transaction():
            if expected is not None and self._head_hash_locked(branch_n) != expected:
                raise InstitutionalError(
                    f"stale head: expected {expected}, current {self._head_hash_locked(branch_n)}"
                )
            aliases: dict[str, str] = {}
            admitted: list[Event] = []
            for index, item in enumerate(prepared):
                resolved_causes: list[str] = []
                for raw_cause in item["raw_causes"]:
                    cause = str(raw_cause)
                    if cause.startswith("@"):
                        name = cause[1:]
                        if name not in aliases:
                            raise InstitutionalError(
                                f"batch event {index} references unknown or forward alias @{name}"
                            )
                        resolved_causes.append(aliases[name])
                    else:
                        resolved_causes.append(cause)
                causes_n = normalize_causes(resolved_causes)
                event = self._append_normalized_locked(
                    branch=branch_n,
                    actor=item["actor"],
                    office=item["office"],
                    kind=item["kind"],
                    subject=item["subject"],
                    payload_n=item["payload_n"],
                    causes_n=causes_n,
                    effective_explicit=item["effective_explicit"],
                    request_id_n=item["request_id_n"],
                    expected=None,
                )
                admitted.append(event)
                if item["alias"] is not None:
                    aliases[item["alias"]] = event.id
            return admitted

    def _validate_semantics_state(
        self,
        state,
        history_by_id: dict[str, Event],
        *,
        actor: str,
        office: str,
        kind: str,
        subject: str,
        payload: dict[str, Any],
        causes: list[str],
        effective_at: str,
        authority_ref: str,
    ) -> None:
        if kind == "system.genesis":
            raise InstitutionalError("system.genesis can only be created by init")

        if self.registry is not None and kind in {
            "office.create", "office.retire", "occupancy.assign", "occupancy.vacate",
            "identity.key.register", "identity.key.revoke",
        }:
            raise InstitutionalError(
                f"{kind} belongs to Registry; Process may only reference Registry identity state"
            )

        if kind == "office.create":
            if not subject.startswith("office:"):
                raise InstitutionalError("office.create requires an office:<id> subject")
            office_id = validate_ref(subject.removeprefix("office:"), "office id", max_len=128)
            if office_id in state.offices:
                raise InstitutionalError("office.create requires a new office")
            if not str(payload.get("mandate", "")).strip():
                raise InstitutionalError("office.create requires a non-empty mandate")

        elif kind == "office.retire":
            if not subject.startswith("office:"):
                raise InstitutionalError("office.retire requires an office:<id> subject")
            office_id = subject.removeprefix("office:")
            if office_id not in state.offices or not state.offices[office_id].get("active"):
                raise InstitutionalError("office.retire requires an active office")
            if office_id == state.root_office:
                raise InstitutionalError("the root office cannot be retired")

        elif kind in {"occupancy.assign", "occupancy.vacate"}:
            if not subject.startswith("office:"):
                raise InstitutionalError("occupancy acts require an office:<id> subject")
            office_id = subject.removeprefix("office:")
            if office_id not in state.offices or not state.offices[office_id].get("active"):
                raise InstitutionalError("occupancy act requires an active office")
            if kind == "occupancy.assign" and not payload.get("principal"):
                raise InstitutionalError("occupancy.assign requires payload.principal")
            if kind == "occupancy.vacate" and office_id == state.root_office:
                raise InstitutionalError("the root office cannot be left vacant")

        elif kind == "authority.grant":
            if office != state.root_office or authority_ref != "constitutional:root":
                raise InstitutionalError("only the root office may issue authority grants in hardened v0.3")
            grantee = str(payload.get("grantee_office", ""))
            if self.registry is not None:
                if not self.registry.office_exists(grantee, at=effective_at):
                    raise InstitutionalError("authority.grant requires a Registry Office")
            elif grantee not in state.offices or not state.offices[grantee].get("active"):
                raise InstitutionalError("authority.grant requires an active grantee_office")
            validate_scope_pattern(str(payload.get("action", "*")), "payload.action")
            validate_scope_pattern(str(payload.get("subject", "*")), "payload.subject")
            until = payload.get("valid_until")
            if until and parse_time(str(until)) <= parse_time(effective_at):
                raise InstitutionalError("authority grant valid_until must be after its effective_at")

        elif kind == "authority.revoke":
            if office != state.root_office or authority_ref != "constitutional:root":
                raise InstitutionalError("only the root office may revoke authority grants in hardened v0.3")
            grant_id = str(payload.get("grant_id", ""))
            grant = state.grants.get(grant_id)
            if not grant or grant.get("revoked"):
                raise InstitutionalError("authority.revoke requires an active grant_id")
            if parse_time(effective_at) < parse_time(str(grant["valid_from"])):
                raise InstitutionalError("authority revocation cannot predate the grant")

        elif kind == "identity.key.register":
            if office != state.root_office or authority_ref != "constitutional:root":
                raise InstitutionalError("only the root office may register institutional signing keys")
            if not subject.startswith("key:"):
                raise InstitutionalError("identity.key.register requires key:<fingerprint> subject")
            key_id = subject.removeprefix("key:")
            validate_hash(key_id, "key fingerprint")
            principal = str(payload.get("principal", ""))
            bound_office = str(payload.get("office", ""))
            jwk = payload.get("jwk")
            if not principal or not bound_office or not isinstance(jwk, dict):
                raise InstitutionalError("identity.key.register requires principal, office, and jwk")
            if bound_office not in state.offices or not state.offices[bound_office].get("active"):
                raise InstitutionalError("signing key office must be active")
            occupancy = state.occupancies.get(bound_office)
            if not occupancy or occupancy.get("principal") != principal:
                raise InstitutionalError("signing key principal must currently occupy the bound office")
            try:
                if key_fingerprint(public_key_from_jwk(jwk)) != key_id:
                    raise InstitutionalError("signing key fingerprint does not match JWK")
            except (ValueError, KeyError) as exc:
                raise InstitutionalError(f"invalid ES256 signing JWK: {exc}") from exc
            for prior in history_by_id.values():
                if prior.kind == "identity.key.register" and prior.subject == subject:
                    raise InstitutionalError("signing key is already registered")

        elif kind == "identity.key.revoke":
            if office != state.root_office or authority_ref != "constitutional:root":
                raise InstitutionalError("only the root office may revoke institutional signing keys")
            key_id = str(payload.get("key_id", subject.removeprefix("key:") if subject.startswith("key:") else ""))
            validate_hash(key_id, "key fingerprint")
            registrations = [e for e in history_by_id.values() if e.kind == "identity.key.register" and e.subject == f"key:{key_id}"]
            revocations = [e for e in history_by_id.values() if e.kind == "identity.key.revoke" and str(e.payload.get("key_id", "")) == key_id]
            if not registrations or revocations:
                raise InstitutionalError("identity.key.revoke requires an active registered key")

        elif kind == "commitment.open":
            if not subject.startswith("commitment:") or subject in state.objects:
                raise InstitutionalError("commitment.open requires a new commitment:<id> subject")
            if not str(payload.get("statement", "")).strip():
                raise InstitutionalError("commitment.open requires payload.statement")
            owner = payload.get("owner_office")
            if owner:
                if self.registry is not None:
                    if not self.registry.office_exists(str(owner), at=effective_at):
                        raise InstitutionalError("commitment owner_office must be an active Registry Office")
                elif owner not in state.offices or not state.offices[str(owner)].get("active"):
                    raise InstitutionalError("commitment owner_office must be active")

        elif kind in {"commitment.resolve", "commitment.cancel"}:
            obj = state.objects.get(subject)
            if not obj or obj.get("type") != "commitment" or obj.get("status") != "open":
                raise InstitutionalError(f"{kind} requires an open commitment")
            if kind == "commitment.resolve" and not causes:
                raise InstitutionalError("commitment.resolve requires causal support")

        elif kind == "run.start":
            if not subject.startswith("run:") or subject in state.objects:
                raise InstitutionalError("run.start requires a new run:<id> subject")
            cap = payload.get("capability")
            if cap:
                obj = state.objects.get(str(cap))
                if not obj or obj.get("type") != "capability" or obj.get("status") != "admitted":
                    raise InstitutionalError(f"Capability {cap} is not admitted")
            owner = payload.get("owner_office")
            if owner:
                if self.registry is not None:
                    if not self.registry.office_exists(str(owner), at=effective_at):
                        raise InstitutionalError("run owner_office must be an active Registry Office")
                elif owner not in state.offices or not state.offices[str(owner)].get("active"):
                    raise InstitutionalError("run owner_office must be active")

        elif kind == "run.takeover":
            obj = state.objects.get(subject)
            if not obj or obj.get("type") != "run" or obj.get("status") != "running":
                raise InstitutionalError("run.takeover requires a running run subject")
            anchors = [history_by_id[c] for c in causes if history_by_id[c].subject == subject and history_by_id[c].kind in {"run.start", "run.takeover"}]
            if not anchors:
                raise InstitutionalError("run.takeover must causally reference the same run start/takeover")
            predecessor = anchors[-1]
            if predecessor.office != office:
                raise InstitutionalError("run.takeover cannot move a run between Offices")
            previous_actor = payload.get("previous_actor")
            successor_actor = payload.get("successor_actor")
            if previous_actor is not None and str(previous_actor) != predecessor.actor:
                raise InstitutionalError("run.takeover previous_actor does not match causal predecessor")
            if successor_actor is not None and str(successor_actor) != actor:
                raise InstitutionalError("run.takeover successor_actor must equal the reporting actor")
            successor_occupancy_ref = payload.get("successor_occupancy_ref")
            if not successor_occupancy_ref:
                raise InstitutionalError("run.takeover requires successor_occupancy_ref")
            if self.registry is not None and hasattr(self.registry, "current_occupancy"):
                current = self.registry.current_occupancy(office, at=effective_at)
                if current is None or current.get("principal") != actor:
                    raise InstitutionalError("run.takeover actor is not the current Registry occupant")
                current_ref = current.get("occupancy_ref")
                if current_ref and str(successor_occupancy_ref) != str(current_ref):
                    raise InstitutionalError("run.takeover successor_occupancy_ref is not current in Registry")

        elif kind == "run.resume":
            obj = state.objects.get(subject)
            if not obj or obj.get("type") != "run" or obj.get("status") != "running":
                raise InstitutionalError("run.resume requires a running run subject")
            anchors = [history_by_id[c] for c in causes if history_by_id[c].subject == subject and history_by_id[c].kind in {"run.start", "run.takeover", "run.resume"}]
            if not anchors:
                raise InstitutionalError("run.resume must causally reference the same run")
            anchor = anchors[-1]
            if anchor.office != office or anchor.actor != actor:
                raise InstitutionalError("run.resume must remain with the admitted current Office occupant")
            if not payload.get("beat_ref") or not payload.get("attempt_ref"):
                raise InstitutionalError("run.resume requires beat_ref and attempt_ref")

        elif kind in {"run.finish", "run.fail"}:
            obj = state.objects.get(subject)
            if not obj or obj.get("type") != "run" or obj.get("status") != "running":
                raise InstitutionalError(f"{kind} requires a running run subject")
            if not causes:
                raise InstitutionalError(f"{kind} requires at least one causal event")
            if not any(history_by_id[c].subject == subject and history_by_id[c].kind in {"run.start", "run.takeover", "run.resume"} for c in causes):
                raise InstitutionalError(f"{kind} must causally reference the same admitted run continuation")

        elif kind == "gap.observe":
            if not subject.startswith("gap:") or subject in state.objects:
                raise InstitutionalError("gap.observe requires a new gap:<id> subject")

        elif kind == "gap.close":
            obj = state.objects.get(subject)
            if not obj or obj.get("type") != "gap" or obj.get("status") != "open":
                raise InstitutionalError("gap.close requires an open gap")

        elif kind == "artifact.record":
            if payload.get("sha256") is not None:
                validate_hash(str(payload["sha256"]), "payload.sha256")

        elif kind == "capability.admit":
            if not subject.startswith("capability:"):
                raise InstitutionalError("capability.admit requires a capability:<id> subject")
            current = state.objects.get(subject)
            if current and current.get("status") == "admitted":
                raise InstitutionalError("capability is already admitted")
            if not isinstance(payload.get("descriptor"), dict):
                raise InstitutionalError("capability.admit requires payload.descriptor object")
            if not causes:
                raise InstitutionalError("capability.admit requires causal support")
            support_prefixes = ("evidence.", "artifact.", "decision.", "claim.", "result.")
            if not any(history_by_id[c].kind.startswith(support_prefixes) for c in causes):
                raise InstitutionalError("capability.admit requires evidence/artifact/decision/claim/result support")

        elif kind == "capability.revoke":
            current = state.objects.get(subject)
            if not current or current.get("type") != "capability" or current.get("status") != "admitted":
                raise InstitutionalError("capability.revoke requires an admitted capability")

    def _event_intent(
        self,
        *,
        actor: str,
        office: str,
        kind: str,
        subject: str,
        payload: dict[str, Any],
        causes: list[str],
        effective_at: str,
    ) -> dict[str, Any]:
        return {
            "actor": actor,
            "office": office,
            "kind": kind,
            "subject": subject,
            "payload": payload,
            "causes": causes,
            "effective_at": effective_at,
        }

    def _event_body(self, event: Event | dict[str, Any]) -> dict[str, Any]:
        get = event.__getattribute__ if isinstance(event, Event) else event.__getitem__
        return {
            "branch_index": get("branch_index"),
            "id": get("id"),
            "branch_id": get("branch_id"),
            "request_id": get("request_id"),
            "recorded_at": get("recorded_at"),
            "effective_at": get("effective_at"),
            "actor": get("actor"),
            "office": get("office"),
            "kind": get("kind"),
            "subject": get("subject"),
            "payload": get("payload"),
            "causes": get("causes"),
            "authority_ref": get("authority_ref"),
            "intent_hash": get("intent_hash"),
            "prev_hash": get("prev_hash"),
        }

    def _append_unchecked_locked(
        self,
        *,
        branch: str,
        actor: str,
        office: str,
        kind: str,
        subject: str,
        payload: dict[str, Any],
        causes: list[str],
        effective_at: str,
        authority_ref: str,
        recorded_at: str,
        request_id: str | None,
    ) -> Event:
        event_id = f"evt_{uuid.uuid4().hex}"
        branch_index = self._next_branch_index_locked(branch)
        prev_hash = self._head_hash_locked(branch)
        intent_hash = sha256_json(self._event_intent(
            actor=actor,
            office=office,
            kind=kind,
            subject=subject,
            payload=payload,
            causes=causes,
            effective_at=effective_at,
        ))
        body = {
            "branch_index": branch_index,
            "id": event_id,
            "branch_id": branch,
            "request_id": request_id,
            "recorded_at": recorded_at,
            "effective_at": effective_at,
            "actor": actor,
            "office": office,
            "kind": kind,
            "subject": subject,
            "payload": payload,
            "causes": causes,
            "authority_ref": authority_ref,
            "intent_hash": intent_hash,
            "prev_hash": prev_hash,
        }
        digest = sha256_json(body)
        event_seal = self._seal_digest_locked(f"event:{event_id}", digest)
        try:
            self.db.execute(
                """INSERT INTO events(
                    branch_index,id,branch_id,request_id,recorded_at,effective_at,actor,office,
                    kind,subject,payload,causes,authority_ref,intent_hash,prev_hash,hash,seal
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    branch_index, event_id, branch, request_id, recorded_at, effective_at,
                    actor, office, kind, subject, canonical_json(payload), canonical_json(causes),
                    authority_ref, intent_hash, prev_hash, digest, event_seal,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise InstitutionalError(f"institutional append conflict: {exc}") from exc
        return self._event_locked(event_id)

    def _resolve_signing_key_binding_locked(self, event: Event, key_id_value: str) -> dict[str, Any] | None:
        if self.registry is not None:
            return self.registry.key_binding(
                key_id_value, event.actor, event.office, at=event.recorded_at
            )
        history = self._events_locked(event.branch_id)
        return key_binding_at(
            history, key_id=key_id_value, principal=event.actor, office=event.office, at_recorded=event.recorded_at
        )

    def signature_rows(self, event_id: str | None = None) -> list[dict[str, Any]]:
        with self._read_snapshot():
            if event_id is None:
                rows = self.db.execute("SELECT * FROM event_signatures ORDER BY event_id,key_id").fetchall()
            else:
                event_id = validate_event_id(event_id)
                rows = self.db.execute("SELECT * FROM event_signatures WHERE event_id=? ORDER BY key_id", (event_id,)).fetchall()
            return [{
                "format": "powerfarm.event-signature/v1",
                "event_id": str(row["event_id"]),
                "key_id": str(row["key_id"]),
                "signer": str(row["signer"]),
                "office": str(row["office"]),
                "algorithm": str(row["algorithm"]),
                "jwk": json.loads(row["jwk"]),
                "statement_digest": str(row["statement_digest"]),
                "signature": str(row["signature"]),
                "signed_at": str(row["signed_at"]),
            } for row in rows]

    def attach_signature(self, signature: dict[str, Any]) -> dict[str, Any]:
        """Attach an ES256 signature after proving its key was institutionally registered."""
        self._ensure_writable()
        event_id = validate_event_id(str(signature.get("event_id", "")))
        key_id_value = validate_hash(str(signature.get("key_id", "")), "signature.key_id")
        with self._write_transaction():
            event = self._event_locked(event_id)
            errors = verify_event_signature(signature, event, institution_id=self._institution_id_locked())
            if errors:
                raise InstitutionalError("invalid event signature: " + "; ".join(errors))
            binding = self._resolve_signing_key_binding_locked(event, key_id_value)
            if binding is None:
                raise InstitutionalError("event signing key was not institutionally registered for actor/office at admission time")
            if canonical_json(binding.get("jwk")) != canonical_json(signature.get("jwk")):
                raise InstitutionalError("event signature JWK differs from registered key")
            try:
                self.db.execute(
                    """INSERT INTO event_signatures(
                        event_id,key_id,signer,office,algorithm,jwk,statement_digest,signature,signed_at
                    ) VALUES(?,?,?,?,?,?,?,?,?)""",
                    (
                        event.id, key_id_value, event.actor, event.office, "ES256",
                        canonical_json(signature["jwk"]), str(signature["statement_digest"]),
                        str(signature["signature"]), normalize_timestamp(str(signature["signed_at"]), "signature.signed_at"),
                    ),
                )
            except sqlite3.IntegrityError as exc:
                existing = self.db.execute(
                    "SELECT * FROM event_signatures WHERE event_id=? AND key_id=?", (event.id, key_id_value)
                ).fetchone()
                if existing is None:
                    raise InstitutionalError(f"event signature conflict: {exc}") from exc
                same_statement = (
                    str(existing["signer"]) == event.actor
                    and str(existing["office"]) == event.office
                    and str(existing["algorithm"]) == "ES256"
                    and str(existing["statement_digest"]) == str(signature["statement_digest"])
                    and canonical_json(json.loads(existing["jwk"])) == canonical_json(signature["jwk"])
                )
                if not same_statement:
                    raise InstitutionalError(f"event signature conflict: {exc}") from exc
            return next(item for item in self.signature_rows(event.id) if item["key_id"] == key_id_value)

    def fork(
        self,
        new_branch: str,
        *,
        from_branch: str = "main",
        at_event: str | None = None,
        label: str | None = None,
    ) -> dict[str, Any]:
        new_branch = validate_branch(new_branch)
        from_branch = validate_branch(from_branch)
        label = validate_label(label)
        at_event_n = validate_event_id(at_event) if at_event is not None else None
        with self._write_transaction():
            if self.db.execute("SELECT 1 FROM branches WHERE id=?", (new_branch,)).fetchone():
                raise InstitutionalError(f"Branch already exists: {new_branch}")
            history = self._events_locked(from_branch)
            if not history:
                raise InstitutionalError("Cannot fork an empty history")
            fork_id = at_event_n or history[-1].id
            if fork_id not in {e.id for e in history}:
                raise InstitutionalError("Fork event is not in source branch history")
            now = self._next_recorded_at_locked(history)
            body = self._branch_body(
                branch_id=new_branch,
                parent_id=from_branch,
                fork_event_id=fork_id,
                created_at=now,
                label=label,
                canonical=0,
            )
            digest = sha256_json(body)
            branch_seal = self._seal_digest_locked(f"branch:{new_branch}", digest)
            self.db.execute(
                "INSERT INTO branches(id,parent_id,fork_event_id,created_at,label,canonical,seal) VALUES(?,?,?,?,?,?,?)",
                (new_branch, from_branch, fork_id, now, label, 0, branch_seal),
            )
            return dict(self._branch_locked(new_branch))

    def _audit_branch_graph_locked(self, branches: dict[str, sqlite3.Row], errors: list[str]) -> None:
        canonical = [str(row["id"]) for row in branches.values() if int(row["canonical"]) == 1]
        if canonical != ["main"]:
            errors.append(f"canonical branch invariant violated: {canonical}")

        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(branch_id: str) -> None:
            if branch_id in visited:
                return
            if branch_id in visiting:
                errors.append(f"branch ancestry cycle at {branch_id}")
                return
            visiting.add(branch_id)
            row = branches[branch_id]
            parent = row["parent_id"]
            if parent is not None:
                parent_id = str(parent)
                if parent_id not in branches:
                    errors.append(f"{branch_id}: missing parent {parent_id}")
                else:
                    visit(parent_id)
            visiting.remove(branch_id)
            visited.add(branch_id)

        for branch_id in branches:
            visit(branch_id)

    def audit(self) -> dict[str, Any]:
        with self._read_snapshot():
            errors: list[str] = []
            branch_reports: list[dict[str, Any]] = []
            try:
                institution_id = self._institution_id_locked()
                key = self._require_key_locked()
            except InstitutionalError as exc:
                return {"ok": False, "errors": [str(exc)], "branches": []}

            stored_key_id = self._metadata_locked("seal_key_id")
            if stored_key_id != key_id(key):
                errors.append("seal key fingerprint mismatch")
            if self._metadata_locked("format") != "powerfarm-continuum/v3":
                errors.append("unexpected institution format marker")
            if int(self.db.execute("PRAGMA user_version").fetchone()[0]) != SCHEMA_VERSION:
                errors.append("database user_version mismatch")
            if int(self.db.execute("PRAGMA application_id").fetchone()[0]) != APP_ID:
                errors.append("database application_id mismatch")
            quick = [str(row[0]) for row in self.db.execute("PRAGMA quick_check").fetchall()]
            if quick != ["ok"]:
                errors.extend(f"sqlite quick_check: {item}" for item in quick)
            triggers = self.db.execute(
                "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name"
            ).fetchall()
            for trigger in triggers:
                errors.append(f"unexpected SQLite trigger present: {trigger[0]}")

            fk_errors = self.db.execute("PRAGMA foreign_key_check").fetchall()
            for row in fk_errors:
                errors.append(f"foreign key violation: {tuple(row)}")

            branch_rows = self.db.execute("SELECT * FROM branches ORDER BY created_at,id").fetchall()
            branches = {str(row["id"]): row for row in branch_rows}
            self._audit_branch_graph_locked(branches, errors)
            genesis_rows = self.db.execute("SELECT id,branch_id,branch_index FROM events WHERE kind='system.genesis'").fetchall()
            if len(genesis_rows) != 1:
                errors.append(f"expected exactly one system.genesis event, found {len(genesis_rows)}")
            elif str(genesis_rows[0]["branch_id"]) != "main" or int(genesis_rows[0]["branch_index"]) != 1:
                errors.append("system.genesis must be main branch_index 1")

            for row in branch_rows:
                branch_id = str(row["id"])
                try:
                    validate_branch(branch_id)
                    created_at = normalize_timestamp(str(row["created_at"]), "branch.created_at")
                    if created_at != str(row["created_at"]):
                        errors.append(f"{branch_id}: non-canonical branch timestamp")
                    label = validate_label(str(row["label"]) if row["label"] is not None else None)
                    parent_id = str(row["parent_id"]) if row["parent_id"] is not None else None
                    fork_event_id = str(row["fork_event_id"]) if row["fork_event_id"] is not None else None
                    if parent_id is None and fork_event_id is not None:
                        errors.append(f"{branch_id}: root branch cannot have fork_event_id")
                    if parent_id is not None and fork_event_id is None:
                        errors.append(f"{branch_id}: child branch requires fork_event_id")
                    if parent_id is not None and parent_id in branches and fork_event_id is not None:
                        try:
                            parent_history = self._events_locked(parent_id)
                            fork_event = next((e for e in parent_history if e.id == fork_event_id), None)
                            if fork_event is None:
                                errors.append(f"{branch_id}: fork event is not in parent history")
                            elif parse_time(str(row["created_at"])) <= parse_time(fork_event.recorded_at):
                                errors.append(f"{branch_id}: branch creation is not after fork event admission")
                        except InstitutionalError as exc:
                            errors.append(f"{branch_id}: {exc}")
                    body = self._branch_body(
                        branch_id=branch_id,
                        parent_id=parent_id,
                        fork_event_id=fork_event_id,
                        created_at=str(row["created_at"]),
                        label=label,
                        canonical=int(row["canonical"]),
                    )
                    digest = sha256_json(body)
                    if not verify_seal(key, institution_id, f"branch:{branch_id}", digest, str(row["seal"])):
                        errors.append(f"{branch_id}: branch seal mismatch")
                except (ValueError, ValidationError) as exc:
                    errors.append(f"{branch_id}: invalid branch metadata: {exc}")

            for row in branch_rows:
                branch_id = str(row["id"])
                try:
                    inherited: list[Event] = []
                    if row["parent_id"] is not None:
                        parent_id = str(row["parent_id"])
                        parent_history = self._events_locked(parent_id)
                        fork_id = str(row["fork_event_id"])
                        for event in parent_history:
                            inherited.append(event)
                            if event.id == fork_id:
                                break
                        else:
                            errors.append(f"{branch_id}: fork event is not in parent history")
                            continue
                    expected_prev = inherited[-1].hash if inherited else ZERO_HASH
                    prefix = list(inherited)
                    previous_recorded = max((parse_time(e.recorded_at) for e in inherited), default=None)
                    branch_created = parse_time(str(row["created_at"]))
                    local_rows = self._local_event_rows_locked(branch_id)
                    for expected_index, event_row in enumerate(local_rows, start=1):
                        try:
                            event = row_event(event_row)
                            if event.branch_index != expected_index:
                                errors.append(f"{event.id}: non-contiguous branch_index")
                            if event.prev_hash != expected_prev:
                                errors.append(f"{event.id}: prev_hash mismatch")
                            if canonical_json(event.payload) != str(event_row["payload"]):
                                errors.append(f"{event.id}: payload storage is not canonical JSON")
                            if canonical_json(event.causes) != str(event_row["causes"]):
                                errors.append(f"{event.id}: causes storage is not canonical JSON")
                            validate_event_id(event.id)
                            validate_ref(event.actor, "actor", max_len=256)
                            validate_ref(event.office, "office", max_len=128)
                            validate_kind(event.kind)
                            validate_ref(event.subject, "subject")
                            if event.request_id is not None:
                                validate_request_id(event.request_id)
                            if self._normalize_known_payload(event.kind, event.payload) != event.payload:
                                errors.append(f"{event.id}: payload violates canonical institutional constraints")
                            if normalize_causes(event.causes) != event.causes:
                                errors.append(f"{event.id}: causes violate canonical constraints")
                            if normalize_timestamp(event.recorded_at, "recorded_at") != event.recorded_at:
                                errors.append(f"{event.id}: recorded_at is not canonical UTC")
                            event_recorded_dt = parse_time(event.recorded_at)
                            if expected_index == 1 and branch_id != "main" and event_recorded_dt <= branch_created:
                                errors.append(f"{event.id}: first local event is not after branch creation")
                            if previous_recorded is not None and event_recorded_dt <= previous_recorded:
                                errors.append(f"{event.id}: transaction time is not strictly monotonic")
                            previous_recorded = event_recorded_dt
                            if normalize_timestamp(event.effective_at, "effective_at") != event.effective_at:
                                errors.append(f"{event.id}: effective_at is not canonical UTC")
                            validate_hash(event.prev_hash, "prev_hash")
                            validate_hash(event.hash, "hash")
                            validate_hash(event.intent_hash, "intent_hash")
                            validate_hash(event.seal, "seal")

                            intent = self._event_intent(
                                actor=event.actor,
                                office=event.office,
                                kind=event.kind,
                                subject=event.subject,
                                payload=event.payload,
                                causes=event.causes,
                                effective_at=event.effective_at,
                            )
                            if sha256_json(intent) != event.intent_hash:
                                errors.append(f"{event.id}: intent_hash mismatch")
                            digest = sha256_json(self._event_body(event))
                            if digest != event.hash:
                                errors.append(f"{event.id}: hash mismatch")
                            if not verify_seal(key, institution_id, f"event:{event.id}", event.hash, event.seal):
                                errors.append(f"{event.id}: HMAC seal mismatch")

                            accessible = {e.id: e for e in prefix}
                            for cause in event.causes:
                                if cause not in accessible:
                                    errors.append(f"{event.id}: cause {cause} is not a predecessor")
                                elif parse_time(accessible[cause].effective_at) > parse_time(event.effective_at):
                                    errors.append(f"{event.id}: cause {cause} is effective after consequence")

                            if event.kind == "system.genesis":
                                if branch_id != "main" or expected_index != 1 or prefix:
                                    errors.append(f"{event.id}: genesis appears outside main root")
                                if event.authority_ref != "constitutional:genesis":
                                    errors.append(f"{event.id}: invalid genesis authority")
                            else:
                                authority_state = project(prefix, event.recorded_at, event.recorded_at)
                                continuation = self._continuation_authority_locked(
                                    accessible,
                                    actor=event.actor,
                                    office=event.office,
                                    kind=event.kind,
                                    subject=event.subject,
                                    causes=event.causes,
                                )
                                identity_valid = True
                                if self.registry is not None:
                                    if not self.registry.office_exists(event.office, at=event.recorded_at):
                                        errors.append(f"{event.id}: Registry office did not exist at admission time")
                                        identity_valid = False
                                    elif not self.registry.occupancy_matches(event.office, event.actor, at=event.recorded_at):
                                        errors.append(f"{event.id}: Registry did not bind actor to office at admission time")
                                        identity_valid = False
                                else:
                                    occupancy = authority_state.occupancies.get(event.office)
                                    if occupancy is None or occupancy.get("principal") != event.actor:
                                        errors.append(f"{event.id}: actor did not occupy office at admission time")
                                        identity_valid = False
                                if continuation is not None:
                                    if event.authority_ref != continuation:
                                        errors.append(f"{event.id}: invalid inherited run authority")
                                elif identity_valid and not authority_ref_valid(
                                    authority_state,
                                    event.authority_ref,
                                    event.office,
                                    event.kind,
                                    event.subject,
                                    event.recorded_at,
                                ):
                                    errors.append(f"{event.id}: authority_ref was not valid at admission time")
                                semantic_state = project(prefix, event.effective_at, event.recorded_at)
                                try:
                                    self._validate_semantics_state(
                                        semantic_state,
                                        accessible,
                                        actor=event.actor,
                                        office=event.office,
                                        kind=event.kind,
                                        subject=event.subject,
                                        payload=event.payload,
                                        causes=event.causes,
                                        effective_at=event.effective_at,
                                        authority_ref=event.authority_ref,
                                    )
                                except (InstitutionalError, ValueError) as exc:
                                    errors.append(f"{event.id}: semantic replay failed: {exc}")
                            prefix.append(event)
                            expected_prev = event.hash
                        except (ValueError, ValidationError, KeyError, TypeError, json.JSONDecodeError) as exc:
                            errors.append(f"{branch_id}#{expected_index}: malformed event: {exc}")
                    branch_reports.append({
                        "branch": branch_id,
                        "local_events": len(local_rows),
                        "head": expected_prev,
                    })
                except InstitutionalError as exc:
                    errors.append(f"{branch_id}: {exc}")

            signature_rows = self.db.execute("SELECT * FROM event_signatures ORDER BY event_id,key_id").fetchall()
            for row in signature_rows:
                try:
                    event = self._event_locked(str(row["event_id"]))
                    signature = {
                        "format": "powerfarm.event-signature/v1",
                        "event_id": str(row["event_id"]),
                        "key_id": str(row["key_id"]),
                        "signer": str(row["signer"]),
                        "office": str(row["office"]),
                        "algorithm": str(row["algorithm"]),
                        "jwk": json.loads(row["jwk"]),
                        "statement_digest": str(row["statement_digest"]),
                        "signature": str(row["signature"]),
                        "signed_at": str(row["signed_at"]),
                    }
                    for error in verify_event_signature(signature, event, institution_id=self._institution_id_locked()):
                        errors.append(f"{event.id}: {error}")
                    signed_at = normalize_timestamp(signature["signed_at"], "signature.signed_at")
                    if parse_time(signed_at) < parse_time(event.recorded_at):
                        errors.append(f"{event.id}: signature predates event admission")
                    history = self._events_locked(event.branch_id)
                    binding = self._resolve_signing_key_binding_locked(event, signature["key_id"])
                    if binding is None:
                        errors.append(f"{event.id}: signature key was not registered for actor/office at admission time")
                    elif canonical_json(binding.get("jwk")) != canonical_json(signature["jwk"]):
                        errors.append(f"{event.id}: signature key does not match registered JWK")
                except (InstitutionalError, ValidationError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
                    errors.append(f"signature audit failed: {exc}")

            return {
                "ok": not errors,
                "errors": errors,
                "branches": branch_reports,
                "signatures": len(signature_rows),
            }

    def checkpoint(self) -> dict[str, Any]:
        """Create an authenticated external rollback anchor.

        The checkpoint is intentionally separate from SQLite. Keep a copy in a
        location whose rollback domain differs from the database host. A future
        database may advance past it; verification only requires every anchored
        branch head to remain in the current authenticated history.
        """
        with self._read_snapshot():
            audit = self.audit()
            if not audit["ok"]:
                raise InstitutionalError("refusing to checkpoint an institution that does not audit cleanly")
            branches = []
            for row in self.db.execute("SELECT * FROM branches ORDER BY id").fetchall():
                branch_id = str(row["id"])
                history = self._events_locked(branch_id)
                if not history:
                    raise InstitutionalError(f"cannot checkpoint empty branch {branch_id}")
                head = history[-1]
                branches.append({
                    "id": branch_id,
                    "branch_seal": str(row["seal"]),
                    "head_event_id": head.id,
                    "head_hash": head.hash,
                })
            body = {
                "format": "powerfarm-checkpoint/v1",
                "institution_id": self._institution_id_locked(),
                "created_at": utcnow(),
                "branches": branches,
            }
            digest = sha256_json(body)
            return {
                **body,
                "digest": digest,
                "seal": self._seal_digest_locked("checkpoint:v1", digest),
            }

    def verify_checkpoint(self, checkpoint: dict[str, Any]) -> dict[str, Any]:
        with self._read_snapshot():
            errors: list[str] = []
            if not isinstance(checkpoint, dict):
                return {"ok": False, "errors": ["checkpoint must be an object"]}
            try:
                if checkpoint.get("format") != "powerfarm-checkpoint/v1":
                    errors.append("unsupported checkpoint format")
                institution_id = str(checkpoint.get("institution_id", ""))
                if institution_id != self._institution_id_locked():
                    errors.append("checkpoint belongs to a different institution")
                created_at = normalize_timestamp(str(checkpoint.get("created_at", "")), "checkpoint.created_at")
                if created_at != checkpoint.get("created_at"):
                    errors.append("checkpoint timestamp is not canonical")
                branches = checkpoint.get("branches")
                if not isinstance(branches, list) or not branches:
                    errors.append("checkpoint has no branch anchors")
                    branches = []
                body = {
                    "format": checkpoint.get("format"),
                    "institution_id": checkpoint.get("institution_id"),
                    "created_at": checkpoint.get("created_at"),
                    "branches": branches,
                }
                digest = sha256_json(body)
                if checkpoint.get("digest") != digest:
                    errors.append("checkpoint digest mismatch")
                signature = str(checkpoint.get("seal", ""))
                if not verify_seal(
                    self._require_key_locked(),
                    self._institution_id_locked(),
                    "checkpoint:v1",
                    digest,
                    signature,
                ):
                    errors.append("checkpoint HMAC seal mismatch")

                anchored_ids: set[str] = set()
                for anchor in branches:
                    if not isinstance(anchor, dict):
                        errors.append("malformed branch anchor")
                        continue
                    branch_id = validate_branch(str(anchor.get("id", "")))
                    if branch_id in anchored_ids:
                        errors.append(f"duplicate checkpoint branch {branch_id}")
                        continue
                    anchored_ids.add(branch_id)
                    row = self.db.execute("SELECT * FROM branches WHERE id=?", (branch_id,)).fetchone()
                    if row is None:
                        errors.append(f"checkpoint branch missing from database: {branch_id}")
                        continue
                    if str(row["seal"]) != str(anchor.get("branch_seal", "")):
                        errors.append(f"{branch_id}: branch metadata no longer matches checkpoint")
                    event_id = validate_event_id(str(anchor.get("head_event_id", "")))
                    head_hash = validate_hash(str(anchor.get("head_hash", "")), "checkpoint.head_hash")
                    history = {event.id: event for event in self._events_locked(branch_id)}
                    event = history.get(event_id)
                    if event is None or event.hash != head_hash:
                        errors.append(f"{branch_id}: anchored head is no longer in current history")
                if "main" not in anchored_ids:
                    errors.append("checkpoint does not anchor main")
            except (InstitutionalError, ValidationError, ValueError, TypeError) as exc:
                errors.append(str(exc))
            return {"ok": not errors, "errors": errors}

    def proof(self, event_id: str, branch: str = "main") -> dict[str, Any]:
        event_id = validate_event_id(event_id)
        branch = validate_branch(branch)
        with self._read_snapshot():
            history = {e.id: e for e in self._events_locked(branch)}
            if event_id not in history:
                raise InstitutionalError(f"Event {event_id} is not in branch {branch}")
            nodes: dict[str, dict[str, Any]] = {}
            edges: list[dict[str, str]] = []
            stack = [event_id]
            while stack:
                if len(nodes) >= MAX_GRAPH_NODES:
                    raise InstitutionalError("proof graph exceeds safety limit")
                current_id = stack.pop()
                if current_id in nodes:
                    continue
                event = history[current_id]
                nodes[current_id] = event.public()
                for cause in event.causes:
                    edges.append({"from": cause, "to": current_id, "type": "cause"})
                    if cause in history:
                        stack.append(cause)
                authority_event = event.authority_ref
                if authority_event.startswith("continuation:"):
                    authority_event = authority_event.split(":", 1)[1]
                if authority_event.startswith("evt_") and authority_event in history:
                    edges.append({"from": authority_event, "to": current_id, "type": "authority"})
                    stack.append(authority_event)
            return {"root": event_id, "nodes": list(nodes.values()), "edges": edges}

    def findings(self, branch: str = "main", now: str | None = None) -> list[dict[str, Any]]:
        branch = validate_branch(branch)
        at = normalize_timestamp(now, "now") if now is not None else utcnow()
        with self._read_snapshot():
            return reconcile(project(self._events_locked(branch), effective_at=at, recorded_at=at), at)

    def impact(self, event_id: str, branch: str = "main") -> dict[str, Any]:
        event_id = validate_event_id(event_id)
        branch = validate_branch(branch)
        with self._read_snapshot():
            events = self._events_locked(branch)
            by_id = {e.id: e for e in events}
            if event_id not in by_id:
                raise InstitutionalError(f"Event {event_id} is not in branch {branch}")

            reverse: dict[str, list[tuple[str, str]]] = {}
            for event in events:
                for cause in event.causes:
                    reverse.setdefault(cause, []).append((event.id, "cause"))
                authority_event = event.authority_ref
                if authority_event.startswith("continuation:"):
                    authority_event = authority_event.split(":", 1)[1]
                if authority_event.startswith("evt_"):
                    reverse.setdefault(authority_event, []).append((event.id, "authority"))

            depth = {event_id: 0}
            reasons: dict[str, list[dict[str, str]]] = {event_id: []}
            queue: deque[str] = deque([event_id])
            while queue:
                if len(depth) > MAX_GRAPH_NODES:
                    raise InstitutionalError("impact graph exceeds safety limit")
                current = queue.popleft()
                for child, edge_type in reverse.get(current, []):
                    reasons.setdefault(child, []).append({"from": current, "type": edge_type})
                    proposed = depth[current] + 1
                    if child not in depth or proposed < depth[child]:
                        depth[child] = proposed
                        queue.append(child)

            affected = []
            history_order = {e.id: i for i, e in enumerate(events)}
            for affected_id, d in sorted(depth.items(), key=lambda item: (item[1], history_order[item[0]])):
                event = by_id[affected_id]
                affected.append({
                    "depth": d,
                    "event": event.public(),
                    "reasons": reasons.get(affected_id, []),
                })

            subjects = sorted({item["event"]["subject"] for item in affected})
            kinds: dict[str, int] = {}
            for item in affected:
                kind = str(item["event"]["kind"])
                kinds[kind] = kinds.get(kind, 0) + 1

            return {
                "branch": branch,
                "source": event_id,
                "blast_radius": max(0, len(affected) - 1),
                "affected_subjects": subjects,
                "affected_kinds": kinds,
                "affected": affected,
            }

    def diff(self, left: str, right: str) -> dict[str, Any]:
        left = validate_branch(left)
        right = validate_branch(right)
        with self._read_snapshot():
            a = project(self._events_locked(left)).public()
            b = project(self._events_locked(right)).public()
            result: dict[str, Any] = {"left": left, "right": right, "changed": {}}
            for key in ("offices", "occupancies", "grants", "objects"):
                av = a[key]
                bv = b[key]
                keys = sorted(set(av) | set(bv))
                delta = {}
                for item in keys:
                    if av.get(item) != bv.get(item):
                        delta[item] = {"left": av.get(item), "right": bv.get(item)}
                if delta:
                    result["changed"][key] = delta
            return result
