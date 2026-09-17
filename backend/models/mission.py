"""
Mission model. Tracks an active or completed drone delivery mission.
Matches Phase-0 contract §15 and frontend Mission type in src/types/index.ts.
"""
import math
from datetime import datetime
from extensions import db

# Waypoint labels for the interpolated route
_WP_LABELS = ['Hub Takeoff', 'Waypoint Alpha', 'Waypoint Beta', 'Waypoint Gamma', 'Destination']
_WP_ALTITUDES = [0.0, 80.0, 82.0, 75.0, 0.0]
_N_WAYPOINTS = 5


def _resolve_location_name(lat: float | None, lng: float | None) -> str:
    """Return the name of the nearest seeded Location, or a default string."""
    if lat is None or lng is None:
        return 'Unknown'
    try:
        from models.location import Location
        locations = Location.query.all()
        if not locations:
            return 'Unknown'
        best = min(
            locations,
            key=lambda loc: math.hypot((loc.lat or 0) - lat, (loc.lng or 0) - lng),
        )
        return best.name
    except Exception:
        return 'Unknown'


def _compute_waypoints(
    from_lat: float, from_lng: float,
    to_lat: float, to_lng: float,
    elapsed_minutes: float, eta_minutes: float,
    from_name: str, to_name: str,
) -> list[dict]:
    """
    Compute N deterministic interpolated waypoints between origin and destination.
    Progress fraction determines which waypoints are marked reached.
    """
    if eta_minutes and eta_minutes > 0:
        progress = min(1.0, max(0.0, elapsed_minutes / eta_minutes))
    else:
        progress = 0.0

    labels = list(_WP_LABELS)
    labels[0] = from_name
    labels[-1] = to_name

    waypoints = []
    for i in range(_N_WAYPOINTS):
        t = i / (_N_WAYPOINTS - 1)
        lat = from_lat + (to_lat - from_lat) * t
        lng = from_lng + (to_lng - from_lng) * t
        alt = _WP_ALTITUDES[i]
        reached = t <= progress
        wp: dict = {
            'index': i,
            'lat': round(lat, 6),
            'lng': round(lng, 6),
            'altitude': alt,
            'label': labels[i],
            'reached': reached,
        }
        if reached:
            wp['reached_at'] = None  # actual timestamp not stored per-waypoint
        waypoints.append(wp)
    return waypoints


class Mission(db.Model):
    __tablename__ = 'missions'

    id = db.Column(db.String(50), primary_key=True)              # e.g. 'MSN-2026-00421'
    order_id = db.Column(db.String(50), db.ForeignKey('orders.id'), nullable=False)
    drone_id = db.Column(db.String(20), nullable=False)          # references drones.id (no FK, see Drone model)
    from_lat = db.Column(db.Float)
    from_lng = db.Column(db.Float)
    to_lat = db.Column(db.Float)
    to_lng = db.Column(db.Float)
    distance_km = db.Column(db.Float)
    eta_minutes = db.Column(db.Integer)
    elapsed_minutes = db.Column(db.Float, default=0.0)
    status = db.Column(db.String(30), nullable=False)
    # pending_approval|approved|preparing|in_flight|landing|delivered|returning|completed|aborted
    medicine = db.Column(db.String(500))
    quantity = db.Column(db.Integer)
    priority = db.Column(db.String(20))
    launched_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)

    order = db.relationship('Order', foreign_keys=[order_id], lazy='select')

    def to_dict(self) -> dict:
        from_name = _resolve_location_name(self.from_lat, self.from_lng)
        to_name = _resolve_location_name(self.to_lat, self.to_lng)
        waypoints = _compute_waypoints(
            self.from_lat or 0.0, self.from_lng or 0.0,
            self.to_lat or 0.0, self.to_lng or 0.0,
            self.elapsed_minutes or 0.0,
            float(self.eta_minutes or 1),
            from_name, to_name,
        )
        return {
            'id': self.id,
            'order_id': self.order_id,
            'drone_id': self.drone_id,
            'from_lat': self.from_lat,
            'from_lng': self.from_lng,
            'from_location': from_name,
            'to_lat': self.to_lat,
            'to_lng': self.to_lng,
            'to_location': to_name,
            'distance_km': self.distance_km,
            'eta_minutes': self.eta_minutes,
            'elapsed_minutes': self.elapsed_minutes,
            'status': self.status,
            'medicine': self.medicine or '',
            'quantity': self.quantity,
            'priority': self.priority,
            'launched_at': self.launched_at.isoformat() + 'Z' if self.launched_at else None,
            'completed_at': self.completed_at.isoformat() + 'Z' if self.completed_at else None,
            'waypoints': waypoints,
            'events': [],  # MissionEvent table is Phase 1G+
        }
