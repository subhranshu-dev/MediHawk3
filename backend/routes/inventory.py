"""
Inventory routes — Phase 1C.

GET   /api/inventory          — list active inventory (any authenticated user)
GET   /api/inventory/<id>     — single item (any authenticated user)
PATCH /api/inventory/<id>     — update item (admin only)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from flask import Blueprint, g, request  # pyright: ignore[reportMissingImports]

from extensions import db
from middleware.auth import require_admin, require_auth
from models.inventory import InventoryItem
from services.inventory_service import get_all_inventory
from utils.response import error, ok

inventory_bp = Blueprint('inventory', __name__)
logger = logging.getLogger(__name__)


@inventory_bp.route('/api/inventory', methods=['GET'])
@require_auth
def list_inventory():
    """
    Return all active inventory items.
    Both doctors and admins may read inventory.
    """
    items = get_all_inventory(active_only=True)
    return ok({'inventory': [item.to_dict() for item in items], 'count': len(items)})


@inventory_bp.route('/api/inventory/<item_id>', methods=['GET'])
@require_auth
def get_inventory_item(item_id: str):
    """Fetch a single inventory item."""
    item = db.session.get(InventoryItem, item_id)
    if item is None:
        return error('MEDICINE_NOT_FOUND', f'Inventory item {item_id!r} not found.', 404)
    return ok({'item': item.to_dict()})


@inventory_bp.route('/api/inventory/<item_id>', methods=['PATCH'])
@require_admin
def update_inventory_item(item_id: str):
    """
    Admin updates an inventory item.
    Accepts: medicine, quantity, unit, temperature_required, expiry_date,
             min_threshold, is_active, category.
    Quantity may only increase/set (never directly set to negative).
    """
    item = db.session.get(InventoryItem, item_id)
    if item is None:
        return error('MEDICINE_NOT_FOUND', f'Inventory item {item_id!r} not found.', 404)

    data = request.get_json(silent=True) or {}

    # Validate and apply allowed fields
    errors: list[str] = []

    if 'quantity' in data:
        qty = data['quantity']
        if not isinstance(qty, int) or isinstance(qty, bool) or qty < 0:
            errors.append('quantity must be a non-negative integer')
        else:
            item.quantity = qty

    if 'min_threshold' in data:
        mt = data['min_threshold']
        if not isinstance(mt, int) or isinstance(mt, bool) or mt < 0:
            errors.append('min_threshold must be a non-negative integer')
        else:
            item.min_threshold = mt

    if 'medicine' in data:
        med = str(data['medicine']).strip()
        if not med:
            errors.append('medicine name cannot be empty')
        else:
            item.medicine = med

    if 'unit' in data:
        item.unit = str(data['unit']).strip() or item.unit

    if 'temperature_required' in data:
        item.temperature_required = str(data['temperature_required']).strip() or item.temperature_required

    if 'category' in data:
        item.category = str(data['category']).strip() or item.category

    if 'expiry_date' in data:
        ed = data['expiry_date']
        if ed:
            try:
                from datetime import date
                date.fromisoformat(str(ed))  # validate format
                item.expiry_date = str(ed)
            except ValueError:
                errors.append('expiry_date must be ISO format YYYY-MM-DD')
        else:
            item.expiry_date = None

    if 'is_active' in data:
        val = data['is_active']
        if not isinstance(val, bool):
            errors.append('is_active must be a boolean')
        else:
            item.is_active = val

    if errors:
        return error('INVALID_REQUEST', '; '.join(errors), 422)

    item.last_updated = datetime.now(timezone.utc)
    db.session.commit()
    logger.info('Inventory updated by admin %s: item=%s', g.user_id, item_id)
    return ok({'item': item.to_dict()})
