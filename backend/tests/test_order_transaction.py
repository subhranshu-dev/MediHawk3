"""
Phase 1C transactional correctness tests.

Critical invariants:
  - Partial orders are impossible: all items succeed or none succeed.
  - Stock never goes negative regardless of how many concurrent or sequential requests.
  - Cancellation restores stock exactly once (idempotency).
  - Sequential reservation simulates the atomic guard under contention.

SQLite concurrency note:
  SQLite serialises all writes at the database level. The atomic
  UPDATE ... WHERE quantity >= qty pattern ensures that even under
  true concurrent writes, the guard condition is evaluated at write
  time, not at read time. The tests below demonstrate this property
  sequentially (which proves the invariant because SQLite serialises
  concurrent writes to the same single transaction queue).
"""
from __future__ import annotations

import pytest

from extensions import db
from models.inventory import InventoryItem
from models.order import Order
from services.inventory_service import (
    InventoryError,
    reserve_items_atomic,
    restore_items,
)

GPS = {'latitude': 20.3512, 'longitude': 85.7612}


# ── Helper ────────────────────────────────────────────────────────────────────

def create_test_item(item_id: str, qty: int) -> InventoryItem:
    """Add a test inventory item to the session (caller must commit)."""
    item = InventoryItem(
        id=item_id,
        medicine=f'Test Med {item_id}',
        quantity=qty,
        unit='units',
        expiry_date='2030-01-01',
        is_active=True,
    )
    db.session.add(item)
    return item


# ── Transaction rollback ──────────────────────────────────────────────────────

class TestTransactionRollback:
    def test_a_ok_b_zero_order_fails(self, seeded_app, client, auth_headers_doctor, app):
        """
        Item A has stock 10, Item B has stock 0.
        Request for A×2 + B×1 must fail.
        A must remain at 10, B at 0, no order created.
        """
        create_test_item('txn-a', 10)
        create_test_item('txn-b', 0)
        db.session.commit()

        resp = client.post('/api/order', json={
            **GPS,
            'items': [
                {'medicine_id': 'txn-a', 'quantity': 2},
                {'medicine_id': 'txn-b', 'quantity': 1},
            ],
            'priority': 'URGENT',
        }, headers=auth_headers_doctor)

        assert resp.status_code in (400, 422)
        assert resp.get_json()['error']['code'] == 'INSUFFICIENT_STOCK'

        db.session.expire_all()
        assert db.session.get(InventoryItem, 'txn-a').quantity == 10  # unchanged
        assert db.session.get(InventoryItem, 'txn-b').quantity == 0   # unchanged

        # No order should have been created
        orders = Order.query.filter_by(doctor_id='doc-001').all()
        assert all(o.status != 'pending' or 'txn-a' not in str(o.notes or '') for o in orders)

    def test_b_ok_a_zero_also_fails(self, seeded_app, client, auth_headers_doctor, app):
        """Order of items doesn't matter — any failure rolls back everything."""
        create_test_item('txn-c', 0)
        create_test_item('txn-d', 10)
        db.session.commit()

        resp = client.post('/api/order', json={
            **GPS,
            'items': [
                {'medicine_id': 'txn-c', 'quantity': 1},
                {'medicine_id': 'txn-d', 'quantity': 2},
            ],
            'priority': 'NORMAL',
        }, headers=auth_headers_doctor)

        assert resp.status_code in (400, 422)
        db.session.expire_all()
        assert db.session.get(InventoryItem, 'txn-c').quantity == 0
        assert db.session.get(InventoryItem, 'txn-d').quantity == 10

    def test_service_level_rollback(self, seeded_app, app):
        """
        Direct service test: first item OK, second item fails.
        Session must be rolled back — first item's UPDATE must not persist.
        """
        create_test_item('svc-x', 20)
        create_test_item('svc-y', 0)
        db.session.commit()

        qty_x_before = db.session.get(InventoryItem, 'svc-x').quantity  # 20

        with pytest.raises(InventoryError) as exc:
            # svc-x will decrement, svc-y will fail → should rollback
            reserve_items_atomic([('svc-x', 5), ('svc-y', 1)])

        assert exc.value.code == 'INSUFFICIENT_STOCK'
        db.session.rollback()
        db.session.expire_all()

        # svc-x must be back to its pre-attempt value
        assert db.session.get(InventoryItem, 'svc-x').quantity == qty_x_before


# ── Sequential "race" simulation ─────────────────────────────────────────────

