"""
Admin model. Admins manage orders, drones, and mission authorization.
Matches frontend User type (role='admin') in src/types/index.ts.
"""
from datetime import datetime, timezone
from extensions import db


class Admin(db.Model):
    __tablename__ = 'admins'

    id = db.Column(db.String(50), primary_key=True)            # e.g. 'admin-001'
    name = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(200), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)  # bcrypt hash, never plaintext
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    last_login_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        # is_active is never returned to the client
        return {
            'id': self.id,
            'name': self.name,
            'role': 'admin',
            'email': self.email,
        }
