"""
Admin routes — Phase 1F+.

All endpoints require a valid JWT with role='admin'.
Role is resolved from the JWT exclusively — never from request body.

Endpoints:
    GET  /api/admin/dashboard
    GET  /api/admin/orders
    GET  /api/admin/missions
    GET  /api/admin/missions/active
    GET  /api/admin/missions/<mission_id>
    GET  /api/admin/fleet
    GET  /api/admin/alerts
    POST /api/admin/alerts/<alert_id>/acknowledge
    POST /api/admin/alerts/<alert_id>/resolve
    GET  /api/admin/telemetry/<drone_id>
    GET  /api/admin/readiness/<drone_id>
    POST /api/admin/drone/<drone_id>/rtl
    POST /api/admin/drone/<drone_id>/hold
    POST /api/admin/drone/<drone_id>/resume
    GET  /api/admin/priority-queue
    GET  /api/admin/command-center
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from flask import Blueprint, g, request

from middleware.auth import require_admin
from extensions import db
from models import Alert, Drone, Mission, Order, TelemetryLog, TemperatureLog
from services.simulation_service import _sim_advance
from utils.response import error, ok

admin_bp = Blueprint('admin', __name__)
logger = logging.getLogger(__name__)

_ACTIVE_STATUSES = ('preparing', 'in_flight', 'landing')


# ── Helpers ────────────────────────────────────────────────────────────────────

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _priority_score(order: Order) -> float:
    """Numeric priority score for queue sorting. Higher = more urgent."""
    base = {'emergency': 3, 'urgent': 2, 'normal': 1}.get(
        (order.priority or 'normal').lower(), 1
    )
    ordered_at = order.ordered_at
    if ordered_at is not None:
        if ordered_at.tzinfo is None:
            ordered_at = ordered_at.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - ordered_at).total_seconds() / 3600.0
    else:
        age_hours = 0.0
    return base + age_hours * 0.1


def _readiness_checks(drone: Drone) -> tuple[list[dict], str]:
    """
    Run 7-check pre-flight readiness evaluation.
    Returns (checks_list, overall) where overall is 'go'|'warning'|'no_go'.
    """
    checks: list[dict] = []
    has_fail = False
    has_warning = False

    def _check(cid: str, label: str, status: str, detail: str) -> None:
        nonlocal has_fail, has_warning
        checks.append({'id': cid, 'label': label, 'status': status, 'detail': detail})
        if status == 'fail':
            has_fail = True
        elif status == 'warning':
            has_warning = True

    # 1. Battery
    bat = drone.battery or 0.0
    if bat >= 50.0:
        _check('battery', 'Battery', 'pass', f'{bat:.0f}% — sufficient for mission.')
    elif bat >= 20.0:
        _check('battery', 'Battery', 'warning', f'{bat:.0f}% — below 50% recommended minimum.')
    else:
        _check('battery', 'Battery', 'fail', f'{bat:.0f}% — critically low. Charge before launch.')

    # 2. GPS Accuracy
    gps = drone.gps_accuracy or 99.0
    if gps <= 2.0:
        _check('gps', 'GPS Accuracy', 'pass', f'{gps:.1f}m accuracy — locked.')
    elif gps <= 5.0:
        _check('gps', 'GPS Accuracy', 'warning', f'{gps:.1f}m accuracy — degraded signal.')
    else:
        _check('gps', 'GPS Accuracy', 'fail', f'{gps:.1f}m accuracy — GPS not locked.')

    # 3. Payload Temperature
    temp = drone.temperature or 0.0
    if temp <= 8.0:
        _check('temperature', 'Payload Temperature', 'pass', f'{temp:.1f}°C — within cold-chain range.')
    elif temp <= 12.0:
        _check('temperature', 'Payload Temperature', 'warning',
               f'{temp:.1f}°C — approaching 12°C critical limit.')
    else:
        _check('temperature', 'Payload Temperature', 'fail',
               f'{temp:.1f}°C — exceeds cold-chain limit. Do not launch.')

    # 4. Connection / Data Link
    conn = (drone.connection or 'unknown').lower()
    if conn == 'stable':
        _check('connection', 'Data Link', 'pass', f'Link {drone.link_type or "4G"} — stable.')
    elif conn == 'degraded':
        _check('connection', 'Data Link', 'warning', 'Data link degraded. Monitor closely.')
    else:
        _check('connection', 'Data Link', 'fail', 'Data link lost. Cannot launch safely.')

    # 5. Motors
    motors = (drone.health_motors or 'ok').lower()
    if motors == 'ok':
        _check('motors', 'Motors', 'pass', 'All motors operational.')
    elif motors == 'warning':
        _check('motors', 'Motors', 'warning', 'Motor anomaly detected. Inspect before launch.')
    else:
        _check('motors', 'Motors', 'fail', 'Motor fault detected. Grounded.')

    # 6. Payload Lock
    payload = (drone.health_payload_lock or 'ok').lower()
    if payload == 'ok':
        _check('payload_lock', 'Payload Lock', 'pass', 'Payload secured and locked.')
    elif payload == 'warning':
        _check('payload_lock', 'Payload Lock', 'warning', 'Payload lock sensor uncertain.')
    else:
        _check('payload_lock', 'Payload Lock', 'fail', 'Payload not locked. Abort launch.')

    # 7. Drone Status
    status = (drone.status or 'unknown').lower()
    if status == 'available':
        _check('status', 'Drone Status', 'pass', 'Drone available and ready for dispatch.')
    elif status in ('preparing',):
        _check('status', 'Drone Status', 'warning', 'Drone is in pre-flight preparation.')
    else:
        _check('status', 'Drone Status', 'fail',
               f'Drone status is {status!r}. Must be available to launch.')

    overall = 'no_go' if has_fail else ('warning' if has_warning else 'go')
    return checks, overall


# ── GET /api/admin/dashboard ──────────────────────────────────────────────────

@admin_bp.route('/api/admin/dashboard', methods=['GET'])
@require_admin
def admin_dashboard():
    """Aggregate dashboard snapshot for the admin command view."""
    _sim_advance()

    active_missions = Mission.query.filter(Mission.status.in_(_ACTIVE_STATUSES)).count()
    available_drones = Drone.query.filter_by(status='available').count()
    pending_orders = Order.query.filter_by(status='pending').count()
    unacknowledged_alerts = Alert.query.filter_by(acknowledged=False).count()

    drones = [d.to_dict() for d in Drone.query.all()]

    active_mission = (
        Mission.query.filter(Mission.status.in_(_ACTIVE_STATUSES))
        .order_by(Mission.launched_at.desc())
        .first()
    )

    alerts = (
        Alert.query
        .order_by(Alert.timestamp.desc())
        .limit(20)
        .all()
    )

    return ok({
        'active_missions': active_missions,
        'available_drones': available_drones,
        'pending_orders': pending_orders,
        'unacknowledged_alerts': unacknowledged_alerts,
        'drones': drones,
        'active_mission': active_mission.to_dict() if active_mission else None,
        'alerts': [a.to_dict() for a in alerts],
    })


# ── GET /api/admin/orders ─────────────────────────────────────────────────────

@admin_bp.route('/api/admin/orders', methods=['GET'])
@require_admin
def admin_orders():
    """All orders with pagination."""
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = min(100, max(1, int(request.args.get('per_page', 20))))
    except (ValueError, TypeError):
        page, per_page = 1, 20

    paginated = (
        Order.query
        .order_by(Order.ordered_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )

    return ok({
        'orders': [o.to_dict() for o in paginated.items],
        'total': paginated.total,
        'page': page,
        'per_page': per_page,
    })


# ── GET /api/admin/missions ───────────────────────────────────────────────────

@admin_bp.route('/api/admin/missions', methods=['GET'])
@require_admin
def admin_missions():
    """All missions ordered by launched_at desc, limited to 50."""
    missions = (
        Mission.query
        .order_by(Mission.launched_at.desc())
        .limit(50)
        .all()
    )
    return ok({'missions': [m.to_dict() for m in missions]})


# ── GET /api/admin/missions/active ───────────────────────────────────────────

@admin_bp.route('/api/admin/missions/active', methods=['GET'])
@require_admin
def admin_missions_active():
    """Current in-flight/preparing mission or null."""
    _sim_advance()

    mission = (
        Mission.query
        .filter(Mission.status.in_(_ACTIVE_STATUSES))
        .order_by(Mission.launched_at.desc())
        .first()
    )
    return ok({'mission': mission.to_dict() if mission else None})


# ── GET /api/admin/missions/<mission_id> ──────────────────────────────────────

@admin_bp.route('/api/admin/missions/<mission_id>', methods=['GET'])
@require_admin
def admin_mission_detail(mission_id: str):
    """Single mission + last 100 telemetry rows + temperature log."""
    mission = db.session.get(Mission, mission_id)
    if mission is None:
        return error('MISSION_NOT_FOUND', f'Mission {mission_id} not found.', 404)

    telemetry = (
        TelemetryLog.query
        .filter_by(mission_id=mission_id)
        .order_by(TelemetryLog.timestamp.desc())
        .limit(100)
        .all()
    )

    temp_log = (
        TemperatureLog.query
        .filter_by(mission_id=mission_id)
        .order_by(TemperatureLog.timestamp.asc())
        .all()
    )

    return ok({
        'mission': mission.to_dict(),
        'telemetry': [t.to_dict() for t in telemetry],
        'temperature_log': [t.to_dict() for t in temp_log],
    })


# ── GET /api/admin/fleet ──────────────────────────────────────────────────────

@admin_bp.route('/api/admin/fleet', methods=['GET'])
@require_admin
def admin_fleet():
    """All drones with current state."""
    _sim_advance()
    drones = Drone.query.all()
    return ok({'drones': [d.to_dict() for d in drones]})


# ── GET /api/admin/alerts ─────────────────────────────────────────────────────

@admin_bp.route('/api/admin/alerts', methods=['GET'])
@require_admin
def admin_alerts():
    """
    Alerts ordered by timestamp desc, limit 50.
    ?acknowledged=false → unacknowledged only.
    """
    ack_param = request.args.get('acknowledged', '').lower()
    query = Alert.query

    if ack_param == 'false':
        query = query.filter_by(acknowledged=False)

    alerts = query.order_by(Alert.timestamp.desc()).limit(50).all()
    return ok({'alerts': [a.to_dict() for a in alerts]})


# ── POST /api/admin/alerts/<alert_id>/acknowledge ─────────────────────────────

@admin_bp.route('/api/admin/alerts/<alert_id>/acknowledge', methods=['POST'])
@require_admin
def acknowledge_alert(alert_id: str):
    """Acknowledge an alert."""
    alert = db.session.get(Alert, alert_id)
    if alert is None:
        return error('ALERT_NOT_FOUND', f'Alert {alert_id} not found.', 404)

    alert.acknowledged = True
    alert.acknowledged_by = g.user_id
    alert.acknowledged_at = _utc_now()
    db.session.commit()

    return ok({'success': True, 'alert': alert.to_dict()})


# ── POST /api/admin/alerts/<alert_id>/resolve ─────────────────────────────────

@admin_bp.route('/api/admin/alerts/<alert_id>/resolve', methods=['POST'])
@require_admin
def resolve_alert(alert_id: str):
    """Resolve an alert (acknowledge + mark recommended_action as Resolved)."""
    alert = db.session.get(Alert, alert_id)
    if alert is None:
        return error('ALERT_NOT_FOUND', f'Alert {alert_id} not found.', 404)

    alert.acknowledged = True
    alert.acknowledged_by = g.user_id
    alert.acknowledged_at = _utc_now()
    alert.recommended_action = 'Resolved'
    db.session.commit()

    return ok({'success': True, 'alert': alert.to_dict()})


# ── GET /api/admin/telemetry/<drone_id> ───────────────────────────────────────

@admin_bp.route('/api/admin/telemetry/<drone_id>', methods=['GET'])
@require_admin
def admin_telemetry(drone_id: str):
    """Last 100 telemetry rows for a drone."""
    drone = db.session.get(Drone, drone_id)
    if drone is None:
        return error('DRONE_NOT_FOUND', f'Drone {drone_id} not found.', 404)

    rows = (
        TelemetryLog.query
        .filter_by(drone_id=drone_id)
        .order_by(TelemetryLog.timestamp.desc())
        .limit(100)
        .all()
    )
    return ok({'drone_id': drone_id, 'telemetry': [r.to_dict() for r in rows]})


# ── GET /api/admin/readiness/<drone_id> ───────────────────────────────────────

@admin_bp.route('/api/admin/readiness/<drone_id>', methods=['GET'])
@require_admin
def admin_readiness(drone_id: str):
    """7-check pre-flight readiness evaluation for a drone."""
    drone = db.session.get(Drone, drone_id)
    if drone is None:
        return error('DRONE_NOT_FOUND', f'Drone {drone_id} not found.', 404)

    checks, overall = _readiness_checks(drone)
    return ok({'drone': drone.to_dict(), 'checks': checks, 'overall': overall})


# ── POST /api/admin/drone/<drone_id>/rtl ──────────────────────────────────────

@admin_bp.route('/api/admin/drone/<drone_id>/rtl', methods=['POST'])
@require_admin
def drone_rtl(drone_id: str):
    """Command drone return-to-launch."""
    drone = db.session.get(Drone, drone_id)
    if drone is None:
        return error('DRONE_NOT_FOUND', f'Drone {drone_id} not found.', 404)

    if drone.status != 'in_flight':
        return error(
            'INVALID_STATE',
            f'Drone {drone_id} is not in_flight (current status: {drone.status!r}).',
            409,
        )

    drone.status = 'returning'

    # If the drone has an active mission, mark it as returning too
    if drone.mission_id:
        mission = db.session.get(Mission, drone.mission_id)
        if mission and mission.status in _ACTIVE_STATUSES:
            mission.status = 'returning'
    drone.mission_id = None

    db.session.commit()
    return ok({'success': True, 'drone': drone.to_dict()})


# ── POST /api/admin/drone/<drone_id>/hold ─────────────────────────────────────

@admin_bp.route('/api/admin/drone/<drone_id>/hold', methods=['POST'])
@require_admin
def drone_hold(drone_id: str):
    """Simulate hold state by degrading the data link."""
    drone = db.session.get(Drone, drone_id)
    if drone is None:
        return error('DRONE_NOT_FOUND', f'Drone {drone_id} not found.', 404)

    drone.connection = 'degraded'
    db.session.commit()
    return ok({'success': True, 'drone': drone.to_dict()})


# ── POST /api/admin/drone/<drone_id>/resume ───────────────────────────────────

@admin_bp.route('/api/admin/drone/<drone_id>/resume', methods=['POST'])
@require_admin
def drone_resume(drone_id: str):
    """Resume normal operations by restoring the data link."""
    drone = db.session.get(Drone, drone_id)
    if drone is None:
        return error('DRONE_NOT_FOUND', f'Drone {drone_id} not found.', 404)

    drone.connection = 'stable'
    db.session.commit()
    return ok({'success': True, 'drone': drone.to_dict()})


# ── GET /api/admin/priority-queue ────────────────────────────────────────────

@admin_bp.route('/api/admin/priority-queue', methods=['GET'])
@require_admin
def admin_priority_queue():
    """Pending orders sorted by priority score (emergency=3, urgent=2, normal=1) + age bonus."""
    pending = Order.query.filter_by(status='pending').all()
    scored = sorted(
        [{'score': _priority_score(o), **o.to_dict()} for o in pending],
        key=lambda x: x['score'],
        reverse=True,
    )
    return ok({'queue': scored})


# ── GET /api/admin/command-center ────────────────────────────────────────────

@admin_bp.route('/api/admin/command-center', methods=['GET'])
@require_admin
def admin_command_center():
    """
    Combined dashboard snapshot for a single frontend fetch.
    Identical to /dashboard but also includes top-5 priority queue entries.
    """
    _sim_advance()

    active_missions_count = Mission.query.filter(Mission.status.in_(_ACTIVE_STATUSES)).count()
    available_drones_count = Drone.query.filter_by(status='available').count()
    pending_orders_count = Order.query.filter_by(status='pending').count()
    unacknowledged_alerts_count = Alert.query.filter_by(acknowledged=False).count()

    drones = [d.to_dict() for d in Drone.query.all()]

    active_mission = (
        Mission.query.filter(Mission.status.in_(_ACTIVE_STATUSES))
        .order_by(Mission.launched_at.desc())
        .first()
    )

    alerts = (
        Alert.query
        .order_by(Alert.timestamp.desc())
        .limit(20)
        .all()
    )

    # Priority queue — top 5 pending orders
    pending = Order.query.filter_by(status='pending').all()
    top5 = sorted(
        [{'score': _priority_score(o), **o.to_dict()} for o in pending],
        key=lambda x: x['score'],
        reverse=True,
    )[:5]

    return ok({
        'active_missions': active_missions_count,
        'available_drones': available_drones_count,
        'pending_orders': pending_orders_count,
        'unacknowledged_alerts': unacknowledged_alerts_count,
        'drones': drones,
        'active_mission': active_mission.to_dict() if active_mission else None,
        'alerts': [a.to_dict() for a in alerts],
        'priority_queue': top5,
    })


# ── GET /api/admin/locations ──────────────────────────────────────────────────

@admin_bp.route('/api/admin/locations', methods=['GET'])
@require_admin
def admin_locations():
    """Return all active locations/facilities."""
    _sim_advance()
    from models.location import Location
    locs = Location.query.filter_by(is_active=True).order_by(Location.type, Location.name).all()
    return ok({'locations': [l.to_dict() for l in locs]})


# ── GET /api/admin/analytics ──────────────────────────────────────────────────

@admin_bp.route('/api/admin/analytics', methods=['GET'])
@require_admin
def admin_analytics():
    """Return analytics data: order stats, inventory summary, fleet summary."""
    _sim_advance()
    from datetime import date, timedelta
    from sqlalchemy import func
    from models.inventory import InventoryItem

    # Order statistics
    total_orders = Order.query.count()
    delivered = Order.query.filter_by(status='delivered').count()
    verified = Order.query.filter_by(status='verified').count()
    cancelled = Order.query.filter_by(status='cancelled').count()
    pending = Order.query.filter_by(status='pending').count()

    # Priority breakdown
    emergency_count = Order.query.filter_by(priority='emergency').count()
    urgent_count = Order.query.filter_by(priority='urgent').count()
    normal_count = Order.query.filter_by(priority='normal').count()

    # Avg delivery time (only completed orders with timing data)
    avg_delivery = db.session.query(func.avg(Order.delivery_time_minutes)).filter(
        Order.delivery_time_minutes.isnot(None)
    ).scalar() or 0

    # Daily orders last 30 days
    today = date.today()
    daily_metrics = []
    for i in range(29, -1, -1):
        day = today - timedelta(days=i)
        day_start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        day_end = datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=timezone.utc)
        count = Order.query.filter(
            Order.ordered_at >= day_start,
            Order.ordered_at <= day_end,
        ).count()
        daily_metrics.append({'date': day.isoformat(), 'orders': count})

    # Inventory summary
    all_items = InventoryItem.query.filter_by(is_active=True).all()
    today_str = today.isoformat()
    inventory_summary = {
        'total_items': len(all_items),
        'expired': sum(1 for i in all_items if i.expiry_date and i.expiry_date < today_str),
        'critical_stock': sum(1 for i in all_items if i.quantity <= (i.min_threshold or 0) and i.quantity > 0),
        'out_of_stock': sum(1 for i in all_items if i.quantity <= 0),
        'by_category': {},
    }
    for item in all_items:
        cat = item.category or 'Other'
        if cat not in inventory_summary['by_category']:
            inventory_summary['by_category'][cat] = {'count': 0, 'total_qty': 0}
        inventory_summary['by_category'][cat]['count'] += 1
        inventory_summary['by_category'][cat]['total_qty'] += item.quantity

    # Fleet summary
    drones = Drone.query.all()
    fleet_summary = {
        'total': len(drones),
        'available': sum(1 for d in drones if d.status == 'available'),
        'in_flight': sum(1 for d in drones if d.status == 'in_flight'),
        'returning': sum(1 for d in drones if d.status == 'returning'),
        'maintenance': sum(1 for d in drones if d.status == 'maintenance'),
        'drones': [
            {
                'id': d.id,
                'name': d.name,
                'status': d.status,
                'battery': d.battery,
                'total_missions': d.total_missions or 0,
                'flight_hours': round(d.flight_hours or 0, 1),
            }
            for d in drones
        ],
    }

    return ok({
        'order_stats': {
            'total': total_orders,
            'delivered': delivered,
            'verified': verified,
            'cancelled': cancelled,
            'pending': pending,
            'avg_delivery_minutes': round(float(avg_delivery), 1),
            'priority': {
                'emergency': emergency_count,
                'urgent': urgent_count,
                'normal': normal_count,
            },
        },
        'daily_metrics': daily_metrics,
        'inventory': inventory_summary,
        'fleet': fleet_summary,
    })
