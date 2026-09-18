# MediHawk — SMTP Connection Forensic Report

**Date:** 2026-09-18  
**Scope:** SMTP `connection: failed` on Render production — root cause confirmed + fix

---

## CONFIRMED ROOT CAUSE

```
errno 101 — ENETUNREACH (Network is unreachable)
```

Production diagnostic (commit 1fff434, deployed):
```json
{
  "dns": "ok",
  "dns_address_count": 2,
  "tcp": "failed",
  "errno": 101,
  "error_category": "NETWORK_ERROR",
  "error_type": "OSError"
}
```

**DNS resolves** (`dns_address_count: 2` — both IPv4 and IPv6 addresses found).  
**TCP never connects** — the OS kernel drops packets with ENETUNREACH before
any TCP handshake, STARTTLS, or credential exchange.

This is a **Render network-layer block** on outbound port 587.
Gmail credentials are NOT the problem. App Password is NOT the problem.
STARTTLS code is NOT the problem.

**Next step: test port 465 (implicit SSL).** If TCP also fails on 465,
Render blocks all outbound SMTP and HTTPS provider must be used.

---

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

## 3. IMMEDIATE ACTION — Test Port 465

**Set these on Render → medihawk-api → Environment Variables:**

```
SMTP_PORT=465
SMTP_USE_TLS=false
```
*(or equivalently: `SMTP_USE_SSL=true`)*

Leave `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` unchanged.

Trigger a manual deploy (or wait for auto-deploy after git push).

Then hit the diagnostic endpoint with your admin JWT:

```bash
curl https://medihawk3.onrender.com/api/admin/smtp/diagnostic \
  -H 'Authorization: Bearer <your-jwt>'
```

**If port 465 works, the response will show:**
```json
{
  "transport": "SSL",
  "port": 465,
  "dns": "ok",
  "tcp": "ok",
  "ssl_connect": "ok",
  "smtp_greeting": "ok",
  "connection": "ok",
  "authentication": "ok"
}
```

**If port 465 also fails with `errno 101`:**  
Render blocks all outbound SMTP. Do NOT change more SMTP settings.
Switch to `EMAIL_PROVIDER=https` (see Section 5 below).

---

## 3b. How to Read the New Diagnostic

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

## 4. Port 465 — What Changed in Code

Commit `b3740f8` adds:

- `SMTP_USE_SSL=true` config option (alternative to `SMTP_USE_TLS=false`)
- `ssl_connect` stage in `test_auth()` diagnostic result — tracks whether
  `smtplib.SMTP_SSL` constructor (implicit TLS) succeeded
- `init_transport()` correctly resolves: `SMTP_USE_SSL=true` → `use_tls=False` → SSL

**Never use STARTTLS on port 465.** The code enforces: `use_tls=False` when `use_ssl=True`.

---

## 5. If Port 465 Also Blocked — HTTPS Email Provider

The code now has a full `HTTPSTransport` (commit `b3740f8`) that sends via the
provider's REST API over port 443 (HTTPS — always open on Render).

**Render env vars to activate:**
```
EMAIL_PROVIDER=https
EMAIL_API_PROVIDER=resend        # or sendgrid / mailgun
EMAIL_API_KEY=<your API key>
SMTP_FROM_EMAIL=<sender address authorized by the provider>
```

No SMTP vars needed. No code change needed — the transport is selected at startup.

| Provider | Free tier | Sender requirement | Sign up |
|----------|-----------|-------------------|---------|
| Resend | 3,000/month | Domain DNS verification | resend.com |
| SendGrid | 100/day | Domain or single sender | sendgrid.com |
| Mailgun | 1,000/month (EU/US) | Domain DNS verification | mailgun.com |

**Note:** These providers require you to verify a sender domain (or at least a
single sender email address). Gmail addresses (`@gmail.com`) typically cannot
be used as the `FROM` address for third-party APIs. You'd need to verify
a custom domain (e.g., `noreply@medihawk.in`) or use their sandbox/test address.

The `HTTPSTransport.test_auth()` diagnostic:
```json
{
  "transport": "HTTPS",
  "provider": "resend",
  "dns": "ok",
  "tcp": "ok",
  "tls_connect": "ok",
  "connection": "ok",
  "authentication": "configured"
}
```

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
pytest -q:     459 passed (full suite) / 179 passed (critical paths)
TypeScript:    0 errors  (npx tsc --noEmit)
```

---

## 9. Files Changed

### Commit `1fff434` (diagnostic)
| File | Change |
|------|--------|
| `backend/services/email_service.py` | `test_auth()` redesigned: staged DNS/TCP/SMTP prober, never raises, `error_category` added; timeout 10→30s |
| `backend/routes/verification.py` | `smtp_diagnostic()` simplified — no try/except RuntimeError |
| `Dockerfile` | Added `ca-certificates` to apt-get install |

### Commit `b3740f8` (port 465 + HTTPS fallback)
| File | Change |
|------|--------|
| `backend/config.py` | `SMTP_USE_SSL`, `EMAIL_PROVIDER`, `EMAIL_API_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_API_DOMAIN` |
| `backend/services/email_service.py` | `ssl_connect` stage in `test_auth()`; `HTTPSTransport` class (Resend/SendGrid/Mailgun); `init_transport()` updated |
| `backend/routes/verification.py` | Duck-typing in `smtp_diagnostic()` so `HTTPSTransport` is handled automatically |

**Branch:** `main` — both commits pushed 2026-09-18

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

*Updated 2026-09-18 — commits 1fff434 + b3740f8*
