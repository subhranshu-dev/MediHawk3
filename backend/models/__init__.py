# Import all models here so SQLAlchemy discovers them during create_all().
# Keep this list in dependency order (referenced tables before referencing tables).
from .location import Location       # no FK deps
from .doctor import Doctor           # FK → locations
from .admin import Admin             # no FK deps
from .inventory import InventoryItem # no FK deps
from .drone import Drone             # no FK deps (mission_id stored as plain string to avoid circular FK)
from .order import Order, OrderItem  # FK → locations, doctors
from .mission import Mission         # FK → orders
from .invitation import DoctorInvitation  # FK → locations, admins, doctors
from .audit import (                 # supporting audit/log tables
    Alert,
    InspectionRecord,
    TelemetryLog,
    TemperatureLog,
    OTPSession,
)

__all__ = [
    'Location',
    'Doctor',
    'Admin',
    'InventoryItem',
    'Drone',
    'Order',
    'OrderItem',
    'Mission',
    'DoctorInvitation',
    'Alert',
    'InspectionRecord',
    'TelemetryLog',
    'TemperatureLog',
    'OTPSession',
]
