import { create } from 'zustand'
import type {
  User, Order, Drone, Mission, Alert,
  SystemStatus, TemperatureLog, TelemetryPoint
} from '@/types'
import {
  ALERTS, SYSTEM_STATUS, generateTempLog, generateTelemetryHistory
} from '@/data/mockData'

interface AppState {
  // Auth
  user: User | null
  authHydrating: boolean
  isDemo: boolean
  loginUser: (user: User) => void
  logout: () => void
  setAuthHydrating: (v: boolean) => void
  setDemo: (v: boolean) => void

  // Orders
  orders: Order[]
  addOrder: (o: Order) => void
  updateOrderStatus: (id: string, status: Order['status']) => void
  setOrdersFromBackend: (orders: Order[]) => void

  // Drones
  drones: Drone[]
  updateDrone: (id: string, patch: Partial<Drone>) => void
  setDronesFromBackend: (drones: Drone[]) => void

  // Mission
  activeMission: Mission | null
  activeMissions: Mission[]
  setActiveMission: (m: Mission | null) => void
  setActiveMissionFromBackend: (m: Mission | null) => void
  setActiveMissionsFromBackend: (missions: Mission[]) => void

  // Alerts
  alerts: Alert[]
  acknowledgeAlert: (id: string) => void
  addAlert: (a: Alert) => void
  setAlertsFromBackend: (alerts: Alert[]) => void

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
  authHydrating: !!localStorage.getItem('mh_jwt'),
  isDemo: false,
  loginUser: (user) => set({ user }),
  logout: () => {
    localStorage.removeItem('mh_jwt')
    set({ user: null, orders: [], authHydrating: false })
  },
  setAuthHydrating: (v) => set({ authHydrating: v }),
  setDemo: (v) => set({ isDemo: v }),

  orders: [],
  addOrder: (o) => set((s) => ({
    orders: s.orders.some((ex) => ex.id === o.id) ? s.orders : [o, ...s.orders],
  })),
  updateOrderStatus: (id, status) =>
    set((s) => ({
      orders: s.orders.map((o) =>
        o.id === id
          ? { ...o, status, ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}) }
          : o
      ),
    })),
  setOrdersFromBackend: (orders) => set({ orders }),

  drones: [],
  updateDrone: (id, patch) =>
    set((s) => ({
      drones: s.drones.map((d) =>
        d.id === id ? { ...d, ...patch, last_updated: new Date().toISOString() } : d
      ),
    })),
  setDronesFromBackend: (drones) => set({ drones }),

  activeMission: null,
  activeMissions: [],
  setActiveMission: (m) => set({ activeMission: m }),
  setActiveMissionFromBackend: (m) => set({ activeMission: m }),
  setActiveMissionsFromBackend: (missions) => set({ activeMissions: missions }),

  alerts: ALERTS,
  acknowledgeAlert: (id) =>
    set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)) })),
  addAlert: (a) => set((s) => ({ alerts: [a, ...s.alerts] })),
  setAlertsFromBackend: (alerts) => set({ alerts }),

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
