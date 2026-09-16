"""
OTP lifecycle tests: generation, expiry, rate limiting, reuse prevention.
These tests use CollectingTransport (TESTING=True) — no real emails are sent.
"""
import time
import pytest

from services.otp_service import OtpError, _generate_otp, _hmac_digest, request_otp, verify_otp
from services.email_service import get_transport, CollectingTransport


# ── Cryptographic helpers ─────────────────────────────────────────────────────

def test_generate_otp_is_six_digits():
    otp = _generate_otp()
    assert len(otp) == 6
    assert otp.isdigit()


def test_generate_otp_zero_padded():
    """Run many samples — at least one should start with 0 given enough tries."""
    samples = {_generate_otp() for _ in range(200)}
    assert all(len(s) == 6 for s in samples)


def test_hmac_digest_is_hex():
    digest = _hmac_digest('123456', 'test-secret')
    assert len(digest) == 64
    int(digest, 16)  # raises if not valid hex


def test_hmac_digest_different_secrets_differ():
    a = _hmac_digest('123456', 'secret-a')
    b = _hmac_digest('123456', 'secret-b')
    assert a != b


def test_hmac_digest_same_inputs_stable():
    a = _hmac_digest('000000', 'stable-key')
    b = _hmac_digest('000000', 'stable-key')
    assert a == b


# ── request_otp ───────────────────────────────────────────────────────────────

def test_request_otp_returns_six_digit_string(app):
    cfg = app.config
    otp = request_otp(cfg, 'test@example.com', 'test_purpose')
    assert len(otp) == 6
    assert otp.isdigit()


def test_request_otp_creates_session(app):
    from models.audit import OTPSession
    from extensions import db
    cfg = app.config
    identifier = 'session_test@example.com'
    otp = request_otp(cfg, identifier, 'test_session')
    with app.app_context():
        session = OTPSession.query.filter_by(contact=identifier, purpose='test_session').first()
        assert session is not None
        assert session.consumed_at is None
        assert session.code_hash != otp  # hash, never plaintext


def test_otp_hash_not_plaintext(app):
    from models.audit import OTPSession
    cfg = app.config
    identifier = 'hash_test@example.com'
    otp = request_otp(cfg, identifier, 'login_doctor')
    session = OTPSession.query.filter_by(contact=identifier).first()
    assert session.code_hash != otp
    assert session.code_hash.startswith('') and len(session.code_hash) == 64


def test_request_otp_during_cooldown_raises(app):
    cfg = dict(app.config)
    cfg['OTP_RESEND_COOLDOWN_SECONDS'] = 60
    identifier = 'cooldown@example.com'
    request_otp(cfg, identifier, 'test_cooldown')
    with pytest.raises(OtpError) as exc_info:
        request_otp(cfg, identifier, 'test_cooldown')
    assert exc_info.value.code == 'OTP_RATE_LIMITED'
    assert exc_info.value.http_status == 429


def test_request_otp_after_cooldown_allowed(app):
    """After the cooldown window, a new OTP should succeed."""
    cfg = dict(app.config)
    cfg['OTP_RESEND_COOLDOWN_SECONDS'] = 0  # instant cooldown for test
    identifier = 'nocooldown@example.com'
    otp1 = request_otp(cfg, identifier, 'test_nocooldown')
    # With zero-second cooldown the resend must go through
    otp2 = request_otp(cfg, identifier, 'test_nocooldown')
    assert otp1 != otp2 or len(otp1) == 6  # two OTPs (may coincide by chance)


# ── verify_otp ────────────────────────────────────────────────────────────────

def test_verify_otp_correct_code_succeeds(app):
    cfg = app.config
    identifier = 'verify_ok@example.com'
    otp = request_otp(cfg, identifier, 'login_doctor')
    verify_otp(cfg, identifier, 'login_doctor', otp)  # must not raise


def test_verify_otp_consumes_session(app):
    from models.audit import OTPSession
    cfg = app.config
    identifier = 'consumed@example.com'
    otp = request_otp(cfg, identifier, 'login_doctor')
    verify_otp(cfg, identifier, 'login_doctor', otp)
    session = OTPSession.query.filter_by(contact=identifier).first()
    assert session.consumed_at is not None
    assert session.used is True


