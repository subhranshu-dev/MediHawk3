"""
Helpers for building consistent JSON responses.
All API responses follow the MediHawk envelope:
  success: { "success": true, "data": {...} }
  error:   { "success": false, "error": { "code": "...", "message": "..." } }
"""
from flask import jsonify


def ok(data: dict | list | None = None, status: int = 200):
    """Return a successful JSON response."""
    body: dict = {'success': True}
    if data is not None:
        body.update(data) if isinstance(data, dict) else body.update({'data': data})
    return jsonify(body), status


def created(data: dict | None = None):
    return ok(data, 201)


def error(code: str, message: str, status: int = 400):
    """Return a standardized error JSON response."""
    return jsonify({'success': False, 'error': {'code': code, 'message': message}}), status


def validation_error(message: str, fields: list[str] | None = None):
    body: dict = {'success': False, 'error': {'code': 'VALIDATION_ERROR', 'message': message}}
    if fields:
        body['error']['fields'] = fields  # type: ignore[index]
    return jsonify(body), 422
