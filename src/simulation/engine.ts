import { useStore } from '@/store'
import type { TelemetryPoint } from '@/types'

let interval: ReturnType<typeof setInterval> | null = null

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function startSimulation() {
  if (interval) return
  interval = setInterval(tick, 2000)
}

export function stopSimulation() {
  if (interval) {
    clearInterval(interval)
    interval = null
  }
}

let missionProgress = 0.55 // start mid-flight

function tick() {
  const store = useStore.getState()
  if (!store.simRunning) return

  const { activeMission, drones, updateDrone, pushTelemetry, setActiveMission, updateOrderStatus, addAlert } = store

  // ─── Drone telemetry update ──────────────────────────────────────────────
  const flyingDrone = drones.find((d) => d.status === 'in_flight')
  if (flyingDrone && activeMission) {
    missionProgress = Math.min(missionProgress + 0.012, 1.0)

    const lat = lerp(activeMission.from_lat, activeMission.to_lat, missionProgress)
    const lng = lerp(activeMission.from_lng, activeMission.to_lng, missionProgress)
    const altitude = missionProgress < 0.05 ? missionProgress * 80 / 0.05
      : missionProgress > 0.95 ? (1 - missionProgress) * 80 / 0.05
      : 80 + Math.sin(missionProgress * Math.PI) * 8

    const newBattery = Math.max(0, flyingDrone.battery - 0.08)
    const newSpeed = missionProgress > 0.9 ? 20 : 44 + (Math.random() - 0.5) * 4
    const newTemp = parseFloat((5.6 + (Math.random() - 0.5) * 0.4).toFixed(1))

    updateDrone(flyingDrone.id, {
      lat,
      lng,
      altitude: parseFloat(altitude.toFixed(1)),
      speed: parseFloat(newSpeed.toFixed(1)),
      battery: parseFloat(newBattery.toFixed(1)),
      temperature: newTemp,
    })

    const telPoint: TelemetryPoint = {
      timestamp: new Date().toISOString(),
      lat,
      lng,
      altitude: parseFloat(altitude.toFixed(1)),
      speed: parseFloat(newSpeed.toFixed(1)),
      battery: parseFloat(newBattery.toFixed(1)),
      temperature: newTemp,
    }
    pushTelemetry(telPoint)

    // Update mission ETA
    const remainingProgress = 1 - missionProgress
    const updatedEta = Math.max(0, Math.round(remainingProgress * activeMission.distance_km / 0.8))
    const updatedElapsed = activeMission.elapsed_minutes + 0.033

    // Update waypoints
    const waypoints = activeMission.waypoints ?? []
    const updatedWaypoints = waypoints.map((wp) => {
      const wpProgress = waypoints.length > 1 ? wp.index / (waypoints.length - 1) : 0
      if (!wp.reached && missionProgress >= wpProgress) {
        return { ...wp, reached: true, reached_at: new Date().toISOString() }
      }
      return wp
    })

    setActiveMission({
      ...activeMission,
      waypoints: updatedWaypoints,
      eta_minutes: updatedEta,
      elapsed_minutes: parseFloat(updatedElapsed.toFixed(1)),
    })

    // Landing sequence
    if (missionProgress >= 1.0) {
      updateDrone(flyingDrone.id, { status: 'available', altitude: 0, speed: 0, lat: activeMission.to_lat, lng: activeMission.to_lng })
      setActiveMission({ ...activeMission, status: 'delivered', eta_minutes: 0, waypoints: updatedWaypoints.map(w => ({ ...w, reached: true })) })
      updateOrderStatus(activeMission.order_id, 'delivered')
      missionProgress = 0.55 // reset for next demo cycle
      setTimeout(() => {
        missionProgress = 0.55
        updateDrone(flyingDrone.id, { status: 'in_flight', altitude: 80 })
        setActiveMission({ ...activeMission, status: 'in_flight', eta_minutes: 8, elapsed_minutes: 14 })
        updateOrderStatus(activeMission.order_id, 'in_flight')
      }, 8000)
    }
  }

  // ─── Handle scenarios ──────────────────────────────────────────────────────
  const { simScenario, triggerScenario } = store
  if (simScenario) {
    switch (simScenario) {
      case 'temp_warning':
        if (flyingDrone) updateDrone(flyingDrone.id, { temperature: 9.2 })
        addAlert({
          id: `alert-sim-${Date.now()}`,
          severity: 'warning',
          category: 'temperature',
          title: 'Payload Temperature Warning',
          description: 'Payload temperature 9.2°C — above safe range (2–8°C).',
          recommended_action: 'Monitor closely. Consider RTL if temperature exceeds 10°C.',
          mission_id: activeMission?.id,
          drone_id: flyingDrone?.id,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        })
        break
      case 'link_loss':
        if (flyingDrone) updateDrone(flyingDrone.id, { connection: 'degraded' })
        addAlert({
          id: `alert-sim-${Date.now()}`,
          severity: 'warning',
          category: 'connection',
          title: '4G Connection Degraded',
          description: 'Signal strength dropped. Drone operating on reduced telemetry.',
          recommended_action: 'Monitor signal recovery. Drone will continue autonomously.',
          drone_id: flyingDrone?.id,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        })
        setTimeout(() => { if (flyingDrone) updateDrone(flyingDrone.id, { connection: 'stable' }) }, 5000)
        break
      case 'obstacle':
        if (activeMission) {
          setActiveMission({
            ...activeMission,
            events: [...(activeMission.events ?? []), {
              timestamp: new Date().toISOString(),
              event: 'Obstacle detected — avoidance trajectory calculated',
              type: 'warning',
            }, {
              timestamp: new Date(Date.now() + 1500).toISOString(),
              event: 'Mission corridor restored',
              type: 'success',
            }],
          })
        }
        break
    }
    triggerScenario(null)
  }
}
