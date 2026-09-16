# MediHawk Phase-0 Backend Contract
## Engineering Blueprint for Flask Backend Implementation

**Produced by:** Phase-0 Frontend Audit  
**Date:** 2026-09-14  
**Status:** AUDIT COMPLETE — NO BACKEND BUILT  
**Frontend:** FROZEN — this document describes the frontend as-is

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Repository Structure](#2-repository-structure)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Mock-Data Inventory](#4-mock-data-inventory)
5. [API Contract Table](#5-api-contract-table)
6. [Full API Contracts](#6-full-api-contracts)
7. [Doctor Portal Requirements](#7-doctor-portal-requirements)
8. [Admin Portal Requirements](#8-admin-portal-requirements)
9. [Authentication Contract](#9-authentication-contract)
10. [Order Lifecycle](#10-order-lifecycle)
11. [Inspection Contract](#11-inspection-contract)
12. [Launch Contract — Critical Analysis](#12-launch-contract--critical-analysis)
13. [Drone Telemetry Contract](#13-drone-telemetry-contract)
14. [Socket.IO Event Contract](#14-socketio-event-contract)
15. [Database Requirements](#15-database-requirements)
16. [Hawkie Requirements](#16-hawkie-requirements)
17. [Demo vs Live Architecture](#17-demo-vs-live-architecture)
18. [Error Handling Requirements](#18-error-handling-requirements)
19. [Security Findings](#19-security-findings)
20. [Frontend / Backend Mismatches](#20-frontend--backend-mismatches)
21. [Frontend → Backend Feature Matrix](#21-frontend--backend-feature-matrix)
22. [Launch Dependency Graph](#22-launch-dependency-graph)
23. [Gap Analysis](#23-gap-analysis)
24. [Unknowns Requiring Decision](#24-unknowns-requiring-decision)
25. [Backend Implementation Sequence (Phase 1 Plan)](#25-backend-implementation-sequence-phase-1-plan)
26. [Risk Register](#26-risk-register)

---

## 1. Executive Summary

MediHawk is an autonomous medical-delivery drone platform with two frontend portals: a mobile-first Doctor Portal and a desktop Admin Command Center. The frontend is complete and fully operational in **Demo/Simulation mode** — all state is generated locally from a deterministic 2-second tick simulation engine. There is no backend, no database, and no real drone connection.

**Critical findings:**

- The API service layer (`src/services/api/index.ts`) is prepared with all 35+ endpoints but `IS_DEMO = true` is hardcoded — **no component currently calls any backend**.
- All components read directly from the Zustand store seeded with hardcoded `mockData.ts`.
- Order IDs and delivery OTPs are generated client-side — must move to backend.
- Drone selection for launch is hardcoded to `MH-D02 · Hawk Beta` — must be dynamic.
- HOLD / RESUME / EMERGENCY RTL show toast notifications only — no backend or MAVProxy calls.
- Delivery OTP verification is client-side string comparison — security risk.
- Geofence verification is hardcoded `const geofenceMatch = true`.
- The WebSocket service (`initWebSocket`) is defined but never called from any component.
- Doctor login supports phone-OTP as authentication method — backend must implement SMS OTP via Twilio or similar.
- The inspection checklist is entirely static mock data; no interactive check state; the backend must eventually drive real sensor-based checks.

The backend must become the **authoritative source of truth** for: orders, missions, drone state, telemetry, inventory, locations, authentication, and launch authorization. The frontend is ready to receive live data once the api service's `IS_DEMO` flag is switched to `false` and backend endpoints are live at `VITE_API_URL`.

---

## 2. Repository Structure

```
MediHawk3/
├── index.html
├── package.json                    React 19, Vite 8, TypeScript 6
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.app.json
│
└── src/
    ├── main.tsx                    Entry point
    ├── App.tsx                     Router + auth guards + portal layout
    │
    ├── types/
    │   └── index.ts                All TypeScript types (single source of truth)
    │
    ├── data/
    │   └── mockData.ts             ALL mock data + generator functions
    │
    ├── store/
    │   └── index.ts                Zustand store — global app state
    │
    ├── simulation/
    │   └── engine.ts               2-second tick simulation (DEMO mode only)
    │
    ├── hooks/
    │   └── useSimulation.ts        Starts/stops simulation engine
    │
    ├── services/
    │   ├── api/
    │   │   └── index.ts            Flask API service layer (IS_DEMO=true, not wired to UI)
    │   ├── websocket/
    │   │   └── index.ts            Socket.IO service (mock, not wired to UI)
    │   └── hawkie/
    │       └── index.ts            Hawkie chat engine (deterministic, reads from store)
    │
    ├── components/
    │   ├── charts/
    │   │   └── TemperatureChart.tsx
    │   ├── drone/
    │   │   ├── DroneScene3D.tsx    React Three Fiber 3D drone (landing page)
    │   │   └── DroneShowcase.tsx
    │   ├── hawkie/
    │   │   └── HawkieFloat.tsx     Floating Hawkie chat button + panel
    │   ├── layout/
    │   │   ├── AdminSidebar.tsx
    │   │   ├── AdminTopBar.tsx
    │   │   └── DoctorLayout.tsx    Bottom nav for doctor portal
    │   ├── map/
    │   │   └── MissionMap.tsx      React Leaflet — shows drone path + markers
    │   ├── mission/
    │   │   └── MissionTimeline.tsx Timeline/waypoint progress components
    │   └── ui/                     Primitives: BatteryIndicator, Modal, StatusBadge, Toast, etc.
    │
    └── pages/
        ├── landing/
        │   └── LandingPage.tsx
        ├── auth/
        │   ├── DoctorLogin.tsx     Phone+PW / Email+PW / OTP / Forgot PW
        │   └── AdminLogin.tsx      Email+PW / Forgot PW (3-step: email→OTP→newPW)
        ├── doctor/
        │   ├── DoctorHome.tsx
        │   ├── DoctorOrder.tsx     3-step multi-item ordering flow
        │   ├── DoctorTrack.tsx     Live delivery tracking
        │   └── DoctorHistory.tsx
        └── admin/
            ├── AdminOverview.tsx   Map + metrics + pending queue
            ├── AdminOrders.tsx     Orders table + CONFIRM & LAUNCH flow
            ├── AdminMissions.tsx   Active mission with HOLD/RESUME/RTL
            ├── AdminFleet.tsx      Fleet cards with telemetry
            ├── AdminHawkie.tsx     Embedded Hawkie + situation panel
            ├── AdminSafety.tsx     AI flight safety checks (static)
            ├── AdminAlerts.tsx     Alert center with acknowledge
            ├── AdminVerification.tsx  Delivery verification (OTP/geofence)
            ├── AdminAnalytics.tsx  Analytics charts (fake metrics)
            ├── AdminLocations.tsx  Location management
            ├── AdminInventory.tsx  Inventory table
            ├── AdminHistory.tsx    Order history table
            ├── AdminColdChain.tsx  Cold-chain temperature monitoring
            └── AdminDemoControls.tsx  Demo scenario injector (footer bar)
```

**Key dependencies:**
- `socket.io-client@4.8.3` — installed but WebSocket service is never initialized from any component
- `leaflet@1.9.4` + `react-leaflet@5.0.0` — live map
- `zustand@5.0.15` — global state (entire app state including all mock data)
- `framer-motion@13.2.0` — animations
- `@react-three/fiber` + `@react-three/drei` — 3D drone on landing page

---

## 3. Frontend Architecture

### State Management
The entire application state lives in a single Zustand store (`src/store/index.ts`). On initialization, the store is seeded with all mock data from `mockData.ts`. There is no persistence (localStorage, sessionStorage, or cookies) — state is lost on page refresh.

**Store shape (exact):**
```typescript
{
  user: User | null            // null until login
  isDemo: boolean              // always true currently
  orders: Order[]              // seeded from ORDERS mockData
  drones: Drone[]              // seeded from DRONES mockData
  activeMission: Mission | null // seeded from ACTIVE_MISSION mockData
  alerts: Alert[]              // seeded from ALERTS mockData
  activeTelemetry: TelemetryPoint[]  // seeded from generateTelemetryHistory()
  temperatureLogs: TemperatureLog[]  // seeded from generateTempLog(5.8)
  systemStatus: SystemStatus   // seeded from SYSTEM_STATUS mockData (all connected)
  simRunning: boolean          // true
  simScenario: string | null
  sidebarOpen: boolean
}
```

### Auth Guards
`RequireAuth` component in `App.tsx` checks `user !== null` from Zustand. If `user` is null, redirects to login. If `role` mismatches, redirects to `/`. No JWT check, no token expiry, no refresh.

### Simulation Engine
`src/simulation/engine.ts` runs a `setInterval(tick, 2000)`:
- Moves MH-D01 from hub to PHC Chandaka by incrementing `missionProgress` by 0.012 per tick
- Updates drone: lat, lng, altitude, speed, battery (−0.08%/tick), temperature (random ±0.2°C)
- Pushes TelemetryPoint to store (last 60 points kept)
- Updates mission waypoints (marked reached when missionProgress >= wpProgress)
- On completion (missionProgress >= 1.0): sets mission to 'delivered', order to 'delivered', then after 8s resets to mid-flight for continuous demo loop
- Handles injected scenarios: temp_warning, link_loss, obstacle

---

## 4. Mock-Data Inventory

| File | Mock Data | Consumer | Replacement | Priority |
|------|-----------|----------|-------------|----------|
| `src/data/mockData.ts` | `MOCK_USERS` — 2 hardcoded users (doctor + admin) | Zustand store `login()` | `POST /api/login` returning user object + JWT | CRITICAL |
| `src/data/mockData.ts` | `LOCATIONS` — 4 static locations | `AdminLocations`, `DoctorOrder` (hardcoded destination), `AdminAnalytics` | `GET /api/locations` | HIGH |
| `src/data/mockData.ts` | `INVENTORY` — 8 medicines with stock/expiry/status | `AdminInventory`, `DoctorOrder.StockBadge`, `DoctorOrder.maxQtyFor()` | `GET /api/inventory` | HIGH |
| `src/data/mockData.ts` | `DRONES` — 4 drones with live telemetry | All admin pages, Zustand store | `GET /api/drone/status` + Socket.IO telemetry | CRITICAL |
| `src/data/mockData.ts` | `ORDERS` — 4 seeded orders | All order pages, Hawkie, simulation engine | `GET /api/orders` | CRITICAL |
| `src/data/mockData.ts` | `ACTIVE_MISSION` — 1 in-flight mission | `AdminMissions`, `AdminOverview`, `DoctorTrack`, Hawkie | `GET /api/missions/active` or Socket.IO push | CRITICAL |
| `src/data/mockData.ts` | `ALERTS` — 4 hardcoded alerts | `AdminAlerts`, `AdminOverview`, Hawkie | `GET /api/alerts` + Socket.IO events | HIGH |
| `src/data/mockData.ts` | `generateTempLog(5.8)` — 40 fake temp readings | `DoctorTrack`, `AdminMissions`, `AdminColdChain`, charts | `GET /api/temperature/log/<order_id>` + Socket.IO push | HIGH |
| `src/data/mockData.ts` | `generateTelemetryHistory()` — 30 fake telemetry points | `AdminMissions` charts, `DoctorTrack` | Socket.IO `telemetry` events | CRITICAL |
| `src/data/mockData.ts` | `SYSTEM_STATUS` — all connected/locked | `AdminHawkie`, Hawkie service | Backend health endpoint + Socket.IO | MEDIUM |
| `src/data/mockData.ts` | `generateDailyMetrics()` — random 14/30-day metrics | `AdminAnalytics` | `GET /api/analytics/daily` | MEDIUM |
| `src/data/mockData.ts` | `INSPECTION_CHECKS` — 14 checks all 'pass' | `AdminOrders.InspectionModal` | `GET /api/inspection/<order_id>` returning real checks | CRITICAL |
| `src/data/mockData.ts` | `HERO_STATS` — static delivery stats | `LandingPage` | `GET /api/stats/summary` | LOW |
| `src/pages/admin/AdminSafety.tsx` | `SAFETY_CHECKS` — hardcoded 6 safety checks | `AdminSafety` | Real sensor data via Socket.IO or polling | MEDIUM |
| `src/pages/admin/AdminSafety.tsx` | `AI_EVENTS` — hardcoded event stream | `AdminSafety` | Real mission event log from backend | MEDIUM |
| `src/pages/admin/AdminColdChain.tsx` | `CHAIN_EVENTS` — hardcoded 6 chain events | `AdminColdChain` | Real cold-chain audit log from backend | MEDIUM |
| `src/pages/doctor/DoctorOrder.tsx` | `CATALOG` — 26 hardcoded medicine items | `DoctorOrder` | Can remain as frontend catalog; optionally `GET /api/catalog` | LOW |
| `src/simulation/engine.ts` | Entire simulation engine — fake flight path | All components | Real Socket.IO telemetry stream | CRITICAL |
| `src/services/api/index.ts` | `IS_DEMO = true` hardcoded flag | All api service calls (but no component calls them) | Set `IS_DEMO = false` and connect VITE_API_URL | CRITICAL |
| `src/pages/doctor/DoctorOrder.tsx` | OTP generated client-side: `Math.floor(100000 + Math.random() * 900000)` | `AdminVerification` | Backend must generate OTP and send via SMS | CRITICAL |
| `src/pages/doctor/DoctorOrder.tsx` | Order ID generated client-side: `MH-2026-00${422 + orders.length}` | All order displays | Backend must generate and return canonical order ID | CRITICAL |
| `src/pages/admin/AdminOrders.tsx` | Drone assignment hardcoded: `'MH-D02 · Hawk Beta'` | `InspectionModal` | Backend assigns drone during launch authorization | CRITICAL |
| `src/pages/admin/AdminVerification.tsx` | `const geofenceMatch = true` hardcoded | Verification flow | Real geofence check from drone GPS vs. destination lat/lng | HIGH |
| `src/store/index.ts` | Login sets hardcoded MOCK_USERS[role] | Auth guard, all user-displaying components | JWT decode → real user object from backend | CRITICAL |

---

## 5. API Contract Table

| Method | Endpoint | Auth | Role | Request | Response | Consumer | Current Mock | Status |
|--------|----------|------|------|---------|----------|----------|--------------|--------|
| POST | `/api/login` | No | any | `{email, password}` or `{phone, password}` | `{token, user}` | DoctorLogin, AdminLogin | Hardcoded MOCK_USERS | NEEDS BACKEND |
| POST | `/api/logout` | JWT | any | — | `{}` | DoctorLogin, AdminLogin | No-op | NEEDS BACKEND |
| GET | `/api/verify-token` | JWT | any | — | `{valid: bool, user}` | RequireAuth (not called yet) | Returns `{valid: true}` | NEEDS BACKEND |
| POST | `/api/auth/otp/send` | No | doctor | `{phone}` or `{email}` | `{sent: bool}` | DoctorLogin OTP flow | Fake 900ms delay | NEEDS BACKEND |
| POST | `/api/auth/otp/verify` | No | doctor | `{code, phone\|email}` | `{token, user}` | DoctorLogin OTP flow | Fake 820ms delay | NEEDS BACKEND |
| POST | `/api/auth/password-reset` | No | doctor | `{contact}` | `{sent: bool}` | DoctorLogin forgot flow | Fake 900ms delay | NEEDS BACKEND |
| POST | `/api/auth/admin/otp/send` | No | admin | `{email}` | `{sent: bool}` | AdminLogin forgot flow | Fake 900ms delay | NEEDS BACKEND |
| POST | `/api/auth/admin/otp/verify` | No | admin | `{code, email}` | `{valid: bool}` | AdminLogin forgot flow | Fake 820ms delay | NEEDS BACKEND |
| POST | `/api/auth/admin/password-reset` | No | admin | `{email, newPassword}` | `{success: bool}` | AdminLogin new-password step | Fake 900ms delay | NEEDS BACKEND |
| POST | `/api/order` | JWT | doctor | See §6 | `{id: string}` | DoctorOrder submit | Returns fake ID, addOrder() local | NEEDS BACKEND |
| GET | `/api/orders` | JWT | admin | — | `Order[]` | AdminOrders, AdminHistory, AdminOverview | Zustand ORDERS | NEEDS BACKEND |
| GET | `/api/orders/pending` | JWT | admin | — | `Order[]` | AdminOverview pending panel | Zustand filtered | NEEDS BACKEND |
| GET | `/api/order/<id>` | JWT | any | — | `Order` | DoctorTrack (via store) | Zustand find | NEEDS BACKEND |
| POST | `/api/confirm/<id>` | JWT | admin | `{inspection_data, drone_id}` | `{mission_id}` | AdminOrders CONFIRM & LAUNCH | updateOrderStatus() local | NEEDS BACKEND |
| POST | `/api/received/<id>` | JWT | admin/doctor | — | `{verified: bool}` | AdminVerification | updateOrderStatus() local | NEEDS BACKEND |
| POST | `/api/cancel/<id>` | JWT | admin | — | `{}` | (Cancel button exists, no API call) | No-op | NEEDS BACKEND |
| POST | `/api/orders/<id>/feedback` | JWT | admin | `{note, timestamp}` | `{}` | InspectionModal feedback field | No-op | NEEDS BACKEND |
| GET | `/api/drone/status` | JWT | admin | — | `Drone[]` | AdminFleet, AdminOverview | Zustand DRONES | NEEDS BACKEND |
| GET | `/api/drone/telemetry` | JWT | admin | — | `TelemetryPoint` | AdminMissions, DoctorTrack | Zustand activeTelemetry | NEEDS BACKEND |
| POST | `/api/drone/emergency-rtl` | JWT | admin | `{drone_id?}` | `{}` | AdminMissions RTL button | Toast only | NEEDS BACKEND |
| POST | `/api/drone/hold` | JWT | admin | `{drone_id?}` | `{}` | AdminMissions HOLD button | Toast only | NEEDS BACKEND |
| POST | `/api/drone/resume` | JWT | admin | `{drone_id?}` | `{}` | AdminMissions RESUME button | Toast only | NEEDS BACKEND |
| GET | `/api/inventory` | JWT | admin | — | `InventoryItem[]` | AdminInventory, DoctorOrder | Zustand INVENTORY | NEEDS BACKEND |
| GET | `/api/inventory/check/<medicine>` | JWT | any | — | `{available: bool, quantity: number}` | DoctorOrder (via store currently) | Zustand find | NEEDS BACKEND |
| POST | `/api/inventory/update` | JWT | admin | `{id, quantity}` | `{}` | Not yet wired in any component | No-op | NEEDS BACKEND |
| GET | `/api/inventory/low-stock` | JWT | admin | — | `InventoryItem[]` | AdminAlerts (via store alerts) | Zustand filtered | NEEDS BACKEND |
| GET | `/api/locations` | JWT | any | — | `Location[]` | AdminLocations, DoctorOrder | Zustand LOCATIONS | NEEDS BACKEND |
| GET | `/api/location/<id>` | JWT | any | — | `Location` | Not directly called | Zustand find | NEEDS BACKEND |
| POST | `/api/locations/add` | JWT | admin | `Location data` | `{id}` | Not wired (no "Add Location" UI button) | No-op | MISSING |
| GET | `/api/temperature/current` | JWT | admin | — | `{temperature, timestamp}` | AdminColdChain, DoctorTrack | Zustand temperatureLogs.last | NEEDS BACKEND |
| GET | `/api/temperature/log/<order_id>` | JWT | any | — | `TemperatureLog[]` | AdminColdChain, TemperatureChart | generateTempLog() | NEEDS BACKEND |
| POST | `/api/send-sms` | JWT | admin | `{phone, message}` | `{sent: bool}` | Not wired yet | No-op | NEEDS BACKEND |
| GET | `/api/weather/check` | JWT | admin | — | `{safe: bool, wind_speed: number}` | InspectionModal weather check | Hardcoded pass | NEEDS BACKEND |
| POST | `/api/mission/launch` | JWT | admin | `{orderId}` | `{mission_id}` | InspectionModal handleAuthorize | Fake 1400ms delay | NEEDS BACKEND |
| GET | `/api/inspection/<order_id>` | JWT | admin | — | `InspectionCheck[]` | AdminOrders InspectionModal | INSPECTION_CHECKS mockData | NEEDS BACKEND |
| GET | `/api/alerts` | JWT | admin | — | `Alert[]` | AdminAlerts | Zustand ALERTS | NEEDS BACKEND |
| GET | `/api/analytics/daily` | JWT | admin | `?days=30` | `DailyMetric[]` | AdminAnalytics | generateDailyMetrics() | NEEDS BACKEND |
| GET | `/api/stats/summary` | JWT | any | — | `HeroStats` | LandingPage | HERO_STATS | LOW |

**Status key:**
- `NEEDS BACKEND` — Frontend has a prepared service call; backend must implement
- `MISSING` — No frontend endpoint call exists; backend may still need it
- `CONFIRMED` — Already working end-to-end
- `MISMATCH` — Frontend and spec disagree (documented in §20)

---

## 6. Full API Contracts

### POST /api/login

**Auth:** None  
**Purpose:** Authenticate doctor or admin by email+password

**Request body:**
```json
{
  "email": "priya.mohanty@medihawk.in",
  "password": "string (min 8 chars)",
  "role": "doctor | admin"
}
```
> NOTE: DoctorLogin also supports phone authentication. The `email` field may contain a phone number if the user chose phone-mode. Backend must accept either form.

**Expected response:**
```json
{
  "token": "JWT string",
  "user": {
    "id": "doc-001",
    "name": "Dr. Priya Mohanty",
    "role": "doctor",
    "phc": "phc-chandaka",
    "email": "priya.mohanty@medihawk.in",
    "phone": "+91-9861234567"
  }
}
```

**Error responses:**
- `401 { "error": "Invalid credentials" }`
- `400 { "error": "Email required" }`

**Frontend consumer:** `DoctorLogin.handleLogin()`, `AdminLogin.handleLogin()`  
**Required store action:** Replace `login('doctor')` with `login(userObject)` after JWT is received.

---

### POST /api/auth/otp/send

**Auth:** None  
**Purpose:** Send SMS/email OTP to doctor

**Request:**
```json
{ "phone": "9861234567" }
// OR
{ "email": "priya.mohanty@medihawk.in" }
```

**Response:**
```json
{ "sent": true, "expires_in": 60 }
```

**Note:** Backend must integrate with Twilio (or similar) for SMS OTP.

---

### POST /api/auth/otp/verify

**Auth:** None  
**Purpose:** Verify OTP and return JWT

**Request:**
```json
{
  "code": "847291",
  "phone": "9861234567"
}
```

**Response:**
```json
{
  "token": "JWT string",
  "user": { "id": "...", "name": "...", "role": "doctor", "phc": "phc-chandaka", ... }
}
```

---

### POST /api/order

**Auth:** JWT (doctor role)  
**Purpose:** Submit a new medicine delivery order

**Request body (derived from `DoctorOrder.handleSubmit()`):**
```json
{
  "doctor_id": "doc-001",
  "doctor_name": "Dr. Priya Mohanty",
  "from_location": "hub-01",
  "destination_location": "phc-chandaka",
  "priority": "emergency | urgent | normal",
  "notes": "Patient details, clinical context",
  "items": [
    {
      "id": "em-01",
      "name": "Polyvalent Antivenin",
      "quantity": 2,
      "category": "Emergency Medicine",
      "unit": "vials",
      "custom": false
    }
  ]
}
```

> NOTE: `destination_location` is currently hardcoded to `"phc-chandaka"` in the frontend. Once multi-location support is added, this must become dynamic. The frontend `from_location` is hardcoded to `"hub-01"`.

**Expected response:**
```json
{
  "id": "MH-2026-00422",
  "otp": "847291",
  "status": "pending",
  "ordered_at": "2026-09-14T10:23:00Z"
}
```

> CRITICAL: OTP must be generated server-side and returned here. Frontend currently generates it client-side — this is a security risk.

**Frontend consumer:** `DoctorOrder.handleSubmit()` — currently bypasses API and calls `addOrder()` directly in store.

---

### POST /api/confirm/<id>

**Auth:** JWT (admin role)  
**Purpose:** Authorize launch of drone mission after inspection

**Path param:** `id` = Order ID (e.g. `MH-2026-00421`)

**Request body (derived from `InspectionModal.handleAuthorize()` comment):**
```json
{
  "orderId": "MH-2026-00421",
  "drone_id": "MH-D02",
  "inspection_checks": [
    {
      "id": "propeller",
      "status": "pass",
      "detail": "Propellers secure"
    }
    // ... all 14 checks
  ],
  "authorized_by": "admin-001"
}
```

**Expected response:**
```json
{
  "mission_id": "MSN-2026-00422",
  "drone_id": "MH-D02",
  "launched_at": "2026-09-14T10:25:00Z",
  "status": "launched"
}
```

**Frontend consumer:** `AdminOrders.InspectionModal.handleAuthorize()` comment: `// Integration-ready: POST /api/mission/launch { orderId: order.id }`

> NOTE: The comment says `/api/mission/launch` but the API service has `POST /api/confirm/<id>`. **This is a MISMATCH — see §20.**

**Error responses:**
- `400 { "error": "Inspection not complete" }`
- `409 { "error": "No available drone" }`
- `503 { "error": "MAVProxy unavailable" }`

---

### POST /api/received/<id>

**Auth:** JWT (admin role)  
**Purpose:** Mark delivery as verified at destination

**Request:**
```json
{
  "otp": "847291",
  "receiver_name": "Nurse Rajani Pattnaik",
  "lat": 20.3512,
  "lng": 85.7612,
  "verified_by": "admin-001"
}
```

**Expected response:**
```json
{
  "verified": true,
  "verified_at": "2026-09-14T10:37:00Z"
}
```

**Frontend consumer:** `AdminVerification.handleVerify()`

---

### GET /api/drone/status

**Auth:** JWT  
**Expected response:**
```json
[
  {
    "id": "MH-D01",
    "name": "Hawk Alpha",
    "status": "in_flight",
    "lat": 20.3210,
    "lng": 85.7890,
    "altitude": 82.0,
    "speed": 46.0,
    "battery": 78.0,
    "temperature": 5.8,
    "gps_accuracy": 1.2,
    "connection": "stable",
    "link_type": "4G",
    "mission_id": "MSN-2026-00421",
    "health": {
      "motors": "ok",
      "sensors": "ok",
      "propellers": "ok",
      "payload_lock": "ok"
    },
    "last_updated": "2026-09-14T10:25:00Z",
    "total_missions": 187,
    "flight_hours": 312
  }
]
```

---

### Socket.IO: telemetry event

**Direction:** server → client  
**Frequency:** ~2 seconds (GPS), ~30 seconds (temperature)  

**Payload:**
```json
{
  "drone_id": "MH-D01",
  "mission_id": "MSN-2026-00421",
  "timestamp": "2026-09-14T10:25:00.000Z",
  "lat": 20.3210,
  "lng": 85.7890,
  "altitude": 82.0,
  "speed": 46.0,
  "battery": 78.0,
  "temperature": 5.8,
  "heading": 315,
  "gps_accuracy": 1.2,
  "connection": "stable"
}
```

> NOTE: The frontend `TelemetryPoint` type does NOT include `drone_id`, `mission_id`, `heading`. Backend should send all fields; frontend type needs extension before wiring (but frontend is frozen for now).

---

## 7. Doctor Portal Requirements

### Authentication
- Doctor logs in with: phone+password, email+password, or phone/email OTP
- After login: `user.role === 'doctor'`, `user.phc` is their assigned PHC ID
- Route guard: `/doctor/*` requires `role === 'doctor'`

### DoctorHome
**Data required from backend:**
- `orders` filtered by `doctor_id === user.id`
- `activeMission` (if current doctor has active order)
- `drones` (for altitude display in active delivery card)
- ETA: `activeMission.eta_minutes`

### DoctorOrder — Multi-Item Ordering Flow
**Step 1: Select Medicine**
- Catalog is frontend-hardcoded (26 items across 5 categories + custom)
- Stock status shown from `INVENTORY` mock — must eventually come from `GET /api/inventory`
- Max quantity per item capped by inventory stock (`inv.quantity`)
- Custom items allowed (free-text name, unit = 'units', maxQty = 50)

**Step 2: Order Details**
- Priority: `emergency | urgent | normal`
- Delivery location: **currently hardcoded to "PHC Chandaka"** — auto-filled, not user-selectable
- Clinical notes: optional free-text string

**Step 3: Confirm**
- Displays order summary with all items, priorities, from/to, est. 11–14 min

**Step 4: Submit**
- `handleSubmit()` currently: creates fake order ID, generates random OTP, calls `addOrder()` directly in Zustand
- Must become: `POST /api/order` → receive real `{id, otp, status, ordered_at}` → then update local store

**What backend must return:**
```json
{
  "id": "MH-2026-00422",
  "otp": "server-generated 6-digit code",
  "status": "pending",
  "ordered_at": "ISO timestamp"
}
```

### DoctorTrack — Live Delivery
**Data required:**
- Active order (matching `doctor_id === user.id`, status in `['in_flight','launched','preparing','approved','pending']`)
- Active mission (for map, ETA, waypoints)
- Drone object (for altitude, speed, battery, temperature, connection)
- `temperatureLogs` (for TemperatureChart and current temp display)
- Order lifecycle timestamps: `ordered_at`, `launched_at`, `delivered_at`

**Frontend expects:**
- Real-time drone updates (currently from simulation)
- Temperature chart shows last ~40 log entries
- "Last sync" shown as "2 sec ago" (hardcoded string)

**OTP display:** `activeOrder.otp` shown to doctor for delivery confirmation (field name: `otp`)

### DoctorHistory
- All orders for `doctor_id === user.id`
- Filter by status (all/completed/emergency/cancelled) and search by medicine/ID

---

## 8. Admin Portal Requirements

### AdminOverview
**Metrics required:**
- `activeOrders.length` — statuses: `in_flight | launched | preparing | approved`
- `pendingOrders.length` — status: `pending`
- `availableDrones` count — drone status: `available`
- `criticalAlerts` count — unacknowledged, severity: `critical`
- `flyingDrone` — `drones.find(d => d.status === 'in_flight')`
- Last temperature reading
- Active mission (for map and ETA display)

### AdminOrders
**Data required:**
- All orders (with search, filter: all/pending/active/completed)
- Inspection checks for a given order (currently from `INSPECTION_CHECKS` mockData)
- Drone info for assignment display

**Actions:**
1. **INSPECT** (for pending orders) → opens InspectionModal
2. **Eye icon** → expandable row with doctor, drone, delivery time, notes

### AdminOrders — InspectionModal (Critical)
**Inspection check groups (from INSPECTION_CHECKS mockData):**

*Airframe & Hardware (3 checks):*
- `propeller` — Propeller Tightness
- `airframe` — Drone Airframe Inspection
- `battery_mount` — Battery Mount Inspection

*Payload & Medical (6 checks):*
- `medicine` — Medicine Identity
- `quantity` — Quantity
- `expiry` — Expiry Date
- `temperature` — Payload Temperature
- `sealed` — Payload Sealed
- `mounted` — Box Mounted

*Systems & Connectivity (5 checks):*
- `battery` — Battery
- `gps` — GPS Lock
- `weather` — Weather Clearance
- `4g` — 4G Link
- `zerotier` — ZeroTier Link (optional, mandatory=false)

**canLaunch rule:** `allMandatoryPass && !hasBlocked`  
**Mandatory checks:** all checks with `mandatory: true` (all except `zerotier`)  
**Drone displayed:** hardcoded `'MH-D02 · Hawk Beta'` — must become dynamic assignment from backend

**CONFIRM & LAUNCH button:** Enabled only when `canLaunch === true`

### AdminMissions
**Data required:**
- `activeMission` object (full Mission type with waypoints, events, medicine, quantities, route, ETA)
- `flyingDrone` — drone with `mission_id` field populated
- `temperatureLogs` for TemperatureChart

**Emergency controls:**
- HOLD → currently: `toast('info', 'Mission Hold', ...)` only
- RESUME → currently: `toast('info', 'Mission Resumed', ...)` only
- EMERGENCY RTL → currently: `toast('warning', 'Emergency RTL Initiated', ...)` only
- **None make any API or Socket.IO call — all must be wired to backend**

### AdminFleet
**Data required:** Full `Drone[]` array with all fields

### AdminSafety
**Current state:** Entirely static data. `SAFETY_CHECKS` and `AI_EVENTS` are hardcoded arrays.  
**Required:** Real sensor data for GPS, battery, weather, network, obstacle detection, autonomy stack status.

### AdminAlerts
**Data required:** `Alert[]` with acknowledge action  
**Actions:** Acknowledge alert → `acknowledgeAlert(id)` in store (must eventually call backend)

### AdminVerification
**Three verification factors:**
1. **Geofence Match:** hardcoded `true` — must become real geofence check (drone GPS vs. destination coordinates)
2. **Receiver Name:** typed by admin (string field `receiverName`)
3. **OTP:** compared against `deliveredOrder.otp` (client-side string compare)

**canVerify:** `geofenceMatch && otpMatch && receiverFilled`  
**On verify:** `updateOrderStatus(id, 'verified')` in store + `POST /api/received/<id>`

> CRITICAL: OTP comparison must move to backend — backend should validate OTP, not client.

### AdminAnalytics
**Data required:**
- `generateDailyMetrics(30)` → `GET /api/analytics/daily?days=30`
- Priority distribution from real `orders` data
- Fleet utilization stats (total_missions, flight_hours per drone — already on `Drone` type)
- Cold-chain compliance — must come from temperature log analysis

### AdminLocations
**Data required:** `LOCATIONS` → `GET /api/locations`

### AdminInventory
**Data required:** `INVENTORY` → `GET /api/inventory`

### AdminHistory / DoctorHistory
**Data required:** All orders with full fields (including delivery timestamps, times, drone_id)

### AdminColdChain
**Data required:**
- `temperatureLogs[]` for chart
- `activeMission` for header
- Current temp, min/max, excursion count (breaches outside 2–8°C)
- `CHAIN_EVENTS` (hardcoded 6 events — must come from mission audit log)

### AdminDemoControls
- Visible only when `isDemo === true`
- Pause/Resume simulation, reset state, inject scenarios
- Must be completely hidden in LIVE mode

---

## 9. Authentication Contract

### Current State (Demo Mode)
- Login calls `login('doctor')` or `login('admin')` → sets hardcoded `MOCK_USERS[role]` in Zustand
- No JWT token anywhere
- No localStorage persistence — user is lost on page refresh
- No token expiry handling
- No role-based API protection

### Required Contract (Live Mode)

**Doctor Login:**
```
Email+PW:    POST /api/login { email, password, role:"doctor" } → {token, user}
Phone+PW:    POST /api/login { phone, password, role:"doctor" } → {token, user}
Phone OTP:   POST /api/auth/otp/send { phone } 
             POST /api/auth/otp/verify { code, phone } → {token, user}
Email OTP:   POST /api/auth/otp/send { email }
             POST /api/auth/otp/verify { code, email } → {token, user}
```

**Admin Login:**
```
Email+PW:    POST /api/login { email, password, role:"admin" } → {token, user}
Forgot PW:   POST /api/auth/admin/otp/send { email }
             POST /api/auth/admin/otp/verify { code, email } → {valid:true}
             POST /api/auth/admin/password-reset { email, newPassword }
```

**Token handling (frontend must be updated when IS_DEMO=false):**
- Store JWT in `localStorage` or `sessionStorage`
- Send `Authorization: Bearer <token>` header
- `GET /api/verify-token` on app load to re-authenticate
- On 401 response: clear token, redirect to login

**User object shape (must match frontend `User` type):**
```typescript
{
  id: string        // e.g. "doc-001"
  name: string      // e.g. "Dr. Priya Mohanty"
  role: "doctor" | "admin"
  phc?: string      // Location ID of doctor's PHC — doctors only
  email: string
  phone?: string
}
```

**Security requirements:**
- bcrypt password hashing
- JWT with expiry (suggest 8–24h for demo, 1h for production)
- Admin endpoints require `role === "admin"` validation server-side
- Doctor endpoints filter data by `doctor_id` server-side

---

## 10. Order Lifecycle

### Frontend Status Values (from `src/types/index.ts`)

```
OrderStatus = 'pending' | 'approved' | 'preparing' | 'launched' | 'in_flight' 
            | 'landing' | 'delivered' | 'verified' | 'cancelled'
```

### Mission Status Values (from `src/types/index.ts`)

```
MissionStatus = 'pending_approval' | 'approved' | 'preparing' | 'in_flight'
              | 'landing' | 'delivered' | 'returning' | 'completed' | 'aborted'
```

### Order Status Transitions (as used in frontend)

| From | To | Trigger | Who | API |
|------|----|---------|-----|-----|
| — | `pending` | Doctor submits order | Doctor | `POST /api/order` |
| `pending` | `launched` | Admin confirms & launches | Admin | `POST /api/confirm/<id>` |
| `launched` | `in_flight` | Drone airborne | Backend/MAVProxy | Socket.IO `order_status` |
| `in_flight` | `landing` | Drone at destination | Backend/MAVProxy | Socket.IO `drone_landed` |
| `landing` | `delivered` | Drone lands | Backend/MAVProxy | Socket.IO `mission_complete` |
| `delivered` | `verified` | Admin/receiver verifies OTP | Admin | `POST /api/received/<id>` |
| any | `cancelled` | Admin cancels | Admin | `POST /api/cancel/<id>` |

> NOTE: The frontend uses `updateOrderStatus(id, 'launched')` directly — not 'approved' → 'preparing' → 'launched'. The simulation jumps from 'pending' to 'launched' in one step. The backend may use a more granular lifecycle if desired, but the frontend currently only handles the statuses listed in the `OrderStatus` type above.

> NOTE: `approved` and `preparing` statuses exist in the type but are NOT used in any current flow. They appear in filter logic for "active orders" but no transition sets them.

### Order Object Shape (exact frontend structure)
```typescript
{
  id: string                    // "MH-2026-00421"
  doctor_id: string             // "doc-001"
  doctor_name: string           // "Dr. Priya Mohanty"
  from_location: string         // Location ID "hub-01"
  from_location_name: string    // "MediHawk Central Hub"
  destination_location: string  // Location ID "phc-chandaka"
  destination_name: string      // "PHC Chandaka"
  medicine: string              // "Polyvalent Antivenin" or "Polyvalent Antivenin (+2 more)"
  quantity: number              // total units (sum of all items)
  unit: string                  // "units" (for multi-item), or specific unit for single item
  priority: 'emergency' | 'urgent' | 'normal'
  status: OrderStatus
  drone_id?: string             // set when drone assigned
  inspection_done: boolean
  qr_verified: boolean          // NOTE: QR removed from workflow per spec, but field remains
  temperature: number           // 0 until drone reports, then °C
  ordered_at: string            // ISO timestamp
  launched_at?: string
  delivered_at?: string
  delivery_time_minutes?: number
  notes?: string
  otp?: string                  // 6-digit code for delivery verification
  receiver_verified?: boolean
  items?: OrderItem[]           // array of selected medicines (multi-item orders)
}
```

---

## 11. Inspection Contract

### Current State
- `INSPECTION_CHECKS` in `mockData.ts` — 14 checks, all hardcoded to `status: 'pass'`
- Loaded by `InspectionModal` as local state: `const [checks] = useState<InspectionCheck[]>(INSPECTION_CHECKS)`
- Checks are **not interactive** — user cannot change status in current UI
- All checks for "pending order" actually reference hardcoded medicine/qty/drone from **a different order** (the Oxytocin order data is in the mockData checks, not the actually-selected pending order)

### InspectionCheck Type
```typescript
{
  id: string          // 'propeller' | 'airframe' | 'battery_mount' | 'medicine' | etc.
  label: string       // Display label
  status: 'pass' | 'warning' | 'blocked' | 'pending'
  detail?: string     // Detail text shown under label
  mandatory: boolean  // If blocked, launch is prevented
}
```

### Required Backend Behavior
`GET /api/inspection/<order_id>` should return:
- Medicine identity (name + order quantity)
- Expiry date from inventory record
- Current payload temperature (from sensor)
- Drone battery level (from drone telemetry)
- GPS lock status (from drone telemetry)
- Weather clearance (from weather API)
- 4G link status (from network telemetry)
- ZeroTier link status (from network telemetry)
- Hardware checks (propeller, airframe, battery_mount) — may remain manual/pre-checked

The check IDs and labels must match exactly what's in `INSPECTION_CHECKS` since the modal groups by ID.

### Required check IDs (must remain identical)
```
propeller, airframe, battery_mount, medicine, quantity, expiry, 
temperature, sealed, mounted, battery, gps, weather, 4g, zerotier
```

---

## 12. Launch Contract — Critical Analysis

### What Currently Happens When Admin Clicks "CONFIRM & LAUNCH"

```
1. Admin clicks "INSPECT" on a pending order
   → opens InspectionModal with INSPECTION_CHECKS (all 'pass', hardcoded)

2. Admin reviews inspection checks (no interactive toggling)

3. canLaunch = allMandatoryPass && !hasBlocked
   → Since all checks hardcoded 'pass': canLaunch = TRUE immediately

4. Admin clicks "Confirm & Launch" button
   → setStep('confirm')

5. Admin clicks "Authorize Launch" in confirm step
   → handleAuthorize() fires

6. handleAuthorize():
   // Integration-ready: POST /api/mission/launch { orderId: order.id }
   await new Promise(r => setTimeout(r, 1400))  // FAKE 1400ms delay
   onLaunch()

7. onLaunch() → handleLaunch(order):
   updateOrderStatus(order.id, 'launched')   // Zustand state mutation
   setInspecting(null)                        // Close modal
   toast('success', ...)

NO backend call. NO Socket.IO emit. NO MAVProxy. NO Pixhawk.
```

### What Must Happen in Live Mode

```
Admin Portal (Browser)
    ↓
POST /api/confirm/<order_id> (authenticated, admin-only)
{
    drone_id: "MH-D02",           ← selected dynamically from available fleet
    inspection_checks: [...],     ← real check results
    authorized_by: user.id
}
    ↓
Flask Backend:
    1. Validate JWT and role === 'admin'
    2. Validate order exists and status === 'pending'
    3. Validate all mandatory inspection checks pass
    4. Validate drone MH-D02 status === 'available'
    5. Validate weather API clearance
    6. Check battery > 50% (launch minimum per safety constants)
    7. Validate GPS lock active
    8. Create Mission record in database
    9. Set order status → 'launched', assign drone_id
    10. Set drone status → 'preparing'
    ↓
MAVProxy bridge (Python subprocess / pymavlink)
    ↓ 
MAVLink / UDP
    ↓
Pixhawk FC
    ↓
Takeoff command
    ↓
Telemetry feedback → Flask Backend → Socket.IO → Frontend
```

### Critical Safety Constraint
**The browser MUST NOT directly control Pixhawk or MAVProxy.**
All drone commands (launch, hold, resume, RTL) must go through the authenticated Flask backend which validates state before sending to MAVProxy.

### Integration Point Identifier
The exact line in the source that must be replaced:
- **File:** `src/pages/admin/AdminOrders.tsx`
- **Function:** `InspectionModal.handleAuthorize()`  
- **Line:** `await new Promise(r => setTimeout(r, 1400))`
- **Replace with:** Real `POST /api/confirm/<order_id>` call from `orderService.confirm(order.id)`

---

## 13. Drone Telemetry Contract

### Current Mock Telemetry (Simulation Engine)
The simulation engine generates telemetry every 2 seconds:

| Field | Source | Update Frequency |
|-------|--------|-----------------|
| lat/lng | Linear interpolation from hub to PHC | Every 2s |
| altitude | Sine curve (0→80→0 m) | Every 2s |
| speed | 44 ± 2 km/h, slows to 20 near destination | Every 2s |
| battery | Starts at 78%, decreases 0.08% per tick | Every 2s |
| temperature | 5.6°C ± 0.2°C random | Every 2s |

### Frontend TelemetryPoint Type
```typescript
{
  timestamp: string   // ISO
  altitude: number    // metres
  speed: number       // km/h
  battery: number     // percentage 0-100
  temperature: number // Celsius
  lat: number
  lng: number
}
```

> NOTE: Frontend type lacks `drone_id`, `mission_id`, `heading`, `gps_accuracy`, `connection`. Backend should extend the payload; frontend type needs updating before real wiring (frontend frozen now).

### Temperature Log Type
```typescript
{
  timestamp: string
  temperature: number
  event?: string      // "Payload loaded" | "Drone sealed" | "Launch" | undefined
}
```

### Telemetry Storage in Store
- `activeTelemetry`: last 60 TelemetryPoints (ring buffer)
- `temperatureLogs`: separate array, generated at startup and not updated by simulation

> NOTE: The simulation updates `activeTelemetry` via `pushTelemetry()` but does NOT update `temperatureLogs`. Real backend should push temperature updates via Socket.IO which calls `pushTelemetry()` (temperature is in TelemetryPoint already).

### Safety Thresholds (hardcoded in multiple files)
- **Temperature warning:** > 8°C
- **Temperature critical:** > 12°C (per redesign memory)
- **Battery minimum for launch:** > 50% (per redesign memory, inspection check shows 20% minimum — discrepancy exists)
- **Safe temp range displayed:** 2–8°C

### Stale Telemetry Handling
- **Currently: none.** No detection, no timeout, no visual warning.
- "Last sync" shown as hardcoded string "2 sec ago" in DoctorTrack
- Backend must track `last_updated` timestamp on drone objects

### Drone Status Values Used in Frontend
```
'available' | 'preparing' | 'in_flight' | 'returning' | 'maintenance' | 'offline'
```

---

## 14. Socket.IO Event Contract

### Defined Events (from `src/services/websocket/index.ts`)

```typescript
export const SOCKET_EVENTS = {
  TELEMETRY:       'telemetry',
  NEW_ORDER:       'new_order',
  ORDER_STATUS:    'order_status',
  TEMP_WARNING:    'temp_warning',
  TEMP_CRITICAL:   'temp_critical',
  DRONE_LANDED:    'drone_landed',
  DRONE_RTL:       'drone_rtl',
  MISSION_COMPLETE:'mission_complete',
  LOW_STOCK_ALERT: 'low_stock_alert',
}
```

**CRITICAL:** `initWebSocket()` is NEVER CALLED from any component. The WebSocket service is defined but not initialized. There are NO `socket.on()` listeners anywhere in the React component tree.

### Required Event Payloads

| Event | Direction | Payload | Consumer | Current Mock |
|-------|-----------|---------|----------|--------------|
| `telemetry` | S→C | `TelemetryPoint + drone_id + mission_id` | All mission/tracking pages | Simulation engine pushTelemetry() |
| `new_order` | S→C | `Order` | AdminOverview, AdminOrders | `addOrder()` local |
| `order_status` | S→C | `{order_id, status, timestamp}` | All order pages | `updateOrderStatus()` local |
| `temp_warning` | S→C | `{temperature, drone_id, mission_id, timestamp}` | AdminAlerts, AdminColdChain | Scenario injection `addAlert()` |
| `temp_critical` | S→C | `{temperature, drone_id, mission_id, timestamp}` | AdminAlerts, AdminColdChain | Not currently simulated |
| `drone_landed` | S→C | `{drone_id, lat, lng, timestamp}` | AdminMissions, DoctorTrack | Simulation at missionProgress=1.0 |
| `drone_rtl` | S→C | `{drone_id, reason, timestamp}` | AdminMissions, AdminAlerts | Not currently simulated |
| `mission_complete` | S→C | `{mission_id, order_id, delivered_at}` | AdminMissions, DoctorTrack | Simulation reset |
| `low_stock_alert` | S→C | `{medicine, quantity, threshold}` | AdminAlerts | `addAlert()` local |

### Integration Steps Required (not Phase 0)
1. `initWebSocket(VITE_WS_URL)` must be called in App.tsx when `!isDemo`
2. Real Socket.IO instance created using `socket.io-client`
3. Event handlers must call store actions (same actions simulation currently uses)
4. Connection state must update `systemStatus.websocket`

---

## 15. Database Requirements

### Proposed Entities (inferred from frontend contracts)

**doctors**
```
id          TEXT PRIMARY KEY    "doc-001"
name        TEXT NOT NULL       "Dr. Priya Mohanty"
email       TEXT UNIQUE
phone       TEXT UNIQUE
phc_id      TEXT REFERENCES locations(id)
password_hash TEXT             bcrypt hash
created_at  TIMESTAMP
```

**admins**
```
id          TEXT PRIMARY KEY    "admin-001"
name        TEXT NOT NULL
email       TEXT UNIQUE NOT NULL
password_hash TEXT
created_at  TIMESTAMP
```

**locations**
```
id          TEXT PRIMARY KEY    "hub-01" | "phc-chandaka" | ...
name        TEXT NOT NULL
type        TEXT                "hub" | "phc" | "chc"
district    TEXT
lat         REAL
lng         REAL
contact     TEXT
address     TEXT
doctor_id   TEXT REFERENCES doctors(id)
```

**inventory**
```
id                  TEXT PRIMARY KEY
medicine            TEXT NOT NULL
quantity            INTEGER NOT NULL
unit                TEXT
temperature_required TEXT
expiry_date         TEXT
status              TEXT    "in_stock" | "low_stock" | "critical" | "expiring"
category            TEXT
min_threshold       INTEGER
last_updated        TIMESTAMP
```

**orders**
```
id                    TEXT PRIMARY KEY    "MH-2026-00421"
doctor_id             TEXT REFERENCES doctors(id)
doctor_name           TEXT
from_location         TEXT REFERENCES locations(id)
destination_location  TEXT REFERENCES locations(id)
medicine              TEXT                summary string
quantity              INTEGER
unit                  TEXT
priority              TEXT    "emergency" | "urgent" | "normal"
status                TEXT    (see OrderStatus values)
drone_id              TEXT REFERENCES drones(id)
inspection_done       BOOLEAN DEFAULT FALSE
qr_verified           BOOLEAN DEFAULT FALSE
temperature           REAL DEFAULT 0
ordered_at            TIMESTAMP NOT NULL
launched_at           TIMESTAMP
delivered_at          TIMESTAMP
delivery_time_minutes INTEGER
notes                 TEXT
otp                   TEXT                6-digit string (server-generated)
receiver_verified     BOOLEAN DEFAULT FALSE
receiver_name         TEXT
authorized_by         TEXT REFERENCES admins(id)
created_at            TIMESTAMP DEFAULT NOW()
```

**order_items** (for multi-item orders)
```
id          INTEGER PRIMARY KEY AUTOINCREMENT
order_id    TEXT REFERENCES orders(id)
name        TEXT NOT NULL
quantity    INTEGER
category    TEXT
unit        TEXT
custom      BOOLEAN DEFAULT FALSE
```

**drones**
```
id            TEXT PRIMARY KEY    "MH-D01"
name          TEXT                "Hawk Alpha"
status        TEXT
lat           REAL
lng           REAL
altitude      REAL
speed         REAL
battery       REAL
temperature   REAL
gps_accuracy  REAL
connection    TEXT
link_type     TEXT
mission_id    TEXT
health_motors TEXT
health_sensors TEXT
health_propellers TEXT
health_payload_lock TEXT
last_updated  TIMESTAMP
total_missions INTEGER DEFAULT 0
flight_hours  REAL DEFAULT 0
```

**missions**
```
id              TEXT PRIMARY KEY    "MSN-2026-00421"
order_id        TEXT REFERENCES orders(id)
drone_id        TEXT REFERENCES drones(id)
from_lat        REAL
from_lng        REAL
to_lat          REAL
to_lng          REAL
distance_km     REAL
eta_minutes     INTEGER
elapsed_minutes REAL
status          TEXT    (see MissionStatus values)
medicine        TEXT
quantity        INTEGER
priority        TEXT
launched_at     TIMESTAMP
completed_at    TIMESTAMP
```

**telemetry_log**
```
id          INTEGER PRIMARY KEY AUTOINCREMENT
drone_id    TEXT REFERENCES drones(id)
mission_id  TEXT REFERENCES missions(id)
timestamp   TIMESTAMP NOT NULL
lat         REAL
lng         REAL
altitude    REAL
speed       REAL
battery     REAL
temperature REAL
heading     REAL
gps_accuracy REAL
```

**temperature_log**
```
id          INTEGER PRIMARY KEY AUTOINCREMENT
order_id    TEXT REFERENCES orders(id)
mission_id  TEXT REFERENCES missions(id)
timestamp   TIMESTAMP NOT NULL
temperature REAL
event       TEXT
```

**alerts**
```
id                TEXT PRIMARY KEY
severity          TEXT    "critical" | "warning" | "info"
category          TEXT    "temperature" | "connection" | "battery" | "weather" | "mission" | "inventory" | "system"
title             TEXT
description       TEXT
recommended_action TEXT
mission_id        TEXT
drone_id          TEXT
timestamp         TIMESTAMP
acknowledged      BOOLEAN DEFAULT FALSE
acknowledged_by   TEXT REFERENCES admins(id)
acknowledged_at   TIMESTAMP
```

**inspection_records**
```
id          INTEGER PRIMARY KEY AUTOINCREMENT
order_id    TEXT REFERENCES orders(id)
drone_id    TEXT REFERENCES drones(id)
check_id    TEXT
label       TEXT
status      TEXT    "pass" | "warning" | "blocked" | "pending"
detail      TEXT
mandatory   BOOLEAN
checked_at  TIMESTAMP
```

**otp_sessions**
```
id          INTEGER PRIMARY KEY AUTOINCREMENT
contact     TEXT NOT NULL   (phone or email)
code        TEXT NOT NULL   (6-digit)
purpose     TEXT            "login" | "password-reset" | "delivery-verify"
created_at  TIMESTAMP
expires_at  TIMESTAMP
used        BOOLEAN DEFAULT FALSE
```

---

## 16. Hawkie Requirements

### Current Implementation
- Pure deterministic frontend logic in `src/services/hawkie/index.ts`
- No AI/LLM integration
- Intent detection via regex on user query
- All answers derived from Zustand store state
- 13 intent categories: SAFETY_COMMAND, MEDICAL, BATTERY, GPS_DRONE, TEMPERATURE, ETA, ALERTS, LAUNCH_READY, PENDING, MISSION, NETWORK, FLEET, HISTORY, SITUATION

### Live Backend Data Hawkie Needs

| Question Type | Data Required | Current Source | Required Backend |
|---------------|---------------|----------------|-----------------|
| "Where is the drone?" | `drone.lat, drone.lng, drone.altitude, drone.speed` | Simulation | Socket.IO telemetry |
| "What is battery?" | `drone.battery` | Simulation | Socket.IO telemetry |
| "What is ETA?" | `activeMission.eta_minutes, activeMission.elapsed_minutes` | Simulation | Socket.IO mission update |
| "Is temperature safe?" | `systemStatus.temperature, drone.temperature` | Simulation | Socket.IO temp event |
| "Are there alerts?" | `alerts` array | mockData | `GET /api/alerts` |
| "Can we launch?" | `drones.available.length, gps status, critical alerts` | All mock | Real backend + GPS |
| "What orders are pending?" | `orders.filter(status==='pending')` | mockData | `GET /api/orders/pending` |
| "Is drone connected?" | `drone.connection, systemStatus.fourG` | Simulation | Socket.IO + backend health |
| "Fleet status?" | `drones[]` array | mockData | `GET /api/drone/status` |
| "History?" | `orders.filter(completed)` | mockData | `GET /api/orders` |
| Network status | `systemStatus.{backend,websocket,fourG,zerotier}` | mockData | Backend health + Socket.IO |

### Hawkie Roles
- Available in **both portals** (Doctor + Admin) via floating HawkieFloat button
- AdminHawkie page has an embedded full-screen version
- Doctor Hawkie shows same responses (no role-differentiation in current logic, but `ctx.user` is passed and `portal` prop is available)

### Offline Handling
When `systemStatus.backend === 'disconnected'`, AdminHawkie shows an offline warning banner. Hawkie uses last-known store state (stale data).

---

## 17. Demo vs Live Architecture

### Current Demo Mode (ALL components)
```
Browser
  └─ Zustand Store (seeded from mockData.ts)
       └─ Simulation Engine (2s tick)
            └─ Fake telemetry, fake mission progress, fake alerts
```

- `isDemo: true` in store (hardcoded)
- `IS_DEMO = true` in `src/services/api/index.ts` (hardcoded)
- `AdminDemoControls` footer bar (visible in all admin pages)
- Simulation starts via `useSimulation()` hook in `App.tsx` (`SimulationRunner` component)
- `demoSuffix()` in Hawkie appends "_(Simulation data)_" to all answers
- AMBER "DEMO" indicator in demo controls footer

### Required Live Mode Architecture
```
Browser
  └─ Zustand Store (seeded from backend APIs)
       └─ Socket.IO listener (updates store in real time)
            └─ Real telemetry from MAVProxy → Flask → Socket.IO
```

**Switching mechanism needed:**
1. Set `IS_DEMO = false` in api service
2. Set `isDemo = false` in store (or via env var `VITE_DEMO_MODE`)
3. Remove/skip simulation engine start
4. Initialize WebSocket connection to backend
5. Load initial data from backend APIs instead of mockData

**CRITICAL: Live mode must NEVER fall back to fake telemetry silently.**  
If the backend is unavailable, show an explicit "BACKEND DISCONNECTED" error state, not stale simulation data.

### Recommended Environment Variables
```
VITE_API_URL=http://localhost:5000      # Flask backend
VITE_WS_URL=http://localhost:5000      # Socket.IO
VITE_DEMO_MODE=true                    # Controls isDemo flag
```

---

## 18. Error Handling Requirements

### Current Frontend Error States

| Scenario | Current Behavior | Required Backend Contract |
|----------|-----------------|--------------------------|
| Login fails | Shows `formError` state, user stays on login | `401 { error: "Invalid credentials" }` |
| OTP send fails | Shows error string in state | `429 { error: "Too many requests" }` or `400 { error: "..." }` |
| Order submit fails | No real error path (no API call) | `400 { error: "Inventory unavailable" }` or `500` |
| Backend unavailable | systemStatus.backend hardcoded 'connected' | WebSocket disconnect → `setSystemStatus({backend:'disconnected'})` |
| Launch command fails | InspectionModal shows `step='error'` with errorMsg | `503 { error: "MAVProxy unavailable" }`, `409 { error: "..." }` |
| RTL/HOLD/RESUME fails | Toast only, no error state | Must wire API calls + handle failures |
| Telemetry stale | Not detected | Backend should send heartbeat or last_updated timestamp |
| Socket.IO disconnect | No detection (mock socket) | `socket.on('disconnect', ...)` → `setSystemStatus({websocket:'disconnected'})` |
| Token expired | No detection | `401` response → clear token → redirect to login |
| Mission aborted | No handler | `drone_rtl` Socket.IO event → update order/mission status |
| Temperature critical | `addAlert()` via scenario injection only | `temp_critical` Socket.IO event → `addAlert()` + `setSystemStatus({temperature:'critical'})` |
| Inventory low-stock | Pre-seeded alerts only | `low_stock_alert` Socket.IO event → `addAlert()` |

### Launch Error State (already exists in UI)
`InspectionModal` has a proper `step='error'` view with:
- "Launch Command Failed" heading
- `errorMsg` string (currently set to `'Command Center unavailable. Mission command could not be sent.'`)
- "Review Checks" and "Retry" buttons

**Backend must return machine-readable error codes so the frontend can display appropriate messages.**

---

## 19. Security Findings

### 🔴 CRITICAL SECURITY ISSUES

**S1: Client-side OTP generation**
- `src/pages/doctor/DoctorOrder.tsx` line ~259: `otp: Math.floor(100000 + Math.random() * 900000).toString()`
- OTP is generated in the browser and stored in the order object
- Any doctor can see the OTP before delivery by inspecting the order
- OTP must be generated server-side, stored hashed, and never returned in the order response to the doctor

**S2: Client-side OTP verification**
- `src/pages/admin/AdminVerification.tsx` line ~19: `const otpMatch = otpInput === (deliveredOrder?.otp ?? '847291')`
- OTP is compared in the browser — any value in `deliveredOrder.otp` is visible to the admin browser
- OTP verification must be server-side: `POST /api/received/<id> { otp }` → backend validates

**S3: No JWT storage or validation**
- No token in localStorage/sessionStorage
- `RequireAuth` checks only `user !== null` in Zustand (in-memory)
- Refresh loses session; no re-authentication
- Admin actions have no server-side authorization — any client can call APIs if endpoint exposed

**S4: Hardcoded geofence bypass**
- `src/pages/admin/AdminVerification.tsx`: `const geofenceMatch = true`
- Delivery can be "verified" anywhere regardless of drone GPS position

### 🟠 IMPORTANT SECURITY CONCERNS

**S5: No role validation on operations**
- In live mode, backend must validate `role === 'admin'` for all operational endpoints
- Launch, RTL, Hold, Resume must require admin JWT

**S6: Demo OTP displayed in UI**
- `AdminVerification.tsx`: `<p className="text-2xs text-text-muted mt-2">Demo OTP: {deliveredOrder?.otp ?? '847291'}</p>`
- This hint must be removed in live mode

**S7: No CSRF protection**
- No CSRF tokens in any form
- Flask backend should use Flask-WTF or SameSite cookies

**S8: MAVProxy/Pixhawk not accessible from browser**
- Currently no danger (all drone commands are toasts)
- When wired: Backend must be the only entity commanding MAVProxy
- ZeroTier secrets and drone IP must never appear in frontend env vars

**S9: VITE_API_URL / VITE_WS_URL exposed in build**
- Vite exposes `VITE_*` env vars in client bundle
- Do not put secrets (API keys, Twilio credentials, ZeroTier keys) in VITE_ variables

---

## 20. Frontend / Backend Mismatches

### M1: Launch endpoint name conflict
- **API service:** `POST /api/confirm/<id>` → `orderService.confirm(id)`
- **InspectionModal comment:** `// Integration-ready: POST /api/mission/launch { orderId: order.id }`
- **Decision required:** Which endpoint name wins? Recommend `/api/confirm/<id>` per api service (matches REST pattern)

### M2: Auth endpoints not in intended spec
- **Frontend comments reference:** `/api/auth/otp/send`, `/api/auth/otp/verify`, `/api/auth/admin/otp/send`, `/api/auth/admin/otp/verify`, `/api/auth/admin/password-reset`, `/api/auth/password-reset`
- **MediHawk spec lists:** only `POST /api/login`, `POST /api/logout`, `GET /api/verify-token`
- **Decision required:** OTP login must be added to backend (it's built into the doctor login UI)

### M3: TelemetryPoint missing drone_id, mission_id, heading
- **Frontend type:** `{timestamp, altitude, speed, battery, temperature, lat, lng}`
- **Backend should send:** all above + `drone_id, mission_id, heading, gps_accuracy, connection`
- **Impact:** Frontend needs type extension before wiring, but can ignore extra fields gracefully

### M4: Order status 'approved' and 'preparing' unused
- **Type defines:** `'pending' | 'approved' | 'preparing' | 'launched' | ...`
- **Actual flow uses:** `'pending' → 'launched'` (no approved or preparing transitions exist)
- **Decision required:** Does backend implement intermediate states? If so, add them to frontend flow

### M5: Drone assignment hardcoded in launch UI
- **Frontend shows:** "MH-D02 · Hawk Beta" hardcoded in InspectionModal mission information and confirm step
- **Real backend:** Must dynamically select/assign an available drone
- **Impact:** The confirm step summary shows a fake drone name; backend response must include assigned `drone_id`

### M6: Battery minimum threshold discrepancy
- **Inspection check detail shows:** "96% — above minimum 20%"
- **Memory notes:** Launch battery minimum is > 50%
- **Decision required:** Settle on one threshold for the backend validation

### M7: `medicine` field is a summary string for multi-item orders
- **Frontend:** `medicine = "Polyvalent Antivenin (+2 more)"` for multi-item orders
- **Backend:** Has individual `order_items` array
- **Impact:** Backend must store canonical medicine name / summary string AND the full items list

### M8: QR verification field exists but flow is removed
- **Order type:** has `qr_verified: boolean`
- **Spec notes:** "QR Verification has been removed from current intended inspection workflow"
- **Current code:** `qr_verified: false` on creation, `qr_verified: true` on some mockData orders
- **Decision required:** Remove field from database or keep as legacy?

### M9: `from_location` hardcoded in DoctorOrder
- **Frontend:** `from_location: 'hub-01'` hardcoded in order submission
- **Backend:** Must use configured hub location, not trust client-provided value

### M10: Order ID format
- **Frontend generates:** `MH-2026-00${422 + orders.length}` — fragile, collision-prone
- **Backend must generate:** Sequential, unique, formatted order IDs (`MH-YYYY-NNNNN`)

---

## 21. Frontend → Backend Feature Matrix

| Frontend Feature | Backend Required | Endpoint/Event | Database | Real Hardware | Priority |
|------------------|------------------|----------------|----------|---------------|----------|
| Doctor login (email+PW) | User auth + JWT | POST /api/login | doctors table | No | CRITICAL |
| Doctor login (OTP) | SMS/email OTP | POST /api/auth/otp/* | otp_sessions | Twilio/SMS | HIGH |
| Admin login | Admin auth + JWT | POST /api/login | admins table | No | CRITICAL |
| Admin forgot password | OTP + reset | POST /api/auth/admin/* | otp_sessions | Email/SMS | HIGH |
| Place order | Order creation + OTP gen | POST /api/order | orders, order_items | No | CRITICAL |
| View order status | Real-time order state | GET /api/order/<id> + Socket.IO order_status | orders | No | CRITICAL |
| Track delivery (map) | Live drone GPS | Socket.IO telemetry | telemetry_log | MAVProxy | CRITICAL |
| Track delivery (temp) | Payload temperature | Socket.IO telemetry | temperature_log | Sensor/MAVProxy | HIGH |
| Admin pending orders | Order list | GET /api/orders/pending | orders | No | CRITICAL |
| Pre-flight inspection | Dynamic check data | GET /api/inspection/<id> | inspection_records | Drone sensors | HIGH |
| CONFIRM & LAUNCH | Mission authorization | POST /api/confirm/<id> | missions, orders | MAVProxy + Pixhawk | CRITICAL |
| HOLD mission | Drone hover | POST /api/drone/hold | missions | MAVProxy | HIGH |
| RESUME mission | Continue mission | POST /api/drone/resume | missions | MAVProxy | HIGH |
| EMERGENCY RTL | Return to launch | POST /api/drone/emergency-rtl | missions | MAVProxy | CRITICAL |
| Fleet status | Live drone telemetry | GET /api/drone/status + Socket.IO | drones | Drone/MAVProxy | HIGH |
| Inventory view | Stock levels | GET /api/inventory | inventory | No | HIGH |
| Alert center | Real alerts | GET /api/alerts + Socket.IO events | alerts | Triggers | HIGH |
| Delivery verification | OTP + geofence | POST /api/received/<id> | orders, geofence | GPS | HIGH |
| Analytics | Delivery metrics | GET /api/analytics/daily | orders aggregated | No | MEDIUM |
| Cold-chain monitoring | Real sensor temps | GET /api/temperature/log/<id> | temperature_log | Sensor | HIGH |
| Hawkie chat | All real data | All endpoints | All tables | Indirectly | MEDIUM |
| Weather clearance | Weather API | GET /api/weather/check | Cached | OpenWeatherMap | MEDIUM |
| SMS notifications | Twilio integration | POST /api/send-sms | — | Twilio | MEDIUM |
| Location management | Location data | GET /api/locations | locations | No | MEDIUM |

---

## 22. Launch Dependency Graph

```
ORDER SUBMITTED (doctor portal)
  └─ Frontend: POST /api/order { items, priority, notes, destination }
  └─ Backend: Generate MH-YYYY-NNNNN ID, generate OTP server-side, store order
  └─ DB: orders.status = 'pending'
  └─ Socket.IO: emit 'new_order' to admin clients

PENDING REVIEW (admin orders page)
  └─ Frontend: GET /api/orders/pending
  └─ Frontend: Admin clicks INSPECT
  └─ Frontend: GET /api/inspection/<order_id>
  └─ Backend: Compile real check data (inventory, drone telemetry, weather, GPS)
  └─ DB: inspection_records populated

PRE-FLIGHT INSPECTION (inspection modal)
  └─ Admin reviews 14 checks (hardware manual + system automated)
  └─ canLaunch = allMandatory pass && !hasBlocked
  └─ Failure condition: any mandatory check 'blocked' → Launch button disabled

SAFETY VALIDATION (backend on confirm)
  └─ Battery > threshold (50%)
  └─ GPS locked
  └─ Weather clearance
  └─ 4G/ZeroTier link active
  └─ Inventory count >= order quantity
  └─ No conflicting active missions

LAUNCH AUTHORIZATION (POST /api/confirm/<id>)
  └─ JWT authenticated, role === 'admin'
  └─ Backend validates all conditions above
  └─ Failure: 400/409/503 → InspectionModal shows error step

DRONE SELECTION & ASSIGNMENT
  └─ Backend selects available drone with sufficient battery and GPS lock
  └─ DB: orders.drone_id = selected, drones.status = 'preparing'
  └─ Response: { mission_id, drone_id, launched_at }

MISSION CREATION
  └─ DB: missions row created (status='in_flight')
  └─ DB: orders.status = 'launched', orders.launched_at = now
  └─ Socket.IO: emit 'order_status' { order_id, status:'launched' }

MAVProxy BRIDGE
  └─ Flask sends ARM + TAKEOFF command via pymavlink
  └─ MAVProxy relays to Pixhawk over UDP/serial
  └─ Failure: log error, set mission aborted, emit alert

PIXHAWK FLIGHT CONTROLLER
  └─ Executes autonomous waypoint mission
  └─ Reports position, battery, status via MAVLink at ~5Hz

TELEMETRY STREAM
  └─ MAVProxy → Flask (pymavlink receive loop)
  └─ Flask → Socket.IO every ~2s: emit 'telemetry' payload
  └─ Frontend: socket.on('telemetry') → pushTelemetry() → store → re-render map/charts

TEMPERATURE MONITORING
  └─ Sensor on payload → MAVProxy passthrough → Flask
  └─ Flask: if temp > 8°C → emit 'temp_warning', create alert
  └─ Flask: if temp > 12°C → emit 'temp_critical', consider RTL
  └─ Frontend: socket.on('temp_warning') → addAlert()

DESTINATION ARRIVAL
  └─ MAVProxy: drone reaches to_lat/to_lng waypoint
  └─ Flask: emit 'drone_landed' { drone_id, lat, lng }
  └─ DB: orders.delivered_at = now, missions.status = 'delivered'
  └─ Frontend: order status → 'delivered'

DELIVERY VERIFICATION
  └─ Admin enters receiver name + OTP
  └─ Frontend: POST /api/received/<id> { otp, receiver_name, lat, lng }
  └─ Backend: validate OTP (server-side), validate geofence
  └─ DB: orders.status = 'verified', orders.receiver_verified = true

RTL / RETURN TO BASE
  └─ MAVProxy: drone RTL after delivery or emergency
  └─ Flask: emit 'drone_rtl' or update drone status 'returning'
  └─ DB: drones.status = 'returning'
  └─ Frontend: drone card shows returning state

MISSION COMPLETION
  └─ Drone lands at hub
  └─ Flask: emit 'mission_complete' { mission_id }
  └─ DB: missions.status = 'completed', drones.status = 'available'
  └─ Frontend: socket.on('mission_complete') → activeMission cleared
```

---

## 23. Gap Analysis

### 🔴 CRITICAL GAPS (prevent real operation)

**C1: No backend exists**  
Flask application, database schema, and all API routes must be built from scratch.

**C2: IS_DEMO = true hardcoded**  
`src/services/api/index.ts` line 6: `const IS_DEMO = true` — all 35+ API service methods return fake data. Must be controlled by environment variable.

**C3: No components call API services**  
Even with IS_DEMO=false, NO component currently calls `orderService.create()`, `droneService.status()`, etc. Components read from Zustand directly. The store initialization must be refactored to fetch from APIs instead of importing mockData.

**C4: No WebSocket initialization**  
`initWebSocket()` is defined but never called. Real-time telemetry will not reach the frontend until this is wired.

**C5: OTP generated client-side**  
Security risk. Must be moved to backend before any real deliveries.

**C6: Drone launch is locally simulated**  
The launch authorization does not command any real drone. MAVProxy integration is entirely absent.

**C7: Geofence hardcoded true**  
Delivery can be verified at any location. Backend must validate `|drone.lat - dest.lat| < threshold` and `|drone.lng - dest.lng| < threshold`.

**C8: HOLD/RESUME/RTL are UI-only toast notifications**  
These are safety-critical drone commands. No API calls are made. Must be wired before any real flight.

---

### 🟠 IMPORTANT GAPS (required before production/demo reliability)

**I1: Inspection checks are all static 'pass'**  
The inspection modal always shows 14 green checks regardless of drone/payload/weather state. Backend must populate real check data from sensors.

**I2: Drone assignment hardcoded in UI**  
Launch always shows "MH-D02 · Hawk Beta" regardless of which drone is actually available. Backend must return assigned drone in launch response.

**I3: Token persistence and session management**  
Page refresh loses the session. JWT must be stored and validated on app load.

**I4: Temperature logging not updated by simulation**  
`temperatureLogs` in store is a static array generated at startup. Real backend must stream temperature via Socket.IO and the store action `pushTelemetry` (which accepts temperature in TelemetryPoint) must also update temperatureLogs.

**I5: Cold-chain events hardcoded**  
`AdminColdChain.CHAIN_EVENTS` is a 6-item hardcoded array. Must come from mission audit log.

**I6: Safety events hardcoded**  
`AdminSafety.AI_EVENTS` and `SAFETY_CHECKS` are static. Must come from real sensor + flight controller data.

**I7: Analytics data is generated randomly**  
`generateDailyMetrics()` produces random numbers every render. Analytics must aggregate from real order database.

**I8: Alerts are not persisted**  
New alerts only survive the session. Backend must store and serve all alerts.

---

### 🟢 NON-BLOCKING GAPS (can be improved later)

**N1: Multi-location ordering**  
Doctor destination is hardcoded to "PHC Chandaka". Multi-PHC routing can be added later.

**N2: Medicine catalog from backend**  
The 26-item `CATALOG` in DoctorOrder.tsx can remain frontend-managed for demo. Optional `GET /api/catalog` endpoint later.

**N3: Download/export in AdminHistory**  
Export button exists in AdminHistory but does nothing. Can be implemented as `GET /api/orders/export?format=csv` later.

**N4: QR verification field**  
`qr_verified` field in Order type is set but not used in any current flow. Clean up or remove per decision.

**N5: AdminInventory update action**  
No "update quantity" button in current AdminInventory UI. `POST /api/inventory/update` can be added later.

**N6: Admin location add**  
`POST /api/locations/add` is in the api service but no UI exists for it.

**N7: Hero stats on landing page**  
`HERO_STATS` is static. Can be replaced with `GET /api/stats/summary` later with minimal impact.

---

## 24. Unknowns Requiring Decision

**U1: Single-drone vs. multi-drone telemetry**  
Does the Socket.IO `telemetry` event carry one drone's data, or a batch? Frontend currently assumes there is one active drone at a time and updates `activeTelemetry` as a single stream. UNKNOWN — requires verification of MAVProxy architecture.

**U2: MAVProxy connection method**  
Will MAVProxy run on the same machine as Flask? Over ZeroTier VPN? Direct serial? Connection architecture affects Flask implementation. UNKNOWN.

**U3: Temperature sensor integration**  
How is payload temperature transmitted? Via MAVLink passthrough? Via a separate microcontroller serial port? Via SPI/I2C sensor on companion computer? UNKNOWN — requires verification with hardware team.

**U4: Geofence radius**  
What GPS accuracy radius qualifies as "at destination"? Current drone type shows `gps_accuracy: 1.2` (metres). What threshold to use for delivery verification? UNKNOWN.

**U5: Battery launch threshold**  
InspectionCheck shows "> 20%" but redesign notes say "> 50%". Which is correct? UNKNOWN — requires confirmation.

**U6: Doctor-PHC binding**  
Currently doctor has `phc: "phc-chandaka"` fixed. Can a doctor order to a location other than their assigned PHC? UNKNOWN — requires product decision.

**U7: OTP delivery channel for doctors**  
OTP for login uses phone or email. What channel for delivery OTP (sent to receiver at PHC)? SMS? WhatsApp? UNKNOWN.

**U8: Mission events source**  
`Mission.events[]` has entries like "Obstacle detected ahead". In live mode, who generates these? Flight controller? Backend processing telemetry? UNKNOWN.

**U9: Hawkie AI upgrade path**  
Will Hawkie eventually use an LLM (e.g., Claude API) for free-form answers? Or remain deterministic? UNKNOWN — out of Phase 0 scope but affects backend data exposure design.

**U10: Concurrent missions**  
Frontend `activeMission` is a single object. Can there be multiple simultaneous missions? UNKNOWN — current architecture assumes one.

---

## 25. Backend Implementation Sequence (Phase 1 Plan)

### Phase 1A — Project Structure

```
backend/
├── app.py                 Flask app factory
├── config.py              Config classes (Dev/Prod/Test)
├── requirements.txt
├── .env.example
│
├── models/
│   ├── doctor.py
│   ├── admin.py
│   ├── order.py
│   ├── drone.py
│   ├── mission.py
│   ├── inventory.py
│   ├── location.py
│   ├── alert.py
│   └── telemetry.py
│
├── routes/
│   ├── auth.py            /api/login, /api/logout, /api/verify-token
│   ├── auth_otp.py        /api/auth/otp/*, /api/auth/admin/*
│   ├── orders.py          /api/order, /api/orders, etc.
│   ├── drones.py          /api/drone/*
│   ├── inventory.py       /api/inventory/*
│   ├── locations.py       /api/locations/*
│   ├── temperature.py     /api/temperature/*
│   ├── weather.py         /api/weather/*
│   ├── sms.py             /api/send-sms
│   └── analytics.py       /api/analytics/*
│
├── services/
│   ├── auth_service.py    bcrypt, JWT
│   ├── otp_service.py     Twilio SMS / email
│   ├── mission_service.py Launch logic, state machine
│   ├── drone_service.py   MAVProxy bridge
│   ├── weather_service.py OpenWeatherMap
│   └── sms_service.py     Twilio
│
├── mavproxy/
│   ├── bridge.py          pymavlink connection + command
│   └── telemetry.py       MAVLink receive loop → Socket.IO
│
└── websocket/
    └── events.py          Flask-SocketIO event definitions
```

### Phase 1B — Configuration and Environment

```python
# .env.example
FLASK_ENV=development
SECRET_KEY=change-this
JWT_SECRET_KEY=change-this-too
DATABASE_URL=sqlite:///medihawk.db
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
OPENWEATHER_API_KEY=
MAVPROXY_HOST=127.0.0.1
MAVPROXY_PORT=14550
ZEROTIER_NETWORK=
```

### Phase 1C — SQLite Schema

Implement all tables from §15. Use SQLAlchemy ORM or raw sqlite3.

Seed scripts:
- `seed_locations.py` — insert 4 locations from mockData
- `seed_inventory.py` — insert 8 inventory items
- `seed_drones.py` — insert 4 drones
- `seed_admin.py` — create initial admin user with bcrypt password

### Phase 1D — Flask Application with CORS

```python
from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173"])
socketio = SocketIO(app, cors_allowed_origins="*")
```

### Phase 1E — Authentication Routes

Priority order:
1. `POST /api/login` (email+password for both roles)
2. `GET /api/verify-token`
3. `POST /api/logout`
4. `POST /api/auth/otp/send` (doctor phone OTP)
5. `POST /api/auth/otp/verify`
6. Admin forgot password flow

### Phase 1F — Order APIs

1. `POST /api/order` — Create order, generate ID + OTP server-side
2. `GET /api/orders` — All orders (admin only)
3. `GET /api/orders/pending` — Pending orders (admin)
4. `GET /api/order/<id>` — Single order

### Phase 1G — Inspection + Launch

1. `GET /api/inspection/<order_id>` — Return dynamic check data
2. `POST /api/confirm/<id>` — Full pre-flight validation + mission creation
3. Wire MAVProxy bridge for ARM + TAKEOFF

### Phase 1H — Telemetry + Socket.IO

1. Flask-SocketIO setup
2. MAVLink receive loop → Socket.IO `telemetry` events
3. Temperature monitoring → `temp_warning` / `temp_critical`
4. Mission state machine → `order_status`, `drone_landed`, `mission_complete`

### Phase 1I — Drone Command Endpoints

1. `POST /api/drone/emergency-rtl`
2. `POST /api/drone/hold`
3. `POST /api/drone/resume`
4. All require JWT admin auth + MAVProxy command

### Phase 1J — Remaining APIs

- Inventory, locations, temperature log, weather, analytics, SMS, alerts

### Phase 1K — Frontend Wiring (DO AFTER BACKEND IS TESTED)

1. Set `IS_DEMO = false` in api service OR use env var
2. Initialize WebSocket in App.tsx when `!isDemo`
3. Replace `addOrder()` direct call in DoctorOrder with `orderService.create()`
4. Replace `login('doctor')` in login handlers with real JWT flow
5. Replace store initialization from mockData to API fetches
6. Wire HOLD/RESUME/RTL buttons to backend API
7. Wire `updateOrderStatus` + `acknowledgeAlert` + `handleVerify` to real API calls

---

## 26. Risk Register

| ID | Risk | Severity | Probability | Mitigation |
|----|------|----------|-------------|------------|
| R1 | MAVProxy integration fails or is unavailable during demo | CRITICAL | MEDIUM | Implement demo simulation mode that runs backend-side (not browser simulation) for SIH presentation |
| R2 | Telemetry latency > 2s breaks live map experience | HIGH | MEDIUM | Use Socket.IO binary protocol, reduce telemetry payload, pre-interpolate on frontend |
| R3 | GPS signal lost mid-mission, drone in autonomous mode | CRITICAL | LOW | Backend must emit `drone_rtl` event, Frontend must handle `connection: 'degraded'` state |
| R4 | Temperature exceeds safe range during demo | HIGH | LOW | Ensure cold-chain box is pre-cooled; backend temp_critical event triggers automatic RTL consideration |
| R5 | Browser refresh during active mission loses frontend state | HIGH | HIGH | Solve by: (a) persisting JWT, (b) refetching active mission on app load via `GET /api/missions/active` |
| R6 | Two admins trigger launch for same order simultaneously | HIGH | LOW | Backend uses database transaction + order status check to prevent double-launch |
| R7 | Mock data and real data structure diverge during integration | HIGH | MEDIUM | Use TypeScript types as single source of truth; backend DTOs must match frontend types exactly |
| R8 | IS_DEMO=false accidentally in SIH demo environment | HIGH | LOW | Gate on explicit environment variable, show prominent LIVE MODE banner in admin portal |
| R9 | OTP generated client-side leaks before backend implemented | CRITICAL | HIGH | Move OTP generation to server-side before any real delivery testing |
| R10 | Hardcoded drone 'MH-D02' selected when actually in maintenance | CRITICAL | HIGH | Backend must validate drone availability before launch; never trust client-supplied drone_id |
| R11 | Socket.IO not initialized; admin sees stale data with no warning | HIGH | HIGH | Add explicit "BACKEND DISCONNECTED" indicator; never fall back to simulation in LIVE mode |
| R12 | VITE_API_URL not set; api service calls localhost:5000 by default | MEDIUM | MEDIUM | Ensure .env.local is documented and required env vars are validated at startup |

---

*Phase-0 Audit Complete.*  
*This document is the single source of truth for MediHawk backend implementation.*  
*No backend code, no database, and no drone commands were created during this audit.*  
*The frontend is FROZEN — do not modify frontend to accommodate backend before Phase 1K.*
