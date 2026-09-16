"""
Order and OrderItem models.
Matches Phase-0 contract §10 and frontend Order/OrderItem types in src/types/index.ts.

Security note: the 'otp' column stores a bcrypt hash, never the plaintext OTP.
The plaintext is returned once at order creation and never stored.
"""
from datetime import datetime, timezone
from extensions import db


class Order(db.Model):
    __tablename__ = 'orders'

    id = db.Column(db.String(50), primary_key=True)              # e.g. 'MH-2026-00421'
    doctor_id = db.Column(db.String(50), db.ForeignKey('doctors.id'), nullable=False)
    doctor_name = db.Column(db.String(200))
    from_location = db.Column(db.String(50), db.ForeignKey('locations.id'))
    destination_location = db.Column(db.String(50), db.ForeignKey('locations.id'))
    from_location_name = db.Column(db.String(200))
    destination_name = db.Column(db.String(200))
    medicine = db.Column(db.String(500))                         # summary string for display
    quantity = db.Column(db.Integer)
    unit = db.Column(db.String(50))
    priority = db.Column(db.String(20), nullable=False)          # emergency|urgent|normal
    status = db.Column(db.String(20), nullable=False, default='pending')
    drone_id = db.Column(db.String(20))                          # set when drone assigned at launch
    inspection_done = db.Column(db.Boolean, default=False)
    qr_verified = db.Column(db.Boolean, default=False)           # kept for schema compatibility
    temperature = db.Column(db.Float, default=0.0)               # payload temp at delivery
    ordered_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    launched_at = db.Column(db.DateTime)
    delivered_at = db.Column(db.DateTime)
    delivery_time_minutes = db.Column(db.Integer)
    notes = db.Column(db.Text)
    # bcrypt hash of the 6-digit OTP — never store or return plaintext after creation
    otp_hash = db.Column(db.String(255))
    receiver_verified = db.Column(db.Boolean, default=False)
    receiver_name = db.Column(db.String(200))
    authorized_by = db.Column(db.String(50))                     # admin ID who authorized launch
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    # Destination coordinates snapshot — Phase 1B resolution result stored at order creation
    dest_lat = db.Column(db.Float)
    dest_lng = db.Column(db.Float)
    distance_km = db.Column(db.Float)   # distance from doctor's device to facility at order time

    doctor = db.relationship('Doctor', foreign_keys=[doctor_id], lazy='select')
    items = db.relationship('OrderItem', back_populates='order', lazy='select', cascade='all, delete-orphan')

    def to_dict(self, include_otp_plaintext: str | None = None) -> dict:
        """
        Serialize to dict matching frontend Order type.
        include_otp_plaintext: pass the plaintext OTP only at order creation time.
        """
        data: dict = {
            'id': self.id,
            'doctor_id': self.doctor_id,
            'doctor_name': self.doctor_name or '',
            'from_location': self.from_location or '',
            'from_location_name': self.from_location_name or '',
            'destination_location': self.destination_location or '',
            'destination_name': self.destination_name or '',
            'medicine': self.medicine or '',
            'quantity': self.quantity or 0,
            'unit': self.unit or '',
            'priority': self.priority,
            'status': self.status,
            'drone_id': self.drone_id,
            'inspection_done': self.inspection_done,
            'qr_verified': self.qr_verified,
            'temperature': self.temperature,
            'ordered_at': self.ordered_at.isoformat() + 'Z' if self.ordered_at else None,
            'launched_at': self.launched_at.isoformat() + 'Z' if self.launched_at else None,
            'delivered_at': self.delivered_at.isoformat() + 'Z' if self.delivered_at else None,
            'delivery_time_minutes': self.delivery_time_minutes,
            'notes': self.notes,
            'receiver_verified': self.receiver_verified,
            'items': [item.to_dict() for item in (self.items or [])],
            'destination': self._destination_dict(),
        }
        # OTP plaintext is returned ONLY at creation, never from DB reads
        if include_otp_plaintext:
            data['otp'] = include_otp_plaintext
        return data

    def _destination_dict(self) -> dict | None:
        if not self.destination_location:
            return None
        return {
            'facility_id': self.destination_location,
            'name': self.destination_name or '',
            'type': '',             # enriched by route/service from Location record
            'latitude': self.dest_lat,
            'longitude': self.dest_lng,
            'distance_km': self.distance_km,
        }


class OrderItem(db.Model):
    __tablename__ = 'order_items'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    order_id = db.Column(db.String(50), db.ForeignKey('orders.id'), nullable=False)
    # inventory_id links back to the inventory record for audit traceability
    inventory_id = db.Column(db.String(50), db.ForeignKey('inventory.id'))
    name = db.Column(db.String(200), nullable=False)
    quantity = db.Column(db.Integer, default=1)
    category = db.Column(db.String(100))
    unit = db.Column(db.String(50))
    temperature_required = db.Column(db.String(50))   # snapshot at order time
    custom = db.Column(db.Boolean, default=False)

    order = db.relationship('Order', back_populates='items')

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'inventory_id': self.inventory_id,
            'name': self.name,
            'quantity': self.quantity,
            'category': self.category or '',
            'unit': self.unit or '',
            'temperature_required': self.temperature_required or '',
            'custom': self.custom,
        }
