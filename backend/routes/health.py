"""
Health check endpoint.
GET /api/health — returns service status, mode, and database connectivity.
Does NOT expose configuration values or secrets.
"""
import logging

from flask import Blueprint, current_app, jsonify  # type: ignore[import-not-found]
from extensions import db

health_bp = Blueprint('health', __name__)
logger = logging.getLogger(__name__)


@health_bp.route('/', methods=['GET'])
def root():
    """Minimal root endpoint so GET / returns 200 instead of 404."""
    mode = current_app.config.get('APP_MODE', 'simulation')
    return jsonify({
        'success': True,
        'service': 'MediHawk Backend',
        'status': 'running',
        'mode': mode,
        'health': '/api/health',
    }), 200


@health_bp.route('/api/health', methods=['GET'])
def health_check():
    """
    Returns backend health status.
    Reports database connectivity honestly — never pretends to be healthy.
    """
    db_status = _check_database()
    mode = current_app.config.get('APP_MODE', 'simulation')
    overall = 'healthy' if db_status == 'connected' else 'degraded'

    return jsonify({
        'success': True,
        'service': 'MediHawk Backend',
        'status': overall,
        'mode': mode,
        'database': db_status,
        'version': '1.0.0-demo-seed',
    }), 200 if overall == 'healthy' else 503


def _check_database() -> str:
    """Return 'connected' or 'disconnected' based on a lightweight DB ping."""
    try:
        db.session.connection().exec_driver_sql('SELECT 1')
        return 'connected'
    except Exception as exc:
        logger.error('Database health check failed: %s', exc)
        return 'disconnected'
