// ─── WebSocket / Socket.IO Service ───────────────────────────────────────────
// Prepared for Flask-SocketIO backend.
// Events: telemetry, new_order, order_status, temp_warning, temp_critical,
//         drone_landed, drone_rtl, mission_complete, low_stock_alert

import { useStore } from '@/store'

type SocketState = 'connected' | 'connecting' | 'reconnecting' | 'disconnected'

interface MockSocket {
  on: (event: string, handler: (...args: unknown[]) => void) => void
  off: (event: string) => void
  disconnect: () => void
  state: SocketState
}

let mockSocket: MockSocket | null = null

export function initWebSocket(url: string): MockSocket {
  // In demo mode this is a no-op mock.
  // In production, import { io } from 'socket.io-client' and use:
  //   const socket = io(url, { transports: ['websocket'] })
  //   socket.on('telemetry', (data) => store.pushTelemetry(data))
  //   etc.

  console.info(`[WebSocket] Demo mode — would connect to ${url}`)
  useStore.getState().setSystemStatus({ websocket: 'disconnected' })

  const handlers: Record<string, (...args: unknown[]) => void> = {}

  mockSocket = {
    state: 'connected',
    on: (event, handler) => { handlers[event] = handler },
    off: (event) => { delete handlers[event] },
    disconnect: () => {
      mockSocket!.state = 'disconnected'
      useStore.getState().setSystemStatus({ websocket: 'disconnected' })
    },
  }

  return mockSocket
}

// ─── Socket event names (for type safety when connecting real backend) ────────
export const SOCKET_EVENTS = {
  TELEMETRY: 'telemetry',
  NEW_ORDER: 'new_order',
  ORDER_STATUS: 'order_status',
  TEMP_WARNING: 'temp_warning',
  TEMP_CRITICAL: 'temp_critical',
  DRONE_LANDED: 'drone_landed',
  DRONE_RTL: 'drone_rtl',
  MISSION_COMPLETE: 'mission_complete',
  LOW_STOCK_ALERT: 'low_stock_alert',
} as const
