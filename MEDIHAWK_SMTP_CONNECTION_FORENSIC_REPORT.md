# MediHawk — SMTP Connection Forensic Report

**Date:** 2026-09-18  
**Scope:** SMTP `connection: failed` on Render production — staged diagnostic + fix

---

## 1. Original Production Evidence

```json
GET /api/admin/smtp/diagnostic
{
  "authentication": "unknown",
  "configured": true,
  "connection": "failed",
  "error": "SMTP_CONNECTION_FAILED",
  "from_email": "subhransu25112005@gmail.com",
  "host": "smtp.gmail.com",
  "password_configured": true,
  "port": 587,
  "success": true,
  "transport": "STARTTLS",
  "username_configured": true
}
```

**Root diagnostic problem:** The previous `test_auth()` caught ALL exceptions before
authentication in a single `except Exception` block and raised `SMTP_CONNECTION_FAILED`
without preserving which stage failed. The diagnostic endpoint reconstructed only the
top-level RuntimeError string — it could not distinguish:

- DNS failure
- TCP timeout (Render outbound block)
- TCP connection refused
- TLS certificate error
- STARTTLS protocol failure
- Any other pre-auth exception

---

## 2. What Was Changed

### `backend/services/email_service.py`

`SMTPTransport.test_auth()` completely redesigned as a staged prober:

| Stage | Test | How |
|-------|------|-----|
| DNS | `socket.getaddrinfo(host, port)` | Standard library DNS resolution |
| TCP | `socket.create_connection((host, port), timeout=15)` | Raw TCP, no SMTP protocol |
| SMTP greeting | `smtplib.SMTP(host, port, timeout=30)` | SMTP banner received |
| STARTTLS | `smtp.starttls()` | TLS upgrade succeeds |
| AUTH | `smtp.login(user, pass)` | SMTP credentials accepted |

**New response shape:**
```json
{
  "dns": "ok",
  "dns_address_count": 4,
  "tcp": "ok",
  "smtp_greeting": "ok",
  "starttls": "ok",
  "connection": "ok",
  "authentication": "ok"
}
```

**On failure at any stage:**
```json
{
  "dns": "ok",
  "tcp": "failed",
  "connection": "failed",
  "error_category": "CONNECTION_TIMEOUT",
  "error_type": "TimeoutError"
}
```

**Error categories:**
| Category | Cause |
|----------|-------|
| `DNS_ERROR` | `socket.gaierror` — hostname not resolved |
| `CONNECTION_TIMEOUT` | `socket.timeout` / `TimeoutError` — TCP timed out |
| `CONNECTION_REFUSED` | `ConnectionRefusedError` — port closed |
| `NETWORK_ERROR` | `OSError` — host unreachable, etc. (`errno` also returned) |
| `TLS_CERT_ERROR` | `ssl.SSLCertVerificationError` — CA not trusted |
| `TLS_ERROR` | `ssl.SSLError` — TLS handshake failed |
| `SMTP_CONNECT_ERROR` | `smtplib.SMTPConnectError` — SMTP protocol error |
| `SMTP_AUTH_ERROR` | `smtplib.SMTPAuthenticationError` — credentials rejected (`smtp_code` also returned) |
| `UNKNOWN_ERROR` | Anything else |

**`test_auth()` now always returns — never raises.**  
Credentials are never returned in any field.

**Timeout increased 10s → 30s** in both `send()` and `test_auth()` (cloud-to-cloud connections can take longer than 10s on shared Render infrastructure).

### `backend/routes/verification.py`

`smtp_diagnostic()` simplified — no longer wraps `test_auth()` in try/except RuntimeError.
The new log line includes all stage results:
```
SMTP diagnostic: dns=ok tcp=ok connection=ok auth=ok admin=adm-xxx
```

### `Dockerfile`

