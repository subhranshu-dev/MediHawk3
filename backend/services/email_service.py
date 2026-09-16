"""
Email service for OTP delivery via SMTP.

SMTP credentials are loaded from Flask app config — never hardcoded.
For automated tests, CollectingTransport intercepts mail without sending real email.
The OTP plaintext is passed to send_otp_email() but is never stored or logged here.
"""
from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


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
                with smtplib.SMTP(self._host, self._port, timeout=10) as smtp:
                    smtp.ehlo()
                    smtp.starttls()
                    smtp.login(self._username, self._password)
                    smtp.sendmail(self._from_email, [to], msg.as_bytes())
            else:
                with smtplib.SMTP_SSL(self._host, self._port, timeout=10) as smtp:
                    smtp.login(self._username, self._password)
                    smtp.sendmail(self._from_email, [to], msg.as_bytes())
        except Exception as exc:
            # Log only sanitized info — never credentials
            logger.error('SMTP delivery failed: %s (host=%s port=%d)', type(exc).__name__, self._host, self._port)
            raise RuntimeError('EMAIL_DELIVERY_FAILED') from exc


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


# ── Module-level transport singleton ─────────────────────────────────────────

_transport: SMTPTransport | CollectingTransport | None = None


def init_transport(app) -> None:
    """Initialize mail transport from Flask app config. Call once in app factory."""
    global _transport
    cfg = app.config
    if cfg.get('TESTING') or cfg.get('APP_MODE') == 'testing':
        _transport = CollectingTransport()
        logger.debug('Email: CollectingTransport active (test mode)')
    elif cfg.get('SMTP_HOST'):
        _transport = SMTPTransport(
            host=cfg['SMTP_HOST'],
            port=cfg['SMTP_PORT'],
            username=cfg['SMTP_USERNAME'],
            password=cfg['SMTP_PASSWORD'],
            from_email=cfg['SMTP_FROM_EMAIL'],
            from_name=cfg.get('SMTP_FROM_NAME', 'MediHawk'),
            use_tls=cfg.get('SMTP_USE_TLS', True),
        )
        logger.info('Email: SMTPTransport configured (host=%s)', cfg['SMTP_HOST'])
    else:
        _transport = None
        logger.warning('Email: SMTP_HOST not configured — OTP email will fail')


def get_transport() -> SMTPTransport | CollectingTransport | None:
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
