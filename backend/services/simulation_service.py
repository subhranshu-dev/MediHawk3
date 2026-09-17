"""
Simulation service — advances drone/mission state deterministically.

Called on every admin API request via _sim_advance().
All state mutations are based on real DB records; no in-memory state is kept
between calls, so the function is safe to call from any request context.
"""
from __future__ import annotations

import logging
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from extensions import db
from models import Alert, Drone, Mission, Order, TelemetryLog

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

ADVANCE_INTERVAL_SECONDS: int = 30

# Cold-chain: payload drifts toward ambient temperature
_AMBIENT_CELSIUS: float = 26.0

# Cruise parameters
_CRUISE_ALTITUDE_M: float = 120.0
_CRUISE_SPEED_MS: float = 15.0

# Demo mission seed values
_HUB_LAT: float = 20.2961
_HUB_LNG: float = 85.8189
_PHC_CHANDAKA_LAT: float = 20.3512
_PHC_CHANDAKA_LNG: float = 85.7612
_DEMO_ETA_MINUTES: int = 18
_DEMO_MISSION_ID: str = 'MSN-DEMO-001'
_DEMO_ORDER_ID: str = 'ORD-DEMO-001'
_DEMO_DRONE_ID: str = 'MH-D01'
_DEMO_DOCTOR_ID: str = 'doc-001'


# ── Geometry helpers ───────────────────────────────────────────────────────────

def compute_drone_position(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    fraction: float,
) -> tuple[float, float]:
    """
    Linear interpolation between two waypoints.
    fraction=0.0 → start, fraction=1.0 → end. Clamped to [0, 1].
    """
    fraction = max(0.0, min(1.0, fraction))
    lat = from_lat + (to_lat - from_lat) * fraction
    lng = from_lng + (to_lng - from_lng) * fraction
    return lat, lng


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Approximate great-circle distance in km."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(a))


def _heading(from_lat: float, from_lng: float, to_lat: float, to_lng: float) -> float:
    """Approximate bearing from point A to point B in degrees (0–360)."""
    dlng = to_lng - from_lng
    dlat = to_lat - from_lat
    return math.degrees(math.atan2(dlng, dlat)) % 360.0


