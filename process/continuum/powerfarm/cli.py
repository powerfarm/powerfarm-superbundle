from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from .kernel import InstitutionalError, Kernel
from .db import SCHEMA_VERSION
from .validation import MAX_PAYLOAD_BYTES
from .bundle import export_bundle, verify_bundle
from .core.files import atomic_write_json as core_atomic_write_json
from .crypto import (
    generate_private_key, key_fingerprint, load_private_key, load_public_key, make_event_signature, make_receipt, public_jwk, save_private_key,
    save_public_key, verify_quorum, verify_receipt,
)
from .ops import create_backup, doctor, metrics, verify_backup


def _object_no_duplicates(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError(f"duplicate JSON object key: {key}")
        out[key] = value
    return out


def _decode_json(text: str) -> Any:
    return json.loads(text, object_pairs_hook=_object_no_duplicates)


def load_json(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    if value.startswith("@"):
        path = Path(value[1:])
        if path.stat().st_size > MAX_PAYLOAD_BYTES * 2:
            raise ValueError("payload source file is too large")
        parsed = _decode_json(path.read_text(encoding="utf-8"))
    else:
        parsed = _decode_json(value)
    if not isinstance(parsed, dict):
        raise ValueError("payload must be a JSON object")
    return parsed


def emit(value: Any) -> None:
    print(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True, allow_nan=False))


def load_json_file(path: str) -> dict[str, Any]:
    source = Path(path)
    if source.stat().st_size > 1024 * 1024:
        raise ValueError("JSON file is too large")
    parsed = _decode_json(source.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("JSON file must contain an object")
    return parsed


def atomic_write_json(path: str, value: dict[str, Any]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True, allow_nan=False) + "\n").encode("utf-8")
    fd, temporary = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb", closefd=True) as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(temporary, target)
        if os.name == "posix":
            try:
                dir_fd = os.open(target.parent, os.O_RDONLY)
                try:
                    os.fsync(dir_fd)
                finally:
                    os.close(dir_fd)
            except OSError:
                pass
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def add_write_guards(p: argparse.ArgumentParser) -> None:
    p.add_argument("--request-id", help="Idempotency key for safe retries")
    p.add_argument("--expect-head", help="CAS guard: reject if branch head changed")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="powerfarm", description="Powerfarm Continuum institutional kernel")
    p.add_argument("--db", default="powerfarm.db", help="SQLite institution database")
    p.add_argument("--seal-key", help="Path to the external HMAC seal key (default: <db>.sealkey)")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("upgrade", help="Open the database writable and apply supported local schema upgrades")

    init = sub.add_parser("init", help="Create the official institutional timeline")
    init.add_argument("--director", required=True, help="Principal occupying the root director office")
    init.add_argument("--mandate", default="Direction, legitimacy, and commitments")

    act = sub.add_parser("act", help="Record an authorized institutional act")
    act.add_argument("--branch", default="main")
    act.add_argument("--actor", required=True)
    act.add_argument("--office", required=True)
    act.add_argument("--kind", required=True)
    act.add_argument("--subject", required=True)
    act.add_argument("--payload", help="JSON object or @path.json")
    act.add_argument("--cause", action="append", default=[], help="Causal event id; repeatable")
    act.add_argument("--effective-at")
    add_write_guards(act)

    office = sub.add_parser("office", help="Create a durable office")
    office.add_argument("id")
    office.add_argument("--mandate", required=True)
    office.add_argument("--actor", required=True)
    office.add_argument("--as-office", default="director")
    office.add_argument("--branch", default="main")
    add_write_guards(office)

    occupy = sub.add_parser("occupy", help="Assign a principal to an office")
    occupy.add_argument("office_id")
    occupy.add_argument("principal")
    occupy.add_argument("--definition")
    occupy.add_argument("--actor", required=True)
    occupy.add_argument("--as-office", default="director")
    occupy.add_argument("--branch", default="main")
    add_write_guards(occupy)

    grant = sub.add_parser("grant", help="Root office: grant an office authority over acts/subjects")
    grant.add_argument("grantee_office")
    grant.add_argument("--action", default="*")
    grant.add_argument("--subject", default="*")
    grant.add_argument("--valid-until")
    grant.add_argument("--actor", required=True)
    grant.add_argument("--as-office", default="director")
    grant.add_argument("--branch", default="main")
    add_write_guards(grant)

    head = sub.add_parser("head", help="Print branch head for compare-and-set writes")
    head.add_argument("--branch", default="main")

    events = sub.add_parser("events", help="Print the visible event stream")
    events.add_argument("--branch", default="main")

    state = sub.add_parser("state", help="Project bitemporal institutional state")
    state.add_argument("--branch", default="main")
    state.add_argument("--at", help="Effective-time cutoff")
    state.add_argument("--known-at", help="Transaction-time cutoff: only facts recorded by this time")

    audit = sub.add_parser("audit", help="Verify seals, chains, authority, causality and semantic replay")
    audit.add_argument("--checkpoint", help="Also verify against an external rollback checkpoint")

    checkpoint = sub.add_parser("checkpoint", help="Write an authenticated external rollback anchor")
    checkpoint.add_argument("--out", required=True, help="Checkpoint JSON path; store it outside the DB rollback domain")

    findings = sub.add_parser("findings", help="Reconcile obligations and runtime invariants")
    findings.add_argument("--branch", default="main")
    findings.add_argument("--now")

    proof = sub.add_parser("proof", help="Build causal + authority proof for one event")
    proof.add_argument("event_id")
    proof.add_argument("--branch", default="main")

    impact = sub.add_parser("impact", help="Calculate causal/authority blast radius of losing one act")
    impact.add_argument("event_id")
    impact.add_argument("--branch", default="main")

    fork = sub.add_parser("fork", help="Fork history for a counterfactual timeline")
    fork.add_argument("new_branch")
    fork.add_argument("--from-branch", default="main")
    fork.add_argument("--at-event")
    fork.add_argument("--label")

    diff = sub.add_parser("diff", help="Compare projected state across two timelines")
    diff.add_argument("left")
    diff.add_argument("right")

    serve = sub.add_parser("serve", help="Run the read-only Continuum Observatory")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8787)
    serve.add_argument(
        "--unsafe-bind",
        action="store_true",
        help="Allow binding the read-only Observatory to a non-loopback interface",
    )

    sub.add_parser("metrics", help="Emit institutional/ledger metrics")
    sub.add_parser("doctor", help="Run local storage, permissions, and institutional diagnostics")

    backup = sub.add_parser("backup", help="Create a consistent database backup and manifest")
    backup.add_argument("--out", required=True)

    backup_verify = sub.add_parser("backup-verify", help="Verify a backup file against its manifest")
    backup_verify.add_argument("--backup-db", required=True)
    backup_verify.add_argument("--manifest", required=True)

    bundle_export = sub.add_parser("bundle-export", help="Export an offline-verifiable evidence bundle")
    bundle_export.add_argument("--out", required=True)

    bundle_verify = sub.add_parser("bundle-verify", help="Verify a portable evidence bundle without the HMAC key")
    bundle_verify.add_argument("--file", required=True)

    keygen = sub.add_parser("witness-keygen", help="Generate a P-256 witness keypair")
    keygen.add_argument("--private", required=True)
    keygen.add_argument("--public", required=True)

    witness_sign = sub.add_parser("witness-sign", help="Sign an external checkpoint with a witness key")
    witness_sign.add_argument("--checkpoint", required=True)
    witness_sign.add_argument("--private", required=True)
    witness_sign.add_argument("--witness", required=True)
    witness_sign.add_argument("--out", required=True)

    witness_verify = sub.add_parser("witness-verify", help="Verify one witness receipt")
    witness_verify.add_argument("--receipt", required=True)

    quorum = sub.add_parser("witness-quorum", help="Verify N-of-M witness receipts over one checkpoint")
    quorum.add_argument("--threshold", required=True, type=int)
    quorum.add_argument("--receipt", action="append", required=True)
    quorum.add_argument("--trust-key-id", action="append", default=[])

    key_register = sub.add_parser("key-register", help="Register an ES256 public key for the current occupant of an office")
    key_register.add_argument("--public", required=True, help="P-256 public key PEM")
    key_register.add_argument("--principal", required=True)
    key_register.add_argument("--office", required=True)
    key_register.add_argument("--actor", required=True)
    key_register.add_argument("--as-office", default="director")
    key_register.add_argument("--branch", default="main")
    add_write_guards(key_register)

    key_revoke = sub.add_parser("key-revoke", help="Revoke a previously registered institutional signing key")
    key_revoke.add_argument("key_id")
    key_revoke.add_argument("--actor", required=True)
    key_revoke.add_argument("--as-office", default="director")
    key_revoke.add_argument("--branch", default="main")
    add_write_guards(key_revoke)

    sign_event = sub.add_parser("sign-event", help="Attach an ES256 signature to an admitted event")
    sign_event.add_argument("event_id")
    sign_event.add_argument("--private", required=True)

    signatures = sub.add_parser("signatures", help="List detached event signatures")
    signatures.add_argument("--event-id")

    return p


