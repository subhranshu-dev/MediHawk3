"""
Database initialization script.

Run:
    python database.py          # create tables only
    python database.py --seed   # create tables + insert seed data

This script is IDEMPOTENT — safe to run multiple times.
It will NOT drop existing tables or data.
"""
from __future__ import annotations

import logging
import sys

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def init_db(seed: bool = False) -> None:
    """Initialize database schema. Optionally run seed data."""
    from app import create_app
    from extensions import db

    # Import all models so SQLAlchemy sees them before create_all()
    import models  # noqa: F401

    app = create_app()
    with app.app_context():
        db.create_all()
        _apply_migrations(db)
        logger.info('Database schema created/verified.')

        if seed:
            from seed import run_seed
            run_seed(app)
            logger.info('Seed data applied.')
        else:
            logger.info('Tip: run with --seed to insert development data.')


def _apply_migrations(db) -> None:
    """
    Apply incremental schema changes to existing databases without dropping data.
    Safe to call multiple times (checks before altering).
    """
    from sqlalchemy import inspect, text

    inspector = inspect(db.engine)
    tables = set(inspector.get_table_names())

    # Phase 1B: locations.is_active
    if 'locations' in tables:
        if 'is_active' not in {c['name'] for c in inspector.get_columns('locations')}:
            db.session.execute(
                text('ALTER TABLE locations ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1')
            )
            db.session.commit()
            logger.info('Migration applied: locations.is_active')

    # Phase 1C: inventory.is_active
    if 'inventory' in tables:
        if 'is_active' not in {c['name'] for c in inspector.get_columns('inventory')}:
            db.session.execute(
                text('ALTER TABLE inventory ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1')
            )
            db.session.commit()
            logger.info('Migration applied: inventory.is_active')

    # Phase 1C: orders snapshot columns
    if 'orders' in tables:
        order_cols = {c['name'] for c in inspector.get_columns('orders')}
        for col_def in [
            ('dest_lat', 'REAL'),
            ('dest_lng', 'REAL'),
            ('distance_km', 'REAL'),
        ]:
            col_name, col_type = col_def
            if col_name not in order_cols:
                db.session.execute(text(f'ALTER TABLE orders ADD COLUMN {col_name} {col_type}'))
                db.session.commit()
                logger.info('Migration applied: orders.%s', col_name)

    # Phase 1C: order_items audit columns
    if 'order_items' in tables:
        item_cols = {c['name'] for c in inspector.get_columns('order_items')}
        for col_def in [
            ('inventory_id', 'TEXT'),
            ('temperature_required', 'TEXT'),
        ]:
            col_name, col_type = col_def
            if col_name not in item_cols:
                db.session.execute(text(f'ALTER TABLE order_items ADD COLUMN {col_name} {col_type}'))
                db.session.commit()
                logger.info('Migration applied: order_items.%s', col_name)

    # Phase 1E: otp_sessions rate-limit + attempt columns
    if 'otp_sessions' in tables:
        otp_cols = {c['name'] for c in inspector.get_columns('otp_sessions')}
        for col_name, col_type, default in [
            ('attempts', 'INTEGER NOT NULL', 'DEFAULT 0'),
            ('consumed_at', 'DATETIME', ''),
            ('request_count', 'INTEGER NOT NULL', 'DEFAULT 1'),
            ('last_request_at', 'DATETIME', ''),
            ('user_id', 'TEXT', ''),
        ]:
            if col_name not in otp_cols:
                ddl = f'ALTER TABLE otp_sessions ADD COLUMN {col_name} {col_type} {default}'.strip()
                db.session.execute(text(ddl))
                db.session.commit()
                logger.info('Migration applied: otp_sessions.%s', col_name)

    # Phase 1E security: doctor/admin account status columns
    if 'doctors' in tables:
        doc_cols = {c['name'] for c in inspector.get_columns('doctors')}
        for col_name, col_type, default in [
            ('is_active', 'BOOLEAN NOT NULL', 'DEFAULT 1'),
            ('email_verified', 'BOOLEAN NOT NULL', 'DEFAULT 1'),
            ('updated_at', 'DATETIME', ''),
            ('last_login_at', 'DATETIME', ''),
        ]:
            if col_name not in doc_cols:
                ddl = f'ALTER TABLE doctors ADD COLUMN {col_name} {col_type} {default}'.strip()
                db.session.execute(text(ddl))
                db.session.commit()
                logger.info('Migration applied: doctors.%s', col_name)

    if 'admins' in tables:
        adm_cols = {c['name'] for c in inspector.get_columns('admins')}
        for col_name, col_type, default in [
            ('is_active', 'BOOLEAN NOT NULL', 'DEFAULT 1'),
            ('updated_at', 'DATETIME', ''),
            ('last_login_at', 'DATETIME', ''),
        ]:
            if col_name not in adm_cols:
                ddl = f'ALTER TABLE admins ADD COLUMN {col_name} {col_type} {default}'.strip()
                db.session.execute(text(ddl))
                db.session.commit()
                logger.info('Migration applied: admins.%s', col_name)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(levelname)s | %(message)s')
    _seed = '--seed' in sys.argv
    init_db(seed=_seed)
    print('Done.')
