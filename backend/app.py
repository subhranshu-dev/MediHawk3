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

            if app.config.get('DEMO_AUTH_ENABLED'):
                _seed_demo_accounts(app)

        if mode == 'live':
            logger.warning(
                'APP_MODE=live. Real drone commands are ENABLED. '
                'Ensure Pixhawk/MAVProxy chain is ready before issuing any command.'
            )

    return app


def _seed_demo_accounts(app: Flask) -> None:
    """
    Seed demo data for SIH prototype mode (DEMO_AUTH_ENABLED=true).
    Idempotent — skips creation if records already exist.

    Seeds: demo hub + PHC locations, inventory items, a drone, demo doctor +
    admin accounts. The demo doctor is linked to the demo PHC so order creation
    succeeds end-to-end.
    """
    from extensions import db as _db
    from models.doctor import Doctor
    from models.admin import Admin
    from models.location import Location
    from models.inventory import InventoryItem
    from models.drone import Drone
    from services.auth_service import hash_password

    DEMO_PW = 'DEMO-INTERNAL-NOT-A-REAL-PASSWORD-DO-NOT-USE'

    # Called from within create_app's `with app.app_context()` — no nested context needed.
    # ── Hub location ──────────────────────────────────────────────────────
    if not _db.session.get(Location, 'hub-demo-01'):
        _db.session.add(Location(
            id='hub-demo-01',
            name='MediHawk Demo Hub — Bhubaneswar',
            type='hub',
            district='Khordha',
            lat=20.2961,
            lng=85.8245,
            contact='1800-MH-DEMO',
            address='Janpath, Bhubaneswar, Odisha — Demo Hub',
            is_active=True,
        ))
        logger.info('Demo hub location seeded')

    # ── PHC location ──────────────────────────────────────────────────────
    if not _db.session.get(Location, 'phc-demo-01'):
        _db.session.add(Location(
            id='phc-demo-01',
            name='Demo PHC — Chandaka',
            type='phc',
            district='Khordha',
            lat=20.3559,
            lng=85.7712,
            contact='0674-DEMO-PHC',
            address='Chandaka Industrial Area, Bhubaneswar, Odisha — Demo PHC',
            is_active=True,
        ))
        logger.info('Demo PHC location seeded')

    _db.session.flush()  # ensure locations exist before FK references below

    # ── Inventory items ───────────────────────────────────────────────────
    demo_items = [
        dict(id='inv-demo-001', medicine='Paracetamol 500mg', quantity=200,
             unit='tablets', temperature_required='<25°C', status='in_stock',
             category='Analgesics', min_threshold=20,
             expiry_date='2027-12-31'),
        dict(id='inv-demo-002', medicine='ORS Sachets', quantity=150,
             unit='sachets', temperature_required='<30°C', status='in_stock',
             category='Electrolytes', min_threshold=15,
             expiry_date='2027-06-30'),
        dict(id='inv-demo-003', medicine='Amoxicillin 250mg', quantity=100,
             unit='capsules', temperature_required='<25°C', status='in_stock',
             category='Antibiotics', min_threshold=10,
             expiry_date='2027-09-30'),
        dict(id='inv-demo-004', medicine='Insulin (Regular) 10ml', quantity=30,
             unit='vials', temperature_required='2-8°C', status='in_stock',
             category='Hormones', min_threshold=5,
             expiry_date='2027-03-31'),
        dict(id='inv-demo-005', medicine='Anti-Rabies Vaccine 1ml', quantity=20,
             unit='doses', temperature_required='2-8°C', status='in_stock',
             category='Vaccines', min_threshold=3,
             expiry_date='2027-01-31'),
    ]
    for item_data in demo_items:
        if not _db.session.get(InventoryItem, item_data['id']):
            _db.session.add(InventoryItem(**item_data))
    logger.info('Demo inventory items seeded (idempotent)')

    # ── Drone ─────────────────────────────────────────────────────────────
    if not _db.session.get(Drone, 'MH-D01'):
        _db.session.add(Drone(
            id='MH-D01',
            name='Hawk Alpha',
            status='available',
            lat=20.2961,
            lng=85.8245,
            altitude=0.0,
            speed=0.0,
            battery=100.0,
            temperature=5.8,
            gps_accuracy=1.5,
            connection='stable',
            link_type='4G',
            health_motors='ok',
            health_sensors='ok',
            health_propellers='ok',
            health_payload_lock='ok',
            total_missions=0,
            flight_hours=0.0,
        ))
        logger.info('Demo drone MH-D01 seeded')

    # ── Demo doctor account ───────────────────────────────────────────────
    existing_doc = _db.session.get(Doctor, 'doc-demo-001')
    if not existing_doc:
        _db.session.add(Doctor(
            id='doc-demo-001',
            name='Demo Doctor',
            email='demo.doctor@medihawk.local',
            phone='0000000001',
            password_hash=hash_password(DEMO_PW),
            email_verified=True,
            verification_status='verified',
            is_active=True,
            phc_id='phc-demo-01',
        ))
        logger.info('Demo doctor account seeded')
    else:
        # Ensure existing demo doctor has the demo PHC assigned
        if existing_doc.phc_id is None:
            existing_doc.phc_id = 'phc-demo-01'
            logger.info('Demo doctor phc_id back-filled to phc-demo-01')

    # ── Demo admin account ────────────────────────────────────────────────
    if not _db.session.get(Admin, 'admin-demo-001'):
        _db.session.add(Admin(
            id='admin-demo-001',
            name='Demo Admin',
            email='demo.admin@medihawk.local',
            password_hash=hash_password(DEMO_PW),
            is_active=True,
        ))
        logger.info('Demo admin account seeded')

    _db.session.commit()
    logger.info('Demo data seed complete')


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
