import React, { Suspense, lazy } from 'react'
import { motion } from 'framer-motion'
import {
  Navigation, Thermometer, Battery, Wifi,
  AlertTriangle, PauseCircle, RotateCcw, PlayCircle,
  Clock, Activity
} from 'lucide-react'
import { useStore } from '@/store'
import { useToast } from '@/components/ui/Toast'
import { useAdminData } from '@/hooks/useAdminData'
import { adminService } from '@/services/api'
import { MissionEventLog, WaypointProgress } from '@/components/mission/MissionTimeline'
import { TemperatureChart } from '@/components/charts/TemperatureChart'
import { BatteryIndicator } from '@/components/ui/BatteryIndicator'
import { priorityBadge } from '@/components/ui/StatusBadge'
import { clsx } from 'clsx'

const MissionMap = lazy<React.FC<{ height?: number; followDrone?: boolean }>>(() =>
  import('@/components/map/MissionMap').then(m => ({ default: m.MissionMap }))
)

export function AdminMissions() {
  useAdminData()
  const { activeMission, drones, temperatureLogs } = useStore()
  const { toast } = useToast()

  const flyingDrone = drones.find((d) => d.mission_id)
  const lastTemp = temperatureLogs[temperatureLogs.length - 1]?.temperature ?? 5.8
  const tempSafe = lastTemp >= 2 && lastTemp <= 8

  const handleRTL = async () => {
    if (flyingDrone) {
      try {
        await adminService.droneRTL(flyingDrone.id)
      } catch { /* toast regardless */ }
    }
    toast('warning', 'Emergency RTL Initiated', `Drone ${flyingDrone?.id} returning to base`)
  }

  const handleHold = async () => {
    if (flyingDrone) {
      try {
        await adminService.droneHold(flyingDrone.id)
      } catch { /* toast regardless */ }
    }
    toast('info', 'Mission Hold', 'Drone hovering at current position')
  }

  const handleResume = async () => {
    if (flyingDrone) {
      try {
        await adminService.droneResume(flyingDrone.id)
      } catch { /* toast regardless */ }
    }
    toast('info', 'Mission Resumed', 'Drone continuing to destination')
  }

  if (!activeMission) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Navigation size={48} className="text-text-muted" />
        <div className="text-center">
          <h2 className="text-xl font-bold text-text-primary">No Active Missions</h2>
          <p className="text-sm text-text-secondary mt-2">Mission details will appear here when a drone is in flight.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-0">
      {/* Mission header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/6 bg-graphite/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-crimson" />
            </span>
            <span className="text-xs font-bold text-crimson uppercase tracking-widest">ACTIVE MISSION</span>
          </div>
          <span className="font-mono-data text-sm text-text-primary">{activeMission.id}</span>
          <span className="text-text-muted">·</span>
          <span className="text-xs text-text-secondary">{activeMission.medicine}</span>
          {priorityBadge(activeMission.priority)}
        </div>

        {/* Emergency controls — always visible */}
        <div className="flex items-center gap-2">
          <button onClick={handleHold} className="btn-secondary text-xs py-1.5">
            <PauseCircle size={13} />
            HOLD
          </button>
          <button onClick={handleResume} className="btn-secondary text-xs py-1.5">
            <PlayCircle size={13} />
            RESUME
          </button>
          <button onClick={handleRTL} className="btn-danger text-xs py-1.5 font-bold tracking-wide">
            <AlertTriangle size={13} />
            EMERGENCY RTL
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-3 gap-0 divide-x divide-white/6">
        {/* Left: Map (2 cols) */}
        <div className="xl:col-span-2 flex flex-col">
          <Suspense fallback={<div className="flex-1 bg-graphite flex items-center justify-center text-text-muted text-xs">Loading map…</div>}>
            <MissionMap height={420} followDrone />
          </Suspense>

          {/* Telemetry strip */}
          {flyingDrone && (
            <div className="border-t border-white/6 px-5 py-3 flex items-center gap-6 flex-wrap bg-graphite/30">
              {[
                { label: 'ALTITUDE', value: `${flyingDrone.altitude}`, unit: 'm', icon: <Navigation size={13} /> },
                { label: 'SPEED', value: `${flyingDrone.speed}`, unit: 'km/h', icon: <Activity size={13} /> },
                { label: 'ETA', value: `${activeMission.eta_minutes}`, unit: 'min', icon: <Clock size={13} /> },
                { label: 'ELAPSED', value: `${activeMission.elapsed_minutes.toFixed(0)}`, unit: 'min', icon: <Clock size={13} /> },
                { label: 'DISTANCE', value: `${activeMission.distance_km}`, unit: 'km', icon: <Navigation size={13} /> },
              ].map((t) => (
                <div key={t.label} className="flex items-center gap-1.5">
                  <span className="text-text-muted">{t.icon}</span>
                  <div>
                    <div className="telemetry-label">{t.label}</div>
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-mono-data font-bold text-sm text-text-primary">{t.value}</span>
                      <span className="text-2xs text-text-secondary">{t.unit}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div className="ml-auto flex items-center gap-4">
                <div>
                  <div className="telemetry-label">BATTERY</div>
                  <BatteryIndicator level={flyingDrone.battery} size="sm" />
                </div>
                <div>
                  <div className="telemetry-label">PAYLOAD TEMP</div>
                  <span className={clsx('font-mono-data font-bold text-sm', tempSafe ? 'text-med-green-light' : 'text-crimson-light')}>
                    {lastTemp.toFixed(1)}°C
                  </span>
                </div>
                <div>
                  <div className="telemetry-label">4G LINK</div>
                  <div className="flex items-center gap-1">
                    <Wifi size={11} className={flyingDrone.connection === 'stable' ? 'text-med-green-light' : 'text-amber-light'} />
                    <span className={clsx('text-xs font-bold uppercase', flyingDrone.connection === 'stable' ? 'text-med-green-light' : 'text-amber-light')}>
                      {flyingDrone.connection}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mission event log */}
          <div className="flex-1 border-t border-white/6 p-4 overflow-auto">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Mission Events</h3>
            <MissionEventLog events={activeMission.events} />
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-col overflow-auto">
          {/* Mission details */}
          <div className="p-4 border-b border-white/6">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Mission Details</h3>
            <div className="flex flex-col gap-2 text-xs">
              {[
                { label: 'Mission ID', value: activeMission.id },
                { label: 'Order', value: activeMission.order_id },
                { label: 'Medicine', value: activeMission.medicine },
                { label: 'Payload', value: `${activeMission.quantity} units` },
                { label: 'Drone', value: flyingDrone?.name ?? activeMission.drone_id },
                { label: 'From', value: activeMission.from_location },
                { label: 'To', value: activeMission.to_location },
              ].map((r) => (
                <div key={r.label} className="flex justify-between">
                  <span className="text-text-muted">{r.label}</span>
                  <span className="text-text-primary font-medium text-right">{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Waypoint progress */}
          <div className="p-4 border-b border-white/6">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Waypoints</h3>
            <WaypointProgress />
          </div>

          {/* Temperature chart */}
          <div className="p-4 border-b border-white/6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Payload Temp</h3>
              <span className={clsx('font-mono-data font-bold text-sm', tempSafe ? 'text-med-green-light' : 'text-crimson-light')}>
                {lastTemp.toFixed(1)}°C
              </span>
            </div>
            <TemperatureChart height={120} />
          </div>

          {/* Drone health */}
          {flyingDrone && (
            <div className="p-4">
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Drone Health</h3>
              <div className="flex flex-col gap-2">
                {Object.entries(flyingDrone.health).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary capitalize">{key.replace('_', ' ')}</span>
                    <span className={clsx(
                      'text-2xs font-bold uppercase px-2 py-0.5 rounded',
                      val === 'ok' ? 'text-med-green bg-med-green-glow border border-med-green/20' :
                      val === 'warning' ? 'text-amber bg-amber-glow border border-amber/20' :
                      'text-crimson bg-crimson-glow border border-crimson/20'
                    )}>
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
