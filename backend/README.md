# MediHawk Backend

Flask + SQLite backend for the MediHawk autonomous medical-delivery drone system.
**Phase 1A — Foundation only. Does NOT control any real drone hardware.**

---

## Purpose

This backend will eventually serve as the authoritative data source and command
gateway for the MediHawk frontend. In Phase 1A it provides:

- Flask application factory with environment-based configuration
- SQLite database with the complete Phase-0 schema
- Secure password hashing (bcrypt) and JWT authentication foundation
- Health endpoint (`GET /api/health`)
- Login endpoint (`POST /api/login`)
- Centralized error handling and request validation
- Structured logging
- CORS for the React frontend on `localhost:5173`

---

## Prerequisites

- Python 3.11+
- pip

---

## Installation

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

**Required before production:**
- `SECRET_KEY` — Flask secret key (any long random string)
- `JWT_SECRET_KEY` — JWT signing key (any long random string)

All other variables have safe development defaults.

---

## Database Initialization

```bash
# Create tables only
python database.py

# Create tables + insert development seed data
python database.py --seed
```

The database file is created at `instance/medihawk.db` (gitignored).

**Seed data creates these development accounts (NEVER use in production):**

| Role   | Email                          | Password              |
|--------|--------------------------------|-----------------------|
| Admin  | arjun.patel@medihawk.in        | MediHawk@Admin2026    |
| Doctor | priya.mohanty@medihawk.in      | MediHawk@Doctor2026   |
| Doctor | (phone) 9861234567             | MediHawk@Doctor2026   |

---

## Running the Backend

```bash
python run.py
```

Backend starts on `http://localhost:5000`.

---

## Health Check

```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "success": true,
  "service": "MediHawk Backend",
  "status": "healthy",
  "mode": "simulation",
  "database": "connected",
  "version": "1.0.0-phase1a"
}
```

---

## Running Tests

```bash
pytest tests/ -v
```

Tests use an **in-memory SQLite database** — the production DB is never touched.

---

## Application Mode (DEMO vs LIVE)

The `APP_MODE` environment variable controls the operational mode:

| Mode         | Behaviour                                                    |
|--------------|--------------------------------------------------------------|
| `simulation` | Demo mode. No real hardware commands. Simulation data only.  |
| `live`       | Real drone integration (Phase 2+). MAVProxy commands enabled.|
| `testing`    | Test mode. In-memory DB. Used by pytest only.                |

**CRITICAL:** Real drone commands (launch, RTL, HOLD, RESUME) will never execute
unless `APP_MODE=live`. The codebase enforces this via `DroneCommandNotAllowed`
exceptions in `services/drone_service.py`.

---

## Phase Roadmap

| Phase | Scope                                          | Status    |
|-------|------------------------------------------------|-----------|
| 1A    | Foundation: DB, auth, health endpoint          | ✅ COMPLETE |
| 1B    | Configuration management                       | ✅ COMPLETE |
| 1C    | SQLite schema                                  | ✅ COMPLETE |
| 1D    | Flask + CORS                                   | ✅ COMPLETE |
| 1E    | OTP auth (Twilio SMS integration)              | PENDING   |
| 1F    | Order APIs                                     | PENDING   |
| 1G    | Inspection + Launch authorization              | PENDING   |
| 1H    | Socket.IO + real-time telemetry                | PENDING   |
| 1I    | Emergency RTL / HOLD / RESUME commands         | PENDING   |
| 1J    | Remaining APIs (inventory, weather, analytics) | PENDING   |
| 1K    | Frontend wiring (IS_DEMO → false)              | PENDING   |
| 2+    | Real MAVProxy / Pixhawk integration            | FUTURE    |

---

## Security Notes

- Passwords are never stored in plaintext. bcrypt with cost factor 12.
- OTPs are never stored in plaintext. bcrypt hash only.
- JWT secrets are loaded from environment variables — never from source code.
- Stack traces are never returned to API clients.
- Role is validated server-side from the JWT — never trusted from the request.
- This backend is NOT production-ready in Phase 1A.

---

## IMPORTANT: Phase 1A Does NOT Control the Real Drone

No MAVProxy connection. No pymavlink. No ARM command. No TAKEOFF command.
No RTL command. No real mission launched.

Drone control is implemented in Phase 2+ after the complete safety gate
architecture (auth → mission_service → drone_service → MAVProxy) is built
and tested with simulated flights first.
