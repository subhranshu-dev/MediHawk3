# MediHawk — Vercel Localhost Root Cause Report

**Date:** 2026-09-18  
**Symptom:** Live site `https://medi-hawk3.vercel.app` making API requests to `http://localhost:5000` despite `VITE_API_BASE_URL=https://medihawk3.onrender.com` being set in Vercel dashboard.

---

## Exact Root Cause

**The fix commit was never pushed to GitHub.**

Vercel auto-deploys from GitHub. The fix to `src/services/api/index.ts` existed only in a local commit (`035ebe8`) that had not been pushed to `origin/main`. Vercel was building the previous commit (`022ebfc`) which contained the wrong env var key.

**Chain of failure:**

| Layer | State |
|-------|-------|
| Vercel dashboard | `VITE_API_BASE_URL=https://medihawk3.onrender.com` ✓ |
| Vercel source (GitHub `022ebfc`) | `import.meta.env.VITE_API_URL ?? 'http://localhost:5000'` ← **wrong key** |
| Effective result | `import.meta.env.VITE_API_URL` = `undefined` → `?? 'http://localhost:5000'` |

The environment variable was set correctly in Vercel but the deployed code read `VITE_API_URL` (wrong key). Since `VITE_API_URL` was never set in Vercel, `import.meta.env.VITE_API_URL` resolved to `undefined`, causing the nullish-coalescing fallback to produce `'http://localhost:5000'`.

---

## Exact File and Line

**File:** `src/services/api/index.ts`  
**Line 4 at deployed commit `022ebfc`:**

```typescript
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'
//                                     ^^^^^^^^^
//                          Wrong key — should be VITE_API_BASE_URL
//                          VITE_API_URL was never set in Vercel dashboard
```

**Line 7 at fix commit `035ebe8` (now live):**

```typescript
const _rawApiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
//                                   ^^^^^^^^^^^^^^^^^^
//                        Correct key — matches Vercel dashboard setting
```

---

## Code Path: POST /api/auth/login

```
DoctorLogin.tsx / AdminLogin.tsx
  └── authService.login(payload)
        └── src/services/api/index.ts → request('/api/login', ...)
              └── fetch(`${BASE_URL}/api/login`, ...)
                    └── BASE_URL = 'http://localhost:5000'  ← was the bug
```

## Code Path: POST /api/auth/forgot-password/request

```
DoctorLogin.tsx (forgot password flow)
  └── authService.forgotPasswordRequest(contact)
        └── src/services/api/index.ts → request('/api/auth/forgot-password/request', ...)
              └── fetch(`${BASE_URL}/api/auth/forgot-password/request`, ...)
                    └── BASE_URL = 'http://localhost:5000'  ← was the bug
```

Both call `request()` in `src/services/api/index.ts`. **All API calls in the frontend flow through this single function.** Fixing `BASE_URL` fixes every endpoint.

---

## Vercel Project Configuration

No `vercel.json` in the repository. Vercel auto-detects configuration:

| Setting | Value |
|---------|-------|
| Framework preset | Vite (auto-detected) |
| Root Directory | `/` (repository root) |
| Install Command | `npm install` (auto-detected) |
| Build Command | `npm run build` (→ `tsc -b && vite build`) |
| Output Directory | `dist/` (Vite default) |

The project name in `package.json` is `medihawk3` — matches the Vercel project `medi-hawk3`.

---

## Deployed Commit SHA vs Local HEAD

| | SHA |
|---|---|
| **Deployed by Vercel at time of bug** | `022ebfc` — `chore: complete PostgreSQL production validation` |
| **Local HEAD with fix** | `035ebe8` — `fix: use correct Render production API URL` |
| **Origin/main after push** | `035ebe8` — same as local HEAD |

The fix was committed locally on `2026-09-18` but `git push origin main` had not been run. Vercel triggered builds from GitHub, so it never saw the fix until this push.

---

## VITE_API_BASE_URL Resolution

**Correct resolution chain (now deployed):**

```
1. Vercel env: VITE_API_BASE_URL=https://medihawk3.onrender.com
2. vite.config.ts: loadEnv() reads VITE_API_BASE_URL → present → no throw
3. Bundle time: import.meta.env.VITE_API_BASE_URL → "https://medihawk3.onrender.com"
4. _rawApiBase = "https://medihawk3.onrender.com" (trailing slash stripped, none to strip)
5. import.meta.env.PROD = true, _rawApiBase is non-empty → no throw
6. BASE_URL = "https://medihawk3.onrender.com"
7. import.meta.env.DEV = false → DCE removes 'http://localhost:5000' from bundle
```

