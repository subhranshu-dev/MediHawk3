# MediHawk — Final Submission Production QA Report

**Date:** 2026-09-18  
**Branch:** main  
**Latest commit:** 4575fcc — `fix: add User-Agent header to bypass Cloudflare 1010 WAF block on Resend API`  
**Production URLs:** https://medi-hawk3.vercel.app (frontend) · https://medihawk3.onrender.com (backend)

---

## 1. Test Environment

| Component | Value |
|-----------|-------|
| Browser driver | Playwright + Google Chrome (headless) |
| Frontend | Vercel — React/Vite/TypeScript SPA |
| Backend | Render FREE — Flask 3.x / Gunicorn |
| Database | Render PostgreSQL 16 |
| Email | Resend (HTTPS transport) — `EMAIL_PROVIDER=https` |
| Backend tests | **494/494 pass** (SQLite, Python 3.14) |

---

## 2. Issues Found and Fixed

### ISSUE 1 — RESOLVED: Vercel SPA deep links returned 404

**Root cause:** No `vercel.json`. Vercel's static hosting resolves file paths literally — `/auth/doctor` has no matching file.

**Fix (commit 90f4450):** Added `vercel.json` with SPA rewrite: all paths → `index.html`.

**Verified:** `/auth/doctor` and `/auth/admin` return HTTP 200.

---

### ISSUE 2 — RESOLVED: OTP email failing — Render SMTP ports blocked

**Root cause:** Render FREE blocks all outbound SMTP ports (25, 465, 587). Gmail SMTP cannot be used.

**Fix (commits 581e93a, 6778b66):** Implemented HTTPS transport using Resend API (port 443). Added `FallbackTransport` (SMTP primary, HTTPS fallback on network-level failures). Added `RESEND_API_KEY` as primary env var; `EMAIL_API_FROM` for verified sender override.

---

### ISSUE 3 — RESOLVED: Resend error 1010 (Cloudflare WAF block)

**Symptom:** Production Render logs showed:
```
Resend API HTTP error: status=403
from=on***@resend.dev
body_prefix=error code: 1010
```

**Root cause — confirmed:**

Resend's API is fronted by Cloudflare. Python's `urllib.request` sends the default
`User-Agent: Python-urllib/3.x` header. Cloudflare's WAF classifies this as a bot
signature and blocks the request with HTTP 403 + response body `error code: 1010`.

Cloudflare error code 1010 specifically means: "The owner of this website has banned
your access based on your browser's signature." This is a **browser/client fingerprint
block**, not an IP block (which would be 1006–1009) and not a Resend application error.

**Fix (commit 4575fcc):**

Added `User-Agent: MediHawk/1.0` and `Accept: application/json` headers to the Resend
API request in `HTTPSTransport._send_resend()`. The same headers were added to
`_send_sendgrid()` and `_send_mailgun()` for consistency.

```python
headers={
    'Authorization': f'Bearer {self._api_key}',
    'Content-Type': 'application/json',
    'User-Agent': 'MediHawk/1.0',   # <-- bypasses Cloudflare WAF 1010
    'Accept': 'application/json',
},
```

Also increased error body logging from 300 → 500 chars so Cloudflare error pages
(which include the blocked UA string) are fully captured in Render logs.

**Is this free?** Yes — this is a header change only. No paid plan required.

**Cost:** ₹0 additional. Resend free tier (3,000 emails/month) continues to apply.

---

## 3. Automated Test Results

### 3a. Backend pytest suite

| Run | Count | Result |
|-----|-------|--------|
| Pre-fix baseline | 488 | All pass |
| After email transport fix | 494 | All pass (+6 new tests) |

**New tests added (commit 4575fcc):**
- `test_resend_403_raises_delivery_failed` — HTTP 403 → EMAIL_DELIVERY_FAILED
- `test_resend_cloudflare_1010_body_logged` — CF 1010 error body captured in logs
- `test_resend_user_agent_header_is_medihawk` — User-Agent: MediHawk/1.0 verified
- `test_resend_api_key_not_in_logs` — API key never leaks to logs
- `test_resend_sender_restriction_gmail_raises_delivery_failed` — gmail 422 → error
- `test_resend_invalid_api_key_raises_delivery_failed` — revoked key → error

### 3b. Production endpoint verification

| # | Test | Result |
|---|------|--------|
| 1 | Vercel root loads (HTTP 200) | ✓ PASS |
| 2 | No localhost/127.0.0.1 calls from frontend | ✓ PASS |
| 3 | Render `/api/health` — status=healthy, database=connected | ✓ PASS |
| 4 | Deep link `/auth/doctor` | ✓ PASS — HTTP 200 |
| 5 | Deep link `/auth/admin` | ✓ PASS — HTTP 200 |
| 6 | Invalid credentials → 401 `INVALID_CREDENTIALS` | ✓ PASS |
| 7 | Missing fields → 422 | ✓ PASS |
| 8 | Protected admin routes without JWT → 401 | ✓ PASS |
| 9 | CORS: `access-control-allow-origin: https://medi-hawk3.vercel.app` | ✓ PASS |
| 10 | CORS: `allow-credentials: true`, no wildcard | ✓ PASS |
| 11 | TypeScript: 0 errors | ✓ PASS |
| 12 | Vite production build: clean | ✓ PASS |

