"""
Mission model. Tracks an active or completed drone delivery mission.
Matches Phase-0 contract §15 and frontend Mission type in src/types/index.ts.
"""
from datetime import datetime
from extensions import db


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
        return {
            'id': self.id,
            'order_id': self.order_id,
            'drone_id': self.drone_id,
            'from_lat': self.from_lat,
            'from_lng': self.from_lng,
            'to_lat': self.to_lat,
            'to_lng': self.to_lng,
            'distance_km': self.distance_km,
            'eta_minutes': self.eta_minutes,
            'elapsed_minutes': self.elapsed_minutes,
            'status': self.status,
            'medicine': self.medicine or '',
            'quantity': self.quantity,
            'priority': self.priority,
            'launched_at': self.launched_at.isoformat() + 'Z' if self.launched_at else None,
            'completed_at': self.completed_at.isoformat() + 'Z' if self.completed_at else None,
        }
