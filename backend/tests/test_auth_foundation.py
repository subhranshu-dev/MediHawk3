"""
Tests for authentication foundation: password hashing, JWT, and login endpoint.
"""
import pytest

from services.auth_service import (
    _make_expired_token,
    decode_token,
    generate_token,
    hash_password,
    verify_password,
)

JWT_SECRET = 'test-jwt-secret-not-for-production'


# ── Password hashing ──────────────────────────────────────────────────────────

def test_hash_is_not_plaintext():
    hashed = hash_password('mysecret')
    assert hashed != 'mysecret'
    assert len(hashed) > 20


def test_hash_uses_bcrypt_prefix():
    """bcrypt hashes start with $2b$ or $2a$."""
    hashed = hash_password('mysecret')
    assert hashed.startswith('$2')


def test_verify_correct_password():
    hashed = hash_password('mysecret')
    assert verify_password('mysecret', hashed) is True


def test_verify_wrong_password():
    hashed = hash_password('mysecret')
    assert verify_password('wrongpassword', hashed) is False


def test_two_hashes_of_same_password_differ():
    """bcrypt salts must produce different hashes each call."""
    h1 = hash_password('same')
    h2 = hash_password('same')
    assert h1 != h2
    # But both must still verify
    assert verify_password('same', h1) is True
    assert verify_password('same', h2) is True


def test_verify_handles_bad_hash_gracefully():
    """verify_password must return False (not raise) on a corrupt hash."""
    result = verify_password('anything', 'not-a-valid-hash')
    assert result is False


# ── JWT ───────────────────────────────────────────────────────────────────────

def test_generate_token_returns_string():
    token = generate_token('doc-001', 'doctor', JWT_SECRET)
    assert isinstance(token, str)
    assert len(token) > 20


def test_decode_token_correct_payload():
    token = generate_token('doc-001', 'doctor', JWT_SECRET, expiry_hours=1)
    payload = decode_token(token, JWT_SECRET)
    assert payload['sub'] == 'doc-001'
    assert payload['role'] == 'doctor'


def test_decode_token_wrong_secret_raises():
    import jwt as pyjwt
    token = generate_token('doc-001', 'doctor', JWT_SECRET)
    with pytest.raises(pyjwt.InvalidSignatureError):
        decode_token(token, 'wrong-secret')


def test_expired_token_raises():
    import jwt as pyjwt
    token = _make_expired_token('doc-001', 'doctor', JWT_SECRET)
    with pytest.raises(pyjwt.ExpiredSignatureError):
        decode_token(token, JWT_SECRET)


def test_tampered_token_raises():
    import jwt as pyjwt
    token = generate_token('doc-001', 'doctor', JWT_SECRET)
    # Flip a character in the signature
    tampered = token[:-3] + 'XXX'
    with pytest.raises(pyjwt.InvalidTokenError):
        decode_token(tampered, JWT_SECRET)


# ── Login endpoint ────────────────────────────────────────────────────────────

def test_login_with_valid_admin_credentials(seeded_app, client):
    resp = client.post('/api/login', json={
        'email': 'arjun.patel@medihawk.in',
        'password': 'MediHawk@Admin2026',
        'role': 'admin',
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert 'token' in data
    assert data['user']['role'] == 'admin'
    assert data['user']['id'] == 'admin-001'


def test_login_with_valid_doctor_credentials(seeded_app, client):
    resp = client.post('/api/login', json={
        'email': 'priya.mohanty@medihawk.in',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert data['user']['role'] == 'doctor'
    assert data['user']['phc'] == 'phc-chandaka'


def test_doctor_can_login_by_phone(seeded_app, client):
    resp = client.post('/api/login', json={
        'phone': '9861234567',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    assert resp.status_code == 200


def test_login_wrong_password_rejected(seeded_app, client):
    resp = client.post('/api/login', json={
        'email': 'arjun.patel@medihawk.in',
        'password': 'WrongPassword',
        'role': 'admin',
    })
    assert resp.status_code == 401
    assert resp.get_json()['error']['code'] == 'INVALID_CREDENTIALS'


def test_login_nonexistent_user_rejected(seeded_app, client):
    resp = client.post('/api/login', json={
        'email': 'nobody@medihawk.in',
        'password': 'anypassword',
        'role': 'admin',
    })
    assert resp.status_code == 401


def test_login_missing_password_returns_422(client):
    resp = client.post('/api/login', json={'email': 'x@x.com', 'role': 'admin'})
    assert resp.status_code == 422


def test_login_missing_email_returns_422(client):
    resp = client.post('/api/login', json={'password': 'pass', 'role': 'admin'})
    assert resp.status_code == 422


def test_login_invalid_role_returns_422(client):
    resp = client.post('/api/login', json={
        'email': 'x@x.com', 'password': 'pass', 'role': 'superuser'
    })
    assert resp.status_code == 422


def test_response_never_contains_password_hash(seeded_app, client):
    resp = client.post('/api/login', json={
        'email': 'arjun.patel@medihawk.in',
        'password': 'MediHawk@Admin2026',
        'role': 'admin',
    })
    assert 'password' not in str(resp.get_json())
    assert 'hash' not in str(resp.get_json())


# ── Protected routes ──────────────────────────────────────────────────────────

def test_verify_token_rejects_no_auth(client):
    resp = client.get('/api/verify-token')
    assert resp.status_code == 401


def test_verify_token_rejects_invalid_bearer(client):
    resp = client.get('/api/verify-token', headers={'Authorization': 'Bearer invalid.token'})
    assert resp.status_code == 401


def test_verify_token_accepts_valid_token(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/verify-token', headers=auth_headers_admin)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['valid'] is True
    assert data['user']['role'] == 'admin'


def test_logout_requires_auth(client):
    resp = client.post('/api/logout')
    assert resp.status_code == 401


def test_logout_with_valid_token_succeeds(seeded_app, client, auth_headers_admin):
    resp = client.post('/api/logout', headers=auth_headers_admin)
    assert resp.status_code == 200


# ── Legacy OTP stub routes ────────────────────────────────────────────────────

def test_otp_send_legacy_returns_410(client):
    """POST /api/auth/otp/send was moved to /api/auth/otp/request — returns 410."""
    resp = client.post('/api/auth/otp/send', json={'phone': '9861234567'})
    assert resp.status_code == 410
    assert resp.get_json()['error']['code'] == 'ENDPOINT_MOVED'


def test_admin_otp_send_unknown_returns_404(client):
    """/api/auth/admin/otp/send never existed — expect 404."""
    resp = client.post('/api/auth/admin/otp/send', json={'email': 'x@x.com'})
    assert resp.status_code == 404
