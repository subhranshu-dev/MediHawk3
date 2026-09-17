// ─── useAdminData ─────────────────────────────────────────────────────────────
// Polls /api/admin/command-center and syncs Zustand store with backend data.

import { useEffect, useCallback } from 'react'
import { adminService } from '@/services/api'
import { useStore } from '@/store'

export function useAdminData(intervalMs = 5000) {
  const { setDronesFromBackend, setActiveMissionFromBackend, setAlertsFromBackend, setSystemStatus } = useStore()

  const fetchAndSync = useCallback(async () => {
    try {
      const token = localStorage.getItem('mh_jwt')
      if (!token) return
      const data = await adminService.commandCenter() as Record<string, unknown>
      // data has: drones, active_mission, alerts, active_missions count, etc.
      if (data.drones) setDronesFromBackend(data.drones as Parameters<typeof setDronesFromBackend>[0])
      if (data.active_mission !== undefined) setActiveMissionFromBackend(data.active_mission as Parameters<typeof setActiveMissionFromBackend>[0])
      if (data.alerts) setAlertsFromBackend(data.alerts as Parameters<typeof setAlertsFromBackend>[0])
      setSystemStatus({ backend: 'connected' })
    } catch {
      setSystemStatus({ backend: 'disconnected' })
    }
  }, [setDronesFromBackend, setActiveMissionFromBackend, setAlertsFromBackend, setSystemStatus])

  useEffect(() => {
    fetchAndSync()
    const id = setInterval(fetchAndSync, intervalMs)
    return () => clearInterval(id)
  }, [fetchAndSync, intervalMs])

  return { refetch: fetchAndSync }
}
