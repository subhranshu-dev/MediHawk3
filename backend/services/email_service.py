"""
Email service for OTP delivery via SMTP.

SMTP credentials are loaded from Flask app config — never hardcoded.
For automated tests, CollectingTransport intercepts mail without sending real email.
The OTP plaintext is passed to send_otp_email() but is never stored or logged here.
"""
from __future__ import annotations

import base64 as _base64
import json as _json
import logging
import smtplib
import socket as _socket
import ssl as _ssl
import urllib.error as _urllib_error
import urllib.parse as _urllib_parse
import urllib.request as _urllib_request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


def _redact_username(username: str) -> str:
    """Return a log-safe redacted form of an email address."""
    if '@' in username:
        local, domain = username.split('@', 1)
        return f'{local[:2]}***@{domain}'
    return username[:2] + '***' if len(username) > 2 else '***'


# ── Transport classes ─────────────────────────────────────────────────────────

class SMTPTransport:
    """Sends real email via SMTP. Credentials from app config."""

    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        from_email: str,
        from_name: str,
        use_tls: bool = True,
    ):
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._from_email = from_email
        self._from_name = from_name
        self._use_tls = use_tls

    def send(self, to: str, subject: str, body_text: str, body_html: str | None = None) -> None:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f'{self._from_name} <{self._from_email}>'
        msg['To'] = to
        msg.attach(MIMEText(body_text, 'plain', 'utf-8'))
        if body_html:
            msg.attach(MIMEText(body_html, 'html', 'utf-8'))
        try:
            if self._use_tls:
                with smtplib.SMTP(self._host, self._port, timeout=30) as smtp:
                    smtp.ehlo()
                    smtp.starttls()
                    smtp.login(self._username, self._password)
                    smtp.sendmail(self._from_email, [to], msg.as_bytes())
            else:
                with smtplib.SMTP_SSL(self._host, self._port, timeout=30) as smtp:
                    smtp.login(self._username, self._password)
                    smtp.sendmail(self._from_email, [to], msg.as_bytes())
        except Exception as exc:
            # Log only sanitized info — never credentials
            logger.error(
                'SMTP delivery failed: exc=%s host=%s port=%d user=%s transport=%s',
                type(exc).__name__, self._host, self._port,
                _redact_username(self._username),
                'STARTTLS' if self._use_tls else 'SSL',
            )
            raise RuntimeError('EMAIL_DELIVERY_FAILED') from exc

    def test_auth(self) -> dict:
        """
        Staged SMTP diagnostic: DNS → TCP → SMTP greeting → STARTTLS → AUTH.
        Always returns a result dict — never raises, never returns credentials.

        Result keys:
          dns, tcp, smtp_greeting, starttls, connection, authentication
          error_category, error_type (on failure stages only)
        """
        result: dict = {
            'host': self._host,
            'port': self._port,
            'transport': 'STARTTLS' if self._use_tls else 'SSL',
            'username_configured': bool(self._username),
            'password_configured': bool(self._password),
            'from_email': self._from_email,
            'dns': 'untested',
            'tcp': 'untested',
            'smtp_greeting': 'untested',
            'starttls': 'n/a' if not self._use_tls else 'untested',
            'ssl_connect': 'n/a' if self._use_tls else 'untested',
            'connection': 'untested',
            'authentication': 'untested',
        }

        # Stage 1: DNS
        try:
            addrs = _socket.getaddrinfo(self._host, self._port, proto=_socket.IPPROTO_TCP)
            result['dns'] = 'ok'
            result['dns_address_count'] = len(addrs)
        except _socket.gaierror as exc:
            result['dns'] = 'failed'
            result['connection'] = 'failed'
            result['error_category'] = 'DNS_ERROR'
            result['error_type'] = type(exc).__name__
            logger.error('SMTP diagnostic DNS failed: host=%s exc=%s', self._host, type(exc).__name__)
            return result

        # Stage 2: TCP connect (isolated — no SMTP protocol yet)
        try:
            sock = _socket.create_connection((self._host, self._port), timeout=15)
            sock.close()
            result['tcp'] = 'ok'
        except (_socket.timeout, TimeoutError) as exc:
            result['tcp'] = 'failed'
            result['connection'] = 'failed'
            result['error_category'] = 'CONNECTION_TIMEOUT'
            result['error_type'] = type(exc).__name__
            logger.error('SMTP diagnostic TCP timeout: host=%s port=%d', self._host, self._port)
            return result
        except ConnectionRefusedError as exc:
            result['tcp'] = 'failed'
            result['connection'] = 'failed'
            result['error_category'] = 'CONNECTION_REFUSED'
            result['error_type'] = type(exc).__name__
            logger.error('SMTP diagnostic TCP refused: host=%s port=%d', self._host, self._port)
            return result
        except OSError as exc:
            result['tcp'] = 'failed'
            result['connection'] = 'failed'
            result['error_category'] = 'NETWORK_ERROR'
            result['error_type'] = type(exc).__name__
            result['errno'] = exc.errno
            logger.error('SMTP diagnostic TCP failed: host=%s port=%d exc=%s errno=%s',
                         self._host, self._port, type(exc).__name__, exc.errno)
            return result

        # Stage 3: Full SMTP session (greeting → STARTTLS/SSL → AUTH)
        try:
            if self._use_tls:
                with smtplib.SMTP(self._host, self._port, timeout=30) as smtp:
                    smtp.ehlo()
                    result['smtp_greeting'] = 'ok'
                    smtp.starttls()
                    result['starttls'] = 'ok'
                    result['connection'] = 'ok'
                    smtp.ehlo()
                    smtp.login(self._username, self._password)
                    result['authentication'] = 'ok'
            else:
                with smtplib.SMTP_SSL(self._host, self._port, timeout=30) as smtp:
                    result['ssl_connect'] = 'ok'
                    result['smtp_greeting'] = 'ok'
                    result['connection'] = 'ok'
                    smtp.login(self._username, self._password)
                    result['authentication'] = 'ok'
        except smtplib.SMTPAuthenticationError as exc:
            result['connection'] = 'ok'
            result['authentication'] = 'failed'
            result['error_category'] = 'SMTP_AUTH_ERROR'
            result['error_type'] = type(exc).__name__
            result['smtp_code'] = getattr(exc, 'smtp_code', None)
            logger.error('SMTP diagnostic auth failed: host=%s port=%d user=%s smtp_code=%s',
                         self._host, self._port,
                         _redact_username(self._username),
                         getattr(exc, 'smtp_code', None))
        except _ssl.SSLCertVerificationError as exc:
            result['connection'] = 'failed'
            if not self._use_tls:
                result['ssl_connect'] = 'failed'
            result['error_category'] = 'TLS_CERT_ERROR'
            result['error_type'] = type(exc).__name__
            logger.error('SMTP diagnostic TLS cert error: host=%s exc=%s', self._host, type(exc).__name__)
        except _ssl.SSLError as exc:
            result['connection'] = 'failed'
            if not self._use_tls:
                result['ssl_connect'] = 'failed'
            result['error_category'] = 'TLS_ERROR'
            result['error_type'] = type(exc).__name__
            logger.error('SMTP diagnostic TLS error: host=%s exc=%s', self._host, type(exc).__name__)
        except smtplib.SMTPConnectError as exc:
            result['connection'] = 'failed'
            result['error_category'] = 'SMTP_CONNECT_ERROR'
            result['error_type'] = type(exc).__name__
            logger.error('SMTP diagnostic SMTP connect error: host=%s exc=%s', self._host, type(exc).__name__)
        except Exception as exc:
            result['connection'] = 'failed'
            result['error_category'] = 'UNKNOWN_ERROR'
            result['error_type'] = type(exc).__name__
            logger.error('SMTP diagnostic unknown error: host=%s port=%d exc=%s',
                         self._host, self._port, type(exc).__name__)

        return result


