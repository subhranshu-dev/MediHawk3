"""
Drone service — Phase 1A stub.

CRITICAL SAFETY BOUNDARY:
No function in this file may issue real MAVLink commands until Phase 2+
with APP_MODE == 'live'. The architecture ensures this:

    frontend → authenticated API → mission_service (safety gate) → drone_service → MAVProxy
                                                                                     ↑
                                                                          Phase 2+ ONLY

Any attempt to call the real command functions without APP_MODE == 'live'
must raise DroneCommandNotAllowed.
"""
from __future__ import annotations


class DroneCommandNotAllowed(RuntimeError):
    """Raised when a real drone command is attempted outside LIVE mode."""


def _require_live_mode(app_mode: str) -> None:
    """Safety gate. Call this before every real hardware command."""
    if app_mode != 'live':
        raise DroneCommandNotAllowed(
            f'Real drone commands are disabled in APP_MODE={app_mode!r}. '
            'Set APP_MODE=live in .env to enable (Phase 2+ only).'
        )


# ── Phase 1A stubs (no real commands) ────────────────────────────────────────

def get_drone_status(drone_id: str | None = None) -> list[dict]:
    """Stub. Phase 1H reads real status from MAVProxy telemetry thread."""
    raise NotImplementedError('Real drone status implemented in Phase 1H.')


def send_emergency_rtl(drone_id: str, app_mode: str) -> None:
    """
    Send Emergency Return-To-Launch command.
    REQUIRES app_mode == 'live' (Phase 2+).
    """
    _require_live_mode(app_mode)
    # Phase 2: pymavlink RTL command via MAVProxy bridge
    raise NotImplementedError('RTL command implemented in Phase 2.')


def send_hold(drone_id: str, app_mode: str) -> None:
    """Send hover/hold command. REQUIRES app_mode == 'live'."""
    _require_live_mode(app_mode)
    raise NotImplementedError('Hold command implemented in Phase 2.')


def send_resume(drone_id: str, app_mode: str) -> None:
    """Resume mission from hold. REQUIRES app_mode == 'live'."""
    _require_live_mode(app_mode)
    raise NotImplementedError('Resume command implemented in Phase 2.')
