import type {
  User, Location, InventoryItem, Order, Drone,
  Mission, Alert, TelemetryPoint, TemperatureLog,
  SystemStatus, DailyMetric, MissionWaypoint, MissionEvent,
  InspectionCheck
} from '@/types'

// ─── Hub & PHC Locations ─────────────────────────────────────────────────────
export const LOCATIONS: Location[] = [
  {
    id: 'hub-01',
    name: 'MediHawk Central Hub',
    type: 'hub',
    district: 'Khordha',
    lat: 20.2961,
    lng: 85.8189,
    contact: '+91-674-2555000',
    address: 'Unit-9, Bhubaneswar, Odisha 751022',
  },
  {
    id: 'phc-chandaka',
    name: 'PHC Chandaka',
    type: 'phc',
    district: 'Khordha',
    lat: 20.3512,
    lng: 85.7612,
    contact: '+91-674-2876000',
    doctor: 'Dr. Priya Mohanty',
    address: 'Chandaka, Bhubaneswar, Odisha 754005',
  },
  {
    id: 'phc-jatani',
    name: 'PHC Jatani',
    type: 'phc',
    district: 'Khordha',
    lat: 20.1653,
    lng: 85.7078,
    contact: '+91-674-2480012',
    doctor: 'Dr. Ramesh Nayak',
    address: 'Jatani, Khordha, Odisha 752050',
  },
  {
    id: 'chc-bhubaneswar',
    name: 'CHC Balianta',
    type: 'chc',
    district: 'Khordha',
    lat: 20.3934,
    lng: 85.9024,
    contact: '+91-674-2492000',
    address: 'Balianta, Khordha, Odisha 752101',
  },
]

// ─── Mock Users ───────────────────────────────────────────────────────────────
export const MOCK_USERS: Record<string, User> = {
  doctor: {
    id: 'doc-001',
    name: 'Dr. Priya Mohanty',
    role: 'doctor',
    phc: 'phc-chandaka',
    email: 'priya.mohanty@medihawk.in',
    phone: '+91-9861234567',
  },
  admin: {
    id: 'admin-001',
    name: 'Arjun Patel',
    role: 'admin',
    email: 'arjun.patel@medihawk.in',
    phone: '+91-9876543210',
  },
}

// ─── Inventory ────────────────────────────────────────────────────────────────
export const INVENTORY: InventoryItem[] = [
  { id: 'inv-01', medicine: 'Polyvalent Antivenin', quantity: 24, unit: 'vials', temperature_required: '2–8°C', expiry_date: '2027-03-15', status: 'in_stock', category: 'Emergency Medicine', min_threshold: 10 },
  { id: 'inv-02', medicine: 'Oxytocin', quantity: 5, unit: 'ampoules', temperature_required: '2–8°C', expiry_date: '2026-11-20', status: 'low_stock', category: 'Maternal Health', min_threshold: 20 },
  { id: 'inv-03', medicine: 'Adrenaline 1:1000', quantity: 48, unit: 'ampoules', temperature_required: '15–25°C', expiry_date: '2026-12-01', status: 'in_stock', category: 'Emergency Medicine', min_threshold: 15 },
  { id: 'inv-04', medicine: 'OPV Vaccine', quantity: 3, unit: 'vials', temperature_required: '-15–-25°C', expiry_date: '2026-10-30', status: 'critical', category: 'Vaccines', min_threshold: 20 },
  { id: 'inv-05', medicine: 'O+ Blood Pack', quantity: 12, unit: 'units', temperature_required: '1–6°C', expiry_date: '2026-09-25', status: 'expiring', category: 'Blood Supply', min_threshold: 5 },
  { id: 'inv-06', medicine: 'Insulin Regular', quantity: 36, unit: 'vials', temperature_required: '2–8°C', expiry_date: '2027-02-10', status: 'in_stock', category: 'Diabetes', min_threshold: 10 },
  { id: 'inv-07', medicine: 'Morphine Sulfate', quantity: 8, unit: 'ampoules', temperature_required: '15–25°C', expiry_date: '2027-01-05', status: 'low_stock', category: 'Pain Management', min_threshold: 15 },
  { id: 'inv-08', medicine: 'MMR Vaccine', quantity: 45, unit: 'doses', temperature_required: '2–8°C', expiry_date: '2027-04-22', status: 'in_stock', category: 'Vaccines', min_threshold: 20 },
]

