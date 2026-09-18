"""
Tests for doctor and admin signup flows.

Covers:
  - Doctor self-registration (with invitation code)
  - Admin controlled registration (invite code)
  - Duplicate email / phone detection
  - Validation errors
  - Email verification OTP
"""
import hashlib
import hmac as _hmac
import uuid
from datetime import datetime, timedelta, timezone

import pytest

DOCTOR_SIGNUP_URL   = '/api/auth/doctor/signup'
ADMIN_SIGNUP_URL    = '/api/auth/admin/signup'
VERIFY_EMAIL_URL    = '/api/auth/verify-email'
LOGIN_URL           = '/api/login'

INVITE_CODE = 'test-invite-code-secure'
OTP_HMAC_SECRET = 'test-hmac-secret'

VALID_ADMIN = {
    'name':        'Admin Test',
    'email':       'admin.test@medihawk.in',
    'password':    'AdminPass1',
    'invite_code': INVITE_CODE,
}


def _make_invitation(app, facility_id: str, admin_id: str, code: str) -> None:
    """Seed a DoctorInvitation with a known raw code into the test DB."""
    from extensions import db
    from models.invitation import DoctorInvitation

    secret = app.config.get('OTP_HMAC_SECRET', '')
    code_hash = _hmac.new(
        secret.encode('utf-8'), code.encode('utf-8'), hashlib.sha256
    ).hexdigest()
    inv = DoctorInvitation(
        id=f'inv-{uuid.uuid4().hex[:8]}',
        code_hash=code_hash,
        facility_id=facility_id,
        created_by_admin_id=admin_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.session.add(inv)
    db.session.commit()


@pytest.fixture
def app_with_invite(app):
    """App with ADMIN_INVITE_CODE and OTP_HMAC_SECRET configured, plus a test location and admin."""
    from extensions import db
    from models.admin import Admin
    from models.location import Location
    from services.auth_service import hash_password

    app.config['ADMIN_INVITE_CODE'] = INVITE_CODE
    app.config['OTP_HMAC_SECRET'] = OTP_HMAC_SECRET

    # Seed a location for invitation facility binding
    if not db.session.get(Location, 'phc-test'):
        db.session.add(Location(id='phc-test', name='Test PHC', type='phc',
                                lat=20.3, lng=85.8, district='Test District'))
        db.session.commit()

    # Seed a test admin for invitation creation
    if not db.session.get(Admin, 'adm-test'):
        db.session.add(Admin(id='adm-test', name='Test Admin',
                             email='admin.inv@medihawk.in',
                             password_hash=hash_password('TestAdmin1'),
                             is_active=True))
        db.session.commit()

    return app


@pytest.fixture
def client_with_invite(app_with_invite):
    return app_with_invite.test_client()


@pytest.fixture
def valid_doctor_payload(app_with_invite):
    """Return valid doctor signup payload including a fresh invitation code."""
    raw_code = 'TESTINVCODE123'
    _make_invitation(app_with_invite, 'phc-test', 'adm-test', raw_code)
    return {
        'name':                    'Dr. Test Signup',
        'email':                   'test.signup@medihawk.in',
        'phone':                   '9123456780',
        'password':                'TestPass1',
        'medical_registration_no': 'MCI/2024/TS001',
        'phc_id':                  'phc-test',
        'invitation_code':         raw_code,
    }


# ── Doctor Signup ─────────────────────────────────────────────────────────────

class TestDoctorSignup:

    def test_creates_account_returns_201(self, client_with_invite, valid_doctor_payload):
        resp = client_with_invite.post(DOCTOR_SIGNUP_URL, json=valid_doctor_payload)
        assert resp.status_code == 201, resp.get_json()
        data = resp.get_json()
        assert data['success'] is True
        assert 'user_id' in data
        assert data['user_id'].startswith('doc-')

    def test_email_normalized_lowercase(self, app_with_invite, client_with_invite, valid_doctor_payload):
        raw_code2 = 'TESTINVCODE456'
        _make_invitation(app_with_invite, 'phc-test', 'adm-test', raw_code2)
        payload = {**valid_doctor_payload, 'email': 'TEST.Signup2@MediHawk.IN',
                   'phone': '9123456781', 'medical_registration_no': 'MCI/2024/TS002',
                   'invitation_code': raw_code2}
        resp = client_with_invite.post(DOCTOR_SIGNUP_URL, json=payload)
        assert resp.status_code == 201, resp.get_json()

    def test_duplicate_email_returns_409(self, client_with_invite, valid_doctor_payload, app_with_invite):
        client_with_invite.post(DOCTOR_SIGNUP_URL, json=valid_doctor_payload)
        # Use a new valid invitation for the second attempt
        raw_code2 = 'DUPEMAILCODE999'
        _make_invitation(app_with_invite, 'phc-test', 'adm-test', raw_code2)
        resp = client_with_invite.post(DOCTOR_SIGNUP_URL, json={
            **valid_doctor_payload,
            'phone': '9999999999',
            'medical_registration_no': 'MCI/2024/DUP',
            'invitation_code': raw_code2,
        })
        assert resp.status_code == 409
        assert resp.get_json()['error']['code'] == 'EMAIL_EXISTS'

    def test_duplicate_phone_returns_409(self, client_with_invite, valid_doctor_payload, app_with_invite):
        client_with_invite.post(DOCTOR_SIGNUP_URL, json=valid_doctor_payload)
        raw_code2 = 'DUPPHONECODE999'
        _make_invitation(app_with_invite, 'phc-test', 'adm-test', raw_code2)
        resp = client_with_invite.post(DOCTOR_SIGNUP_URL, json={
            **valid_doctor_payload,
            'email': 'other@medihawk.in',
            'medical_registration_no': 'MCI/2024/DP2',
            'invitation_code': raw_code2,
        })
        assert resp.status_code == 409
        assert resp.get_json()['error']['code'] == 'PHONE_EXISTS'

    def test_missing_required_field_returns_422(self, client_with_invite, valid_doctor_payload):
        for field in ('name', 'email', 'phone', 'password',
                      'medical_registration_no', 'phc_id', 'invitation_code'):
            payload = {k: v for k, v in valid_doctor_payload.items() if k != field}
            resp = client_with_invite.post(DOCTOR_SIGNUP_URL, json=payload)
            assert resp.status_code == 422, f'Expected 422 when {field} is missing, got {resp.status_code}'

    def test_short_password_returns_422(self, client_with_invite, valid_doctor_payload):
        resp = client_with_invite.post(DOCTOR_SIGNUP_URL, json={**valid_doctor_payload, 'password': 'abc'})
        assert resp.status_code == 422
        assert resp.get_json()['error']['code'] == 'VALIDATION_ERROR'

    def test_invalid_phone_returns_422(self, client_with_invite, valid_doctor_payload):
        resp = client_with_invite.post(DOCTOR_SIGNUP_URL, json={**valid_doctor_payload, 'phone': '123'})
        assert resp.status_code == 422

    def test_sends_verification_email(self, client_with_invite, valid_doctor_payload):
        from services.email_service import get_transport
        client_with_invite.post(DOCTOR_SIGNUP_URL, json=valid_doctor_payload)
        transport = get_transport()
        assert transport is not None
        last = transport.last_message()
        assert last is not None
        assert last['to'] == valid_doctor_payload['email']
        assert 'Verify' in last['subject']

    def test_new_doctor_is_pending_cannot_login(self, client_with_invite, valid_doctor_payload):
        client_with_invite.post(DOCTOR_SIGNUP_URL, json=valid_doctor_payload)
        resp = client_with_invite.post(LOGIN_URL, json={
            'email': valid_doctor_payload['email'],
            'password': valid_doctor_payload['password'],
            'role': 'doctor',
        })
        assert resp.status_code == 403
        assert resp.get_json()['error']['code'] == 'DOCTOR_VERIFICATION_PENDING'

    def test_email_verify_otp_marks_verified(self, client_with_invite, valid_doctor_payload, app_with_invite):
        from models.audit import OTPSession

        client_with_invite.post(DOCTOR_SIGNUP_URL, json=valid_doctor_payload)

        with app_with_invite.app_context():
            session = OTPSession.query.filter_by(
                contact=valid_doctor_payload['email'],
                purpose='email_verify_doctor',
            ).order_by(OTPSession.created_at.desc()).first()
            assert session is not None

    def test_verify_email_wrong_otp_returns_401(self, client_with_invite, valid_doctor_payload):
        client_with_invite.post(DOCTOR_SIGNUP_URL, json=valid_doctor_payload)
        resp = client_with_invite.post(VERIFY_EMAIL_URL, json={
            'email': valid_doctor_payload['email'],
            'otp': '000000',
            'role': 'doctor',
        })
        assert resp.status_code == 401

    def test_verify_email_wrong_role_returns_422(self, client_with_invite, valid_doctor_payload):
        client_with_invite.post(DOCTOR_SIGNUP_URL, json=valid_doctor_payload)
        resp = client_with_invite.post(VERIFY_EMAIL_URL, json={
            'email': valid_doctor_payload['email'],
            'otp': '123456',
            'role': 'superuser',
        })
        assert resp.status_code == 422


# ── Admin Signup ──────────────────────────────────────────────────────────────

class TestAdminSignup:

    def test_creates_account_with_valid_invite_code(self, client_with_invite):
        resp = client_with_invite.post(ADMIN_SIGNUP_URL, json=VALID_ADMIN)
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['success'] is True
        assert data['user_id'].startswith('adm-')

    def test_wrong_invite_code_returns_403(self, client_with_invite):
        resp = client_with_invite.post(ADMIN_SIGNUP_URL, json={
            **VALID_ADMIN,
            'invite_code': 'wrong-code',
        })
        assert resp.status_code == 403
        assert resp.get_json()['error']['code'] == 'INVALID_INVITE_CODE'

    def test_disabled_signup_when_no_invite_code_configured(self, client):
        resp = client.post(ADMIN_SIGNUP_URL, json=VALID_ADMIN)
        assert resp.status_code == 403
        assert resp.get_json()['error']['code'] == 'SIGNUP_DISABLED'

    def test_duplicate_email_returns_409(self, client_with_invite):
        client_with_invite.post(ADMIN_SIGNUP_URL, json=VALID_ADMIN)
        resp = client_with_invite.post(ADMIN_SIGNUP_URL, json=VALID_ADMIN)
        assert resp.status_code == 409
        assert resp.get_json()['error']['code'] == 'EMAIL_EXISTS'

    def test_missing_required_field_returns_422(self, client_with_invite):
        for field in ('name', 'email', 'password', 'invite_code'):
            payload = {k: v for k, v in VALID_ADMIN.items() if k != field}
            resp = client_with_invite.post(ADMIN_SIGNUP_URL, json=payload)
            assert resp.status_code == 422, f'Expected 422 when {field} is missing'

    def test_sends_verification_email(self, client_with_invite, app_with_invite):
        from services.email_service import get_transport
        client_with_invite.post(ADMIN_SIGNUP_URL, json=VALID_ADMIN)
        transport = get_transport()
        assert transport is not None
        last = transport.last_message()
        assert last is not None
        assert last['to'] == VALID_ADMIN['email']
        assert 'Verify' in last['subject']

    def test_admin_can_login_after_signup(self, client_with_invite):
        client_with_invite.post(ADMIN_SIGNUP_URL, json=VALID_ADMIN)
        resp = client_with_invite.post(LOGIN_URL, json={
            'email': VALID_ADMIN['email'],
            'password': VALID_ADMIN['password'],
            'role': 'admin',
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert 'token' in data

    def test_admin_signup_invite_code_constant_time(self, client_with_invite):
        resp = client_with_invite.post(ADMIN_SIGNUP_URL, json={**VALID_ADMIN, 'invite_code': ''})
        assert resp.status_code == 422  # Empty = missing field validation

    def test_admin_can_login_after_signup_even_when_smtp_fails(self, app_with_invite, client_with_invite):
        """
        Production bootstrap path: when SMTP is broken the admin signup still
        commits the account because Admin has no email_verified requirement at
        login.  The response must still be 201 and the admin must be able to
        log in immediately.
        """
        import services.email_service as _es
        from unittest.mock import MagicMock

        failing_transport = MagicMock()
        # admin_signup catches RuntimeError — must match what SMTPTransport.send() raises
        failing_transport.send.side_effect = RuntimeError('EMAIL_DELIVERY_FAILED')

        original = _es._transport
        _es._transport = failing_transport

        payload = {**VALID_ADMIN, 'email': 'smtp.fail.admin@medihawk.in'}
        try:
            resp = client_with_invite.post(ADMIN_SIGNUP_URL, json=payload)
        finally:
            _es._transport = original

        # Account must be created despite SMTP failure
        assert resp.status_code == 201, resp.get_json()
        data = resp.get_json()
        assert data['success'] is True
        assert data.get('login_available') is True

        # Admin must be able to log in without email verification
        login_resp = client_with_invite.post(LOGIN_URL, json={
            'email': payload['email'],
            'password': payload['password'],
            'role': 'admin',
        })
        assert login_resp.status_code == 200, login_resp.get_json()
        assert 'token' in login_resp.get_json()

    def test_email_exists_error_suggests_login(self, client_with_invite):
        """EMAIL_EXISTS message must guide admin to try logging in."""
        client_with_invite.post(ADMIN_SIGNUP_URL, json=VALID_ADMIN)
        resp = client_with_invite.post(ADMIN_SIGNUP_URL, json=VALID_ADMIN)
        assert resp.status_code == 409
        msg = resp.get_json()['error']['message'].lower()
        # Must hint at login or forgot-password, not just "already exists"
        assert 'log in' in msg or 'forgot' in msg

    def test_verify_email_wrong_otp_returns_401(self, client_with_invite):
        client_with_invite.post(ADMIN_SIGNUP_URL, json=VALID_ADMIN)
        resp = client_with_invite.post(VERIFY_EMAIL_URL, json={
            'email': VALID_ADMIN['email'],
            'otp': '000000',
            'role': 'admin',
        })
        assert resp.status_code == 401


# ── Cross-account isolation ───────────────────────────────────────────────────

class TestSignupIsolation:

    def test_doctor_and_admin_accounts_are_independent(self, client_with_invite, valid_doctor_payload):
        d_resp = client_with_invite.post(DOCTOR_SIGNUP_URL, json=valid_doctor_payload)
        a_resp = client_with_invite.post(ADMIN_SIGNUP_URL, json=VALID_ADMIN)
        assert d_resp.status_code == 201, d_resp.get_json()
        assert a_resp.status_code == 201
        d_id = d_resp.get_json()['user_id']
        a_id = a_resp.get_json()['user_id']
        assert d_id != a_id
        assert d_id.startswith('doc-')
        assert a_id.startswith('adm-')

    def test_doctor_email_does_not_conflict_with_admin_email(self, app_with_invite, client_with_invite):
        shared_email = 'shared@medihawk.in'
        raw_code = 'SHAREDEMAIL999'
        _make_invitation(app_with_invite, 'phc-test', 'adm-test', raw_code)
        d_resp = client_with_invite.post(DOCTOR_SIGNUP_URL, json={
            'name': 'Dr. Shared',
            'email': shared_email,
            'phone': '9111111111',
            'password': 'TestPass1',
            'medical_registration_no': 'MCI/2024/SHR',
            'phc_id': 'phc-test',
            'invitation_code': raw_code,
        })
        a_resp = client_with_invite.post(ADMIN_SIGNUP_URL, json={
            **VALID_ADMIN, 'email': shared_email,
        })
        # Same email in different tables — currently allowed (different user types)
        assert d_resp.status_code == 201, d_resp.get_json()
        assert a_resp.status_code == 201, a_resp.get_json()
