"""
DoctorInvitation model.

Admin-issued single-use invitation codes that gate doctor signup.

Security properties:
  - raw code is NEVER stored; only HMAC-SHA256 hex digest persisted as code_hash
  - codes are cryptographically random (secrets.token_hex(32))
  - single-use: used_by_doctor_id set on first valid use; rejected thereafter
  - facility-bound: phc_id authoritative from the invitation, not the client
  - revocable: admin can set revoked=True before use
  - time-limited: expires_at enforced at verification time
  - brute-force resistant: constant-time comparison in route layer
"""
from datetime import datetime, timezone
from extensions import db


class DoctorInvitation(db.Model):
    __tablename__ = 'doctor_invitations'

    id = db.Column(db.String(50), primary_key=True)
    code_hash = db.Column(db.String(128), nullable=False, unique=True)
    facility_id = db.Column(db.String(50), db.ForeignKey('locations.id'), nullable=False)
    created_by_admin_id = db.Column(db.String(50), db.ForeignKey('admins.id'), nullable=False)
    used_by_doctor_id = db.Column(db.String(50), db.ForeignKey('doctors.id'), nullable=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime, nullable=True)
    revoked = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    facility = db.relationship('Location', foreign_keys=[facility_id], lazy='select')
    created_by = db.relationship('Admin', foreign_keys=[created_by_admin_id], lazy='select')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'facility_id': self.facility_id,
            'facility_name': self.facility.name if self.facility else None,
            'created_by_admin_id': self.created_by_admin_id,
            'used': self.used_by_doctor_id is not None,
            'revoked': self.revoked,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'used_at': self.used_at.isoformat() if self.used_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
