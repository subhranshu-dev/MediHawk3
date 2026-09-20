"""
Tests for POST /api/admin/orders/<order_id>/launch — mission creation + sim seeding.
"""
import pytest
from extensions import db
from models.order import Order
from models.mission import Mission
from models.drone import Drone
from models.location import Location


def _make_order(seeded_app) -> str:
    """Insert a pending order and return its ID."""
    with seeded_app.app_context():
        loc = Location.query.filter_by(id='phc-chandaka').first()
        order = Order(
            id='TEST-ORD-001',
            doctor_id='doc-001',
            status='pending',
            priority='normal',
            medicine='Paracetamol',
            quantity=10,
            destination_location='phc-chandaka',
            dest_lat=loc.lat if loc else 20.35,
            dest_lng=loc.lng if loc else 85.77,
        )
        db.session.add(order)
        db.session.commit()
    return 'TEST-ORD-001'


# ─── Happy-path ────────────────────────────────────────────────────────────────

def test_launch_creates_mission(seeded_app, client, auth_headers_admin):
    oid = _make_order(seeded_app)
    resp = client.post(f'/api/admin/orders/{oid}/launch', headers=auth_headers_admin)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['success'] is True
    assert 'mission' in body
    assert body['mission']['order_id'] == oid


def test_launch_mission_status_is_preparing(seeded_app, client, auth_headers_admin):
    oid = _make_order(seeded_app)
    resp = client.post(f'/api/admin/orders/{oid}/launch', headers=auth_headers_admin)
    assert resp.status_code == 200
    assert resp.get_json()['mission']['status'] == 'preparing'


def test_launch_assigns_available_drone(seeded_app, client, auth_headers_admin):
    oid = _make_order(seeded_app)
    resp = client.post(f'/api/admin/orders/{oid}/launch', headers=auth_headers_admin)
    assert resp.status_code == 200
    drone_id = resp.get_json()['mission']['drone_id']
    assert drone_id is not None
    with seeded_app.app_context():
        drone = db.session.get(Drone, drone_id)
        assert drone.status in ('preparing', 'in_flight')


def test_launch_order_becomes_approved(seeded_app, client, auth_headers_admin):
    oid = _make_order(seeded_app)
    client.post(f'/api/admin/orders/{oid}/launch', headers=auth_headers_admin)
    with seeded_app.app_context():
        order = db.session.get(Order, oid)
        assert order.status == 'approved'


def test_launch_has_coordinates(seeded_app, client, auth_headers_admin):
    oid = _make_order(seeded_app)
    resp = client.post(f'/api/admin/orders/{oid}/launch', headers=auth_headers_admin)
    m = resp.get_json()['mission']
    assert m['from_lat'] == pytest.approx(20.2961, abs=0.01)
    assert m['from_lng'] == pytest.approx(85.8189, abs=0.01)
    assert m['to_lat'] is not None
    assert m['to_lng'] is not None


def test_launch_seeds_telemetry(seeded_app, client, auth_headers_admin):
    from models.audit import TelemetryLog
    oid = _make_order(seeded_app)
    resp = client.post(f'/api/admin/orders/{oid}/launch', headers=auth_headers_admin)
    mission_id = resp.get_json()['mission']['id']
    with seeded_app.app_context():
        logs = TelemetryLog.query.filter_by(mission_id=mission_id).all()
        assert len(logs) >= 1


def test_launch_distance_km_positive(seeded_app, client, auth_headers_admin):
    oid = _make_order(seeded_app)
    resp = client.post(f'/api/admin/orders/{oid}/launch', headers=auth_headers_admin)
    assert resp.get_json()['mission']['distance_km'] > 0


def test_launch_eta_minutes_minimum_five(seeded_app, client, auth_headers_admin):
    oid = _make_order(seeded_app)
    resp = client.post(f'/api/admin/orders/{oid}/launch', headers=auth_headers_admin)
    assert resp.get_json()['mission']['eta_minutes'] >= 5


# ─── Error cases ───────────────────────────────────────────────────────────────

def test_launch_404_unknown_order(seeded_app, client, auth_headers_admin):
    resp = client.post('/api/admin/orders/NONEXISTENT/launch', headers=auth_headers_admin)
    assert resp.status_code == 404
    assert resp.get_json()['error']['code'] == 'ORDER_NOT_FOUND'


def test_launch_409_already_active(seeded_app, client, auth_headers_admin):
    oid = _make_order(seeded_app)
    client.post(f'/api/admin/orders/{oid}/launch', headers=auth_headers_admin)
    resp = client.post(f'/api/admin/orders/{oid}/launch', headers=auth_headers_admin)
    assert resp.status_code == 409
    assert resp.get_json()['error']['code'] == 'MISSION_ALREADY_ACTIVE'


def test_launch_409_invalid_status(seeded_app, client, auth_headers_admin):
    with seeded_app.app_context():
        loc = Location.query.filter_by(id='phc-chandaka').first()
        order = Order(
            id='TEST-ORD-002',
            doctor_id='doc-001',
            status='delivered',
            priority='normal',
            medicine='Amoxicillin',
            quantity=5,
            destination_location='phc-chandaka',
            dest_lat=loc.lat if loc else 20.35,
            dest_lng=loc.lng if loc else 85.77,
        )
        db.session.add(order)
        db.session.commit()
    resp = client.post('/api/admin/orders/TEST-ORD-002/launch', headers=auth_headers_admin)
    assert resp.status_code == 409
    assert resp.get_json()['error']['code'] == 'INVALID_ORDER_STATUS'


def test_launch_503_no_drone_available(seeded_app, client, auth_headers_admin):
    with seeded_app.app_context():
        Drone.query.filter_by(status='available').update({'status': 'maintenance'})
        db.session.commit()
    oid = _make_order(seeded_app)
    resp = client.post(f'/api/admin/orders/{oid}/launch', headers=auth_headers_admin)
    assert resp.status_code == 503
    assert resp.get_json()['error']['code'] == 'NO_DRONE_AVAILABLE'


# ─── Auth ──────────────────────────────────────────────────────────────────────

def test_launch_requires_admin_auth(seeded_app, client):
    oid = _make_order(seeded_app)
    resp = client.post(f'/api/admin/orders/{oid}/launch')
    assert resp.status_code == 401


def test_launch_rejects_doctor_auth(seeded_app, client, auth_headers_doctor):
    oid = _make_order(seeded_app)
    resp = client.post(f'/api/admin/orders/{oid}/launch', headers=auth_headers_doctor)
    assert resp.status_code == 403
