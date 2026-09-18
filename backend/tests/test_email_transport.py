"""
Tests for the email test-send endpoint and HTTPSTransport urllib error handling.

Covers:
  - HTTPSTransport (EMAIL_PROVIDER=https) routes through test-send
  - SMTPTransport (EMAIL_PROVIDER=smtp) routes through test-send
  - Missing transport returns EMAIL_NOT_CONFIGURED, not SMTP_NOT_CONFIGURED
  - SMTP_NOT_CONFIGURED is never raised when an HTTPS provider is active
  - urllib.error.HTTPError (4xx/5xx from provider) → EMAIL_DELIVERY_FAILED
  - Resend 403 + Cloudflare 1010 error body logged
  - User-Agent header set to 'MediHawk/1.0' (bypasses Cloudflare 1010 WAF block)
  - API key never appears in log output (no secret leakage)
  - HTTP status code + response body prefix logged for 4xx errors
  - FallbackTransport: SMTP primary, HTTPS fallback on network errors only
  - FallbackTransport: auth errors do NOT trigger HTTPS fallback
  - RESEND_API_KEY takes priority over EMAIL_API_KEY
  - EMAIL_API_FROM overrides SMTP_FROM_EMAIL for HTTPS transport
  - Missing API key → transport=None → EMAIL_NOT_CONFIGURED
  - Network timeout (URLError/socket.timeout) → EMAIL_DELIVERY_FAILED
  - Sender restriction (gmail From → 422) → EMAIL_DELIVERY_FAILED
  - OTP never returned in API responses
  - OTP session cancelled after delivery failure
  - OTP never appears in log output
"""
import io
import logging
import re
import urllib.error
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


