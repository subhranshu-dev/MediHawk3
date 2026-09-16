"""
Drone model. Real-time state of each drone in the fleet.
Matches frontend Drone type in src/types/index.ts.

Note: mission_id is stored as a plain string (not a FK) to avoid circular
dependency with the missions table. Referential integrity is enforced in logic.
"""
from datetime import datetime, timezone
from extensions import db


class Drone(db.Model):
    __tablename__ = 'drones'

    id = db.Column(db.String(20), primary_key=True)      # e.g. 'MH-D01'
    name = db.Column(db.String(100))                     # e.g. 'Hawk Alpha'
    status = db.Column(db.String(20), nullable=False)    # available|preparing|in_flight|returning|maintenance|offline
    lat = db.Column(db.Float, default=0.0)
    lng = db.Column(db.Float, default=0.0)
    altitude = db.Column(db.Float, default=0.0)
    speed = db.Column(db.Float, default=0.0)
    battery = db.Column(db.Float, default=100.0)
    temperature = db.Column(db.Float, default=5.8)       # payload cold-chain temperature
    gps_accuracy = db.Column(db.Float, default=1.5)      # metres
    connection = db.Column(db.String(20), default='stable')   # 'stable' | 'degraded' | 'lost'
    link_type = db.Column(db.String(20), default='4G')         # '4G' | 'ZeroTier' | 'both'
    # No FK: circular dependency with missions. Enforced in application logic.
    mission_id = db.Column(db.String(50))

    # DroneHealth sub-object — stored as flat columns
    health_motors = db.Column(db.String(10), default='ok')
    health_sensors = db.Column(db.String(10), default='ok')
    health_propellers = db.Column(db.String(10), default='ok')
    health_payload_lock = db.Column(db.String(10), default='ok')

    last_updated = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    total_missions = db.Column(db.Integer, default=0)
    flight_hours = db.Column(db.Float, default=0.0)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'name': self.name,
            'status': self.status,
            'lat': self.lat,
            'lng': self.lng,
            'altitude': self.altitude,
            'speed': self.speed,
            'battery': self.battery,
            'temperature': self.temperature,
            'gps_accuracy': self.gps_accuracy,
            'connection': self.connection,
            'link_type': self.link_type,
            'mission_id': self.mission_id,
            'health': {
                'motors': self.health_motors,
                'sensors': self.health_sensors,
                'propellers': self.health_propellers,
                'payload_lock': self.health_payload_lock,
            },
            'last_updated': self.last_updated.isoformat() + 'Z' if self.last_updated else None,
            'total_missions': self.total_missions,
            'flight_hours': self.flight_hours,
        }
