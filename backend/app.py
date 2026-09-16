"""
MediHawk Flask application factory.

Usage:
    from app import create_app
    app = create_app()          # uses FLASK_ENV env var
    app = create_app('testing') # explicit environment

Never import Flask extensions directly — use the instances in extensions.py.
"""
from __future__ import annotations

import logging
import os
import sqlite3

from flask import Flask
from sqlalchemy import event, text
from sqlalchemy.engine import Engine

from config import get_config
from extensions import cors, db
from middleware.errors import register_error_handlers
from utils.logging_config import configure_logging

logger = logging.getLogger(__name__)


def create_app(env: str | None = None) -> Flask:
    """
    Application factory.
    :param env: 'development' | 'testing' | 'production'. Defaults to FLASK_ENV.
    """
    app = Flask(__name__, instance_relative_config=True)

    # ── Configuration ─────────────────────────────────────────────────────────
    app.config.from_object(get_config(env))

    # ── Instance folder (holds SQLite DB file in non-test envs) ───────────────
    os.makedirs(app.instance_path, exist_ok=True)

    # ── Logging ───────────────────────────────────────────────────────────────
    configure_logging(app)

    # ── Extensions ────────────────────────────────────────────────────────────
    db.init_app(app)
    cors.init_app(
        app,
        resources={r'/api/*': {'origins': app.config['CORS_ORIGINS']}},
        supports_credentials=True,
    )

    # ── SQLite: enforce foreign keys on every new connection ──────────────────
    # SQLite does not enforce FKs by default. PRAGMA must be set per-connection.
    @event.listens_for(Engine, 'connect')
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        if isinstance(dbapi_connection, sqlite3.Connection):
            cursor = dbapi_connection.cursor()
            cursor.execute('PRAGMA foreign_keys=ON')
            cursor.close()

    # ── Blueprints ────────────────────────────────────────────────────────────
    _register_blueprints(app)

    # ── Email transport ───────────────────────────────────────────────────────
    from services.email_service import init_transport as _init_email
    _init_email(app)

    # ── Error handlers ────────────────────────────────────────────────────────
    register_error_handlers(app)

    # ── Startup log + auto-migration ─────────────────────────────────────────
    with app.app_context():
        mode = app.config.get('APP_MODE', 'simulation')
        db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
        logger.info('MediHawk Backend starting | mode=%s | db=%s', mode, db_uri)

        # Auto-apply schema migrations on every startup (idempotent — safe to run repeatedly).
        # This ensures columns added in later phases are always present without manual steps.
        if not app.config.get('TESTING'):
            try:
                from database import _apply_migrations
                _apply_migrations(db)
            except Exception as _mig_exc:
                logger.error('Auto-migration failed: %s', _mig_exc)

        if mode == 'live':
            logger.warning(
                'APP_MODE=live. Real drone commands are ENABLED. '
                'Ensure Pixhawk/MAVProxy chain is ready before issuing any command.'
            )

    return app


def _register_blueprints(app: Flask) -> None:
    from routes.health import health_bp
    from routes.auth import auth_bp
    from routes.location import location_bp
    from routes.order import order_bp
    from routes.inventory import inventory_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(location_bp)
    app.register_blueprint(order_bp)
    app.register_blueprint(inventory_bp)

    # Phase 1F+ blueprints registered here as phases are implemented:
    # from routes.orders import orders_bp; app.register_blueprint(orders_bp)
    # from routes.drones import drones_bp; app.register_blueprint(drones_bp)
    # from routes.inventory import inventory_bp; app.register_blueprint(inventory_bp)
    # from routes.locations import locations_bp; app.register_blueprint(locations_bp)
    # from routes.temperature import temperature_bp; app.register_blueprint(temperature_bp)
    # from routes.weather import weather_bp; app.register_blueprint(weather_bp)
    # from routes.analytics import analytics_bp; app.register_blueprint(analytics_bp)
