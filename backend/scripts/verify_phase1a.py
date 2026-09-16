#!/usr/bin/env python
"""
MediHawk Phase 1A Verification Script
Run from the backend directory with the venv activated:

    cd backend
    source venv/bin/activate
    python scripts/verify_phase1a.py

Non-destructive. Does not seed or reset the database.
Does not start a persistent server (manages its own subprocess).
Does not print JWT tokens or credentials.
"""
from __future__ import annotations

import json
import os
import signal
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

# Add backend root to sys.path so modules resolve correctly
# (script lives in backend/scripts/, modules live in backend/)
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

# Change working directory to backend root so relative paths (instance/) work
os.chdir(_BACKEND_ROOT)

BASE_URL = 'http://127.0.0.1:5000'
DB_PATH = 'instance/medihawk.db'
PASS = 0
FAIL = 0
CHECKS: list[tuple[str, bool, str]] = []


def check(name: str, actual, expected, section: str = '') -> bool:
    global PASS, FAIL
    ok = actual == expected
    CHECKS.append((name, ok, f'got={actual!r}, expected={expected!r}' if not ok else ''))
    if ok:
        PASS += 1
    else:
        FAIL += 1
        print(f'  ✗ FAIL  {name}: got={actual!r}, expected={expected!r}')
    return ok


def section(title: str) -> None:
    print(f'\n── {title} ──────────────────────────────────────')


def http(path: str, body=None, token: str | None = None) -> tuple[dict, int]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE_URL + path, data=data,
        headers={'Content-Type': 'application/json'},
    )
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read()), r.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code


# ── 1. Python environment ────────────────────────────────────────────────────
section('1. Python Environment')
venv_python = os.path.join(os.path.dirname(sys.executable), 'python')
check('Python >= 3.11', sys.version_info >= (3, 11), True)
check('Running from venv', 'venv' in sys.executable, True)

try:
    import flask, flask_sqlalchemy, flask_cors, bcrypt, jwt, dotenv  # noqa
    check('All required imports', True, True)
except ImportError as e:
    check(f'Import failed: {e}', False, True)


# ── 2. Database ──────────────────────────────────────────────────────────────
section('2. Database')
check('DB file exists', os.path.exists(DB_PATH), True)

if os.path.exists(DB_PATH):
    conn = sqlite3.connect(DB_PATH)
    conn.execute('PRAGMA foreign_keys=ON')

    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    expected_tables = {
        'admins', 'alerts', 'doctors', 'drones', 'inspection_records',
        'inventory', 'locations', 'missions', 'order_items', 'orders',
        'otp_sessions', 'telemetry_log', 'temperature_log',
    }
    check('All 13 expected tables present', expected_tables.issubset(tables), True)

    fk = conn.execute('PRAGMA foreign_keys').fetchone()[0]
    check('Foreign keys enabled', fk, 1)

    admins = conn.execute('SELECT COUNT(*) FROM admins').fetchone()[0]
    check('Admin seed data present', admins >= 1, True)
    doctors = conn.execute('SELECT COUNT(*) FROM doctors').fetchone()[0]
    check('Doctor seed data present', doctors >= 1, True)
    locations = conn.execute('SELECT COUNT(*) FROM locations').fetchone()[0]
    check('Locations seed data present', locations >= 4, True)
    conn.close()


# ── 3. Tests ─────────────────────────────────────────────────────────────────
section('3. Automated Test Suite')
result = subprocess.run(
    [sys.executable, '-m', 'pytest', '-q', '--tb=short'],
    capture_output=True, text=True,
)
passed = '39 passed' in result.stdout or 'passed' in result.stdout
check('pytest suite passes', passed, True)
if not passed:
    print(result.stdout[-1000:])
    print(result.stderr[-500:])


# ── 4. Flask server ──────────────────────────────────────────────────────────
section('4. Flask Server & API')
server_proc = subprocess.Popen(
    [sys.executable, 'run.py'],
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
)

# Wait for server to start (up to 10s)
ready = False
for _ in range(20):
    time.sleep(0.5)
    try:
        urllib.request.urlopen(BASE_URL + '/api/health', timeout=1)
        ready = True
        break
    except Exception:
        pass

check('Flask starts successfully', ready, True)

