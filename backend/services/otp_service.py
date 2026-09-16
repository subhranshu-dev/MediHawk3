"""
OTP service — generation, hashing, verification, rate limiting.

Security design:
  - OTP generated with secrets.randbelow (CSPRNG, not math.random).
  - Only a keyed HMAC-SHA256 stored in the database (never plaintext).
  - Attempt counting blocks brute-force after OTP_MAX_ATTEMPTS failures.
  - Resend cooldown prevents email flooding.
  - Consumed/expired sessions cannot be reused.
  - OTP is never logged, returned in responses, or stored in plaintext.
  - Sessions are bound to a user_id to prevent cross-account OTP confusion.
"""
from __future__ import annotations

import hashlib
import hmac as _hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)


# ── Cryptographic helpers ─────────────────────────────────────────────────────

def _generate_otp() -> str:
    """Return a cryptographically secure 6-digit zero-padded OTP."""
    return f'{secrets.randbelow(1_000_000):06d}'


def _hmac_digest(otp_plaintext: str, secret: str) -> str:
    """HMAC-SHA256 hex digest of otp_plaintext, keyed with secret."""
    return _hmac.new(
        secret.encode('utf-8'),
        otp_plaintext.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()


def _constant_compare(a: str, b: str) -> bool:
    """Timing-safe string comparison."""
    return _hmac.compare_digest(a, b)


# ── Public exception ──────────────────────────────────────────────────────────

class OtpError(Exception):
    def __init__(self, code: str, message: str, http_status: int = 400):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


# ── Public interface ──────────────────────────────────────────────────────────

def request_otp(cfg: dict, identifier: str, purpose: str, user_id: str | None = None) -> str:
    """
    Create a new OTP session for identifier/purpose.
    Returns the plaintext OTP — caller must send it by email and then discard it.
    Raises OtpError if rate-limited.

    identifier must already be normalized (see utils.normalizers).
    user_id binds the session to a specific account, preventing cross-account confusion.
    """
    from extensions import db
    from models.audit import OTPSession

    now = datetime.now(timezone.utc)
    cooldown_sec = cfg.get('OTP_RESEND_COOLDOWN_SECONDS', 60)
    max_per_hour = cfg.get('OTP_MAX_REQUESTS_PER_HOUR', 10)
    expiry_sec = cfg.get('OTP_EXPIRY_SECONDS', 300)
    hmac_secret = cfg.get('OTP_HMAC_SECRET', 'change-me')

    # Find most-recent unconsumed session for this identifier+purpose
    existing: OTPSession | None = (
        OTPSession.query
        .filter_by(contact=identifier, purpose=purpose)
        .filter(OTPSession.consumed_at.is_(None))
        .order_by(OTPSession.created_at.desc())
        .first()
    )

    if existing is not None:
        # Enforce resend cooldown
        last_req = existing.last_request_at or existing.created_at
        if last_req.tzinfo is None:
            last_req = last_req.replace(tzinfo=timezone.utc)
        elapsed = (now - last_req).total_seconds()
        if elapsed < cooldown_sec:
            remaining = int(cooldown_sec - elapsed)
            raise OtpError(
                'OTP_RATE_LIMITED',
                f'Please wait {remaining} seconds before requesting a new OTP.',
                429,
            )
        # Enforce hourly limit
        if (existing.request_count or 0) >= max_per_hour:
            raise OtpError(
                'OTP_RATE_LIMITED',
                'Too many OTP requests. Please try again later.',
                429,
            )
        # Invalidate old session
        existing.consumed_at = now
        existing.used = True
        db.session.add(existing)
        new_request_count = (existing.request_count or 1) + 1
    else:
        new_request_count = 1

    otp_plaintext = _generate_otp()
    session = OTPSession(
        contact=identifier,
        purpose=purpose,
        code_hash=_hmac_digest(otp_plaintext, hmac_secret),
        expires_at=now + timedelta(seconds=expiry_sec),
        attempts=0,
        consumed_at=None,
        request_count=new_request_count,
        last_request_at=now,
        used=False,
        user_id=user_id,
    )
    db.session.add(session)
    db.session.commit()
    # Return plaintext — caller must email it and then let this reference go out of scope
    return otp_plaintext


def cancel_pending_otp(identifier: str, purpose: str) -> None:
    """
    Mark the most-recent unconsumed OTP session as consumed.
    Call this when email delivery fails so no valid session is left behind.
    """
    from extensions import db
    from models.audit import OTPSession

    now = datetime.now(timezone.utc)
    session: OTPSession | None = (
        OTPSession.query
        .filter_by(contact=identifier, purpose=purpose)
        .filter(OTPSession.consumed_at.is_(None))
        .order_by(OTPSession.created_at.desc())
        .first()
    )
    if session is not None:
        session.consumed_at = now
        session.used = True
        db.session.commit()
        logger.debug('OTP session cancelled (delivery failure): contact=%s purpose=%s', identifier, purpose)


def verify_otp(cfg: dict, identifier: str, purpose: str, otp_plaintext: str) -> str | None:
    """
    Verify otp_plaintext against the active session for identifier/purpose.
    Consumes the session on success.
    Returns the session's user_id (may be None for old sessions without binding).
    Raises OtpError on any failure (expired, wrong, too many attempts, etc.).
    """
    from extensions import db
    from models.audit import OTPSession

    now = datetime.now(timezone.utc)
    max_attempts = cfg.get('OTP_MAX_ATTEMPTS', 5)
    hmac_secret = cfg.get('OTP_HMAC_SECRET', 'change-me')

    session: OTPSession | None = (
        OTPSession.query
        .filter_by(contact=identifier, purpose=purpose)
        .filter(OTPSession.consumed_at.is_(None))
        .order_by(OTPSession.created_at.desc())
        .first()
    )

    if session is None:
        raise OtpError('OTP_INVALID', 'Invalid or expired OTP.', 401)

    # Check expiry
    expires = session.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now > expires:
        session.consumed_at = now
        session.used = True
        db.session.commit()
        raise OtpError('OTP_EXPIRED', 'OTP has expired. Please request a new one.', 401)

    # Check attempt limit
    attempts_used = session.attempts or 0
    if attempts_used >= max_attempts:
        session.consumed_at = now
        session.used = True
        db.session.commit()
        raise OtpError('OTP_RATE_LIMITED', 'Too many incorrect attempts. Please request a new OTP.', 429)

    # Verify HMAC — timing-safe
    expected = _hmac_digest(otp_plaintext, hmac_secret)
    if not _constant_compare(session.code_hash, expected):
        session.attempts = attempts_used + 1
        remaining = max_attempts - session.attempts
        if remaining <= 0:
            session.consumed_at = now
            session.used = True
        db.session.commit()
        msg = (
            f'Invalid OTP. {remaining} attempt(s) remaining.'
            if remaining > 0
            else 'OTP invalidated after too many attempts.'
        )
        raise OtpError('OTP_INVALID', msg, 401)

    # Success — consume session, return user_id for caller to validate account binding
    bound_user_id = session.user_id
    session.consumed_at = now
    session.used = True
    db.session.commit()
    return bound_user_id