def main(argv: list[str] | None = None) -> None:
    args = parser().parse_args(argv)

    # Commands whose trust material is entirely external to the institution DB.
    if args.command == "witness-keygen":
        private_key = generate_private_key()
        save_private_key(args.private, private_key)
        save_public_key(args.public, private_key.public_key())
        emit({"ok": True, "private": args.private, "public": args.public})
        return
    if args.command == "witness-sign":
        checkpoint = load_json_file(args.checkpoint)
        receipt = make_receipt(
            checkpoint, witness=args.witness, private_key=load_private_key(args.private)
        ).public()
        core_atomic_write_json(args.out, receipt)
        emit({"ok": True, "receipt": args.out, "key_id": receipt["key_id"], "statement_digest": receipt["statement_digest"]})
        return
    if args.command == "witness-verify":
        report = verify_receipt(load_json_file(args.receipt))
        emit(report)
        if not report["ok"]:
            raise SystemExit(2)
        return
    if args.command == "witness-quorum":
        receipts = [load_json_file(path) for path in args.receipt]
        trusted = set(args.trust_key_id) if args.trust_key_id else None
        report = verify_quorum(receipts, threshold=args.threshold, trusted_key_ids=trusted)
        emit(report)
        if not report["ok"]:
            raise SystemExit(2)
        return
    if args.command == "bundle-verify":
        report = verify_bundle(load_json_file(args.file))
        emit(report)
        if not report["ok"]:
            raise SystemExit(2)
        return
    if args.command == "backup-verify":
        report = verify_backup(args.backup_db, args.manifest)
        emit(report)
        if not report["ok"]:
            raise SystemExit(2)
        return

    read_only_commands = {
        "serve", "head", "events", "state", "audit", "checkpoint",
        "findings", "proof", "impact", "diff", "metrics", "doctor",
        "backup", "bundle-export", "signatures",
    }
    kernel = Kernel(
        args.db,
        read_only=args.command in read_only_commands,
        seal_key_path=args.seal_key,
    )
    try:
        if args.command == "upgrade":
            emit({"ok": True, "schema_version": SCHEMA_VERSION, "database": str(kernel.path), "initialized": kernel.initialized()})
        elif args.command == "init":
            emit(kernel.init(args.director, args.mandate).public())
        elif args.command == "act":
            emit(kernel.append(
                branch=args.branch,
                actor=args.actor,
                office=args.office,
                kind=args.kind,
                subject=args.subject,
                payload=load_json(args.payload),
                causes=args.cause,
                effective_at=args.effective_at,
                request_id=args.request_id,
                expected_head=args.expect_head,
            ).public())
        elif args.command == "office":
            emit(kernel.append(
                branch=args.branch,
                actor=args.actor,
                office=args.as_office,
                kind="office.create",
                subject=f"office:{args.id}",
                payload={"mandate": args.mandate},
                request_id=args.request_id,
                expected_head=args.expect_head,
            ).public())
        elif args.command == "occupy":
            payload = {"principal": args.principal}
            if args.definition:
                payload["definition"] = args.definition
            emit(kernel.append(
                branch=args.branch,
                actor=args.actor,
                office=args.as_office,
                kind="occupancy.assign",
                subject=f"office:{args.office_id}",
                payload=payload,
                request_id=args.request_id,
                expected_head=args.expect_head,
            ).public())
        elif args.command == "grant":
            payload = {
                "grantee_office": args.grantee_office,
                "action": args.action,
                "subject": args.subject,
            }
            if args.valid_until:
                payload["valid_until"] = args.valid_until
            emit(kernel.append(
                branch=args.branch,
                actor=args.actor,
                office=args.as_office,
                kind="authority.grant",
                subject=f"office:{args.grantee_office}",
                payload=payload,
                request_id=args.request_id,
                expected_head=args.expect_head,
            ).public())
        elif args.command == "head":
            emit(kernel.head(args.branch))
        elif args.command == "events":
            emit([e.public() for e in kernel.events(args.branch)])
        elif args.command == "state":
            emit(kernel.state(args.branch, args.at, args.known_at))
        elif args.command == "audit":
            report = kernel.audit()
            if args.checkpoint:
                checkpoint_report = kernel.verify_checkpoint(load_json_file(args.checkpoint))
                report["checkpoint"] = checkpoint_report
                report["ok"] = bool(report["ok"] and checkpoint_report["ok"])
                report["errors"] = list(report["errors"]) + [
                    f"checkpoint: {error}" for error in checkpoint_report["errors"]
                ]
            emit(report)
            if not report["ok"]:
                raise SystemExit(2)
        elif args.command == "checkpoint":
            value = kernel.checkpoint()
            atomic_write_json(args.out, value)
            emit({"ok": True, "path": str(Path(args.out)), "digest": value["digest"]})
        elif args.command == "findings":
            emit(kernel.findings(args.branch, args.now))
        elif args.command == "proof":
            emit(kernel.proof(args.event_id, args.branch))
        elif args.command == "impact":
            emit(kernel.impact(args.event_id, args.branch))
        elif args.command == "fork":
            emit(kernel.fork(args.new_branch, from_branch=args.from_branch, at_event=args.at_event, label=args.label))
        elif args.command == "diff":
            emit(kernel.diff(args.left, args.right))
        elif args.command == "metrics":
            emit(metrics(kernel))
        elif args.command == "doctor":
            report = doctor(kernel)
            emit(report)
            if not report["ok"]:
                raise SystemExit(2)
        elif args.command == "backup":
            emit(create_backup(kernel, args.out))
        elif args.command == "bundle-export":
            bundle = export_bundle(kernel)
            core_atomic_write_json(args.out, bundle)
            emit({"ok": True, "path": args.out, "digest": bundle["digest"], "events": len(bundle["events"])})
        elif args.command == "key-register":
            pub = load_public_key(args.public)
            key_id_value = key_fingerprint(pub)
            emit(kernel.append(
                branch=args.branch, actor=args.actor, office=args.as_office,
                kind="identity.key.register", subject=f"key:{key_id_value}",
                payload={"principal": args.principal, "office": args.office, "jwk": public_jwk(pub)},
                request_id=args.request_id, expected_head=args.expect_head,
            ).public())
        elif args.command == "key-revoke":
            emit(kernel.append(
                branch=args.branch, actor=args.actor, office=args.as_office,
                kind="identity.key.revoke", subject=f"key:{args.key_id}",
                payload={"key_id": args.key_id}, request_id=args.request_id, expected_head=args.expect_head,
            ).public())
        elif args.command == "sign-event":
            event = kernel.event(args.event_id)
            signature = make_event_signature(
                event, institution_id=kernel._institution_id_locked(), private_key=load_private_key(args.private)
            ).public()
            emit(kernel.attach_signature(signature))
        elif args.command == "signatures":
            emit(kernel.signature_rows(args.event_id))
        elif args.command == "serve":
            from .server import serve
            serve(kernel, host=args.host, port=args.port, unsafe_bind=args.unsafe_bind)
    except (InstitutionalError, ValueError, json.JSONDecodeError, OSError) as exc:
        raise SystemExit(f"error: {exc}") from exc
    finally:
        kernel.close()


if __name__ == "__main__":
    main()
