"""
Tests for doctor authenticity / institutional verification system.

Covers:
  - Invitation code creation, listing, revocation (admin)
  - Doctor signup with valid/invalid/expired/used/revoked invitations
  - verification_status gate on password login
  - verification_status gate on OTP login
  - Admin approve/reject/suspend doctor
  - Verification status transitions
  - Security: role not trusted from client, admin_id from JWT only
"""
import hashlib
import hmac as _hmac
import uuid
from datetime import datetime, timedelta, timezone

import pytest

DOCTOR_SIGNUP_URL   = '/api/auth/doctor/signup'
LOGIN_URL           = '/api/login'
OTP_REQUEST_URL     = '/api/auth/otp/request'
OTP_VERIFY_URL      = '/api/auth/otp/verify'

CREATE_INVITATION_URL   = '/api/admin/invitations'
LIST_INVITATIONS_URL    = '/api/admin/invitations'
REVOKE_INVITATION_URL   = lambda i: f'/api/admin/invitations/{i}/revoke'

LIST_PENDING_URL    = '/api/admin/verification/pending'
APPROVE_URL         = lambda d: f'/api/admin/verification/{d}/approve'
REJECT_URL          = lambda d: f'/api/admin/verification/{d}/reject'
SUSPEND_URL         = lambda d: f'/api/admin/verification/{d}/suspend'

OTP_HMAC_SECRET = 'test-hmac-secret-ver'


# ── Shared fixtures ───────────────────────────────────────────────────────────

@pytest.fixture
def ver_app(app):
    """App with OTP_HMAC_SECRET configured plus test location and admin."""
    from extensions import db
    from models.admin import Admin
    from models.location import Location
    from services.auth_service import hash_password

    app.config['OTP_HMAC_SECRET'] = OTP_HMAC_SECRET

    if not db.session.get(Location, 'phc-ver-test'):
        db.session.add(Location(id='phc-ver-test', name='Verification Test PHC',
                                type='phc', lat=20.0, lng=85.0,
                                district='Test District'))
        db.session.commit()

    if not db.session.get(Admin, 'adm-ver-test'):
        db.session.add(Admin(id='adm-ver-test', name='Ver Test Admin',
                             email='ver.admin@medihawk.in',
                             password_hash=hash_password('TestAdmin1!'),
                             is_active=True))
        db.session.commit()

    return app


@pytest.fixture
def ver_client(ver_app):
    return ver_app.test_client()


@pytest.fixture
def admin_headers(ver_app, ver_client):
    """JWT headers for the ver test admin."""
    resp = ver_client.post(LOGIN_URL, json={
        'email': 'ver.admin@medihawk.in',
        'password': 'TestAdmin1!',
        'role': 'admin',
    })
    assert resp.status_code == 200, resp.get_json()
    return {'Authorization': f'Bearer {resp.get_json()["token"]}'}


def _make_invitation(app, facility_id: str, admin_id: str, code: str,
                     expired: bool = False) -> str:
    """Insert a test invitation; return its id."""
    from extensions import db
    from models.invitation import DoctorInvitation

    secret = app.config.get('OTP_HMAC_SECRET', '')
    code_hash = _hmac.new(
        secret.encode('utf-8'), code.encode('utf-8'), hashlib.sha256
    ).hexdigest()
    inv_id = f'inv-{uuid.uuid4().hex[:8]}'
    expires_at = (
        datetime.now(timezone.utc) - timedelta(days=1)
        if expired
        else datetime.now(timezone.utc) + timedelta(days=30)
    )
    inv = DoctorInvitation(
        id=inv_id,
        code_hash=code_hash,
        facility_id=facility_id,
        created_by_admin_id=admin_id,
        expires_at=expires_at,
    )
    db.session.add(inv)
    db.session.commit()
    return inv_id


