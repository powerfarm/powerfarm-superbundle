from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol, runtime_checkable


@runtime_checkable
class RegistryDirectory(Protocol):
    """Read-only identity boundary owned by PowerFarm Registry.

    Process may ask who/what exists and who occupies an Office. It may not
    create, retire or silently replace Registry identities through this port.
    """

    def office_exists(self, office: str, *, at: str) -> bool: ...
    def occupancy_matches(self, office: str, principal: str, *, at: str) -> bool: ...
    def current_occupancy(self, office: str, *, at: str) -> dict | None: ...
    def key_binding(self, key_id: str, principal: str, office: str, *, at: str) -> dict | None: ...


@dataclass
class StaticRegistryDirectory:
    """Deterministic test/development directory. Not a production identity store."""

    offices: set[str] = field(default_factory=set)
    occupancies: dict[str, str] = field(default_factory=dict)
    occupancy_refs: dict[str, str] = field(default_factory=dict)
    identity_refs: dict[str, str] = field(default_factory=dict)
    occupancy_history: dict[str, list[dict]] = field(default_factory=dict)
    keys: dict[str, dict] = field(default_factory=dict)

    def office_exists(self, office: str, *, at: str) -> bool:
        return office in self.offices

    @staticmethod
    def _instant(value: str) -> datetime:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            raise ValueError("Registry observation time must be timezone-aware")
        return dt.astimezone(timezone.utc)

    def set_occupancy(
        self, office: str, principal: str, *, effective_at: str,
        occupancy_ref: str | None = None, identity_ref: str | None = None,
    ) -> None:
        if office not in self.occupancy_history and office in self.occupancies:
            previous = self.occupancies[office]
            self.occupancy_history[office] = [{
                "office": office,
                "principal": previous,
                "occupancy_ref": self.occupancy_refs.get(office, f"pf.occupancy.{previous}"),
                "identity_ref": self.identity_refs.get(previous, f"pf.identity.{previous}"),
                "effective_at": "1970-01-01T00:00:00Z",
            }]
        observation = {
            "office": office,
            "principal": principal,
            "occupancy_ref": occupancy_ref or f"pf.occupancy.{principal}",
            "identity_ref": identity_ref or self.identity_refs.get(principal, f"pf.identity.{principal}"),
            "effective_at": effective_at,
        }
        self.occupancy_history.setdefault(office, []).append(observation)
        self.occupancy_history[office].sort(key=lambda row: self._instant(str(row["effective_at"])))
        self.occupancies[office] = principal
        self.occupancy_refs[office] = str(observation["occupancy_ref"])
        self.identity_refs[principal] = str(observation["identity_ref"])

    def occupancy_matches(self, office: str, principal: str, *, at: str) -> bool:
        current = self.current_occupancy(office, at=at)
        return current is not None and current.get("principal") == principal

    def current_occupancy(self, office: str, *, at: str) -> dict | None:
        history = self.occupancy_history.get(office, [])
        if history:
            cutoff = self._instant(at)
            eligible = [row for row in history if self._instant(str(row["effective_at"])) <= cutoff]
            if eligible:
                return dict(eligible[-1])
        principal = self.occupancies.get(office)
        if principal is None:
            return None
        return {
            "office": office,
            "principal": principal,
            "occupancy_ref": self.occupancy_refs.get(office, f"pf.occupancy.{principal}"),
            "identity_ref": self.identity_refs.get(principal, f"pf.identity.{principal}"),
        }

    def key_binding(self, key_id: str, principal: str, office: str, *, at: str) -> dict | None:
        binding = self.keys.get(key_id)
        if not binding:
            return None
        if binding.get("principal") != principal or binding.get("office") != office:
            return None
        return dict(binding)

class RegistryTransportError(RuntimeError):
    """Registry directory transport or contract failure."""


