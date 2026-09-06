import { create } from 'zustand'
import type {
  User, Order, Drone, Mission, Alert,
  SystemStatus, TemperatureLog, TelemetryPoint
} from '@/types'
import {
  MOCK_USERS, ORDERS, DRONES, ACTIVE_MISSION,
  ALERTS, SYSTEM_STATUS, generateTempLog, generateTelemetryHistory
} from '@/data/mockData'

interface AppState {
  // Auth
  user: User | null
  isDemo: boolean
  login: (role: 'doctor' | 'admin') => void
  logout: () => void
  setDemo: (v: boolean) => void

  // Orders
  orders: Order[]
  addOrder: (o: Order) => void
  updateOrderStatus: (id: string, status: Order['status']) => void

  // Drones
  drones: Drone[]
  updateDrone: (id: string, patch: Partial<Drone>) => void

  // Mission
  activeMission: Mission | null
  setActiveMission: (m: Mission | null) => void

  // Alerts
  alerts: Alert[]
  acknowledgeAlert: (id: string) => void
  addAlert: (a: Alert) => void

  // Telemetry
  activeTelemetry: TelemetryPoint[]
  pushTelemetry: (p: TelemetryPoint) => void

  // Temperature
  temperatureLogs: TemperatureLog[]

  // System
  systemStatus: SystemStatus
  setSystemStatus: (s: Partial<SystemStatus>) => void

  // Simulation
  simRunning: boolean
  setSimRunning: (v: boolean) => void
  simScenario: string | null
  triggerScenario: (s: string | null) => void

  // UI
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

export const useStore = create<AppState>((set, _get) => ({
  user: null,
  isDemo: true,
  login: (role) => set({ user: MOCK_USERS[role] }),
  logout: () => set({ user: null }),
  setDemo: (v) => set({ isDemo: v }),

  orders: ORDERS,
  addOrder: (o) => set((s) => ({ orders: [o, ...s.orders] })),
  updateOrderStatus: (id, status) =>
    set((s) => ({
      orders: s.orders.map((o) =>
        o.id === id
          ? { ...o, status, ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}) }
          : o
      ),
    })),

  drones: DRONES,
  updateDrone: (id, patch) =>
    set((s) => ({
      drones: s.drones.map((d) =>
        d.id === id ? { ...d, ...patch, last_updated: new Date().toISOString() } : d
      ),
    })),

  activeMission: ACTIVE_MISSION,
  setActiveMission: (m) => set({ activeMission: m }),

  alerts: ALERTS,
  acknowledgeAlert: (id) =>
    set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)) })),
  addAlert: (a) => set((s) => ({ alerts: [a, ...s.alerts] })),

  activeTelemetry: generateTelemetryHistory(),
  pushTelemetry: (p) =>
    set((s) => ({
      activeTelemetry: [...s.activeTelemetry.slice(-59), p],
    })),

  temperatureLogs: generateTempLog(5.8),

  systemStatus: SYSTEM_STATUS,
  setSystemStatus: (s) =>
    set((prev) => ({ systemStatus: { ...prev.systemStatus, ...s } })),

  simRunning: true,
  setSimRunning: (v) => set({ simRunning: v }),
  simScenario: null,
  triggerScenario: (s) => set({ simScenario: s }),

  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
}))