// ─── Drones ───────────────────────────────────────────────────────────────────
export const DRONES: Drone[] = [
  {
    id: 'MH-D01',
    name: 'Hawk Alpha',
    status: 'in_flight',
    lat: 20.3210,
    lng: 85.7890,
    altitude: 82,
    speed: 46,
    battery: 78,
    temperature: 5.8,
    gps_accuracy: 1.2,
    connection: 'stable',
    link_type: '4G',
    mission_id: 'MSN-2026-00421',
    health: { motors: 'ok', sensors: 'ok', propellers: 'ok', payload_lock: 'ok' },
    last_updated: new Date().toISOString(),
    total_missions: 187,
    flight_hours: 312,
  },
  {
    id: 'MH-D02',
    name: 'Hawk Beta',
    status: 'available',
    lat: 20.2961,
    lng: 85.8189,
    altitude: 0,
    speed: 0,
    battery: 96,
    temperature: 5.2,
    gps_accuracy: 0.8,
    connection: 'stable',
    link_type: 'both',
    health: { motors: 'ok', sensors: 'ok', propellers: 'ok', payload_lock: 'ok' },
    last_updated: new Date().toISOString(),
    total_missions: 143,
    flight_hours: 241,
  },
  {
    id: 'MH-D03',
    name: 'Hawk Gamma',
    status: 'returning',
    lat: 20.2780,
    lng: 85.7950,
    altitude: 45,
    speed: 38,
    battery: 34,
    temperature: 6.1,
    gps_accuracy: 1.8,
    connection: 'stable',
    link_type: '4G',
    health: { motors: 'ok', sensors: 'warning', propellers: 'ok', payload_lock: 'ok' },
    last_updated: new Date().toISOString(),
    total_missions: 98,
    flight_hours: 178,
  },
  {
    id: 'MH-D04',
    name: 'Hawk Delta',
    status: 'maintenance',
    lat: 20.2961,
    lng: 85.8189,
    altitude: 0,
    speed: 0,
    battery: 45,
    temperature: 5.0,
    gps_accuracy: 0,
    connection: 'stable',
    link_type: 'both',
    health: { motors: 'warning', sensors: 'ok', propellers: 'critical', payload_lock: 'ok' },
    last_updated: new Date().toISOString(),
    total_missions: 221,
    flight_hours: 398,
  },
]

