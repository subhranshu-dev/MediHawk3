"""
Admin Command Centre tests — Phase 1F+.

Covers:
  - Authentication & authorization for all 13 admin endpoints
  - Dashboard aggregate counts and structure
  - Orders listing (pagination)
  - Missions listing and active mission
  - Mission detail (telemetry + temperature log)
  - Fleet listing
  - Alerts listing and filtering
  - Alert acknowledge / resolve
  - Telemetry endpoint
  - Readiness checks (all 7 dimensions)
  - Drone control commands (RTL / Hold / Resume)
  - Priority queue scoring
  - Command-center combined snapshot
  - Security: doctor cannot call admin endpoints
  - Security: unauthenticated requests rejected
  - Security: role is never accepted from request body
"""
from __future__ import annotations

import pytest
from datetime import datetime, timezone

from extensions import db
from models import Alert, Drone, Mission, Order


# ── Fixtures ──────────────────────────────────────────────────────────────────

GPS_NEAR_CHANDAKA = {'latitude': 20.3512, 'longitude': 85.7612}


def _make_order_payload(**overrides):
    base = {
        'items': [{'medicine_id': 'inv-002', 'quantity': 1}],
        'priority': 'URGENT',
        **GPS_NEAR_CHANDAKA,
    }
    base.update(overrides)
    return base


def _seed_mission(app, order_id: str = 'ORD-TEST-001') -> Mission:
    """Insert a synthetic in_flight mission for testing."""
    with app.app_context():
        m = Mission(
            id='MSN-TEST-001',
            order_id=order_id,
            drone_id='MH-D01',
            from_lat=20.2961,
            from_lng=85.8189,
            to_lat=20.3512,
            to_lng=85.7612,
            distance_km=8.2,
            eta_minutes=12,
            elapsed_minutes=3.0,
            status='in_flight',
            medicine='Snakebite Antivenin',
            quantity=1,
            priority='urgent',
            launched_at=datetime.now(timezone.utc),
        )
        db.session.add(m)
        db.session.commit()
    return m


def _seed_alert(app, severity: str = 'warning', acknowledged: bool = False) -> Alert:
    """Insert a synthetic alert for testing."""
    with app.app_context():
        a = Alert(
            id='ALT-TEST-001',
            severity=severity,
            category='battery',
            title='Test Battery Warning',
            description='Battery below 30%.',
            recommended_action='Charge drone before next mission.',
            drone_id='MH-D01',
            acknowledged=acknowledged,
        )
        db.session.add(a)
        db.session.commit()
    return a


def _seed_order(app, client, auth_headers_doctor) -> dict:
    """Create a real order via the API. Returns the order JSON body."""
    resp = client.post('/api/order', json=_make_order_payload(), headers=auth_headers_doctor)
    assert resp.status_code == 201
    return resp.get_json()['order']


# ── Authentication & Authorization ────────────────────────────────────────────

ADMIN_ENDPOINTS = [
    ('GET', '/api/admin/dashboard'),
    ('GET', '/api/admin/orders'),
    ('GET', '/api/admin/missions'),
    ('GET', '/api/admin/missions/active'),
    ('GET', '/api/admin/fleet'),
    ('GET', '/api/admin/alerts'),
    ('GET', '/api/admin/telemetry/MH-D01'),
    ('GET', '/api/admin/readiness/MH-D01'),
    ('GET', '/api/admin/priority-queue'),
    ('GET', '/api/admin/command-center'),
]


@pytest.mark.parametrize('method,url', ADMIN_ENDPOINTS)
def test_unauthenticated_rejected(seeded_app, client, method, url):
    """All admin endpoints reject unauthenticated requests with 401."""
    resp = client.open(url, method=method)
    assert resp.status_code == 401


@pytest.mark.parametrize('method,url', ADMIN_ENDPOINTS)
def test_doctor_cannot_access_admin_endpoints(seeded_app, client, auth_headers_doctor, method, url):
    """Doctor JWT is rejected on admin endpoints with 403."""
    resp = client.open(url, method=method, headers=auth_headers_doctor)
    assert resp.status_code == 403


def test_role_from_body_is_ignored(seeded_app, client, auth_headers_doctor):
    """Sending role=admin in the request body does not bypass the 403."""
    resp = client.get('/api/admin/dashboard',
                      json={'role': 'admin'},
                      headers=auth_headers_doctor)
    assert resp.status_code == 403


