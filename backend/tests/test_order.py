"""
Phase 1C order tests.

Covers all 40 required order checks. Uses seeded database with:
  Valid medicines (not expired): inv-002, inv-003, inv-004, inv-006, inv-008
  Expired medicines:             inv-001 (2026-08-15), inv-005 (2026-06-30), inv-007 (2026-07-31)
  PHC Chandaka (phc-chandaka): lat 20.3512, lng 85.7612  ← nearest to test coordinates
  PHC Jatani   (phc-jatani):  lat 20.1682, lng 85.8141
"""
from __future__ import annotations

import pytest

from extensions import db
from models.inventory import InventoryItem
from models.location import Location
from models.order import Order, OrderItem

# ── Shared helpers ────────────────────────────────────────────────────────────

GPS_NEAR_CHANDAKA = {'latitude': 20.3512, 'longitude': 85.7612}   # resolves to phc-chandaka
GPS_NEAR_JATANI   = {'latitude': 20.17,   'longitude': 85.82}     # resolves to phc-jatani
GPS_TOKYO         = {'latitude': 35.6762, 'longitude': 139.6503}  # no facility in radius

VALID_ITEM = {'medicine_id': 'inv-002', 'quantity': 2}   # Snakebite Antivenin, 28 vials, valid
VALID_ITEM2 = {'medicine_id': 'inv-008', 'quantity': 3}  # Lignocaine HCL, 45 ampoules, valid
EXPIRED_ITEM = {'medicine_id': 'inv-001', 'quantity': 1} # Oxytocin, expired 2026-08-15


def make_order_payload(**overrides):
    base = {
        'items': [VALID_ITEM],
        'priority': 'URGENT',
        **GPS_NEAR_CHANDAKA,
    }
    base.update(overrides)
    return base


# ── Authentication & Authorization ───────────────────────────────────────────

def test_unauthenticated_cannot_create_order(client, seeded_app):
    """Check 2: unauthenticated request → 401."""
    resp = client.post('/api/order', json=make_order_payload())
    assert resp.status_code == 401


def test_admin_cannot_create_doctor_order(seeded_app, client, auth_headers_admin):
    """Check 3: admin role cannot create an order via the doctor endpoint."""
    resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_admin)
    assert resp.status_code == 403


def test_authenticated_doctor_can_create_order(seeded_app, client, auth_headers_doctor):
    """Check 1: authenticated doctor creates order → 201."""
    resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    assert resp.status_code == 201, resp.get_json()
    body = resp.get_json()
    assert body['success'] is True
    assert 'order' in body


# ── Item validation ───────────────────────────────────────────────────────────

def test_missing_items_rejected(seeded_app, client, auth_headers_doctor):
    """Check 4: missing 'items' key → rejected."""
    payload = {k: v for k, v in make_order_payload().items() if k != 'items'}
    resp = client.post('/api/order', json=payload, headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)
    assert 'error' in resp.get_json()


def test_empty_items_rejected(seeded_app, client, auth_headers_doctor):
    """Check 5: empty items list → rejected."""
    resp = client.post('/api/order', json=make_order_payload(items=[]), headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)
    assert resp.get_json()['error']['code'] == 'INVALID_ITEMS'


def test_invalid_medicine_id_rejected(seeded_app, client, auth_headers_doctor):
    """Check 6: unknown medicine_id → MEDICINE_NOT_FOUND."""
    resp = client.post('/api/order',
                       json=make_order_payload(items=[{'medicine_id': 'inv-FAKE', 'quantity': 1}]),
                       headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)
    assert resp.get_json()['error']['code'] == 'MEDICINE_NOT_FOUND'


def test_inactive_medicine_rejected(seeded_app, client, auth_headers_doctor, app):
    """Check 7: inactive medicine → MEDICINE_INACTIVE."""
    inv = db.session.get(InventoryItem, 'inv-002')
    inv.is_active = False
    db.session.commit()

    resp = client.post('/api/order',
                       json=make_order_payload(items=[{'medicine_id': 'inv-002', 'quantity': 1}]),
                       headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)
    assert resp.get_json()['error']['code'] == 'MEDICINE_INACTIVE'


def test_zero_quantity_rejected(seeded_app, client, auth_headers_doctor):
    """Check 8: quantity = 0 → rejected."""
    resp = client.post('/api/order',
                       json=make_order_payload(items=[{'medicine_id': 'inv-002', 'quantity': 0}]),
                       headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)
    assert resp.get_json()['error']['code'] == 'INVALID_QUANTITY'


