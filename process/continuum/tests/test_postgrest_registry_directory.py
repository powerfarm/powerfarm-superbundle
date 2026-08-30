from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from powerfarm.registry import PostgrestRegistryDirectory, RegistryTransportError


class Handler(BaseHTTPRequestHandler):
    calls: list[dict] = []
    occupancy = "pf.agent.one"

    def log_message(self, *_args):
        pass

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        self.__class__.calls.append({
            "path": self.path,
            "body": body,
            "apikey": self.headers.get("apikey"),
        })
        if self.path.endswith("powerfarm_registry_office_snapshot_v1"):
            payload = {
                "contract_version": "powerfarm.registry.directory.v1",
                "data": {
                    "office_ref": body["p_office_ref"],
                    "exists": body["p_office_ref"] == "pf.office.operations",
                    "observed_at": body["p_at"],
                    "occupancy": {
                        "occupancy_ref": "pf.occupancy.11111111-1111-1111-1111-111111111111",
                        "principal_ref": self.__class__.occupancy,
                        "definition_hash": "a" * 64,
                        "valid_from": "2026-08-30T00:00:00Z",
                        "valid_until": None,
                    } if body["p_office_ref"] == "pf.office.operations" else None,
                },
            }
        elif self.path.endswith("powerfarm_registry_key_binding_v1"):
            if body["p_principal_ref"] != self.__class__.occupancy:
                payload = None
            else:
                payload = {
                    "contract_version": "powerfarm.registry.directory.v1",
                    "data": {
                        "key_id": body["p_key_fingerprint"],
                        "principal": body["p_principal_ref"],
                        "office": body["p_office_ref"],
                        "occupancy_ref": "pf.occupancy.11111111-1111-1111-1111-111111111111",
                        "jwk": {"kty": "EC", "crv": "P-256", "x": "x", "y": "y"},
                    },
                }
        else:
            self.send_response(404)
            self.end_headers()
            return
        raw = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


@pytest.fixture()
def server():
    Handler.calls = []
    Handler.occupancy = "pf.agent.one"
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield httpd
    finally:
        httpd.shutdown()
        thread.join(timeout=2)


def directory(server) -> PostgrestRegistryDirectory:
    host, port = server.server_address
    return PostgrestRegistryDirectory(
        base_url=f"http://{host}:{port}",
        publishable_key="publishable-test",
        allow_insecure_local=True,
    )


def test_real_postgrest_directory_queries_office_occupancy_and_key_over_http(server):
    d = directory(server)
    at = "2026-08-30T06:00:00Z"
    assert d.office_exists("pf.office.operations", at=at)
    assert d.occupancy_matches("pf.office.operations", "pf.agent.one", at=at)
    occupancy = d.current_occupancy("pf.office.operations", at=at)
    assert occupancy["occupancy_ref"].startswith("pf.occupancy.")
    key = d.key_binding("b" * 64, "pf.agent.one", "pf.office.operations", at=at)
    assert key["key_id"] == "b" * 64
    assert all(call["apikey"] == "publishable-test" for call in Handler.calls)
    assert all(call["path"].startswith("/rest/v1/rpc/") for call in Handler.calls)


def test_occupancy_change_is_observed_without_process_state_mutation(server):
    d = directory(server)
    at = "2026-08-30T06:00:00Z"
    assert d.occupancy_matches("pf.office.operations", "pf.agent.one", at=at)
    Handler.occupancy = "pf.agent.two"
    assert not d.occupancy_matches("pf.office.operations", "pf.agent.one", at=at)
    assert d.occupancy_matches("pf.office.operations", "pf.agent.two", at=at)


def test_directory_rejects_insecure_nonlocal_and_contract_drift(server):
    with pytest.raises(ValueError, match="HTTPS"):
        PostgrestRegistryDirectory(base_url="http://registry.example.test", publishable_key="x")

    d = directory(server)
    original = Handler.do_POST
    def wrong(self):
        raw = json.dumps({"contract_version": "wrong", "data": {}}).encode()
        self.send_response(200); self.send_header("content-length", str(len(raw))); self.end_headers(); self.wfile.write(raw)
    Handler.do_POST = wrong
    try:
        with pytest.raises(RegistryTransportError, match="contract mismatch"):
            d.office_exists("pf.office.operations", at="2026-08-30T06:00:00Z")
    finally:
        Handler.do_POST = original
