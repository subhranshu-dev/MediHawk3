// ─── Auth ────────────────────────────────────────────────────────────────────
export type UserRole = 'doctor' | 'admin'

export interface User {
  id: string
  name: string
  role: UserRole
  phc?: string
  email: string
  phone?: string
}

// ─── Location ────────────────────────────────────────────────────────────────
export type LocationType = 'hub' | 'phc' | 'chc'

export interface Location {
  id: string
  name: string
  type: LocationType
  district: string
  lat: number
  lng: number
  contact: string
  doctor?: string
  address: string
}

// ─── Inventory ────────────────────────────────────────────────────────────────
export type InventoryStatus = 'in_stock' | 'low_stock' | 'critical' | 'expiring'

export interface InventoryItem {
  id: string
  medicine: string
  quantity: number
  unit: string
  temperature_required: string
  expiry_date: string
  status: InventoryStatus
  category: string
  min_threshold: number
}

// ─── Order ────────────────────────────────────────────────────────────────────
export type OrderPriority = 'emergency' | 'urgent' | 'normal'
export type OrderStatus =
  | 'pending'
  | 'approved'
  | 'preparing'
  | 'launched'
  | 'in_flight'
  | 'landing'
  | 'delivered'
  | 'verified'
  | 'cancelled'

export interface Order {
  id: string
  doctor_id: string
  doctor_name: string
  from_location: string
  from_location_name: string
  destination_location: string
  destination_name: string
  medicine: string
  quantity: number
  unit: string
  priority: OrderPriority
  status: OrderStatus
  drone_id?: string
  inspection_done: boolean
  qr_verified: boolean
  temperature: number
  ordered_at: string
  launched_at?: string
  delivered_at?: string
  delivery_time_minutes?: number
  notes?: string
  otp?: string
  receiver_verified?: boolean
}

// ─── Drone ────────────────────────────────────────────────────────────────────
export type DroneStatus =
  | 'available'
  | 'preparing'
  | 'in_flight'
  | 'returning'
  | 'maintenance'
  | 'offline'

export interface DroneHealth {
  motors: 'ok' | 'warning' | 'critical'
  sensors: 'ok' | 'warning' | 'critical'
  propellers: 'ok' | 'warning' | 'critical'
  payload_lock: 'ok' | 'warning' | 'critical'
}

export interface Drone {
  id: string
  name: string
  status: DroneStatus
  lat: number
  lng: number
  altitude: number
  speed: number
  battery: number
  temperature: number
  gps_accuracy: number
  connection: 'stable' | 'degraded' | 'lost'
  link_type: '4G' | 'ZeroTier' | 'both'
  mission_id?: string
  health: DroneHealth
  last_updated: string
  total_missions: number
  flight_hours: number
}

// ─── Telemetry ────────────────────────────────────────────────────────────────
export interface TelemetryPoint {
  timestamp: string
  altitude: number
  speed: number
  battery: number
  temperature: number
  lat: number
  lng: number
}

// ─── Mission ──────────────────────────────────────────────────────────────────
export type MissionStatus =
  | 'pending_approval'
  | 'approved'
  | 'preparing'
  | 'in_flight'
  | 'landing'
  | 'delivered'
  | 'returning'
  | 'completed'
  | 'aborted'

export interface MissionWaypoint {
  index: number
  lat: number
  lng: number
  altitude: number
  label: string
  reached: boolean
  reached_at?: string
}

export interface MissionEvent {
  timestamp: string
  event: string
  type: 'info' | 'warning' | 'critical' | 'success'
}

export interface Mission {
  id: string
  order_id: string
  drone_id: string
  from_location: string
  from_lat: number
  from_lng: number
  to_location: string
  to_lat: number
  to_lng: number
  distance_km: number
  eta_minutes: number
  elapsed_minutes: number
  status: MissionStatus
  waypoints: MissionWaypoint[]
  events: MissionEvent[]
  medicine: string
  quantity: number
  priority: OrderPriority
  launched_at?: string
}

// ─── Temperature Log ──────────────────────────────────────────────────────────
export interface TemperatureLog {
  timestamp: string
  temperature: number
  event?: string
}

// ─── Alert ────────────────────────────────────────────────────────────────────
export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertCategory =
  | 'temperature'
  | 'connection'
  | 'battery'
  | 'weather'
  | 'mission'
  | 'inventory'
  | 'system'

export interface Alert {
  id: string
  severity: AlertSeverity
  category: AlertCategory
  title: string
  description: string
  recommended_action: string
  mission_id?: string
  drone_id?: string
  timestamp: string
  acknowledged: boolean
}

// ─── Inspection ───────────────────────────────────────────────────────────────
export type CheckStatus = 'pass' | 'warning' | 'blocked' | 'pending'

export interface InspectionCheck {
  id: string
  label: string
  status: CheckStatus
  detail?: string
  mandatory: boolean
}

// ─── System Status ────────────────────────────────────────────────────────────
export interface SystemStatus {
  backend: 'connected' | 'disconnected' | 'reconnecting'
  websocket: 'connected' | 'disconnected' | 'reconnecting'
  fourG: 'connected' | 'degraded' | 'disconnected'
  zerotier: 'connected' | 'disconnected'
  drone: 'online' | 'offline'
  gps: 'locked' | 'searching' | 'unavailable'
  temperature: 'safe' | 'warning' | 'critical'
  last_sync: string
}

// ─── Analytics ────────────────────────────────────────────────────────────────
export interface DailyMetric {
  date: string
  deliveries: number
  avg_time: number
  success_rate: number
}
