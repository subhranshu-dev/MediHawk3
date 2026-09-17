# MediHawk — Step 3: Vercel API Configuration Report

**Date:** 2026-09-18  
**Branch:** main  
**Symptom:** Deployed Vercel frontend making API requests to `http://localhost:5000`, blocked by CORS.

---

## Root Cause

**File:** `src/services/api/index.ts` — line 4  
**Before:**
```typescript
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'
```

Two defects in one line:

| Defect | Impact |
|--------|--------|
| Wrong env var name: `VITE_API_URL` instead of `VITE_API_BASE_URL` | Env var read in Vercel was never picked up — the `VITE_API_URL` key did not match, so `??` always fell through |
| Unsafe production fallback: `'http://localhost:5000'` | When the env var was absent (wrong key), all production API requests were silently routed to localhost — unreachable from a Vercel browser context → CORS error |

---

## Architecture Audit

### API URL construction — single source of truth

Every API call in the frontend flows through one function:

```
src/services/api/index.ts
└── BASE_URL (line 4)
└── request<T>(path, options) (line 22)
    └── fetch(`${BASE_URL}${path}`, ...)
        └── authService.*
        └── orderService.*
        └── inventoryService.*
        └── locationService.*
        └── adminService.*
        └── droneService.* (simulation stubs — no real HTTP calls)
        └── temperatureService.* (simulation stubs)
        └── weatherService.* (simulation stubs)
        └── smsService.* (simulation stubs)
```

**No service independently constructs API URLs.** All 13 service namespaces call `request()`. The fix in one place covers every endpoint:
- auth / login / OTP / forgot-password / signup / email-verify
- orders (create, list, get, confirm, cancel)
- inventory (list, get, update)
- locations (resolve)
- admin (command-center, dashboard, orders, missions, fleet, alerts, telemetry, readiness, drone-commands, analytics, locations)

### WebSocket

`src/services/websocket/index.ts` — `initWebSocket(url: string)` is a demo-mode stub. It:
- Takes `url` as a parameter (never constructs one internally)
- Is **never called** from App.tsx or any hook
- Logs `Demo mode — would connect to ${url}` and returns a mock socket

No WebSocket URL fix required. When real Socket.IO is wired up, the caller must pass `BASE_URL` from `api/index.ts`.

---

## Files Changed

| File | Change |
|------|--------|
| `src/services/api/index.ts` | Fix env var name, add production guard, add trailing-slash normalization, use `import.meta.env.DEV` guard to enable Vite DCE |
| `vite.config.ts` | Convert to factory function, add build-time `loadEnv` validation that throws when `mode === 'production'` and `VITE_API_BASE_URL` is absent |
| `.env.example` | New file — documents `VITE_API_BASE_URL` for frontend; distinguishes production (Vercel env var) from local dev (`.env.local` fallback) |
| `.github/workflows/deploy.yml` | Add `VITE_API_BASE_URL: ${{ secrets.VITE_API_BASE_URL }}` to the `build-frontend` CI step; add secret to required-secrets documentation |

---

## Final API Service Code

```typescript
// src/services/api/index.ts — lines 1-22

const _rawApiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

// Production builds MUST have VITE_API_BASE_URL — fail fast rather than silently
// routing all requests to localhost (which is unreachable from production browsers).
if (import.meta.env.PROD && !_rawApiBase) {
  throw new Error(
    '[MediHawk] VITE_API_BASE_URL is not set. ' +
    'All production API requests will fail. ' +
    'Set VITE_API_BASE_URL in your Vercel project environment variables ' +
    'to your Render backend URL (e.g. https://medihawk-api.onrender.com).'
  )
}

// DEV guard ensures Vite's dead-code elimination strips the localhost string
// from production bundles — import.meta.env.DEV is replaced by `false` at build time.
const BASE_URL = _rawApiBase || (import.meta.env.DEV ? 'http://localhost:5000' : '')
```

---

## Local Development Behavior

| Scenario | `VITE_API_BASE_URL` set? | Result |
|----------|--------------------------|--------|
| `npm run dev` (no env file) | No | Falls back to `http://localhost:5000` ✓ |
| `npm run dev` with `.env.local` | Yes | Uses the provided URL ✓ |
| `npm run build` (no env var) | No | **Build fails with clear error** ✓ |
| `npm run build` (env var set) | Yes | Builds with Render URL baked in ✓ |

---

## Production Behavior

1. Vercel builds the frontend with `VITE_API_BASE_URL=https://medihawk-api.onrender.com` set in project environment variables.
2. `vite.config.ts` validates the env var at build time — if absent, the build fails immediately with a descriptive error.
3. `import.meta.env.VITE_API_BASE_URL` is replaced by the literal Render URL at bundle time.
4. `import.meta.env.DEV` is replaced by `false` — dead-code elimination removes the `'http://localhost:5000'` string from the bundle.
5. Every API call from the deployed frontend targets `https://medihawk-api.onrender.com`.