class TestHTTPSTransportHTTPError:
    """
    urllib.error.HTTPError (4xx/5xx from the provider API) must be caught specifically
    so the HTTP status code can be logged and EMAIL_DELIVERY_FAILED is returned.
    Before the fix, HTTPError propagated through send() as a generic Exception, making
    Resend 401/403/422 errors indistinguishable in server logs.
    """

    def _make_http_error(self, status: int) -> urllib.error.HTTPError:
        return urllib.error.HTTPError(
            url='https://api.resend.com/emails',
            code=status,
            msg=f'HTTP {status}',
            hdrs=None,  # type: ignore[arg-type]
            fp=None,
        )

    def test_resend_401_raises_delivery_failed(self):
        """Resend 401 Unauthorized → RuntimeError('EMAIL_DELIVERY_FAILED')."""
        from services.email_service import HTTPSTransport

        t = HTTPSTransport(
            provider='resend', api_key='re_test_key',
            from_email='no-reply@medihawk.in', from_name='MediHawk',
        )
        with patch('urllib.request.urlopen', side_effect=self._make_http_error(401)):
            with pytest.raises(RuntimeError, match='EMAIL_DELIVERY_FAILED'):
                t.send('doc@hospital.in', 'Test', 'body')

    def test_resend_422_raises_delivery_failed(self):
        """Resend 422 Unprocessable → RuntimeError('EMAIL_DELIVERY_FAILED')."""
        from services.email_service import HTTPSTransport

        t = HTTPSTransport(
            provider='resend', api_key='re_test_key',
            from_email='no-reply@medihawk.in', from_name='MediHawk',
        )
        with patch('urllib.request.urlopen', side_effect=self._make_http_error(422)):
            with pytest.raises(RuntimeError, match='EMAIL_DELIVERY_FAILED'):
                t.send('doc@hospital.in', 'Test', 'body')

    def test_resend_429_raises_delivery_failed(self):
        """Resend 429 Too Many Requests → RuntimeError('EMAIL_DELIVERY_FAILED')."""
        from services.email_service import HTTPSTransport

        t = HTTPSTransport(
            provider='resend', api_key='re_test_key',
            from_email='no-reply@medihawk.in', from_name='MediHawk',
        )
        with patch('urllib.request.urlopen', side_effect=self._make_http_error(429)):
            with pytest.raises(RuntimeError, match='EMAIL_DELIVERY_FAILED'):
                t.send('doc@hospital.in', 'Test', 'body')

    def test_resend_500_raises_delivery_failed(self):
        """Resend 500 Server Error → RuntimeError('EMAIL_DELIVERY_FAILED')."""
        from services.email_service import HTTPSTransport

        t = HTTPSTransport(
            provider='resend', api_key='re_test_key',
            from_email='no-reply@medihawk.in', from_name='MediHawk',
        )
        with patch('urllib.request.urlopen', side_effect=self._make_http_error(500)):
            with pytest.raises(RuntimeError, match='EMAIL_DELIVERY_FAILED'):
                t.send('doc@hospital.in', 'Test', 'body')

    def test_resend_200_does_not_raise(self):
        """Resend 200 OK → no exception raised."""
        from services.email_service import HTTPSTransport
        from unittest.mock import MagicMock

        t = HTTPSTransport(
            provider='resend', api_key='re_test_key',
            from_email='no-reply@medihawk.in', from_name='MediHawk',
        )
        mock_resp = MagicMock()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        with patch('urllib.request.urlopen', return_value=mock_resp):
            t.send('doc@hospital.in', 'Test', 'body')  # Must not raise

    def test_resend_403_raises_delivery_failed(self):
        """Resend 403 Forbidden → RuntimeError('EMAIL_DELIVERY_FAILED')."""
        from services.email_service import HTTPSTransport

        t = HTTPSTransport(
            provider='resend', api_key='re_test_key',
            from_email='no-reply@medihawk.in', from_name='MediHawk',
        )
        with patch('urllib.request.urlopen', side_effect=self._make_http_error(403)):
            with pytest.raises(RuntimeError, match='EMAIL_DELIVERY_FAILED'):
                t.send('doc@hospital.in', 'Test', 'body')

    def test_resend_cloudflare_1010_body_logged(self, caplog):
        """Resend 403 + Cloudflare error 1010 body prefix → body logged for diagnosis."""
        from services.email_service import HTTPSTransport

        t = HTTPSTransport(
            provider='resend', api_key='re_test_key',
            from_email='no-reply@medihawk.in', from_name='MediHawk',
        )
        cf_body = b'<!DOCTYPE html><html><head><title>Access denied</title></head><body>error code: 1010</body></html>'
        http_err = urllib.error.HTTPError(
            url='https://api.resend.com/emails',
            code=403, msg='Forbidden',
            hdrs=None,  # type: ignore[arg-type]
            fp=io.BytesIO(cf_body),
        )
        with patch('urllib.request.urlopen', side_effect=http_err):
            with pytest.raises(RuntimeError, match='EMAIL_DELIVERY_FAILED'):
                with caplog.at_level(logging.ERROR):
                    t.send('doc@hospital.in', 'Test', 'body')
        assert '403' in caplog.text
        assert '1010' in caplog.text

    def test_resend_user_agent_header_is_medihawk(self):
        """Request to Resend API must include User-Agent: MediHawk/1.0 to avoid CF 1010."""
        import urllib.request as ur
        from services.email_service import HTTPSTransport

        t = HTTPSTransport(
            provider='resend', api_key='re_test_key',
            from_email='no-reply@medihawk.in', from_name='MediHawk',
        )
        captured: list[ur.Request] = []

        def capture_request(req, timeout=None):
            captured.append(req)
            mock_resp = MagicMock()
            mock_resp.__enter__ = lambda s: s
            mock_resp.__exit__ = MagicMock(return_value=False)
            return mock_resp

        with patch('urllib.request.urlopen', side_effect=capture_request):
            t.send('doc@hospital.in', 'Test', 'body')

        assert len(captured) == 1
        ua = captured[0].get_header('User-agent')
        assert ua == 'MediHawk/1.0', f'Expected MediHawk/1.0 but got: {ua!r}'

    def test_resend_api_key_not_in_logs(self, caplog):
        """API key must never appear in log records (no secret leakage)."""
        from services.email_service import HTTPSTransport

        secret_key = 're_super_secret_api_key_12345'
        t = HTTPSTransport(
            provider='resend', api_key=secret_key,
            from_email='no-reply@medihawk.in', from_name='MediHawk',
        )
        err_body = b'{"statusCode":403,"name":"forbidden","message":"Forbidden"}'
        http_err = urllib.error.HTTPError(
            url='https://api.resend.com/emails',
            code=403, msg='Forbidden',
            hdrs=None,  # type: ignore[arg-type]
            fp=io.BytesIO(err_body),
        )
        with patch('urllib.request.urlopen', side_effect=http_err):
            with pytest.raises(RuntimeError):
                with caplog.at_level(logging.DEBUG):
                    t.send('doc@hospital.in', 'Test', 'body')
        for record in caplog.records:
            assert secret_key not in record.getMessage(), (
                f'API key leaked in log: {record.getMessage()}'
            )

    def test_resend_sender_restriction_gmail_raises_delivery_failed(self, caplog):
        """Gmail sender (@gmail.com) rejected by Resend 422 → EMAIL_DELIVERY_FAILED."""
        from services.email_service import HTTPSTransport

        t = HTTPSTransport(
            provider='resend', api_key='re_test_key',
            from_email='user@gmail.com', from_name='MediHawk',
        )
        err_body = (
            b'{"statusCode":422,"name":"validation_error",'
            b'"message":"The from address user@gmail.com is not verified."}'
        )
        http_err = urllib.error.HTTPError(
            url='https://api.resend.com/emails',
            code=422, msg='Unprocessable',
            hdrs=None,  # type: ignore[arg-type]
            fp=io.BytesIO(err_body),
        )
        with patch('urllib.request.urlopen', side_effect=http_err):
            with pytest.raises(RuntimeError, match='EMAIL_DELIVERY_FAILED'):
                with caplog.at_level(logging.ERROR):
                    t.send('doc@hospital.in', 'Test', 'body')
        assert '422' in caplog.text

    def test_resend_invalid_api_key_raises_delivery_failed(self):
        """Invalid/revoked API key → Resend 401 → EMAIL_DELIVERY_FAILED."""
        from services.email_service import HTTPSTransport

        t = HTTPSTransport(
            provider='resend', api_key='re_invalid_or_revoked',
            from_email='no-reply@medihawk.in', from_name='MediHawk',
        )
        with patch('urllib.request.urlopen', side_effect=self._make_http_error(401)):
            with pytest.raises(RuntimeError, match='EMAIL_DELIVERY_FAILED'):
                t.send('doc@hospital.in', 'Test', 'body')


