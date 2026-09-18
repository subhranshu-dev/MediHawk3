"""
Doctor verification and invitation management routes.

All endpoints require JWT authentication as admin (@require_admin).
Role is validated from the JWT sub claim — never from the request body.

Admin invitation endpoints:
  POST /api/admin/invitations             — create single-use invitation
  GET  /api/admin/invitations             — list all invitations
  POST /api/admin/invitations/<id>/revoke — revoke unused invitation

Admin doctor-verification endpoints:
  GET  /api/admin/verification/pending              — list PENDING doctors
  POST /api/admin/verification/<doctor_id>/approve  — set VERIFIED
  POST /api/admin/verification/<doctor_id>/reject   — set REJECTED
  POST /api/admin/verification/<doctor_id>/suspend  — set SUSPENDED

Admin SMTP diagnostic:
  GET  /api/admin/smtp/diagnostic                   — test SMTP config (no credentials returned)
  POST /api/admin/smtp/test-send                    — send test email to a specified address

Security properties:
  - Admin ID comes from the verified JWT (g.user_id), never from request body
  - Invitation raw code is returned once at creation and never stored
  - Only the HMAC-SHA256 digest is persisted
  - Used invitations cannot be revoked
  - verification_status transitions are audited (verified_at, verified_by_admin_id)
  - SMTP diagnostic never returns credentials (password, secrets, DATABASE_URL)
"""
from __future__ import annotations

import hashlib
import hmac as _hmac
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, request

from middleware.auth import require_admin
from models.doctor import VERIFICATION_STATUSES, Doctor
from models.invitation import DoctorInvitation
from utils.response import created, error, ok, validation_error

verification_bp = Blueprint('verification', __name__)
logger = logging.getLogger(__name__)

_INVITATION_EXPIRY_DAYS = 30


