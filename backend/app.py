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


def _db_label(uri: str) -> str:
    """Return a safe log label for a database URI — never exposes credentials."""
    if uri.startswith('postgresql'):
        return 'postgresql'
    if uri.startswith('sqlite'):
        # Log only the filename, not the full path (which may contain user dirs)
        import re
        m = re.search(r'sqlite:///(.+)', uri)
        if m:
            return 'sqlite:' + os.path.basename(m.group(1))
        return 'sqlite'
    return uri.split('://')[0] if '://' in uri else 'unknown'


_CANONICAL_LOCATIONS = [
    {
        'id': 'hub-01',
        'name': 'MediHawk Central Hub',
        'type': 'hub',
        'district': 'Bhubaneswar',
        'lat': 20.2961,
        'lng': 85.8189,
        'contact': '+91-674-2300000',
        'address': 'Rasulgarh, Bhubaneswar, Odisha 751010',
    },
    {
        'id': 'phc-chandaka',
        'name': 'PHC Chandaka',
        'type': 'phc',
        'district': 'Khordha',
        'lat': 20.3512,
        'lng': 85.7612,
        'contact': '+91-674-2300001',
        'address': 'Chandaka, Bhubaneswar, Odisha 751024',
    },
    {
        'id': 'phc-jatani',
        'name': 'PHC Jatani',
        'type': 'phc',
        'district': 'Khordha',
        'lat': 20.1682,
        'lng': 85.8141,
        'contact': '+91-674-2300002',
        'address': 'Jatani, Odisha 752050',
    },
    {
        'id': 'chc-bhubaneswar',
        'name': 'CHC Bhubaneswar South',
        'type': 'chc',
        'district': 'Khordha',
        'lat': 20.2513,
        'lng': 85.8388,
        'contact': '+91-674-2300003',
        'address': 'Bhubaneswar South, Odisha 751001',
    },
]


def _init_locations(db) -> None:
    """
    Ensure the canonical Odisha facility locations exist in the database.
    Idempotent: only inserts rows not already present.
    Locations are required infrastructure — invitations and doctor registration
    fail without them.  No credentials or user data are inserted.
    """
    from models.location import Location

    inserted = 0
    for loc_data in _CANONICAL_LOCATIONS:
        if db.session.get(Location, loc_data['id']) is None:
            db.session.add(Location(**loc_data))
            inserted += 1
    if inserted:
        db.session.commit()
        logger.info('Canonical locations seeded: %d inserted', inserted)


def _init_inventory(db) -> None:
    """
    Ensure the canonical medicine catalog exists in the database.
    Idempotent: only inserts rows not already present; existing records are
    never modified or deleted.  No credentials or user data are inserted.
    The catalog is required infrastructure — DoctorOrder page shows nothing
    without inventory rows.
    """
    from models.inventory import InventoryItem
    from seed import _INVENTORY

    inserted = 0
    for item_data in _INVENTORY:
        if db.session.get(InventoryItem, item_data['id']) is None:
            db.session.add(InventoryItem(**item_data))
            inserted += 1
    if inserted:
        db.session.commit()
        logger.info('Canonical inventory seeded: %d items inserted', inserted)


def _validate_production_secrets(app: Flask) -> None:
    """Raise RuntimeError if any required production secret is missing."""
    missing = []
    if not os.environ.get('SECRET_KEY'):
        missing.append('SECRET_KEY')
    if not os.environ.get('JWT_SECRET_KEY'):
        missing.append('JWT_SECRET_KEY')
    if not os.environ.get('OTP_HMAC_SECRET'):
        missing.append('OTP_HMAC_SECRET')
    if missing:
        raise RuntimeError(
            f'Production requires these environment variables to be set: {", ".join(missing)}'
        )


def create_app(env: str | None = None) -> Flask:
    """
    Application factory.
    :param env: 'development' | 'testing' | 'production'. Defaults to FLASK_ENV.
    """
    resolved_env = env or os.environ.get('FLASK_ENV', 'development')
    app = Flask(__name__, instance_relative_config=True)

    # ── Configuration ─────────────────────────────────────────────────────────
    cfg_class = get_config(env)
    app.config.from_object(cfg_class)

    # Apply engine options from the config class (pool settings for PostgreSQL)
    engine_opts = cfg_class.get_engine_options()
    if engine_opts:
        app.config['SQLALCHEMY_ENGINE_OPTIONS'] = engine_opts

    # ── Instance folder (holds SQLite DB file in non-test envs) ───────────────
    os.makedirs(app.instance_path, exist_ok=True)

    # ── Logging ───────────────────────────────────────────────────────────────
    configure_logging(app)

    # ── Production validation ─────────────────────────────────────────────────
    if resolved_env == 'production':
        db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
        if not db_uri or not db_uri.startswith('postgresql'):
            raise RuntimeError(
                'DATABASE_URL must be set to a PostgreSQL URL in production. '
                'Render provides this automatically. '
                'SQLite is not permitted in production.'
            )
        _validate_production_secrets(app)

    # ── Extensions ────────────────────────────────────────────────────────────
    db.init_app(app)
    cors.init_app(
        app,
        resources={r'/api/*': {'origins': app.config['CORS_ORIGINS']}},
        supports_credentials=True,
    )

    # ── SQLite: enforce foreign keys on every new connection ──────────────────
    # PostgreSQL enforces foreign keys natively; this PRAGMA is SQLite-only.
    # The isinstance check ensures we never execute SQLite PRAGMAs against
    # a PostgreSQL connection.
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
        # Log dialect only — never log the full URI (may contain credentials)
        db_label = _db_label(app.config.get('SQLALCHEMY_DATABASE_URI', ''))
        logger.info('MediHawk Backend starting | env=%s | mode=%s | db=%s',
                    resolved_env, mode, db_label)

        # ── Schema init + migrations (non-testing envs only) ─────────────────
        # On a fresh database (e.g. new Render PostgreSQL): create_all() builds
        # every table from the current SQLAlchemy models.
        # On an existing database: create_all() is a no-op for tables that
        # already exist — data is preserved.
        # _apply_migrations() then adds any columns that were introduced after
        # the initial schema (Phase 1B–1G incremental migrations).
        # Both steps are idempotent and safe to repeat on every deployment.
        if not app.config.get('TESTING'):
            import models  # noqa: F401 — register all models before create_all
            db.create_all()
            logger.info('Database schema created/verified | db=%s', db_label)
            try:
                from database import _apply_migrations
                _apply_migrations(db)
            except Exception as _mig_exc:
                logger.error('Schema migration failed: %s', _mig_exc)
                raise  # do not silently start with a broken schema
            _init_locations(db)
            _init_inventory(db)

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

    from routes.admin import admin_bp
    app.register_blueprint(admin_bp)

    from routes.verification import verification_bp
    app.register_blueprint(verification_bp)