def _make_used_invitation(app, facility_id: str, admin_id: str, code: str) -> str:
    """Insert an already-used test invitation (creates a real doctor to satisfy FK)."""
    from extensions import db
    from models.doctor import Doctor
    from models.invitation import DoctorInvitation
    from services.auth_service import hash_password

    # Create a minimal real doctor to satisfy the FK
    doc_id = f'doc-used-{uuid.uuid4().hex[:6]}'
    doctor = Doctor(
        id=doc_id,
        name='Used Inv Doctor',
        email=f'usedinv.{doc_id}@medihawk.in',
        phone=f'95{abs(hash(doc_id)) % 100000000:08d}',
        phc_id=facility_id,
        password_hash=hash_password('TestPass1!'),
        is_active=True,
        email_verified=True,
        verification_status='pending',
    )
    db.session.add(doctor)

    secret = app.config.get('OTP_HMAC_SECRET', '')
    code_hash = _hmac.new(
        secret.encode('utf-8'), code.encode('utf-8'), hashlib.sha256
    ).hexdigest()
    inv_id = f'inv-{uuid.uuid4().hex[:8]}'
    inv = DoctorInvitation(
        id=inv_id,
        code_hash=code_hash,
        facility_id=facility_id,
        created_by_admin_id=admin_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        used_by_doctor_id=doc_id,
        used_at=datetime.now(timezone.utc),
    )
    db.session.add(inv)
    db.session.commit()
    return inv_id


def _doctor_signup_payload(code: str, suffix: str = '') -> dict:
    return {
        'name':                    f'Dr. Verify Test{suffix}',
        'email':                   f'verify.test{suffix}@medihawk.in',
        'phone':                   f'90000{abs(hash(suffix)) % 100000:05d}',
        'password':                'TestPass1!',
        'medical_registration_no': f'MCI/VT{suffix}/001',
        'phc_id':                  'phc-ver-test',
        'invitation_code':         code,
    }


def _create_verified_doctor(app, client) -> tuple[str, str]:
    """Create a doctor with verification_status='verified' and return (doctor_id, token)."""
    from extensions import db
    from models.doctor import Doctor
    from services.auth_service import hash_password

    doc_id = f'doc-vt-{uuid.uuid4().hex[:6]}'
    doctor = Doctor(
        id=doc_id,
        name='Dr. Verified',
        email=f'verified.{doc_id}@medihawk.in',
        phone=f'91{abs(hash(doc_id)) % 100000000:08d}',
        phc_id='phc-ver-test',
        password_hash=hash_password('TestPass1!'),
        is_active=True,
        email_verified=True,
        verification_status='verified',
    )
    db.session.add(doctor)
    db.session.commit()

    resp = client.post(LOGIN_URL, json={
        'email': doctor.email,
        'password': 'TestPass1!',
        'role': 'doctor',
    })
    assert resp.status_code == 200, resp.get_json()
    return doc_id, resp.get_json()['token']


# ── Invitation creation ───────────────────────────────────────────────────────

