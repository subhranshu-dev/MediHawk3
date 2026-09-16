"""
Phase 1C inventory tests.

Covers checks 41-50:
  41. inventory list returns DB data
  42. inactive items handled correctly
  43. expired item cannot be ordered
  44. stock decreases correctly
  45. multi-item stock decreases correctly
  46. transaction rollback restores all stock
  47. low-stock threshold computed correctly
  48. negative stock impossible
  49. unauthorized doctor cannot modify inventory
  50. admin inventory modification validated
"""
from __future__ import annotations

import pytest

from extensions import db
from models.inventory import InventoryItem
from services.inventory_service import (
    InventoryError,
    _is_expired,
    get_all_inventory,
    reserve_items_atomic,
    restore_items,
    validate_item_orderable,
)

# Seed reference data (from seed.py):
# inv-002: Snakebite Antivenin, 28 vials, valid to 2026-11-30
# inv-003: Hepatitis B Vaccine, 156 doses, valid to 2026-12-31
# inv-004: Magnesium Sulfate, 84 vials, valid to 2026-10-15
# inv-008: Lignocaine HCL, 45 ampoules, valid to 2026-12-31
# inv-001: Oxytocin, 42 vials, EXPIRED 2026-08-15


# ── is_expired unit tests ─────────────────────────────────────────────────────

def test_is_expired_past_date():
    assert _is_expired('2020-01-01') is True

def test_is_expired_future_date():
    assert _is_expired('2030-01-01') is False

def test_is_expired_today_is_valid():
    from datetime import date
    today = date.today().isoformat()
    assert _is_expired(today) is False   # expires today → still valid

def test_is_expired_none_is_valid():
    assert _is_expired(None) is False

def test_is_expired_empty_is_valid():
    assert _is_expired('') is False


# ── get_all_inventory unit tests ──────────────────────────────────────────────

class TestGetAllInventory:
    def test_returns_active_items(self, seeded_app):
        """Check 41: inventory list returns real DB data."""
        items = get_all_inventory(active_only=True)
        assert len(items) >= 8  # at least the 8 seeded items

    def test_inactive_item_excluded(self, seeded_app):
        """Check 42: inactive items excluded from active list."""
        inv = db.session.get(InventoryItem, 'inv-002')
        inv.is_active = False
        db.session.commit()

        items = get_all_inventory(active_only=True)
        ids = [i.id for i in items]
        assert 'inv-002' not in ids

    def test_inactive_item_included_when_all(self, seeded_app):
        inv = db.session.get(InventoryItem, 'inv-002')
        inv.is_active = False
        db.session.commit()

        items = get_all_inventory(active_only=False)
        ids = [i.id for i in items]
        assert 'inv-002' in ids


# ── validate_item_orderable unit tests ────────────────────────────────────────

class TestValidateItemOrderable:
    def test_valid_item_returns_inventory_item(self, seeded_app):
        result = validate_item_orderable('inv-002', 5)
        assert result.id == 'inv-002'

    def test_not_found_raises(self, seeded_app):
        with pytest.raises(InventoryError) as exc:
            validate_item_orderable('inv-FAKE', 1)
        assert exc.value.code == 'MEDICINE_NOT_FOUND'

    def test_inactive_raises(self, seeded_app):
        """Check 42 (service level): inactive → MEDICINE_INACTIVE."""
        inv = db.session.get(InventoryItem, 'inv-002')
        inv.is_active = False
        db.session.commit()
        with pytest.raises(InventoryError) as exc:
            validate_item_orderable('inv-002', 1)
        assert exc.value.code == 'MEDICINE_INACTIVE'

    def test_expired_raises(self, seeded_app):
        """Check 43: expired item cannot be ordered."""
        with pytest.raises(InventoryError) as exc:
            validate_item_orderable('inv-001', 1)   # Oxytocin: expired 2026-08-15
        assert exc.value.code == 'MEDICINE_EXPIRED'

    def test_insufficient_stock_raises(self, seeded_app):
        with pytest.raises(InventoryError) as exc:
            validate_item_orderable('inv-002', 9999)  # way more than 28 available
        assert exc.value.code == 'INSUFFICIENT_STOCK'

    def test_exact_quantity_passes(self, seeded_app):
        result = validate_item_orderable('inv-002', 28)  # exactly 28 available
        assert result is not None


# ── reserve_items_atomic unit tests ──────────────────────────────────────────

class TestReserveItemsAtomic:
    def test_single_item_stock_decreases(self, seeded_app):
        """Check 44: stock decreases correctly after reservation."""
        qty_before = db.session.get(InventoryItem, 'inv-002').quantity
        reserve_items_atomic([('inv-002', 3)])
        db.session.commit()
        db.session.expire_all()
        qty_after = db.session.get(InventoryItem, 'inv-002').quantity
        assert qty_after == qty_before - 3

    def test_multi_item_stock_decreases(self, seeded_app):
        """Check 45: multi-item stock decreases correctly."""
        qty2 = db.session.get(InventoryItem, 'inv-002').quantity
        qty8 = db.session.get(InventoryItem, 'inv-008').quantity
        reserve_items_atomic([('inv-002', 2), ('inv-008', 5)])
        db.session.commit()
        db.session.expire_all()
        assert db.session.get(InventoryItem, 'inv-002').quantity == qty2 - 2
        assert db.session.get(InventoryItem, 'inv-008').quantity == qty8 - 5

    def test_atomic_failure_rolls_back(self, seeded_app):
        """Check 46: if one item fails, the whole reservation rolls back."""
        qty2_before = db.session.get(InventoryItem, 'inv-002').quantity

        with pytest.raises(InventoryError):
            # inv-002 is fine, inv-FAKE doesn't exist → will fail
            reserve_items_atomic([('inv-002', 2), ('inv-FAKE', 1)])

        db.session.rollback()
        db.session.expire_all()
        # inv-002 stock must be unchanged (partial UPDATE rolled back)
        assert db.session.get(InventoryItem, 'inv-002').quantity == qty2_before

    def test_negative_stock_impossible_via_service(self, seeded_app):
        """Check 48: cannot reserve more than available → no negative stock."""
        inv = db.session.get(InventoryItem, 'inv-002')
        available = inv.quantity

        with pytest.raises(InventoryError) as exc:
            reserve_items_atomic([('inv-002', available + 1)])
        assert exc.value.code == 'INSUFFICIENT_STOCK'

        db.session.rollback()
        db.session.expire_all()
        assert db.session.get(InventoryItem, 'inv-002').quantity == available  # unchanged


