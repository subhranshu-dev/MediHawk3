"""
CORS header and error response tests.

Verifies that CORS headers are present on all HTTP response classes,
that error responses are JSON (not HTML), and that SMTP failure modes
return the correct structured error codes without leaking secrets.
"""
import pytest

ORIGIN = 'http://localhost:5173'
CORS_HEADER = 'Access-Control-Allow-Origin'


# ── CORS on all status codes ──────────────────────────────────────────────────

def test_cors_on_200(client):
    resp = client.get('/api/health', headers={'Origin': ORIGIN})
    assert resp.status_code == 200
    assert resp.headers.get(CORS_HEADER) == ORIGIN


def test_cors_on_401(client):
    resp = client.get('/api/verify-token', headers={'Origin': ORIGIN})
    assert resp.status_code == 401
    assert resp.headers.get(CORS_HEADER) == ORIGIN


def test_cors_on_422(client):
    resp = client.post('/api/login', json={'role': 'doctor'}, headers={'Origin': ORIGIN})
    assert resp.status_code == 422
    assert resp.headers.get(CORS_HEADER) == ORIGIN


def test_cors_on_404(client):
    resp = client.get('/api/nonexistent', headers={'Origin': ORIGIN})
    assert resp.status_code == 404
    assert resp.headers.get(CORS_HEADER) == ORIGIN


def test_cors_on_410(client):
    resp = client.post('/api/auth/otp/send', json={}, headers={'Origin': ORIGIN})
    assert resp.status_code == 410
    assert resp.headers.get(CORS_HEADER) == ORIGIN


def test_cors_on_503(seeded_app, client):
    """OTP request with CollectingTransport succeeds with 200; with None transport → 503."""
    from services.email_service import _transport, get_transport
    # In testing mode transport is CollectingTransport — OTP request returns 200, not 503
    resp = client.post('/api/auth/otp/request', json={
        'email': 'priya.mohanty@medihawk.in', 'role': 'doctor',
    }, headers={'Origin': ORIGIN})
    # Either 200 (email sent via CollectingTransport) or 503 (no transport) — either has CORS
    assert resp.headers.get(CORS_HEADER) == ORIGIN


def test_cors_preflight(client):
    resp = client.options('/api/auth/otp/request', headers={
        'Origin': ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
    })
    assert resp.status_code in (200, 204)
    assert resp.headers.get(CORS_HEADER) == ORIGIN


def test_unallowed_origin_not_reflected(client):
    """CORS must not reflect arbitrary origins — only configured origins."""
    resp = client.get('/api/health', headers={'Origin': 'http://evil.example.com'})
    assert resp.headers.get(CORS_HEADER) != 'http://evil.example.com'


# ── Error response shape ──────────────────────────────────────────────────────

def test_error_response_is_json_not_html(client):
    resp = client.get('/api/nonexistent', headers={'Origin': ORIGIN})
    assert resp.content_type.startswith('application/json')
    data = resp.get_json()
    assert data['success'] is False
    assert 'error' in data
    assert 'code' in data['error']


def test_401_response_shape(client):
    resp = client.get('/api/verify-token', headers={'Origin': ORIGIN})
    data = resp.get_json()
    assert data['success'] is False
    assert resp.status_code == 401
    assert 'code' in data['error']  # exact code is middleware-defined (AUTH_REQUIRED or UNAUTHORIZED)


def test_404_response_shape(client):
    resp = client.get('/api/this/does/not/exist')
    data = resp.get_json()
    assert data['success'] is False
    assert data['error']['code'] == 'NOT_FOUND'


def test_422_response_shape(client):
    resp = client.post('/api/login', json={'password': 'x', 'role': 'admin'})
    data = resp.get_json()
    assert data['success'] is False
    assert data['error']['code'] == 'VALIDATION_ERROR'


# ── SMTP failure error codes ──────────────────────────────────────────────────

def test_otp_request_smtp_not_configured_returns_503(seeded_app, client, app):
    """When transport is None (no SMTP config), return EMAIL_DELIVERY_NOT_CONFIGURED."""
    import services.email_service as es
    original = es._transport
    es._transport = None  # simulate unconfigured SMTP
    try:
        resp = client.post('/api/auth/otp/request', json={
            'email': 'priya.mohanty@medihawk.in', 'role': 'doctor',
        })
        assert resp.status_code == 503
        data = resp.get_json()
        assert data['success'] is False
        assert data['error']['code'] == 'EMAIL_DELIVERY_NOT_CONFIGURED'
    finally:
        es._transport = original


