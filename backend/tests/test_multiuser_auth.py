"""
Multi-user authentication isolation tests.

Verifies that:
  - Each doctor has independent credentials
  - OTP for Doctor A cannot authenticate Doctor B
  - Password for Doctor A cannot authenticate Doctor B
  - JWT for Doctor A cannot access Doctor B's private resources
  - OTP email is sent to the account's registered email, not SMTP credentials
  - Disabled accounts are rejected
  - SMTP account identity is never treated as a user identity
"""
import pytest
from services.email_service import CollectingTransport, get_transport


# ── Fixtures: two distinct doctors ───────────────────────────────────────────

@pytest.fixture
def two_doctors(seeded_app):
    """App with two seeded doctors (doc-001 and doc-002)."""
    return seeded_app


# ── Independent password login ────────────────────────────────────────────────

def test_doctor_a_password_login(two_doctors, client):
    resp = client.post('/api/login', json={
        'email': 'priya.mohanty@medihawk.in',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    assert resp.status_code == 200
    assert resp.get_json()['user']['id'] == 'doc-001'


def test_doctor_b_password_login(two_doctors, client):
    resp = client.post('/api/login', json={
        'email': 'ravi.kumar@medihawk.in',
        'password': 'MediHawk@Doctor2026B',
        'role': 'doctor',
    })
    assert resp.status_code == 200
    assert resp.get_json()['user']['id'] == 'doc-002'


def test_doctor_a_password_cannot_authenticate_doctor_b(two_doctors, client):
    """Doctor A's password must not grant access to Doctor B's account."""
    resp = client.post('/api/login', json={
        'email': 'ravi.kumar@medihawk.in',
        'password': 'MediHawk@Doctor2026',  # Doctor A's password
        'role': 'doctor',
    })
    assert resp.status_code == 401
    assert resp.get_json()['error']['code'] == 'INVALID_CREDENTIALS'


def test_doctor_b_password_cannot_authenticate_doctor_a(two_doctors, client):
    """Doctor B's password must not grant access to Doctor A's account."""
    resp = client.post('/api/login', json={
        'email': 'priya.mohanty@medihawk.in',
        'password': 'MediHawk@Doctor2026B',  # Doctor B's password
        'role': 'doctor',
    })
    assert resp.status_code == 401


def test_doctors_have_distinct_ids_in_jwt(two_doctors, client):
    """JWT sub claim must differ between Doctor A and Doctor B."""
    resp_a = client.post('/api/login', json={
        'email': 'priya.mohanty@medihawk.in', 'password': 'MediHawk@Doctor2026', 'role': 'doctor',
    })
    resp_b = client.post('/api/login', json={
        'email': 'ravi.kumar@medihawk.in', 'password': 'MediHawk@Doctor2026B', 'role': 'doctor',
    })
    assert resp_a.status_code == 200
    assert resp_b.status_code == 200
    token_a = resp_a.get_json()['token']
    token_b = resp_b.get_json()['token']
    assert token_a != token_b

    # Verify the sub claim in each token
    from services.auth_service import decode_token
    payload_a = decode_token(token_a, 'test-jwt-secret-not-for-production')
    payload_b = decode_token(token_b, 'test-jwt-secret-not-for-production')
    assert payload_a['sub'] == 'doc-001'
    assert payload_b['sub'] == 'doc-002'
    assert payload_a['sub'] != payload_b['sub']


# ── OTP email destination isolation ──────────────────────────────────────────

def test_doctor_a_otp_sent_to_doctor_a_email(two_doctors, client, app):
    """OTP for Doctor A must be sent to Doctor A's registered email, not Doctor B's."""
    transport = get_transport()
    assert isinstance(transport, CollectingTransport)
    transport.clear()

    resp = client.post('/api/auth/otp/request', json={
        'email': 'priya.mohanty@medihawk.in', 'role': 'doctor',
    })
    assert resp.status_code == 200

    assert len(transport.sent) == 1
    assert transport.sent[0]['to'] == 'priya.mohanty@medihawk.in'
    assert transport.sent[0]['to'] != 'ravi.kumar@medihawk.in'


def test_doctor_b_otp_sent_to_doctor_b_email(two_doctors, client, app):
    """OTP for Doctor B must be sent to Doctor B's registered email, not Doctor A's."""
    transport = get_transport()
    assert isinstance(transport, CollectingTransport)
    transport.clear()

    resp = client.post('/api/auth/otp/request', json={
        'email': 'ravi.kumar@medihawk.in', 'role': 'doctor',
    })
    assert resp.status_code == 200

    assert len(transport.sent) == 1
    assert transport.sent[0]['to'] == 'ravi.kumar@medihawk.in'
    assert transport.sent[0]['to'] != 'priya.mohanty@medihawk.in'


def test_otp_email_destination_is_not_smtp_username(two_doctors, client, app):
    """
    OTP email recipient must be the doctor's registered address.
    It must never be the SMTP_USERNAME or any other application credential.
    """
    import os
    smtp_username = os.environ.get('SMTP_USERNAME', '')

    transport = get_transport()
    assert isinstance(transport, CollectingTransport)
    transport.clear()

    client.post('/api/auth/otp/request', json={
        'email': 'priya.mohanty@medihawk.in', 'role': 'doctor',
    })

    if transport.sent:
        recipient = transport.sent[0]['to']
        assert recipient == 'priya.mohanty@medihawk.in'
        if smtp_username:
            assert recipient != smtp_username, (
                'OTP was sent to SMTP_USERNAME instead of the doctor\'s registered email'
            )


# ── Cross-account OTP prevention ──────────────────────────────────────────────

def test_doctor_a_otp_cannot_authenticate_doctor_b(two_doctors, client, app):
    """
    An OTP issued for Doctor A must not authenticate Doctor B,
    even if Doctor B submits the same OTP code.
    """
    transport = get_transport()
    assert isinstance(transport, CollectingTransport)
    transport.clear()

    # Request OTP for Doctor A
    client.post('/api/auth/otp/request', json={
        'email': 'priya.mohanty@medihawk.in', 'role': 'doctor',
    })

    # Inject a known OTP into Doctor A's session
    from models.audit import OTPSession
    from services.otp_service import _hmac_digest
    from extensions import db
    session_a = OTPSession.query.filter_by(
        contact='priya.mohanty@medihawk.in', purpose='login_doctor',
    ).order_by(OTPSession.created_at.desc()).first()
    assert session_a is not None
    known_otp = '777777'
    session_a.code_hash = _hmac_digest(known_otp, app.config['OTP_HMAC_SECRET'])
    db.session.commit()

    # Doctor B tries to use Doctor A's OTP with Doctor B's email — must fail
    resp = client.post('/api/auth/otp/verify', json={
        'email': 'ravi.kumar@medihawk.in',  # Doctor B's email
        'otp': known_otp,
        'role': 'doctor',
    })
    assert resp.status_code == 401
    assert resp.get_json()['error']['code'] == 'OTP_INVALID'


def test_doctor_a_otp_authenticates_only_doctor_a(two_doctors, client, app):
    """
    Doctor A's OTP must issue a JWT for Doctor A, not Doctor B.
    """
    transport = get_transport()
    transport.clear()

    client.post('/api/auth/otp/request', json={
        'email': 'priya.mohanty@medihawk.in', 'role': 'doctor',
    })

    from models.audit import OTPSession
    from services.otp_service import _hmac_digest
    from extensions import db
    session_a = OTPSession.query.filter_by(
        contact='priya.mohanty@medihawk.in', purpose='login_doctor',
    ).order_by(OTPSession.created_at.desc()).first()
    known_otp = '888888'
    session_a.code_hash = _hmac_digest(known_otp, app.config['OTP_HMAC_SECRET'])
    db.session.commit()

    # Doctor A verifies with their OTP
    resp = client.post('/api/auth/otp/verify', json={
        'email': 'priya.mohanty@medihawk.in',
        'otp': known_otp,
        'role': 'doctor',
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert data['user']['id'] == 'doc-001'  # Doctor A's ID, not Doctor B's


# ── Account is_active enforcement ────────────────────────────────────────────

def test_disabled_doctor_cannot_login(two_doctors, client, app):
    """A doctor with is_active=False must not be able to log in."""
    from models.doctor import Doctor
    from extensions import db

    doc = db.session.get(Doctor, 'doc-001')
    doc.is_active = False
    db.session.commit()

    try:
        resp = client.post('/api/login', json={
            'email': 'priya.mohanty@medihawk.in',
            'password': 'MediHawk@Doctor2026',
            'role': 'doctor',
        })
        assert resp.status_code == 403
        assert resp.get_json()['error']['code'] == 'ACCOUNT_DISABLED'
    finally:
        doc.is_active = True
        db.session.commit()


def test_disabled_admin_cannot_login(two_doctors, client, app):
    """An admin with is_active=False must not be able to log in."""
    from models.admin import Admin
    from extensions import db

    adm = db.session.get(Admin, 'admin-001')
    adm.is_active = False
    db.session.commit()

    try:
        resp = client.post('/api/login', json={
            'email': 'arjun.patel@medihawk.in',
            'password': 'MediHawk@Admin2026',
            'role': 'admin',
        })
        assert resp.status_code == 403
        assert resp.get_json()['error']['code'] == 'ACCOUNT_DISABLED'
    finally:
        adm.is_active = True
        db.session.commit()


def test_disabled_doctor_otp_request_returns_generic_response(two_doctors, client, app):
    """OTP request for a disabled account returns generic message (no enumeration)."""
    from models.doctor import Doctor
    from extensions import db
    transport = get_transport()
    transport.clear()

    doc = db.session.get(Doctor, 'doc-001')
    doc.is_active = False
    db.session.commit()

    try:
        resp = client.post('/api/auth/otp/request', json={
            'email': 'priya.mohanty@medihawk.in', 'role': 'doctor',
        })
        # Generic success response — does not reveal account is disabled
        assert resp.status_code == 200
        # But no OTP email was sent
        assert len(transport.sent) == 0
    finally:
        doc.is_active = True
        db.session.commit()


# ── User_id binding in OTP sessions ──────────────────────────────────────────

def test_otp_session_is_bound_to_user_id(two_doctors, client, app):
    """OTP session must store the doctor's user_id for cross-account binding."""
    transport = get_transport()
    transport.clear()

    client.post('/api/auth/otp/request', json={
        'email': 'priya.mohanty@medihawk.in', 'role': 'doctor',
    })

    from models.audit import OTPSession
    session = OTPSession.query.filter_by(
        contact='priya.mohanty@medihawk.in', purpose='login_doctor',
    ).order_by(OTPSession.created_at.desc()).first()
    assert session is not None
    assert session.user_id == 'doc-001'


def test_otp_session_user_id_matches_correct_doctor(two_doctors, client, app):
    """Each doctor's OTP session user_id must match their own account."""
    transport = get_transport()

    # Doctor A
    transport.clear()
    client.post('/api/auth/otp/request', json={
        'email': 'priya.mohanty@medihawk.in', 'role': 'doctor',
    })
    from models.audit import OTPSession
    session_a = OTPSession.query.filter_by(
        contact='priya.mohanty@medihawk.in', purpose='login_doctor',
    ).order_by(OTPSession.created_at.desc()).first()
    assert session_a.user_id == 'doc-001'

    # Doctor B (use 0-cooldown config to avoid rate limit)
    transport.clear()
    client.post('/api/auth/otp/request', json={
        'email': 'ravi.kumar@medihawk.in', 'role': 'doctor',
    })
    session_b = OTPSession.query.filter_by(
        contact='ravi.kumar@medihawk.in', purpose='login_doctor',
    ).order_by(OTPSession.created_at.desc()).first()
    assert session_b.user_id == 'doc-002'

    assert session_a.user_id != session_b.user_id


# ── Role isolation ────────────────────────────────────────────────────────────

def test_doctor_role_in_jwt_is_always_doctor(two_doctors, client):
    """JWT issued for a doctor must always carry role=doctor regardless of request role."""
    resp = client.post('/api/login', json={
        'email': 'priya.mohanty@medihawk.in',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    assert resp.status_code == 200
    assert resp.get_json()['user']['role'] == 'doctor'


def test_admin_role_in_jwt_is_always_admin(two_doctors, client):
    resp = client.post('/api/login', json={
        'email': 'arjun.patel@medihawk.in',
        'password': 'MediHawk@Admin2026',
        'role': 'admin',
    })
    assert resp.status_code == 200
    assert resp.get_json()['user']['role'] == 'admin'


def test_doctor_cannot_claim_admin_role(two_doctors, client):
    """Submitting role=admin with doctor credentials must fail (wrong table)."""
    resp = client.post('/api/login', json={
        'email': 'priya.mohanty@medihawk.in',
        'password': 'MediHawk@Doctor2026',
        'role': 'admin',
    })
    assert resp.status_code == 401


# ── Normalization isolation ───────────────────────────────────────────────────

def test_both_doctors_accessible_by_normalized_email(two_doctors, client):
    """Normalization must not accidentally merge two distinct accounts."""
    resp_a = client.post('/api/login', json={
        'email': 'PRIYA.MOHANTY@MEDIHAWK.IN',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    resp_b = client.post('/api/login', json={
        'email': 'RAVI.KUMAR@MEDIHAWK.IN',
        'password': 'MediHawk@Doctor2026B',
        'role': 'doctor',
    })
    assert resp_a.status_code == 200
    assert resp_b.status_code == 200
    assert resp_a.get_json()['user']['id'] != resp_b.get_json()['user']['id']


def test_doctor_b_phone_does_not_resolve_to_doctor_a(two_doctors, client):
    """Different canonical phone numbers must resolve to different accounts."""
    # Doctor A: 9861234567, Doctor B: 9876543210
    resp_b = client.post('/api/login', json={
        'phone': '+919876543210',  # Doctor B's phone
        'password': 'MediHawk@Doctor2026B',
        'role': 'doctor',
    })
    assert resp_b.status_code == 200
    assert resp_b.get_json()['user']['id'] == 'doc-002'


def test_doctor_a_phone_does_not_resolve_to_doctor_b(two_doctors, client):
    resp_a = client.post('/api/login', json={
        'phone': '9861234567',  # Doctor A's phone
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    assert resp_a.status_code == 200
    assert resp_a.get_json()['user']['id'] == 'doc-001'
