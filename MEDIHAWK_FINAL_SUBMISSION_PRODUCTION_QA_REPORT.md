# MediHawk — Final Submission Production QA Report

**Date:** 2026-09-18  
**Branch:** main  
**Commits reviewed:** 3ed8857 → 90f4450  
**Production URLs:** https://medi-hawk3.vercel.app (frontend) · https://medihawk3.onrender.com (backend)

---

## 1. Test Environment

| Component | Value |
|-----------|-------|
| Browser driver | Playwright + Google Chrome (headless) |
| Frontend | Vercel — React/Vite/TypeScript SPA |
| Backend | Render — Flask 3.x / Gunicorn / Cloudflare |
| Database | Render PostgreSQL 16 |
| Email | Resend (HTTPS transport) — `EMAIL_PROVIDER=https` |
| Backend tests | 468/468 pass (SQLite, Python 3.12) |

---

## 2. Issues Found and Fixed

### CRITICAL — Vercel SPA deep links returned 404

**Symptom:** Direct navigation to `/auth/doctor`, `/auth/admin`, and any sub-route returned Vercel's own `404: NOT_FOUND` page. Only the root path `/` worked.

**Root cause:** No `vercel.json` was present. Without it, Vercel's static hosting resolves file paths literally — there is no file at `dist/auth/doctor`, so Vercel returns 404. React Router never loads.

**Impact:** Any user who:
- Bookmarks the login page
- Refreshes the browser while on the login page
- Is redirected by `RequireAuth` to `/auth/admin` after session expiry

...would land on a Vercel 404 page and be unable to use the app.

**Fix (commit 90f4450):** Created `vercel.json`:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Verified:** `/auth/doctor` and `/auth/admin` now return HTTP 200.

---

## 3. Automated Test Results

### 3a. Playwright headless browser — deployed production site

| # | Test | Result |
|---|------|--------|
| 1 | Vercel root loads (HTTP 200) | ✓ PASS |
| 2 | No localhost/127.0.0.1 calls from production frontend | ✓ PASS |
| 3 | Render `/api/health` — status=healthy, database=connected, mode=simulation | ✓ PASS (curl verified) |
| 4 | Deep link `/` | ✓ PASS |
| 5 | Deep link `/auth/doctor` (post-fix) | ✓ PASS — HTTP 200 |
| 6 | Deep link `/auth/admin` (post-fix) | ✓ PASS — HTTP 200 |
| 7 | API: invalid credentials → HTTP 401 | ✓ PASS |
| 8 | API: missing fields → HTTP 422 | ✓ PASS |
| 9 | Protected `/api/admin/invitations` without token → 401 | ✓ PASS |
| 10 | Protected `/api/admin/verification/pending` without token → 401 | ✓ PASS |
| 11 | Protected `/api/admin/smtp/diagnostic` without token → 401 | ✓ PASS |
| 12 | Protected `/api/admin/orders` without token → 401 | ✓ PASS |
| 13 | CORS: `access-control-allow-origin: https://medi-hawk3.vercel.app` | ✓ PASS (curl) |
| 14 | CORS: `access-control-allow-credentials: true` | ✓ PASS (curl) |
| 15 | CORS: no wildcard `*` | ✓ PASS |
| 16 | Invalid JWT → HTTP 401 | ✓ PASS |
| 17 | No secrets in production bundle (3 JS files scanned) | ✓ PASS |
| 18 | Backend test suite: 468/468 pass | ✓ PASS |
| 19 | TypeScript: 0 errors | ✓ PASS |
| 20 | Vite production build: clean | ✓ PASS |

### 3b. Items requiring real production credentials (UNVERIFIED in CI)

| Test | Status | Reason |
|------|--------|--------|
| Doctor login — real prod account | UNVERIFIED | Requires real doctor account |
| Admin login — real prod account | UNVERIFIED | Requires real admin account |
| OTP real email delivery | UNVERIFIED | Requires live Resend delivery to inbox |
| Forgot password end-to-end | UNVERIFIED | Requires inbox access |
| Real order creation | UNVERIFIED | Requires authenticated doctor session |
| Simulation/mission lifecycle | UNVERIFIED | Requires authenticated admin session |
| WebSocket real-time events | UNVERIFIED | Flask-SocketIO not yet implemented (Phase 1H) |
| SMTP/Resend production test-send | UNVERIFIED | Requires admin session via POST /api/admin/smtp/test-send |

---

## 4. Security Checks

| Check | Status |
|-------|--------|
| JWT role always from DB (`to_dict()` hardcodes role) — never from request body | ✓ CONFIRMED |
| No role=admin accepted from client | ✓ CONFIRMED |
| bcrypt cost 12 — never bypassed | ✓ CONFIRMED |
| All admin routes enforce `@require_admin` (JWT check) | ✓ CONFIRMED |
| OTP: single-use, expiry, rate-limited, HMAC-SHA256 storage | ✓ CONFIRMED |
| No SMTP_PASSWORD / DATABASE_URL / JWT_SECRET in logs | ✓ CONFIRMED |
| No hardcoded credentials or backdoors | ✓ CONFIRMED |
| `SEED_DEMO_DATA=false` in production | ✓ CONFIRMED |
| `APP_MODE=simulation` (hardware commands blocked) | ✓ CONFIRMED |
| No secrets committed to git (`.env` in `.gitignore`) | ✓ CONFIRMED |
| CORS: specific origins only, `supports_credentials=True` | ✓ CONFIRMED |
| No wildcard CORS origin | ✓ CONFIRMED |
| Frontend: no localhost/127.0.0.1 API calls in production build | ✓ CONFIRMED |

---

## 5. Architecture Verified

```
Browser → https://medi-hawk3.vercel.app (Vercel CDN)
              ↓ vercel.json rewrites all paths → index.html
              ↓ React Router handles client-side routing
              ↓ Authenticated API calls → VITE_API_BASE_URL
          https://medihawk3.onrender.com (Render Gunicorn)
              ↓ Flask 3.x application factory
              ↓ Cloudflare proxied
          Render PostgreSQL 16
              ↓ psycopg3 NullPool
          Resend API (HTTPS transport)
              ↓ EMAIL_PROVIDER=https, EMAIL_API_PROVIDER=resend
```

---

## 6. Final Build State

| Item | Value |
|------|-------|
| Latest commit | 90f4450 — `fix: add vercel.json SPA rewrite` |
| Backend tests | 468 pass / 0 fail |
| TypeScript errors | 0 |
| Vite build | Clean (chunk size warning pre-existing, not new) |
| Known open issues | None |
| Deferred features | Flask-SocketIO (Phase 1H — not in scope for submission) |

---

## 7. Manual Verification Recommended Before Demo

1. **Admin login:** Navigate to `https://medi-hawk3.vercel.app/auth/admin` — confirm login form renders, submit with real admin credentials, verify dashboard loads on hard refresh (session hydration).
2. **Doctor signup + OTP:** Create a new doctor account, confirm OTP email arrives at real inbox via Resend.
3. **Order placement:** Login as doctor, place a test order, verify it appears in admin order list.
4. **Simulation:** Login as admin, trigger a mission, verify drone movement on the map.
5. **Email test-send:** `POST /api/admin/smtp/test-send` with `to: subhranshu.dev@gmail.com` — confirm Resend delivery.
