from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from powerfarm.kernel import Kernel
from powerfarm.registry import StaticRegistryDirectory
from powerfarm.runtime.postgrest_writer import PostgrestAdmissionWriter, ProcessWriterError


class Handler(BaseHTTPRequestHandler):
    calls: list[dict] = []
    replay: dict[str, dict] = {}

    def log_message(self, *_args): pass

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length))
        self.__class__.calls.append({
            "path": self.path,
            "body": body,
            "authorization": self.headers.get("authorization"),
            "profile": self.headers.get("content-profile"),
        })
        if self.path.endswith("bootstrap_institution_v2"):
            data = {"institution_id": body["p_institution_id"], "timeline_id": body["p_timeline_id"]}
        elif self.path.endswith("admit_card_batch_v2"):
            request = body["p_request"]["data"]
            existing = self.__class__.replay.get(request["request_id"])
            if existing:
                data = {**existing, "replayed": True}
            else:
                data = {
                    "request_id": request["request_id"],
                    "institution_id": request["institution_id"],
                    "timeline_id": request["timeline_id"],
                    "first_act_id": request["acts"][0]["id"],
                    "last_act_id": request["acts"][-1]["id"],
                    "act_count": len(request["acts"]),
                    "head_sha256": request["acts"][-1]["sha256"],
                    "replayed": False,
                }
                self.__class__.replay[request["request_id"]] = data
        else:
            self.send_response(404); self.end_headers(); return
        raw = json.dumps({"contract_version": "powerfarm.process.admission-write.v2", "data": data}).encode()
        self.send_response(200); self.send_header("content-length", str(len(raw))); self.end_headers(); self.wfile.write(raw)


@pytest.fixture()
def server():
    Handler.calls = []; Handler.replay = {}
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True); thread.start()
    try: yield httpd
    finally: httpd.shutdown(); thread.join(timeout=2)


def writer(server):
    host, port = server.server_address
    return PostgrestAdmissionWriter(
        base_url=f"http://{host}:{port}", publishable_key="pk",
        token_provider=lambda: "short-lived-process-token", allow_insecure_local=True,
    )


def admitted_events(tmp_path: Path):
    directory = StaticRegistryDirectory(offices={"pf.office.director"}, occupancies={"pf.office.director": "pf.person.director"})
    k = Kernel(tmp_path / "continuum.sqlite", registry=directory)
    k.init("pf.person.director", root_office="pf.office.director")
    event = k.append(
        branch="main", actor="pf.person.director", office="pf.office.director",
        kind="claim.assert", subject="claim:production-writer", payload={"statement": "persist me"},
        request_id="claim-production-writer",
    )
    return k, [event]


def test_writer_uses_authenticated_continuum_rpc_and_preserves_canonical_refs(server, tmp_path):
    k, events = admitted_events(tmp_path)
    w = writer(server)
    institution = k._institution_id_locked()
    w.bootstrap(institution_id=institution, title="PowerFarm")
    result = w.persist(institution_id=institution, events=events, request_id="batch-production-0001", card_ref="pf.card.production-writer", beat_ref="pf.beat.production-writer", attempt_ref="pf.attempt.production-writer", execution_slice_sha256="sha256:" + "c" * 64, trace_ref="pf.trace.production-writer")
    assert result["act_count"] == 1 and result["replayed"] is False
    call = Handler.calls[-1]
    assert call["authorization"] == "Bearer short-lived-process-token"
    assert call["profile"] == "continuum"
    row = call["body"]["p_request"]["data"]["acts"][0]
    assert row["actor_ref"] == "pf.person.director"
    assert row["office_ref"] == "pf.office.director"
    assert row["sha256"] == events[0].hash
    data = call["body"]["p_request"]["data"]
    assert data["card_ref"] == "pf.card.production-writer"
    assert data["attempt_ref"] == "pf.attempt.production-writer"


def test_writer_batch_request_is_idempotent_at_postgres_boundary(server, tmp_path):
    k, events = admitted_events(tmp_path)
    w = writer(server); institution = k._institution_id_locked()
    first = w.persist(institution_id=institution, events=events, request_id="batch-production-0002", card_ref="pf.card.production-writer", beat_ref="pf.beat.production-writer", attempt_ref="pf.attempt.production-writer", execution_slice_sha256="sha256:" + "c" * 64)
    second = w.persist(institution_id=institution, events=events, request_id="batch-production-0002", card_ref="pf.card.production-writer", beat_ref="pf.beat.production-writer", attempt_ref="pf.attempt.production-writer", execution_slice_sha256="sha256:" + "c" * 64)
    assert first["last_act_id"] == second["last_act_id"]
    assert second["replayed"] is True


def test_writer_fails_closed_without_runtime_token(server):
    host, port = server.server_address
    w = PostgrestAdmissionWriter(
        base_url=f"http://{host}:{port}", publishable_key="pk", token_provider=lambda: "", allow_insecure_local=True,
    )
    with pytest.raises(ProcessWriterError, match="no token"):
        w.bootstrap(institution_id="inst_" + "a" * 32)