@dataclass
class PostgrestRegistryDirectory:
    """Production read-only RegistryDirectory backed by Registry PostgREST RPCs.

    The directory uses only Registry-owned public identity projections. It does
    not receive a service-role key and it cannot write Registry state.
    """

    base_url: str
    publishable_key: str
    bearer_token: str | None = None
    timeout_seconds: float = 10.0
    allow_insecure_local: bool = False

    CONTRACT_VERSION = "powerfarm.registry.directory.v1"

    def __post_init__(self) -> None:
        from urllib.parse import urlparse

        self.base_url = self.base_url.rstrip("/")
        parsed = urlparse(self.base_url)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError("Registry base_url must be absolute")
        local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
        if parsed.scheme != "https" and not (self.allow_insecure_local and local and parsed.scheme == "http"):
            raise ValueError("Registry base_url must use HTTPS outside explicit local development")
        if not self.publishable_key or not self.publishable_key.strip():
            raise ValueError("Registry publishable_key is required")
        if not (0.1 <= float(self.timeout_seconds) <= 60.0):
            raise ValueError("Registry timeout_seconds must be between 0.1 and 60")

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "PostgrestRegistryDirectory":
        import os

        values = os.environ if env is None else env
        return cls(
            base_url=str(values.get("POWERFARM_REGISTRY_SUPABASE_URL") or values.get("SUPABASE_URL") or ""),
            publishable_key=str(values.get("POWERFARM_REGISTRY_PUBLISHABLE_KEY") or values.get("SUPABASE_PUBLISHABLE_KEY") or ""),
            bearer_token=(str(values["POWERFARM_REGISTRY_BEARER"]) if values.get("POWERFARM_REGISTRY_BEARER") else None),
            timeout_seconds=float(values.get("POWERFARM_REGISTRY_TIMEOUT_SECONDS", "10")),
            allow_insecure_local=str(values.get("POWERFARM_REGISTRY_ALLOW_INSECURE_LOCAL", "false")).lower() == "true",
        )

    def _rpc(self, name: str, payload: dict) -> dict | None:
        import json
        from urllib.error import HTTPError, URLError
        from urllib.request import Request, urlopen

        headers = {
            "apikey": self.publishable_key,
            "content-type": "application/json",
            "accept": "application/json",
        }
        if self.bearer_token:
            headers["authorization"] = f"Bearer {self.bearer_token}"
        request = Request(
            f"{self.base_url}/rest/v1/rpc/{name}",
            data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urlopen(request, timeout=float(self.timeout_seconds)) as response:
                body = response.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RegistryTransportError(f"Registry RPC {name} failed ({exc.code}): {detail}") from exc
        except URLError as exc:
            raise RegistryTransportError(f"Registry RPC {name} transport failed: {exc.reason}") from exc
        if body == "":
            return None
        try:
            value = json.loads(body)
        except json.JSONDecodeError as exc:
            raise RegistryTransportError(f"Registry RPC {name} returned invalid JSON") from exc
        if value is None:
            return None
        if not isinstance(value, dict):
            raise RegistryTransportError(f"Registry RPC {name} returned a non-object envelope")
        if value.get("contract_version") != self.CONTRACT_VERSION:
            raise RegistryTransportError(
                f"Registry RPC {name} contract mismatch: expected {self.CONTRACT_VERSION}"
            )
        data = value.get("data")
        if data is not None and not isinstance(data, dict):
            raise RegistryTransportError(f"Registry RPC {name} returned invalid data")
        return data

    def _office_snapshot(self, office: str, *, at: str) -> dict:
        data = self._rpc("powerfarm_registry_office_snapshot_v1", {
            "p_office_ref": office,
            "p_at": at,
        })
        if data is None:
            raise RegistryTransportError("Registry office snapshot unexpectedly returned null")
        if data.get("office_ref") != office:
            raise RegistryTransportError("Registry office snapshot ref mismatch")
        return data

    def office_exists(self, office: str, *, at: str) -> bool:
        return bool(self._office_snapshot(office, at=at).get("exists"))

    def current_occupancy(self, office: str, *, at: str) -> dict | None:
        snapshot = self._office_snapshot(office, at=at)
        if not snapshot.get("exists"):
            return None
        occupancy = snapshot.get("occupancy")
        if occupancy is None:
            return None
        if not isinstance(occupancy, dict):
            raise RegistryTransportError("Registry occupancy snapshot is not an object")
        principal = occupancy.get("principal_ref")
        occupancy_ref = occupancy.get("occupancy_ref")
        if not isinstance(principal, str) or not principal:
            raise RegistryTransportError("Registry occupancy omitted principal_ref")
        if not isinstance(occupancy_ref, str) or not occupancy_ref:
            raise RegistryTransportError("Registry occupancy omitted occupancy_ref")
        return {
            "office": office,
            "principal": principal,
            "occupancy_ref": occupancy_ref,
            "identity_ref": principal,
            "definition_hash": occupancy.get("definition_hash"),
            "valid_from": occupancy.get("valid_from"),
            "valid_until": occupancy.get("valid_until"),
            "observed_at": snapshot.get("observed_at"),
        }

    def occupancy_matches(self, office: str, principal: str, *, at: str) -> bool:
        occupancy = self.current_occupancy(office, at=at)
        return occupancy is not None and occupancy.get("principal") == principal

    def key_binding(self, key_id: str, principal: str, office: str, *, at: str) -> dict | None:
        data = self._rpc("powerfarm_registry_key_binding_v1", {
            "p_key_fingerprint": key_id,
            "p_principal_ref": principal,
            "p_office_ref": office,
            "p_at": at,
        })
        if data is None:
            return None
        if data.get("key_id") != key_id or data.get("principal") != principal or data.get("office") != office:
            raise RegistryTransportError("Registry key binding does not match requested identity")
        if not isinstance(data.get("jwk"), dict):
            raise RegistryTransportError("Registry key binding omitted JWK")
        return data