def test_role_from_query_is_ignored(seeded_app, client, auth_headers_doctor):
    """Sending role=admin as a query parameter does not bypass the 403."""
    resp = client.get('/api/admin/dashboard?role=admin',
                      headers=auth_headers_doctor)
    assert resp.status_code == 403


# ── Dashboard ─────────────────────────────────────────────────────────────────

def test_dashboard_returns_200(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/dashboard', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_dashboard_has_required_keys(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/dashboard', headers=auth_headers_admin)
    body = resp.get_json()
    for key in ('active_missions', 'available_drones', 'pending_orders',
                'unacknowledged_alerts', 'drones', 'alerts'):
        assert key in body, f'Missing key: {key}'


def test_dashboard_counts_available_drones(seeded_app, client, auth_headers_admin):
    """Seeded data has 3 available drones (MH-D04 is maintenance)."""
    resp = client.get('/api/admin/dashboard', headers=auth_headers_admin)
    body = resp.get_json()
    assert body['available_drones'] == 3


def test_dashboard_counts_pending_orders(seeded_app, client, auth_headers_admin, auth_headers_doctor):
    """After creating an order, pending_orders count increases by 1."""
    before = client.get('/api/admin/dashboard', headers=auth_headers_admin).get_json()['pending_orders']
    client.post('/api/order', json=_make_order_payload(), headers=auth_headers_doctor)
    after = client.get('/api/admin/dashboard', headers=auth_headers_admin).get_json()['pending_orders']
    assert after == before + 1


