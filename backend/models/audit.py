"""
Audit, logging, and session models.
Includes: Alert, InspectionRecord, TelemetryLog, TemperatureLog, OTPSession.
Matches Phase-0 contract §15.
"""
from datetime import datetime, timezone
from extensions import db


class Alert(db.Model):
    __tablename__ = 'alerts'

    id = db.Column(db.String(50), primary_key=True)
    severity = db.Column(db.String(20))   # critical | warning | info
    category = db.Column(db.String(30))   # temperature|connection|battery|weather|mission|inventory|system
    title = db.Column(db.String(300))
    description = db.Column(db.Text)
    recommended_action = db.Column(db.Text)
    mission_id = db.Column(db.String(50))
    drone_id = db.Column(db.String(20))
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    acknowledged = db.Column(db.Boolean, default=False)
    acknowledged_by = db.Column(db.String(50))
    acknowledged_at = db.Column(db.DateTime)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'severity': self.severity,
            'category': self.category,
            'title': self.title,
            'description': self.description,
            'recommended_action': self.recommended_action,
            'mission_id': self.mission_id,
            'drone_id': self.drone_id,
            'timestamp': self.timestamp.isoformat() + 'Z' if self.timestamp else None,
            'acknowledged': self.acknowledged,
        }


class InspectionRecord(db.Model):
    """Stores the result of each pre-flight inspection check for an order."""
    __tablename__ = 'inspection_records'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    order_id = db.Column(db.String(50), db.ForeignKey('orders.id'))
    drone_id = db.Column(db.String(20))
    # check_id must match the INSPECTION_CHECKS IDs in Phase-0 §11:
    # propeller, airframe, battery_mount, medicine, quantity, expiry,
    # temperature, sealed, mounted, battery, gps, weather, 4g, zerotier
    check_id = db.Column(db.String(50))
    label = db.Column(db.String(200))
    status = db.Column(db.String(20))  # pass | warning | blocked | pending
    detail = db.Column(db.Text)
    mandatory = db.Column(db.Boolean, default=True)
    checked_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            'id': self.check_id,
            'label': self.label,
            'status': self.status,
            'detail': self.detail or '',
            'mandatory': self.mandatory,
        }


class TelemetryLog(db.Model):
    """Persistent telemetry history. High-frequency inserts — keep rows lean."""
    __tablename__ = 'telemetry_log'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    drone_id = db.Column(db.String(20), index=True)
    mission_id = db.Column(db.String(50), index=True)
    timestamp = db.Column(db.DateTime, nullable=False, index=True)
    lat = db.Column(db.Float)
    lng = db.Column(db.Float)
    altitude = db.Column(db.Float)
    speed = db.Column(db.Float)
    battery = db.Column(db.Float)
    temperature = db.Column(db.Float)
    heading = db.Column(db.Float)
    gps_accuracy = db.Column(db.Float)

    def to_dict(self) -> dict:
        return {
            'timestamp': self.timestamp.isoformat() + 'Z' if self.timestamp else None,
            'lat': self.lat,
            'lng': self.lng,
            'altitude': self.altitude,
            'speed': self.speed,
            'battery': self.battery,
            'temperature': self.temperature,
            'heading': self.heading,
            'gps_accuracy': self.gps_accuracy,
        }


class TemperatureLog(db.Model):
    """Cold-chain temperature audit trail for a mission/order."""
    __tablename__ = 'temperature_log'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    order_id = db.Column(db.String(50), db.ForeignKey('orders.id'), index=True)
    mission_id = db.Column(db.String(50), index=True)
    timestamp = db.Column(db.DateTime, nullable=False)
    temperature = db.Column(db.Float)
    event = db.Column(db.String(200))  # 'Payload loaded' | 'Launch' | None

    def to_dict(self) -> dict:
        return {
            'timestamp': self.timestamp.isoformat() + 'Z' if self.timestamp else None,
            'temperature': self.temperature,
            'event': self.event,
        }


class OTPSession(db.Model):
    """
    Stores hashed OTPs for email-based authentication.
    Plaintext OTP is NEVER stored — only a keyed HMAC-SHA256 digest.

    Fields added in Phase 1E:
        attempts         — number of failed verify attempts (brute-force protection)
        consumed_at      — timestamp when session was used or invalidated
        request_count    — total times OTP was requested in this session chain
        last_request_at  — timestamp of last request (resend cooldown enforcement)
    """
    __tablename__ = 'otp_sessions'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    contact = db.Column(db.String(200), nullable=False, index=True)  # normalized email
    code_hash = db.Column(db.String(255), nullable=False)             # HMAC-SHA256 hex
    purpose = db.Column(db.String(50))   # 'login_doctor' | 'login_admin' | 'password_reset'
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False)
    # Phase 1E additions
    attempts = db.Column(db.Integer, default=0, nullable=False)
    consumed_at = db.Column(db.DateTime, nullable=True)
    request_count = db.Column(db.Integer, default=1, nullable=False)
    last_request_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    # Phase 1E security: binds OTP session to the authenticated account's ID
    # Prevents cross-account OTP confusion in edge cases (e.g. email re-assignment)
    user_id = db.Column(db.String(50), nullable=True, index=True)
