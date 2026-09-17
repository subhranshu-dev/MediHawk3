// ─── API Service Layer ─────────────────────────────────────────────────────────
// Connected to Flask backend at BASE_URL.
// Set VITE_API_BASE_URL in your environment to point at the Render backend.
//   Production (Vercel): set in Vercel project → Settings → Environment Variables
//   Development: set in .env.local at the project root (or leave unset for localhost fallback)

const _rawApiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

// Production builds MUST have VITE_API_BASE_URL — fail fast rather than silently
// routing all requests to localhost (which is unreachable from production browsers).
if (import.meta.env.PROD && !_rawApiBase) {
  throw new Error(
    '[MediHawk] VITE_API_BASE_URL is not set. ' +
    'All production API requests will fail. ' +
    'Set VITE_API_BASE_URL in your Vercel project environment variables ' +
    'to your Render backend URL (e.g. https://medihawk3.onrender.com).'
  )
}

// DEV guard ensures Vite's dead-code elimination strips the localhost string
// from production bundles — import.meta.env.DEV is replaced by `false` at build time.
const BASE_URL = _rawApiBase || (import.meta.env.DEV ? 'http://localhost:5000' : '')

// ─── Token helpers ────────────────────────────────────────────────────────────
const TOKEN_KEY = 'mh_jwt'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// ─── Core request ─────────────────────────────────────────────────────────────
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> ?? {}),
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const code = (body as { error?: { code?: string } }).error?.code ?? `HTTP_${res.status}`
    const msg  = (body as { error?: { message?: string } }).error?.message ?? res.statusText
    throw Object.assign(new Error(msg), { code, status: res.status })
  }
  return res.json()
}

// ─── Backend response → frontend Order adapter ────────────────────────────────
import type { Order, OrderPriority, OrderStatus } from '@/types'

export function adaptBackendOrder(raw: Record<string, unknown>): Order {
  const items = (raw.items as Array<Record<string, unknown>>) ?? []
  const first = items[0] ?? {}
  const medicine =
    items.length === 0 ? 'Unknown' :
    items.length === 1 ? String(first.name ?? '') :
    `${first.name ?? ''} (+${items.length - 1} more)`
  const quantity = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0)
  const dest = (raw.destination as Record<string, unknown>) ?? {}

  return {
    id: String(raw.id ?? ''),
    doctor_id: String(raw.doctor_id ?? ''),
    doctor_name: String(raw.doctor_name ?? raw.doctor_id ?? ''),
    from_location: String(raw.from_location ?? 'hub-01'),
    from_location_name: String(raw.from_location_name ?? 'MediHawk Central Hub'),
    destination_location: String(dest.facility_id ?? raw.destination_location ?? ''),
    destination_name: String(dest.name ?? raw.destination_name ?? ''),
    medicine,
    quantity,
    unit: String(first.unit ?? 'units'),
    priority: String(raw.priority ?? 'normal') as OrderPriority,
    status: String(raw.status ?? 'pending') as OrderStatus,
    drone_id: raw.drone_id ? String(raw.drone_id) : undefined,
    inspection_done: Boolean(raw.inspection_done ?? false),
    qr_verified: Boolean(raw.qr_verified ?? false),
    temperature: Number(raw.temperature ?? 0),
    ordered_at: String(raw.ordered_at ?? new Date().toISOString()),
    launched_at: raw.launched_at ? String(raw.launched_at) : undefined,
    delivered_at: raw.delivered_at ? String(raw.delivered_at) : undefined,
    delivery_time_minutes: raw.delivery_time_minutes ? Number(raw.delivery_time_minutes) : undefined,
    notes: raw.notes ? String(raw.notes) : undefined,
    otp: raw.otp ? String(raw.otp) : undefined,
    receiver_verified: raw.receiver_verified ? Boolean(raw.receiver_verified) : undefined,
    items: raw.items as Order['items'],
  }
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
interface LoginPayload {
  email?: string
  phone?: string
  password: string
  role: string
}

interface LoginResponse {
  success: boolean
  token: string
  user: { id: string; name: string; email: string; role: string; phone?: string; phc?: string }
}