# ── FallbackTransport tests ────────────────────────────────────────────────────

class TestFallbackTransport:
    """FallbackTransport: SMTP primary, HTTPS fallback on network errors only."""

    def _make_smtp(self):
        from services.email_service import SMTPTransport
        return SMTPTransport(
            host='smtp.gmail.com', port=587,
            username='test@example.com', password='pw',
            from_email='test@example.com', from_name='Test',
            use_tls=True,
        )

    def _make_https(self):
        from services.email_service import HTTPSTransport
        return HTTPSTransport(
            provider='resend', api_key='re_test_key',
            from_email='test@example.com', from_name='Test',
        )

    def _make_fallback(self):
        from services.email_service import FallbackTransport
        return FallbackTransport(smtp=self._make_smtp(), https=self._make_https())

    def test_smtp_success_no_fallback(self):
        """SMTP succeeds → HTTPS never called."""
        t = self._make_fallback()
        with patch.object(t._smtp, 'send') as smtp_send, \
             patch.object(t._https, 'send') as https_send:
            t.send('r@x.com', 'subj', 'body')
        smtp_send.assert_called_once()
        https_send.assert_not_called()

    def test_smtp_network_error_triggers_fallback(self):
        """SMTP_NETWORK_ERROR → HTTPS fallback called."""
        t = self._make_fallback()
        with patch.object(t._smtp, 'send', side_effect=RuntimeError('SMTP_NETWORK_ERROR')), \
             patch.object(t._https, 'send') as https_send:
            t.send('r@x.com', 'subj', 'body')
        https_send.assert_called_once()

    def test_smtp_auth_error_does_not_fallback(self):
        """EMAIL_DELIVERY_FAILED (auth/TLS error) → NOT falling back, re-raised."""
        t = self._make_fallback()
        with patch.object(t._smtp, 'send', side_effect=RuntimeError('EMAIL_DELIVERY_FAILED')), \
             patch.object(t._https, 'send') as https_send:
            with pytest.raises(RuntimeError, match='EMAIL_DELIVERY_FAILED'):
                t.send('r@x.com', 'subj', 'body')
        https_send.assert_not_called()

    def test_smtp_network_error_https_also_fails(self):
        """SMTP_NETWORK_ERROR + HTTPS also fails → EMAIL_DELIVERY_FAILED propagated."""
        t = self._make_fallback()
        with patch.object(t._smtp, 'send', side_effect=RuntimeError('SMTP_NETWORK_ERROR')), \
             patch.object(t._https, 'send', side_effect=RuntimeError('EMAIL_DELIVERY_FAILED')):
            with pytest.raises(RuntimeError, match='EMAIL_DELIVERY_FAILED'):
                t.send('r@x.com', 'subj', 'body')

    def test_smtp_enetunreach_raises_network_error(self):
        """errno 101 (ENETUNREACH) from SMTP → SMTP_NETWORK_ERROR."""
        from services.email_service import SMTPTransport
        smtp = self._make_smtp()
        err = OSError('Network is unreachable')
        err.errno = 101
        with patch('smtplib.SMTP', side_effect=err):
            with pytest.raises(RuntimeError, match='SMTP_NETWORK_ERROR'):
                smtp.send('r@x.com', 'subj', 'body')

    def test_smtp_timeout_raises_network_error(self):
        """Connection timeout → SMTP_NETWORK_ERROR."""
        from services.email_service import SMTPTransport
        import socket
        smtp = self._make_smtp()
        with patch('smtplib.SMTP', side_effect=socket.timeout('timed out')):
            with pytest.raises(RuntimeError, match='SMTP_NETWORK_ERROR'):
                smtp.send('r@x.com', 'subj', 'body')

    def test_fallback_test_auth_includes_fallback_info(self):
        """FallbackTransport.test_auth includes fallback_provider and fallback_note."""
        t = self._make_fallback()
        with patch.object(t._smtp, 'test_auth', return_value={'connection': 'ok', 'authentication': 'ok'}):
            result = t.test_auth()
        assert result['fallback_transport'] == 'HTTPS'
        assert result['fallback_provider'] == 'resend'
        assert result['fallback_api_key_configured'] is True
        assert 'fallback_note' in result


