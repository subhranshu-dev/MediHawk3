# MediHawk Phase 1C — Order & Inventory Backend Contract

**Phase:** 1C — Real Order + Inventory Core  
**Status:** COMPLETE AND VERIFIED  
**Tests:** 162/162 passing (Phase 1A: 39, Phase 1B: 38, Phase 1C: 85)

---

## 1. Overview

Phase 1C implements the transactional order creation and inventory reservation layer.
No drone flight occurs in Phase 1C. Orders created here are software/database state only,
eligible for Phase 1D inspection and later launch authorization.

---

## 2. APIs Implemented

### 2.1 Create Order

```
POST /api/order
Authorization: Bearer <doctor-token>    (role=doctor required)
```

**Request body:**
```json
{
  "items": [
    {"medicine_id": "inv-002", "quantity": 2},
    {"medicine_id": "inv-008", "quantity": 1}
  ],
  "priority": "EMERGENCY" | "URGENT" | "NORMAL",
  "latitude": 20.3512,
  "longitude": 85.7612
}
```

Notes:
- `priority` is normalized to lowercase before storage (EMERGENCY → emergency).
- `nearest_facility_id` in the request body is silently discarded.
  Backend independently resolves the nearest facility via Phase 1B geo_service.
- `doctor_id` in the request body is ignored. Identity comes from the JWT.
- `location_error: "permission_denied" | "unavailable"` triggers explicit errors.

**Success response (201):**
```json
{
  "success": true,
  "order": {
    "id": "MH-2026-A3F291",
    "doctor_id": "doc-001",
    "priority": "emergency",
    "status": "pending",
    "ordered_at": "2026-09-14T...",
    "items": [
      {
        "id": "1",
        "inventory_id": "inv-002",
        "name": "Snakebite Antivenin",
        "quantity": 2,
        "unit": "vials",
        "temperature_required": "2-8°C",
        "category": "Emergency"
      }
    ],
    "destination": {
      "facility_id": "phc-chandaka",
      "name": "PHC Chandaka",
      "type": "phc",
      "latitude": 20.3512,
      "longitude": 85.7612,
      "distance_km": 0.0
    }
  }
}
```

**Error codes:**
| Code | Status | Condition |
|---|---|---|
| `INVALID_COORDINATES` | 422 | lat/lon out of range or missing |
| `INVALID_PRIORITY` | 422 | priority not emergency/urgent/normal |
| `INVALID_ITEMS` | 422 | items missing or empty |
| `INVALID_QUANTITY` | 422 | quantity not positive integer |
| `MEDICINE_NOT_FOUND` | 422 | medicine_id not in inventory |
| `MEDICINE_INACTIVE` | 422 | medicine is deactivated |
| `MEDICINE_EXPIRED` | 422 | medicine's expiry_date < today |
| `INSUFFICIENT_STOCK` | 422 | requested quantity > available |
| `NO_ELIGIBLE_FACILITY` | 404 | no active PHC/CHC within 200 km |
| `LOCATION_PERMISSION_REQUIRED` | 403 | browser denied location |
| `LOCATION_UNAVAILABLE` | 503 | GPS/location service error |

---

### 2.2 List Orders

```
GET /api/orders
Authorization: Bearer <token>
```

- **Doctor:** returns own orders only
- **Admin:** returns all orders
- Query params: `?status=pending&priority=emergency`

---

### 2.3 Pending Orders

```
GET /api/orders/pending
Authorization: Bearer <admin-token>    (role=admin required)
```

Returns only orders in `pending` status.

---

### 2.4 Single Order

```
GET /api/order/<id>
Authorization: Bearer <token>
```

- Doctor: returns 404 for orders not owned (to not leak existence)
- Admin: returns any order

---

### 2.5 Confirm Order

```
POST /api/confirm/<id>
Authorization: Bearer <admin-token>    (role=admin required)
```

Transitions `pending → approved`. Does NOT launch a drone. No MAVLink command is emitted.

---

### 2.6 Cancel Order

```
POST /api/cancel/<id>
Authorization: Bearer <token>
```

- Doctor: can cancel own orders in `pending` or `approved` status
- Admin: can cancel any order in cancellable status
- **Restores reserved inventory stock atomically**
- **Idempotent:** second cancellation returns 409 `ORDER_NOT_CANCELLABLE`

---

### 2.7 Inventory List

```
GET /api/inventory
Authorization: Bearer <token>
```

Returns all active inventory items (is_active=True). Both doctors and admins may read.

---

### 2.8 Inventory Item

```
GET /api/inventory/<id>
Authorization: Bearer <token>
```

---

### 2.9 Update Inventory Item

```
PATCH /api/inventory/<id>
Authorization: Bearer <admin-token>    (role=admin required)
```

Accepted fields: `medicine`, `quantity` (≥0), `unit`, `temperature_required`,
`expiry_date` (YYYY-MM-DD), `min_threshold` (≥0), `is_active` (bool), `category`.

Doctors cannot modify inventory (403 returned).

---

## 3. Order Lifecycle

```
pending → approved      (admin confirms, Phase 1C)
pending → cancelled     (doctor/admin, Phase 1C)
approved → preparing    (Phase 1D — inspection)
approved → cancelled    (admin, Phase 1C)
preparing → launched    (Phase 1D — launch auth, no MAVLink in Phase 1C)
launched → in_flight
in_flight → landing
landing → delivered
delivered → verified    (Phase 1E — OTP confirmation)
verified  → [terminal]
cancelled → [terminal]
```

Arbitrary status jumps are rejected with `INVALID_ORDER_STATUS` (409).
Unimplemented Phase 1D+ transitions return `TRANSITION_NOT_IMPLEMENTED` (501).