interface OtpRequestResponse {
  success: boolean
  message: string
}

interface OtpVerifyResponse {
  success: boolean
  token: string
  user: { id: string; name: string; email: string; role: string; phc?: string }
}

export const authService = {
  login: (payload: LoginPayload): Promise<LoginResponse> =>
    request<LoginResponse>('/api/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => { clearToken() },

  verifyToken: () =>
    request<{ valid: boolean }>('/api/verify-token'),

  requestOtp: (email: string, role: 'doctor' | 'admin'): Promise<OtpRequestResponse> =>
    request<OtpRequestResponse>('/api/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),

  verifyOtp: (email: string, otp: string, role: 'doctor' | 'admin'): Promise<OtpVerifyResponse> =>
    request<OtpVerifyResponse>('/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, otp, role }),
    }),

  requestAdminOtp: (email: string): Promise<OtpRequestResponse> =>
    request<OtpRequestResponse>('/api/auth/admin/otp/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyAdminOtp: (email: string, otp: string): Promise<{ success: boolean; message: string; reset_token: string }> =>
    request('/api/auth/admin/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    }),

  doctorSignup: (data: { name: string; email: string; phone: string; password: string; phc_id?: string }): Promise<{ success: boolean; message: string; user_id: string }> =>
    request('/api/auth/doctor/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  adminSignup: (data: { name: string; email: string; password: string; invite_code: string }): Promise<{ success: boolean; message: string; user_id: string }> =>
    request('/api/auth/admin/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  verifyEmail: (email: string, otp: string, role: 'doctor' | 'admin'): Promise<{ success: boolean; message: string }> =>
    request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, otp, role }),
    }),

  forgotPasswordRequest: (contact: string): Promise<{ success: boolean; message: string }> =>
    request('/api/auth/forgot-password/request', {
      method: 'POST',
      body: JSON.stringify({ contact }),
    }),

  forgotPasswordVerify: (contact: string, otp: string): Promise<{ success: boolean; message: string; reset_token: string }> =>
    request('/api/auth/forgot-password/verify', {
      method: 'POST',
      body: JSON.stringify({ contact, otp }),
    }),

  resetPassword: (reset_token: string, new_password: string): Promise<{ success: boolean; message: string }> =>
    request('/api/auth/password-reset', {
      method: 'POST',
      body: JSON.stringify({ reset_token, new_password }),
    }),

  adminResetPassword: (reset_token: string, new_password: string): Promise<{ success: boolean; message: string }> =>
    request('/api/auth/admin/password-reset', {
      method: 'POST',
      body: JSON.stringify({ reset_token, new_password }),
    }),
}

// ─── Orders ────────────────────────────────────────────────────────────────────
export const orderService = {
  create: (data: {
    items: Array<{ medicine_id: string; quantity: number }>
    priority: string
    latitude: number
    longitude: number
    patient_age?: number
    location_error?: string
  }): Promise<{ success: boolean; order: Record<string, unknown> }> =>
    request('/api/order', { method: 'POST', body: JSON.stringify(data) }),

  list: (params?: string): Promise<Order[]> =>
    request<{ success: boolean; orders: Array<Record<string, unknown>> }>(
      `/api/orders${params ? `?${params}` : ''}`
    ).then(r => r.orders.map(adaptBackendOrder)),

  listPending: (): Promise<Order[]> =>
    request<{ success: boolean; orders: Array<Record<string, unknown>> }>('/api/orders/pending')
      .then(r => r.orders.map(adaptBackendOrder)),

  get: (id: string): Promise<Order | null> =>
    request<{ success: boolean; order: Record<string, unknown> }>(`/api/order/${id}`)
      .then(r => adaptBackendOrder(r.order))
      .catch(() => null),

  confirm: (id: string): Promise<{ success: boolean; order: Record<string, unknown> }> =>
    request(`/api/confirm/${id}`, { method: 'POST' }),

  cancel: (id: string): Promise<{ success: boolean; order: Record<string, unknown> }> =>
    request(`/api/cancel/${id}`, { method: 'POST' }),
}

// ─── Inventory ─────────────────────────────────────────────────────────────────
export interface BackendInventoryItem {
  id: string
  medicine: string
  quantity: number
  unit: string
  temperature_required: string
  expiry_date: string
  status: string
  category: string
  min_threshold: number
  is_active: boolean
}

export const inventoryService = {
  list: (): Promise<BackendInventoryItem[]> =>
    request<{ success: boolean; inventory: BackendInventoryItem[] }>('/api/inventory')
      .then(r => r.inventory),

  get: (id: string): Promise<BackendInventoryItem | null> =>
    request<{ success: boolean; item: BackendInventoryItem }>(`/api/inventory/${id}`)
      .then(r => r.item)
      .catch(() => null),

  update: (id: string, data: Partial<BackendInventoryItem>): Promise<BackendInventoryItem> =>
    request<{ success: boolean; item: BackendInventoryItem }>(
      `/api/inventory/${id}`, { method: 'PATCH', body: JSON.stringify(data) }
    ).then(r => r.item),
}

// ─── Location ──────────────────────────────────────────────────────────────────
interface LocationResolvePayload {
  latitude?: number | null
  longitude?: number | null
  location_error?: string
}

interface LocationResolveResponse {
  success: boolean
  location: { latitude: number; longitude: number }
  nearest_facility: {
    id: string
    name: string
    type: string
    latitude: number
    longitude: number
    distance_km: number
  }
}

export const locationService = {
  resolve: (payload: LocationResolvePayload): Promise<LocationResolveResponse> =>
    request('/api/location/resolve', { method: 'POST', body: JSON.stringify(payload) }),
}

// ─── Drone (simulation only in Phase 1C) ───────────────────────────────────────
export const droneService = {
  status: (): Promise<null> => Promise.resolve(null),
  telemetry: (): Promise<null> => Promise.resolve(null),
  emergencyRTL: (): Promise<void> => Promise.resolve(),
  hold: (): Promise<void> => Promise.resolve(),
  resume: (): Promise<void> => Promise.resolve(),
}

// ─── Temperature (simulation only) ────────────────────────────────────────────
export const temperatureService = {
  current: (): Promise<null> => Promise.resolve(null),
  log: (_orderId: string): Promise<[]> => Promise.resolve([]),
}

// ─── Weather (simulation only) ────────────────────────────────────────────────
export const weatherService = {
  check: (): Promise<{ safe: boolean; wind_speed: number }> =>
    Promise.resolve({ safe: true, wind_speed: 12 }),
}

// ─── SMS (not in Phase 1C) ────────────────────────────────────────────────────
export const smsService = {
  send: (_phone: string, _message: string): Promise<void> => Promise.resolve(),
}

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminService = {
  commandCenter: () => request('/api/admin/command-center'),
  dashboard: () => request('/api/admin/dashboard'),
  orders: (page = 1) => request(`/api/admin/orders?page=${page}&per_page=20`),
  missions: () => request('/api/admin/missions'),
  activeMission: () => request('/api/admin/missions/active'),
  mission: (id: string) => request(`/api/admin/missions/${id}`),
  fleet: () => request('/api/admin/fleet'),
  alerts: (acknowledgedFilter?: boolean) => request(`/api/admin/alerts${acknowledgedFilter === false ? '?acknowledged=false' : ''}`),
  acknowledgeAlert: (id: string) => request(`/api/admin/alerts/${id}/acknowledge`, { method: 'POST' }),
  resolveAlert: (id: string) => request(`/api/admin/alerts/${id}/resolve`, { method: 'POST' }),
  telemetry: (droneId: string) => request(`/api/admin/telemetry/${droneId}`),
  readiness: (droneId: string) => request(`/api/admin/readiness/${droneId}`),
  droneRTL: (droneId: string) => request(`/api/admin/drone/${droneId}/rtl`, { method: 'POST' }),
  droneHold: (droneId: string) => request(`/api/admin/drone/${droneId}/hold`, { method: 'POST' }),
  droneResume: (droneId: string) => request(`/api/admin/drone/${droneId}/resume`, { method: 'POST' }),
  priorityQueue: () => request('/api/admin/priority-queue'),
  analytics: () => request('/api/admin/analytics'),
  locations: () => request('/api/admin/locations'),
}