// ─── Orders ───────────────────────────────────────────────────────────────────
export const ORDERS: Order[] = [
  {
    id: 'MH-2026-00421',
    doctor_id: 'doc-001',
    doctor_name: 'Dr. Priya Mohanty',
    from_location: 'hub-01',
    from_location_name: 'MediHawk Central Hub',
    destination_location: 'phc-chandaka',
    destination_name: 'PHC Chandaka',
    medicine: 'Polyvalent Antivenin',
    quantity: 2,
    unit: 'vials',
    priority: 'emergency',
    status: 'in_flight',
    drone_id: 'MH-D01',
    inspection_done: true,
    qr_verified: true,
    temperature: 5.8,
    ordered_at: new Date(Date.now() - 22 * 60000).toISOString(),
    launched_at: new Date(Date.now() - 14 * 60000).toISOString(),
    notes: 'Snake bite case. Patient stable but critical.',
    otp: '847291',
  },
  {
    id: 'MH-2026-00420',
    doctor_id: 'doc-002',
    doctor_name: 'Dr. Ramesh Nayak',
    from_location: 'hub-01',
    from_location_name: 'MediHawk Central Hub',
    destination_location: 'phc-jatani',
    destination_name: 'PHC Jatani',
    medicine: 'Oxytocin',
    quantity: 10,
    unit: 'ampoules',
    priority: 'urgent',
    status: 'pending',
    inspection_done: false,
    qr_verified: false,
    temperature: 0,
    ordered_at: new Date(Date.now() - 5 * 60000).toISOString(),
    notes: 'Post-partum hemorrhage risk.',
    otp: '193847',
  },
  {
    id: 'MH-2026-00419',
    doctor_id: 'doc-001',
    doctor_name: 'Dr. Priya Mohanty',
    from_location: 'hub-01',
    from_location_name: 'MediHawk Central Hub',
    destination_location: 'phc-chandaka',
    destination_name: 'PHC Chandaka',
    medicine: 'Insulin Regular',
    quantity: 5,
    unit: 'vials',
    priority: 'normal',
    status: 'verified',
    drone_id: 'MH-D02',
    inspection_done: true,
    qr_verified: true,
    temperature: 5.2,
    ordered_at: new Date(Date.now() - 95 * 60000).toISOString(),
    launched_at: new Date(Date.now() - 88 * 60000).toISOString(),
    delivered_at: new Date(Date.now() - 75 * 60000).toISOString(),
    delivery_time_minutes: 13,
    receiver_verified: true,
    otp: '562904',
  },
  {
    id: 'MH-2026-00418',
    doctor_id: 'doc-002',
    doctor_name: 'Dr. Ramesh Nayak',
    from_location: 'hub-01',
    from_location_name: 'MediHawk Central Hub',
    destination_location: 'phc-jatani',
    destination_name: 'PHC Jatani',
    medicine: 'OPV Vaccine',
    quantity: 20,
    unit: 'doses',
    priority: 'urgent',
    status: 'verified',
    drone_id: 'MH-D03',
    inspection_done: true,
    qr_verified: true,
    temperature: 5.9,
    ordered_at: new Date(Date.now() - 180 * 60000).toISOString(),
    launched_at: new Date(Date.now() - 172 * 60000).toISOString(),
    delivered_at: new Date(Date.now() - 159 * 60000).toISOString(),
    delivery_time_minutes: 11,
    receiver_verified: true,
    otp: '381920',
  },
]

// ─── Active Mission ───────────────────────────────────────────────────────────
const waypointPath: MissionWaypoint[] = [
  { index: 0, lat: 20.2961, lng: 85.8189, altitude: 0, label: 'Hub Takeoff', reached: true, reached_at: new Date(Date.now() - 14 * 60000).toISOString() },
  { index: 1, lat: 20.3050, lng: 85.8050, altitude: 80, label: 'Waypoint Alpha', reached: true, reached_at: new Date(Date.now() - 11 * 60000).toISOString() },
  { index: 2, lat: 20.3210, lng: 85.7890, altitude: 82, label: 'Waypoint Beta', reached: false },
  { index: 3, lat: 20.3380, lng: 85.7730, altitude: 75, label: 'Waypoint Gamma', reached: false },
  { index: 4, lat: 20.3512, lng: 85.7612, altitude: 0, label: 'PHC Chandaka', reached: false },
]

const missionEvents: MissionEvent[] = [
  { timestamp: new Date(Date.now() - 14 * 60000).toISOString(), event: 'Mission authorized by Arjun Patel', type: 'success' },
  { timestamp: new Date(Date.now() - 14 * 60000).toISOString(), event: 'Drone MH-D01 armed and preflight complete', type: 'info' },
  { timestamp: new Date(Date.now() - 13 * 60000).toISOString(), event: 'Takeoff — altitude 80 m reached', type: 'info' },
  { timestamp: new Date(Date.now() - 11 * 60000).toISOString(), event: 'Waypoint Alpha reached — corridor nominal', type: 'success' },
  { timestamp: new Date(Date.now() - 8 * 60000).toISOString(), event: 'Obstacle detected ahead — avoidance trajectory computed', type: 'warning' },
  { timestamp: new Date(Date.now() - 8 * 60000+ 2000).toISOString(), event: 'Mission corridor restored — obstacle cleared', type: 'success' },
  { timestamp: new Date(Date.now() - 4 * 60000).toISOString(), event: 'Payload temperature nominal: 5.8°C (range: 2–8°C)', type: 'info' },
]