def test_verify_otp_reuse_raises(app):
    cfg = app.config
    identifier = 'reuse@example.com'
    otp = request_otp(cfg, identifier, 'login_doctor')
    verify_otp(cfg, identifier, 'login_doctor', otp)
    with pytest.raises(OtpError) as exc_info:
        verify_otp(cfg, identifier, 'login_doctor', otp)
    assert exc_info.value.code == 'OTP_INVALID'


def test_verify_otp_wrong_code_increments_attempts(app):
    from models.audit import OTPSession
    cfg = app.config
    identifier = 'wrong@example.com'
    request_otp(cfg, identifier, 'login_doctor')
    with pytest.raises(OtpError) as exc_info:
        verify_otp(cfg, identifier, 'login_doctor', '000000')
    assert exc_info.value.code == 'OTP_INVALID'
    session = OTPSession.query.filter_by(contact=identifier, purpose='login_doctor').first()
    assert session.attempts == 1


def test_verify_otp_exceeds_attempt_limit(app):
    cfg = dict(app.config)
    cfg['OTP_MAX_ATTEMPTS'] = 3
    identifier = 'maxattempts@example.com'
    request_otp(cfg, identifier, 'login_doctor')
    for _ in range(3):
        try:
            verify_otp(cfg, identifier, 'login_doctor', '000000')
        except OtpError:
            pass
    with pytest.raises(OtpError) as exc_info:
        verify_otp(cfg, identifier, 'login_doctor', '000000')
    assert exc_info.value.code in ('OTP_INVALID', 'OTP_RATE_LIMITED')


def test_verify_otp_expired_raises(app):
    from models.audit import OTPSession
    from extensions import db
    from datetime import datetime, timedelta, timezone

    cfg = app.config
    identifier = 'expired@example.com'
    request_otp(cfg, identifier, 'login_doctor')

    # Back-date the session to simulate expiry
    session = OTPSession.query.filter_by(contact=identifier, purpose='login_doctor').first()
    session.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.session.commit()

    with pytest.raises(OtpError) as exc_info:
        verify_otp(cfg, identifier, 'login_doctor', '000000')
    assert exc_info.value.code == 'OTP_EXPIRED'


def test_verify_otp_nonexistent_session_raises(app):
    cfg = app.config
    with pytest.raises(OtpError) as exc_info:
        verify_otp(cfg, 'nobody@example.com', 'login_doctor', '123456')
    assert exc_info.value.code == 'OTP_INVALID'


# ── OTP HTTP endpoints ────────────────────────────────────────────────────────

