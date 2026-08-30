from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

from .encoding import b64url_decode, b64url_encode


def generate_private_key() -> ec.EllipticCurvePrivateKey:
    return ec.generate_private_key(ec.SECP256R1())


def _number_bytes(value: int) -> bytes:
    return value.to_bytes(32, "big")


def public_jwk(public_key: ec.EllipticCurvePublicKey) -> dict[str, str]:
    numbers = public_key.public_numbers()
    return {
        "kty": "EC",
        "crv": "P-256",
        "x": b64url_encode(_number_bytes(numbers.x)),
        "y": b64url_encode(_number_bytes(numbers.y)),
        "use": "sig",
        "alg": "ES256",
    }


def public_key_from_jwk(jwk: dict[str, Any]) -> ec.EllipticCurvePublicKey:
    required = {"kty": "EC", "crv": "P-256"}
    for key, expected in required.items():
        if jwk.get(key) != expected:
            raise ValueError(f"unsupported JWK {key}")
    x = int.from_bytes(b64url_decode(str(jwk["x"])), "big")
    y = int.from_bytes(b64url_decode(str(jwk["y"])), "big")
    return ec.EllipticCurvePublicNumbers(x, y, ec.SECP256R1()).public_key()


def key_fingerprint(public_key: ec.EllipticCurvePublicKey) -> str:
    encoded = public_key.public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return hashlib.sha256(encoded).hexdigest()


def save_private_key(path: str | Path, private_key: ec.EllipticCurvePrivateKey) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    data = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    fd = os.open(target, flags, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=True) as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
    except Exception:
        try:
            target.unlink()
        except OSError:
            pass
        raise
    return target


def save_public_key(path: str | Path, public_key: ec.EllipticCurvePublicKey) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    data = public_key.public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    target.write_bytes(data)
    try:
        os.chmod(target, 0o644)
    except OSError:
        pass
    return target


def load_private_key(path: str | Path) -> ec.EllipticCurvePrivateKey:
    key = serialization.load_pem_private_key(Path(path).read_bytes(), password=None)
    if not isinstance(key, ec.EllipticCurvePrivateKey) or not isinstance(key.curve, ec.SECP256R1):
        raise ValueError("witness private key must be P-256")
    return key


def load_public_key(path: str | Path) -> ec.EllipticCurvePublicKey:
    key = serialization.load_pem_public_key(Path(path).read_bytes())
    if not isinstance(key, ec.EllipticCurvePublicKey) or not isinstance(key.curve, ec.SECP256R1):
        raise ValueError("witness public key must be P-256")
    return key


def sign_digest(private_key: ec.EllipticCurvePrivateKey, digest_hex: str) -> str:
    if len(digest_hex) != 64:
        raise ValueError("digest must be SHA-256 hex")
    digest = bytes.fromhex(digest_hex)
    signature = private_key.sign(digest, ec.ECDSA(hashes.SHA256()))
    return b64url_encode(signature)


def verify_digest(public_key: ec.EllipticCurvePublicKey, digest_hex: str, signature: str) -> bool:
    if len(digest_hex) != 64:
        return False
    try:
        public_key.verify(
            b64url_decode(signature),
            bytes.fromhex(digest_hex),
            ec.ECDSA(hashes.SHA256()),
        )
        return True
    except (InvalidSignature, ValueError):
        return False