def test_negative_quantity_rejected(seeded_app, client, auth_headers_doctor):
    """Check 9: quantity = -1 → rejected."""
    resp = client.post('/api/order',
                       json=make_order_payload(items=[{'medicine_id': 'inv-002', 'quantity': -1}]),
                       headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)
    assert resp.get_json()['error']['code'] == 'INVALID_QUANTITY'


def test_fractional_quantity_rejected(seeded_app, client, auth_headers_doctor):
    """Check 10: quantity = 1.5 → rejected (integer domain)."""
    resp = client.post('/api/order',
                       json=make_order_payload(items=[{'medicine_id': 'inv-002', 'quantity': 1.5}]),
                       headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)
    assert resp.get_json()['error']['code'] == 'INVALID_QUANTITY'


def test_string_quantity_rejected(seeded_app, client, auth_headers_doctor):
    """Quantity as string → rejected."""
    resp = client.post('/api/order',
                       json=make_order_payload(items=[{'medicine_id': 'inv-002', 'quantity': 'two'}]),
                       headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)


# ── Priority validation ───────────────────────────────────────────────────────

def test_invalid_priority_rejected(seeded_app, client, auth_headers_doctor):
    """Check 11: unknown priority → INVALID_PRIORITY."""
    resp = client.post('/api/order',
                       json=make_order_payload(priority='CRITICAL'),
                       headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)
    assert resp.get_json()['error']['code'] == 'INVALID_PRIORITY'


def test_emergency_priority_accepted(seeded_app, client, auth_headers_doctor):
    """Check 12: EMERGENCY accepted and normalised to lowercase."""
    resp = client.post('/api/order',
                       json=make_order_payload(priority='EMERGENCY'),
                       headers=auth_headers_doctor)
    assert resp.status_code == 201
    assert resp.get_json()['order']['priority'] == 'emergency'


def test_urgent_priority_accepted(seeded_app, client, auth_headers_doctor):
    """Check 13: URGENT accepted."""
    resp = client.post('/api/order',
                       json=make_order_payload(priority='URGENT'),
                       headers=auth_headers_doctor)
    assert resp.status_code == 201
    assert resp.get_json()['order']['priority'] == 'urgent'


def test_normal_priority_accepted(seeded_app, client, auth_headers_doctor):
    """Check 14: NORMAL accepted."""
    resp = client.post('/api/order',
                       json=make_order_payload(priority='NORMAL'),
                       headers=auth_headers_doctor)
    assert resp.status_code == 201
    assert resp.get_json()['order']['priority'] == 'normal'


# ── Stock validation ───────────────────────────────────────────────────────────

def test_insufficient_stock_rejected(seeded_app, client, auth_headers_doctor):
    """Check 15: request > available → INSUFFICIENT_STOCK."""
    # inv-002 has 28 vials; request 29
    resp = client.post('/api/order',
                       json=make_order_payload(items=[{'medicine_id': 'inv-002', 'quantity': 29}]),
                       headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)
    assert resp.get_json()['error']['code'] == 'INSUFFICIENT_STOCK'


def test_exact_available_stock_accepted(seeded_app, client, auth_headers_doctor):
    """Check 16: request exactly available stock → accepted."""
    # inv-002 has 28 vials; request exactly 28
    resp = client.post('/api/order',
                       json=make_order_payload(items=[{'medicine_id': 'inv-002', 'quantity': 28}]),
                       headers=auth_headers_doctor)
    assert resp.status_code == 201


def test_stock_never_negative(seeded_app, client, auth_headers_doctor, app):
    """Check 17: stock cannot drop below zero."""
    # inv-002 has 28; order 28 (success), then try to order 1 more
    client.post('/api/order',
                json=make_order_payload(items=[{'medicine_id': 'inv-002', 'quantity': 28}]),
                headers=auth_headers_doctor)

    resp = client.post('/api/order',
                       json=make_order_payload(items=[{'medicine_id': 'inv-002', 'quantity': 1}]),
                       headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)
    assert resp.get_json()['error']['code'] == 'INSUFFICIENT_STOCK'

    db.session.expire_all()
    inv = db.session.get(InventoryItem, 'inv-002')
    assert inv.quantity == 0  # never negative


# ── Expiry validation ─────────────────────────────────────────────────────────

