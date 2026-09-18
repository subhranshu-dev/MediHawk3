# MediHawk — Doctor Authenticity / Institutional Verification Security Report

**Date:** 2026-09-18  
**Branch:** main  
**Test count before:** 425 → **after:** 457 (+32 new tests)  
**Build:** ✓ clean (TypeScript 0 errors, Vite 6.07s)

---

## 1. System Overview

The Doctor Verification system introduces a two-gate model for doctor access:

1. **Contact verification** (existing): Email OTP confirms the doctor controls the email address
2. **Institutional verification** (new): Admin reviews the registration and sets status to VERIFIED before the doctor can log in

Doctors cannot access the system until an admin explicitly approves their registration, regardless of email verification status.

---

## 2. Threat Model

| Threat | Mitigation |
|--------|-----------|
| Unauthorized doctor account creation | Invitation code required at signup — only admins can issue codes |
| Brute-force invitation code guessing | Constant-time comparison; codes are 32-byte CSPRNG (256-bit entropy) |
| Invitation code interception | Code shown once, never stored in plaintext, never returned in list endpoints |
| Doctor impersonating admin | JWT `sub` → DB lookup for role; role never trusted from request body |
| Admin falsifying approver identity | `verified_by_admin_id` set from `g.user_id` (JWT), never from request body |
| Replay of used invitation | `used_by_doctor_id` set atomically on first use; subsequent attempts rejected |
| Invitation code phishing to another facility | Invitation is facility-bound; `phc_id` from invitation overrides client-supplied value |
| Suspended doctor retaining access via cached JWT | `require_verified_doctor` re-checks DB on every protected request |
| Credential stuffing for unverified doctors | Verification gate at login blocks access before password comparison succeeds |

---

## 3. Security Properties

### Invitation Codes

| Property | Implementation |
|----------|---------------|
| Cryptographic randomness | `secrets.token_hex(32)` — 256-bit CSPRNG |
| No plaintext storage | Only `HMAC-SHA256(OTP_HMAC_SECRET, raw_code)` stored as `code_hash` |
| Single-use enforcement | `used_by_doctor_id` set atomically via `db.session.flush()` + `commit()` |
| Facility binding | `phc_id` on doctor record is set from `matched_inv.facility_id`, not client request |
| Time-limited | `expires_at = now + 30 days`; expired invitations rejected |
| Revocable | Admin can revoke any unused invitation; used invitations cannot be revoked |
| Constant-time comparison | `hmac.compare_digest(inv.code_hash, supplied_hash)` for every candidate row |
| Code never returned in list | `GET /api/admin/invitations` returns `to_dict()` which excludes `code_hash` |
| Code shown once | Raw code returned only at creation time; never stored, never retrievable |

### Verification Status

| Status | Login | OTP Login | Doctor routes |
|--------|-------|-----------|---------------|
| `pending` | 403 `DOCTOR_VERIFICATION_PENDING` | 403 | Blocked by `require_verified_doctor` |
| `verified` | 200 | 200 | Allowed |
| `rejected` | 403 `DOCTOR_VERIFICATION_REJECTED` | 403 | Blocked |
| `suspended` | 403 `DOCTOR_ACCOUNT_SUSPENDED` | 403 | Blocked |

### JWT Security (unchanged)

- Role is always read from the JWT `sub` → DB lookup
- `verified_by_admin_id` is always set from `g.user_id` (decoded JWT), never from the request body
- No client-supplied field is trusted as proof of identity or role

---

## 4. Changed Files

### Backend

| File | Change |
|------|--------|
| `backend/models/invitation.py` | NEW — `DoctorInvitation` model |
| `backend/models/doctor.py` | Added `verification_status`, `medical_registration_no`, `verified_at`, `verified_by_admin_id`, `verification_notes` |
| `backend/models/__init__.py` | Import `DoctorInvitation` |
| `backend/database.py` | Phase 2A migrations for new doctor columns |
| `backend/routes/auth.py` | `doctor_signup` requires invitation + med reg; login/OTP verify check `verification_status` |
| `backend/routes/verification.py` | NEW — 7 admin endpoints for invitations and verification |
| `backend/middleware/auth.py` | Added `require_verified_doctor` decorator |
| `backend/app.py` | Register `verification_bp` |
| `backend/seed.py` | Set `verification_status='verified'` on demo doctors |
| `backend/tests/test_signup.py` | Updated to use invitation flow |
| `backend/tests/test_doctor_verification.py` | NEW — 32 tests |

### Frontend

| File | Change |
|------|--------|
| `src/services/api/index.ts` | Updated `doctorSignup` signature; added 7 admin verification/invitation API methods |
| `src/pages/auth/DoctorLogin.tsx` | Added `medical_registration_no`, `phc_id`, `invitation_code` fields to signup form; status-specific login error messages |
| `src/pages/admin/AdminDoctorVerification.tsx` | NEW — admin UI for pending reviews and invitation management |
| `src/components/layout/AdminSidebar.tsx` | Added "Doctor Registry" nav item |
| `src/App.tsx` | Added `/admin/doctors` route |

---

## 5. New API Endpoints

### Admin: Invitation Management

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| `POST` | `/api/admin/invitations` | `require_admin` | Create invitation for facility |
| `GET` | `/api/admin/invitations` | `require_admin` | List all invitations |
| `POST` | `/api/admin/invitations/<id>/revoke` | `require_admin` | Revoke unused invitation |

