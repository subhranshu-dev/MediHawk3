import { motion } from 'framer-motion'
import { Cpu, Wifi, MapPin, Activity, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { useStore } from '@/store'
import { droneStatusBadge } from '@/components/ui/StatusBadge'
import { BatteryIndicator } from '@/components/ui/BatteryIndicator'
import { clsx } from 'clsx'
import type { Drone } from '@/types'

function HealthDot({ status }: { status: 'ok' | 'warning' | 'critical' }) {
  return (
    <span className={clsx(
      'inline-flex w-2.5 h-2.5 rounded-full',
      status === 'ok' ? 'bg-med-green' : status === 'warning' ? 'bg-amber' : 'bg-crimson'
    )} />
  )
}

function DroneCard({ drone, index }: { drone: Drone; index: number }) {
  const isFlying = drone.status === 'in_flight' || drone.status === 'returning'
  const healthValues = Object.values(drone.health)
  const worstHealth = healthValues.includes('critical') ? 'critical' : healthValues.includes('warning') ? 'warning' : 'ok'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className={clsx(
        'panel overflow-hidden',
        isFlying && 'border-crimson/20',
        worstHealth === 'warning' && !isFlying && 'border-amber/15',
        worstHealth === 'critical' && 'border-crimson/30',
      )}
    >
      {/* Card header */}
      <div className={clsx(
        'px-5 py-4 border-b border-white/6 flex items-center justify-between',
        isFlying && 'bg-crimson/5',
      )}>
        <div className="flex items-center gap-3">
          {/* 3D-ish drone icon */}
          <div className={clsx(
            'w-10 h-10 rounded-lg flex items-center justify-center border',
            isFlying ? 'bg-crimson/15 border-crimson/30' :
            drone.status === 'available' ? 'bg-med-green/10 border-med-green/20' :
            drone.status === 'maintenance' ? 'bg-amber/10 border-amber/20' :
            'bg-white/5 border-white/10'
          )}>
            <Cpu size={18} className={
              isFlying ? 'text-crimson-light' :
              drone.status === 'available' ? 'text-med-green-light' :
              drone.status === 'maintenance' ? 'text-amber-light' :
              'text-text-muted'
            } />
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary">{drone.name}</p>
            <p className="font-mono-data text-2xs text-text-muted">{drone.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {droneStatusBadge(drone.status)}
          {isFlying && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-crimson" />
            </span>
          )}
        </div>
      </div>

      {/* Telemetry */}
      <div className="p-5 grid grid-cols-2 gap-4">
        <div>
          <p className="telemetry-label">Battery</p>
          <BatteryIndicator level={drone.battery} size="md" />
        </div>
        <div>
          <p className="telemetry-label">GPS Accuracy</p>
          <p className={clsx('font-mono-data font-bold', drone.gps_accuracy > 0 ? 'text-text-primary' : 'text-text-muted')}>
            {drone.gps_accuracy > 0 ? `${drone.gps_accuracy} m` : 'N/A'}
          </p>
        </div>
        <div>
          <p className="telemetry-label">Altitude</p>
          <p className="font-mono-data font-bold text-text-primary">{drone.altitude} m</p>
        </div>
        <div>
          <p className="telemetry-label">Speed</p>
          <p className="font-mono-data font-bold text-text-primary">{drone.speed} km/h</p>
        </div>
        <div>
          <p className="telemetry-label">Connection</p>
          <div className="flex items-center gap-1.5">
            <Wifi size={12} className={drone.connection === 'stable' ? 'text-med-green-light' : 'text-amber-light'} />
            <span className={clsx('text-xs font-semibold uppercase', drone.connection === 'stable' ? 'text-med-green-light' : 'text-amber-light')}>
              {drone.connection}
            </span>
          </div>
        </div>
        <div>
          <p className="telemetry-label">Temp</p>
          <p className={clsx('font-mono-data font-bold', drone.temperature >= 2 && drone.temperature <= 8 ? 'text-med-green-light' : 'text-amber-light')}>
            {drone.temperature > 0 ? `${drone.temperature}°C` : '—'}
          </p>
        </div>
      </div>

      {/* Health indicators */}
      <div className="px-5 pb-4">
        <p className="telemetry-label mb-2">Component Health</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(drone.health).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <HealthDot status={val} />
              <span className="text-xs text-text-secondary capitalize">{key.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats footer */}
      <div className="px-5 py-3 border-t border-white/6 flex items-center gap-6 bg-white/2">
        <div>
          <p className="telemetry-label">Missions</p>
          <p className="font-mono-data font-bold text-sm text-text-primary">{drone.total_missions}</p>
        </div>
        <div>
          <p className="telemetry-label">Flight Hours</p>
          <p className="font-mono-data font-bold text-sm text-text-primary">{drone.flight_hours} h</p>
        </div>
        <div>
          <p className="telemetry-label">Position</p>
          <p className="font-mono-data text-2xs text-text-muted">
            {drone.lat.toFixed(4)}, {drone.lng.toFixed(4)}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

export function AdminFleet() {
  const { drones } = useStore()

  const byStatus = {
    in_flight: drones.filter((d) => d.status === 'in_flight').length,
    available: drones.filter((d) => d.status === 'available').length,
    maintenance: drones.filter((d) => d.status === 'maintenance').length,
    returning: drones.filter((d) => d.status === 'returning').length,
  }

  return (
    <div className="p-5 flex flex-col gap-5">
      {/* Fleet summary */}
      <div>
        <h1 className="text-lg font-bold text-text-primary mb-1">Fleet Management</h1>
        <p className="text-xs text-text-secondary">{drones.length} drones total · MediHawk Autonomous Network</p>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'In Flight', value: byStatus.in_flight, color: 'text-crimson-light', bg: 'bg-crimson/8 border-crimson/20' },
          { label: 'Available', value: byStatus.available, color: 'text-med-green-light', bg: 'bg-med-green/8 border-med-green/20' },
          { label: 'Returning', value: byStatus.returning, color: 'text-amber-light', bg: 'bg-amber/8 border-amber/20' },
          { label: 'Maintenance', value: byStatus.maintenance, color: 'text-text-secondary', bg: 'bg-white/5 border-white/10' },
        ].map((stat) => (
          <div key={stat.label} className={`panel p-4 border ${stat.bg}`}>
            <div className={`font-mono-data font-black text-3xl ${stat.color}`}>{stat.value}</div>
            <div className="text-2xs text-text-muted uppercase tracking-wider mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Drone cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {drones.map((drone, i) => (
          <DroneCard key={drone.id} drone={drone} index={i} />
        ))}
      </div>
    </div>
  )
}