def test_expired_medicine_rejected(seeded_app, client, auth_headers_doctor):
    """Check 18: expired medicine → MEDICINE_EXPIRED."""
    # inv-001 (Oxytocin) expired 2026-08-15, today is 2026-09-14
    resp = client.post('/api/order', json=make_order_payload(items=[EXPIRED_ITEM]),
                       headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)
    assert resp.get_json()['error']['code'] == 'MEDICINE_EXPIRED'


def test_valid_medicine_accepted(seeded_app, client, auth_headers_doctor):
    """Check 19: valid non-expired medicine → accepted."""
    # inv-008 (Lignocaine HCL) expires 2026-12-31
    resp = client.post('/api/order',
                       json=make_order_payload(items=[{'medicine_id': 'inv-008', 'quantity': 1}]),
                       headers=auth_headers_doctor)
    assert resp.status_code == 201


# ── Multi-item / duplicate ────────────────────────────────────────────────────

def test_multiple_items_accepted(seeded_app, client, auth_headers_doctor):
    """Check 20: order with multiple items → accepted."""
    resp = client.post('/api/order',
                       json=make_order_payload(items=[VALID_ITEM, VALID_ITEM2]),
                       headers=auth_headers_doctor)
    assert resp.status_code == 201
    order = resp.get_json()['order']
    assert len(order['items']) == 2


def test_duplicate_medicine_id_merged(seeded_app, client, auth_headers_doctor, app):
    """Check 21: duplicate medicine_id quantities are merged deterministically."""
    # Two entries for inv-008 (45 available): 2 + 3 = 5 total, well within stock
    resp = client.post('/api/order',
                       json=make_order_payload(items=[
                           {'medicine_id': 'inv-008', 'quantity': 2},
                           {'medicine_id': 'inv-008', 'quantity': 3},
                       ]),
                       headers=auth_headers_doctor)
    assert resp.status_code == 201
    # Should be exactly one item line (merged)
    order = resp.get_json()['order']
    inv_008_lines = [i for i in order['items'] if i['inventory_id'] == 'inv-008']
    assert len(inv_008_lines) == 1
    assert inv_008_lines[0]['quantity'] == 5

    # Verify only 5 units deducted
    db.session.expire_all()
    inv = db.session.get(InventoryItem, 'inv-008')
    assert inv.quantity == 40  # 45 - 5


# ── Order properties ─────────────────────────────────────────────────────────

def test_order_id_generated(seeded_app, client, auth_headers_doctor):
    """Check 22: created order has a non-empty server-generated ID."""
    resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    assert resp.status_code == 201
    order_id = resp.get_json()['order']['id']
    assert order_id and order_id.startswith('MH-')


def test_order_starts_pending(seeded_app, client, auth_headers_doctor):
    """Check 23: new order status is 'pending'."""
    resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    assert resp.status_code == 201
    assert resp.get_json()['order']['status'] == 'pending'


def test_backend_timestamp_created(seeded_app, client, auth_headers_doctor):
    """Check 24: ordered_at is set by backend."""
    resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    assert resp.status_code == 201
    assert resp.get_json()['order']['ordered_at'] is not None


# ── Location / destination ────────────────────────────────────────────────────

def test_destination_resolved_by_backend(seeded_app, client, auth_headers_doctor):
    """Check 25: destination facility comes from backend Phase 1B resolution."""
    resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    assert resp.status_code == 201
    dest = resp.get_json()['order']['destination']
    assert dest is not None
    assert dest['facility_id'] == 'phc-chandaka'
    assert dest['latitude'] == pytest.approx(20.3512)
    assert dest['longitude'] == pytest.approx(85.7612)


def test_client_fake_nearest_facility_ignored(seeded_app, client, auth_headers_doctor):
    """Check 26: client-supplied nearest_facility_id is ignored."""
    payload = {**make_order_payload(), 'nearest_facility_id': 'phc-jatani'}
    resp = client.post('/api/order', json=payload, headers=auth_headers_doctor)
    assert resp.status_code == 201
    dest = resp.get_json()['order']['destination']
    # Coordinates near phc-chandaka → backend must select phc-chandaka, not phc-jatani
    assert dest['facility_id'] == 'phc-chandaka'


