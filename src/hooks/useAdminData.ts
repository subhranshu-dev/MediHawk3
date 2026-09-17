// ─── useAdminData ─────────────────────────────────────────────────────────────
// Polls /api/admin/command-center and syncs Zustand store with backend data.
// Also fetches orders and active missions so AdminOverview hydrates on first load
// without requiring navigation to the Orders page first.

import { useEffect, useCallback } from 'react'
import { adminService, orderService } from '@/services/api'
import { useStore } from '@/store'
import type { Mission } from '@/types'

const _ACTIVE_STATUSES = new Set(['preparing', 'in_flight', 'landing'])

export function useAdminData(intervalMs = 5000) {
  const {
    setDronesFromBackend,
    setActiveMissionFromBackend,
    setActiveMissionsFromBackend,
    setAlertsFromBackend,
    setOrdersFromBackend,
    setSystemStatus,
  } = useStore()

  const fetchAndSync = useCallback(async () => {
    try {
      const token = localStorage.getItem('mh_jwt')
      if (!token) return

      // Fetch command-center data and orders in parallel — both needed for AdminOverview
      const [data, orders] = await Promise.all([
        adminService.commandCenter() as Promise<Record<string, unknown>>,
        orderService.list().catch(() => []),
      ])

      if (data.drones) setDronesFromBackend(data.drones as Parameters<typeof setDronesFromBackend>[0])
      if (data.active_mission !== undefined) setActiveMissionFromBackend(data.active_mission as Parameters<typeof setActiveMissionFromBackend>[0])
      if (data.alerts) setAlertsFromBackend(data.alerts as Parameters<typeof setAlertsFromBackend>[0])

      // Populate active missions list for multi-drone map support
      // Use the single active_mission from command-center for now; expand when backend returns all
      const activeMissionObj = data.active_mission as Mission | null
      setActiveMissionsFromBackend(activeMissionObj ? [activeMissionObj] : [])

      // Populate orders so AdminOverview shows correct counts on first load
      if (orders.length > 0) setOrdersFromBackend(orders)

      setSystemStatus({ backend: 'connected' })
    } catch {
      setSystemStatus({ backend: 'disconnected' })
    }
  }, [
    setDronesFromBackend,
    setActiveMissionFromBackend,
    setActiveMissionsFromBackend,
    setAlertsFromBackend,
    setOrdersFromBackend,
    setSystemStatus,
  ])

  useEffect(() => {
    fetchAndSync()
    const id = setInterval(fetchAndSync, intervalMs)
    return () => clearInterval(id)
  }, [fetchAndSync, intervalMs])

  return { refetch: fetchAndSync }
}