class CollectingTransport:
    """
    In-process mail collector for automated tests.
    Records recipient + subject only — does NOT store body (OTP must not be retrievable).
    Never sends real email.
    """

    def __init__(self) -> None:
        self.sent: list[dict[str, str]] = []

    def send(self, to: str, subject: str, body_text: str, body_html: str | None = None) -> None:
        self.sent.append({'to': to, 'subject': subject})
        logger.debug('CollectingTransport: queued message for %s', to)

    def last_message(self) -> dict[str, str] | None:
        return self.sent[-1] if self.sent else None

    def clear(self) -> None:
        self.sent.clear()


class HTTPSTransport:
    """
    HTTPS-based email delivery — use when all outbound SMTP ports are blocked.
    Sends via a transactional email API over HTTPS (port 443, always open).

    Supported providers (set EMAIL_API_PROVIDER):
      'resend'   — api.resend.com  (simplest, free tier 3 000/month)
      'sendgrid' — api.sendgrid.com (free tier 100/day)
      'mailgun'  — api.mailgun.net  (requires EMAIL_API_DOMAIN)

    Never stores or logs credentials.  Uses Python stdlib only (no requests).
    """

    _PROVIDER_HOSTS: dict[str, str] = {
        'resend': 'api.resend.com',
        'sendgrid': 'api.sendgrid.com',
        'mailgun': 'api.mailgun.net',
    }

    def __init__(
        self,
        provider: str,
        api_key: str,
        from_email: str,
        from_name: str,
        domain: str = '',
    ) -> None:
        self._provider = provider.lower()
        self._api_key = api_key
        self._from_email = from_email
        self._from_name = from_name
        self._domain = domain

    def send(self, to: str, subject: str, body_text: str, body_html: str | None = None) -> None:
        try:
            if self._provider == 'resend':
                self._send_resend(to, subject, body_text, body_html)
            elif self._provider == 'sendgrid':
                self._send_sendgrid(to, subject, body_text, body_html)
            elif self._provider == 'mailgun':
                self._send_mailgun(to, subject, body_text, body_html)
            else:
                raise RuntimeError(f'Unknown EMAIL_API_PROVIDER: {self._provider!r}')
        except RuntimeError:
            raise  # Already an application-level error from _send_* — don't double-wrap
        except Exception as exc:
            logger.error('HTTPS email delivery failed: provider=%s exc=%s',
                         self._provider, type(exc).__name__)
            raise RuntimeError('EMAIL_DELIVERY_FAILED') from exc

    def _send_resend(self, to: str, subject: str, body_text: str, body_html: str | None) -> None:
        payload: dict = {
            'from': f'{self._from_name} <{self._from_email}>',
            'to': [to],
            'subject': subject,
            'text': body_text,
        }
        if body_html:
            payload['html'] = body_html
        req = _urllib_request.Request(
            'https://api.resend.com/emails',
            data=_json.dumps(payload).encode('utf-8'),
            headers={
                'Authorization': f'Bearer {self._api_key}',
                'Content-Type': 'application/json',
            },
            method='POST',
        )
        try:
            with _urllib_request.urlopen(req, timeout=30):
                pass  # 2xx success — urlopen raises HTTPError for 4xx/5xx
        except _urllib_error.HTTPError as exc:
            logger.error('Resend API HTTP error: status=%d', exc.code)
            raise RuntimeError('EMAIL_DELIVERY_FAILED') from exc

    def _send_sendgrid(self, to: str, subject: str, body_text: str, body_html: str | None) -> None:
        payload: dict = {
            'personalizations': [{'to': [{'email': to}]}],
            'from': {'email': self._from_email, 'name': self._from_name},
            'subject': subject,
            'content': [{'type': 'text/plain', 'value': body_text}],
        }
        if body_html:
            payload['content'].append({'type': 'text/html', 'value': body_html})
        req = _urllib_request.Request(
            'https://api.sendgrid.com/v3/mail/send',
            data=_json.dumps(payload).encode('utf-8'),
            headers={
                'Authorization': f'Bearer {self._api_key}',
                'Content-Type': 'application/json',
            },
            method='POST',
        )
        try:
            with _urllib_request.urlopen(req, timeout=30) as resp:
                pass  # 202 success — urlopen raises HTTPError for 4xx/5xx
        except _urllib_error.HTTPError as exc:
            logger.error('SendGrid API HTTP error: status=%d', exc.code)
            raise RuntimeError('EMAIL_DELIVERY_FAILED') from exc

    def _send_mailgun(self, to: str, subject: str, body_text: str, body_html: str | None) -> None:
        if not self._domain:
            raise RuntimeError('EMAIL_API_DOMAIN is required for Mailgun')
        creds = _base64.b64encode(f'api:{self._api_key}'.encode('utf-8')).decode('ascii')
        data: dict[str, str] = {
            'from': f'{self._from_name} <{self._from_email}>',
            'to': to,
            'subject': subject,
            'text': body_text,
        }
        if body_html:
            data['html'] = body_html
        req = _urllib_request.Request(
            f'https://api.mailgun.net/v3/{self._domain}/messages',
            data=_urllib_parse.urlencode(data).encode('ascii'),
            headers={
                'Authorization': f'Basic {creds}',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            method='POST',
        )
        try:
            with _urllib_request.urlopen(req, timeout=30) as resp:
                pass  # 200 success — urlopen raises HTTPError for 4xx/5xx
        except _urllib_error.HTTPError as exc:
            logger.error('Mailgun API HTTP error: status=%d', exc.code)
            raise RuntimeError('EMAIL_DELIVERY_FAILED') from exc

    def test_auth(self) -> dict:
        """
        Verify HTTPS provider reachability (DNS + TCP+TLS against the API host).
        Does NOT send a message.  Never returns credentials.
        """
        api_host = self._PROVIDER_HOSTS.get(self._provider)
        result: dict = {
            'transport': 'HTTPS',
            'provider': self._provider,
            'from_email': self._from_email,
            'api_key_configured': bool(self._api_key),
            'dns': 'untested',
            'tcp': 'untested',
            'tls_connect': 'untested',
            'connection': 'untested',
            'authentication': 'untested',
        }

        if not api_host:
            result['dns'] = 'n/a'
            result['tcp'] = 'n/a'
            result['tls_connect'] = 'n/a'
            result['connection'] = 'not_configured'
            result['error_category'] = 'UNKNOWN_PROVIDER'
            result['error_type'] = 'ConfigurationError'
            return result

        if not self._api_key:
            result['dns'] = 'n/a'
            result['tcp'] = 'n/a'
            result['tls_connect'] = 'n/a'
            result['connection'] = 'not_configured'
            result['authentication'] = 'not_configured'
            result['error_category'] = 'API_KEY_MISSING'
            return result

        if self._provider == 'mailgun' and not self._domain:
            result['dns'] = 'n/a'
            result['tcp'] = 'n/a'
            result['tls_connect'] = 'n/a'
            result['connection'] = 'not_configured'
            result['error_category'] = 'DOMAIN_MISSING'
            result['note'] = 'Set EMAIL_API_DOMAIN for Mailgun'
            return result

        # Stage 1: DNS
        try:
            addrs = _socket.getaddrinfo(api_host, 443, proto=_socket.IPPROTO_TCP)
            result['dns'] = 'ok'
            result['dns_address_count'] = len(addrs)
        except _socket.gaierror as exc:
            result['dns'] = 'failed'
            result['tcp'] = 'failed'
            result['tls_connect'] = 'failed'
            result['connection'] = 'failed'
            result['error_category'] = 'DNS_ERROR'
            result['error_type'] = type(exc).__name__
            logger.error('HTTPS provider DNS failed: host=%s exc=%s', api_host, type(exc).__name__)
            return result

        # Stage 2: TCP + TLS (HTTPS connect)
        try:
            ctx = _ssl.create_default_context()
            with _socket.create_connection((api_host, 443), timeout=15) as raw:
                with ctx.wrap_socket(raw, server_hostname=api_host):
                    pass
            result['tcp'] = 'ok'
            result['tls_connect'] = 'ok'
            result['connection'] = 'ok'
            result['authentication'] = 'configured'
            result['note'] = (
                f'HTTPS provider {self._provider!r} is reachable and TLS is valid. '
                'Use test-send to confirm actual delivery.'
            )
        except _ssl.SSLCertVerificationError as exc:
            result['tcp'] = 'ok'
            result['tls_connect'] = 'failed'
            result['connection'] = 'failed'
            result['error_category'] = 'TLS_CERT_ERROR'
            result['error_type'] = type(exc).__name__
            logger.error('HTTPS provider TLS cert error: host=%s exc=%s', api_host, type(exc).__name__)
        except _ssl.SSLError as exc:
            result['tcp'] = 'ok'
            result['tls_connect'] = 'failed'
            result['connection'] = 'failed'
            result['error_category'] = 'TLS_ERROR'
            result['error_type'] = type(exc).__name__
            logger.error('HTTPS provider TLS error: host=%s exc=%s', api_host, type(exc).__name__)
        except (_socket.timeout, TimeoutError) as exc:
            result['tcp'] = 'failed'
            result['tls_connect'] = 'failed'
            result['connection'] = 'failed'
            result['error_category'] = 'CONNECTION_TIMEOUT'
            result['error_type'] = type(exc).__name__
            logger.error('HTTPS provider TCP timeout: host=%s', api_host)
        except OSError as exc:
            result['tcp'] = 'failed'
            result['tls_connect'] = 'failed'
            result['connection'] = 'failed'
            result['error_category'] = 'NETWORK_ERROR'
            result['error_type'] = type(exc).__name__
            result['errno'] = exc.errno
            logger.error('HTTPS provider connection failed: host=%s exc=%s errno=%s',
                         api_host, type(exc).__name__, exc.errno)

        return result


# ── Module-level transport singleton ─────────────────────────────────────────

_transport: SMTPTransport | HTTPSTransport | CollectingTransport | None = None


def init_transport(app) -> None:
    """Initialize mail transport from Flask app config. Call once in app factory."""
    global _transport
    cfg = app.config

    if cfg.get('TESTING') or cfg.get('APP_MODE') == 'testing':
        _transport = CollectingTransport()
        logger.debug('Email: CollectingTransport active (test mode)')
        return

    provider = (cfg.get('EMAIL_PROVIDER') or 'smtp').lower()

    if provider == 'https':
        api_provider = (cfg.get('EMAIL_API_PROVIDER') or 'resend').lower()
        api_key = cfg.get('EMAIL_API_KEY', '')
        from_email = cfg.get('SMTP_FROM_EMAIL', '')
        from_name = cfg.get('SMTP_FROM_NAME', 'MediHawk')
        domain = cfg.get('EMAIL_API_DOMAIN', '')
        if not api_key:
            logger.warning('Email: EMAIL_PROVIDER=https but EMAIL_API_KEY not set — email will fail')
            _transport = None
            return
        _transport = HTTPSTransport(
            provider=api_provider,
            api_key=api_key,
            from_email=from_email,
            from_name=from_name,
            domain=domain,
        )
        logger.info(
            'Email: HTTPSTransport configured | provider=%s from=%s api_key_set=yes',
            api_provider, from_email or 'NOT_SET',
        )
        return

    # SMTP path
    if not cfg.get('SMTP_HOST'):
        _transport = None
        logger.warning('Email: SMTP_HOST not configured — OTP email will fail')
        return

    host = cfg['SMTP_HOST']
    port = cfg['SMTP_PORT']
    username = cfg['SMTP_USERNAME']
    password = cfg['SMTP_PASSWORD']
    from_email = cfg['SMTP_FROM_EMAIL']
    from_name = cfg.get('SMTP_FROM_NAME', 'MediHawk')
    # SMTP_USE_SSL=true → implicit SSL (port 465). Overrides SMTP_USE_TLS.
    use_ssl = cfg.get('SMTP_USE_SSL', False)
    use_tls = cfg.get('SMTP_USE_TLS', True) and not use_ssl

    _transport = SMTPTransport(
        host=host,
        port=port,
        username=username,
        password=password,
        from_email=from_email,
        from_name=from_name,
        use_tls=use_tls,
    )
    transport_mode = 'STARTTLS' if use_tls else 'SSL'
    logger.info(
        'Email: SMTPTransport configured | host=%s port=%d user=%s transport=%s from=%s pw_set=%s',
        host, port,
        _redact_username(username) if username else 'NOT_SET',
        transport_mode,
        from_email or 'NOT_SET',
        'yes' if password else 'NO',
    )


def get_transport() -> SMTPTransport | HTTPSTransport | CollectingTransport | None:
    return _transport


def send_otp_email(to_email: str, otp_plaintext: str, role: str) -> None:
    """
    Send OTP to to_email.
    Raises RuntimeError('EMAIL_NOT_CONFIGURED') when SMTP is not set up.
    Raises RuntimeError('EMAIL_DELIVERY_FAILED') when SMTP send fails.
    NEVER logs otp_plaintext.
    """
    transport = get_transport()
    if transport is None:
        raise RuntimeError('EMAIL_NOT_CONFIGURED')

    role_label = 'Doctor' if role == 'doctor' else 'Admin'
    subject = f'MediHawk {role_label} Portal — One-Time Password'
    body_text = (
        f'Your MediHawk {role_label} Portal one-time password is:\n\n'
        f'    {otp_plaintext}\n\n'
        f'This code is valid for 5 minutes. Do not share it with anyone.\n\n'
        f'If you did not request this, please ignore this message.'
    )
    body_html = (
        f'<div style="font-family:sans-serif;max-width:480px;margin:0 auto">'
        f'<h2 style="color:#C62832">MediHawk {role_label} Portal</h2>'
        f'<p>Your one-time password is:</p>'
        f'<div style="font-size:36px;font-weight:bold;letter-spacing:8px;'
        f'color:#17232B;background:#f3f7f9;padding:16px 24px;'
        f'border-radius:8px;display:inline-block">{otp_plaintext}</div>'
        f'<p style="color:#666">Valid for 5 minutes. Do not share with anyone.</p>'
        f'<p style="color:#999;font-size:12px">If you did not request this OTP, ignore this email.</p>'
        f'</div>'
    )
    transport.send(to_email, subject, body_text, body_html)


def send_order_notification_to_admins(admin_emails: list[str], order_id: str, doctor_name: str,
                                      medicine_summary: str, priority: str, destination: str) -> None:
    """
    Notify admins when a new order is placed.
    Silently skips if transport is not configured or send fails.
    Never logs sensitive order content.
    """
    transport = get_transport()
    if transport is None:
        return
    subject = f'[MediHawk] New {priority.capitalize()} Order — {order_id}'
    body_text = (
        f'A new medicine delivery order has been placed.\n\n'
        f'Order ID  : {order_id}\n'
        f'Priority  : {priority.upper()}\n'
        f'Doctor    : {doctor_name}\n'
        f'Medicine  : {medicine_summary}\n'
        f'Destination: {destination}\n\n'
        f'Log in to MediHawk Admin Portal to review and confirm this order.'
    )
    body_html = (
        f'<div style="font-family:sans-serif;max-width:560px;margin:0 auto">'
        f'<h2 style="color:#C62832">MediHawk — New Order Received</h2>'
        f'<table style="border-collapse:collapse;width:100%">'
        f'<tr><td style="padding:6px 12px;color:#666;width:120px">Order ID</td>'
        f'<td style="padding:6px 12px;font-weight:bold">{order_id}</td></tr>'
        f'<tr style="background:#f9f9f9"><td style="padding:6px 12px;color:#666">Priority</td>'
        f'<td style="padding:6px 12px;font-weight:bold;color:#C62832">{priority.upper()}</td></tr>'
        f'<tr><td style="padding:6px 12px;color:#666">Doctor</td>'
        f'<td style="padding:6px 12px">{doctor_name}</td></tr>'
        f'<tr style="background:#f9f9f9"><td style="padding:6px 12px;color:#666">Medicine</td>'
        f'<td style="padding:6px 12px">{medicine_summary}</td></tr>'
        f'<tr><td style="padding:6px 12px;color:#666">Destination</td>'
        f'<td style="padding:6px 12px">{destination}</td></tr>'
        f'</table>'
        f'<p style="margin-top:16px">Log in to the '
        f'<strong>MediHawk Admin Portal</strong> to review and confirm this order.</p>'
        f'</div>'
    )
    for email in admin_emails:
        try:
            transport.send(email, subject, body_text, body_html)
        except Exception:
            logger.warning('Order notification delivery failed for %s', email)


def send_signup_verification_email(to_email: str, otp_plaintext: str, role: str) -> None:
    """
    Send email address verification OTP after signup.
    Raises RuntimeError('EMAIL_NOT_CONFIGURED') when SMTP is not set up.
    Raises RuntimeError('EMAIL_DELIVERY_FAILED') when SMTP send fails.
    NEVER logs otp_plaintext.
    """
    transport = get_transport()
    if transport is None:
        raise RuntimeError('EMAIL_NOT_CONFIGURED')

    role_label = 'Doctor' if role == 'doctor' else 'Admin'
    subject = f'MediHawk {role_label} — Verify your email address'
    body_text = (
        f'Welcome to MediHawk!\n\n'
        f'Your email verification code is:\n\n'
        f'    {otp_plaintext}\n\n'
        f'This code is valid for 5 minutes. Do not share it with anyone.\n\n'
        f'If you did not create a MediHawk account, please ignore this message.'
    )
    body_html = (
        f'<div style="font-family:sans-serif;max-width:480px;margin:0 auto">'
        f'<h2 style="color:#C62832">Welcome to MediHawk</h2>'
        f'<p>Your email verification code is:</p>'
        f'<div style="font-size:36px;font-weight:bold;letter-spacing:8px;'
        f'color:#17232B;background:#f3f7f9;padding:16px 24px;'
        f'border-radius:8px;display:inline-block">{otp_plaintext}</div>'
        f'<p style="color:#666">Valid for 5 minutes. Do not share with anyone.</p>'
        f'<p style="color:#999;font-size:12px">'
        f'If you did not create a MediHawk account, ignore this email.</p>'
        f'</div>'
    )
    transport.send(to_email, subject, body_text, body_html)
