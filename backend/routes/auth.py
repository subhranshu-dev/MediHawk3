"""
Authentication routes.

Endpoints:
    POST /api/login                         — email+password or phone+password
    POST /api/logout                        — stateless JWT logout (client discards token)
    GET  /api/verify-token                  — validate the current Bearer token
    POST /api/auth/otp/request              — request email OTP for doctor login
    POST /api/auth/otp/verify               — verify OTP and receive JWT (doctor)
    POST /api/auth/admin/otp/request        — request email OTP for admin password reset
    POST /api/auth/admin/otp/verify         — verify admin OTP, return reset_token
    POST /api/auth/doctor/signup            — doctor self-registration
    POST /api/auth/admin/signup             — admin controlled registration (invite code)
    POST /api/auth/verify-email             — verify email address after signup
    POST /api/auth/forgot-password/request  — doctor: send password reset OTP
    POST /api/auth/forgot-password/verify   — doctor: verify OTP, return reset_token
    POST /api/auth/password-reset           — doctor: apply new password (needs reset_token)
    POST /api/auth/admin/password-reset     — admin: apply new password (needs reset_token)

Security properties:
    - Role is NOT trusted from the client — it is read from the database record.
    - Email identifiers are case-folded and whitespace-stripped before lookup.
    - Phone identifiers are normalized to canonical 10-digit format.
    - Inactive accounts (is_active=False) are rejected with ACCOUNT_DISABLED.
    - OTP is NEVER generated, verified, or returned by the frontend.
    - OTP email is sent to the user's account email (from DB), not the raw request string.
    - OTP session is bound to the authenticated user_id to prevent cross-account confusion.
    - OTP is stored only as a keyed HMAC-SHA256 digest.
    - OTP session is cancelled on SMTP failure — no usable session without confirmed delivery.
    - Admin signup requires ADMIN_INVITE_CODE — no unrestricted public registration.
    - Password reset uses short-lived purpose-bound JWTs, not OTP values.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from flask import Blueprint, current_app, g, jsonify, request

from middleware.auth import require_auth
from models.admin import Admin
from models.doctor import Doctor
from services.auth_service import generate_token, hash_password, verify_password
from services.email_service import send_otp_email, send_signup_verification_email
from services.otp_service import OtpError, cancel_pending_otp, request_otp, verify_otp
from services.password_reset_service import ResetTokenError, generate_reset_token, verify_reset_token
from utils.normalizers import normalize_email, normalize_phone
from utils.response import created, error, ok, validation_error
from utils.validators import USER_ROLES, validate_enum, validate_password_strength, validate_string_length

auth_bp = Blueprint('auth', __name__)
logger = logging.getLogger(__name__)


# ── Password login ────────────────────────────────────────────────────────────

@auth_bp.route('/api/login', methods=['POST'])
def login():
    """
    Authenticate a doctor or admin using email/phone + password.
    Returns a signed JWT on success.

    Accepts:
        { "email": "...", "password": "...", "role": "doctor|admin" }
        { "phone": "...", "password": "...", "role": "doctor" }

    The 'role' field selects the user table to look up.
    The JWT role is taken from the database record, not the client request.
    """
    data = request.get_json(silent=True) or {}

    raw_contact = (data.get('email') or data.get('phone') or '').strip()
    password = data.get('password', '')
    role_hint = data.get('role', '')

    missing = []
    if not raw_contact:
        missing.append('email or phone')
    if not password:
        missing.append('password')
    if missing:
        return validation_error(f"Missing required fields: {', '.join(missing)}")

    role_err = validate_enum(str(role_hint), tuple(USER_ROLES), 'role')
    if role_err:
        return validation_error(role_err)

    contact = normalize_email(raw_contact) if '@' in raw_contact else raw_contact
    user = _find_user(contact, role_hint)

    if user is None or not user.password_hash or not verify_password(password, user.password_hash):
        logger.warning('Failed login attempt for contact=%s role=%s', _redact(contact), role_hint)
        return error('INVALID_CREDENTIALS', 'Invalid credentials.', 401)

    if not getattr(user, 'is_active', True):
        logger.warning('Login attempt for disabled account: user_id=%s', user.id)
        return error('ACCOUNT_DISABLED', 'This account has been disabled. Contact the administrator.', 403)

    if role_hint == 'doctor':
        vs = getattr(user, 'verification_status', 'verified')
        if vs == 'pending':
            logger.info('Login blocked: doctor pending verification user_id=%s', user.id)
            return error('DOCTOR_VERIFICATION_PENDING',
                         'Your account is pending administrator review. You will be notified once approved.', 403)
        if vs == 'rejected':
            logger.info('Login blocked: doctor rejected user_id=%s', user.id)
            return error('DOCTOR_VERIFICATION_REJECTED',
                         'Your registration was not approved. Contact support for more information.', 403)
        if vs == 'suspended':
            logger.warning('Login blocked: doctor suspended user_id=%s', user.id)
            return error('DOCTOR_ACCOUNT_SUSPENDED',
                         'Your account has been suspended. Contact the administrator.', 403)

    db_role = user.to_dict().get('role', role_hint)

    token = generate_token(
        user_id=user.id,
        role=db_role,
        secret=current_app.config['JWT_SECRET_KEY'],
        expiry_hours=current_app.config.get('JWT_EXPIRY_HOURS', 8),
    )

    _update_last_login(user)

    logger.info('Successful login: user_id=%s role=%s', user.id, db_role)
    return ok({'token': token, 'user': user.to_dict()})


@auth_bp.route('/api/logout', methods=['POST'])
@require_auth
def logout():
    """Stateless JWT logout — client must discard the token."""
    logger.info('Logout: user_id=%s', g.user_id)
    return ok({'message': 'Logged out successfully.'})


@auth_bp.route('/api/verify-token', methods=['GET'])
@require_auth
def verify_token():
    """Validate the current Bearer token and return the user payload."""
    from extensions import db as _db

    if g.user_role == 'doctor':
        user = _db.session.get(Doctor, g.user_id)
    else:
        user = _db.session.get(Admin, g.user_id)

    if user is None:
        return error('USER_NOT_FOUND', 'User account no longer exists.', 404)

    if not getattr(user, 'is_active', True):
        return error('ACCOUNT_DISABLED', 'This account has been disabled.', 403)

    return ok({'valid': True, 'user': user.to_dict()})


# ── Doctor signup ─────────────────────────────────────────────────────────────

@auth_bp.route('/api/auth/doctor/signup', methods=['POST'])
def doctor_signup():
    """
    Doctor self-registration with institutional verification.

    Body:
      { "name": "...", "email": "...", "phone": "...", "password": "...",
        "medical_registration_no": "...", "phc_id": "...", "invitation_code": "..." }

    The invitation_code is an admin-issued single-use code that authorises
    this registration. It is validated via HMAC digest — never stored in plaintext.

    Sends the verification OTP first; only if email delivery succeeds are the
    doctor account and invitation committed to the database. This prevents orphaned
    accounts when SMTP is misconfigured. The account cannot be used until an admin
    sets verification_status='verified'.
    """
    import hashlib
    import hmac as _hmac
    from datetime import datetime, timezone
    from extensions import db
    from models.invitation import DoctorInvitation

    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    email_raw = data.get('email', '').strip()
    phone_raw = data.get('phone', '').strip()
    password = data.get('password', '')
    med_reg_no = data.get('medical_registration_no', '').strip() or None
    phc_id = data.get('phc_id', '').strip() or None
    invitation_code = data.get('invitation_code', '').strip()

    missing = []
    if not name:            missing.append('name')
    if not email_raw:       missing.append('email')
    if not phone_raw:       missing.append('phone')
    if not password:        missing.append('password')
    if not med_reg_no:      missing.append('medical_registration_no')
    if not phc_id:          missing.append('phc_id')
    if not invitation_code: missing.append('invitation_code')
    if missing:
        return validation_error(f"Missing required fields: {', '.join(missing)}")

    name_err = validate_string_length(name, 'name', min_len=2, max_len=200)
    if name_err:
        return validation_error(name_err)

    pw_err = validate_password_strength(password, current_app.config.get('PASSWORD_MIN_LENGTH', 8))
    if pw_err:
        return validation_error(pw_err)

    normalized_email = normalize_email(email_raw)
    normalized_phone = normalize_phone(phone_raw)
    if not normalized_phone:
        return validation_error('Invalid phone number. Enter a 10-digit Indian mobile number.')

    # ── Validate invitation code ──────────────────────────────────────────────
    hmac_secret = current_app.config.get('OTP_HMAC_SECRET', '')
    if not hmac_secret:
        logger.error('Doctor signup attempted but OTP_HMAC_SECRET is not configured')
        return error('INVITATION_SYSTEM_UNAVAILABLE', 'Invitation system is not configured. Contact support.', 503)

    supplied_hash = _hmac.new(
        hmac_secret.encode('utf-8'),
        invitation_code.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()

    # Fetch all non-expired, non-revoked, unused invitations for this facility
    # and find the one whose hash matches (constant-time per row)
    now_utc = datetime.now(timezone.utc)
    invitation = DoctorInvitation.query.filter_by(
        facility_id=phc_id,
        revoked=False,
        used_by_doctor_id=None,
    ).filter(DoctorInvitation.expires_at > now_utc).all()

    matched_inv = None
    for inv in invitation:
        if _hmac.compare_digest(inv.code_hash, supplied_hash):
            matched_inv = inv
            break

    if matched_inv is None:
        logger.warning('Doctor signup: invalid/expired/used invitation for phc=%s email=%s',
                       phc_id, _redact(normalized_email))
        return error('INVALID_INVITATION_CODE',
                     'Invalid, expired, or already-used invitation code.', 403)

    if Doctor.query.filter_by(email=normalized_email).first():
        return error('EMAIL_EXISTS', 'An account with this email already exists.', 409)
    if Doctor.query.filter_by(phone=normalized_phone).first():
        return error('PHONE_EXISTS', 'An account with this phone number already exists.', 409)
    if med_reg_no and Doctor.query.filter_by(medical_registration_no=med_reg_no).first():
        return error('MED_REG_NO_EXISTS', 'An account with this medical registration number already exists.', 409)

    doctor_id = f'doc-{uuid.uuid4().hex[:8]}'

    # Attempt OTP creation and email BEFORE committing the doctor account.
    # OTPSession.user_id has no FK constraint, so we can forward-reference the
    # doctor_id even though the doctor row does not exist yet.  If email fails,
    # we cancel the OTP and return 503 — no doctor record is ever written.
    purpose = 'email_verify_doctor'
    try:
        otp_plaintext = request_otp(current_app.config, normalized_email, purpose, user_id=doctor_id)
        send_signup_verification_email(normalized_email, otp_plaintext, 'doctor')
    except OtpError as exc:
        return error(exc.code, str(exc), exc.http_status)
    except RuntimeError as exc:
        cancel_pending_otp(normalized_email, purpose)
        exc_code = str(exc)
        if exc_code == 'EMAIL_NOT_CONFIGURED':
            return error(
                'EMAIL_DELIVERY_NOT_CONFIGURED',
                'Email delivery is not configured on this server. Contact support.',
                503,
            )
        return error('EMAIL_DELIVERY_FAILED',
                     'Could not send verification email. Please try again.', 503)

    # Email delivered — now commit doctor + invitation atomically.
    doctor = Doctor(
        id=doctor_id,
        name=name,
        email=normalized_email,
        phone=normalized_phone,
        phc_id=matched_inv.facility_id,  # authoritative facility from invitation
        password_hash=hash_password(password),
        is_active=True,
        email_verified=False,
        verification_status='pending',
        medical_registration_no=med_reg_no,
    )
    db.session.add(doctor)
    matched_inv.used_by_doctor_id = doctor_id
    matched_inv.used_at = now_utc
    db.session.commit()

    logger.info('Doctor signup: user_id=%s email=%s invitation=%s',
                doctor_id, _redact(normalized_email), matched_inv.id)
    return created({'message': 'Account created. Check your email for a verification code. Your account will be reviewed by an administrator before you can log in.', 'user_id': doctor_id})


# ── Admin signup (invite-code controlled) ─────────────────────────────────────

@auth_bp.route('/api/auth/admin/signup', methods=['POST'])
def admin_signup():
    """
    Admin registration — requires a valid ADMIN_INVITE_CODE.

    Body: { "name": "...", "email": "...", "password": "...", "invite_code": "..." }

    The invite_code is compared in constant time to prevent timing attacks.
    """
    import hmac as _hmac
    from extensions import db

    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    email_raw = data.get('email', '').strip()
    password = data.get('password', '')
    invite_code = data.get('invite_code', '')

    missing = []
    if not name:        missing.append('name')
    if not email_raw:   missing.append('email')
    if not password:    missing.append('password')
    if not invite_code: missing.append('invite_code')
    if missing:
        return validation_error(f"Missing required fields: {', '.join(missing)}")

    expected_code = current_app.config.get('ADMIN_INVITE_CODE', '')
    if not expected_code:
        logger.warning('Admin signup attempted but ADMIN_INVITE_CODE is not configured')
        return error('SIGNUP_DISABLED', 'Admin self-registration is not enabled on this server.', 403)

    if not _hmac.compare_digest(str(invite_code), str(expected_code)):
        logger.warning('Admin signup: invalid invite code from email=%s', _redact(normalize_email(email_raw)))
        return error('INVALID_INVITE_CODE', 'Invalid invite code.', 403)

    name_err = validate_string_length(name, 'name', min_len=2, max_len=200)
    if name_err:
        return validation_error(name_err)

    pw_err = validate_password_strength(password, current_app.config.get('PASSWORD_MIN_LENGTH', 8))
    if pw_err:
        return validation_error(pw_err)

    normalized_email = normalize_email(email_raw)

    if Admin.query.filter_by(email=normalized_email).first():
        return error('EMAIL_EXISTS',
                     'An admin account with this email already exists. '
                     'Try logging in, or use the forgot-password flow to reset your password.', 409)

    admin_id = f'adm-{uuid.uuid4().hex[:8]}'
    admin = Admin(
        id=admin_id,
        name=name,
        email=normalized_email,
        password_hash=hash_password(password),
        is_active=True,
    )
    db.session.add(admin)
    db.session.commit()

    purpose = 'email_verify_admin'
    try:
        otp_plaintext = request_otp(current_app.config, normalized_email, purpose, user_id=admin_id)
        send_signup_verification_email(normalized_email, otp_plaintext, 'admin')
    except OtpError as exc:
        return error(exc.code, str(exc), exc.http_status)
    except RuntimeError as exc:
        cancel_pending_otp(normalized_email, purpose)
        exc_code = str(exc)
        # Admin accounts have no email_verified requirement at login.
        # Account IS committed — admin can log in immediately despite SMTP failure.
        if exc_code == 'EMAIL_NOT_CONFIGURED':
            logger.warning('Admin signup: SMTP not configured, email verification skipped for admin_id=%s', admin_id)
            return created({
                'message': (
                    'Account created. Email delivery is not configured on this server — '
                    'email verification is not required for admin accounts. '
                    'You can log in now with your credentials.'
                ),
                'user_id': admin_id,
                'email_verified': False,
                'login_available': True,
            })
        logger.warning('Admin signup: SMTP delivery failed, admin can still log in. admin_id=%s', admin_id)
        return created({
            'message': (
                'Account created. Verification email could not be delivered — '
                'email verification is not required for admin accounts. '
                'You can log in now with your credentials.'
            ),
            'user_id': admin_id,
            'email_verified': False,
            'login_available': True,
        })

    logger.info('Admin signup: user_id=%s email=%s', admin_id, _redact(normalized_email))
    return created({'message': 'Account created. Check your email for a verification code.', 'user_id': admin_id})


# ── Email verification ────────────────────────────────────────────────────────

@auth_bp.route('/api/auth/verify-email', methods=['POST'])
def verify_email():
    """
    Verify email address after signup using the OTP sent during registration.

    Body: { "email": "...", "otp": "123456", "role": "doctor|admin" }

    Sets email_verified=True on the account.
    """
    from extensions import db

    data = request.get_json(silent=True) or {}
    email_raw = data.get('email', '').strip()
    otp_plaintext = data.get('otp', '').strip()
    role = data.get('role', '')

    if not email_raw or not otp_plaintext:
        return validation_error('Missing required fields: email, otp')

    role_err = validate_enum(str(role), tuple(USER_ROLES), 'role')
    if role_err:
        return validation_error(role_err)

    normalized = normalize_email(email_raw)
    purpose = f'email_verify_{role}'

    try:
        verify_otp(current_app.config, normalized, purpose, otp_plaintext)
    except OtpError as exc:
        return error(exc.code, str(exc), exc.http_status)

    if role == 'doctor':
        user = Doctor.query.filter_by(email=normalized).first()
    else:
        user = Admin.query.filter_by(email=normalized).first()

    if user is None:
        return error('USER_NOT_FOUND', 'Account not found.', 404)

    if hasattr(user, 'email_verified'):
        user.email_verified = True
    db.session.commit()

    logger.info('Email verified: user_id=%s role=%s', user.id, role)
    return ok({'message': 'Email verified successfully.'})


# ── Email OTP — Doctor login ──────────────────────────────────────────────────

@auth_bp.route('/api/auth/otp/request', methods=['POST'])
def otp_request():
    """
    Request an email OTP for doctor login.

    Body: { "email": "...", "role": "doctor" }

    Security:
      - OTP is sent to the doctor's registered email from the database record,
        not to an arbitrary caller-supplied address.
      - Returns a generic success response regardless of whether the account
        exists to prevent account enumeration.
      - OTP session is cancelled if email delivery fails.
      - OTP session is bound to the account's user_id.
    """
    data = request.get_json(silent=True) or {}
    email_raw = data.get('email', '').strip()
    role = data.get('role', 'doctor')

    if not email_raw:
        return validation_error('Missing required field: email')

    role_err = validate_enum(str(role), ('doctor',), 'role')
    if role_err:
        return validation_error(role_err)

    normalized = normalize_email(email_raw)
    purpose = f'login_{role}'

    try:
        otp_plaintext = request_otp(current_app.config, normalized, purpose)
    except OtpError as exc:
        return error(exc.code, str(exc), exc.http_status)

    user = _find_user(normalized, role)

    if user is None or not getattr(user, 'is_active', True):
        cancel_pending_otp(normalized, purpose)
        logger.info('OTP requested for non-existent/inactive account: identifier=%s', _redact(normalized))
        return ok({'message': 'If this account is eligible, an OTP has been sent to your email.'})

    _bind_otp_to_user(normalized, purpose, user.id)

    try:
        send_otp_email(user.email, otp_plaintext, role)
    except RuntimeError as exc:
        cancel_pending_otp(normalized, purpose)
        exc_code = str(exc)
        if exc_code == 'EMAIL_NOT_CONFIGURED':
            return error(
                'EMAIL_DELIVERY_NOT_CONFIGURED',
                'Email delivery is not configured on this server. Contact the system administrator.',
                503,
            )
        return error('EMAIL_DELIVERY_FAILED', 'Unable to send OTP. Please try again later.', 503)

    logger.info('OTP sent: user_id=%s purpose=%s recipient=%s',
                user.id, purpose, _redact(user.email))
    return ok({'message': 'If this account is eligible, an OTP has been sent to your email.'})


@auth_bp.route('/api/auth/otp/verify', methods=['POST'])
def otp_verify():
    """
    Verify doctor email OTP and issue a JWT.

    Body: { "email": "...", "otp": "123456", "role": "doctor" }
    """
    data = request.get_json(silent=True) or {}
    email_raw = data.get('email', '').strip()
    otp_plaintext = data.get('otp', '').strip()
    role = data.get('role', 'doctor')

    if not email_raw or not otp_plaintext:
        return validation_error('Missing required fields: email, otp')

    role_err = validate_enum(str(role), ('doctor',), 'role')
    if role_err:
        return validation_error(role_err)

    normalized = normalize_email(email_raw)
    purpose = f'login_{role}'

    try:
        session_user_id = verify_otp(current_app.config, normalized, purpose, otp_plaintext)
    except OtpError as exc:
        return error(exc.code, str(exc), exc.http_status)

    user = None
    if session_user_id:
        from extensions import db as _db
        user = _db.session.get(Doctor, session_user_id)
        if user and normalize_email(user.email) != normalized:
            logger.warning('OTP verify: session user_id=%s email mismatch (submitted %s)',
                           session_user_id, _redact(normalized))
            return error('INVALID_CREDENTIALS', 'Invalid credentials.', 401)
    if user is None:
        user = _find_user(normalized, role)

    if user is None:
        return error('INVALID_CREDENTIALS', 'Invalid credentials.', 401)

    if not getattr(user, 'is_active', True):
        return error('ACCOUNT_DISABLED', 'This account has been disabled. Contact the administrator.', 403)

    vs = getattr(user, 'verification_status', 'verified')
    if vs == 'pending':
        logger.info('OTP login blocked: doctor pending verification user_id=%s', user.id)
        return error('DOCTOR_VERIFICATION_PENDING',
                     'Your account is pending administrator review. You will be notified once approved.', 403)
    if vs == 'rejected':
        logger.info('OTP login blocked: doctor rejected user_id=%s', user.id)
        return error('DOCTOR_VERIFICATION_REJECTED',
                     'Your registration was not approved. Contact support for more information.', 403)
    if vs == 'suspended':
        logger.warning('OTP login blocked: doctor suspended user_id=%s', user.id)
        return error('DOCTOR_ACCOUNT_SUSPENDED',
                     'Your account has been suspended. Contact the administrator.', 403)

    db_role = user.to_dict().get('role', role)
    token = generate_token(
        user_id=user.id,
        role=db_role,
        secret=current_app.config['JWT_SECRET_KEY'],
        expiry_hours=current_app.config.get('JWT_EXPIRY_HOURS', 8),
    )
    _update_last_login(user)
    logger.info('OTP login successful: user_id=%s role=%s', user.id, db_role)
    return ok({'token': token, 'user': user.to_dict()})


# ── Email OTP — Admin password reset ─────────────────────────────────────────

@auth_bp.route('/api/auth/admin/otp/request', methods=['POST'])
def admin_otp_request():
    """
    Request an email OTP for admin identity verification (password reset flow).

    Body: { "email": "..." }
    """
    data = request.get_json(silent=True) or {}
    email_raw = data.get('email', '').strip()
    if not email_raw:
        return validation_error('Missing required field: email')

    normalized = normalize_email(email_raw)
    purpose = 'password_reset_admin'

    try:
        otp_plaintext = request_otp(current_app.config, normalized, purpose)
    except OtpError as exc:
        return error(exc.code, str(exc), exc.http_status)

    user = Admin.query.filter_by(email=normalized).first()

    if user is None or not getattr(user, 'is_active', True):
        cancel_pending_otp(normalized, purpose)
        logger.info('Admin OTP for non-existent/inactive account: identifier=%s', _redact(normalized))
        return ok({'message': 'If this administrator account exists, an OTP has been sent.'})

    _bind_otp_to_user(normalized, purpose, user.id)

    try:
        send_otp_email(user.email, otp_plaintext, 'admin')
    except RuntimeError as exc:
        cancel_pending_otp(normalized, purpose)
        exc_code = str(exc)
        if exc_code == 'EMAIL_NOT_CONFIGURED':
            return error(
                'EMAIL_DELIVERY_NOT_CONFIGURED',
                'Email delivery is not configured on this server. Contact the system administrator.',
                503,
            )
        return error('EMAIL_DELIVERY_FAILED', 'Unable to send OTP. Please try again later.', 503)

    logger.info('Admin OTP sent: user_id=%s', user.id)
    return ok({'message': 'If this administrator account exists, an OTP has been sent.'})


@auth_bp.route('/api/auth/admin/otp/verify', methods=['POST'])
def admin_otp_verify():
    """
    Verify admin OTP for password-reset identity confirmation.
    Returns a short-lived reset_token for use in the password reset step.

    Body: { "email": "...", "otp": "123456" }
    """
    data = request.get_json(silent=True) or {}
    email_raw = data.get('email', '').strip()
    otp_plaintext = data.get('otp', '').strip()

    if not email_raw or not otp_plaintext:
        return validation_error('Missing required fields: email, otp')

    normalized = normalize_email(email_raw)
    purpose = 'password_reset_admin'

    try:
        session_user_id = verify_otp(current_app.config, normalized, purpose, otp_plaintext)
    except OtpError as exc:
        return error(exc.code, str(exc), exc.http_status)

    user = Admin.query.filter_by(email=normalized).first()
    if user is None:
        if session_user_id:
            from extensions import db as _db
            user = _db.session.get(Admin, session_user_id)
    if user is None:
        return error('USER_NOT_FOUND', 'Account not found.', 404)

    reset_token = generate_reset_token(
        user_id=user.id,
        role='admin',
        secret=current_app.config['JWT_SECRET_KEY'],
        expiry_minutes=current_app.config.get('PASSWORD_RESET_EXPIRY_MINUTES', 15),
    )

    logger.info('Admin OTP verified for password reset: user_id=%s', user.id)
    return ok({'message': 'Identity verified. You may now reset your password.', 'reset_token': reset_token})


# ── Doctor forgot password (OTP-based) ───────────────────────────────────────

@auth_bp.route('/api/auth/forgot-password/request', methods=['POST'])
def forgot_password_request():
    """
    Doctor: request a password reset OTP.

    Body: { "contact": "email_or_phone" }

    Returns a generic response to prevent account enumeration.
    """
    data = request.get_json(silent=True) or {}
    contact_raw = data.get('contact', '').strip()
    if not contact_raw:
        return validation_error('Missing required field: contact')

    if '@' in contact_raw:
        normalized = normalize_email(contact_raw)
        user = Doctor.query.filter_by(email=normalized).first()
    else:
        normalized = normalize_phone(contact_raw) or contact_raw
        user = Doctor.query.filter_by(phone=normalized).first() if normalize_phone(contact_raw) else None

    purpose = 'password_reset_doctor'

    try:
        otp_plaintext = request_otp(current_app.config, normalized, purpose)
    except OtpError as exc:
        return error(exc.code, str(exc), exc.http_status)

    if user is None or not getattr(user, 'is_active', True):
        cancel_pending_otp(normalized, purpose)
        logger.info('Doctor FP OTP for non-existent/inactive account: identifier=%s', _redact(normalized))
        return ok({'message': 'If an account with this contact exists, a reset code has been sent.'})

    _bind_otp_to_user(normalized, purpose, user.id)

    try:
        send_otp_email(user.email, otp_plaintext, 'doctor')
    except RuntimeError as exc:
        cancel_pending_otp(normalized, purpose)
        exc_code = str(exc)
        if exc_code == 'EMAIL_NOT_CONFIGURED':
            return error(
                'EMAIL_DELIVERY_NOT_CONFIGURED',
                'Email delivery is not configured on this server. Contact the system administrator.',
                503,
            )
        return error('EMAIL_DELIVERY_FAILED', 'Unable to send reset code. Please try again later.', 503)

    logger.info('Doctor FP OTP sent: user_id=%s purpose=%s', user.id, purpose)
    return ok({'message': 'If an account with this contact exists, a reset code has been sent.'})


@auth_bp.route('/api/auth/forgot-password/verify', methods=['POST'])
def forgot_password_verify():
    """
    Doctor: verify password reset OTP and receive a reset_token.

    Body: { "contact": "email_or_phone", "otp": "123456" }

    Returns: { "reset_token": "..." } — short-lived JWT for use in /api/auth/password-reset.
    """
    data = request.get_json(silent=True) or {}
    contact_raw = data.get('contact', '').strip()
    otp_plaintext = data.get('otp', '').strip()

    if not contact_raw or not otp_plaintext:
        return validation_error('Missing required fields: contact, otp')

    if '@' in contact_raw:
        normalized = normalize_email(contact_raw)
    else:
        normalized = normalize_phone(contact_raw) or contact_raw

    purpose = 'password_reset_doctor'

    try:
        session_user_id = verify_otp(current_app.config, normalized, purpose, otp_plaintext)
    except OtpError as exc:
        return error(exc.code, str(exc), exc.http_status)

    if '@' in contact_raw:
        user = Doctor.query.filter_by(email=normalized).first()
    else:
        user = Doctor.query.filter_by(phone=normalized).first() if normalize_phone(contact_raw) else None

    if user is None and session_user_id:
        from extensions import db as _db
        user = _db.session.get(Doctor, session_user_id)
    if user is None:
        return error('USER_NOT_FOUND', 'Account not found.', 404)

    reset_token = generate_reset_token(
        user_id=user.id,
        role='doctor',
        secret=current_app.config['JWT_SECRET_KEY'],
        expiry_minutes=current_app.config.get('PASSWORD_RESET_EXPIRY_MINUTES', 15),
    )

    logger.info('Doctor FP OTP verified: user_id=%s', user.id)
    return ok({'message': 'Identity verified. You may now reset your password.', 'reset_token': reset_token})


# ── Password reset ────────────────────────────────────────────────────────────

@auth_bp.route('/api/auth/password-reset', methods=['POST'])
def password_reset():
    """
    Doctor: apply new password using a valid reset_token.

    Body: { "reset_token": "...", "new_password": "..." }
    """
    from extensions import db

    data = request.get_json(silent=True) or {}
    reset_token = data.get('reset_token', '').strip()
    new_password = data.get('new_password', '')

    if not reset_token or not new_password:
        return validation_error('Missing required fields: reset_token, new_password')

    try:
        user_id, role = verify_reset_token(reset_token, current_app.config['JWT_SECRET_KEY'])
    except ResetTokenError as exc:
        return error(exc.code, str(exc), 401)

    if role != 'doctor':
        return error('RESET_TOKEN_INVALID', 'Invalid password reset token.', 401)

    pw_err = validate_password_strength(new_password, current_app.config.get('PASSWORD_MIN_LENGTH', 8))
    if pw_err:
        return validation_error(pw_err)

    user = db.session.get(Doctor, user_id)
    if user is None or not getattr(user, 'is_active', True):
        return error('USER_NOT_FOUND', 'Account not found or disabled.', 404)

    user.password_hash = hash_password(new_password)
    db.session.commit()

    logger.info('Doctor password reset: user_id=%s', user_id)
    return ok({'message': 'Password updated successfully. You can now sign in.'})


@auth_bp.route('/api/auth/admin/password-reset', methods=['POST'])
def admin_password_reset():
    """
    Admin: apply new password using a valid reset_token.

    Body: { "reset_token": "...", "new_password": "..." }
    """
    from extensions import db

    data = request.get_json(silent=True) or {}
    reset_token = data.get('reset_token', '').strip()
    new_password = data.get('new_password', '')

    if not reset_token or not new_password:
        return validation_error('Missing required fields: reset_token, new_password')

    try:
        user_id, role = verify_reset_token(reset_token, current_app.config['JWT_SECRET_KEY'])
    except ResetTokenError as exc:
        return error(exc.code, str(exc), 401)

    if role != 'admin':
        return error('RESET_TOKEN_INVALID', 'Invalid password reset token.', 401)

    pw_err = validate_password_strength(new_password, current_app.config.get('PASSWORD_MIN_LENGTH', 8))
    if pw_err:
        return validation_error(pw_err)

    user = db.session.get(Admin, user_id)
    if user is None or not getattr(user, 'is_active', True):
        return error('USER_NOT_FOUND', 'Account not found or disabled.', 404)

    user.password_hash = hash_password(new_password)
    db.session.commit()

    logger.info('Admin password reset: user_id=%s', user_id)
    return ok({'message': 'Password updated successfully. You can now sign in.'})


# ── Prototype demo authentication ────────────────────────────────────────────

@auth_bp.route('/api/config/public', methods=['GET'])
def public_config():
    """
    Return non-secret feature flags for the frontend.
    Safe to expose — no credentials or secrets included.
    """
    return ok({'demo_auth_enabled': bool(current_app.config.get('DEMO_AUTH_ENABLED'))})


@auth_bp.route('/api/auth/demo/login', methods=['POST'])
def demo_login():
    """
    Issue a JWT for a pre-seeded demo account (SIH prototype mode only).

    Requires DEMO_AUTH_ENABLED=true in backend config.
    Body: { "role": "doctor" | "admin" }

    Security:
      - Only issues tokens when DEMO_AUTH_ENABLED is explicitly true.
      - Role is validated from demo account in DB — never from request.
      - Uses the same generate_token() as real login.
      - Demo accounts cannot access this endpoint with real credentials.
    """
    if not current_app.config.get('DEMO_AUTH_ENABLED'):
        return error('DEMO_AUTH_DISABLED', 'Demo authentication is not enabled.', 403)

    data = request.get_json(silent=True) or {}
    role = (data.get('role') or '').strip().lower()

    if role not in ('doctor', 'admin'):
        return validation_error("Field 'role' must be 'doctor' or 'admin'")

    from extensions import db as _db

    if role == 'doctor':
        user = _db.session.get(__import__('models.doctor', fromlist=['Doctor']).Doctor, 'doc-demo-001')
        db_role = 'doctor'
    else:
        user = _db.session.get(__import__('models.admin', fromlist=['Admin']).Admin, 'admin-demo-001')
        db_role = 'admin'

    if user is None:
        logger.error('Demo %s account not found in DB — DEMO_AUTH_ENABLED=true but seeding failed', role)
        return error('DEMO_ACCOUNT_MISSING',
                     'Demo account not available. Contact the system administrator.', 503)

    if not getattr(user, 'is_active', True):
        return error('ACCOUNT_DISABLED', 'This demo account has been disabled.', 403)

    # Verify role from DB record (not from request)
    db_role = user.to_dict().get('role', db_role)

    token = generate_token(
        user_id=user.id,
        role=db_role,
        secret=current_app.config['JWT_SECRET_KEY'],
        expiry_hours=current_app.config.get('JWT_EXPIRY_HOURS', 8),
    )

    logger.info('Demo login: role=%s user_id=%s', db_role, user.id)
    return ok({'token': token, 'user': user.to_dict()})


# ── Legacy stub routes ────────────────────────────────────────────────────────

@auth_bp.route('/api/auth/otp/send', methods=['POST'])
def otp_send_legacy():
    """Deprecated — use POST /api/auth/otp/request instead."""
    return jsonify({'success': False, 'error': {
        'code': 'ENDPOINT_MOVED',
        'message': 'Use POST /api/auth/otp/request',
    }}), 410


# ── Private helpers ───────────────────────────────────────────────────────────

def _find_user(contact: str, role: str):
    """
    Look up a Doctor or Admin by normalized email or phone.
    Returns None if not found.
    contact must already be normalized by the caller.
    Does NOT check is_active — callers must check this after lookup.
    """
    if role == 'doctor':
        norm_phone = normalize_phone(contact)
        if norm_phone:
            return Doctor.query.filter(
                (Doctor.email == contact) | (Doctor.phone == norm_phone)
            ).first()
        return Doctor.query.filter_by(email=contact).first()

    return Admin.query.filter_by(email=contact).first()


def _bind_otp_to_user(identifier: str, purpose: str, user_id: str) -> None:
    """Update the most-recent unconsumed OTP session with the account's user_id."""
    from extensions import db
    from models.audit import OTPSession

    session = (
        OTPSession.query
        .filter_by(contact=identifier, purpose=purpose)
        .filter(OTPSession.consumed_at.is_(None))
        .order_by(OTPSession.created_at.desc())
        .first()
    )
    if session is not None and session.user_id is None:
        session.user_id = user_id
        db.session.commit()


def _update_last_login(user) -> None:
    """Update last_login_at timestamp. Silently skips if column absent."""
    from extensions import db
    if hasattr(user, 'last_login_at'):
        user.last_login_at = datetime.now(timezone.utc)
        db.session.commit()


def _redact(identifier: str) -> str:
    """Return a redacted version safe for logging (e.g. 'p***y@m***.in')."""
    if '@' in identifier:
        local, domain = identifier.split('@', 1)
        return f'{local[0]}***{local[-1] if len(local) > 1 else ""}@{domain[:3]}***.{domain.rsplit(".", 1)[-1]}'
    if len(identifier) >= 4:
        return f'{identifier[:2]}***{identifier[-2:]}'
    return '***'
