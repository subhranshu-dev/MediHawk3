# MediHawk Phase 1F+ — Command Centre Backend Contract

> **Status:** Implemented  
> **Date:** 2026-09-16  
> **Auth model:** JWT in `Authorization: Bearer <token>` header. Role resolved from DB only — never from request body or query string.

---

## Authentication Rules

| Rule | Detail |
|------|--------|
| All admin endpoints require valid admin JWT | 401 on missing/invalid token |
| Role `admin` must come from DB via JWT | Sending `role=admin` in body or query is silently ignored |
| Doctor JWT returns 403 on all `/api/admin/` routes | Role is authoritative from the token, not the caller |

---

## Endpoints

### GET `/api/admin/dashboard`

Aggregate Command Centre snapshot. Calls `_sim_advance()` to advance simulation state first.

**Response 200:**
```json
{
  "active_missions": 1,
  "available_drones": 3,
  "pending_orders": 2,
  "unacknowledged_alerts": 1,
  "drones": [ /* all Drone.to_dict() */ ],
  "active_mission": { /* Mission.to_dict() or null */ },
  "alerts": [ /* last 20 Alert.to_dict() desc */ ]
}
```

---

### GET `/api/admin/orders`

All orders across all doctors, paginated.

**Query params:** `page=1` (int), `per_page=20` (int, max 100)

**Response 200:**
```json
{
  "orders": [ /* Order.to_dict() */ ],
  "total": 42,
  "page": 1,
  "per_page": 20
}
```

---

### GET `/api/admin/missions`

All missions ordered by `launched_at DESC`, limit 50.

**Response 200:**
```json
{
  "missions": [ /* Mission.to_dict() */ ]
}
```

---

### GET `/api/admin/missions/active`

Current in-flight mission (status in `preparing|in_flight|landing`). Calls `_sim_advance()`.

**Response 200:**
```json
{
  "mission": { /* Mission.to_dict() or null */ }
}
```

---

### GET `/api/admin/missions/<mission_id>`

Full mission detail including telemetry and temperature log.

**Response 200:**
```json
{
  "mission": { /* Mission.to_dict() */ },
  "telemetry": [ /* last 100 TelemetryLog.to_dict() */ ],
  "temperature_log": [ /* TemperatureLog.to_dict() */ ]
}
```

**Response 404:** Mission not found.

---

### GET `/api/admin/fleet`

All drones. Calls `_sim_advance()`.

**Response 200:**
```json
{
  "drones": [ /* Drone.to_dict() */ ]
}
```

---

### GET `/api/admin/alerts`

Last 50 alerts ordered by `timestamp DESC`.

**Query params:** `acknowledged=false` → filter to unacknowledged only.

**Response 200:**
```json
{
  "alerts": [ /* Alert.to_dict() */ ]
}
```

---

### POST `/api/admin/alerts/<alert_id>/acknowledge`

Mark alert acknowledged. Sets `acknowledged=true`, `acknowledged_by=<admin_id>`, `acknowledged_at=now()`.

**Response 200:**
```json
{
  "success": true,
  "alert": { /* Alert.to_dict() */ }
}
```

**Response 404:** Alert not found.

---

### POST `/api/admin/alerts/<alert_id>/resolve`

Same as acknowledge, additionally sets `recommended_action='Resolved'`.

**Response 200:**
```json
{
  "success": true,
  "alert": { /* Alert.to_dict() */ }
}
```

**Response 404:** Alert not found.

---

### GET `/api/admin/telemetry/<drone_id>`

Last 100 telemetry rows for the specified drone ordered by `timestamp DESC`.

**Response 200:**
```json
{
  "drone_id": "MH-D01",
  "telemetry": [ /* TelemetryLog.to_dict() */ ]
}
```

**Response 404:** Drone not found.

---

### GET `/api/admin/readiness/<drone_id>`

7-check pre-flight readiness evaluation.

**Checks (IDs):** `battery`, `gps`, `temperature`, `connection`, `motors`, `payload_lock`, `status`

**Check status values:** `pass` | `warning` | `fail`

**Overall values:** `go` (all pass) | `warning` (at least one warning, no fail) | `no_go` (at least one fail)

**Thresholds:**
| Check | Pass | Warning | Fail |
|-------|------|---------|------|
| battery | ≥50% | 20–49% | <20% |
| gps_accuracy | ≤2m | 2–5m | >5m |
| temperature | ≤8°C | 8–12°C | >12°C |
| connection | stable | degraded | lost/unknown |
| motors | ok | warning | other |
| payload_lock | ok | warning | other |
| status | available | preparing | other |

**Response 200:**
```json
{
  "drone": { /* Drone.to_dict() */ },
  "checks": [
    { "id": "battery", "label": "Battery", "status": "pass", "detail": "100% — sufficient for mission." },
    ...
  ],
  "overall": "go"
}
```

**Response 404:** Drone not found.

---

### POST `/api/admin/drone/<drone_id>/rtl`