def test_inactive_facility_skipped_in_order(seeded_app, client, auth_headers_doctor, app):
    """Check 27: inactive facility is skipped; next nearest active facility is selected."""
    # Deactivate phc-chandaka
    f = db.session.get(Location, 'phc-chandaka')
    f.is_active = False
    db.session.commit()

    # Near chandaka but chandaka is inactive → should resolve to chc or phc-jatani
    resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    if resp.status_code == 201:
        dest = resp.get_json()['order']['destination']
        assert dest['facility_id'] != 'phc-chandaka'
    else:
        # May return 404 if no eligible facility is near enough
        assert resp.get_json()['error']['code'] in ('NO_ELIGIBLE_FACILITY',)


def test_no_eligible_facility_rejects_order(seeded_app, client, auth_headers_doctor):
    """Check 28: Tokyo GPS → NO_ELIGIBLE_FACILITY."""
    resp = client.post('/api/order',
                       json={**make_order_payload(), **GPS_TOKYO},
                       headers=auth_headers_doctor)
    assert resp.status_code == 404
    assert resp.get_json()['error']['code'] == 'NO_ELIGIBLE_FACILITY'


def test_invalid_gps_rejects_order(seeded_app, client, auth_headers_doctor):
    """Check 29: invalid GPS coordinates → INVALID_COORDINATES."""
    resp = client.post('/api/order',
                       json=make_order_payload(latitude=999.0, longitude=85.7),
                       headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)
    assert resp.get_json()['error']['code'] == 'INVALID_COORDINATES'


# ── Identity / JWT enforcement ────────────────────────────────────────────────

def test_doctor_identity_comes_from_jwt(seeded_app, client, auth_headers_doctor):
    """Check 30: doctor_id in JWT is used, body doctor_id ignored."""
    payload = {**make_order_payload(), 'doctor_id': 'evil-override-id'}
    resp = client.post('/api/order', json=payload, headers=auth_headers_doctor)
    assert resp.status_code == 201
    # Created order belongs to the JWT doctor (doc-001), not the body value
    assert resp.get_json()['order']['doctor_id'] == 'doc-001'


def test_body_doctor_id_cannot_override_jwt(seeded_app, client, auth_headers_doctor):
    """Check 31: body doctor_id = 'admin-001' cannot hijack order ownership."""
    payload = {**make_order_payload(), 'doctor_id': 'admin-001'}
    resp = client.post('/api/order', json=payload, headers=auth_headers_doctor)
    assert resp.status_code == 201
    assert resp.get_json()['order']['doctor_id'] != 'admin-001'


# ── Order access control ──────────────────────────────────────────────────────

def test_created_order_visible_to_owning_doctor(seeded_app, client, auth_headers_doctor):
    """Check 32: doctor can see their own order via GET /api/order/<id>."""
    create_resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    order_id = create_resp.get_json()['order']['id']

    get_resp = client.get(f'/api/order/{order_id}', headers=auth_headers_doctor)
    assert get_resp.status_code == 200
    assert get_resp.get_json()['order']['id'] == order_id


def test_another_doctor_cannot_view_order(seeded_app, client, app, auth_headers_doctor):
    """Check 33: another doctor's JWT cannot view this doctor's order."""
    from models.doctor import Doctor
    from services.auth_service import generate_token, hash_password

    # Create a third doctor (doc-002 is now in seed data; use doc-003 to avoid conflict)
    d2 = Doctor(id='doc-003', name='Dr. Other', email='other@medihawk.in',
                phone='9999999999', phc_id='phc-jatani',
                password_hash=hash_password('Test@Pass2026'))
    db.session.add(d2)
    db.session.commit()

    # Doctor1 creates an order
    create_resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    order_id = create_resp.get_json()['order']['id']

    # Doctor3 tries to access it
    token = generate_token('doc-003', 'doctor', app.config['JWT_SECRET_KEY'])
    resp = client.get(f'/api/order/{order_id}',
                      headers={'Authorization': f'Bearer {token}'})
    assert resp.status_code == 404  # not found (to not leak existence)


def test_admin_can_view_any_order(seeded_app, client, auth_headers_doctor, auth_headers_admin):
    """Check 34: admin can view doctor's order."""
    create_resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    order_id = create_resp.get_json()['order']['id']

    resp = client.get(f'/api/order/{order_id}', headers=auth_headers_admin)
    assert resp.status_code == 200