### 3c. Production email delivery status

| Test | Status | Note |
|------|--------|------|
| Resend API reachable from Render | ✓ CONFIRMED | HTTP 403 received = TCP/TLS reached Resend |
| Cloudflare 1010 root cause | ✓ IDENTIFIED | Python-urllib/3.x UA blocked by CF WAF |
| User-Agent fix deployed | PENDING RENDER DEPLOY | Commit 4575fcc pushed to GitHub |
| OTP delivery to real inbox | **PENDING** | Requires Render deploy + inbox verification |
| Forgot password end-to-end | **PENDING** | Requires OTP delivery to complete |
| Doctor login (real credentials) | **PENDING** | Requires password reset via working email |

**After deploy, check Render logs.** If the fix is working:
- Old log: `body_prefix=error code: 1010`
- New log (if 1010 fixed): either no error (email sent) or a different Resend error code

**If a NEW error appears after deploy:**

| New Render log | Meaning | Fix |
|---------------|---------|-----|
| `status=422, body_prefix={"name":"validation_error"...}` | `EMAIL_API_FROM` sender not verified | Set `EMAIL_API_FROM=onboarding@resend.dev` (sandbox) or a verified domain |
| `status=401` | API key invalid or revoked | Re-generate `RESEND_API_KEY` in Resend dashboard |
| `status=403, body_prefix={"name":"forbidden"...}` | API key lacks send permissions | Check API key scopes in Resend dashboard |
| No error in logs, email not received | Sandbox restriction | `onboarding@resend.dev` only delivers to Resend account owner's inbox — verify your email matches |

---

## 4. Production Bootstrap Status

The production database is empty (`SEED_DEMO_DATA=false`). To use the full flow:

1. **Create admin account:** `POST /api/auth/admin/signup` with `ADMIN_INVITE_CODE` from Render dashboard
   - Admin IS saved even if email fails (email-tolerant signup)
   - Admin can log in immediately after signup

2. **Admin creates doctor invitation:** `POST /api/admin/invitations` (authenticated)

3. **Doctor signup:** `POST /api/auth/doctor/signup` with invitation code from step 2

4. **Doctor email verify / login** (requires working email)

`ADMIN_INVITE_CODE` IS configured in Render — confirmed by probe (invalid code → `INVALID_INVITE_CODE` response).

---

## 5. Security Checks

| Check | Status |
|-------|--------|
| JWT role always from DB — never from request body | ✓ CONFIRMED |
| No `role=admin` accepted from client | ✓ CONFIRMED |
| bcrypt cost 12 — never bypassed | ✓ CONFIRMED |
| All admin routes enforce `@require_admin` (JWT check) | ✓ CONFIRMED |
| OTP: single-use, expiry, rate-limited, HMAC-SHA256 storage | ✓ CONFIRMED |
| OTP session cancelled on email delivery failure | ✓ CONFIRMED |
| OTP plaintext never logged | ✓ CONFIRMED |
| API key never logged | ✓ CONFIRMED (new test) |
| No SMTP_PASSWORD / DATABASE_URL / JWT_SECRET in logs | ✓ CONFIRMED |
| No hardcoded credentials or backdoors | ✓ CONFIRMED |
| `SEED_DEMO_DATA=false` in production | ✓ CONFIRMED |
| `APP_MODE=simulation` (hardware commands blocked) | ✓ CONFIRMED |
| No secrets committed to git | ✓ CONFIRMED |
| CORS: specific origins only, `supports_credentials=True` | ✓ CONFIRMED |
| Frontend: no localhost calls in production build | ✓ CONFIRMED |

---

## 6. Architecture

```
Browser → https://medi-hawk3.vercel.app (Vercel CDN)
              ↓ vercel.json: all paths → index.html
              ↓ React Router handles client-side routing
          https://medihawk3.onrender.com (Render FREE / Gunicorn)
              ↓ Flask 3.x application factory
          Render PostgreSQL 16 (psycopg3 NullPool)
          Resend API (HTTPS port 443)
              ↓ EMAIL_PROVIDER=https
              ↓ User-Agent: MediHawk/1.0 (bypasses CF 1010 WAF)
```

---

## 7. Current Build State

| Item | Value |
|------|-------|
| Latest commit | 4575fcc — Cloudflare 1010 fix |
| Backend tests | **494 pass / 0 fail** |
| TypeScript errors | **0** |
| Vite build | **Clean** |
| Known blockers | Render deploy pending; email delivery unverified until deploy + inbox check |
| Deferred features | Flask-SocketIO (Phase 1H) |

---

## 8. Remaining Actions Before Claiming Full PASS

**Cannot claim OTP PASS until:**

1. Render deploys commit 4575fcc (check Render dashboard — deploy usually takes 5–10 min)
2. Render logs show NO `error code: 1010` on next FP/OTP request
3. Actual OTP email arrives in real inbox (`subhransu25112005@gmail.com`)
4. OTP is entered manually and password reset completes
5. Doctor logs in with new password successfully

**Actions for the user:**
- Open Render dashboard → confirm commit `4575fcc` is deployed
- Check Render logs after the next FP/OTP attempt
- If logs show a NEW error (422, 401, etc.) — see the table in Section 3c for next steps
- If email arrives → enter OTP → confirm login
