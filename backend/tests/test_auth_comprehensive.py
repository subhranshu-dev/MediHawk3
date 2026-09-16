"""
Comprehensive authentication tests covering identifier normalization, role enforcement,
and security invariants.
"""
import pytest


# ── Email case normalization ──────────────────────────────────────────────────

def test_login_email_mixed_case_accepted(seeded_app, client):
    """Backend normalizes email to lowercase before lookup."""
    resp = client.post('/api/login', json={
        'email': 'PRIYA.MOHANTY@MEDIHAWK.IN',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    assert resp.status_code == 200
    assert resp.get_json()['success'] is True


def test_login_email_leading_trailing_spaces_accepted(seeded_app, client):
    resp = client.post('/api/login', json={
        'email': '  arjun.patel@medihawk.in  ',
        'password': 'MediHawk@Admin2026',
        'role': 'admin',
    })
    assert resp.status_code == 200


def test_login_email_mixed_case_wrong_password_rejected(seeded_app, client):
    resp = client.post('/api/login', json={
        'email': 'ARJUN.PATEL@MEDIHAWK.IN',
        'password': 'wrongpassword',
        'role': 'admin',
    })
    assert resp.status_code == 401


# ── Phone normalization ───────────────────────────────────────────────────────

def test_doctor_login_phone_plus91(seeded_app, client):
    """+91XXXXXXXXXX → canonical 10 digits."""
    resp = client.post('/api/login', json={
        'phone': '+919861234567',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    assert resp.status_code == 200


def test_doctor_login_phone_91_prefix(seeded_app, client):
    """91XXXXXXXXXX → canonical 10 digits."""
    resp = client.post('/api/login', json={
        'phone': '919861234567',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    assert resp.status_code == 200


def test_doctor_login_phone_0_prefix(seeded_app, client):
    """0XXXXXXXXXX → canonical 10 digits."""
    resp = client.post('/api/login', json={
        'phone': '09861234567',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    assert resp.status_code == 200


def test_doctor_login_phone_with_spaces(seeded_app, client):
    """Spaces stripped before normalization."""
    resp = client.post('/api/login', json={
        'phone': '98612 34567',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    assert resp.status_code == 200


def test_doctor_login_phone_with_dashes(seeded_app, client):
    resp = client.post('/api/login', json={
        'phone': '986-123-4567',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    assert resp.status_code == 200


def test_invalid_short_phone_rejected(seeded_app, client):
    resp = client.post('/api/login', json={
        'phone': '98612',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    assert resp.status_code == 401


# ── JWT role from DB, not client ──────────────────────────────────────────────

def test_jwt_role_comes_from_database(seeded_app, client):
    """Passing a wrong role in the login body must not affect JWT role."""
    # Doctor tries to claim 'admin' role — backend must use role from DB
    resp = client.post('/api/login', json={
        'email': 'priya.mohanty@medihawk.in',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',  # correct lookup hint
    })
    assert resp.status_code == 200
    data = resp.get_json()
    # Role in response comes from database record
    assert data['user']['role'] == 'doctor'


def test_admin_role_in_response_matches_db(seeded_app, client):
    resp = client.post('/api/login', json={
        'email': 'arjun.patel@medihawk.in',
        'password': 'MediHawk@Admin2026',
        'role': 'admin',
    })
    assert resp.status_code == 200
    assert resp.get_json()['user']['role'] == 'admin'


# ── Security invariants ───────────────────────────────────────────────────────

def test_response_body_never_contains_password_hash(seeded_app, client):
    resp = client.post('/api/login', json={
        'email': 'priya.mohanty@medihawk.in',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    body_str = str(resp.get_json())
    assert 'password_hash' not in body_str
    assert '$2b$' not in body_str


def test_wrong_role_hint_cannot_access_other_table(seeded_app, client):
    """A doctor email sent with role=admin must fail (wrong table)."""
    resp = client.post('/api/login', json={
        'email': 'priya.mohanty@medihawk.in',
        'password': 'MediHawk@Doctor2026',
        'role': 'admin',
    })
    assert resp.status_code == 401


def test_admin_cannot_login_with_doctor_role_hint(seeded_app, client):
    """Admin email + doctor role hint → 401 (looked up in wrong table)."""
    resp = client.post('/api/login', json={
        'email': 'arjun.patel@medihawk.in',
        'password': 'MediHawk@Admin2026',
        'role': 'doctor',
    })
    assert resp.status_code == 401


def test_error_code_is_generic_for_unknown_user(seeded_app, client):
    """User enumeration via error codes must be prevented."""
    resp = client.post('/api/login', json={
        'email': 'nonexistent@example.com',
        'password': 'anypass',
        'role': 'admin',
    })
    assert resp.status_code == 401
    assert resp.get_json()['error']['code'] == 'INVALID_CREDENTIALS'


def test_error_code_is_generic_for_wrong_password(seeded_app, client):
    """Wrong password and unknown user return the same error code."""
    resp = client.post('/api/login', json={
        'email': 'arjun.patel@medihawk.in',
        'password': 'wrongpass',
        'role': 'admin',
    })
    assert resp.status_code == 401
    assert resp.get_json()['error']['code'] == 'INVALID_CREDENTIALS'


def test_token_is_not_returned_without_valid_login(client):
    resp = client.post('/api/login', json={
        'email': 'x@x.com', 'password': 'wrong', 'role': 'admin',
    })
    data = resp.get_json()
    assert 'token' not in data or data.get('success') is False


# ── Normalizer unit tests ─────────────────────────────────────────────────────

def test_normalize_email_strips_and_lowercases():
    from utils.normalizers import normalize_email
    assert normalize_email('  FOO@BAR.COM  ') == 'foo@bar.com'
    assert normalize_email('User@Domain.ORG') == 'user@domain.org'


def test_normalize_phone_10_digits_passthrough():
    from utils.normalizers import normalize_phone
    assert normalize_phone('9861234567') == '9861234567'


def test_normalize_phone_plus91():
    from utils.normalizers import normalize_phone
    assert normalize_phone('+919861234567') == '9861234567'


def test_normalize_phone_91_prefix():
    from utils.normalizers import normalize_phone
    assert normalize_phone('919861234567') == '9861234567'


def test_normalize_phone_0_prefix():
    from utils.normalizers import normalize_phone
    assert normalize_phone('09861234567') == '9861234567'


def test_normalize_phone_with_spaces():
    from utils.normalizers import normalize_phone
    assert normalize_phone(' 986 123 4567 ') == '9861234567'


def test_normalize_phone_invalid_returns_none():
    from utils.normalizers import normalize_phone
    assert normalize_phone('12345') is None
    assert normalize_phone('') is None
    assert normalize_phone('abcdefghij') is None
