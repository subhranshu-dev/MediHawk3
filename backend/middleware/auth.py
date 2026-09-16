"""
Authentication middleware.
Provides require_auth and require_role decorators for protecting routes.
Role is validated from the JWT payload — never trusted from the request body.
"""
from __future__ import annotations

from functools import wraps
from typing import Callable

import jwt as pyjwt
from flask import current_app, g, jsonify, request

from services.auth_service import decode_token


def _unauthorized(code: str, message: str):
    return jsonify({'success': False, 'error': {'code': code, 'message': message}}), 401


def _forbidden(message: str):
    return jsonify({'success': False, 'error': {'code': 'FORBIDDEN', 'message': message}}), 403


def require_auth(f: Callable) -> Callable:
    """Decorator: verifies Bearer JWT. Sets g.user_id and g.user_role on success."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return _unauthorized('AUTH_REQUIRED', 'Authentication required. Provide Bearer token.')
        token = auth_header[7:].strip()
        if not token:
            return _unauthorized('AUTH_REQUIRED', 'Bearer token is empty.')
        try:
            payload = decode_token(token, current_app.config['JWT_SECRET_KEY'])
            g.user_id = payload['sub']
            g.user_role = payload['role']
        except pyjwt.ExpiredSignatureError:
            return _unauthorized('TOKEN_EXPIRED', 'Token has expired. Please log in again.')
        except pyjwt.InvalidTokenError:
            return _unauthorized('TOKEN_INVALID', 'Invalid token.')
        return f(*args, **kwargs)
    return decorated


def require_role(role: str) -> Callable:
    """Decorator: requires specific role (applied after require_auth)."""
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        @require_auth
        def decorated(*args, **kwargs):
            if g.user_role != role:
                return _forbidden(f'Role {role!r} required. Your role: {g.user_role!r}.')
            return f(*args, **kwargs)
        return decorated
    return decorator


# Convenience aliases
require_admin = require_role('admin')
require_doctor = require_role('doctor')
