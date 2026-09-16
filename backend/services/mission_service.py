"""
Mission service — Phase 1A stub.

This is the safety gate between the web API and drone_service.
Every launch path must pass through this service's validation checks.
Phase 1G implements the full state machine.
"""
from __future__ import annotations


# ── Safety thresholds (authoritative constants) ────────────────────────────────
# These match Phase-0 contract safety instruments.
# Decision: launch battery minimum set at 50% (Phase-0 Risk R5 / §12).
BATTERY_MINIMUM_PERCENT: float = 50.0
TEMPERATURE_WARNING_CELSIUS: float = 8.0
TEMPERATURE_CRITICAL_CELSIUS: float = 12.0
GEOFENCE_RADIUS_METRES: float = 50.0  # delivery verification geofence


def validate_launch_preconditions(order: object, drone: object, weather: dict) -> list[str]:
    """
    Stub. Phase 1G runs all safety checks:
      - battery > BATTERY_MINIMUM_PERCENT
      - drone.status == 'available'
      - drone.gps == 'locked'
      - all mandatory inspection checks pass
      - weather.safe == True
    Returns list of failure reasons (empty = pass).
    """
    raise NotImplementedError('Launch precondition checks implemented in Phase 1G.')


def create_mission(order_id: str, drone_id: str, admin_id: str) -> dict:
    """
    Stub. Phase 1G creates the Mission record and arms the drone.
    NEVER calls drone_service unless in LIVE mode.
    """
    raise NotImplementedError('Mission creation implemented in Phase 1G.')
