# MediHawk — Step 3: Production URL Correction Report

**Date:** 2026-09-18  
**Branch:** main  
**Issue:** Old/incorrect Render service URL `medihawk-api.onrender.com` used in production configuration.

---

## 1. Old URL Found

```
https://medihawk-api.onrender.com   ← WRONG (does not exist)
```

Found in:
- `.env.example:13` — default `VITE_API_BASE_URL` value
- `.github/workflows/deploy.yml:17` — comment documentation
- `.github/workflows/deploy.yml:102` — GitHub Actions environment URL
- `src/services/api/index.ts:16` — error message example
- `vite.config.ts:14` — build error example
- `.claude/settings.json:176` — pre-approved developer build command
- `MEDIHAWK_STEP_3_VERCEL_API_CONFIGURATION_REPORT.md` — previous report (historical, not live config)

---

## 2. Correct URL

```
https://medihawk3.onrender.com      ← CORRECT (deployed Render Web Service)
```

---

## 3. Files Changed

| File | Change |
|------|--------|
| `.env.example` | `VITE_API_BASE_URL` default value: `medihawk-api.onrender.com` → `medihawk3.onrender.com` |
| `.github/workflows/deploy.yml` | Comment example + `environment.url`: old → correct Render URL |
| `src/services/api/index.ts` | Error message example URL corrected |
| `vite.config.ts` | Build error example URL corrected |
| `.claude/settings.json` | Pre-approved build command URL corrected |

**Not changed (correct as-is):**
- `docker-compose.yml` — `http://localhost:5000/api/health` is the Docker internal health check (correct for local containers)
- `.claude/settings.json` — all `curl http://127.0.0.1:5000/...` commands (local dev tooling, not production)
- `.claude/settings.local.json` — same, local dev tooling
- `backend/README.md`, `README.md` — docs describing local dev at `localhost:5000`
- Historical reports — `MEDIHAWK_PHASE_0_BACKEND_CONTRACT.md`, etc. (archived documentation)

---

## 4. Frontend API Configuration

**`src/services/api/index.ts` — current state:**

```typescript
const _rawApiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

if (import.meta.env.PROD && !_rawApiBase) {
  throw new Error(
    '[MediHawk] VITE_API_BASE_URL is not set. ' +
    'All production API requests will fail. ' +
    'Set VITE_API_BASE_URL in your Vercel project environment variables ' +
    'to your Render backend URL (e.g. https://medihawk3.onrender.com).'
  )
}

const BASE_URL = _rawApiBase || (import.meta.env.DEV ? 'http://localhost:5000' : '')
```

All 13 API service namespaces (auth, orders, inventory, locations, admin, OTP, forgot-password, signup, fleet, missions, alerts, telemetry, analytics) route through `request()` → `BASE_URL`. No service independently constructs a URL.

---

## 5. WebSocket Configuration

`src/services/websocket/index.ts` — demo mode stub. `initWebSocket()` takes `url` as a parameter and is **not called** in the current codebase. No hardcoded localhost WebSocket URL. When real Socket.IO is wired up, it must be called with `BASE_URL` from `api/index.ts`, which will produce `wss://medihawk3.onrender.com/...` automatically (Socket.IO upgrades to WSS when the origin is HTTPS).

---

## 6. Vercel Configuration

**Required in Vercel project → Settings → Environment Variables:**

| Variable | Value |
|----------|-------|
| `VITE_API_BASE_URL` | `https://medihawk3.onrender.com` |

No secrets in `VITE_*` variables. `VITE_API_BASE_URL` is a public URL — visible in the production bundle.

`.env.example` at repo root now documents this correctly:
```
VITE_API_BASE_URL=https://medihawk3.onrender.com
```

---

## 7. Localhost Scan (production bundle)

```
grep -RniE 'medihawk-api\.onrender\.com|localhost:5000|127\.0\.0\.1:5000' dist/
```

**Result: zero matches** ✓

