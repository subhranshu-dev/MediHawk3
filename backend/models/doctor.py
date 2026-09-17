"""
Doctor model. FK → locations (phc_id).
Matches frontend User type (role='doctor') in src/types/index.ts.
"""
from datetime import datetime, timezone
from extensions import db


class Doctor(db.Model):
    __tablename__ = 'doctors'

    id = db.Column(db.String(50), primary_key=True)           # e.g. 'doc-001'
    name = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(200), unique=True)
    phone = db.Column(db.String(20), unique=True)
    phc_id = db.Column(db.String(50), db.ForeignKey('locations.id'))
    password_hash = db.Column(db.String(255))                  # bcrypt hash, never plaintext
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    email_verified = db.Column(db.Boolean, default=False, nullable=False)
    last_login_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    phc = db.relationship('Location', foreign_keys=[phc_id], lazy='select')

    def to_dict(self) -> dict:
        # is_active and email_verified are never returned to the client
        return {
            'id': self.id,
            'name': self.name,
            'role': 'doctor',
            'email': self.email,
            'phone': self.phone,
            'phc': self.phc_id,
            'phc_name': self.phc.name if self.phc else None,
        }