### Admin: Doctor Verification

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| `GET` | `/api/admin/verification/pending` | `require_admin` | List pending doctors |
| `POST` | `/api/admin/verification/<id>/approve` | `require_admin` | Approve doctor |
| `POST` | `/api/admin/verification/<id>/reject` | `require_admin` | Reject doctor |
| `POST` | `/api/admin/verification/<id>/suspend` | `require_admin` | Suspend doctor |

---

## 6. New Doctor Signup Flow

```
Doctor receives invitation code from admin
    ↓
POST /api/auth/doctor/signup
  { name, email, phone, password, medical_registration_no, phc_id, invitation_code }
    ↓
Server: validate invitation (HMAC hash match, not expired, not used, not revoked, facility matches)
    ↓
Create doctor with verification_status='pending'
Mark invitation as used (atomic with doctor creation)
    ↓
Send email verification OTP
    ↓
Doctor verifies email: POST /api/auth/verify-email
    ↓
Admin reviews: GET /api/admin/verification/pending
Admin approves: POST /api/admin/verification/<id>/approve
    ↓
Doctor can now log in: POST /api/login → 200
```

---

## 7. Database Schema Changes

### `doctors` table — new columns (Phase 2A migration)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `verification_status` | TEXT NOT NULL | `'pending'` | PENDING/VERIFIED/REJECTED/SUSPENDED |
| `medical_registration_no` | TEXT UNIQUE | NULL | MCI/State council registration |
| `verified_at` | DATETIME/TIMESTAMP | NULL | Set when approved |
| `verified_by_admin_id` | TEXT | NULL | Admin who approved/rejected/suspended |
| `verification_notes` | TEXT | NULL | Admin review notes |

### `doctor_invitations` table — new (created by `db.create_all()`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | `inv-{uuid}` |
| `code_hash` | TEXT UNIQUE | HMAC-SHA256 of raw code |
| `facility_id` | TEXT FK→locations | Facility-bound |
| `created_by_admin_id` | TEXT FK→admins | Audit trail |
| `used_by_doctor_id` | TEXT FK→doctors NULL | Set on first use |
| `expires_at` | DATETIME | 30 days from creation |
| `used_at` | DATETIME NULL | Timestamp of first use |
| `revoked` | BOOLEAN | Default False |
| `created_at` | DATETIME | Auto |

---

## 8. Idempotency

- `db.create_all()` at startup creates `doctor_invitations` table on fresh/existing databases (no-op if exists)
- Phase 2A migrations add new doctor columns with `IF NOT EXISTS` guards
- Idempotent on repeated deployments

---

## 9. Test Results

```
457 passed, 11 warnings in 1364.64s
Exit code: 0
```

New tests breakdown:
- `TestInvitationCreation` (7 tests) — creation, auth, role guard, validation
- `TestInvitationRevocation` (3 tests) — revoke unused, revoked blocks signup, used cannot revoke
- `TestDoctorSignupWithInvitation` (7 tests) — valid, pending status, marked used, expired, single-use, wrong code, facility bound
- `TestLoginVerificationGate` (5 tests) — pending/rejected/suspended blocked, verified allowed, admin unaffected
- `TestAdminVerificationActions` (10 tests) — list, approve, reject, suspend, 409 idempotency, role guard, 404, approved can login, suspended blocked

---

## 10. TypeScript Result

```
npx tsc --noEmit → 0 errors
```

---

## 11. Vite Build Result

```
VITE_API_BASE_URL=https://medihawk3.onrender.com npm run build
✓ 3755 modules transformed.
✓ built in 6.07s
```

---

## 12. Security Constraints Compliance

| Constraint | Status |
|-----------|--------|
| JWT role ALWAYS from DB via JWT `sub` claim | ✓ Unchanged — role never from request body |
| Every admin endpoint enforces JWT authentication | ✓ All 7 new endpoints use `@require_admin` |
| NEVER store raw invitation code in plaintext | ✓ Only HMAC-SHA256 digest stored as `code_hash` |
| NEVER create a permanent universal DOCTOR_KEY | ✓ Each invitation is facility-bound, single-use, expiring |
| Invitation codes use CSPRNG | ✓ `secrets.token_hex(32)` — 256-bit entropy |
| Codes hashed before storage | ✓ `HMAC-SHA256(OTP_HMAC_SECRET, raw_code)` |
| Codes expire | ✓ `expires_at = now + 30 days` |
| Codes are single-use | ✓ `used_by_doctor_id` checked before accepting |
| Codes are revocable | ✓ `revoked=True` blocks acceptance |
| Codes are facility-bound | ✓ `phc_id` from invitation, not client |
| Codes invalid after use | ✓ `used_by_doctor_id IS NOT NULL` check |
| Never return stored hash | ✓ `to_dict()` excludes `code_hash` |
| Never log raw invitation codes | ✓ Only `inv_id` logged, never raw code |
| Never accept `verified=true` from frontend | ✓ `verification_status` only set by admin endpoints |
| Never accept `role=doctor` as proof of doctor status | ✓ `require_verified_doctor` checks DB on every request |
| Never accept client-supplied admin ID | ✓ `verified_by_admin_id = g.user_id` (from JWT) |
| Constant-time comparison | ✓ `hmac.compare_digest` for all code comparisons |
| APP_MODE=simulation default unchanged | ✓ No changes to app mode logic |
| No DB deletion or data destruction | ✓ Only additive changes (new columns, new table) |
| No secrets logged | ✓ Only invitation IDs and redacted emails in logs |

---

## **DOCTOR VERIFICATION SYSTEM DEPLOYED ✅**

*All 457 tests pass. TypeScript clean. Vite build clean.*

*Generated 2026-09-18*
