"""
Order service — Phase 1C.

Owns all order business logic:
  - creation (validate → reserve inventory → persist, single transaction)
  - lifecycle state machine (allowed transitions only)
  - cancellation with idempotent stock restoration
  - role-aware listing and single-record access

Priority normalization:
  Client may send 'EMERGENCY', 'emergency', or mixed-case.
  All are normalised to lowercase before storage.
  Only 'emergency', 'urgent', 'normal' are accepted.

Status lifecycle (uses existing project conventions):
  pending → approved  (admin confirms)
  pending → cancelled
  approved → preparing  (Phase 1D inspection)
  approved → cancelled
  preparing → launched  (Phase 1D launch — no MAVLink in Phase 1C)
  launched → in_flight
  in_flight → landing
  landing → delivered
  delivered → verified  (OTP confirmed, Phase 1E)
  verified, cancelled   → terminal (no further transitions)

Phase 1C implements: pending→approved, pending→cancelled, approved→cancelled.
All other transitions are defined in the map for future phases and will raise
OrderError('TRANSITION_NOT_IMPLEMENTED') when called in Phase 1C.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone

from extensions import db
from models.doctor import Doctor
from models.location import Location
from models.order import Order, OrderItem
from services.geo_service import find_nearest_facility, validate_coordinates
from services.inventory_service import (
    InventoryError,
    MAX_QUANTITY_PER_ITEM,
    reserve_items_atomic,
    restore_items,
    validate_item_orderable,
)

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

VALID_PRIORITIES: frozenset[str] = frozenset({'emergency', 'urgent', 'normal'})

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    'pending': {'approved', 'cancelled'},
    'approved': {'preparing', 'cancelled'},
    'preparing': {'launched'},
    'launched': {'in_flight'},
    'in_flight': {'landing'},
    'landing': {'delivered'},
    'delivered': {'verified'},
    'verified': set(),
    'cancelled': set(),
}

# Orders that can be cancelled (have not irreversibly entered flight)
CANCELLABLE_STATUSES: frozenset[str] = frozenset({'pending', 'approved'})

# Phase 1C implements only these transitions; others are guarded for future phases
PHASE_1C_TRANSITIONS: frozenset[tuple[str, str]] = frozenset({
    ('pending', 'approved'),
    ('pending', 'cancelled'),
    ('approved', 'cancelled'),
})


# ── Exceptions ────────────────────────────────────────────────────────────────

class OrderError(Exception):
    """Raised when an order operation fails validation or a business rule."""

    def __init__(self, code: str, message: str, http_status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status


# ── Order ID ─────────────────────────────────────────────────────────────────

def generate_order_id() -> str:
    """
    Generate a collision-resistant order ID: MH-YYYY-XXXXXX
    where XXXXXX is 6 uppercase hex characters from os.urandom(3).
    Approximately 16.7 million combinations per year prefix.
    """
    year = datetime.now(timezone.utc).year
    return f'MH-{year}-{secrets.token_hex(3).upper()}'


# ── Create order ─────────────────────────────────────────────────────────────

def create_order(
    doctor_id: str,
    items: list[dict],
    priority: str,
    latitude,
    longitude,
) -> Order:
    """
    Create an order for a doctor atomically.

    Flow:
      1. Validate GPS coordinates (Phase 1B geo_service)
      2. Resolve nearest active PHC/CHC (Phase 1B geo_service)
      3. Validate priority
      4. Validate and deduplicate items
      5. Validate each item against inventory (active, not expired, in stock)
      6. Atomically reserve inventory (SQL UPDATE with WHERE guard)
      7. Create Order + OrderItems in the same transaction
      8. Commit

    If any step fails, the entire transaction is rolled back and an
    OrderError is raised. No partial orders or partial reservations.

    Security:
      - doctor_id comes from the JWT; never from the request body.
      - destination is resolved by the backend; client-supplied
        'nearest_facility_id' is completely ignored.
    """
    # ── Step 1: Validate and resolve location ─────────────────────────────────
    coord_err = validate_coordinates(latitude, longitude)
    if coord_err:
        raise OrderError('INVALID_COORDINATES', 'Invalid GPS coordinates.', 422)

    try:
        facility, distance_km = find_nearest_facility(float(latitude), float(longitude))
    except ValueError as exc:
        code = str(exc)
        if code == 'NO_ELIGIBLE_FACILITY':
            raise OrderError('NO_ELIGIBLE_FACILITY',
                             'No operational facility found near your location.', 404)
        raise OrderError('LOCATION_UNAVAILABLE', 'Could not resolve nearest facility.', 503)

    # ── Step 2: Validate priority ─────────────────────────────────────────────
    priority_norm = str(priority).lower().strip()
    if priority_norm not in VALID_PRIORITIES:
        raise OrderError(
            'INVALID_PRIORITY',
            f'Priority must be one of: emergency, urgent, normal. Got: {priority!r}',
            422,
        )

    # ── Step 3: Validate items ─────────────────────────────────────────────────
    if not items:
        raise OrderError('INVALID_ITEMS', 'At least one item is required.', 422)

    # Deduplicate by medicine_id (sum quantities for repeated entries)
    seen: dict[str, int] = {}
    for idx, item in enumerate(items):
        mid = item.get('medicine_id') or item.get('id')
        if not mid or not isinstance(mid, str) or not mid.strip():
            raise OrderError('INVALID_ITEMS',
                             f'Item {idx}: medicine_id is required and must be a non-empty string.', 422)
        qty = item.get('quantity')
        if not isinstance(qty, int) or isinstance(qty, bool) or qty < 1:
            raise OrderError('INVALID_QUANTITY',
                             f'Item {idx}: quantity must be a positive integer (got {qty!r}).', 422)
        if qty > MAX_QUANTITY_PER_ITEM:
            raise OrderError('INVALID_QUANTITY',
                             f'Item {idx}: quantity {qty} exceeds maximum {MAX_QUANTITY_PER_ITEM}.', 422)
        mid = mid.strip()
        seen[mid] = seen.get(mid, 0) + qty

    # ── Step 4: Validate each unique item against inventory ────────────────────
    validated: list[tuple] = []  # (InventoryItem, merged_quantity)
    for medicine_id, total_qty in seen.items():
        try:
            inv_item = validate_item_orderable(medicine_id, total_qty)
        except InventoryError as exc:
            raise OrderError(exc.code, exc.message, 422)
        validated.append((inv_item, total_qty))

    # ── Step 5: All checks passed — begin atomic transaction ──────────────────
    try:
        # Reserve inventory (SQL UPDATE with WHERE guard — does NOT commit yet)
        reserve_items_atomic([(inv.id, qty) for inv, qty in validated])

        # Build Order record
        now = datetime.now(timezone.utc)
        order_id = generate_order_id()

        doctor = db.session.get(Doctor, doctor_id)
        doctor_name = doctor.name if doctor else ''

        order = Order(
            id=order_id,
            doctor_id=doctor_id,
            doctor_name=doctor_name,
            destination_location=facility.id,
            destination_name=facility.name,
            dest_lat=facility.lat,
            dest_lng=facility.lng,
            distance_km=round(distance_km, 3),
            priority=priority_norm,
            status='pending',
            ordered_at=now,
            created_at=now,
        )
        db.session.add(order)

        # Build OrderItem records (snapshot medicine metadata)
        for inv_item, qty in validated:
            oi = OrderItem(
                order_id=order_id,
                inventory_id=inv_item.id,
                name=inv_item.medicine,
                quantity=qty,
                category=inv_item.category,
                unit=inv_item.unit,
                temperature_required=inv_item.temperature_required,
                custom=False,
            )
            db.session.add(oi)

        db.session.commit()
        logger.info('Order created: id=%s doctor=%s facility=%s priority=%s items=%d',
                    order_id, doctor_id, facility.id, priority_norm, len(validated))
        return order

    except InventoryError as exc:
        db.session.rollback()
        raise OrderError(exc.code, exc.message, 422)
    except Exception:
        db.session.rollback()
        raise


# ── Get orders ─────────────────────────────────────────────────────────────────

def get_orders(
    role: str,
    user_id: str,
    status_filter: str | None = None,
    priority_filter: str | None = None,
) -> list[Order]:
    """
    Return orders visible to the requesting user.
    Doctor: own orders only.
    Admin: all orders, optionally filtered.
    """
    q = Order.query

    if role == 'doctor':
        q = q.filter(Order.doctor_id == user_id)
    # admin sees all by default

    if status_filter:
        q = q.filter(Order.status == status_filter.lower())
    if priority_filter:
        q = q.filter(Order.priority == priority_filter.lower())

    return q.order_by(Order.ordered_at.desc()).all()


def get_order(order_id: str, role: str, user_id: str) -> Order:
    """
    Fetch a single order.
    Doctor may only access their own orders.
    Admin may access any order.
    Returns 404 for not-found or unauthorized (to not leak existence to other doctors).
    """
    order = db.session.get(Order, order_id)
    if order is None:
        raise OrderError('ORDER_NOT_FOUND', f'Order {order_id!r} not found.', 404)
    if role == 'doctor' and order.doctor_id != user_id:
        # Return 404 rather than 403 to avoid leaking existence of another doctor's order
        raise OrderError('ORDER_NOT_FOUND', f'Order {order_id!r} not found.', 404)
    return order


# ── Lifecycle transitions ──────────────────────────────────────────────────────

def transition_order_status(order: Order, new_status: str, actor_id: str) -> Order:
    """
    Move an order to a new status, enforcing the allowed transition map.

    Raises OrderError if:
      - new_status is not reachable from the current status
      - the transition is defined but not yet implemented in Phase 1C
    """
    current = order.status
    allowed = ALLOWED_TRANSITIONS.get(current, set())

    if new_status not in allowed:
        raise OrderError(
            'INVALID_ORDER_STATUS',
            f'Cannot transition order from {current!r} to {new_status!r}. '
            f'Allowed: {sorted(allowed) or "none (terminal state)"}.',
            409,
        )

    if (current, new_status) not in PHASE_1C_TRANSITIONS:
        raise OrderError(
            'TRANSITION_NOT_IMPLEMENTED',
            f'Transition {current!r} → {new_status!r} is implemented in a later phase.',
            501,
        )

    order.status = new_status
    logger.info('Order %s status: %s → %s (actor=%s)', order.id, current, new_status, actor_id)
    return order


# ── Confirm order ──────────────────────────────────────────────────────────────

def confirm_order(order_id: str, admin_id: str) -> Order:
    """
    Admin confirms a pending order (pending → approved).
    Does NOT launch a drone. No MAVLink command is emitted.
    """
    order = db.session.get(Order, order_id)
    if order is None:
        raise OrderError('ORDER_NOT_FOUND', f'Order {order_id!r} not found.', 404)

    try:
        transition_order_status(order, 'approved', admin_id)
        db.session.commit()
        logger.info('Order confirmed by admin: order=%s admin=%s', order_id, admin_id)
        return order
    except Exception:
        db.session.rollback()
        raise


# ── Cancel order ───────────────────────────────────────────────────────────────

def cancel_order(order_id: str, role: str, user_id: str) -> Order:
    """
    Cancel an order and restore reserved inventory stock.

    Only 'pending' and 'approved' orders may be cancelled.

    Idempotency:
      Repeated cancellation is safe — the status check blocks
      re-processing because the order will already be 'cancelled'.

    Stock restoration:
      restore_items() adds back the quantities reserved at order creation.
      This happens in the same transaction as the status update.
    """
    order = db.session.get(Order, order_id)
    if order is None:
        raise OrderError('ORDER_NOT_FOUND', f'Order {order_id!r} not found.', 404)

    # Ownership check: doctor may only cancel own orders
    if role == 'doctor' and order.doctor_id != user_id:
        raise OrderError('ORDER_NOT_FOUND', f'Order {order_id!r} not found.', 404)

    if order.status not in CANCELLABLE_STATUSES:
        raise OrderError(
            'ORDER_NOT_CANCELLABLE',
            f'Order cannot be cancelled in status {order.status!r}.',
            409,
        )

    try:
        # Gather items to restore before we change status
        items_to_restore = [
            (oi.inventory_id, oi.quantity)
            for oi in order.items
            if oi.inventory_id is not None
        ]

        # Atomically mark as cancelled
        transition_order_status(order, 'cancelled', user_id)

        # Restore inventory stock
        if items_to_restore:
            restore_items(items_to_restore)

        db.session.commit()
        logger.info('Order cancelled: order=%s by %s (%s) — restored %d items',
                    order_id, user_id, role, len(items_to_restore))
        return order

    except OrderError:
        db.session.rollback()
        raise
    except Exception:
        db.session.rollback()
        raise


# ── Enrich order dict with full destination ───────────────────────────────────

def enrich_order_dict(order: Order) -> dict:
    """
    Serialize order to dict and enrich the destination block with
    facility type from the Location table.
    """
    data = order.to_dict()
    dest = data.get('destination')
    if dest and dest.get('facility_id'):
        loc = db.session.get(Location, dest['facility_id'])
        if loc:
            dest['type'] = loc.type
    return data