Added explicit `ca-certificates` to `apt-get install` (defensive for TLS — Debian slim
images should include it via Python's build, but this makes it explicit and future-proof).

---

## 3. How to Read the New Diagnostic

After deploy, `GET /api/admin/smtp/diagnostic` will return one of these patterns:

### Pattern A — Render outbound SMTP blocked (most likely current cause)
```json
{
  "dns": "ok",
  "dns_address_count": 4,
  "tcp": "failed",
  "connection": "failed",
  "error_category": "CONNECTION_TIMEOUT",
  "error_type": "TimeoutError"
}
```
**Action:** Port 587 is blocked by Render's network. Try `SMTP_PORT=465` +
`SMTP_USE_TLS=false` (Gmail implicit SSL). If 465 is also blocked, use a
relay service (SendGrid, Mailgun, AWS SES) which uses HTTPS not SMTP.

### Pattern B — TLS certificate error
```json
{
  "dns": "ok",
  "tcp": "ok",
  "smtp_greeting": "ok",
  "starttls": "failed",
  "connection": "failed",
  "error_category": "TLS_CERT_ERROR"
}
```
**Action:** CA certificates missing or outdated. The `ca-certificates` Dockerfile
fix should resolve this on next deploy.

### Pattern C — Credentials revoked (the original problem)
```json
{
  "dns": "ok",
  "tcp": "ok",
  "smtp_greeting": "ok",
  "starttls": "ok",
  "connection": "ok",
  "authentication": "failed",
  "error_category": "SMTP_AUTH_ERROR",
  "smtp_code": 535
}
```
**Action:** Regenerate the Gmail App Password at
https://myaccount.google.com/apppasswords and update `SMTP_PASSWORD` on Render.

### Pattern D — Everything works
```json
{
  "dns": "ok",
  "tcp": "ok",
  "smtp_greeting": "ok",
  "starttls": "ok",
  "connection": "ok",
  "authentication": "ok"
}
```
**Action:** Run `POST /api/admin/smtp/test-send` to confirm real email delivery.

---

## 4. Port 465 Fallback (if 587 stays blocked)

If Pattern A is confirmed (TCP timeout on 587), test port 465:

**Render env vars to change:**
```
SMTP_PORT=465
SMTP_USE_TLS=false
```

The existing `SMTPTransport` already uses `smtplib.SMTP_SSL` when `use_tls=False`.
No code change needed.

**Note:** Do NOT set both `SMTP_USE_TLS=true` and port 465 — that would incorrectly
use STARTTLS on an implicit-SSL port. The two modes are mutually exclusive.

---

## 5. If Both Ports Are Blocked — Relay Service

Render Free may block all outbound SMTP. If both 587 and 465 time out, use a
transactional email relay via HTTPS (not SMTP):

| Service | Free tier | SMTP endpoint |
|---------|-----------|---------------|
| SendGrid | 100 emails/day | `smtp.sendgrid.net:587` |
| Mailgun | 1000 emails/month | `smtp.mailgun.org:587` |
| AWS SES | 62,000/month (from EC2) | `email-smtp.<region>.amazonaws.com:587` |
| Resend | 3,000/month | `smtp.resend.com:465` |

Any of these use the same `SMTPTransport` code — just change `SMTP_HOST`,
`SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_PORT` on Render.

---

## 6. Python Environment (Production Container)

| Item | Value |
|------|-------|
| Base image | `python:3.12-slim` (Debian Bookworm) |
| Python | 3.12 |
| CA certificates | Explicit in Dockerfile (added this commit) |
| `smtplib` | Standard library — no external dependency |
| `ssl` module | System OpenSSL via Debian |
| TLS verify | Always on — `ssl.create_default_context()` default |
| SMTP timeout | 30s (was 10s) |

---

## 7. Security Properties (Unchanged)

| Constraint | Status |
|-----------|--------|
| `SMTP_PASSWORD` never in diagnostic response | ✅ |
| `SMTP_PASSWORD` never logged | ✅ Only `bool(password)` as `pw_set=yes/no` |
| Diagnostic requires `@require_admin` JWT | ✅ |
| `error_type` only contains exception class name | ✅ |
| `smtp_code` only contains integer (535, etc.) | ✅ |
| `errno` only contains OS error number | ✅ |
| No credentials in any response field | ✅ |

---

## 8. Regression

```
pytest -q:     459 passed, 11 warnings
TypeScript:    0 errors  (npx tsc --noEmit)
```

---

## 9. Files Changed

| File | Change |
|------|--------|
| `backend/services/email_service.py` | `test_auth()` redesigned: staged DNS/TCP/SMTP prober, no longer raises, `error_category` added; timeout 10→30s |
| `backend/routes/verification.py` | `smtp_diagnostic()` simplified — no try/except RuntimeError; log includes all stage results |
| `Dockerfile` | Added `ca-certificates` to apt-get install |

**Commit:** `1fff434`  
**Branch:** `main`  
**Pushed:** 2026-09-18

---

## 10. Next Steps After Deploy

1. Wait for Render deploy (5-10 min after push)
2. Hit the diagnostic endpoint with your admin JWT:
   ```bash
   curl https://medihawk3.onrender.com/api/admin/smtp/diagnostic \
     -H 'Authorization: Bearer <your-jwt>'
   ```
3. Read the `dns`, `tcp`, `error_category` fields to identify which stage fails
4. Follow the action from Section 3 matching your Pattern (A/B/C/D)
5. If Pattern D (all ok): run test-send and confirm email at `subhranshu.dev@gmail.com`

---

## 11. Final Acceptance Criteria (not yet met)

| Criterion | Current |
|-----------|---------|
| Render deploy live with staged diagnostic | ✅ Pushed — awaiting deploy |
| `GET /api/admin/smtp/diagnostic` → `dns: ok` | Pending production test |
| `GET /api/admin/smtp/diagnostic` → `tcp: ok` | Pending production test |
| `GET /api/admin/smtp/diagnostic` → `starttls: ok` | Pending production test |
| `GET /api/admin/smtp/diagnostic` → `authentication: ok` | Pending production test |
| `POST /api/admin/smtp/test-send` → `sent: true` | Pending |
| Real email received at `subhranshu.dev@gmail.com` | **Pending — final gate** |

**SMTP is NOT declared fixed until Pattern D is confirmed AND real email is received.**

---

*Generated 2026-09-18 — commit 1fff434*
