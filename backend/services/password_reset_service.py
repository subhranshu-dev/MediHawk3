"""
Password reset token service.

Reset tokens are short-lived JWTs (purpose='password_reset') issued after
OTP verification. They are single-use: the caller must invalidate them after
a successful password update by not reissuing and not storing them server-side.

Security properties:
  - Signed with JWT_SECRET_KEY — cannot be forged without the server secret.
  - purpose claim prevents reuse of login or other JWTs as reset tokens.
  - Short expiry (default 15 min) limits the window of exposure.
  - Role is embedded so the correct user table is updated without trusting the client.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt as pyjwt


class ResetTokenError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def generate_reset_token(user_id: str, role: str, secret: str, expiry_minutes: int = 15) -> str:
    """Return a signed JWT for password reset. Expires in expiry_minutes."""
    now = datetime.now(tz=timezone.utc)
    payload = {
        'sub': user_id,
        'role': role,
        'purpose': 'password_reset',
        'iat': now,
        'exp': now + timedelta(minutes=expiry_minutes),
    }
    return pyjwt.encode(payload, secret, algorithm='HS256')


def verify_reset_token(token: str, secret: str) -> tuple[str, str]:
    """
    Verify a password reset token.
    Returns (user_id, role) on success.
    Raises ResetTokenError on any failure (expired, invalid, wrong purpose).
    """
    try:
        payload = pyjwt.decode(token, secret, algorithms=['HS256'])
    except pyjwt.ExpiredSignatureError:
        raise ResetTokenError('RESET_TOKEN_EXPIRED', 'Password reset link has expired. Please start over.')
    except pyjwt.InvalidTokenError:
        raise ResetTokenError('RESET_TOKEN_INVALID', 'Invalid password reset token.')

    if payload.get('purpose') != 'password_reset':
        raise ResetTokenError('RESET_TOKEN_INVALID', 'Invalid password reset token.')

    user_id = payload.get('sub')
    role = payload.get('role')
    if not user_id or not role:
        raise ResetTokenError('RESET_TOKEN_INVALID', 'Invalid password reset token.')

    return user_id, role
