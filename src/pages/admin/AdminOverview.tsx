import React, { Suspense, lazy } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Navigation, Package, Cpu, AlertTriangle,
  ArrowRight, Thermometer, Battery, Wifi, Clock, Activity
} from 'lucide-react'
import { useStore } from '@/store'
import { orderStatusBadge, priorityBadge, droneStatusBadge, alertSeverityBadge } from '@/components/ui/StatusBadge'
import { BatteryIndicator } from '@/components/ui/BatteryIndicator'
import { format } from 'date-fns'

const MissionMap = lazy<React.FC<{ height?: number; followDrone?: boolean }>>(() =>
  import('@/components/map/MissionMap').then(m => ({ default: m.MissionMap }))
)

function MetricBox({ label, value, sub, accent = false }: {
  label: string; value: string | number; sub?: string; accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 panel-elevated p-4">
      <span className="telemetry-label">{label}</span>
      <span className={`font-mono-data font-black text-3xl ${accent ? 'text-crimson-light' : 'text-text-primary'}`}>
        {value}
      </span>
      {sub && <span className="text-2xs text-text-muted">{sub}</span>}
    </div>
  )
}

export function AdminOverview() {
  const { orders, drones, alerts, activeMission, temperatureLogs } = useStore()
  const navigate = useNavigate()

  const pendingOrders = orders.filter((o) => o.status === 'pending')
  const activeOrders = orders.filter((o) => ['in_flight', 'launched', 'preparing', 'approved'].includes(o.status))
  const availableDrones = drones.filter((d) => d.status === 'available').length
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical' && !a.acknowledged).length
  const unacknowledged = alerts.filter((a) => !a.acknowledged).length
  const flyingDrone = drones.find((d) => d.status === 'in_flight')
  const lastTemp = temperatureLogs[temperatureLogs.length - 1]?.temperature ?? 5.8
  const tempSafe = lastTemp >= 2 && lastTemp <= 8

  return (
    <div className="h-full flex flex-col gap-4 p-5 overflow-auto">
      {/* Top metrics row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <MetricBox label="Active Deliveries" value={activeOrders.length} sub="in flight / preparing" accent />
        <MetricBox label="Pending Orders" value={pendingOrders.length} sub="awaiting approval" />
        <MetricBox label="Available Drones" value={availableDrones} sub={`of ${drones.length} total`} />
        <MetricBox label="Critical Alerts" value={criticalAlerts} sub={`${unacknowledged} unacknowledged`} accent={criticalAlerts > 0} />
      </motion.div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Left: Live map (spans 2 cols) */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          {/* Map */}
          <div className="panel overflow-hidden flex-1 min-h-[300px]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-crimson-light" />
                <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">Live Operational Map</span>
              </div>
              {activeMission && (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-crimson" />
                  </span>
                  MH-D01 · IN FLIGHT
                </div>
              )}
            </div>
            <Suspense fallback={<div className="h-[300px] bg-graphite flex items-center justify-center text-text-muted text-xs">Loading map…</div>}>
              <MissionMap height={320} followDrone />
            </Suspense>

            {/* Mission quick-stats below map */}
            {flyingDrone && (
              <div className="px-4 py-3 border-t border-white/6 flex items-center gap-6 flex-wrap">
                {[
                  { label: 'ALT', value: `${flyingDrone.altitude} m` },
                  { label: 'SPEED', value: `${flyingDrone.speed} km/h` },
                  { label: 'ETA', value: activeMission ? `${activeMission.eta_minutes} min` : '—' },
                  { label: 'DISTANCE', value: activeMission ? `${activeMission.distance_km} km` : '—' },
                ].map((t) => (
                  <div key={t.label}>
                    <div className="telemetry-label">{t.label}</div>
                    <div className="font-mono-data font-bold text-sm text-text-primary">{t.value}</div>
                  </div>
                ))}
                <div className="ml-auto">
                  <BatteryIndicator level={flyingDrone.battery} size="sm" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Thermometer size={12} className={tempSafe ? 'text-med-green-light' : 'text-crimson-light'} />
                  <span className={`font-mono-data font-bold text-sm ${tempSafe ? 'text-med-green-light' : 'text-crimson-light'}`}>
                    {lastTemp.toFixed(1)}°C
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Active missions row */}
          <div className="panel">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
              <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">Active Missions</span>
              <button onClick={() => navigate('/admin/missions')} className="btn-ghost text-xs py-1">
                View all <ArrowRight size={11} />
              </button>
            </div>
            {activeOrders.length === 0 ? (
              <p className="text-xs text-text-muted px-4 py-6 text-center">No active missions</p>
            ) : (
              <div className="divide-y divide-white/6">
                {activeOrders.map((order) => (
                  <div key={order.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{order.medicine}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono-data text-2xs text-text-muted">{order.id}</span>
                        <span className="text-2xs text-text-muted">→ {order.destination_name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {priorityBadge(order.priority)}
                      {orderStatusBadge(order.status)}
                    </div>
                    <button onClick={() => navigate('/admin/missions')} className="btn-ghost py-1 px-2 text-xs">
                      <ArrowRight size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Incoming orders */}
          <div className="panel flex-1">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
              <div className="flex items-center gap-2">
                <Package size={13} className="text-amber-light" />
                <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">Pending Orders</span>
                {pendingOrders.length > 0 && (
                  <span className="w-5 h-5 rounded-full bg-amber text-obsidian text-2xs font-bold flex items-center justify-center">
                    {pendingOrders.length}
                  </span>
                )}
              </div>
              <button onClick={() => navigate('/admin/orders')} className="btn-ghost text-xs py-1">
                All <ArrowRight size={11} />
              </button>
            </div>
            {pendingOrders.length === 0 ? (
              <p className="text-xs text-text-muted px-4 py-6 text-center">No pending orders</p>
            ) : (
              <div className="divide-y divide-white/6">
                {pendingOrders.slice(0, 4).map((order) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                    className="px-4 py-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-text-primary">{order.medicine}</span>
                      {priorityBadge(order.priority)}
                    </div>
                    <p className="text-2xs text-text-muted">{order.quantity} {order.unit} · {order.destination_name}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-2xs font-mono-data text-text-muted">
                        {format(new Date(order.ordered_at), 'HH:mm:ss')}
                      </span>
                      <button
                        onClick={() => navigate(`/admin/orders?review=${order.id}`)}
                        className="text-xs text-crimson hover:text-crimson-light transition-colors font-semibold"
                      >
                        REVIEW →
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Fleet status */}
          <div className="panel">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
              <div className="flex items-center gap-2">
                <Cpu size={13} className="text-text-secondary" />
                <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">Fleet</span>
              </div>
              <button onClick={() => navigate('/admin/fleet')} className="btn-ghost text-xs py-1">
                Manage <ArrowRight size={11} />
              </button>
            </div>
            <div className="divide-y divide-white/6">
              {drones.map((drone) => (
                <div key={drone.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text-primary">{drone.name}</p>
                    <p className="text-2xs text-text-muted font-mono-data">{drone.id}</p>
                  </div>
                  <BatteryIndicator level={drone.battery} size="sm" showLabel={false} className="w-12" />
                  <span className="font-mono-data text-2xs text-text-muted">{drone.battery.toFixed(0)}%</span>
                  {droneStatusBadge(drone.status)}
                </div>
              ))}
            </div>
          </div>

          {/* Recent alerts */}
          <div className="panel">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
              <div className="flex items-center gap-2">
                <AlertTriangle size={13} className="text-amber-light" />
                <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">Alerts</span>
                {unacknowledged > 0 && (
                  <span className="w-5 h-5 rounded-full bg-crimson text-white text-2xs font-bold flex items-center justify-center">
                    {unacknowledged}
                  </span>
                )}
              </div>
              <button onClick={() => navigate('/admin/alerts')} className="btn-ghost text-xs py-1">
                All <ArrowRight size={11} />
              </button>
            </div>
            <div className="divide-y divide-white/6">
              {alerts.filter(a => !a.acknowledged).slice(0, 3).map((alert) => (
                <div key={alert.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold text-text-primary">{alert.title}</span>
                    {alertSeverityBadge(alert.severity)}
                  </div>
                  <p className="text-2xs text-text-muted">{alert.description.substring(0, 60)}…</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