def test_unknown_order_returns_404(seeded_app, client, auth_headers_doctor):
    """Check 35: GET /api/order/<nonexistent-id> → 404."""
    resp = client.get('/api/order/MH-2026-NONEXISTENT', headers=auth_headers_doctor)
    assert resp.status_code == 404
    assert resp.get_json()['error']['code'] == 'ORDER_NOT_FOUND'


def test_pending_endpoint_returns_only_pending(seeded_app, client, auth_headers_doctor, auth_headers_admin):
    """Check 36: GET /api/orders/pending returns only pending orders."""
    # Create two orders
    client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    client.post('/api/order',
                json=make_order_payload(items=[{'medicine_id': 'inv-008', 'quantity': 1}]),
                headers=auth_headers_doctor)

    resp = client.get('/api/orders/pending', headers=auth_headers_admin)
    assert resp.status_code == 200
    orders = resp.get_json()['orders']
    assert all(o['status'] == 'pending' for o in orders)
    assert len(orders) >= 2


# ── Cancellation ──────────────────────────────────────────────────────────────

def test_cancellation_works_and_restores_stock(seeded_app, client, auth_headers_doctor, app):
    """Check 37: cancel pending order → stock restored."""
    resp = client.post('/api/order',
                       json=make_order_payload(items=[{'medicine_id': 'inv-002', 'quantity': 5}]),
                       headers=auth_headers_doctor)
    assert resp.status_code == 201
    order_id = resp.get_json()['order']['id']

    db.session.expire_all()
    qty_before_cancel = db.session.get(InventoryItem, 'inv-002').quantity  # 28 - 5 = 23

    cancel_resp = client.post(f'/api/cancel/{order_id}', headers=auth_headers_doctor)
    assert cancel_resp.status_code == 200
    assert cancel_resp.get_json()['order']['status'] == 'cancelled'

    db.session.expire_all()
    inv = db.session.get(InventoryItem, 'inv-002')
    assert inv.quantity == qty_before_cancel + 5  # restored


def test_repeated_cancellation_does_not_restore_stock_twice(seeded_app, client, auth_headers_doctor, app):
    """Check 38: idempotent cancellation — stock restored exactly once."""
    resp = client.post('/api/order',
                       json=make_order_payload(items=[{'medicine_id': 'inv-002', 'quantity': 5}]),
                       headers=auth_headers_doctor)
    order_id = resp.get_json()['order']['id']

    # Cancel once
    client.post(f'/api/cancel/{order_id}', headers=auth_headers_doctor)
    db.session.expire_all()
    qty_after_cancel = db.session.get(InventoryItem, 'inv-002').quantity

    # Cancel again — must be rejected (already cancelled)
    cancel2 = client.post(f'/api/cancel/{order_id}', headers=auth_headers_doctor)
    assert cancel2.status_code == 409
    assert cancel2.get_json()['error']['code'] == 'ORDER_NOT_CANCELLABLE'

    # Stock unchanged after second attempt
    db.session.expire_all()
    assert db.session.get(InventoryItem, 'inv-002').quantity == qty_after_cancel


def test_completed_order_cannot_be_cancelled(seeded_app, client, auth_headers_doctor,
                                              auth_headers_admin, app):
    """Check 39: verified/completed order cannot be cancelled."""
    resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    order_id = resp.get_json()['order']['id']

    # Force status to 'verified' (terminal) directly in DB
    order = db.session.get(Order, order_id)
    order.status = 'verified'
    db.session.commit()

    cancel_resp = client.post(f'/api/cancel/{order_id}', headers=auth_headers_admin)
    assert cancel_resp.status_code == 409
    assert cancel_resp.get_json()['error']['code'] == 'ORDER_NOT_CANCELLABLE'


# ── Lifecycle transitions ─────────────────────────────────────────────────────

def test_invalid_lifecycle_transition_rejected(seeded_app, client, auth_headers_doctor,
                                               auth_headers_admin, app):
    """Check 40: invalid lifecycle jump rejected."""
    resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    order_id = resp.get_json()['order']['id']

    # Cannot confirm a non-existent order
    # Actually test: pending→verified is invalid (should be pending→approved→...→verified)
    order = db.session.get(Order, order_id)
    from services.order_service import OrderError, transition_order_status
    with pytest.raises(OrderError) as exc_info:
        transition_order_status(order, 'verified', 'admin-001')
    assert exc_info.value.code == 'INVALID_ORDER_STATUS'