Return-to-Launch command. If drone is `in_flight`, sets `status='returning'`.

**Response 200:**
```json
{
  "success": true,
  "drone": { /* Drone.to_dict() */ }
}
```

**Response 400:** Drone is not in flight.  
**Response 404:** Drone not found.

---

### POST `/api/admin/drone/<drone_id>/hold`

Simulated hold state. Sets `connection='degraded'`.

**Response 200:**
```json
{
  "success": true,
  "drone": { /* Drone.to_dict() */ }
}
```

**Response 404:** Drone not found.

---

### POST `/api/admin/drone/<drone_id>/resume`

Restore normal link. Sets `connection='stable'`.

**Response 200:**
```json
{
  "success": true,
  "drone": { /* Drone.to_dict() */ }
}
```

**Response 404:** Drone not found.

---

### GET `/api/admin/priority-queue`

Pending orders sorted by priority score descending. Score = `base + age_hours × 0.1` where `base` is 3 (emergency), 2 (urgent), or 1 (normal).

**Response 200:**
```json
{
  "queue": [
    { /* Order.to_dict() fields + */ "score": 3.25 },
    ...
  ]
}
```

---

### GET `/api/admin/command-center`

Combined snapshot for single-fetch Command Centre load. Same as `/dashboard` with `priority_queue` (top 5 pending orders by score) added.

**Response 200:**
```json
{
  "active_missions": 1,
  "available_drones": 3,
  "pending_orders": 2,
  "unacknowledged_alerts": 1,
  "drones": [ /* ... */ ],
  "active_mission": { /* ... */ },
  "alerts": [ /* last 20 */ ],
  "priority_queue": [ /* top 5 pending by score */ ]
}
```

---

## Simulation Service

`backend/services/simulation_service.py`

### `_sim_advance()`

Called at the start of every admin API request. Idempotent — skips if no active missions or if last telemetry was <30 seconds ago (`ADVANCE_INTERVAL_SECONDS = 30`).

**Physics:**
- Phase by elapsed/eta fraction:
  - `< 0.1` → `preparing` (drone on ground, altitude=0)
  - `0.1 – 0.85` → `in_flight` (cruise at 120m altitude, 15 m/s)
  - `0.85 – 1.0` → `landing` (altitude/speed descend to 0)
  - `≥ 1.0` → `delivered` then drone status → `returning`
- Battery drain: 0.15% per flight-minute
- Temperature: ±0.2°C drift toward 26°C ambient per advance cycle
- Writes `TelemetryLog` row on each advance

**Alert deduplication:** Never creates a duplicate unacknowledged alert for the same `drone_id + category`.

**Alert thresholds:**
| Trigger | Severity | Category |
|---------|----------|----------|
| battery < 20% | critical | battery |
| temperature > 8°C | warning | temperature |
| temperature > 12°C | critical | temperature |

### `ensure_demo_mission()`

If no active missions exist and `MH-D01` is available: creates/reactivates `MSN-DEMO-001` flying `hub-01 → phc-chandaka`. Requires `doc-001` to be seeded. Safe to call repeatedly.

---

## Frontend Connection

| Layer | Change |
|-------|--------|
| `src/services/api/index.ts` | Added `adminService` with 16 methods |
| `src/hooks/useAdminData.ts` | Polls `/api/admin/command-center` every 5s, syncs Zustand store |
| `src/store/index.ts` | Added `setDronesFromBackend`, `setActiveMissionFromBackend`, `setAlertsFromBackend` |
| `src/services/websocket/index.ts` | Reports `'disconnected'` instead of fake `'connected'` |
| `src/pages/admin/AdminOverview.tsx` | Calls `useAdminData()` on mount |
| `src/pages/admin/AdminMissions.tsx` | Calls `useAdminData()` on mount; RTL/Hold/Resume call real API |
| `src/pages/admin/AdminAlerts.tsx` | Acknowledge/Resolve call real API then refetch |

---

## Error Format

All errors use:
```json
{
  "error": {
    "code": "SNAKE_CASE_CODE",
    "message": "Human-readable message"
  }
}
```

---

## Order Section Bug Fixes (Phase 1F)

| Fix | File | Detail |
|-----|------|--------|
| Nested button HTML violation | `DoctorOrder.tsx` | `MedItemRow` and `BloodItemCard` outer `<button>` → `<div role="button" tabIndex={0}>` with onKeyDown |
| Form semantics | `DoctorOrder.tsx` | QtyControl ± buttons get `type="button"`, Place Order gets `type="submit"`, Go back gets `type="button"` |
| web-vitals `startTime` error | — | Confirmed browser extension (VM82 in stack) — no codebase fix needed |
| Three.js context loss | — | `webglcontextlost` handler with `e.preventDefault()` already present in both DroneScene3D.tsx and DroneShowcase.tsx — no change needed |
| 422 false success | — | `setStep('success')` is inside `try` block only — no fix needed |
