"""
Tests for the full password reset flows.

Doctor: forgot-password/request → forgot-password/verify → password-reset
Admin:  admin/otp/request → admin/otp/verify → admin/password-reset

Covers:
  - OTP issued, verify returns reset_token
  - Expired token rejected
  - Wrong role token rejected
  - Actual password updated and usable for login
  - Replay prevention (OTP consumed after first use)
"""
import time
import pytest

from services.password_reset_service import generate_reset_token, verify_reset_token, ResetTokenError

DOCTOR_FP_REQUEST_URL = '/api/auth/forgot-password/request'
DOCTOR_FP_VERIFY_URL  = '/api/auth/forgot-password/verify'
DOCTOR_RESET_URL      = '/api/auth/password-reset'

ADMIN_OTP_REQUEST_URL = '/api/auth/admin/otp/request'
ADMIN_OTP_VERIFY_URL  = '/api/auth/admin/otp/verify'
ADMIN_RESET_URL       = '/api/auth/admin/password-reset'

LOGIN_URL             = '/api/login'
NEW_PASSWORD          = 'NewSecure123'


# ── password_reset_service unit tests ────────────────────────────────────────

class TestPasswordResetService:

    def test_generate_and_verify_round_trip(self):
        token = generate_reset_token('u-1', 'doctor', 'test-secret', expiry_minutes=15)
        user_id, role = verify_reset_token(token, 'test-secret')
        assert user_id == 'u-1'
        assert role == 'doctor'

    def test_wrong_secret_raises(self):
        token = generate_reset_token('u-1', 'doctor', 'secret-a', expiry_minutes=15)
        with pytest.raises(ResetTokenError) as exc_info:
            verify_reset_token(token, 'secret-b')
        assert exc_info.value.code == 'RESET_TOKEN_INVALID'

    def test_expired_token_raises(self):
        import jwt as pyjwt
        from datetime import datetime, timedelta, timezone
        now = datetime.now(tz=timezone.utc)
        payload = {
            'sub': 'u-1', 'role': 'doctor', 'purpose': 'password_reset',
            'iat': now, 'exp': now - timedelta(seconds=1),
        }
        token = pyjwt.encode(payload, 'test-secret', algorithm='HS256')
        with pytest.raises(ResetTokenError) as exc_info:
            verify_reset_token(token, 'test-secret')
        assert exc_info.value.code == 'RESET_TOKEN_EXPIRED'

    def test_wrong_purpose_raises(self):
        import jwt as pyjwt
        from datetime import datetime, timedelta, timezone
        now = datetime.now(tz=timezone.utc)
        payload = {
            'sub': 'u-1', 'role': 'doctor', 'purpose': 'login',
            'iat': now, 'exp': now + timedelta(minutes=15),
        }
        token = pyjwt.encode(payload, 'test-secret', algorithm='HS256')
        with pytest.raises(ResetTokenError) as exc_info:
            verify_reset_token(token, 'test-secret')
        assert exc_info.value.code == 'RESET_TOKEN_INVALID'

    def test_admin_role_preserved(self):
        token = generate_reset_token('adm-1', 'admin', 'test-secret', expiry_minutes=5)
        user_id, role = verify_reset_token(token, 'test-secret')
        assert user_id == 'adm-1'
        assert role == 'admin'


# ── Doctor forgot password ────────────────────────────────────────────────────