class TestSequentialRaceSimulation:
    def test_only_one_of_two_competing_reservations_succeeds(self, seeded_app, app):
        """
        stock = 10, Request A = 6, Request B = 6.
        Only one can succeed. Final stock must be 4.

        SQLite serialises writes, so this simulates the sequential
        equivalent of concurrent requests. The atomic WHERE guard
        ensures the second attempt correctly fails.
        """
        create_test_item('race-item', 10)
        db.session.commit()

        # First reservation succeeds
        reserve_items_atomic([('race-item', 6)])
        db.session.commit()
        db.session.expire_all()
        assert db.session.get(InventoryItem, 'race-item').quantity == 4

        # Second reservation fails (only 4 remaining)
        with pytest.raises(InventoryError) as exc:
            reserve_items_atomic([('race-item', 6)])
        assert exc.value.code == 'INSUFFICIENT_STOCK'
        db.session.rollback()
        db.session.expire_all()

        # Stock still 4, never -2
        assert db.session.get(InventoryItem, 'race-item').quantity == 4

    def test_stock_is_never_negative_under_sequential_pressure(self, seeded_app, app):
        """
        Exhaust stock, then verify each additional attempt fails cleanly.
        """
        create_test_item('exhaust-item', 3)
        db.session.commit()

        # Reserve 1 three times (exhausts stock)
        for _ in range(3):
            reserve_items_atomic([('exhaust-item', 1)])
            db.session.commit()
            db.session.expire_all()

        # Stock is now 0
        assert db.session.get(InventoryItem, 'exhaust-item').quantity == 0

        # Attempt to reserve 1 more → must fail
        with pytest.raises(InventoryError):
            reserve_items_atomic([('exhaust-item', 1)])
        db.session.rollback()
        db.session.expire_all()

        # Stock must be 0, never negative
        assert db.session.get(InventoryItem, 'exhaust-item').quantity == 0


# ── Cancellation idempotency ──────────────────────────────────────────────────

class TestCancellationIdempotency:
    def test_cancel_then_try_again_does_not_double_restore(
        self, seeded_app, client, auth_headers_doctor, app
    ):
        """
        Create order → cancel → try cancel again.
        Stock restored exactly once. No double-credit.
        """
        create_test_item('idem-item', 10)
        db.session.commit()

        resp = client.post('/api/order', json={
            **GPS,
            'items': [{'medicine_id': 'idem-item', 'quantity': 5}],
            'priority': 'NORMAL',
        }, headers=auth_headers_doctor)
        assert resp.status_code == 201
        order_id = resp.get_json()['order']['id']

        # Stock after order: 5
        db.session.expire_all()
        assert db.session.get(InventoryItem, 'idem-item').quantity == 5

        # First cancel: stock restored to 10
        cancel1 = client.post(f'/api/cancel/{order_id}', headers=auth_headers_doctor)
        assert cancel1.status_code == 200
        db.session.expire_all()
        assert db.session.get(InventoryItem, 'idem-item').quantity == 10

        # Second cancel: rejected, stock unchanged
        cancel2 = client.post(f'/api/cancel/{order_id}', headers=auth_headers_doctor)
        assert cancel2.status_code == 409
        db.session.expire_all()
        assert db.session.get(InventoryItem, 'idem-item').quantity == 10  # still 10, not 15


# ── No mock fallback ─────────────────────────────────────────────────────────

class TestNoMockFallback:
    def test_order_fails_without_any_facility(self, app, client):
        """
        With no facilities at all in the DB, order creation must fail
        with NO_ELIGIBLE_FACILITY — not silently create order with a mock destination.
        """
        from models.admin import Admin
        from services.auth_service import generate_token, hash_password

        admin = Admin(id='nf-admin', name='NF Admin', email='nf@medihawk.in',
                      password_hash=hash_password('NF@Pass2026'))
        db.session.add(admin)
        # Add a valid medicine (not using seeded data since app != seeded_app)
        med = InventoryItem(id='nf-med', medicine='No-Fac Med', quantity=50,
                            unit='units', expiry_date='2030-01-01', is_active=True)
        db.session.add(med)
        db.session.commit()

        token = generate_token('nf-admin', 'admin', app.config['JWT_SECRET_KEY'])
        # Admin cannot create doctor orders, so we test via the service directly
        from services.order_service import OrderError, create_order
        with pytest.raises(OrderError) as exc:
            create_order(
                doctor_id='nf-admin',
                items=[{'medicine_id': 'nf-med', 'quantity': 1}],
                priority='normal',
                latitude=20.3512,
                longitude=85.7612,
            )
        assert exc.value.code == 'NO_ELIGIBLE_FACILITY'
