// ─── API Service Layer ────────────────────────────────────────────────────────
// These services are prepared for the Flask backend.
// Currently using mock data. Replace BASE_URL and enable real calls to connect.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'
const IS_DEMO = true // toggle when backend is live

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
  return res.json()
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authService = {
  login: (email: string, password: string) =>
    IS_DEMO
      ? Promise.resolve({ token: 'demo-token', user: { email } })
      : request('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  logout: () =>
    IS_DEMO
      ? Promise.resolve()
      : request('/api/logout', { method: 'POST' }),

  verifyToken: () =>
    IS_DEMO
      ? Promise.resolve({ valid: true })
      : request('/api/verify-token'),
}

// ─── Orders ───────────────────────────────────────────────────────────────────
export const orderService = {
  create: (data: unknown) =>
    IS_DEMO
      ? Promise.resolve({ id: `MH-2026-${Date.now()}` })
      : request('/api/order', { method: 'POST', body: JSON.stringify(data) }),

  list: () =>
    IS_DEMO ? Promise.resolve([]) : request('/api/orders'),

  listPending: () =>
    IS_DEMO ? Promise.resolve([]) : request('/api/orders/pending'),

  get: (id: string) =>
    IS_DEMO ? Promise.resolve(null) : request(`/api/order/${id}`),

  confirm: (id: string) =>
    IS_DEMO ? Promise.resolve() : request(`/api/confirm/${id}`, { method: 'POST' }),

  received: (id: string) =>
    IS_DEMO ? Promise.resolve() : request(`/api/received/${id}`, { method: 'POST' }),

  cancel: (id: string) =>
    IS_DEMO ? Promise.resolve() : request(`/api/cancel/${id}`, { method: 'POST' }),
}

// ─── Drone ────────────────────────────────────────────────────────────────────
export const droneService = {
  status: () =>
    IS_DEMO ? Promise.resolve(null) : request('/api/drone/status'),

  telemetry: () =>
    IS_DEMO ? Promise.resolve(null) : request('/api/drone/telemetry'),

  emergencyRTL: () =>
    IS_DEMO ? Promise.resolve() : request('/api/drone/emergency-rtl', { method: 'POST' }),

  hold: () =>
    IS_DEMO ? Promise.resolve() : request('/api/drone/hold', { method: 'POST' }),

  resume: () =>
    IS_DEMO ? Promise.resolve() : request('/api/drone/resume', { method: 'POST' }),
}

// ─── Inventory ────────────────────────────────────────────────────────────────
export const inventoryService = {
  list: () =>
    IS_DEMO ? Promise.resolve([]) : request('/api/inventory'),

  check: (medicine: string) =>
    IS_DEMO ? Promise.resolve({ available: true }) : request(`/api/inventory/check/${medicine}`),

  update: (data: unknown) =>
    IS_DEMO ? Promise.resolve() : request('/api/inventory/update', { method: 'POST', body: JSON.stringify(data) }),

  lowStock: () =>
    IS_DEMO ? Promise.resolve([]) : request('/api/inventory/low-stock'),
}

// ─── Location ─────────────────────────────────────────────────────────────────
export const locationService = {
  list: () =>
    IS_DEMO ? Promise.resolve([]) : request('/api/locations'),

  get: (id: string) =>
    IS_DEMO ? Promise.resolve(null) : request(`/api/location/${id}`),

  add: (data: unknown) =>
    IS_DEMO ? Promise.resolve() : request('/api/locations/add', { method: 'POST', body: JSON.stringify(data) }),
}

// ─── Temperature ─────────────────────────────────────────────────────────────
export const temperatureService = {
  current: () =>
    IS_DEMO ? Promise.resolve(null) : request('/api/temperature/current'),

  log: (orderId: string) =>
    IS_DEMO ? Promise.resolve([]) : request(`/api/temperature/log/${orderId}`),
}

// ─── Weather ─────────────────────────────────────────────────────────────────
export const weatherService = {
  check: () =>
    IS_DEMO ? Promise.resolve({ safe: true, wind_speed: 12 }) : request('/api/weather/check'),
}

// ─── SMS ─────────────────────────────────────────────────────────────────────
export const smsService = {
  send: (phone: string, message: string) =>
    IS_DEMO
      ? Promise.resolve()
      : request('/api/send-sms', { method: 'POST', body: JSON.stringify({ phone, message }) }),
}
