# MediHawk — Final Doctor Onboarding E2E Audit Report

**Date:** 2026-09-18  
**Auditor:** Claude Sonnet 4.6 (automated E2E integration audit)  
**Scope:** Doctor signup, email verification, institutional approval, login gate, authorization, regression

---

## Executive Summary

| Gate | Result |
|------|--------|
| Flow A — invalid invitation → cannot become doctor | ✅ PASS |
| Flow B — full onboarding flow (local) | ✅ PASS |
| Transaction ordering bug | ✅ FIXED (orphaned accounts eliminated) |
| SMTP — TLS connection | ✅ PASS |
| SMTP — Gmail authentication | ❌ FAIL — App Password expired |
| PostgreSQL schema | ✅ PASS |
| Authorization gate (PENDING/REJECTED/SUSPENDED → 403) | ✅ PASS |
| Authorization gate (VERIFIED → 200) | ✅ PASS |
| pytest regression | ✅ 457 passed |
| TypeScript typecheck | ✅ 0 errors |
| Vite build | ✅ clean |

**Production is NOT fully operational until the Gmail App Password is regenerated and set on Render.**

---

## 1. SMTP Investigation

### Finding

The production 503 `"Account created but verification email failed"` was caused by **an expired Gmail App Password** — not a code bug.

```
Testing: host=smtp.gmail.com port=587 user=subhransu25112005@gmail.com
STARTTLS: code=220
SMTP error: SMTPAuthenticationError: (535, b'5.7.8 Username and Password not accepted. ...')
```

STARTTLS negotiation succeeds (TLS is functional). Authentication fails because the App Password in `.env` (`uwip pcxc saqd btat`) has been revoked or expired.

### Action Required

1. Go to https://myaccount.google.com/apppasswords
2. Create a new App Password for "Mail" / "Other (MediHawk)"
3. Update on Render: **Settings → Environment Variables**:

| Variable | Value |
|----------|-------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USERNAME` | `subhransu25112005@gmail.com` |
| `SMTP_PASSWORD` | `<new 16-char App Password>` |

4. Also set (if not already):

| Variable | Value |
|----------|-------|
| `OTP_HMAC_SECRET` | `<same value as local .env>` |
| `JWT_SECRET_KEY` | `<same value as local .env>` |
| `ADMIN_INVITE_CODE` | `<same value as local .env>` |

---

## 2. Critical Bug Fixed — Transaction Ordering

### Problem (before this fix)

In `backend/routes/auth.py` `doctor_signup()`:

```python
# OLD (BROKEN) ORDER:
db.session.commit()  # ← doctor + invitation committed here
# ... then send email ...
# If email fails → doctor exists permanently, invitation consumed → 503
```

On SMTP failure the response said:
> `"Account created but verification email failed. Contact support."`

This was dangerous: the account existed but had no OTP session, invitation was consumed, and the user could never complete signup.

### Fix Applied

**New order:** attempt OTP creation + email delivery FIRST. Only commit doctor + invitation if email delivery succeeds.

```python
# NEW (FIXED) ORDER in doctor_signup():
#
# 1. request_otp() — creates OTPSession, commits it (OTPSession.user_id has no FK constraint)
# 2. send_signup_verification_email() — deliver email
# If step 2 raises RuntimeError:
#     cancel_pending_otp() — mark OTP session consumed
#     return 503 "Could not send verification email. Please try again."
#     (no doctor record created — invitation still available)
# If step 2 succeeds:
#     db.session.add(doctor)
#     matched_inv.used_by_doctor_id = doctor_id
#     db.session.commit()  ← committed only after email confirmed
```

**Why this works:** `OTPSession.user_id` is `String(50)` with no FK constraint, so we can forward-reference the `doctor_id` before the Doctor row exists.

**Error message updated:** `"Could not send verification email. Please try again."` — correctly implies no account was created.

---

## 3. Flow A — Invalid Invitation → Cannot Become Operational Doctor

Tests against production (`https://medihawk3.onrender.com`):

| Scenario | Expected | Actual |
|----------|----------|--------|
| Signup without `invitation_code` | 422 VALIDATION_ERROR | ✅ 422 VALIDATION_ERROR |
| Signup with invalid `invitation_code` | 403 INVALID_INVITATION_CODE | ✅ 403 INVALID_INVITATION_CODE |
| Login as doctor with no account | 401 INVALID_CREDENTIALS | ✅ 401 INVALID_CREDENTIALS |
| Access protected route without token | 401 AUTH_REQUIRED | ✅ 401 AUTH_REQUIRED |

No unauthorized doctor can become operational. Gate confirmed on production.

---

## 4. Flow B — Full Onboarding (Local E2E, Test Transport)

Verified via 55 tests in `test_signup.py` + `test_doctor_verification.py`:

| Step | Test | Result |
|------|------|--------|
| Admin creates invitation (CSPRNG, hashed, 30-day expiry) | `test_create_invitation_success` | ✅ PASS |
| Raw code returned once only, never in list | `test_invitation_list_does_not_contain_raw_code` | ✅ PASS |
| Doctor signs up with valid invitation → 201 | `test_valid_signup_returns_201` | ✅ PASS |
| New doctor has `verification_status='pending'` | `test_signup_sets_pending_status` | ✅ PASS |
| New doctor has `email_verified=False` | `test_valid_signup_returns_201` | ✅ PASS |
| Invitation marked used after signup | `test_signup_marks_invitation_used` | ✅ PASS |
| Pending doctor cannot log in | `test_pending_doctor_login_blocked` | ✅ PASS |
| Admin approves doctor → verification_status='verified', verified_by_admin_id set | `test_approved_doctor_can_login` | ✅ PASS |
| Verified doctor can log in | `test_verified_doctor_login_succeeds` | ✅ PASS |

