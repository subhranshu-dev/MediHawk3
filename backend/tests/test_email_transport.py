"""
Tests for the email test-send endpoint across transport types.

Covers:
  - HTTPSTransport (EMAIL_PROVIDER=https) routes through test-send
  - SMTPTransport (EMAIL_PROVIDER=smtp) routes through test-send
  - Missing transport returns EMAIL_NOT_CONFIGURED, not SMTP_NOT_CONFIGURED
  - SMTP_NOT_CONFIGURED is never raised when an HTTPS provider is active
"""
from unittest.mock import MagicMock, patch

import pytest

ADMIN_SIGNUP_URL = '/api/auth/admin/signup'
LOGIN_URL        = '/api/login'
TEST_SEND_URL    = '/api/admin/smtp/test-send'

_INVITE = 'transport-test-invite-code'
_ADMIN  = {
    'name':        'Transport Test Admin',
    'email':       'transport.admin@medihawk.in',
    'password':    'AdminPass1',
    'invite_code': _INVITE,
}


@pytest.fixture
def transport_app(app):
    """App with ADMIN_INVITE_CODE configured."""
    app.config['ADMIN_INVITE_CODE'] = _INVITE
    return app


@pytest.fixture
def admin_headers(transport_app):
    """Create admin account and return auth headers."""
    client = transport_app.test_client()
    r = client.post(ADMIN_SIGNUP_URL, json=_ADMIN)
    assert r.status_code == 201, r.get_json()
    r = client.post(LOGIN_URL, json={
        'email': _ADMIN['email'], 'password': _ADMIN['password'], 'role': 'admin',
    })
    assert r.status_code == 200, r.get_json()
    return {'Authorization': f'Bearer {r.get_json()["token"]}'}


@pytest.fixture
def admin_client(transport_app):
    return transport_app.test_client()


class TestEmailTestSend:

    def test_https_transport_succeeds(self, admin_client, admin_headers):
        """EMAIL_PROVIDER=https → HTTPSTransport.send() is called, returns 200 sent=true."""
        from services.email_service import HTTPSTransport

        mock_t = MagicMock(spec=HTTPSTransport)
        mock_t.send.return_value = None  # delivery succeeds

        with patch('services.email_service._transport', mock_t):
            resp = admin_client.post(
                TEST_SEND_URL,
                json={'to': 'admin@example.com'},
                headers=admin_headers,
            )

        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()
        assert data['success'] is True
        assert data['sent'] is True
        assert data['to'] == 'admin@example.com'
        mock_t.send.assert_called_once()
        # Confirm the fixed bug: SMTP_NOT_CONFIGURED must not appear
        assert 'SMTP_NOT_CONFIGURED' not in str(data)

    def test_smtp_transport_succeeds(self, admin_client, admin_headers):
        """EMAIL_PROVIDER=smtp → SMTPTransport.send() is called, returns 200 sent=true."""
        from services.email_service import SMTPTransport

        mock_t = MagicMock(spec=SMTPTransport)
        mock_t.send.return_value = None

        with patch('services.email_service._transport', mock_t):
            resp = admin_client.post(
                TEST_SEND_URL,
                json={'to': 'admin@example.com'},
                headers=admin_headers,
            )

        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()
        assert data['success'] is True
        assert data['sent'] is True
        mock_t.send.assert_called_once()

    def test_no_transport_returns_email_not_configured(self, admin_client, admin_headers):
        """transport=None → 503 EMAIL_NOT_CONFIGURED (not SMTP_NOT_CONFIGURED)."""
        with patch('services.email_service._transport', None):
            resp = admin_client.post(
                TEST_SEND_URL,
                json={'to': 'admin@example.com'},
                headers=admin_headers,
            )

        assert resp.status_code == 503, resp.get_json()
        data = resp.get_json()
        assert data['error']['code'] == 'EMAIL_NOT_CONFIGURED'
        # The old bug was SMTP_NOT_CONFIGURED — assert it's gone
        assert 'SMTP_NOT_CONFIGURED' not in str(data)

    def test_https_send_failure_returns_delivery_failed(self, admin_client, admin_headers):
        """EMAIL_PROVIDER=https + send() raises RuntimeError → 503 EMAIL_DELIVERY_FAILED."""
        from services.email_service import HTTPSTransport

        mock_t = MagicMock(spec=HTTPSTransport)
        mock_t.send.side_effect = RuntimeError('EMAIL_DELIVERY_FAILED')

        with patch('services.email_service._transport', mock_t):
            resp = admin_client.post(
                TEST_SEND_URL,
                json={'to': 'admin@example.com'},
                headers=admin_headers,
            )

        assert resp.status_code == 503, resp.get_json()
        data = resp.get_json()
        assert data['error']['code'] == 'EMAIL_DELIVERY_FAILED'
        # Must NOT return SMTP_NOT_CONFIGURED even on failure
        assert 'SMTP_NOT_CONFIGURED' not in str(data)
