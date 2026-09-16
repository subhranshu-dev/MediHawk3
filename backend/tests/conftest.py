"""
Pytest configuration and shared fixtures.
All tests use an in-memory SQLite DB — never touches the real database file.
"""
import pytest

from app import create_app
from extensions import db as _db


@pytest.fixture(scope='function')
def app():
    """Create a test Flask application with in-memory SQLite."""
    _app = create_app('testing')
    with _app.app_context():
        # Import models so create_all knows about them
        import models  # noqa: F401
        _db.create_all()
        yield _app
        _db.session.remove()
        _db.drop_all()


@pytest.fixture
def client(app):
    """Flask test client."""
    return app.test_client()


@pytest.fixture
def seeded_app(app):
    """App with seed data applied (development users + locations + drones)."""
    from seed import run_seed
    run_seed()  # already inside app context from the app fixture
    return app


@pytest.fixture
def auth_headers_admin(seeded_app, client):
    """Return Authorization headers for the seeded admin user."""
    resp = client.post('/api/login', json={
        'email': 'arjun.patel@medihawk.in',
        'password': 'MediHawk@Admin2026',
        'role': 'admin',
    })
    assert resp.status_code == 200, f'Admin login failed: {resp.get_json()}'
    token = resp.get_json()['token']
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture
def auth_headers_doctor(seeded_app, client):
    """Return Authorization headers for the seeded doctor user."""
    resp = client.post('/api/login', json={
        'email': 'priya.mohanty@medihawk.in',
        'password': 'MediHawk@Doctor2026',
        'role': 'doctor',
    })
    assert resp.status_code == 200, f'Doctor login failed: {resp.get_json()}'
    token = resp.get_json()['token']
    return {'Authorization': f'Bearer {token}'}
