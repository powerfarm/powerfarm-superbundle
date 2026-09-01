from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Callable, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from powerfarm.core.canonical import sha256_json
from powerfarm.model import Event


class ProcessWriterError(RuntimeError):
    pass


@dataclass
class PostgrestAdmissionWriter:
    """Production transactional persistence boundary for admitted Continuum acts."""

    base_url: str
    publishable_key: str
    token_provider: Callable[[], str]
    timeout_seconds: float = 10.0
    allow_insecure_local: bool = False

    CONTRACT_VERSION = "powerfarm.process.admission-write.v2"

    def __post_init__(self) -> None:
        self.base_url = self.base_url.rstrip("/")
        parsed = urlparse(self.base_url)
        local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
        if not parsed.scheme or not parsed.netloc:
            raise ValueError("Process base_url must be absolute")
        if parsed.scheme != "https" and not (self.allow_insecure_local and local and parsed.scheme == "http"):
            raise ValueError("Process base_url must use HTTPS outside explicit local development")
        if not self.publishable_key:
            raise ValueError("Process publishable_key is required")
        if not callable(self.token_provider):
            raise TypeError("Process token_provider must be callable")

    def _rpc(self, name: str, body: dict) -> dict:
        token = self.token_provider()
        if not isinstance(token, str) or not token:
            raise ProcessWriterError("Process writer token provider returned no token")
        req = Request(
            f"{self.base_url}/rest/v1/rpc/{name}",
            data=json.dumps(body, separators=(",", ":")).encode(),
            headers={
                "apikey": self.publishable_key,
                "authorization": f"Bearer {token}",
                "content-type": "application/json",
                "content-profile": "continuum",
                "accept-profile": "continuum",
                "accept": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(req, timeout=self.timeout_seconds) as response:
                raw = response.read().decode()
        except HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise ProcessWriterError(f"Process RPC {name} failed ({exc.code}): {detail}") from exc
        except URLError as exc:
            raise ProcessWriterError(f"Process RPC {name} transport failed: {exc.reason}") from exc
        try:
            envelope = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ProcessWriterError(f"Process RPC {name} returned invalid JSON") from exc
        if not isinstance(envelope, dict) or envelope.get("contract_version") != self.CONTRACT_VERSION:
            raise ProcessWriterError(f"Process RPC {name} contract mismatch")
        data = envelope.get("data")
        if not isinstance(data, dict):
            raise ProcessWriterError(f"Process RPC {name} returned invalid data")
        return data

    def bootstrap(self, *, institution_id: str, title: str | None = None, timeline_id: str = "main") -> dict:
        return self._rpc("bootstrap_institution_v2", {
            "p_institution_id": institution_id,
            "p_title": title,
            "p_timeline_id": timeline_id,
        })

    @staticmethod
    def event_row(event: Event, *, occupancy_ref: str | None = None) -> dict:
        payload = event.payload if isinstance(event.payload, dict) else {}
        return {
            "id": event.id,
            "timeline_index": event.branch_index,
            "request_id": event.request_id,
            "recorded_at": event.recorded_at,
            "effective_at": event.effective_at,
            "actor_ref": event.actor,
            "office_ref": event.office,
            "occupancy_ref": occupancy_ref,
            "kind": event.kind,
            "subject": event.subject,
            "payload": payload,
            "causes": list(event.causes),
            "authority_ref": event.authority_ref,
            "direction_ref": payload.get("direction_ref"),
            "effective_capability_set_sha256": payload.get("effective_capability_set_sha256"),
            "intent_sha256": event.intent_hash,
            "prev_sha256": event.prev_hash,
            "sha256": event.hash,
            "local_seal": event.seal,
        }

    def persist(
        self,
        *,
        institution_id: str,
        events: Iterable[Event],
        request_id: str,
        timeline_id: str = "main",
        occupancy_refs: dict[str, str] | None = None,
        card_ref: str,
        beat_ref: str,
        attempt_ref: str,
        execution_slice_sha256: str,
        trace_ref: str | None = None,
    ) -> dict:
        rows = [self.event_row(event, occupancy_ref=(occupancy_refs or {}).get(event.id)) for event in events]
        if not rows:
            raise ValueError("Process admission batch must contain at least one event")
        data = {
            "request_id": request_id,
            "institution_id": institution_id,
            "timeline_id": timeline_id,
            "expected_prev_sha256": rows[0]["prev_sha256"],
            "acts": rows,
            "card_ref": card_ref,
            "beat_ref": beat_ref,
            "attempt_ref": attempt_ref,
            "execution_slice_sha256": execution_slice_sha256,
            "trace_ref": trace_ref,
        }
        digest_body = dict(data)
        data["request_sha256"] = sha256_json(digest_body)
        return self._rpc("admit_card_batch_v2", {
            "p_request": {"contract_version": self.CONTRACT_VERSION, "data": data}
        })