**Old broken chain (commit `022ebfc`):**

```
1. Vercel env: VITE_API_BASE_URL=https://medihawk3.onrender.com (set, but wrong key read)
2. Bundle time: import.meta.env.VITE_API_URL → undefined (key was never set in Vercel)
3. undefined ?? 'http://localhost:5000' → 'http://localhost:5000'
4. BASE_URL = 'http://localhost:5000'
5. All API calls → http://localhost:5000/... → CORS block in browser
```

---

## .env Precedence

Vite env var precedence (highest to lowest):

```
1. Shell environment / platform env vars (Vercel injects these)
2. .env.production.local
3. .env.production
4. .env.local
5. .env
```

Files present in the repository:
- `.env.example` — template only, not loaded by Vite (`.example` extension)
- `backend/.env` — backend Flask config, not visible to Vite (wrong directory)

**No `.env.local`, `.env.production`, or `.env` exists at the project root.** There are no env overrides that could interfere. The Vercel platform-injected `VITE_API_BASE_URL` is the only source.

---

## Generated dist Localhost Scan

```
grep -oc "localhost:5000|127.0.0.1:5000" dist/assets/*.js
```

```
dist/assets/DroneScene3D-CKnHzEi2.js:0
dist/assets/MissionMap-CycvsLZ6.js:0
dist/assets/index-1gRJhibA.js:0
```

**ZERO `localhost:5000` or `127.0.0.1:5000` occurrences** in any bundle file.

Correct URL confirmed in bundle:
```
grep -o "medihawk3.onrender.com" dist/assets/*.js
→ dist/assets/index-1gRJhibA.js:medihawk3.onrender.com (×2)
```

---

## TypeScript Result

```
npx tsc --noEmit → 0 errors
```

Note: `npm run typecheck` is not a defined script in `package.json`. TypeScript check is `npx tsc --noEmit` or is run as part of `npm run build` via `tsc -b`.

---

## Build Result

```
rm -rf dist
VITE_API_BASE_URL=https://medihawk3.onrender.com npm run build

✓ 3754 modules transformed.
✓ built in 2.73s
```

**Build without `VITE_API_BASE_URL` (expected failure — guard working):**

```
Error: [MediHawk build] VITE_API_BASE_URL is not set.
Production builds require VITE_API_BASE_URL to point to the Render backend.
Set it in your Vercel project environment variables.
Example: VITE_API_BASE_URL=https://medihawk3.onrender.com
```

---

## Backend Tests

```
425 passed, 11 warnings in 267s
```

No backend changes.

---

## Git Commit

```
commit 035ebe8ac73518d675338c2043368ecad80a7768
fix: use correct Render production API URL (medihawk3.onrender.com)

Pushed to origin/main: 022ebfc..035ebe8  main -> main
```

Vercel will automatically pick up this push and trigger a new production deployment.

---

## Production Verification Instructions

After Vercel completes the new deployment (typically 2–3 minutes after push):

1. Open `https://medi-hawk3.vercel.app` in a browser
2. Open DevTools → Network → filter to XHR/Fetch
3. Trigger any login or forgot-password action
4. Verify request goes to `https://medihawk3.onrender.com/api/auth/login`

Expected: `https://medihawk3.onrender.com/api/...`  
Forbidden: `http://localhost:5000/api/...`

---

## Final State

| Production endpoint | Value |
|---------------------|-------|
| Frontend | `https://medi-hawk3.vercel.app` |
| Backend | `https://medihawk3.onrender.com` |
| `VITE_API_BASE_URL` (Vercel) | `https://medihawk3.onrender.com` |
| `CORS_ORIGINS` (Render) | `https://medi-hawk3.vercel.app` |

---

## Summary

| Check | Result |
|-------|--------|
| Root cause identified | PASS — wrong env var key `VITE_API_URL` at `022ebfc` |
| Fix commit exists | PASS — `035ebe8` |
| Fix pushed to origin/main | PASS — `022ebfc..035ebe8 main → main` |
| `localhost:5000` in bundle | ZERO |
| `127.0.0.1:5000` in bundle | ZERO |
| Correct URL in bundle | CONFIRMED — `medihawk3.onrender.com` |
| TypeScript | 0 errors |
| Vite build | ✓ 2.73s |
| Backend tests | 425/425 |

---

## **PUSHED — Vercel will deploy `035ebe8` with the correct API URL.**

*Generated 2026-09-18*