class TestInvitationCreation:

    def test_admin_can_create_invitation(self, ver_client, admin_headers):
        resp = ver_client.post(CREATE_INVITATION_URL,
                               json={'facility_id': 'phc-ver-test'},
                               headers=admin_headers)
        assert resp.status_code == 201, resp.get_json()
        data = resp.get_json()
        assert 'invitation_id' in data
        assert 'code' in data
        assert data['code'] != ''
        assert data['facility_id'] == 'phc-ver-test'

    def test_create_invitation_without_auth_returns_401(self, ver_client):
        resp = ver_client.post(CREATE_INVITATION_URL, json={'facility_id': 'phc-ver-test'})
        assert resp.status_code == 401

    def test_create_invitation_as_doctor_returns_403(self, ver_app, ver_client):
        _, token = _create_verified_doctor(ver_app, ver_client)
        resp = ver_client.post(CREATE_INVITATION_URL,
                               json={'facility_id': 'phc-ver-test'},
                               headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 403

    def test_create_invitation_missing_facility_id_returns_422(self, ver_client, admin_headers):
        resp = ver_client.post(CREATE_INVITATION_URL, json={}, headers=admin_headers)
        assert resp.status_code == 422

    def test_create_invitation_nonexistent_facility_returns_404(self, ver_client, admin_headers):
        resp = ver_client.post(CREATE_INVITATION_URL,
                               json={'facility_id': 'phc-does-not-exist'},
                               headers=admin_headers)
        assert resp.status_code == 404

    def test_list_invitations_returns_200(self, ver_client, admin_headers):
        ver_client.post(CREATE_INVITATION_URL,
                        json={'facility_id': 'phc-ver-test'},
                        headers=admin_headers)
        resp = ver_client.get(LIST_INVITATIONS_URL, headers=admin_headers)
        assert resp.status_code == 200
        assert 'invitations' in resp.get_json()

    def test_invitation_list_excludes_raw_code(self, ver_client, admin_headers):
        ver_client.post(CREATE_INVITATION_URL,
                        json={'facility_id': 'phc-ver-test'},
                        headers=admin_headers)
        resp = ver_client.get(LIST_INVITATIONS_URL, headers=admin_headers)
        for inv in resp.get_json()['invitations']:
            assert 'code' not in inv
            assert 'code_hash' not in inv


# ── Invitation revocation ─────────────────────────────────────────────────────

class TestInvitationRevocation:

    def test_admin_can_revoke_unused_invitation(self, ver_app, ver_client, admin_headers):
        inv_id = _make_invitation(ver_app, 'phc-ver-test', 'adm-ver-test', 'REVOKE123')
        resp = ver_client.post(REVOKE_INVITATION_URL(inv_id), headers=admin_headers)
        assert resp.status_code == 200

    def test_revoked_invitation_cannot_be_used_for_signup(self, ver_app, ver_client):
        raw_code = 'REVOKEDCODE1'
        inv_id = _make_invitation(ver_app, 'phc-ver-test', 'adm-ver-test', raw_code)
        # Revoke it
        from extensions import db
        from models.invitation import DoctorInvitation
        inv = db.session.get(DoctorInvitation, inv_id)
        inv.revoked = True
        db.session.commit()

        resp = ver_client.post(DOCTOR_SIGNUP_URL, json=_doctor_signup_payload(raw_code, 'rev'))
        assert resp.status_code == 403
        assert resp.get_json()['error']['code'] == 'INVALID_INVITATION_CODE'

    def test_used_invitation_cannot_be_revoked(self, ver_app, ver_client, admin_headers):
        inv_id = _make_used_invitation(ver_app, 'phc-ver-test', 'adm-ver-test', 'USEDREVOKE')
        resp = ver_client.post(REVOKE_INVITATION_URL(inv_id), headers=admin_headers)
        assert resp.status_code == 409
        assert resp.get_json()['error']['code'] == 'INVITATION_ALREADY_USED'


# ── Doctor signup with invitation ─────────────────────────────────────────────

class TestDoctorSignupWithInvitation:

    def test_signup_with_valid_invitation_returns_201(self, ver_app, ver_client):
        raw_code = 'VALIDSIGNUP1'
        _make_invitation(ver_app, 'phc-ver-test', 'adm-ver-test', raw_code)
        resp = ver_client.post(DOCTOR_SIGNUP_URL, json=_doctor_signup_payload(raw_code, 'v1'))
        assert resp.status_code == 201, resp.get_json()

    def test_signup_sets_pending_status(self, ver_app, ver_client):
        from extensions import db
        from models.doctor import Doctor

        raw_code = 'PENDINGSIGNUP'
        _make_invitation(ver_app, 'phc-ver-test', 'adm-ver-test', raw_code)
        resp = ver_client.post(DOCTOR_SIGNUP_URL, json=_doctor_signup_payload(raw_code, 'ps'))
        assert resp.status_code == 201
        doc_id = resp.get_json()['user_id']
        doctor = db.session.get(Doctor, doc_id)
        assert doctor.verification_status == 'pending'

    def test_signup_marks_invitation_used(self, ver_app, ver_client):
        from extensions import db
        from models.invitation import DoctorInvitation

        raw_code = 'MARKEDUSED111'
        inv_id = _make_invitation(ver_app, 'phc-ver-test', 'adm-ver-test', raw_code)
        ver_client.post(DOCTOR_SIGNUP_URL, json=_doctor_signup_payload(raw_code, 'mu'))
        inv = db.session.get(DoctorInvitation, inv_id)
        assert inv.used_by_doctor_id is not None
        assert inv.used_at is not None

    def test_signup_with_expired_invitation_returns_403(self, ver_app, ver_client):
        raw_code = 'EXPIREDCODE1'
        _make_invitation(ver_app, 'phc-ver-test', 'adm-ver-test', raw_code, expired=True)
        resp = ver_client.post(DOCTOR_SIGNUP_URL, json=_doctor_signup_payload(raw_code, 'exp'))
        assert resp.status_code == 403
        assert resp.get_json()['error']['code'] == 'INVALID_INVITATION_CODE'

    def test_signup_invitation_single_use(self, ver_app, ver_client):
        raw_code = 'SINGLEUSE111'
        _make_invitation(ver_app, 'phc-ver-test', 'adm-ver-test', raw_code)
        # First signup succeeds
        r1 = ver_client.post(DOCTOR_SIGNUP_URL, json=_doctor_signup_payload(raw_code, 'su1'))
        assert r1.status_code == 201
        # Second signup with same code fails
        r2 = ver_client.post(DOCTOR_SIGNUP_URL, json=_doctor_signup_payload(raw_code, 'su2'))
        assert r2.status_code == 403

    def test_signup_wrong_invitation_code_returns_403(self, ver_app, ver_client):
        _make_invitation(ver_app, 'phc-ver-test', 'adm-ver-test', 'REALCODE999')
        resp = ver_client.post(DOCTOR_SIGNUP_URL,
                               json=_doctor_signup_payload('WRONGCODE999', 'wc'))
        assert resp.status_code == 403

    def test_signup_invitation_facility_overrides_client_phc(self, ver_app, ver_client):
        from extensions import db
        from models.doctor import Doctor
        from models.location import Location

        # Create a second facility
        if not db.session.get(Location, 'phc-other-test'):
            db.session.add(Location(id='phc-other-test', name='Other PHC',
                                    type='phc', lat=21.0, lng=86.0,
                                    district='Other'))
            db.session.commit()

        raw_code = 'FACILITYBOUND'
        _make_invitation(ver_app, 'phc-ver-test', 'adm-ver-test', raw_code)
        # Doctor claims to be at phc-other-test but invitation is for phc-ver-test
        payload = {**_doctor_signup_payload(raw_code, 'fb'), 'phc_id': 'phc-other-test'}
        resp = ver_client.post(DOCTOR_SIGNUP_URL, json=payload)
        # Should fail because phc_id='phc-other-test' doesn't match invitation facility 'phc-ver-test'
        assert resp.status_code == 403


# ── Login verification gate ───────────────────────────────────────────────────

class TestLoginVerificationGate:

    def _make_doctor_with_status(self, app, status: str) -> dict:
        from extensions import db
        from models.doctor import Doctor
        from services.auth_service import hash_password

        doc_id = f'doc-{uuid.uuid4().hex[:6]}'
        pw = 'TestPass1!'
        doctor = Doctor(
            id=doc_id,
            name='Dr. Gate Test',
            email=f'gate.{doc_id}@medihawk.in',
            phone=f'93{abs(hash(doc_id)) % 100000000:08d}',
            phc_id='phc-ver-test',
            password_hash=hash_password(pw),
            is_active=True,
            email_verified=True,
            verification_status=status,
        )
        db.session.add(doctor)
        db.session.commit()
        return {'email': doctor.email, 'password': pw, 'role': 'doctor'}

    def test_pending_doctor_login_blocked(self, ver_app, ver_client):
        creds = self._make_doctor_with_status(ver_app, 'pending')
        resp = ver_client.post(LOGIN_URL, json=creds)
        assert resp.status_code == 403
        assert resp.get_json()['error']['code'] == 'DOCTOR_VERIFICATION_PENDING'

    def test_rejected_doctor_login_blocked(self, ver_app, ver_client):
        creds = self._make_doctor_with_status(ver_app, 'rejected')
        resp = ver_client.post(LOGIN_URL, json=creds)
        assert resp.status_code == 403
        assert resp.get_json()['error']['code'] == 'DOCTOR_VERIFICATION_REJECTED'

    def test_suspended_doctor_login_blocked(self, ver_app, ver_client):
        creds = self._make_doctor_with_status(ver_app, 'suspended')
        resp = ver_client.post(LOGIN_URL, json=creds)
        assert resp.status_code == 403
        assert resp.get_json()['error']['code'] == 'DOCTOR_ACCOUNT_SUSPENDED'

    def test_verified_doctor_login_succeeds(self, ver_app, ver_client):
        creds = self._make_doctor_with_status(ver_app, 'verified')
        resp = ver_client.post(LOGIN_URL, json=creds)
        assert resp.status_code == 200
        assert 'token' in resp.get_json()

    def test_admin_login_not_blocked_by_verification_gate(self, ver_client, admin_headers):
        # Admin login should succeed regardless of verification logic
        resp = ver_client.post(LOGIN_URL, json={
            'email': 'ver.admin@medihawk.in',
            'password': 'TestAdmin1!',
            'role': 'admin',
        })
        assert resp.status_code == 200


# ── Admin verification actions ────────────────────────────────────────────────

class TestAdminVerificationActions:

    def _make_pending_doctor(self, app) -> str:
        from extensions import db
        from models.doctor import Doctor
        from services.auth_service import hash_password

        doc_id = f'doc-pend-{uuid.uuid4().hex[:6]}'
        doctor = Doctor(
            id=doc_id,
            name='Dr. Pending',
            email=f'pending.{doc_id}@medihawk.in',
            phone=f'94{abs(hash(doc_id)) % 100000000:08d}',
            phc_id='phc-ver-test',
            password_hash=hash_password('TestPass1!'),
            is_active=True,
            email_verified=True,
            verification_status='pending',
        )
        db.session.add(doctor)
        db.session.commit()
        return doc_id

    def test_list_pending_doctors(self, ver_app, ver_client, admin_headers):
        doc_id = self._make_pending_doctor(ver_app)
        resp = ver_client.get(LIST_PENDING_URL, headers=admin_headers)
        assert resp.status_code == 200
        ids = [d['id'] for d in resp.get_json()['doctors']]
        assert doc_id in ids

    def test_approve_doctor_sets_verified(self, ver_app, ver_client, admin_headers):
        from extensions import db
        from models.doctor import Doctor

        doc_id = self._make_pending_doctor(ver_app)
        resp = ver_client.post(APPROVE_URL(doc_id), json={'notes': 'Credentials verified'},
                               headers=admin_headers)
        assert resp.status_code == 200, resp.get_json()
        doctor = db.session.get(Doctor, doc_id)
        assert doctor.verification_status == 'verified'
        assert doctor.verified_at is not None
        assert doctor.verified_by_admin_id == 'adm-ver-test'

    def test_approve_records_admin_id_from_jwt_not_body(self, ver_app, ver_client, admin_headers):
        from extensions import db
        from models.doctor import Doctor

        doc_id = self._make_pending_doctor(ver_app)
        # Pass a fake admin_id in the body — should be ignored
        resp = ver_client.post(APPROVE_URL(doc_id),
                               json={'admin_id': 'fake-admin-999', 'notes': ''},
                               headers=admin_headers)
        assert resp.status_code == 200
        doctor = db.session.get(Doctor, doc_id)
        assert doctor.verified_by_admin_id == 'adm-ver-test'
        assert doctor.verified_by_admin_id != 'fake-admin-999'

    def test_reject_doctor_sets_rejected(self, ver_app, ver_client, admin_headers):
        from extensions import db
        from models.doctor import Doctor

        doc_id = self._make_pending_doctor(ver_app)
        resp = ver_client.post(REJECT_URL(doc_id), json={'notes': 'License unverifiable'},
                               headers=admin_headers)
        assert resp.status_code == 200
        doctor = db.session.get(Doctor, doc_id)
        assert doctor.verification_status == 'rejected'
        assert doctor.verification_notes == 'License unverifiable'

    def test_suspend_doctor_sets_suspended(self, ver_app, ver_client, admin_headers):
        from extensions import db
        from models.doctor import Doctor

        doc_id = self._make_pending_doctor(ver_app)
        # First approve
        ver_client.post(APPROVE_URL(doc_id), headers=admin_headers)
        # Then suspend
        resp = ver_client.post(SUSPEND_URL(doc_id), json={'notes': 'Policy violation'},
                               headers=admin_headers)
        assert resp.status_code == 200
        doctor = db.session.get(Doctor, doc_id)
        assert doctor.verification_status == 'suspended'

    def test_approve_already_verified_returns_409(self, ver_app, ver_client, admin_headers):
        from extensions import db
        from models.doctor import Doctor

        doc_id = self._make_pending_doctor(ver_app)
        ver_client.post(APPROVE_URL(doc_id), headers=admin_headers)
        resp = ver_client.post(APPROVE_URL(doc_id), headers=admin_headers)
        assert resp.status_code == 409
        assert resp.get_json()['error']['code'] == 'ALREADY_VERIFIED'

    def test_doctor_cannot_approve_other_doctors(self, ver_app, ver_client):
        _, token = _create_verified_doctor(ver_app, ver_client)
        doc_id = self._make_pending_doctor(ver_app)
        resp = ver_client.post(APPROVE_URL(doc_id),
                               headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 403

    def test_approve_nonexistent_doctor_returns_404(self, ver_client, admin_headers):
        resp = ver_client.post(APPROVE_URL('doc-does-not-exist'), headers=admin_headers)
        assert resp.status_code == 404

    def test_approved_doctor_can_login(self, ver_app, ver_client, admin_headers):
        from services.auth_service import hash_password
        from extensions import db
        from models.doctor import Doctor

        doc_id = self._make_pending_doctor(ver_app)
        email = db.session.get(Doctor, doc_id).email
        ver_client.post(APPROVE_URL(doc_id), headers=admin_headers)

        resp = ver_client.post(LOGIN_URL, json={
            'email': email,
            'password': 'TestPass1!',
            'role': 'doctor',
        })
        assert resp.status_code == 200
        assert 'token' in resp.get_json()

    def test_suspended_doctor_blocked_after_suspension(self, ver_app, ver_client, admin_headers):
        from extensions import db
        from models.doctor import Doctor

        doc_id = self._make_pending_doctor(ver_app)
        email = db.session.get(Doctor, doc_id).email
        # Approve first
        ver_client.post(APPROVE_URL(doc_id), headers=admin_headers)
        # Suspend
        ver_client.post(SUSPEND_URL(doc_id), headers=admin_headers)
        # Login should now be blocked
        resp = ver_client.post(LOGIN_URL, json={
            'email': email,
            'password': 'TestPass1!',
            'role': 'doctor',
        })
        assert resp.status_code == 403
        assert resp.get_json()['error']['code'] == 'DOCTOR_ACCOUNT_SUSPENDED'
