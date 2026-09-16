"""
Inventory model. Tracks medicine stock levels at the hub.
Matches frontend InventoryItem type in src/types/index.ts.
"""
from datetime import datetime, timezone
from extensions import db


class InventoryItem(db.Model):
    __tablename__ = 'inventory'

    id = db.Column(db.String(50), primary_key=True)            # e.g. 'inv-001'
    medicine = db.Column(db.String(200), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=0)
    unit = db.Column(db.String(50))
    temperature_required = db.Column(db.String(50))            # e.g. '2-8°C', '<25°C'
    expiry_date = db.Column(db.String(20))                     # ISO date string
    status = db.Column(db.String(20))  # 'in_stock' | 'low_stock' | 'critical' | 'expiring'
    category = db.Column(db.String(100))
    min_threshold = db.Column(db.Integer, default=0)
    last_updated = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    # is_active=False marks decommissioned/withdrawn medicines; they cannot be ordered
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default='1')

    def to_dict(self) -> dict:
        from datetime import date
        threshold = self.min_threshold or 0
        qty = self.quantity or 0
        # Compute effective status: reflect actual stock/expiry/active state
        if not self.is_active:
            effective_status = 'inactive'
        elif self.expiry_date and date.fromisoformat(self.expiry_date) < date.today():
            effective_status = 'expired'
        elif qty <= 0:
            effective_status = 'out_of_stock'
        elif threshold and qty <= threshold:
            effective_status = 'critical'
        elif threshold and qty <= threshold * 2:
            effective_status = 'low_stock'
        else:
            effective_status = self.status or 'in_stock'
        return {
            'id': self.id,
            'medicine': self.medicine,
            'quantity': self.quantity,
            'unit': self.unit or '',
            'temperature_required': self.temperature_required or '',
            'expiry_date': self.expiry_date or '',
            'status': effective_status,
            'category': self.category or '',
            'min_threshold': threshold,
            'is_active': self.is_active,
        }