# ── HTTPSTransport network errors ────────────────────────────────────────────

class TestHTTPSTransportNetworkErrors:
    """urllib network-level failures must produce EMAIL_DELIVERY_FAILED, never swallowed."""

    def _make_transport(self):
        from services.email_service import HTTPSTransport
        return HTTPSTransport(
            provider='resend', api_key='re_test_key',
            from_email='noreply@example.com', from_name='Test',
        )

    def test_url_error_raises_delivery_failed(self):
        """urllib.error.URLError (DNS failure / no route) → EMAIL_DELIVERY_FAILED."""
        t = self._make_transport()
        with patch('urllib.request.urlopen',
                   side_effect=urllib.error.URLError('Name or service not known')):
            with pytest.raises(RuntimeError, match='EMAIL_DELIVERY_FAILED'):
                t.send('doc@hospital.in', 'Test', 'body')

    def test_socket_timeout_raises_delivery_failed(self):
        """socket.timeout during urlopen → EMAIL_DELIVERY_FAILED."""
        import socket
        t = self._make_transport()
        with patch('urllib.request.urlopen', side_effect=socket.timeout('timed out')):
            with pytest.raises(RuntimeError, match='EMAIL_DELIVERY_FAILED'):
                t.send('doc@hospital.in', 'Test', 'body')

    def test_resend_422_body_logged(self, caplog):
        """Resend 422 response body prefix is logged so 'invalid from address' is visible."""
        t = self._make_transport()
        err_body = (
            b'{"statusCode":422,"name":"validation_error",'
            b'"message":"The from address must be a verified sender"}'
        )
        http_err = urllib.error.HTTPError(
            url='https://api.resend.com/emails',
            code=422, msg='Unprocessable',
            hdrs=None,  # type: ignore[arg-type]
            fp=io.BytesIO(err_body),
        )
        with patch('urllib.request.urlopen', side_effect=http_err):
            with pytest.raises(RuntimeError, match='EMAIL_DELIVERY_FAILED'):
                with caplog.at_level(logging.ERROR):
                    t.send('doc@hospital.in', 'Test', 'body')
        assert '422' in caplog.text
        # Body prefix must appear in the log so the root cause is diagnosable
        assert 'validation_error' in caplog.text or 'verified sender' in caplog.text