---

## WebSocket Behavior

WebSocket is in demo/stub mode. `initWebSocket()` is defined but not connected. When Socket.IO is wired up:
- The caller must pass `BASE_URL` from `api/index.ts` (already correctly points to Render)
- Production HTTPS → use `wss://` (Socket.IO auto-upgrades when connecting to an `https://` origin via the default transport upgrade path)
- No additional WebSocket URL changes needed at this stage

---

## Environment Variable Requirements

### Vercel (production — required)

| Variable | Value | Where to set |
|----------|-------|--------------|
| `VITE_API_BASE_URL` | `https://medihawk-api.onrender.com` | Vercel project → Settings → Environment Variables |

### Local development (optional)

Create `.env.local` in the project root (not committed):
```
VITE_API_BASE_URL=http://localhost:5000
```
Or leave unset — the service falls back to `http://localhost:5000` when `import.meta.env.DEV` is true.

### GitHub Actions CI (required for build gate)

| Secret | Value |
|--------|-------|
| `VITE_API_BASE_URL` | `https://medihawk-api.onrender.com` |

---

## URL Normalization

| Input | Output |
|-------|--------|
| `https://medihawk-api.onrender.com/` | `https://medihawk-api.onrender.com` (trailing slash stripped) |
| `https://medihawk-api.onrender.com` | `https://medihawk-api.onrender.com` (unchanged) |
| `` (empty, dev mode) | `http://localhost:5000` (dev fallback) |
| `` (empty, prod mode) | **throws** — build fails before this is reached |

The service layer appends `/api/...` paths in every call (e.g. `request('/api/login', ...)`). `BASE_URL` must NOT end with `/api`. Current service architecture is already correct — no path doubling.

---

## TypeScript Result

```
npx tsc --noEmit → 0 errors
```

---

## Vite Build Result

**Without `VITE_API_BASE_URL` (expected failure):**
```
Error: [MediHawk build] VITE_API_BASE_URL is not set.
Production builds require VITE_API_BASE_URL to point to the Render backend.
Set it in your Vercel project environment variables.
Example: VITE_API_BASE_URL=https://medihawk-api.onrender.com
```

**With `VITE_API_BASE_URL=https://medihawk-api.onrender.com`:**
```
✓ 3754 modules transformed.
✓ built in 1.73s
```

---

## Localhost Scan Result

Scan of production bundle (`dist/assets/*.js`) for `localhost:5000` and `127.0.0.1:5000`:

```
0 occurrences found
```

The `import.meta.env.DEV ? 'http://localhost:5000' : ''` pattern causes Vite to replace `import.meta.env.DEV` with `false` in production builds, enabling dead-code elimination to strip the localhost string from the bundle entirely.

Verified: `medihawk-api.onrender.com` appears in bundle — production URL correctly baked in.

---

## Backend Tests

```
425 passed, 11 warnings in 267.05s
```

No backend changes. Tests verify API layer is unchanged.

---

## Security

- `VITE_*` variables are public — embedded in the production JS bundle and visible to anyone who inspects it.
- `VITE_API_BASE_URL` is not a secret — it is a public URL (the Render service endpoint).
- No secrets (JWT keys, database passwords, OTP secrets) are in any `VITE_*` variable. This requirement is unchanged.
- `.env.example` explicitly documents: *"Never put secrets in VITE_* variables."*

---

## Final Acceptance Gate

| Requirement | Status |
|-------------|--------|
| Root cause identified | PASS — `VITE_API_URL` typo + unsafe localhost fallback |
| Single source of API URL fixed | PASS — `src/services/api/index.ts:4` |
| All 13 service namespaces covered by fix | PASS — all flow through `request()` |
| Wrong env var name corrected | PASS — `VITE_API_URL` → `VITE_API_BASE_URL` |
| Trailing slash normalized | PASS — `.replace(/\/$/, '')` |
| Production build fails without `VITE_API_BASE_URL` | PASS — `vite.config.ts` throws at config load time |
| Runtime guard if PROD + no URL | PASS — throws with clear message |
| Local dev still works without env var | PASS — `import.meta.env.DEV` fallback |
| `VITE_API_BASE_URL` documented in `.env.example` | PASS — root `.env.example` created |
| Zero `localhost:5000` in production bundle | PASS — `import.meta.env.DEV` guard enables DCE |
| Render URL baked into production bundle | PASS — `medihawk-api.onrender.com` confirmed |
| No secrets in `VITE_*` variables | PASS |
| TypeScript 0 errors | PASS |
| Vite production build passes | PASS — `✓ built in 1.73s` |
| Backend pytest unchanged | PASS — `425/425` |
| UI not modified | PASS — zero page/component changes |

---

## **PASS — API configuration fixed. Vercel frontend will target Render backend.**

*Set `VITE_API_BASE_URL=https://medihawk-api.onrender.com` in Vercel project environment variables before the next deploy.*

*Generated 2026-09-18*