export const ACTIVE_MISSION: Mission = {
  id: 'MSN-2026-00421',
  order_id: 'MH-2026-00421',
  drone_id: 'MH-D01',
  from_location: 'MediHawk Central Hub',
  from_lat: 20.2961,
  from_lng: 85.8189,
  to_location: 'PHC Chandaka',
  to_lat: 20.3512,
  to_lng: 85.7612,
  distance_km: 8.4,
  eta_minutes: 8,
  elapsed_minutes: 14,
  status: 'in_flight',
  waypoints: waypointPath,
  events: missionEvents,
  medicine: 'Polyvalent Antivenin',
  quantity: 2,
  priority: 'emergency',
  launched_at: new Date(Date.now() - 14 * 60000).toISOString(),
}

// ─── Alerts ───────────────────────────────────────────────────────────────────
export const ALERTS: Alert[] = [
  {
    id: 'alert-001',
    severity: 'warning',
    category: 'inventory',
    title: 'Low Medicine Stock: Oxytocin',
    description: 'Oxytocin stock at 5 ampoules — below minimum threshold of 20.',
    recommended_action: 'Reorder from district pharmacy. Estimated stock-out in 2 days.',
    timestamp: new Date(Date.now() - 35 * 60000).toISOString(),
    acknowledged: false,
  },
  {
    id: 'alert-002',
    severity: 'critical',
    category: 'inventory',
    title: 'Critical Stock: OPV Vaccine',
    description: 'OPV Vaccine at 3 vials — critically below minimum threshold of 20.',
    recommended_action: 'Emergency resupply required immediately.',
    timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
    acknowledged: false,
  },
  {
    id: 'alert-003',
    severity: 'info',
    category: 'mission',
    title: 'Mission MH-2026-00421 In Flight',
    description: 'Drone MH-D01 carrying Antivenin to PHC Chandaka. ETA: 8 min.',
    recommended_action: 'Monitor telemetry. Ensure receiver at destination.',
    mission_id: 'MSN-2026-00421',
    drone_id: 'MH-D01',
    timestamp: new Date(Date.now() - 14 * 60000).toISOString(),
    acknowledged: true,
  },
  {
    id: 'alert-004',
    severity: 'warning',
    category: 'battery',
    title: 'Drone MH-D03 Low Battery',
    description: 'Hawk Gamma returning to hub with 34% battery. Below 40% threshold.',
    recommended_action: 'Clear landing pad. Schedule immediate recharge.',
    drone_id: 'MH-D03',
    timestamp: new Date(Date.now() - 8 * 60000).toISOString(),
    acknowledged: false,
  },
]

// ─── Temperature Log ──────────────────────────────────────────────────────────
export function generateTempLog(baseTemp: number, count = 40): TemperatureLog[] {
  const logs: TemperatureLog[] = []
  let t = baseTemp
  const now = Date.now()
  for (let i = count; i >= 0; i--) {
    t += (Math.random() - 0.5) * 0.3
    t = Math.max(2.5, Math.min(7.5, t))
    logs.push({
      timestamp: new Date(now - i * 60000).toISOString(),
      temperature: parseFloat(t.toFixed(1)),
      event: i === count ? 'Payload loaded' : i === 30 ? 'Drone sealed' : i === 20 ? 'Launch' : undefined,
    })
  }
  return logs
}