The `import.meta.env.DEV ? 'http://localhost:5000' : ''` pattern causes Vite's dead-code elimination to strip the localhost string from production builds (since `import.meta.env.DEV` compiles to `false` and the dead branch is tree-shaken).

---

## 8. Old Render URL Scan (production bundle)

```
grep -o 'medihawk-api\.onrender\.com' dist/assets/*.js
```

**Result: zero matches** ✓

---

## 9. Production Build Result

```
rm -rf dist
VITE_API_BASE_URL=https://medihawk3.onrender.com npm run build
```

Output:
```
✓ 3754 modules transformed.
✓ built in 2.56s
```

Correct URL verified in bundle:
```
grep 'medihawk3.onrender.com' dist/assets/*.js → 1 match (index bundle)
```

**Build without `VITE_API_BASE_URL` (expected failure):**
```
Error: [MediHawk build] VITE_API_BASE_URL is not set.
Production builds require VITE_API_BASE_URL to point to the Render backend.
Set it in your Vercel project environment variables.
Example: VITE_API_BASE_URL=https://medihawk3.onrender.com
```

---

## 10. TypeScript Result

```
npx tsc --noEmit → 0 errors
```

---

## 11. Backend Test Result

```
425 passed, 11 warnings in 267.05s
```

No backend changes in this step.

---

## 12. CORS Configuration

**Backend `CORS_ORIGINS`** must be set to the Vercel frontend origin:

```
CORS_ORIGINS=https://medi-hawk3.vercel.app
```

CORS allows the **browser origin** (Vercel), not the API's own hostname. Do NOT set it to the Render backend URL. This value is set in the Render dashboard as an environment variable (not in `render.yaml` which uses `sync: false`).

---

## 13. Final Deployment Instructions

**Required values — set these before deploying:**

| Where | Key | Value |
|-------|-----|-------|
| Vercel → Environment Variables | `VITE_API_BASE_URL` | `https://medihawk3.onrender.com` |
| Render → Environment Variables | `CORS_ORIGINS` | `https://medi-hawk3.vercel.app` |
| Render → Environment Variables | `SECRET_KEY` | (generate 32+ char random string) |
| Render → Environment Variables | `JWT_SECRET_KEY` | (generate 32+ char random string) |
| Render → Environment Variables | `OTP_HMAC_SECRET` | (generate 32+ char random string) |
| Render → Environment Variables | `ADMIN_INVITE_CODE` | (your chosen invite code) |
| GitHub → Secrets | `VITE_API_BASE_URL` | `https://medihawk3.onrender.com` |
| GitHub → Secrets | `RENDER_DEPLOY_HOOK_URL` | (from Render dashboard → Service → Deploy Hook) |
| GitHub → Secrets | `VERCEL_TOKEN` | (from vercel.com/account/tokens) |
| GitHub → Secrets | `VERCEL_ORG_ID` | (from Vercel account settings) |
| GitHub → Secrets | `VERCEL_PROJECT_ID` | (from Vercel project settings) |

**Deploy sequence:**
```bash
git push origin main
# → GitHub Actions runs: test-backend (425 tests against PG16) + build-frontend (vite build)
# → On success: triggers Render deploy hook (backend) + Vercel CLI --prod (frontend)
```

**Deployed endpoints:**
- Frontend: `https://medi-hawk3.vercel.app`
- Backend:  `https://medihawk3.onrender.com`

---

## Final Verification Gate

| Check | Result |
|-------|--------|
| Old URL `medihawk-api.onrender.com` in production config | ZERO occurrences |
| Old URL in production bundle | ZERO occurrences |
| Correct URL `medihawk3.onrender.com` in bundle | CONFIRMED |
| `localhost:5000` in production bundle | ZERO occurrences |
| `127.0.0.1:5000` in production bundle | ZERO occurrences |
| TypeScript | 0 errors |
| Vite production build | ✓ built in 2.56s |
| Backend tests | 425/425 passed |
| CORS set to Vercel URL | Instruction documented (Render dashboard) |

---

## **PASS — Production URL corrected to `https://medihawk3.onrender.com` everywhere.**

*Generated 2026-09-18*
