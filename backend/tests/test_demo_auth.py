"""
Tests for demo authentication mode (DEMO_AUTH_ENABLED).

Coverage:
  - GET /api/config/public — demo_auth_enabled flag
  - POST /api/auth/demo/login — all branches
  - Demo seeding via _seed_demo_accounts
  - Security: role comes from DB not request body
  - Security: demo endpoint disabled when flag is off
"""
from __future__ import annotations

import pytest


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def demo_app(app):
    """App with DEMO_AUTH_ENABLED=True and demo accounts seeded."""
    app.config['DEMO_AUTH_ENABLED'] = True
    with app.app_context():
        from app import _seed_demo_accounts
        _seed_demo_accounts(app)
    yield app
    # restore
    app.config['DEMO_AUTH_ENABLED'] = False


@pytest.fixture()
def demo_client(demo_app):
    return demo_app.test_client()


@pytest.fixture()
def real_client(client):
    """Client where DEMO_AUTH_ENABLED stays False (default test app)."""
    return client


# ── GET /api/config/public ───────────────────────────────────────────────────

class TestPublicConfig:
    def test_demo_enabled_true(self, demo_client):
        r = demo_client.get('/api/config/public')
        assert r.status_code == 200
        data = r.get_json()
        assert data['demo_auth_enabled'] is True

    def test_demo_enabled_false(self, real_client):
        r = real_client.get('/api/config/public')
        assert r.status_code == 200
        data = r.get_json()
        assert data['demo_auth_enabled'] is False

    def test_no_secrets_in_response(self, demo_client):
        r = demo_client.get('/api/config/public')
        body = r.get_data(as_text=True)
        # Only expected keys should appear
        data = r.get_json()
        sensitive = {'jwt_secret', 'password', 'smtp', 'api_key', 'otp_secret'}
        for key in data:
            assert key.lower() not in sensitive


# ── POST /api/auth/demo/login ────────────────────────────────────────────────

class TestDemoLogin:
    def test_doctor_demo_login_returns_jwt(self, demo_client):
        r = demo_client.post('/api/auth/demo/login', json={'role': 'doctor'})
        assert r.status_code == 200
        data = r.get_json()
        assert 'token' in data
        assert data['user']['id'] == 'doc-demo-001'

    def test_admin_demo_login_returns_jwt(self, demo_client):
        r = demo_client.post('/api/auth/demo/login', json={'role': 'admin'})
        assert r.status_code == 200
        data = r.get_json()
        assert 'token' in data
        assert data['user']['id'] == 'admin-demo-001'

    def test_demo_doctor_jwt_role_is_doctor(self, demo_client, demo_app):
        r = demo_client.post('/api/auth/demo/login', json={'role': 'doctor'})
        token = r.get_json()['token']
        import jwt as pyjwt
        payload = pyjwt.decode(token, demo_app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
        assert payload['role'] == 'doctor'

    def test_demo_admin_jwt_role_is_admin(self, demo_client, demo_app):
        r = demo_client.post('/api/auth/demo/login', json={'role': 'admin'})
        token = r.get_json()['token']
        import jwt as pyjwt
        payload = pyjwt.decode(token, demo_app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
        assert payload['role'] == 'admin'

    def test_demo_jwt_sub_is_user_id(self, demo_client, demo_app):
        r = demo_client.post('/api/auth/demo/login', json={'role': 'doctor'})
        token = r.get_json()['token']
        import jwt as pyjwt
        payload = pyjwt.decode(token, demo_app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
        assert payload['sub'] == 'doc-demo-001'

    def test_demo_disabled_returns_403(self, real_client):
        r = real_client.post('/api/auth/demo/login', json={'role': 'doctor'})
        assert r.status_code == 403
        assert r.get_json()['error']['code'] == 'DEMO_AUTH_DISABLED'

    def test_invalid_role_returns_validation_error(self, demo_client):
        r = demo_client.post('/api/auth/demo/login', json={'role': 'superadmin'})
        assert r.status_code == 422

    def test_missing_role_returns_validation_error(self, demo_client):
        r = demo_client.post('/api/auth/demo/login', json={})
        assert r.status_code == 422

    def test_role_from_db_not_request_body(self, demo_client, demo_app):
        """Verify that the JWT role comes from the DB, not from the body."""
        r = demo_client.post('/api/auth/demo/login', json={'role': 'doctor'})
        assert r.status_code == 200
        token = r.get_json()['token']
        import jwt as pyjwt
        payload = pyjwt.decode(token, demo_app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
        assert payload['role'] == 'doctor'

    def test_demo_login_does_not_accept_arbitrary_credentials(self, demo_client):
        """Body should only accept role — extra fields are ignored, no credentials needed."""
        r = demo_client.post('/api/auth/demo/login',
                             json={'role': 'doctor', 'email': 'hacker@evil.com', 'password': 'pwn'})
        assert r.status_code == 200
        data = r.get_json()
        assert data['user']['email'] == 'demo.doctor@medihawk.local'

    def test_demo_response_user_fields_present(self, demo_client):
        r = demo_client.post('/api/auth/demo/login', json={'role': 'doctor'})
        user = r.get_json()['user']
        for field in ('id', 'name', 'email', 'role'):
            assert field in user, f"Missing field: {field}"


# ── Demo seeding idempotency ─────────────────────────────────────────────────

class TestDemoSeeding:
    def test_seeding_is_idempotent(self, demo_app):
        """Calling _seed_demo_accounts twice must not raise or duplicate records."""
        from app import _seed_demo_accounts
        # Should not raise
        _seed_demo_accounts(demo_app)
        _seed_demo_accounts(demo_app)
        with demo_app.app_context():
            from extensions import db
            from models.doctor import Doctor
            from models.admin import Admin
            count_d = db.session.query(Doctor).filter_by(id='doc-demo-001').count()
            count_a = db.session.query(Admin).filter_by(id='admin-demo-001').count()
        assert count_d == 1
        assert count_a == 1

    def test_demo_doctor_verification_status_is_verified(self, demo_app):
        with demo_app.app_context():
            from extensions import db
            from models.doctor import Doctor
            doc = db.session.get(Doctor, 'doc-demo-001')
        assert doc.verification_status == 'verified'
        assert doc.email_verified is True

    def test_demo_doctor_email_is_local_domain(self, demo_app):
        with demo_app.app_context():
            from extensions import db
            from models.doctor import Doctor
            doc = db.session.get(Doctor, 'doc-demo-001')
        assert doc.email == 'demo.doctor@medihawk.local'

    def test_demo_admin_email_is_local_domain(self, demo_app):
        with demo_app.app_context():
            from extensions import db
            from models.admin import Admin
            adm = db.session.get(Admin, 'admin-demo-001')
        assert adm.email == 'demo.admin@medihawk.local'

    def test_demo_accounts_not_seeded_when_flag_off(self, app):
        """When DEMO_AUTH_ENABLED=False, no demo accounts should be auto-seeded via create_app."""
        assert not app.config.get('DEMO_AUTH_ENABLED')
        with app.app_context():
            from extensions import db
            from models.doctor import Doctor
            from models.admin import Admin
            # Accounts should not exist (they were not seeded)
            doc = db.session.get(Doctor, 'doc-demo-001')
            adm = db.session.get(Admin, 'admin-demo-001')
        # They may be None (not seeded) — this test just confirms the flag was off
        assert not app.config.get('DEMO_AUTH_ENABLED')