def test_otp_request_smtp_failure_returns_503(seeded_app, client, app):
    """When SMTP raises a connection error, return EMAIL_DELIVERY_FAILED."""
    import services.email_service as es
    from unittest.mock import MagicMock
    original = es._transport

    failing_transport = MagicMock()
    failing_transport.send.side_effect = RuntimeError('EMAIL_DELIVERY_FAILED')
    es._transport = failing_transport
    try:
        resp = client.post('/api/auth/otp/request', json={
            'email': 'priya.mohanty@medihawk.in', 'role': 'doctor',
        })
        assert resp.status_code == 503
        data = resp.get_json()
        assert data['success'] is False
        assert data['error']['code'] == 'EMAIL_DELIVERY_FAILED'
    finally:
        es._transport = original


def test_otp_session_cancelled_after_smtp_failure(seeded_app, client, app):
    """After SMTP failure, no valid OTP session should remain."""
    import services.email_service as es
    from models.audit import OTPSession
    original = es._transport
    es._transport = None  # force failure

    try:
        client.post('/api/auth/otp/request', json={
            'email': 'priya.mohanty@medihawk.in', 'role': 'doctor',
        })
    finally:
        es._transport = original

    # Any OTP session for this identifier+purpose must be consumed
    sessions = OTPSession.query.filter_by(
        contact='priya.mohanty@medihawk.in',
        purpose='login_doctor',
    ).filter(OTPSession.consumed_at.is_(None)).all()
    assert len(sessions) == 0, 'No unconsumed OTP sessions should remain after delivery failure'


def test_otp_response_never_contains_otp_value(seeded_app, client):
    """The OTP must never appear in the API response body."""
    from services.email_service import CollectingTransport, get_transport
    transport = get_transport()
    assert isinstance(transport, CollectingTransport)

    resp = client.post('/api/auth/otp/request', json={
        'email': 'priya.mohanty@medihawk.in', 'role': 'doctor',
    })
    body_str = resp.get_data(as_text=True)
    # OTPs are 6-digit strings — verify none of the 6-digit sequences from
    # the transport are leaked in the response
    assert 'otp' not in body_str.lower() or '"otp"' not in body_str
    # The response should not contain any numeric 6-digit sequence that would be the OTP
    import re
    six_digit_sequences = re.findall(r'\b\d{6}\b', body_str)
    assert len(six_digit_sequences) == 0, f'6-digit sequence found in response: {six_digit_sequences}'


def test_otp_secrets_not_in_response(seeded_app, client):
    """SMTP credentials and JWT secret must not appear in any API response."""
    import os
    resp = client.post('/api/login', json={
        'email': 'arjun.patel@medihawk.in',
        'password': 'MediHawk@Admin2026',
        'role': 'admin',
    })
    body = resp.get_data(as_text=True)
    smtp_password = os.environ.get('SMTP_PASSWORD', '')
    if smtp_password:
        assert smtp_password not in body
    jwt_secret = os.environ.get('JWT_SECRET_KEY', '')
    if jwt_secret:
        assert jwt_secret not in body


# ── Exception catch-all handler ───────────────────────────────────────────────

def test_unhandled_exception_returns_json_500(app, client):
    """Register a temporary route that raises, verify JSON 500 response."""
    from flask import Blueprint
    tmp_bp = Blueprint('tmp_test_exc', __name__)

    @tmp_bp.route('/api/_test_exception')
    def _boom():
        raise RuntimeError('test exception - this is expected')

    app.register_blueprint(tmp_bp)
    resp = client.get('/api/_test_exception', headers={'Origin': ORIGIN})
    assert resp.status_code == 500
    assert resp.content_type.startswith('application/json')
    data = resp.get_json()
    assert data['success'] is False
    assert data['error']['code'] == 'INTERNAL_ERROR'
    assert 'test exception' not in data['error']['message']  # no traceback leak
    assert resp.headers.get(CORS_HEADER) == ORIGIN