def test_confirm_order_transitions_to_approved(seeded_app, client, auth_headers_doctor, auth_headers_admin):
    """Admin confirm: pending → approved."""
    resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    order_id = resp.get_json()['order']['id']

    confirm_resp = client.post(f'/api/confirm/{order_id}', headers=auth_headers_admin)
    assert confirm_resp.status_code == 200
    assert confirm_resp.get_json()['order']['status'] == 'approved'


def test_doctor_cannot_confirm_order(seeded_app, client, auth_headers_doctor):
    """Doctor cannot call confirm endpoint."""
    resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    order_id = resp.get_json()['order']['id']

    confirm_resp = client.post(f'/api/confirm/{order_id}', headers=auth_headers_doctor)
    assert confirm_resp.status_code == 403


def test_stock_decremented_on_order_creation(seeded_app, client, auth_headers_doctor, app):
    """Inventory is decremented when order is created."""
    qty_before = db.session.get(InventoryItem, 'inv-002').quantity

    client.post('/api/order',
                json=make_order_payload(items=[{'medicine_id': 'inv-002', 'quantity': 3}]),
                headers=auth_headers_doctor)

    db.session.expire_all()
    qty_after = db.session.get(InventoryItem, 'inv-002').quantity
    assert qty_after == qty_before - 3


def test_get_orders_doctor_sees_own_only(seeded_app, client, auth_headers_doctor, app):
    """Doctor GET /api/orders returns only their own orders."""
    # Create order as doctor
    client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)

    resp = client.get('/api/orders', headers=auth_headers_doctor)
    assert resp.status_code == 200
    orders = resp.get_json()['orders']
    assert all(o['doctor_id'] == 'doc-001' for o in orders)


def test_get_orders_admin_sees_all(seeded_app, client, auth_headers_doctor, auth_headers_admin):
    """Admin GET /api/orders returns all orders."""
    client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    resp = client.get('/api/orders', headers=auth_headers_admin)
    assert resp.status_code == 200
    assert 'orders' in resp.get_json()


def test_order_destination_has_facility_type(seeded_app, client, auth_headers_doctor):
    """Destination block includes facility type (phc/chc)."""
    resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    assert resp.status_code == 201
    dest = resp.get_json()['order']['destination']
    assert dest['type'] in ('phc', 'chc')


def test_invalid_payload_422_has_error_body_no_order(seeded_app, client, auth_headers_doctor):
    """422 response body has error.code + error.message and no 'order' key."""
    resp = client.post('/api/order',
                       json=make_order_payload(items=[{'medicine_id': 'inv-FAKE', 'quantity': 1}]),
                       headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)
    body = resp.get_json()
    assert 'error' in body
    assert body['error']['code']
    assert body['error']['message']
    assert 'order' not in body


def test_invalid_payload_does_not_decrement_inventory(seeded_app, client, auth_headers_doctor, app):
    """When order fails (422), no inventory must be decremented (atomic rollback)."""
    with app.app_context():
        qty_before = db.session.get(InventoryItem, 'inv-002').quantity
    resp = client.post('/api/order',
                       json=make_order_payload(items=[
                           {'medicine_id': 'inv-002', 'quantity': 1},
                           {'medicine_id': 'inv-FAKE', 'quantity': 1},
                       ]),
                       headers=auth_headers_doctor)
    assert resp.status_code in (400, 422)
    with app.app_context():
        db.session.expire_all()
        qty_after = db.session.get(InventoryItem, 'inv-002').quantity
    assert qty_after == qty_before


def test_valid_payload_success_contract(seeded_app, client, auth_headers_doctor):
    """Valid payload returns success=True, server-generated MH- order ID, pending status, lowercase priority."""
    resp = client.post('/api/order', json=make_order_payload(), headers=auth_headers_doctor)
    assert resp.status_code == 201
    body = resp.get_json()
    assert body['success'] is True
    order = body['order']
    assert order['id'].startswith('MH-')
    assert order['status'] == 'pending'
    assert order['priority'] == 'urgent'


def test_duplicate_post_creates_two_distinct_orders(seeded_app, client, auth_headers_doctor, app):
    """Two sequential identical POSTs each create a distinct order with a different ID."""
    payload = make_order_payload(items=[{'medicine_id': 'inv-008', 'quantity': 1}])
    r1 = client.post('/api/order', json=payload, headers=auth_headers_doctor)
    r2 = client.post('/api/order', json=payload, headers=auth_headers_doctor)
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.get_json()['order']['id'] != r2.get_json()['order']['id']