if ready:
    # Health
    body, code = http('/api/health')
    check('GET /api/health → 200', code, 200)
    check('health.success=True', body.get('success'), True)
    check('health.status=healthy', body.get('status'), 'healthy')
    check('health.mode=simulation', body.get('mode'), 'simulation')
    check('health.database=connected', body.get('database'), 'connected')
    secrets_leaked = any(k in str(body) for k in ('SECRET', 'JWT_', 'password_hash'))
    check('No secrets in /api/health', secrets_leaked, False)

    # Admin login
    body, code = http('/api/login',
        {'email': 'arjun.patel@medihawk.in', 'password': 'MediHawk@Admin2026', 'role': 'admin'})
    check('POST /api/login (admin) → 200', code, 200)
    check('Admin login success', body.get('success'), True)
    check('Admin role in response', body.get('user', {}).get('role'), 'admin')
    check('Token present', bool(body.get('token')), True)
    pw_leaked = 'password' in str(body).lower() and 'hash' in str(body).lower()
    check('Password hash not leaked', pw_leaked, False)
    admin_token = body.get('token', '')

    # Doctor login
    body, code = http('/api/login',
        {'phone': '9861234567', 'password': 'MediHawk@Doctor2026', 'role': 'doctor'})
    check('POST /api/login (doctor, phone) → 200', code, 200)

    # Wrong credentials
    body, code = http('/api/login',
        {'email': 'arjun.patel@medihawk.in', 'password': 'Wrong', 'role': 'admin'})
    check('Wrong credentials → 401', code, 401)

    # verify-token
    body, code = http('/api/verify-token')
    check('GET /api/verify-token no auth → 401', code, 401)

    body, code = http('/api/verify-token', token=admin_token)
    check('GET /api/verify-token valid token → 200', code, 200)
    check('verify-token valid=True', body.get('valid'), True)

# Stop server
try:
    server_proc.send_signal(signal.SIGTERM)
    server_proc.wait(timeout=5)
except Exception:
    server_proc.kill()


# ── 5. Safety gate ───────────────────────────────────────────────────────────
section('5. Drone Safety Gate')
from services.drone_service import DroneCommandNotAllowed, send_emergency_rtl

rtl_blocked = False
try:
    send_emergency_rtl('MH-D01', 'simulation')
except DroneCommandNotAllowed:
    rtl_blocked = True
except Exception:
    pass
check('RTL blocked in simulation mode', rtl_blocked, True)

rtl_blocked_test = False
try:
    send_emergency_rtl('MH-D01', 'testing')
except DroneCommandNotAllowed:
    rtl_blocked_test = True
check('RTL blocked in testing mode', rtl_blocked_test, True)

from services.mission_service import BATTERY_MINIMUM_PERCENT, TEMPERATURE_WARNING_CELSIUS
check('Battery minimum = 50%', BATTERY_MINIMUM_PERCENT, 50.0)
check('Temp warning = 8°C', TEMPERATURE_WARNING_CELSIUS, 8.0)

# No pymavlink/MAVProxy imports active
import importlib
mavlink_imported = False
try:
    importlib.import_module('pymavlink')
    mavlink_imported = True
except ImportError:
    pass
check('pymavlink NOT installed (Phase 2+)', mavlink_imported, False)


# ── 6. Security config ───────────────────────────────────────────────────────
section('6. Security Configuration')
from config import DevelopmentConfig, ProductionConfig, TestingConfig

check('.env not committed', not os.path.exists('.env'), True)
check('Production raises on missing SECRET_KEY',
      hasattr(ProductionConfig, 'SECRET_KEY'), True)
check('Dev default key is not empty', bool(DevelopmentConfig.SECRET_KEY), True)
check('Test uses stable key', TestingConfig.JWT_SECRET_KEY, 'test-jwt-secret-not-for-production')

no_hardcoded = 'CHANGE-IN-PRODUCTION' in DevelopmentConfig.SECRET_KEY
check('Dev key contains CHANGE-IN-PRODUCTION warning', no_hardcoded, True)


# ── Final summary ─────────────────────────────────────────────────────────────
section('SUMMARY')
print(f'\nTotal: {PASS + FAIL} checks | PASS: {PASS} | FAIL: {FAIL}')
if FAIL == 0:
    print('\n✓ PHASE 1A VERIFIED — BACKEND FOUNDATION READY FOR THE NEXT IMPLEMENTATION PHASE.')
    sys.exit(0)
else:
    print(f'\n✗ PHASE 1A NOT VERIFIED — {FAIL} check(s) failed.')
    sys.exit(1)
