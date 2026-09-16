"""
Location model — hub, PHC, and CHC sites.
Matches Phase-0 contract §15 and frontend Location type in src/types/index.ts.
"""
from datetime import datetime, timezone
from extensions import db


class Location(db.Model):
    __tablename__ = 'locations'

    id = db.Column(db.String(50), primary_key=True)   # e.g. 'hub-01', 'phc-chandaka'
    name = db.Column(db.String(200), nullable=False)
    type = db.Column(db.String(10), nullable=False)    # 'hub' | 'phc' | 'chc'
    district = db.Column(db.String(100))
    lat = db.Column(db.Float)
    lng = db.Column(db.Float)
    contact = db.Column(db.String(100))
    address = db.Column(db.Text)
    # doctor_id set as plain string; circular FK avoided (doctor references location)
    doctor_id = db.Column(db.String(50))
    # is_active=False marks decommissioned sites; only active sites are eligible for delivery
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default='1')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'district': self.district or '',
            'lat': self.lat,
            'lng': self.lng,
            'contact': self.contact or '',
            'address': self.address or '',
            'doctor': self.doctor_id,
            'is_active': self.is_active,
        }