---

## 5. Invitation Security Properties

| Property | Mechanism | Verified |
|----------|-----------|----------|
| CSPRNG generation | `secrets.token_hex(32)` — 256-bit entropy | ✅ PASS |
| No plaintext storage | Only `HMAC-SHA256(OTP_HMAC_SECRET, raw_code)` in DB | ✅ PASS |
| Single-use | `used_by_doctor_id IS NOT NULL` check before acceptance | ✅ `test_invitation_single_use` PASS |
| Expiry (30 days) | `expires_at > now_utc` filter | ✅ `test_expired_invitation_rejected` PASS |
| Revocable | Admin `POST /api/admin/invitations/<id>/revoke` | ✅ `test_revoke_unused_invitation` PASS |
| Revoked code blocked | `revoked=False` filter on lookup | ✅ `test_revoked_invitation_blocks_signup` PASS |
| Facility-bound | `phc_id` set from `matched_inv.facility_id`, not client | ✅ `test_invitation_facility_bound` PASS |
| Constant-time comparison | `hmac.compare_digest(inv.code_hash, supplied_hash)` | ✅ PASS |
| Hash never returned in list | `to_dict()` excludes `code_hash` | ✅ `test_invitation_list_does_not_contain_raw_code` PASS |

---

## 6. PostgreSQL State Verification

All 5 new doctor columns and 9 invitation columns present (verified on SQLite + PostgreSQL):

### `doctors` table — Phase 2A columns

| Column | Default | State at signup | After admin approval |
|--------|---------|-----------------|----------------------|
| `verification_status` | `'pending'` | `'pending'` | `'verified'` |
| `medical_registration_no` | NULL | supplied value | unchanged |
| `verified_at` | NULL | NULL | `datetime.now(utc)` |
| `verified_by_admin_id` | NULL | NULL | `g.user_id` from JWT |
| `verification_notes` | NULL | NULL | optional admin notes |

`verified_by_admin_id` is always set from `g.user_id` (decoded JWT), **never from the request body**.

### `doctor_invitations` table

| Column | After creation | After doctor signup |
|--------|----------------|---------------------|
| `code_hash` | HMAC-SHA256 hash | unchanged |
| `used_by_doctor_id` | NULL | doctor_id |
| `used_at` | NULL | datetime |
| `revoked` | False | False |
| `expires_at` | now + 30 days | unchanged |

---

## 7. Authorization Gate — All Statuses

Tested via `TestLoginVerificationGate` (5 tests, all pass):

| Status | `/api/login` | `/api/auth/otp/verify` | `require_verified_doctor` routes |
|--------|-------------|------------------------|----------------------------------|
| `pending` | 403 `DOCTOR_VERIFICATION_PENDING` | 403 | 403 |
| `rejected` | 403 `DOCTOR_VERIFICATION_REJECTED` | 403 | 403 |
| `suspended` | 403 `DOCTOR_ACCOUNT_SUSPENDED` | 403 | 403 |
| `verified` | 200 + JWT | 200 + JWT | 200 |
| admin (any status) | Unaffected — separate table | N/A | N/A |

`require_verified_doctor` re-checks the DB on **every protected request** — a cached JWT cannot bypass a status change.

---

## 8. Security Constraints Compliance

| Constraint | Status |
|-----------|--------|
| JWT role ALWAYS from DB via `sub` claim | ✅ Role never from request body |
| Every admin endpoint uses `@require_admin` | ✅ All 7 verification endpoints |
| Raw invitation code never stored | ✅ Only HMAC-SHA256 in `code_hash` |
| No permanent universal DOCTOR_KEY | ✅ Per-facility, single-use, expiring invitations |
| `verified_by_admin_id` from JWT, not body | ✅ `g.user_id` set by middleware |
| `verification_status` only set by admin endpoints | ✅ Never accepted from client |
| `role=doctor` not sufficient for doctor status | ✅ `require_verified_doctor` checks DB |
| Constant-time code comparison | ✅ `hmac.compare_digest` |
| Hash never returned in API response | ✅ Excluded from `to_dict()` |
| No secrets logged | ✅ Only invitation IDs and redacted emails |
| `APP_MODE=simulation` default unchanged | ✅ No changes to mode logic |

---

## 9. Regression Results

```
pytest -q:   457 passed, 11 warnings
TypeScript:  0 errors  (npx tsc --noEmit)
Vite build:  ✓ built in 1.44s
```

---

## 10. Production Checklist — Required Before Go-Live

- [ ] **Regenerate Gmail App Password** at https://myaccount.google.com/apppasswords
- [ ] **Update Render env vars**: `SMTP_PASSWORD` (new value), verify `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`
- [ ] **Seed production database**: set `SEED_DEMO_DATA=true` on Render and trigger a manual deploy
- [ ] **E2E smoke test** (once SMTP and seed are live):
  - Admin login with seeded credentials
  - Create a doctor invitation via `/api/admin/invitations`
  - POST `/api/auth/doctor/signup` with the invitation code
  - Receive OTP email, POST `/api/auth/verify-email`
  - Admin approves via `/api/admin/verification/<id>/approve`
  - Doctor logs in → receives JWT

---

## 11. Files Changed in This Audit

| File | Change |
|------|--------|
| `backend/routes/auth.py` | Fixed transaction ordering in `doctor_signup` — email sent before DB commit |

All other changes were made in the prior session (commit `bd1db56`).

---

*Generated 2026-09-18. Production unblocked pending SMTP credential renewal.*