# ── Internal helpers ───────────────────────────────────────────────────────────

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_tz(dt: Optional[datetime]) -> Optional[datetime]:
    """Attach UTC tz-info to a naive datetime, or return None if dt is None."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _last_telemetry_ts(mission_id: str) -> Optional[datetime]:
    row = (
        TelemetryLog.query
        .filter_by(mission_id=mission_id)
        .order_by(TelemetryLog.timestamp.desc())
        .first()
    )
    return _ensure_tz(row.timestamp) if row else None


def _dedup_alert_exists(drone_id: str, category: str) -> bool:
    """Return True if an unacknowledged alert of this category already exists for the drone."""
    return Alert.query.filter_by(
        drone_id=drone_id,
        category=category,
        acknowledged=False,
    ).first() is not None


def _make_alert(
    severity: str,
    category: str,
    title: str,
    description: str,
    recommended_action: str,
    drone_id: Optional[str] = None,
    mission_id: Optional[str] = None,
) -> Alert:
    alert = Alert(
        id=f'ALT-{uuid.uuid4().hex[:12].upper()}',
        severity=severity,
        category=category,
        title=title,
        description=description,
        recommended_action=recommended_action,
        drone_id=drone_id,
        mission_id=mission_id,
        timestamp=_utc_now(),
        acknowledged=False,
    )
    db.session.add(alert)
    return alert


# ── Alert threshold checks ─────────────────────────────────────────────────────

def _check_alerts(drone: Drone, mission: Optional[Mission]) -> None:
    """
    Evaluate battery and temperature thresholds.
    Deduplicates: no new alert created if an unacknowledged alert of the same
    category already exists for this drone.
    """
    mid = mission.id if mission else None

    # Battery: critical if < 20 %
    if drone.battery < 20.0 and not _dedup_alert_exists(drone.id, 'battery'):
        _make_alert(
            severity='critical',
            category='battery',
            title=f'Critical battery — {drone.name}',
            description=(
                f'{drone.name} battery is at {drone.battery:.1f}%. '
                'Immediate return-to-launch recommended.'
            ),
            recommended_action='Initiate Return-to-Launch (RTL) immediately.',
            drone_id=drone.id,
            mission_id=mid,
        )

    # Temperature: critical > 12 °C, warning > 8 °C
    if drone.temperature > 12.0:
        if not _dedup_alert_exists(drone.id, 'temperature'):
            _make_alert(
                severity='critical',
                category='temperature',
                title=f'Cold-chain breach — {drone.name}',
                description=(
                    f'Payload temperature {drone.temperature:.1f}°C exceeds the 12°C '
                    'critical threshold. Payload integrity at risk.'
                ),
                recommended_action='Abort mission immediately. Payload may be compromised.',
                drone_id=drone.id,
                mission_id=mid,
            )
    elif drone.temperature > 8.0:
        if not _dedup_alert_exists(drone.id, 'temperature'):
            _make_alert(
                severity='warning',
                category='temperature',
                title=f'Temperature warning — {drone.name}',
                description=(
                    f'Payload temperature {drone.temperature:.1f}°C approaching '
                    'the 12°C critical limit.'
                ),
                recommended_action='Monitor payload temperature closely. Prepare contingency.',
                drone_id=drone.id,
                mission_id=mid,
            )


# ── Single-mission advance ─────────────────────────────────────────────────────

def _advance_mission(mission: Mission, now: datetime) -> None:
    """Advance physics for one active mission by one time step."""
    drone: Optional[Drone] = db.session.get(Drone, mission.drone_id)
    if drone is None:
        logger.warning('sim: drone %s not found for mission %s', mission.drone_id, mission.id)
        return

    # ── Determine how many minutes to advance ─────────────────────────────────
    last_ts = _last_telemetry_ts(mission.id)
    if last_ts is not None:
        elapsed_since_s = (now - last_ts).total_seconds()
        if elapsed_since_s < ADVANCE_INTERVAL_SECONDS:
            return  # not time yet
        advance_minutes = elapsed_since_s / 60.0
    else:
        # First telemetry row — use time since launch (or a small seed step)
        launched = _ensure_tz(mission.launched_at)
        if launched:
            advance_minutes = (now - launched).total_seconds() / 60.0
        else:
            advance_minutes = 0.5

    # Guard against huge jumps (e.g. server restart after hours)
    advance_minutes = min(advance_minutes, 3.0)

    eta = mission.eta_minutes or _DEMO_ETA_MINUTES
    old_elapsed = mission.elapsed_minutes or 0.0
    new_elapsed = old_elapsed + advance_minutes
    fraction = new_elapsed / eta if eta > 0 else 1.0

    # ── Phase transition ───────────────────────────────────────────────────────
    if fraction >= 1.0:
        # Mission delivered; drone enters returning state
        if mission.status not in ('delivered', 'returning', 'completed'):
            mission.status = 'delivered'
            mission.completed_at = now
        drone.status = 'returning'
        drone.mission_id = None
        mission.elapsed_minutes = new_elapsed
        db.session.flush()
        return

    if fraction < 0.1:
        phase = 'preparing'
    elif fraction < 0.85:
        phase = 'in_flight'
    else:
        phase = 'landing'

    # ── Position & kinematics ──────────────────────────────────────────────────
    if phase == 'preparing':
        lat, lng = mission.from_lat, mission.from_lng
        altitude = 0.0
        speed = 0.0
    elif phase == 'in_flight':
        # fraction within the 0.1–0.85 window → 0–1
        flight_frac = (fraction - 0.1) / 0.75
        lat, lng = compute_drone_position(
            mission.from_lat, mission.from_lng,
            mission.to_lat, mission.to_lng,
            flight_frac,
        )
        altitude = _CRUISE_ALTITUDE_M
        speed = _CRUISE_SPEED_MS
    else:
        # landing: fraction 0.85–1.0
        lat, lng = mission.to_lat, mission.to_lng
        descent_frac = (fraction - 0.85) / 0.15  # 0→1
        altitude = _CRUISE_ALTITUDE_M * (1.0 - descent_frac)
        speed = _CRUISE_SPEED_MS * (1.0 - descent_frac)

    # ── Battery drain: 0.15 % per minute of flight ────────────────────────────
    battery_drain = 0.15 * advance_minutes if phase != 'preparing' else 0.0
    new_battery = max(0.0, drone.battery - battery_drain)

    # ── Temperature drift toward ambient: ±0.2 °C per advance cycle ──────────
    if drone.temperature < _AMBIENT_CELSIUS:
        new_temp = drone.temperature + 0.2
    else:
        new_temp = drone.temperature - 0.2

    # ── Heading ───────────────────────────────────────────────────────────────
    hdg = _heading(
        mission.from_lat, mission.from_lng,
        mission.to_lat, mission.to_lng,
    )

    # ── Persist drone state ───────────────────────────────────────────────────
    drone.lat = lat
    drone.lng = lng
    drone.altitude = altitude
    drone.speed = speed
    drone.battery = new_battery
    drone.temperature = new_temp
    # DroneStatus contract: available|preparing|in_flight|returning|maintenance|offline
    # 'landing' is a MissionStatus only — map it to 'in_flight' for the drone
    drone.status = 'in_flight' if phase == 'landing' else phase
    drone.last_updated = now

    # ── Persist mission state ─────────────────────────────────────────────────
    mission.elapsed_minutes = new_elapsed
    if mission.status != phase:
        mission.status = phase

    # ── Write telemetry log row ───────────────────────────────────────────────
    telem = TelemetryLog(
        drone_id=drone.id,
        mission_id=mission.id,
        timestamp=now,
        lat=lat,
        lng=lng,
        altitude=altitude,
        speed=speed,
        battery=new_battery,
        temperature=new_temp,
        heading=hdg,
        gps_accuracy=drone.gps_accuracy or 1.5,
    )
    db.session.add(telem)

    # ── Alert checks ──────────────────────────────────────────────────────────
    _check_alerts(drone, mission)

    db.session.flush()


# ── Returning drones ───────────────────────────────────────────────────────────

def _advance_returning(now: datetime) -> None:
    """
    After a mission is delivered, the drone enters 'returning'.
    After 5 minutes return window, mark it available at the hub.
    """
    returning = Drone.query.filter_by(status='returning').all()
    for drone in returning:
        if drone.mission_id is not None:
            # Still assigned — wait for _advance_mission to clear it
            continue

        # Use last telemetry to estimate when return started
        last_row = (
            TelemetryLog.query
            .filter_by(drone_id=drone.id)
            .order_by(TelemetryLog.timestamp.desc())
            .first()
        )
        if last_row:
            last_ts = _ensure_tz(last_row.timestamp)
            if last_ts and (now - last_ts).total_seconds() > 300:
                _mark_available(drone, now)
        else:
            _mark_available(drone, now)


def _mark_available(drone: Drone, now: datetime) -> None:
    drone.status = 'available'
    drone.lat = _HUB_LAT
    drone.lng = _HUB_LNG
    drone.altitude = 0.0
    drone.speed = 0.0
    drone.last_updated = now


# ── Public API ─────────────────────────────────────────────────────────────────

def _sim_advance() -> None:
    """
    Advance all active missions by one simulation step.
    Designed to be called at the start of every admin API request.
    Silently swallows errors so it never breaks the calling endpoint.
    """
    try:
        now = _utc_now()
        active_statuses = ('preparing', 'in_flight', 'landing')
        missions = Mission.query.filter(Mission.status.in_(active_statuses)).all()

        for mission in missions:
            _advance_mission(mission, now)

        _advance_returning(now)

        db.session.commit()
    except Exception as exc:  # pylint: disable=broad-except
        db.session.rollback()
        logger.error('_sim_advance error: %s', exc, exc_info=True)

    # Ensure a demo mission is always active when simulation mode is idle
    from flask import current_app
    if current_app.config.get('APP_MODE') == 'simulation':
        ensure_demo_mission()


def ensure_demo_mission() -> None:
    """
    Ensure a demo in-flight mission exists so the admin dashboard is never empty.
    Creates MSN-DEMO-001 with MH-D01 flying hub-01 → phc-chandaka.
    Only runs if there are no active missions in the DB.
    Silently no-ops if drone or demo doctor is unavailable.
    """
    try:
        active_statuses = ('preparing', 'in_flight', 'landing')
        if Mission.query.filter(Mission.status.in_(active_statuses)).count() > 0:
            return  # Real missions running — no demo needed

        drone: Optional[Drone] = db.session.get(Drone, _DEMO_DRONE_ID)
        if drone is None or drone.status not in ('available',):
            return

        now = _utc_now()

        # Create or reuse demo order (requires a valid doctor FK)
        demo_order: Optional[Order] = db.session.get(Order, _DEMO_ORDER_ID)
        if demo_order is None:
            # Use seeded doctor-001 as placeholder. If it doesn't exist, skip demo.
            from models import Doctor  # local import to avoid circular at module load
            if not db.session.get(Doctor, _DEMO_DOCTOR_ID):
                logger.info('ensure_demo_mission: demo doctor %s not found, skipping', _DEMO_DOCTOR_ID)
                return

            demo_order = Order(
                id=_DEMO_ORDER_ID,
                doctor_id=_DEMO_DOCTOR_ID,
                doctor_name='Dr. Priya Mohanty',
                medicine='Oral Rehydration Salts',
                quantity=10,
                unit='packets',
                priority='urgent',
                status='approved',
                from_location='hub-01',
                destination_location='phc-chandaka',
                from_location_name='MediHawk Central Hub',
                destination_name='PHC Chandaka',
                dest_lat=_PHC_CHANDAKA_LAT,
                dest_lng=_PHC_CHANDAKA_LNG,
                distance_km=_haversine_km(_HUB_LAT, _HUB_LNG, _PHC_CHANDAKA_LAT, _PHC_CHANDAKA_LNG),
            )
            db.session.add(demo_order)
            db.session.flush()

        # Create or reactivate the demo mission
        demo_mission: Optional[Mission] = db.session.get(Mission, _DEMO_MISSION_ID)
        start_elapsed = 2.0  # begin at 2 min elapsed (11% of 18 min → in_flight)

        if demo_mission is None:
            demo_mission = Mission(
                id=_DEMO_MISSION_ID,
                order_id=_DEMO_ORDER_ID,
                drone_id=_DEMO_DRONE_ID,
                from_lat=_HUB_LAT,
                from_lng=_HUB_LNG,
                to_lat=_PHC_CHANDAKA_LAT,
                to_lng=_PHC_CHANDAKA_LNG,
                distance_km=_haversine_km(_HUB_LAT, _HUB_LNG, _PHC_CHANDAKA_LAT, _PHC_CHANDAKA_LNG),
                eta_minutes=_DEMO_ETA_MINUTES,
                elapsed_minutes=start_elapsed,
                status='in_flight',
                medicine='Oral Rehydration Salts',
                quantity=10,
                priority='urgent',
                launched_at=now - timedelta(minutes=start_elapsed),
            )
            db.session.add(demo_mission)
        else:
            # Reactivate a previously completed demo mission
            demo_mission.status = 'in_flight'
            demo_mission.elapsed_minutes = start_elapsed
            demo_mission.launched_at = now - timedelta(minutes=start_elapsed)
            demo_mission.completed_at = None

        # Set drone into flight
        drone.status = 'in_flight'
        drone.mission_id = _DEMO_MISSION_ID
        drone.lat = _HUB_LAT
        drone.lng = _HUB_LNG
        drone.altitude = _CRUISE_ALTITUDE_M
        drone.speed = _CRUISE_SPEED_MS
        drone.last_updated = now

        db.session.commit()
        logger.info('ensure_demo_mission: demo mission %s activated', _DEMO_MISSION_ID)
    except Exception as exc:  # pylint: disable=broad-except
        db.session.rollback()
        logger.error('ensure_demo_mission error: %s', exc, exc_info=True)