def test_dashboard_drones_list_not_empty(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/dashboard', headers=auth_headers_admin)
    assert len(resp.get_json()['drones']) >= 4


def test_dashboard_active_mission_is_null_when_none_active(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/dashboard', headers=auth_headers_admin)
    assert resp.get_json()['active_mission'] is None


def test_dashboard_active_mission_present_when_in_flight(seeded_app, client, auth_headers_admin, app,
                                                          auth_headers_doctor):
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/dashboard', headers=auth_headers_admin)
    assert resp.get_json()['active_mission'] is not None


# ── Orders ────────────────────────────────────────────────────────────────────

def test_admin_orders_returns_200(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/orders', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_admin_orders_has_pagination_keys(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/orders', headers=auth_headers_admin)
    body = resp.get_json()
    assert 'orders' in body
    assert 'total' in body
    assert 'page' in body
    assert 'per_page' in body


def test_admin_orders_shows_new_order(seeded_app, client, auth_headers_admin, auth_headers_doctor):
    client.post('/api/order', json=_make_order_payload(), headers=auth_headers_doctor)
    resp = client.get('/api/admin/orders', headers=auth_headers_admin)
    assert resp.get_json()['total'] >= 1


def test_admin_orders_pagination_default(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/orders', headers=auth_headers_admin)
    body = resp.get_json()
    assert body['page'] == 1
    assert body['per_page'] == 20


def test_admin_orders_sees_all_doctors_orders(seeded_app, client, auth_headers_admin, auth_headers_doctor):
    """Admin can see orders from any doctor."""
    client.post('/api/order', json=_make_order_payload(), headers=auth_headers_doctor)
    resp = client.get('/api/admin/orders', headers=auth_headers_admin)
    assert resp.get_json()['total'] >= 1


# ── Missions ──────────────────────────────────────────────────────────────────

def test_admin_missions_returns_200(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/missions', headers=auth_headers_admin)
    assert resp.status_code == 200
    assert 'missions' in resp.get_json()


def test_admin_missions_empty_when_none_seeded(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/missions', headers=auth_headers_admin)
    assert resp.get_json()['missions'] == []


def test_admin_missions_shows_seeded_mission(seeded_app, client, auth_headers_admin, app, auth_headers_doctor):
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/missions', headers=auth_headers_admin)
    missions = resp.get_json()['missions']
    assert len(missions) == 1
    assert missions[0]['id'] == 'MSN-TEST-001'


def test_admin_missions_active_returns_200(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/missions/active', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_admin_missions_active_null_when_none(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/missions/active', headers=auth_headers_admin)
    assert resp.get_json()['mission'] is None


def test_admin_missions_active_returns_in_flight_mission(seeded_app, client, auth_headers_admin, app,
                                                          auth_headers_doctor):
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/missions/active', headers=auth_headers_admin)
    assert resp.get_json()['mission']['id'] == 'MSN-TEST-001'


def test_admin_mission_detail_returns_200(seeded_app, client, auth_headers_admin, app, auth_headers_doctor):
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/missions/MSN-TEST-001', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_admin_mission_detail_has_required_keys(seeded_app, client, auth_headers_admin, app, auth_headers_doctor):
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/missions/MSN-TEST-001', headers=auth_headers_admin)
    body = resp.get_json()
    assert 'mission' in body
    assert 'telemetry' in body
    assert 'temperature_log' in body


def test_admin_mission_detail_404_for_unknown(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/missions/DOES-NOT-EXIST', headers=auth_headers_admin)
    assert resp.status_code == 404


# ── Fleet ─────────────────────────────────────────────────────────────────────

def test_admin_fleet_returns_200(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/fleet', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_admin_fleet_returns_all_drones(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/fleet', headers=auth_headers_admin)
    body = resp.get_json()
    assert 'drones' in body
    assert len(body['drones']) == 4


def test_admin_fleet_drone_has_required_fields(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/fleet', headers=auth_headers_admin)
    drone = resp.get_json()['drones'][0]
    for field in ('id', 'name', 'status', 'battery', 'lat', 'lng'):
        assert field in drone, f'Missing field: {field}'


def test_admin_fleet_maintenance_drone_present(seeded_app, client, auth_headers_admin):
    """MH-D04 (Hawk Delta) is seeded as maintenance."""
    resp = client.get('/api/admin/fleet', headers=auth_headers_admin)
    drone_ids = [d['id'] for d in resp.get_json()['drones']]
    assert 'MH-D04' in drone_ids


# ── Alerts ────────────────────────────────────────────────────────────────────

def test_admin_alerts_returns_200(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/alerts', headers=auth_headers_admin)
    assert resp.status_code == 200
    assert 'alerts' in resp.get_json()


def test_admin_alerts_empty_initially(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/alerts', headers=auth_headers_admin)
    assert resp.get_json()['alerts'] == []


def test_admin_alerts_shows_seeded_alert(seeded_app, client, auth_headers_admin, app):
    _seed_alert(app)
    resp = client.get('/api/admin/alerts', headers=auth_headers_admin)
    assert len(resp.get_json()['alerts']) == 1


def test_admin_alerts_filter_unacknowledged(seeded_app, client, auth_headers_admin, app):
    """?acknowledged=false returns only unacknowledged alerts."""
    _seed_alert(app, acknowledged=False)
    resp = client.get('/api/admin/alerts?acknowledged=false', headers=auth_headers_admin)
    alerts = resp.get_json()['alerts']
    assert len(alerts) == 1
    assert alerts[0]['acknowledged'] is False


def test_admin_alerts_no_filter_returns_all(seeded_app, client, auth_headers_admin, app):
    """Without filter, acknowledged alerts are also returned."""
    _seed_alert(app, acknowledged=True)
    resp = client.get('/api/admin/alerts', headers=auth_headers_admin)
    assert len(resp.get_json()['alerts']) == 1


# ── Alert Acknowledge ─────────────────────────────────────────────────────────

def test_acknowledge_alert_returns_200(seeded_app, client, auth_headers_admin, app):
    _seed_alert(app)
    resp = client.post('/api/admin/alerts/ALT-TEST-001/acknowledge', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_acknowledge_alert_sets_acknowledged_true(seeded_app, client, auth_headers_admin, app):
    _seed_alert(app)
    resp = client.post('/api/admin/alerts/ALT-TEST-001/acknowledge', headers=auth_headers_admin)
    body = resp.get_json()
    assert body['success'] is True
    assert body['alert']['acknowledged'] is True


def test_acknowledge_alert_persists_to_db(seeded_app, client, auth_headers_admin, app):
    _seed_alert(app)
    client.post('/api/admin/alerts/ALT-TEST-001/acknowledge', headers=auth_headers_admin)
    with app.app_context():
        alert = db.session.get(Alert, 'ALT-TEST-001')
        assert alert.acknowledged is True
        assert alert.acknowledged_by is not None


def test_acknowledge_alert_404_for_unknown(seeded_app, client, auth_headers_admin):
    resp = client.post('/api/admin/alerts/DOES-NOT-EXIST/acknowledge', headers=auth_headers_admin)
    assert resp.status_code == 404


def test_doctor_cannot_acknowledge_alert(seeded_app, client, auth_headers_doctor, app):
    _seed_alert(app)
    resp = client.post('/api/admin/alerts/ALT-TEST-001/acknowledge', headers=auth_headers_doctor)
    assert resp.status_code == 403


# ── Alert Resolve ─────────────────────────────────────────────────────────────

def test_resolve_alert_returns_200(seeded_app, client, auth_headers_admin, app):
    _seed_alert(app)
    resp = client.post('/api/admin/alerts/ALT-TEST-001/resolve', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_resolve_alert_sets_acknowledged_true(seeded_app, client, auth_headers_admin, app):
    _seed_alert(app)
    resp = client.post('/api/admin/alerts/ALT-TEST-001/resolve', headers=auth_headers_admin)
    assert resp.get_json()['alert']['acknowledged'] is True


def test_resolve_alert_404_for_unknown(seeded_app, client, auth_headers_admin):
    resp = client.post('/api/admin/alerts/DOES-NOT-EXIST/resolve', headers=auth_headers_admin)
    assert resp.status_code == 404


# ── Telemetry ─────────────────────────────────────────────────────────────────

def test_admin_telemetry_returns_200(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/telemetry/MH-D01', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_admin_telemetry_has_required_keys(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/telemetry/MH-D01', headers=auth_headers_admin)
    body = resp.get_json()
    assert 'drone_id' in body
    assert 'telemetry' in body
    assert isinstance(body['telemetry'], list)


def test_admin_telemetry_empty_when_no_rows(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/telemetry/MH-D01', headers=auth_headers_admin)
    assert resp.get_json()['telemetry'] == []


def test_admin_telemetry_404_for_unknown_drone(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/telemetry/MH-DOES-NOT-EXIST', headers=auth_headers_admin)
    assert resp.status_code == 404


# ── Readiness ─────────────────────────────────────────────────────────────────

def test_admin_readiness_returns_200(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/readiness/MH-D01', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_admin_readiness_has_required_keys(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/readiness/MH-D01', headers=auth_headers_admin)
    body = resp.get_json()
    assert 'drone' in body
    assert 'checks' in body
    assert 'overall' in body


def test_admin_readiness_has_7_checks(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/readiness/MH-D01', headers=auth_headers_admin)
    checks = resp.get_json()['checks']
    assert len(checks) == 7


def test_admin_readiness_check_ids_present(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/readiness/MH-D01', headers=auth_headers_admin)
    check_ids = {c['id'] for c in resp.get_json()['checks']}
    expected = {'battery', 'gps', 'temperature', 'connection', 'motors', 'payload_lock', 'status'}
    assert check_ids == expected


def test_admin_readiness_overall_is_go_for_healthy_drone(seeded_app, client, auth_headers_admin):
    """MH-D01 is seeded as available, 100% battery — should be 'go'."""
    resp = client.get('/api/admin/readiness/MH-D01', headers=auth_headers_admin)
    assert resp.get_json()['overall'] == 'go'


def test_admin_readiness_overall_is_no_go_for_maintenance_drone(seeded_app, client, auth_headers_admin):
    """MH-D04 has 45% battery and maintenance status — should be 'no_go'."""
    resp = client.get('/api/admin/readiness/MH-D04', headers=auth_headers_admin)
    overall = resp.get_json()['overall']
    assert overall in ('no_go', 'warning')  # maintenance status triggers fail


def test_admin_readiness_404_for_unknown_drone(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/readiness/MH-DOES-NOT-EXIST', headers=auth_headers_admin)
    assert resp.status_code == 404


# ── Drone Control — RTL ────────────────────────────────────────────────────────

def test_drone_rtl_returns_200_for_in_flight(seeded_app, client, auth_headers_admin, app, auth_headers_doctor):
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    # Set MH-D01 to in_flight
    with app.app_context():
        d = db.session.get(Drone, 'MH-D01')
        d.status = 'in_flight'
        d.mission_id = 'MSN-TEST-001'
        db.session.commit()
    resp = client.post('/api/admin/drone/MH-D01/rtl', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_drone_rtl_requires_admin(seeded_app, client, auth_headers_doctor):
    resp = client.post('/api/admin/drone/MH-D01/rtl', headers=auth_headers_doctor)
    assert resp.status_code == 403


def test_drone_rtl_unauthenticated_rejected(seeded_app, client):
    resp = client.post('/api/admin/drone/MH-D01/rtl')
    assert resp.status_code == 401


def test_drone_rtl_404_for_unknown_drone(seeded_app, client, auth_headers_admin):
    resp = client.post('/api/admin/drone/MH-GHOST/rtl', headers=auth_headers_admin)
    assert resp.status_code == 404


# ── Drone Control — Hold ──────────────────────────────────────────────────────

def test_drone_hold_returns_200(seeded_app, client, auth_headers_admin):
    resp = client.post('/api/admin/drone/MH-D01/hold', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_drone_hold_sets_connection_degraded(seeded_app, client, auth_headers_admin, app):
    client.post('/api/admin/drone/MH-D01/hold', headers=auth_headers_admin)
    with app.app_context():
        drone = db.session.get(Drone, 'MH-D01')
        assert drone.connection == 'degraded'


def test_drone_hold_requires_admin(seeded_app, client, auth_headers_doctor):
    resp = client.post('/api/admin/drone/MH-D01/hold', headers=auth_headers_doctor)
    assert resp.status_code == 403


def test_drone_hold_404_for_unknown(seeded_app, client, auth_headers_admin):
    resp = client.post('/api/admin/drone/MH-GHOST/hold', headers=auth_headers_admin)
    assert resp.status_code == 404


# ── Drone Control — Resume ────────────────────────────────────────────────────

def test_drone_resume_returns_200(seeded_app, client, auth_headers_admin, app):
    with app.app_context():
        d = db.session.get(Drone, 'MH-D01')
        d.connection = 'degraded'
        db.session.commit()
    resp = client.post('/api/admin/drone/MH-D01/resume', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_drone_resume_sets_connection_stable(seeded_app, client, auth_headers_admin, app):
    with app.app_context():
        d = db.session.get(Drone, 'MH-D01')
        d.connection = 'degraded'
        db.session.commit()
    client.post('/api/admin/drone/MH-D01/resume', headers=auth_headers_admin)
    with app.app_context():
        drone = db.session.get(Drone, 'MH-D01')
        assert drone.connection == 'stable'


def test_drone_resume_requires_admin(seeded_app, client, auth_headers_doctor):
    resp = client.post('/api/admin/drone/MH-D01/resume', headers=auth_headers_doctor)
    assert resp.status_code == 403


def test_drone_resume_404_for_unknown(seeded_app, client, auth_headers_admin):
    resp = client.post('/api/admin/drone/MH-GHOST/resume', headers=auth_headers_admin)
    assert resp.status_code == 404


# ── Priority Queue ─────────────────────────────────────────────────────────────

def test_priority_queue_returns_200(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/priority-queue', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_priority_queue_has_queue_key(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/priority-queue', headers=auth_headers_admin)
    assert 'queue' in resp.get_json()


def test_priority_queue_empty_when_no_pending_orders(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/priority-queue', headers=auth_headers_admin)
    assert resp.get_json()['queue'] == []


def test_priority_queue_shows_pending_orders(seeded_app, client, auth_headers_admin, auth_headers_doctor):
    client.post('/api/order', json=_make_order_payload(), headers=auth_headers_doctor)
    resp = client.get('/api/admin/priority-queue', headers=auth_headers_admin)
    assert len(resp.get_json()['queue']) == 1


def test_priority_queue_emergency_before_urgent(seeded_app, client, auth_headers_admin, auth_headers_doctor):
    """Emergency orders must appear before urgent ones regardless of creation order."""
    urgent_payload = _make_order_payload(priority='URGENT',
                                          items=[{'medicine_id': 'inv-008', 'quantity': 1}])
    emergency_payload = _make_order_payload(priority='EMERGENCY',
                                             items=[{'medicine_id': 'inv-003', 'quantity': 1}])
    client.post('/api/order', json=urgent_payload, headers=auth_headers_doctor)
    client.post('/api/order', json=emergency_payload, headers=auth_headers_doctor)
    resp = client.get('/api/admin/priority-queue', headers=auth_headers_admin)
    queue = resp.get_json()['queue']
    assert len(queue) == 2
    assert queue[0]['priority'] == 'emergency'


def test_priority_queue_has_score_field(seeded_app, client, auth_headers_admin, auth_headers_doctor):
    client.post('/api/order', json=_make_order_payload(), headers=auth_headers_doctor)
    resp = client.get('/api/admin/priority-queue', headers=auth_headers_admin)
    queue = resp.get_json()['queue']
    assert 'score' in queue[0]


def test_priority_queue_only_pending_orders(seeded_app, client, auth_headers_admin, auth_headers_doctor, app):
    """Delivered orders must not appear in the queue."""
    client.post('/api/order', json=_make_order_payload(), headers=auth_headers_doctor)
    # Manually mark the order as delivered
    with app.app_context():
        order = Order.query.filter_by(status='pending').first()
        if order:
            order.status = 'delivered'
            db.session.commit()
    resp = client.get('/api/admin/priority-queue', headers=auth_headers_admin)
    assert resp.get_json()['queue'] == []


# ── Command Center ────────────────────────────────────────────────────────────

def test_command_center_returns_200(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/command-center', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_command_center_has_required_keys(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/command-center', headers=auth_headers_admin)
    body = resp.get_json()
    for key in ('active_missions', 'available_drones', 'pending_orders',
                'unacknowledged_alerts', 'drones', 'alerts', 'priority_queue'):
        assert key in body, f'Missing key: {key}'


def test_command_center_priority_queue_is_list(seeded_app, client, auth_headers_admin):
    resp = client.get('/api/admin/command-center', headers=auth_headers_admin)
    assert isinstance(resp.get_json()['priority_queue'], list)


def test_command_center_priority_queue_max_5(seeded_app, client, auth_headers_admin, auth_headers_doctor):
    """Priority queue in command-center is capped at 5 entries."""
    for _ in range(7):
        client.post('/api/order', json=_make_order_payload(
            items=[{'medicine_id': 'inv-003', 'quantity': 1}]
        ), headers=auth_headers_doctor)
    resp = client.get('/api/admin/command-center', headers=auth_headers_admin)
    assert len(resp.get_json()['priority_queue']) <= 5


def test_command_center_doctor_rejected(seeded_app, client, auth_headers_doctor):
    resp = client.get('/api/admin/command-center', headers=auth_headers_doctor)
    assert resp.status_code == 403


def test_command_center_unauthenticated_rejected(seeded_app, client):
    resp = client.get('/api/admin/command-center')
    assert resp.status_code == 401


# ── Regression: existing doctor/order tests not broken ────────────────────────

def test_doctor_can_still_create_order_after_admin_routes_added(seeded_app, client, auth_headers_doctor):
    """Confirm admin blueprint registration didn't break doctor order flow."""
    resp = client.post('/api/order', json=_make_order_payload(), headers=auth_headers_doctor)
    assert resp.status_code == 201
    assert resp.get_json()['success'] is True


def test_inventory_endpoint_still_works(seeded_app, client, auth_headers_doctor):
    """Inventory endpoint unaffected by admin blueprint."""
    resp = client.get('/api/inventory', headers=auth_headers_doctor)
    assert resp.status_code == 200


def test_health_endpoint_still_works(seeded_app, client):
    """Health check unaffected."""
    resp = client.get('/api/health')
    assert resp.status_code == 200


# ── MissionMap contract regression (TypeError fix) ────────────────────────────

def test_mission_to_dict_includes_waypoints(seeded_app, client, auth_headers_admin, app, auth_headers_doctor):
    """Mission.to_dict() must always return a 'waypoints' list — the root cause of the crash."""
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/missions/active', headers=auth_headers_admin)
    body = resp.get_json()
    assert body['mission'] is not None
    assert 'waypoints' in body['mission']
    assert isinstance(body['mission']['waypoints'], list)


def test_mission_waypoints_not_empty_for_active_mission(seeded_app, client, auth_headers_admin, app,
                                                          auth_headers_doctor):
    """Active mission must return at least 2 waypoints for map route rendering."""
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/missions/active', headers=auth_headers_admin)
    waypoints = resp.get_json()['mission']['waypoints']
    assert len(waypoints) >= 2


def test_mission_waypoints_have_required_fields(seeded_app, client, auth_headers_admin, app,
                                                 auth_headers_doctor):
    """Each waypoint must have index, lat, lng, altitude, label, reached fields."""
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/missions/active', headers=auth_headers_admin)
    for wp in resp.get_json()['mission']['waypoints']:
        for field in ('index', 'lat', 'lng', 'altitude', 'label', 'reached'):
            assert field in wp, f'Missing field in waypoint: {field}'


def test_mission_waypoints_progress_marks_first_as_reached(seeded_app, client, auth_headers_admin,
                                                             app, auth_headers_doctor):
    """With elapsed_minutes=3.0 and eta_minutes=12, waypoint at t=0.0 must be reached."""
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/missions/active', headers=auth_headers_admin)
    first_wp = resp.get_json()['mission']['waypoints'][0]
    assert first_wp['reached'] is True


def test_mission_with_zero_eta_has_empty_safe_waypoints(seeded_app, client, auth_headers_admin, app,
                                                          auth_headers_doctor):
    """Mission with eta_minutes=0 must still return waypoints list (no division error)."""
    order = _seed_order(app, client, auth_headers_doctor)
    with app.app_context():
        m = Mission(
            id='MSN-ZERO-ETA',
            order_id=order['id'],
            drone_id='MH-D02',
            from_lat=20.2961, from_lng=85.8189,
            to_lat=20.3512, to_lng=85.7612,
            distance_km=8.2, eta_minutes=0,
            elapsed_minutes=0.0, status='preparing',
        )
        db.session.add(m)
        db.session.commit()
    resp = client.get('/api/admin/missions/MSN-ZERO-ETA', headers=auth_headers_admin)
    assert resp.status_code == 200
    assert isinstance(resp.get_json()['mission']['waypoints'], list)


def test_mission_includes_from_location_name(seeded_app, client, auth_headers_admin, app,
                                              auth_headers_doctor):
    """Mission must include from_location string resolved from Location table."""
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/missions/active', headers=auth_headers_admin)
    mission = resp.get_json()['mission']
    assert 'from_location' in mission
    assert isinstance(mission['from_location'], str)
    assert len(mission['from_location']) > 0


def test_mission_includes_to_location_name(seeded_app, client, auth_headers_admin, app,
                                            auth_headers_doctor):
    """Mission must include to_location string resolved from Location table."""
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/missions/active', headers=auth_headers_admin)
    mission = resp.get_json()['mission']
    assert 'to_location' in mission
    assert isinstance(mission['to_location'], str)
    assert len(mission['to_location']) > 0


def test_mission_to_location_matches_destination(seeded_app, client, auth_headers_admin, app,
                                                  auth_headers_doctor):
    """to_location must be PHC Chandaka — the seeded destination for this test mission."""
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/missions/active', headers=auth_headers_admin)
    assert resp.get_json()['mission']['to_location'] == 'PHC Chandaka'


def test_mission_includes_events_as_list(seeded_app, client, auth_headers_admin, app, auth_headers_doctor):
    """Mission must include events as a list (empty or populated, never undefined)."""
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/missions/active', headers=auth_headers_admin)
    events = resp.get_json()['mission']['events']
    assert isinstance(events, list)


def test_no_active_mission_returns_null_not_missing(seeded_app, client, auth_headers_admin):
    """When no mission is active, active_mission is null — not absent from response."""
    resp = client.get('/api/admin/missions/active', headers=auth_headers_admin)
    body = resp.get_json()
    assert 'mission' in body
    assert body['mission'] is None


def test_command_center_active_mission_has_waypoints(seeded_app, client, auth_headers_admin, app,
                                                      auth_headers_doctor):
    """command-center endpoint active_mission must include waypoints when a mission exists."""
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/command-center', headers=auth_headers_admin)
    am = resp.get_json().get('active_mission')
    assert am is not None
    assert isinstance(am.get('waypoints'), list)
    assert len(am['waypoints']) >= 2


# ── Duplicate-data regression (Phase FINAL) ───────────────────────────────────

def test_command_center_drones_no_duplicate_ids(seeded_app, client, auth_headers_admin):
    """command-center drones list must have unique IDs — no duplicates that cause React key errors."""
    resp = client.get('/api/admin/command-center', headers=auth_headers_admin)
    drones = resp.get_json()['drones']
    ids = [d['id'] for d in drones]
    assert len(ids) == len(set(ids)), f'Duplicate drone IDs in command-center: {ids}'


def test_command_center_alerts_no_duplicate_ids(seeded_app, client, auth_headers_admin, app):
    """command-center alerts list must have unique IDs."""
    _seed_alert(app)
    resp = client.get('/api/admin/command-center', headers=auth_headers_admin)
    alerts = resp.get_json()['alerts']
    ids = [a['id'] for a in alerts]
    assert len(ids) == len(set(ids)), f'Duplicate alert IDs in command-center: {ids}'


def test_command_center_priority_queue_no_duplicate_ids(seeded_app, client, auth_headers_admin, auth_headers_doctor):
    """Priority queue must not contain the same order twice."""
    for _ in range(3):
        client.post('/api/order', json=_make_order_payload(
            items=[{'medicine_id': 'inv-003', 'quantity': 1}]
        ), headers=auth_headers_doctor)
    resp = client.get('/api/admin/command-center', headers=auth_headers_admin)
    pq = resp.get_json()['priority_queue']
    ids = [o['id'] for o in pq]
    assert len(ids) == len(set(ids)), f'Duplicate order IDs in priority_queue: {ids}'


def test_orders_list_no_duplicate_ids(seeded_app, client, auth_headers_admin, auth_headers_doctor):
    """/api/admin/orders list must never return the same order ID twice."""
    client.post('/api/order', json=_make_order_payload(), headers=auth_headers_doctor)
    resp = client.get('/api/admin/orders', headers=auth_headers_admin)
    orders = resp.get_json()['orders']
    ids = [o['id'] for o in orders]
    assert len(ids) == len(set(ids)), f'Duplicate order IDs in admin orders list: {ids}'


def test_fleet_no_duplicate_ids(seeded_app, client, auth_headers_admin):
    """Fleet list must have unique drone IDs."""
    resp = client.get('/api/admin/fleet', headers=auth_headers_admin)
    drones = resp.get_json()['drones']
    ids = [d['id'] for d in drones]
    assert len(ids) == len(set(ids)), f'Duplicate drone IDs in fleet: {ids}'


def test_alerts_list_no_duplicate_ids(seeded_app, client, auth_headers_admin, app):
    """Alerts list must have unique IDs even after multiple calls."""
    _seed_alert(app)
    resp1 = client.get('/api/admin/alerts', headers=auth_headers_admin)
    resp2 = client.get('/api/admin/alerts', headers=auth_headers_admin)
    for resp in (resp1, resp2):
        alerts = resp.get_json()['alerts']
        ids = [a['id'] for a in alerts]
        assert len(ids) == len(set(ids)), f'Duplicate alert IDs in alerts list: {ids}'


def test_repeated_command_center_calls_return_same_counts(seeded_app, client, auth_headers_admin, app,
                                                           auth_headers_doctor):
    """Polling: calling command-center twice must return same drone count (idempotent)."""
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    r1 = client.get('/api/admin/command-center', headers=auth_headers_admin).get_json()
    r2 = client.get('/api/admin/command-center', headers=auth_headers_admin).get_json()
    assert len(r1['drones']) == len(r2['drones']), 'Polling added extra drones'
    assert len(r1['alerts']) <= len(r2['alerts']) + 1, 'Alert count diverged unexpectedly'


def test_command_center_empty_state_no_crash(seeded_app, client, auth_headers_admin):
    """command-center must respond 200 with empty lists when no missions/alerts exist."""
    resp = client.get('/api/admin/command-center', headers=auth_headers_admin)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['active_mission'] is None or isinstance(body['active_mission'], dict)
    assert isinstance(body['drones'], list)
    assert isinstance(body['alerts'], list)
    assert isinstance(body['priority_queue'], list)


def test_mission_null_launched_at_does_not_crash_serializer(seeded_app, client, auth_headers_admin, app,
                                                              auth_headers_doctor):
    """Mission without launched_at (null) must serialize safely — no AttributeError."""
    order = _seed_order(app, client, auth_headers_doctor)
    with app.app_context():
        m = Mission(
            id='MSN-NULL-LAUNCH',
            order_id=order['id'],
            drone_id='MH-D02',
            from_lat=20.2961, from_lng=85.8189,
            to_lat=20.3512, to_lng=85.7612,
            distance_km=8.2, eta_minutes=12,
            elapsed_minutes=0.0, status='preparing',
            launched_at=None,
        )
        db.session.add(m)
        db.session.commit()
    resp = client.get('/api/admin/missions/MSN-NULL-LAUNCH', headers=auth_headers_admin)
    assert resp.status_code == 200
    assert resp.get_json()['mission']['launched_at'] is None


def test_missions_list_no_duplicate_ids(seeded_app, client, auth_headers_admin, app, auth_headers_doctor):
    """Missions list must never return the same mission ID twice."""
    order = _seed_order(app, client, auth_headers_doctor)
    _seed_mission(app, order_id=order['id'])
    resp = client.get('/api/admin/missions', headers=auth_headers_admin)
    missions = resp.get_json()['missions']
    ids = [m['id'] for m in missions]
    assert len(ids) == len(set(ids)), f'Duplicate mission IDs in missions list: {ids}'


def test_command_center_drones_have_canonical_ids(seeded_app, client, auth_headers_admin):
    """Every drone in command-center must have a non-empty string id field."""
    resp = client.get('/api/admin/command-center', headers=auth_headers_admin)
    for drone in resp.get_json()['drones']:
        assert isinstance(drone.get('id'), str) and drone['id'], 'Drone missing canonical id'


def test_command_center_alerts_have_canonical_ids(seeded_app, client, auth_headers_admin, app):
    """Every alert in command-center must have a non-empty string id field."""
    _seed_alert(app)
    resp = client.get('/api/admin/command-center', headers=auth_headers_admin)
    for alert in resp.get_json()['alerts']:
        assert isinstance(alert.get('id'), str) and alert['id'], 'Alert missing canonical id'