def _hash_code(code: str, secret: str) -> str:
    return _hmac.new(
        secret.encode('utf-8'),
        code.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()


# ── Invitation management ─────────────────────────────────────────────────────

@verification_bp.route('/api/admin/invitations', methods=['POST'])
@require_admin
def create_invitation():
    """
    Create a single-use doctor invitation code for a specific facility.

    Body: { "facility_id": "..." }

    Returns: { "invitation_id": "...", "code": "...", "expires_at": "..." }

    The raw code is returned ONCE and never stored. Keep it secure.
    """
    from extensions import db
    from models.location import Location

    data = request.get_json(silent=True) or {}
    facility_id = (data.get('facility_id') or '').strip()
    if not facility_id:
        return validation_error('Missing required field: facility_id')

    facility = db.session.get(Location, facility_id)
    if facility is None:
        return error('FACILITY_NOT_FOUND', f'Facility {facility_id!r} does not exist.', 404)

    hmac_secret = current_app.config.get('OTP_HMAC_SECRET', '')
    if not hmac_secret:
        logger.error('Invitation creation attempted but OTP_HMAC_SECRET is not configured')
        return error('INVITATION_SYSTEM_UNAVAILABLE', 'Invitation system is not configured.', 503)

    raw_code = secrets.token_hex(32)
    code_hash = _hash_code(raw_code, hmac_secret)
    inv_id = f'inv-{uuid.uuid4().hex[:8]}'
    expires_at = datetime.now(timezone.utc) + timedelta(days=_INVITATION_EXPIRY_DAYS)

    inv = DoctorInvitation(
        id=inv_id,
        code_hash=code_hash,
        facility_id=facility_id,
        created_by_admin_id=g.user_id,
        expires_at=expires_at,
    )
    db.session.add(inv)
    db.session.commit()

    logger.info('Invitation created: inv_id=%s facility=%s admin=%s', inv_id, facility_id, g.user_id)
    return created({
        'invitation_id': inv_id,
        'code': raw_code,
        'facility_id': facility_id,
        'facility_name': facility.name,
        'expires_at': expires_at.isoformat(),
        'message': f'Share this code with the doctor. It expires in {_INVITATION_EXPIRY_DAYS} days and can only be used once.',
    })


@verification_bp.route('/api/admin/invitations', methods=['GET'])
@require_admin
def list_invitations():
    """List all invitation codes (without raw codes — hashes are never returned)."""
    invitations = DoctorInvitation.query.order_by(DoctorInvitation.created_at.desc()).all()
    return ok({'invitations': [i.to_dict() for i in invitations]})


@verification_bp.route('/api/admin/invitations/<string:inv_id>/revoke', methods=['POST'])
@require_admin
def revoke_invitation(inv_id: str):
    """Revoke an unused invitation. Used invitations cannot be revoked."""
    from extensions import db

    inv = db.session.get(DoctorInvitation, inv_id)
    if inv is None:
        return error('INVITATION_NOT_FOUND', 'Invitation not found.', 404)
    if inv.used_by_doctor_id is not None:
        return error('INVITATION_ALREADY_USED', 'This invitation has already been used and cannot be revoked.', 409)
    if inv.revoked:
        return error('INVITATION_ALREADY_REVOKED', 'This invitation is already revoked.', 409)

    inv.revoked = True
    db.session.commit()

    logger.info('Invitation revoked: inv_id=%s admin=%s', inv_id, g.user_id)
    return ok({'message': 'Invitation revoked successfully.'})


# ── Doctor verification ───────────────────────────────────────────────────────

@verification_bp.route('/api/admin/verification/pending', methods=['GET'])
@require_admin
def list_pending_doctors():
    """List all doctors with verification_status='pending'."""
    doctors = Doctor.query.filter_by(verification_status='pending').order_by(Doctor.created_at).all()
    return ok({'doctors': [_doctor_detail(d) for d in doctors]})


@verification_bp.route('/api/admin/verification/<string:doctor_id>/approve', methods=['POST'])
@require_admin
def approve_doctor(doctor_id: str):
    """
    Approve a doctor registration.

    Body: { "notes": "..." }  (optional)

    Sets verification_status='verified', records verified_at and verified_by_admin_id.
    """
    from extensions import db

    data = request.get_json(silent=True) or {}
    notes = (data.get('notes') or '').strip() or None

    doctor = db.session.get(Doctor, doctor_id)
    if doctor is None:
        return error('DOCTOR_NOT_FOUND', 'Doctor not found.', 404)
    if doctor.verification_status == 'verified':
        return error('ALREADY_VERIFIED', 'This doctor is already verified.', 409)

    doctor.verification_status = 'verified'
    doctor.verified_at = datetime.now(timezone.utc)
    doctor.verified_by_admin_id = g.user_id
    doctor.verification_notes = notes
    db.session.commit()

    logger.info('Doctor approved: doctor_id=%s admin=%s', doctor_id, g.user_id)
    return ok({'message': 'Doctor approved successfully.', 'doctor': _doctor_detail(doctor)})


@verification_bp.route('/api/admin/verification/<string:doctor_id>/reject', methods=['POST'])
@require_admin
def reject_doctor(doctor_id: str):
    """
    Reject a doctor registration.

    Body: { "notes": "..." }  (optional but recommended)

    Sets verification_status='rejected'.
    """
    from extensions import db

    data = request.get_json(silent=True) or {}
    notes = (data.get('notes') or '').strip() or None

    doctor = db.session.get(Doctor, doctor_id)
    if doctor is None:
        return error('DOCTOR_NOT_FOUND', 'Doctor not found.', 404)
    if doctor.verification_status == 'rejected':
        return error('ALREADY_REJECTED', 'This doctor is already rejected.', 409)

    doctor.verification_status = 'rejected'
    doctor.verified_by_admin_id = g.user_id
    doctor.verification_notes = notes
    db.session.commit()

    logger.info('Doctor rejected: doctor_id=%s admin=%s', doctor_id, g.user_id)
    return ok({'message': 'Doctor registration rejected.', 'doctor': _doctor_detail(doctor)})


@verification_bp.route('/api/admin/verification/<string:doctor_id>/suspend', methods=['POST'])
@require_admin
def suspend_doctor(doctor_id: str):
    """
    Suspend a previously verified doctor.

    Body: { "notes": "..." }  (optional)

    Sets verification_status='suspended'. Doctor will be blocked from logging in.
    """
    from extensions import db

    data = request.get_json(silent=True) or {}
    notes = (data.get('notes') or '').strip() or None

    doctor = db.session.get(Doctor, doctor_id)
    if doctor is None:
        return error('DOCTOR_NOT_FOUND', 'Doctor not found.', 404)
    if doctor.verification_status == 'suspended':
        return error('ALREADY_SUSPENDED', 'This doctor is already suspended.', 409)

    doctor.verification_status = 'suspended'
    doctor.verified_by_admin_id = g.user_id
    doctor.verification_notes = notes
    db.session.commit()

    logger.warning('Doctor suspended: doctor_id=%s admin=%s', doctor_id, g.user_id)
    return ok({'message': 'Doctor account suspended.', 'doctor': _doctor_detail(doctor)})


# ── SMTP diagnostic ───────────────────────────────────────────────────────────

@verification_bp.route('/api/admin/smtp/diagnostic', methods=['GET'])
@require_admin
def smtp_diagnostic():
    """
    Test SMTP connection and authentication.  Never returns credentials.

    Response (safe fields only):
      {
        "configured": true,
        "host": "smtp.gmail.com",
        "port": 587,
        "transport": "STARTTLS",
        "username_configured": true,
        "password_configured": true,
        "from_email": "...",
        "connection": "ok",
        "authentication": "ok"
      }
    """
    from services.email_service import get_transport, SMTPTransport as _SMTPTransport

    transport = get_transport()

    if transport is None:
        return ok({
            'configured': False,
            'host': current_app.config.get('SMTP_HOST') or None,
            'port': current_app.config.get('SMTP_PORT'),
            'transport': None,
            'username_configured': bool(current_app.config.get('SMTP_USERNAME')),
            'password_configured': bool(current_app.config.get('SMTP_PASSWORD')),
            'from_email': current_app.config.get('SMTP_FROM_EMAIL') or None,
            'connection': 'not_configured',
            'authentication': 'not_configured',
        })

    if not isinstance(transport, _SMTPTransport):
        # CollectingTransport (test mode)
        return ok({
            'configured': False,
            'transport': 'collecting',
            'connection': 'test_mode',
            'authentication': 'test_mode',
            'note': 'SMTP not active — using CollectingTransport (test mode)',
        })

    result = transport.test_auth()
    result['configured'] = True
    logger.info(
        'SMTP diagnostic: dns=%s tcp=%s connection=%s auth=%s admin=%s',
        result.get('dns'), result.get('tcp'),
        result.get('connection'), result.get('authentication'), g.user_id,
    )
    return ok(result)


@verification_bp.route('/api/admin/smtp/test-send', methods=['POST'])
@require_admin
def smtp_test_send():
    """
    Send a test email to a specified address.  Requires admin JWT.
    Never returns credentials.

    Body: { "to": "admin@example.com" }
    """
    from services.email_service import get_transport, SMTPTransport as _SMTPTransport

    data = request.get_json(silent=True) or {}
    to_email = (data.get('to') or '').strip()
    if not to_email or '@' not in to_email:
        return validation_error('Missing or invalid field: to (must be a valid email address)')

    transport = get_transport()
    if transport is None or not isinstance(transport, _SMTPTransport):
        return error('SMTP_NOT_CONFIGURED', 'SMTP is not configured on this server.', 503)

    try:
        transport.send(
            to=to_email,
            subject='MediHawk — SMTP Test Email',
            body_text=(
                'This is a MediHawk SMTP diagnostic test email.\n\n'
                'If you received this, SMTP is configured correctly.\n\n'
                'Do not share this email — it contains no OTP or credentials.'
            ),
            body_html=(
                '<div style="font-family:sans-serif;max-width:480px;margin:0 auto">'
                '<h2 style="color:#C62832">MediHawk SMTP Test</h2>'
                '<p>This is a diagnostic test email from MediHawk.</p>'
                '<p style="color:green;font-weight:bold">✓ SMTP is configured correctly.</p>'
                '<p style="color:#999;font-size:12px">Do not share this email.</p>'
                '</div>'
            ),
        )
        logger.info('SMTP test email sent: to=%s admin=%s', to_email, g.user_id)
        return ok({'sent': True, 'to': to_email, 'message': 'Test email sent successfully.'})
    except RuntimeError:
        return error('EMAIL_DELIVERY_FAILED', 'Test email delivery failed. Check SMTP configuration.', 503)


# ── Private helpers ───────────────────────────────────────────────────────────

def _doctor_detail(doctor: Doctor) -> dict:
    base = doctor.to_dict()
    base['verified_at'] = doctor.verified_at.isoformat() if doctor.verified_at else None
    base['verified_by_admin_id'] = doctor.verified_by_admin_id
    base['verification_notes'] = doctor.verification_notes
    base['created_at'] = doctor.created_at.isoformat() if doctor.created_at else None
    return base
