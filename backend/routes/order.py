"""
Order routes — Phase 1C.

POST  /api/order              — doctor creates an order (JWT required, role=doctor)
GET   /api/orders             — list orders (role-aware)
GET   /api/orders/pending     — pending orders only (admin)
GET   /api/order/<id>         — single order (owner or admin)
POST  /api/confirm/<id>       — admin confirms pending order
POST  /api/cancel/<id>        — doctor cancels own / admin cancels any

Security rules enforced here:
  - Role comes exclusively from JWT (g.user_role). Never from request body.
  - Doctor identity comes from JWT (g.user_id). Never from request body.
  - Backend independently resolves destination via Phase 1B geo_service.
    Client-supplied 'nearest_facility_id' is silently discarded.
"""
from __future__ import annotations

import logging

from flask import Blueprint, g, request

from middleware.auth import require_admin, require_auth, require_doctor
from services.order_service import (
    OrderError,
    cancel_order,
    confirm_order,
    enrich_order_dict,
    get_order,
    get_orders,
    create_order,
)
from utils.response import created, error, ok

order_bp = Blueprint('order', __name__)
logger = logging.getLogger(__name__)


# ── POST /api/order ───────────────────────────────────────────────────────────

@order_bp.route('/api/order', methods=['POST'])
@require_doctor
def create_order_route():
    """
    Doctor creates a new order.

    Request:
        {
            "items": [{"medicine_id": "inv-002", "quantity": 2}],
            "priority": "EMERGENCY" | "URGENT" | "NORMAL",
            "latitude": <float>,
            "longitude": <float>
        }

    - 'nearest_facility_id' in body is ignored — backend calculates independently.
    - 'doctor_id' in body is ignored — identity comes from JWT.
    """
    data = request.get_json(silent=True) or {}

    # Extract validated fields; ignore 'doctor_id' and 'nearest_facility_id'
    items = data.get('items')
    priority = data.get('priority', '')
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    patient_age_raw = data.get('patient_age')
    patient_age: int | None = None
    if patient_age_raw is not None:
        try:
            patient_age = int(patient_age_raw)
        except (TypeError, ValueError):
            from utils.response import error as err_resp
            return err_resp('INVALID_PATIENT_AGE', 'patient_age must be an integer.', 422)

    # Handle client-side location error signals
    loc_err = data.get('location_error')
    if loc_err:
        from services.geo_service import validate_coordinates  # noqa (already imported below)
        _ERR_MAP = {
            'permission_denied': ('LOCATION_PERMISSION_REQUIRED',
                                  'Location permission denied.', 403),
            'unavailable': ('LOCATION_UNAVAILABLE',
                            'Device location unavailable.', 503),
        }
        mapped = _ERR_MAP.get(loc_err, ('LOCATION_UNAVAILABLE', 'Location unavailable.', 503))
        return error(*mapped)

    # doctor_id comes ONLY from JWT — body value discarded
    doctor_id = g.user_id

    try:
        order = create_order(
            doctor_id=doctor_id,
            items=items if isinstance(items, list) else [],
            priority=priority,
            latitude=latitude,
            longitude=longitude,
            patient_age=patient_age,
        )
    except OrderError as exc:
        return error(exc.code, exc.message, exc.http_status)

    return created({'order': enrich_order_dict(order)})


# ── GET /api/orders ───────────────────────────────────────────────────────────

@order_bp.route('/api/orders', methods=['GET'])
@require_auth
def list_orders():
    """
    List orders. Doctors see only their own; admins see all.
    Optional query params: status, priority.
    """
    status_filter = request.args.get('status')
    priority_filter = request.args.get('priority')

    orders = get_orders(
        role=g.user_role,
        user_id=g.user_id,
        status_filter=status_filter,
        priority_filter=priority_filter,
    )
    return ok({'orders': [enrich_order_dict(o) for o in orders]})


# ── GET /api/orders/pending ───────────────────────────────────────────────────

@order_bp.route('/api/orders/pending', methods=['GET'])
@require_admin
def pending_orders():
    """Admin: list all orders in 'pending' status."""
    orders = get_orders(role='admin', user_id=g.user_id, status_filter='pending')
    return ok({'orders': [enrich_order_dict(o) for o in orders]})


# ── GET /api/order/<id> ───────────────────────────────────────────────────────

@order_bp.route('/api/order/<order_id>', methods=['GET'])
@require_auth
def get_single_order(order_id: str):
    """
    Fetch a single order.
    Doctor sees only own orders (404 returned for others' orders to avoid leaking existence).
    Admin sees any order.
    """
    try:
        order = get_order(order_id, role=g.user_role, user_id=g.user_id)
    except OrderError as exc:
        return error(exc.code, exc.message, exc.http_status)

    return ok({'order': enrich_order_dict(order)})


# ── POST /api/confirm/<id> ────────────────────────────────────────────────────

@order_bp.route('/api/confirm/<order_id>', methods=['POST'])
@require_admin
def confirm_order_route(order_id: str):
    """
    Admin confirms a pending order (pending → approved).
    Does NOT launch a drone. No MAVLink command.
    """
    try:
        order = confirm_order(order_id, admin_id=g.user_id)
    except OrderError as exc:
        return error(exc.code, exc.message, exc.http_status)

    return ok({'order': enrich_order_dict(order)})


# ── POST /api/cancel/<id> ─────────────────────────────────────────────────────

@order_bp.route('/api/cancel/<order_id>', methods=['POST'])
@require_auth
def cancel_order_route(order_id: str):
    """
    Cancel an order and restore reserved stock.
    Doctor may cancel own pending/approved orders.
    Admin may cancel any cancellable order.
    """
    try:
        order = cancel_order(order_id, role=g.user_role, user_id=g.user_id)
    except OrderError as exc:
        return error(exc.code, exc.message, exc.http_status)

    return ok({'order': enrich_order_dict(order), 'message': 'Order cancelled successfully.'})