# ── RESEND_API_KEY and EMAIL_API_FROM configuration ──────────────────────────

class TestResendApiKeyAndFromConfig:
    """RESEND_API_KEY + EMAIL_API_FROM must be picked up correctly by init_transport."""

    def _init(self, app, overrides: dict):
        """Temporarily disable TESTING mode, apply overrides, call init_transport."""
        from services import email_service
        saved = {k: app.config.get(k) for k in ('TESTING', 'APP_MODE')}
        app.config['TESTING'] = False
        app.config['APP_MODE'] = 'simulation'
        app.config.update(overrides)
        try:
            email_service.init_transport(app)
            return email_service.get_transport()
        finally:
            for k, v in saved.items():
                if v is not None:
                    app.config[k] = v
            # Restore CollectingTransport for subsequent tests
            email_service.init_transport(app)

    def test_resend_api_key_used_when_set(self, app):
        """RESEND_API_KEY → HTTPSTransport with that key."""
        from services.email_service import HTTPSTransport
        transport = self._init(app, {
            'EMAIL_PROVIDER': 'https',
            'RESEND_API_KEY': 're_primary_key',
            'EMAIL_API_KEY': '',
            'EMAIL_API_FROM': 'noreply@example.com',
        })
        assert isinstance(transport, HTTPSTransport)
        assert transport._api_key == 're_primary_key'

    def test_email_api_key_fallback_when_resend_not_set(self, app):
        """When RESEND_API_KEY absent, EMAIL_API_KEY is used as fallback."""
        from services.email_service import HTTPSTransport
        transport = self._init(app, {
            'EMAIL_PROVIDER': 'https',
            'RESEND_API_KEY': '',
            'EMAIL_API_KEY': 're_fallback_key',
            'EMAIL_API_FROM': 'noreply@example.com',
        })
        assert isinstance(transport, HTTPSTransport)
        assert transport._api_key == 're_fallback_key'

    def test_resend_key_takes_priority_over_email_api_key(self, app):
        """RESEND_API_KEY takes precedence when both are set."""
        from services.email_service import HTTPSTransport
        transport = self._init(app, {
            'EMAIL_PROVIDER': 'https',
            'RESEND_API_KEY': 're_primary',
            'EMAIL_API_KEY': 're_secondary',
            'EMAIL_API_FROM': 'noreply@example.com',
        })
        assert isinstance(transport, HTTPSTransport)
        assert transport._api_key == 're_primary'

    def test_missing_api_key_transport_is_none(self, app):
        """No RESEND_API_KEY and no EMAIL_API_KEY → _transport is None."""
        transport = self._init(app, {
            'EMAIL_PROVIDER': 'https',
            'RESEND_API_KEY': '',
            'EMAIL_API_KEY': '',
        })
        assert transport is None

    def test_email_api_from_overrides_smtp_from_email(self, app):
        """EMAIL_API_FROM is used as the From address for HTTPSTransport."""
        from services.email_service import HTTPSTransport
        transport = self._init(app, {
            'EMAIL_PROVIDER': 'https',
            'RESEND_API_KEY': 're_test_key',
            'EMAIL_API_KEY': '',
            'SMTP_FROM_EMAIL': 'smtp@gmail.com',
            'EMAIL_API_FROM': 'noreply@resend.dev',
        })
        assert isinstance(transport, HTTPSTransport)
        assert transport._from_email == 'noreply@resend.dev'

    def test_missing_email_api_from_falls_back_to_smtp_from(self, app):
        """When EMAIL_API_FROM not set, SMTP_FROM_EMAIL is used and a warning is logged."""
        from services.email_service import HTTPSTransport
        transport = self._init(app, {
            'EMAIL_PROVIDER': 'https',
            'RESEND_API_KEY': 're_test_key',
            'EMAIL_API_KEY': '',
            'SMTP_FROM_EMAIL': 'fallback@example.com',
            'EMAIL_API_FROM': '',
        })
        assert isinstance(transport, HTTPSTransport)
        assert transport._from_email == 'fallback@example.com'

    def test_missing_email_api_from_emits_warning(self, app, caplog):
        """Missing EMAIL_API_FROM with a gmail sender emits a warning."""
        self._init(app, {
            'EMAIL_PROVIDER': 'https',
            'RESEND_API_KEY': 're_test_key',
            'EMAIL_API_KEY': '',
            'SMTP_FROM_EMAIL': 'user@gmail.com',
            'EMAIL_API_FROM': '',
        })
        assert any('EMAIL_API_FROM' in r.message for r in caplog.records
                   if r.levelno >= logging.WARNING)


