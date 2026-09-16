"""
Inventory service — Phase 1C.

Owns all inventory business logic:
  - item validation (active, not expired, sufficient stock)
  - atomic reservation (decrement with SQL WHERE guard)
  - stock restoration (idempotent, used on cancellation)
  - inventory listing for API responses

Transaction contract:
  reserve_items_atomic() issues SQL UPDATEs but does NOT commit.
  The caller (order_service.create_order) must commit or rollback.
  restore_items() likewise does not commit.
"""
from __future__ import annotations

import logging
from datetime import date

from sqlalchemy import text

from extensions import db
from models.inventory import InventoryItem

logger = logging.getLogger(__name__)

# Maximum orderable quantity per item line (safety upper bound)
MAX_QUANTITY_PER_ITEM: int = 500


class InventoryError(Exception):
    """Raised when an inventory validation or reservation fails."""

    def __init__(self, code: str, message: str, item_id: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.item_id = item_id


def _is_expired(expiry_date_str: str | None) -> bool:
    """
    Return True if the medicine has expired before today.
    Expiry policy: a medicine expiring today is still valid.
    A medicine whose expiry_date < today is expired.
    """
    if not expiry_date_str:
        return False
    try:
        return date.fromisoformat(expiry_date_str) < date.today()
    except ValueError:
        return False


def get_all_inventory(active_only: bool = True) -> list[InventoryItem]:
    """Return all inventory items, optionally filtered to active only."""
    q = InventoryItem.query
    if active_only:
        q = q.filter(InventoryItem.is_active == True)  # noqa: E712
    return q.order_by(InventoryItem.medicine).all()


def validate_item_orderable(item_id: str, quantity: int) -> InventoryItem:
    """
    Validate that an inventory item exists, is active, not expired, and
    has enough stock for the requested quantity.

    Returns the InventoryItem on success.
    Raises InventoryError on any failure.

    This is a READ-ONLY check. The actual stock decrement happens in
    reserve_items_atomic().
    """
    item = db.session.get(InventoryItem, item_id)
    if item is None:
        raise InventoryError(
            'MEDICINE_NOT_FOUND',
            f'Medicine not found: {item_id!r}',
            item_id,
        )
    if not item.is_active:
        raise InventoryError(
            'MEDICINE_INACTIVE',
            f'Medicine is not available: {item.medicine!r}',
            item_id,
        )
    if _is_expired(item.expiry_date):
        raise InventoryError(
            'MEDICINE_EXPIRED',
            f'Medicine has expired: {item.medicine!r} (expiry: {item.expiry_date})',
            item_id,
        )
    if item.quantity < quantity:
        raise InventoryError(
            'INSUFFICIENT_STOCK',
            f'Insufficient stock for {item.medicine!r}: '
            f'requested {quantity}, available {item.quantity}',
            item_id,
        )
    return item


def reserve_items_atomic(items: list[tuple[str, int]]) -> None:
    """
    Atomically decrement inventory for a list of (item_id, quantity) pairs.

    Uses a conditional SQL UPDATE:
        UPDATE inventory
        SET quantity = quantity - :qty
        WHERE id = :id
          AND quantity >= :qty
          AND is_active = 1

    If ANY item's UPDATE does not affect exactly 1 row, raises InventoryError.
    The session is NOT committed — the caller must commit or rollback.

    This pattern is safe under concurrent requests because SQLite serialises
    writes and the WHERE guard prevents double-spend even when two requests
    pass the initial read-based validation simultaneously.
    """
    for item_id, qty in items:
        result = db.session.execute(
            text(
                'UPDATE inventory '
                'SET quantity = quantity - :qty '
                'WHERE id = :id '
                '  AND quantity >= :qty '
                '  AND is_active = 1'
            ),
            {'id': item_id, 'qty': qty},
        )
        if result.rowcount != 1:
            raise InventoryError(
                'INSUFFICIENT_STOCK',
                f'Stock unavailable for item {item_id!r} — reservation failed.',
                item_id,
            )
        logger.debug('Reserved %d units of %s', qty, item_id)


def restore_items(items: list[tuple[str, int]]) -> None:
    """
    Restore stock for a list of (item_id, quantity) pairs (used on cancellation).

    Does NOT commit. The caller must commit.

    Idempotency: the calling code must ensure restore_items is only called
    once per cancellation. The order_service.cancel_order() enforces this by
    atomically transitioning the order to 'cancelled' before restoring stock,
    so a second cancellation attempt is blocked by the status check.
    """
    for item_id, qty in items:
        db.session.execute(
            text('UPDATE inventory SET quantity = quantity + :qty WHERE id = :id'),
            {'id': item_id, 'qty': qty},
        )
        logger.debug('Restored %d units of %s', qty, item_id)
