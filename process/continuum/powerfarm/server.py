from __future__ import annotations

import ipaddress
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .kernel import InstitutionalError, Kernel
from .ops.metrics import metrics
from .institution.lineage import lineage

UI_ROOT = Path(__file__).resolve().parent / "ui"
UI = UI_ROOT / "index.html"
STATIC_ASSETS = {
    "/assets/styles.css": (UI_ROOT / "styles.css", "text/css; charset=utf-8"),
    "/assets/app.js": (UI_ROOT / "app.js", "text/javascript; charset=utf-8"),
    "/assets/api.js": (UI_ROOT / "api.js", "text/javascript; charset=utf-8"),
    "/assets/render.js": (UI_ROOT / "render.js", "text/javascript; charset=utf-8"),
}
MAX_QUERY_LENGTH = 4096
MAX_EVENT_RESPONSE = 5000


def is_loopback_host(host: str) -> bool:
    if host.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def serve(
    kernel: Kernel,
    host: str = "127.0.0.1",
    port: int = 8787,
    *,
    unsafe_bind: bool = False,
) -> None:
    if not kernel.read_only:
        raise InstitutionalError("Observatory requires a read-only Kernel")
    if not (1 <= int(port) <= 65535):
        raise InstitutionalError("port must be between 1 and 65535")
    if not unsafe_bind and not is_loopback_host(host):
        raise InstitutionalError("refusing non-loopback Observatory bind without --unsafe-bind")

    class Handler(BaseHTTPRequestHandler):
        server_version = "PowerfarmContinuum/3"
        sys_version = ""

        def setup(self):
            super().setup()
            self.connection.settimeout(8.0)

        def _headers(self, content_type: str, content_length: int, status: int) -> None:
            self.send_response(status)
            self.send_header("content-type", content_type)
            self.send_header("cache-control", "no-store, max-age=0")
            self.send_header("content-length", str(content_length))
            self.send_header("x-content-type-options", "nosniff")
            self.send_header("x-frame-options", "DENY")
            self.send_header("referrer-policy", "no-referrer")
            self.send_header("permissions-policy", "camera=(), microphone=(), geolocation=()")
            self.send_header("cross-origin-resource-policy", "same-origin")
            self.send_header("cross-origin-opener-policy", "same-origin")
            self.send_header(
                "content-security-policy",
                "default-src 'none'; script-src 'self'; style-src 'self'; "
                "connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
            )
            self.end_headers()

        def _bytes(self, body: bytes, content_type: str, status: int = 200, *, head: bool = False):
            self._headers(content_type, len(body), status)
            if not head:
                self.wfile.write(body)

        def _json(self, value, status: int = 200, *, head: bool = False):
            body = json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False).encode("utf-8")
            self._bytes(body, "application/json; charset=utf-8", status, head=head)

        def _handle_get(self, *, head: bool = False):
            if len(self.path) > MAX_QUERY_LENGTH:
                self._json({"error": "request target too long"}, 414, head=head)
                return
            parsed = urlparse(self.path)
            q = parse_qs(parsed.query, keep_blank_values=False, max_num_fields=32)
            branch = q.get("branch", ["main"])[0]
            try:
                if parsed.path == "/":
                    self._bytes(UI.read_bytes(), "text/html; charset=utf-8", head=head)
                elif parsed.path in STATIC_ASSETS:
                    asset, content_type = STATIC_ASSETS[parsed.path]
                    self._bytes(asset.read_bytes(), content_type, head=head)
                elif parsed.path == "/api/branches":
                    self._json(kernel.branch_rows(), head=head)
                elif parsed.path == "/api/events":
                    events = kernel.events(branch)
                    if len(events) > MAX_EVENT_RESPONSE:
                        events = events[-MAX_EVENT_RESPONSE:]
                    self._json([e.public() for e in events], head=head)
                elif parsed.path == "/api/head":
                    self._json(kernel.head(branch), head=head)
                elif parsed.path == "/api/state":
                    self._json(
                        kernel.state(branch, q.get("at", [None])[0], q.get("known_at", [None])[0]),
                        head=head,
                    )
                elif parsed.path == "/api/findings":
                    self._json(kernel.findings(branch), head=head)
                elif parsed.path == "/api/proof":
                    event_id = q.get("id", [""])[0]
                    self._json(kernel.proof(event_id, branch), head=head)
                elif parsed.path == "/api/impact":
                    event_id = q.get("id", [""])[0]
                    self._json(kernel.impact(event_id, branch), head=head)
                elif parsed.path == "/api/audit":
                    self._json(kernel.audit(), head=head)
                elif parsed.path == "/api/metrics":
                    self._json(metrics(kernel), head=head)
                elif parsed.path == "/api/health":
                    audit = kernel.audit()
                    self._json({"ok": bool(audit["ok"]), "institution_id": kernel._institution_id_locked(), "head": kernel.head(branch)}, status=200 if audit["ok"] else 503, head=head)
                elif parsed.path == "/api/lineage":
                    subject = q.get("subject", [""])[0]
                    if not subject or len(subject) > 1024:
                        raise ValueError("valid subject required")
                    self._json(lineage(kernel, subject, branch), head=head)
                else:
                    self._json({"error": "not found"}, 404, head=head)
            except (InstitutionalError, ValueError) as exc:
                self._json({"error": str(exc)}, 400, head=head)
            except Exception:
                self._json({"error": "internal error"}, 500, head=head)

        def do_GET(self):
            self._handle_get()

        def do_HEAD(self):
            self._handle_get(head=True)

        def _method_not_allowed(self):
            self.send_response(405)
            self.send_header("allow", "GET, HEAD")
            self.send_header("content-length", "0")
            self.send_header("x-content-type-options", "nosniff")
            self.end_headers()

        do_POST = _method_not_allowed
        do_PUT = _method_not_allowed
        do_PATCH = _method_not_allowed
        do_DELETE = _method_not_allowed
        do_OPTIONS = _method_not_allowed

        def log_message(self, fmt, *args):
            return

    class HardenedThreadingHTTPServer(ThreadingHTTPServer):
        daemon_threads = True
        allow_reuse_address = False
        request_queue_size = 32

    server = HardenedThreadingHTTPServer((host, port), Handler)
    print(f"Continuum Observatory (read-only): http://{host}:{port}")
    try:
        server.serve_forever()
    finally:
        server.server_close()
