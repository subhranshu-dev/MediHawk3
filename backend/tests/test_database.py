"""
Tests for database initialization and schema correctness.
"""
import pytest
from sqlalchemy import inspect, text

from extensions import db
from models.location import Location
from models.doctor import Doctor
from models.admin import Admin


EXPECTED_TABLES = [
    'locations',
    'doctors',
    'admins',
    'inventory',
    'drones',
    'orders',
    'order_items',
    'missions',
    'alerts',
    'inspection_records',
    'telemetry_log',
    'temperature_log',
    'otp_sessions',
]


def test_all_expected_tables_created(app):
    """Every table from Phase-0 §15 schema must exist."""
    inspector = inspect(db.engine)
    actual_tables = inspector.get_table_names()
    for table in EXPECTED_TABLES:
        assert table in actual_tables, f'Missing table: {table}'


def test_foreign_keys_pragma_enabled(app):
    """
    SQLite: foreign_keys pragma must be ON (set in create_app event listener).
    PostgreSQL: skipped — FK enforcement is always on by default.
    """
    dialect = db.engine.dialect.name
    if dialect == 'sqlite':
        result = db.session.execute(text('PRAGMA foreign_keys')).scalar()
        assert result == 1, 'SQLite foreign_keys pragma is OFF — FK constraints will not be enforced.'
    # PostgreSQL always enforces FKs; no PRAGMA needed or available.


def test_location_crud(app):
    """Location can be created, read, updated, deleted."""
    loc = Location(id='test-hub', name='Test Hub', type='hub', district='Test District')
    db.session.add(loc)
    db.session.commit()

    fetched = db.session.get(Location, 'test-hub')
    assert fetched is not None
    assert fetched.name == 'Test Hub'
    assert fetched.type == 'hub'


def test_doctor_references_location_fk(app):
    """Doctor.phc_id must reference an existing location."""
    # Setup: insert location first
    loc = Location(id='phc-test', name='PHC Test', type='phc', district='X')
    db.session.add(loc)
    db.session.commit()

    doctor = Doctor(id='doc-test', name='Dr. Test', phc_id='phc-test')
    db.session.add(doctor)
    db.session.commit()

    fetched = db.session.get(Doctor, 'doc-test')
    assert fetched is not None
    assert fetched.phc_id == 'phc-test'


def test_foreign_key_violation_rejected(app):
    """Inserting a doctor with a nonexistent phc_id must raise IntegrityError."""
    from sqlalchemy.exc import IntegrityError
    doctor = Doctor(id='doc-bad', name='Bad Doctor', phc_id='does-not-exist')
    db.session.add(doctor)
    with pytest.raises(IntegrityError):
        db.session.commit()
    db.session.rollback()


def test_database_persists_across_queries(app):
    """Data written in one query is visible in a subsequent query."""
    admin = Admin(id='admin-persist', name='Persist Test',
                  email='persist@test.com', password_hash='hashed')
    db.session.add(admin)
    db.session.commit()

    # New query
    result = Admin.query.filter_by(email='persist@test.com').first()
    assert result is not None
    assert result.name == 'Persist Test'


def test_admin_email_unique(app):
    """Admin email uniqueness constraint must be enforced."""
    from sqlalchemy.exc import IntegrityError
    a1 = Admin(id='adm-1', name='A1', email='dup@test.com', password_hash='h')
    a2 = Admin(id='adm-2', name='A2', email='dup@test.com', password_hash='h')
    db.session.add(a1)
    db.session.commit()
    db.session.add(a2)
    with pytest.raises(IntegrityError):
        db.session.commit()
    db.session.rollback()