### Cancellable statuses
Only `pending` and `approved` orders can be cancelled.
Once a drone has launched, cancellation requires explicit safety logic (Phase 1D+).

---

## 4. Inventory Semantics

### Reservation model
Phase 1C uses a **decrement-on-order** model:
- Order creation decrements `inventory.quantity` immediately.
- Cancellation increments `inventory.quantity` back.
- Final "consumption" (verifying delivery) happens in Phase 1E.

The `quantity` column represents **available-to-order** stock.

### Active/inactive
`is_active=False` marks decommissioned medicines. They cannot be ordered,
and they are excluded from `GET /api/inventory` by default.

### Expiry policy
Medicine expiring **today** is still valid.  
Medicine with `expiry_date < date.today()` is expired and cannot be ordered.

### Low-stock status computation
`to_dict()` computes effective status dynamically:
- `inactive` — `is_active=False`
- `expired` — `expiry_date < today`
- `out_of_stock` — `quantity ≤ 0`
- `critical` — `quantity ≤ min_threshold`
- `low_stock` — `quantity ≤ min_threshold × 2`
- `in_stock` — otherwise

---

## 5. Real Location Integration

Order creation integrates with Phase 1B geo_service:

```
Doctor device GPS (lat, lon)
    ↓
validate_coordinates()           # 422 INVALID_COORDINATES if invalid
    ↓
find_nearest_facility(lat, lon)  # 404 NO_ELIGIBLE_FACILITY if none
    ↓
active PHC or CHC within 200 km
    ↓
stored in order.destination_location, dest_lat, dest_lng, distance_km
```

**Client cannot choose the facility.** Any `nearest_facility_id` in the request body
is discarded. The backend always calculates independently.

---

## 6. Security

- All protected endpoints require valid JWT.
- Role (doctor/admin) comes from JWT payload — never from request body.
- `doctor_id` identity comes from JWT `sub` claim — never from request body.
- No `doctor_id` in the request body is ever used to create or own an order.
- Parameterized SQL via SQLAlchemy (no raw string concatenation).
- No secrets, hashes, or stack traces in API responses.
- Admin cannot create orders via `POST /api/order` (403).

---

## 7. Transaction Safety

### Create order
All of the following happen in one SQLAlchemy transaction:
1. `UPDATE inventory SET quantity = quantity - qty WHERE id = ? AND quantity >= qty AND is_active = 1`
   (repeated for each item; any rowcount ≠ 1 raises InventoryError)
2. `INSERT INTO orders ...`
3. `INSERT INTO order_items ...`
4. `db.session.commit()`

On any failure: `db.session.rollback()` — no partial orders, no partial decrements.

### Stock guard
The `WHERE quantity >= qty AND is_active = 1` condition is evaluated at write time,
not at read time. This prevents double-spend even when two requests pass the initial
read-based validation simultaneously. SQLite serialises writes, ensuring the condition
holds under concurrent access.

### Cancellation idempotency
- Status checked atomically in same transaction as stock restoration.
- Already-cancelled order returns `409 ORDER_NOT_CANCELLABLE` on re-attempt.
- Stock is never restored more than once.

---

## 8. Database Changes (Phase 1C)

| Table | Column | Type | Purpose |
|---|---|---|---|
| `inventory` | `is_active` | BOOLEAN NOT NULL DEFAULT 1 | deactivate medicines |
| `orders` | `dest_lat` | REAL | destination facility lat snapshot |
| `orders` | `dest_lng` | REAL | destination facility lng snapshot |
| `orders` | `distance_km` | REAL | distance at order time |
| `order_items` | `inventory_id` | TEXT | FK to inventory for audit |
| `order_items` | `temperature_required` | TEXT | cold-chain snapshot |

All added via idempotent `ALTER TABLE` migrations in `database.py::_apply_migrations()`.
Existing rows receive the column default value. No data loss.

---

## 9. Order ID Format

`MH-YYYY-XXXXXX` where XXXXXX is 6 uppercase hex characters from `secrets.token_hex(3)`.
Approximately 16.7 million combinations per year prefix. Collision probability is
negligible for the expected order volume.

---

## 10. Priority Normalization

Input `EMERGENCY`, `Emergency`, or `emergency` all normalize to `emergency` for storage.
Only `emergency`, `urgent`, `normal` are accepted. All other values return `INVALID_PRIORITY`.

---

## 11. Known Limitations

1. **No real-time stock locking.** SQLite's atomic UPDATE pattern is used instead of
   SELECT FOR UPDATE (not supported by SQLite). This is sufficient for the expected
   concurrency level.

2. **No pagination** on `GET /api/orders`. Will be needed at scale.

3. **No idempotency key** for order creation. Retry-safe creation via client-generated
   idempotency keys is deferred to a later phase.

4. **Quantity model is simple decrement.** No reserved/available distinction — all
   ordered stock is immediately decremented. Cancellation restores it.

5. **Hub as source not assigned at creation.** The `from_location` field is NULL at
   order creation. A hub/dispatch source is assigned when a drone is allocated (Phase 1D).

---

## 12. Test Coverage

| Category | Tests | Notes |
|---|---|---|
| Phase 1A (auth, DB, health) | 39 | All passing |
| Phase 1B (location) | 38 | All passing |
| Phase 1C — order tests | 47 | All 40 required checks covered |
| Phase 1C — inventory tests | 28 | All 10 required checks covered |
| Phase 1C — transaction tests | 7 | Rollback, race simulation, idempotency |
| **TOTAL** | **162** | **162/162 PASS** |
