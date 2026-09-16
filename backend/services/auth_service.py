"""
Authentication service.
Provides password hashing (bcrypt) and JWT operations.
Never logs or returns plaintext passwords or JWT secrets.
"""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt as pyjwt


def hash_password(plaintext: str) -> str:
    """Return a bcrypt hash of the plaintext password. Cost factor 12."""
    return bcrypt.hashpw(plaintext.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')


def verify_password(plaintext: str, hashed: str) -> bool:
    """Return True if plaintext matches the bcrypt hash. Safe against timing attacks."""
    try:
        return bcrypt.checkpw(plaintext.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def generate_token(user_id: str, role: str, secret: str, expiry_hours: int = 8) -> str:
    """Issue a signed JWT containing user_id and role."""
    exp = datetime.now(tz=timezone.utc) + timedelta(hours=expiry_hours)
    payload = {
        'sub': user_id,
        'role': role,
        'iat': datetime.now(tz=timezone.utc),
        'exp': exp,
    }
    return pyjwt.encode(payload, secret, algorithm='HS256')


def decode_token(token: str, secret: str) -> dict:
    """
    Decode and verify a JWT. Raises pyjwt.ExpiredSignatureError or
    pyjwt.InvalidTokenError on failure — callers must handle these.
    """
    return pyjwt.decode(token, secret, algorithms=['HS256'])


# ── Test / internal helper ────────────────────────────────────────────────────

def _make_expired_token(user_id: str, role: str, secret: str) -> str:
    """Create an already-expired token. For test use only."""
    exp = datetime.now(tz=timezone.utc) - timedelta(seconds=10)
    payload = {'sub': user_id, 'role': role, 'iat': datetime.now(tz=timezone.utc), 'exp': exp}
    return pyjwt.encode(payload, secret, algorithm='HS256')