# ── restore_items unit tests ──────────────────────────────────────────────────

class TestRestoreItems:
    def test_restore_increases_stock(self, seeded_app):
        qty_before = db.session.get(InventoryItem, 'inv-002').quantity
        reserve_items_atomic([('inv-002', 5)])
        db.session.commit()

        db.session.expire_all()
        qty_after_reserve = db.session.get(InventoryItem, 'inv-002').quantity
        assert qty_after_reserve == qty_before - 5

        restore_items([('inv-002', 5)])
        db.session.commit()
        db.session.expire_all()
        assert db.session.get(InventoryItem, 'inv-002').quantity == qty_before


# ── Low-stock threshold ───────────────────────────────────────────────────────

class TestLowStockThreshold:
    def test_low_stock_status_computed(self, seeded_app):
        """Check 47: low-stock threshold flagged correctly in to_dict."""
        inv = InventoryItem(
            id='test-threshold', medicine='Test Med', quantity=5,
            unit='vials', expiry_date='2030-01-01', min_threshold=10,
            is_active=True,
        )
        db.session.add(inv)
        db.session.commit()

        item_dict = inv.to_dict()
        # quantity=5 <= min_threshold=10 → critical
        assert item_dict['status'] == 'critical'

    def test_normal_stock_status(self, seeded_app):
        inv = InventoryItem(
            id='test-normal', medicine='Normal Med', quantity=50,
            unit='vials', expiry_date='2030-01-01', min_threshold=10,
            is_active=True,
        )
        db.session.add(inv)
        db.session.commit()
        item_dict = inv.to_dict()
        assert item_dict['status'] == 'in_stock'

    def test_expired_status(self, seeded_app):
        inv = InventoryItem(
            id='test-expired', medicine='Expired Med', quantity=50,
            unit='vials', expiry_date='2020-01-01', min_threshold=5,
            is_active=True,
        )
        db.session.add(inv)
        db.session.commit()
        assert inv.to_dict()['status'] == 'expired'

    def test_inactive_status(self, seeded_app):
        inv = InventoryItem(
            id='test-inactive', medicine='Inactive Med', quantity=50,
            unit='vials', expiry_date='2030-01-01', min_threshold=5,
            is_active=False,
        )
        db.session.add(inv)
        db.session.commit()
        assert inv.to_dict()['status'] == 'inactive'


# ── API tests ─────────────────────────────────────────────────────────────────

class TestInventoryAPI:
    def test_inventory_list_returns_db_data(self, seeded_app, client, auth_headers_doctor):
        """Check 41 (API level): GET /api/inventory returns real data."""
        resp = client.get('/api/inventory', headers=auth_headers_doctor)
        assert resp.status_code == 200
        inv = resp.get_json()['inventory']
        assert len(inv) >= 8
        ids = [i['id'] for i in inv]
        assert 'inv-002' in ids

    def test_unauthenticated_cannot_list_inventory(self, client, seeded_app):
        resp = client.get('/api/inventory')
        assert resp.status_code == 401

    def test_inactive_not_in_active_list(self, seeded_app, client, auth_headers_admin, app):
        """Check 42 (API): inactive items excluded from list."""
        inv = db.session.get(InventoryItem, 'inv-002')
        inv.is_active = False
        db.session.commit()

        resp = client.get('/api/inventory', headers=auth_headers_admin)
        ids = [i['id'] for i in resp.get_json()['inventory']]
        assert 'inv-002' not in ids

    def test_admin_can_update_inventory(self, seeded_app, client, auth_headers_admin, app):
        """Check 50: admin updates inventory item."""
        resp = client.patch('/api/inventory/inv-002',
                            json={'quantity': 100},
                            headers=auth_headers_admin)
        assert resp.status_code == 200
        assert resp.get_json()['item']['quantity'] == 100

    def test_doctor_cannot_modify_inventory(self, seeded_app, client, auth_headers_doctor):
        """Check 49: doctor cannot modify inventory."""
        resp = client.patch('/api/inventory/inv-002',
                            json={'quantity': 999},
                            headers=auth_headers_doctor)
        assert resp.status_code == 403

    def test_admin_cannot_set_negative_quantity(self, seeded_app, client, auth_headers_admin):
        """Check 48 (API): admin cannot set negative quantity."""
        resp = client.patch('/api/inventory/inv-002',
                            json={'quantity': -5},
                            headers=auth_headers_admin)
        assert resp.status_code == 422

    def test_admin_deactivate_item(self, seeded_app, client, auth_headers_admin):
        resp = client.patch('/api/inventory/inv-002',
                            json={'is_active': False},
                            headers=auth_headers_admin)
        assert resp.status_code == 200
        assert resp.get_json()['item']['is_active'] is False

    def test_patch_nonexistent_item(self, seeded_app, client, auth_headers_admin):
        resp = client.patch('/api/inventory/inv-FAKE',
                            json={'quantity': 10},
                            headers=auth_headers_admin)
        assert resp.status_code == 404