// ─── Telemetry History ────────────────────────────────────────────────────────
export function generateTelemetryHistory(count = 30): TelemetryPoint[] {
  const points: TelemetryPoint[] = []
  const now = Date.now()
  let lat = 20.2961, lng = 85.8189
  const targetLat = 20.3512, targetLng = 85.7612
  for (let i = 0; i <= count; i++) {
    const progress = i / count
    points.push({
      timestamp: new Date(now - (count - i) * 30000).toISOString(),
      altitude: 80 + Math.sin(progress * Math.PI) * 8 + (Math.random() - 0.5) * 2,
      speed: 44 + (Math.random() - 0.5) * 6,
      battery: 94 - progress * 18,
      temperature: 5.6 + (Math.random() - 0.5) * 0.5,
      lat: lat + (targetLat - lat) * progress + (Math.random() - 0.5) * 0.001,
      lng: lng + (targetLng - lng) * progress + (Math.random() - 0.5) * 0.001,
    })
  }
  return points
}

// ─── System Status ────────────────────────────────────────────────────────────
export const SYSTEM_STATUS: SystemStatus = {
  backend: 'connected',
  websocket: 'connected',
  fourG: 'connected',
  zerotier: 'connected',
  drone: 'online',
  gps: 'locked',
  temperature: 'safe',
  last_sync: new Date().toISOString(),
}

// ─── Daily Analytics ──────────────────────────────────────────────────────────
export function generateDailyMetrics(days = 14): DailyMetric[] {
  const metrics: DailyMetric[] = []
  const now = Date.now()
  for (let i = days; i >= 0; i--) {
    const date = new Date(now - i * 86400000)
    metrics.push({
      date: date.toISOString().split('T')[0],
      deliveries: Math.floor(8 + Math.random() * 14),
      avg_time: parseFloat((9 + Math.random() * 5).toFixed(1)),
      success_rate: parseFloat((96 + Math.random() * 3).toFixed(1)),
    })
  }
  return metrics
}

// ─── Inspection Checks ────────────────────────────────────────────────────────
export const INSPECTION_CHECKS: InspectionCheck[] = [
  { id: 'qr', label: 'QR Verification', status: 'pass', detail: 'Payload QR matches order MH-2026-00420', mandatory: true },
  { id: 'medicine', label: 'Medicine Identity', status: 'pass', detail: 'Oxytocin — confirmed', mandatory: true },
  { id: 'quantity', label: 'Quantity', status: 'pass', detail: '10 ampoules loaded', mandatory: true },
  { id: 'expiry', label: 'Expiry Date', status: 'pass', detail: 'Valid until 2026-11-20', mandatory: true },
  { id: 'temperature', label: 'Payload Temperature', status: 'pass', detail: '4.2°C — within 2–8°C range', mandatory: true },
  { id: 'sealed', label: 'Payload Sealed', status: 'pass', detail: 'Tamper seal intact', mandatory: true },
  { id: 'mounted', label: 'Box Mounted', status: 'pass', detail: 'Payload secured to MH-D02', mandatory: true },
  { id: 'battery', label: 'Battery', status: 'pass', detail: '96% — above minimum 20%', mandatory: true },
  { id: 'gps', label: 'GPS Lock', status: 'pass', detail: 'Accuracy: 0.8 m HDOP', mandatory: true },
  { id: 'weather', label: 'Weather Clearance', status: 'pass', detail: 'Wind 12 km/h — below limit', mandatory: true },
  { id: '4g', label: '4G Link', status: 'pass', detail: 'Signal strength: -72 dBm — stable', mandatory: true },
  { id: 'zerotier', label: 'ZeroTier Link', status: 'pass', detail: 'VPN tunnel active — latency 14 ms', mandatory: false },
]

// ─── Hero Stats ───────────────────────────────────────────────────────────────
export const HERO_STATS = {
  deliveries_today: 142,
  drones_active: 4,
  avg_delivery_min: 11.4,
  mission_success_rate: 98.7,
}
