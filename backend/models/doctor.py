"""
Doctor model. FK → locations (phc_id).
Matches frontend User type (role='doctor') in src/types/index.ts.

verification_status lifecycle:
  pending   — registered, awaiting admin review
  verified  — admin approved; may log in and use the system
  rejected  — admin rejected; login blocked with DOCTOR_VERIFICATION_REJECTED
  suspended — admin suspended after previous approval; login blocked
"""
from datetime import datetime, timezone
from extensions import db

VERIFICATION_STATUSES = ('pending', 'verified', 'rejected', 'suspended')


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
    verification_status = db.Column(db.String(20), default='pending', nullable=False)
    medical_registration_no = db.Column(db.String(100), unique=True, nullable=True)
    verified_at = db.Column(db.DateTime, nullable=True)
    verified_by_admin_id = db.Column(db.String(50), db.ForeignKey('admins.id'), nullable=True)
    verification_notes = db.Column(db.Text, nullable=True)
    last_login_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    phc = db.relationship('Location', foreign_keys=[phc_id], lazy='select')
    verified_by = db.relationship('Admin', foreign_keys=[verified_by_admin_id], lazy='select')

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
            'verification_status': self.verification_status,
            'medical_registration_no': self.medical_registration_no,
        }
