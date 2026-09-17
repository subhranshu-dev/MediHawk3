# MediHawk — Final Command Centre & Simulation Fix Report

**Date:** 2026-09-17  
**Branch:** main  
**Git HEAD before work:** dc4b760  
**Scope:** Four targeted fixes only — no UI redesign outside the map layer.

---

## Problems Fixed

| ID | Problem | File(s) Changed |
|----|---------|----------------|
| A | Admin page shows Active Orders = 0 on first load | `src/hooks/useAdminData.ts`, `src/store/index.ts` |
| B | StatusBadge crash (already fixed in prior session) | `backend/services/simulation_service.py`, `src/components/ui/StatusBadge.tsx` |
| C | `GET /` returns 404 | `backend/routes/health.py` |
| D | Drone map static/single drone | `src/components/map/MissionMap.tsx`, `src/store/index.ts` |

---

## Problem A — Command Centre Data Hydration

### Root Cause

`useAdminData` only fetched drones, the active mission, and alerts from `/api/admin/command-center`. Orders were never fetched by this hook. The only place `orderService.list()` was called was inside `AdminOrders.tsx` and `AdminHistory.tsx` — both pages that require navigation. So `orders` in the Zustand store was always empty (`[]`) on first load of `AdminOverview`, giving Active Orders = 0 and Pending = 0.

### Fix

`useAdminData.ts` rewritten to call `orderService.list()` in parallel with the command-center fetch on every polling cycle. Orders are stored via the new `setOrdersFromBackend` action. On first mount (before the 5-second interval fires) `fetchAndSync()` is called immediately, so AdminOverview is hydrated on the very first render.

`src/store/index.ts` additions:
```ts
setOrdersFromBackend: (orders: Order[]) => void  // replaces entire list from backend
activeMissions: Mission[]                          // all active missions for map
setActiveMissionsFromBackend: (missions: Mission[]) => void
```

### Verification

First load of `/admin`: Active Orders count matches backend. No navigate-away required.

---

## Problem C — Backend Root 404

### Fix

Added `GET /` to `backend/routes/health.py`:

```python
@health_bp.route('/', methods=['GET'])
def root():
    mode = current_app.config.get('APP_MODE', 'simulation')
    return jsonify({
        'success': True,
        'service': 'MediHawk Backend',
        'status': 'running',
        'mode': mode,
        'health': '/api/health',
    }), 200
```

Returns minimal service info only. No secrets, no config values, no DB data.

### Verification

```
curl http://127.0.0.1:5000/
→ {"health":"/api/health","mode":"simulation","service":"MediHawk Backend","status":"running","success":true}
HTTP 200
```

---

## Problem D — Multi-Drone Live Simulation Map

### Root Cause

`MissionMap.tsx` previously:
- Called `drones.find(d => d.mission_id)` — found only the first drone with a mission
- Had no smooth interpolation — position jumped only on 5s backend polls
- Used a plain blue Leaflet default marker (no drone icon, no medical cross)
- No flight trail, no per-drone route line, no popup with mission details

### Architecture of New Map

**Data sources (backend-driven, no fake data):**
- `drones` from Zustand: source of truth for all drone positions, speeds, battery, status
- `activeMissions` from Zustand: source of truth for routes (from_lat/lng → to_lat/lng), ETAs, waypoints
- Positions are provided by the backend every 5 seconds via `useAdminData` polling

**Smooth interpolation layer (client-side):**
- `smoothPos: Map<droneId, [lat,lng]>` state — updated at 100ms interval
- `interpolateToward()` advances the drone's last-known position toward its destination at `drone.speed` km/h
- When backend sends a new position (every 5s), any drift > ~50m resets to the backend value
- This is purely cosmetic smoothing between polls — backend data always wins on the next cycle

**Stability fix:**
- `activeDrones` computed with `useMemo([drones])` — reference only changes when backend data changes, not when the 100ms `setSmoothPos` causes a re-render. Prevents the interval from restarting 10×/second.

**Heading rotation:**
```ts
function computeHeading(lat1, lng1, lat2, lng2): number {
  return Math.atan2(lng2 - lng1, lat2 - lat1) * 180 / Math.PI
}
```
Drone icon rotates toward the mission destination in real-time.

**Drone SVG icon:**
- Quadcopter: 4 rotor arms + 4 rotor discs at 45° corners
- Medical cross (white) on red body
- Forward indicator arrow (top, rotates with heading)
- Glow disc behind icon
- All SVG — no external URLs, no image files

**Per-mission elements:**
- Dashed Polyline: full route from hub to destination
- Solid Polyline: if waypoints are available and have been reached
- Wide semi-transparent corridor band
- Waypoint dots (green=reached, red=pending)
- Hub marker (medical-cross green square)
- Destination marker (amber location pin)

**Per-drone elements:**
- Flight trail (accumulated every 10m, max 60 points, dashed red line)
- Popup with: drone name, status, speed, altitude, battery, ETA, mission ID, destination

**Map auto-follow:**
`MapFollower` component pans to the first active drone when a new active drone appears.

---

## Acceptance Criteria Verification

| Criterion | Result |
|-----------|--------|
| Admin page Active Orders count correct on first hard-refresh | ✅ |
| StatusBadge never crashes | ✅ (fixed in prior session) |
| `GET /` returns HTTP 200 with JSON service info | ✅ |
| All in-flight drones rendered on map | ✅ |
| Drone positions interpolate smoothly (100ms) | ✅ |
| Drone icon rotates toward destination | ✅ |
| Drone SVG icon with medical cross | ✅ |
| Per-drone flight trail | ✅ |
| Per-drone route line | ✅ |
| Hub and destination markers | ✅ |
| Per-drone popup with mission data | ✅ |
| TypeScript = 0 errors | ✅ |
| npm run build = PASS | ✅ |
| Backend tests = 425/425 PASS | ✅ |
| APP_MODE=simulation unchanged | ✅ |
| No real MAVLink/Pixhawk invocations | ✅ |
| No secrets exposed | ✅ |
| JWT role always from DB, never from request | ✅ |
| UI outside map/simulation layer unchanged | ✅ |
| No fake data substituted for real backend data | ✅ |

---

## Build Verification

```
npx tsc --noEmit
(no output — 0 errors)

npm run build
✓ built in 1.66s

pytest -q
425 passed, 11 warnings in 272.77s (0:04:32)
```

---

## Files Changed in This Session

| File | Change |
|------|--------|
| `backend/services/simulation_service.py` | DroneStatus/MissionStatus decoupling (Problem B, prior session) |
| `src/components/ui/StatusBadge.tsx` | Safety fallback in all 4 badge functions (Problem B, prior session) |
| `backend/routes/health.py` | Added `GET /` root route (Problem C) |
| `src/store/index.ts` | Added `setOrdersFromBackend`, `activeMissions`, `setActiveMissionsFromBackend` (Problems A, D) |
| `src/hooks/useAdminData.ts` | Rewritten to fetch orders + missions in parallel (Problem A) |
| `src/components/map/MissionMap.tsx` | Full rewrite: multi-drone, smooth interpolation, SVG icon, trail, route, popups (Problem D) |

---

*Generated 2026-09-17*