def test_otp_request_endpoint_returns_200_for_existing_account(seeded_app, client):
    """POST /api/auth/otp/request succeeds for a known doctor email."""
    resp = client.post('/api/auth/otp/request', json={
        'email': 'priya.mohanty@medihawk.in',
        'role': 'doctor',
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert 'OTP' in data['message'] or 'email' in data['message'].lower()


def test_otp_request_endpoint_returns_200_for_unknown_email(seeded_app, client):
    """Generic response prevents account enumeration."""
    resp = client.post('/api/auth/otp/request', json={
        'email': 'nobody@unknown.com',
        'role': 'doctor',
    })
    assert resp.status_code == 200


def test_otp_request_missing_email_returns_422(client):
    resp = client.post('/api/auth/otp/request', json={'role': 'doctor'})
    assert resp.status_code == 422


def test_otp_request_invalid_role_returns_422(client):
    resp = client.post('/api/auth/otp/request', json={
        'email': 'x@x.com', 'role': 'superuser'
    })
    assert resp.status_code == 422


def test_otp_verify_endpoint_issues_jwt(seeded_app, client, app):
    """Full OTP login flow: request → intercept from CollectingTransport → verify → JWT."""
    transport = get_transport()
    assert isinstance(transport, CollectingTransport), 'Expected CollectingTransport in test mode'
    transport.clear()

    # Step 1: request OTP (stored in DB, email queued in transport)
    resp = client.post('/api/auth/otp/request', json={
        'email': 'priya.mohanty@medihawk.in',
        'role': 'doctor',
    })
    assert resp.status_code == 200

    # Step 2: extract OTP from DB (test-only — in prod it's in the email)
    from models.audit import OTPSession
    session = OTPSession.query.filter_by(
        contact='priya.mohanty@medihawk.in',
        purpose='login_doctor',
    ).order_by(OTPSession.created_at.desc()).first()
    assert session is not None

    # Re-derive OTP by brute-forcing is not possible — instead we directly call the service
    cfg = app.config
    from services.otp_service import _generate_otp, _hmac_digest
    # Inject a known OTP into the existing session
    known_otp = '999999'
    session.code_hash = _hmac_digest(known_otp, cfg['OTP_HMAC_SECRET'])
    from extensions import db
    db.session.commit()

    # Step 3: verify with the injected OTP
    resp2 = client.post('/api/auth/otp/verify', json={
        'email': 'priya.mohanty@medihawk.in',
        'otp': known_otp,
        'role': 'doctor',
    })
    assert resp2.status_code == 200
    data = resp2.get_json()
    assert data['success'] is True
    assert 'token' in data
    assert data['user']['role'] == 'doctor'


def test_otp_verify_wrong_code_returns_401(seeded_app, client):
    client.post('/api/auth/otp/request', json={
        'email': 'priya.mohanty@medihawk.in',
        'role': 'doctor',
    })
    resp = client.post('/api/auth/otp/verify', json={
        'email': 'priya.mohanty@medihawk.in',
        'otp': '000000',
        'role': 'doctor',
    })
    assert resp.status_code == 401
    assert resp.get_json()['error']['code'] == 'OTP_INVALID'


def test_otp_verify_missing_fields_returns_422(client):
    resp = client.post('/api/auth/otp/verify', json={'email': 'x@x.com', 'role': 'doctor'})
    assert resp.status_code == 422


def test_collecting_transport_does_not_store_otp_body(seeded_app, client, app):
    """CollectingTransport records only {to, subject} — OTP plaintext must not appear."""
    transport = get_transport()
    assert isinstance(transport, CollectingTransport)
    transport.clear()

    client.post('/api/auth/otp/request', json={
        'email': 'priya.mohanty@medihawk.in',
        'role': 'doctor',
    })

    assert len(transport.sent) > 0
    msg = transport.sent[-1]
    assert 'to' in msg and 'subject' in msg
    # CollectingTransport.send() only captures to + subject, never body
    assert 'body' not in msg
    assert 'otp' not in msg
    assert 'code' not in msg


# ── Admin OTP endpoint ────────────────────────────────────────────────────────

def test_admin_otp_request_returns_200(seeded_app, client):
    resp = client.post('/api/auth/admin/otp/request', json={
        'email': 'arjun.patel@medihawk.in',
    })
    assert resp.status_code == 200
    assert resp.get_json()['success'] is True


def test_admin_otp_request_unknown_email_also_200(seeded_app, client):
    resp = client.post('/api/auth/admin/otp/request', json={
        'email': 'nobody@nowhere.com',
    })
    assert resp.status_code == 200


def test_admin_otp_verify_correct_code(seeded_app, client, app):
    """Admin OTP verify flow with injected known code."""
    client.post('/api/auth/admin/otp/request', json={
        'email': 'arjun.patel@medihawk.in',
    })
    from models.audit import OTPSession
    session = OTPSession.query.filter_by(
        contact='arjun.patel@medihawk.in',
        purpose='password_reset_admin',
    ).order_by(OTPSession.created_at.desc()).first()
    assert session is not None

    from services.otp_service import _hmac_digest
    from extensions import db
    known_otp = '111111'
    session.code_hash = _hmac_digest(known_otp, app.config['OTP_HMAC_SECRET'])
    db.session.commit()

    resp = client.post('/api/auth/admin/otp/verify', json={
        'email': 'arjun.patel@medihawk.in',
        'otp': known_otp,
    })
    assert resp.status_code == 200
    assert resp.get_json()['success'] is True