# ── OTP security invariants ───────────────────────────────────────────────────

class TestOTPSecurityInvariants:
    """OTP plaintext must never appear in API responses or log output."""

    _DOCTOR_EMAIL = 'otp.security.doc@medihawk.in'
    _DOCTOR_PASSWORD = 'DocPass@9876'

    @pytest.fixture
    def doctor_in_db(self, app):
        """Insert a minimal active Doctor directly into the test DB; return (app, client)."""
        import bcrypt
        from extensions import db
        from models.doctor import Doctor

        pw_hash = bcrypt.hashpw(
            self._DOCTOR_PASSWORD.encode(), bcrypt.gensalt(rounds=4)
        ).decode()
        doc = Doctor(
            id='doc-security-test-01',
            name='OTP Security Doctor',
            email=self._DOCTOR_EMAIL,
            phone='9876543210',
            password_hash=pw_hash,
            is_active=True,
            email_verified=True,
            verification_status='verified',
        )
        db.session.add(doc)
        db.session.commit()
        return app, app.test_client()

    def test_otp_not_in_successful_otp_request_response(self, app):
        """POST /api/auth/otp/request must not include any 6-digit OTP in the response.

        The anti-enumeration design means 200 is returned whether or not the account exists,
        so a real doctor is not required — no OTP is sent, and the response must not
        contain one regardless.
        """
        client = app.test_client()
        resp = client.post('/api/auth/otp/request', json={
            'email': 'nobody@example.com',
            'role': 'doctor',
        })
        assert resp.status_code == 200, resp.get_json()
        body = resp.get_data(as_text=True)
        assert not re.search(r'\b\d{6}\b', body), (
            f'Response body may contain an OTP code: {body}'
        )

    def test_otp_session_cancelled_after_delivery_failure(self, doctor_in_db):
        """Email delivery failure → OTP session cancelled → verify returns OTP_INVALID."""
        from services.email_service import HTTPSTransport
        _app, client = doctor_in_db

        mock_transport = MagicMock(spec=HTTPSTransport)
        mock_transport.send.side_effect = RuntimeError('EMAIL_DELIVERY_FAILED')

        with patch('services.email_service._transport', mock_transport):
            r = client.post('/api/auth/otp/request', json={
                'email': self._DOCTOR_EMAIL,
                'role': 'doctor',
            })
        assert r.status_code == 503, r.get_json()

        # Session must be cancelled — any OTP verify attempt must fail
        r2 = client.post('/api/auth/otp/verify', json={
            'email': self._DOCTOR_EMAIL,
            'otp': '000000',
            'role': 'doctor',
        })
        assert r2.status_code == 401
        assert r2.get_json()['error']['code'] == 'OTP_INVALID'

    def test_otp_not_in_logs_during_generation(self, app, caplog):
        """OTP plaintext must not appear in any log record during generation."""
        from services.otp_service import request_otp
        with caplog.at_level(logging.DEBUG):
            otp = request_otp(app.config, 'log.check@example.com', 'login_doctor')
        for record in caplog.records:
            assert otp not in record.getMessage(), (
                f'OTP appeared in log message: {record.getMessage()[:80]}'
            )
