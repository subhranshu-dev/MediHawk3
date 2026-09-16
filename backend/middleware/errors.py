"""
Centralized error handlers for the Flask application.
All error responses use the standard MediHawk JSON envelope:
  { "success": false, "error": { "code": "...", "message": "..." } }

Stack traces and internal details are NEVER exposed to clients.
"""
from __future__ import annotations

import logging

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

logger = logging.getLogger(__name__)


def register_error_handlers(app: Flask) -> None:
    """Register all error handlers on the Flask app."""

    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({'success': False, 'error': {'code': 'BAD_REQUEST', 'message': str(e)}}), 400

    @app.errorhandler(401)
    def unauthorized(e):
        return jsonify({'success': False, 'error': {'code': 'UNAUTHORIZED', 'message': 'Authentication required.'}}), 401

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({'success': False, 'error': {'code': 'FORBIDDEN', 'message': 'Insufficient permissions.'}}), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({'success': False, 'error': {'code': 'NOT_FOUND', 'message': 'Resource not found.'}}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({'success': False, 'error': {'code': 'METHOD_NOT_ALLOWED', 'message': 'Method not allowed.'}}), 405

    @app.errorhandler(409)
    def conflict(e):
        return jsonify({'success': False, 'error': {'code': 'CONFLICT', 'message': str(e)}}), 409

    @app.errorhandler(422)
    def unprocessable(e):
        return jsonify({'success': False, 'error': {'code': 'VALIDATION_ERROR', 'message': str(e)}}), 422

    @app.errorhandler(429)
    def too_many_requests(e):
        return jsonify({'success': False, 'error': {'code': 'RATE_LIMITED', 'message': 'Too many requests.'}}), 429

    @app.errorhandler(500)
    def internal_error(e):
        # Log with traceback for operators, return safe message to client
        logger.exception('Unhandled server error: %s', e)
        return jsonify({'success': False, 'error': {'code': 'INTERNAL_ERROR', 'message': 'Internal server error.'}}), 500

    @app.errorhandler(503)
    def service_unavailable(e):
        return jsonify({'success': False, 'error': {'code': 'SERVICE_UNAVAILABLE', 'message': str(e)}}), 503

    @app.errorhandler(Exception)
    def unhandled_exception(e):
        # Let Werkzeug HTTP exceptions pass through to their dedicated handlers above.
        if isinstance(e, HTTPException):
            return e
        logger.exception('Unhandled exception: %s', type(e).__name__)
        return jsonify({'success': False, 'error': {
            'code': 'INTERNAL_ERROR',
            'message': 'An unexpected error occurred.',
        }}), 500