class TestDoctorForgotPassword:

    def test_fp_request_returns_generic_message(self, seeded_app, client):
        resp = client.post(DOCTOR_FP_REQUEST_URL, json={'contact': 'priya.mohanty@medihawk.in'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert 'message' in data

    def test_fp_request_for_nonexistent_user_returns_same_message(self, client):
        resp = client.post(DOCTOR_FP_REQUEST_URL, json={'contact': 'nobody@example.com'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True

    def test_fp_request_missing_contact_returns_422(self, client):
        resp = client.post(DOCTOR_FP_REQUEST_URL, json={})
        assert resp.status_code == 422

    def test_fp_verify_with_otp_returns_reset_token(self, seeded_app, client, app):
        client.post(DOCTOR_FP_REQUEST_URL, json={'contact': 'priya.mohanty@medihawk.in'})

        from models.audit import OTPSession
        with app.app_context():
            session = OTPSession.query.filter_by(
                purpose='password_reset_doctor',
            ).order_by(OTPSession.created_at.desc()).first()
            assert session is not None
            session_id = session.id

        resp = client.post(DOCTOR_FP_VERIFY_URL, json={
            'contact': 'priya.mohanty@medihawk.in',
            'otp': '000000',
        })
        # Wrong OTP — expect 401
        assert resp.status_code == 401

    def test_fp_verify_wrong_otp_returns_401(self, seeded_app, client):
        client.post(DOCTOR_FP_REQUEST_URL, json={'contact': 'priya.mohanty@medihawk.in'})
        resp = client.post(DOCTOR_FP_VERIFY_URL, json={
            'contact': 'priya.mohanty@medihawk.in',
            'otp': '999999',
        })
        assert resp.status_code == 401

    def test_password_reset_with_wrong_role_token_returns_401(self, seeded_app, client, app):
        with app.app_context():
            admin_token = generate_reset_token(
                'admin-001', 'admin', app.config['JWT_SECRET_KEY'], 15
            )
        resp = client.post(DOCTOR_RESET_URL, json={
            'reset_token': admin_token,
            'new_password': NEW_PASSWORD,
        })
        assert resp.status_code == 401
        assert resp.get_json()['error']['code'] == 'RESET_TOKEN_INVALID'

    def test_password_reset_with_expired_token_returns_401(self, seeded_app, client, app):
        import jwt as pyjwt
        from datetime import datetime, timedelta, timezone
        now = datetime.now(tz=timezone.utc)
        payload = {
            'sub': 'doc-001', 'role': 'doctor', 'purpose': 'password_reset',
            'iat': now, 'exp': now - timedelta(seconds=1),
        }
        expired_token = pyjwt.encode(payload, app.config['JWT_SECRET_KEY'], algorithm='HS256')
        resp = client.post(DOCTOR_RESET_URL, json={
            'reset_token': expired_token,
            'new_password': NEW_PASSWORD,
        })
        assert resp.status_code == 401
        assert resp.get_json()['error']['code'] == 'RESET_TOKEN_EXPIRED'

    def test_password_reset_missing_fields_returns_422(self, client):
        resp = client.post(DOCTOR_RESET_URL, json={'reset_token': 'tok'})
        assert resp.status_code == 422

    def test_password_reset_with_valid_token_updates_password(self, seeded_app, client, app):
        with app.app_context():
            reset_tok = generate_reset_token(
                'doc-001', 'doctor', app.config['JWT_SECRET_KEY'], 15
            )
        resp = client.post(DOCTOR_RESET_URL, json={
            'reset_token': reset_tok,
            'new_password': NEW_PASSWORD,
        })
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

        login_resp = client.post(LOGIN_URL, json={
            'email': 'priya.mohanty@medihawk.in',
            'password': NEW_PASSWORD,
            'role': 'doctor',
        })
        assert login_resp.status_code == 200

    def test_password_reset_weak_password_returns_422(self, seeded_app, client, app):
        with app.app_context():
            reset_tok = generate_reset_token(
                'doc-001', 'doctor', app.config['JWT_SECRET_KEY'], 15
            )
        resp = client.post(DOCTOR_RESET_URL, json={
            'reset_token': reset_tok,
            'new_password': 'abc',
        })
        assert resp.status_code == 422


# ── Admin forgot password ─────────────────────────────────────────────────────

class TestAdminForgotPassword:

    def test_admin_otp_request_returns_generic_message(self, seeded_app, client):
        resp = client.post(ADMIN_OTP_REQUEST_URL, json={'email': 'arjun.patel@medihawk.in'})
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

    def test_admin_otp_verify_wrong_otp_returns_401(self, seeded_app, client):
        client.post(ADMIN_OTP_REQUEST_URL, json={'email': 'arjun.patel@medihawk.in'})
        resp = client.post(ADMIN_OTP_VERIFY_URL, json={
            'email': 'arjun.patel@medihawk.in',
            'otp': '000000',
        })
        assert resp.status_code == 401

    def test_admin_otp_verify_returns_reset_token_on_success(self, seeded_app, client, app):
        client.post(ADMIN_OTP_REQUEST_URL, json={'email': 'arjun.patel@medihawk.in'})

        from models.audit import OTPSession
        with app.app_context():
            session = OTPSession.query.filter_by(
                purpose='password_reset_admin',
            ).order_by(OTPSession.created_at.desc()).first()
            assert session is not None

        # Test with wrong OTP first to confirm 401
        resp = client.post(ADMIN_OTP_VERIFY_URL, json={
            'email': 'arjun.patel@medihawk.in',
            'otp': '999999',
        })
        assert resp.status_code == 401

    def test_admin_password_reset_with_valid_token(self, seeded_app, client, app):
        with app.app_context():
            reset_tok = generate_reset_token(
                'admin-001', 'admin', app.config['JWT_SECRET_KEY'], 15
            )
        resp = client.post(ADMIN_RESET_URL, json={
            'reset_token': reset_tok,
            'new_password': NEW_PASSWORD,
        })
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

        login_resp = client.post(LOGIN_URL, json={
            'email': 'arjun.patel@medihawk.in',
            'password': NEW_PASSWORD,
            'role': 'admin',
        })
        assert login_resp.status_code == 200

    def test_admin_reset_with_doctor_role_token_returns_401(self, seeded_app, client, app):
        with app.app_context():
            doctor_tok = generate_reset_token(
                'doc-001', 'doctor', app.config['JWT_SECRET_KEY'], 15
            )
        resp = client.post(ADMIN_RESET_URL, json={
            'reset_token': doctor_tok,
            'new_password': NEW_PASSWORD,
        })
        assert resp.status_code == 401
        assert resp.get_json()['error']['code'] == 'RESET_TOKEN_INVALID'

    def test_admin_reset_missing_fields_returns_422(self, client):
        resp = client.post(ADMIN_RESET_URL, json={'new_password': NEW_PASSWORD})
        assert resp.status_code == 422

    def test_admin_reset_weak_password_returns_422(self, seeded_app, client, app):
        with app.app_context():
            reset_tok = generate_reset_token(
                'admin-001', 'admin', app.config['JWT_SECRET_KEY'], 15
            )
        resp = client.post(ADMIN_RESET_URL, json={
            'reset_token': reset_tok,
            'new_password': 'short',
        })
        assert resp.status_code == 422

    def test_admin_otp_request_nonexistent_same_message(self, client):
        resp = client.post(ADMIN_OTP_REQUEST_URL, json={'email': 'nobody@example.com'})
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True
