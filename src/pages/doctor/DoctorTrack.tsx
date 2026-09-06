import React, { Suspense, lazy } from 'react'
import { motion } from 'framer-motion'
import { Thermometer, Battery, Navigation, Wifi, Clock, RefreshCw } from 'lucide-react'
import { useStore } from '@/store'
import { OrderTimeline } from '@/components/mission/MissionTimeline'
import { TemperatureChart } from '@/components/charts/TemperatureChart'
import { orderStatusBadge, priorityBadge } from '@/components/ui/StatusBadge'
import { format } from 'date-fns'

const MissionMap = lazy<React.FC<{ height?: number; followDrone?: boolean }>>(() =>
  import('@/components/map/MissionMap').then(m => ({ default: m.MissionMap }))
)

export function DoctorTrack() {
  const { orders, user, drones, activeMission, temperatureLogs } = useStore()
  const myOrders = orders.filter((o) => o.doctor_id === user?.id)
  const activeOrder = myOrders.find((o) => ['in_flight', 'launched', 'preparing', 'approved', 'pending'].includes(o.status))
    ?? myOrders[0]

  const drone = activeOrder?.drone_id ? drones.find(d => d.id === activeOrder.drone_id) : drones.find(d => d.status === 'in_flight')
  const lastTemp = temperatureLogs[temperatureLogs.length - 1]?.temperature ?? 5.8
  const tempSafe = lastTemp >= 2 && lastTemp <= 8

  if (!activeOrder) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Navigation size={40} className="text-text-muted" />
        <div className="text-center">
          <h2 className="text-lg font-bold text-text-primary">No Active Delivery</h2>
          <p className="text-sm text-text-secondary mt-1">Your next order will appear here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Live Delivery</h1>
            <p className="font-mono-data text-xs text-text-muted mt-0.5">{activeOrder.id}</p>
          </div>
          <div className="flex items-center gap-2">
            {priorityBadge(activeOrder.priority)}
            {orderStatusBadge(activeOrder.status)}
          </div>
        </div>
      </motion.div>

      {/* Medicine info */}
      <div className="panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-text-primary">{activeOrder.medicine}</p>
            <p className="text-xs text-text-secondary">{activeOrder.quantity} {activeOrder.unit} · {activeOrder.destination_name}</p>
          </div>
          {activeMission?.eta_minutes !== undefined && activeMission.eta_minutes > 0 && (
            <div className="text-right">
              <p className="telemetry-label">ETA</p>
              <p className="font-mono-data font-bold text-xl text-med-green-light">{activeMission.eta_minutes} min</p>
            </div>
          )}
          {activeOrder.status === 'delivered' && (
            <div className="text-right">
              <p className="telemetry-label">Delivered</p>
              <p className="font-mono-data font-bold text-base text-med-green-light">
                {activeOrder.delivery_time_minutes ? `${activeOrder.delivery_time_minutes} min` : 'Now'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Status timeline */}
      <div className="panel p-4 overflow-x-auto">
        <OrderTimeline orderStatus={activeOrder.status} />
      </div>

      {/* Live map */}
      {activeMission && (
        <div className="rounded-lg overflow-hidden border border-white/8">
          <Suspense fallback={
            <div className="h-[240px] bg-graphite flex items-center justify-center">
              <p className="text-text-muted text-xs">Loading map…</p>
            </div>
          }>
            <MissionMap height={240} followDrone />
          </Suspense>
        </div>
      )}

      {/* Telemetry strip */}
      {drone && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="grid grid-cols-2 gap-2"
        >
          {[
            { label: 'ALT', value: `${drone.altitude}`, unit: 'm', Icon: Navigation },
            { label: 'SPEED', value: `${drone.speed}`, unit: 'km/h', Icon: Navigation },
            { label: 'BATTERY', value: `${drone.battery.toFixed(0)}`, unit: '%', Icon: Battery },
            { label: 'TEMP', value: `${drone.temperature}`, unit: '°C', Icon: Thermometer },
          ].map((item) => (
            <div key={item.label} className="panel p-3 flex items-center gap-3">
              <item.Icon size={14} className="text-text-muted flex-shrink-0" />
              <div>
                <div className="telemetry-label">{item.label}</div>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono-data font-bold text-lg text-text-primary">{item.value}</span>
                  <span className="text-2xs text-text-secondary">{item.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Connection status */}
      {drone && (
        <div className="panel p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi size={14} className={drone.connection === 'stable' ? 'text-med-green-light' : 'text-amber-light'} />
            <span className="text-xs text-text-secondary">4G LINK</span>
            <span className={`text-xs font-bold uppercase ${drone.connection === 'stable' ? 'text-med-green-light' : 'text-amber-light'}`}>
              {drone.connection}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <RefreshCw size={11} />
            <span className="font-mono-data">2 sec ago</span>
          </div>
        </div>
      )}

      {/* Temperature chart */}
      <div className="panel p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Thermometer size={14} className={tempSafe ? 'text-med-green-light' : 'text-crimson-light'} />
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Payload Temperature</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-mono-data font-bold text-lg ${tempSafe ? 'text-med-green-light' : 'text-crimson-light'}`}>
              {lastTemp.toFixed(1)}°C
            </span>
            <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${tempSafe ? 'text-med-green bg-med-green-glow border border-med-green/30' : 'text-crimson bg-crimson-glow border border-crimson/30'}`}>
              {tempSafe ? 'SAFE' : 'WARNING'}
            </span>
          </div>
        </div>
        <p className="text-2xs text-text-muted mb-2">Safe range: 2–8°C</p>
        <TemperatureChart height={120} />
      </div>

      {/* Order info */}
      <div className="panel p-4 text-xs">
        <div className="flex items-center gap-1.5 mb-3 text-text-muted">
          <Clock size={12} />
          <span className="uppercase tracking-wider font-semibold">Timeline</span>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between">
            <span className="text-text-muted">Ordered</span>
            <span className="font-mono-data text-text-primary">{format(new Date(activeOrder.ordered_at), 'HH:mm:ss')}</span>
          </div>
          {activeOrder.launched_at && (
            <div className="flex justify-between">
              <span className="text-text-muted">Launched</span>
              <span className="font-mono-data text-text-primary">{format(new Date(activeOrder.launched_at), 'HH:mm:ss')}</span>
            </div>
          )}
          {activeOrder.delivered_at && (
            <div className="flex justify-between">
              <span className="text-text-muted">Delivered</span>
              <span className="font-mono-data text-med-green-light">{format(new Date(activeOrder.delivered_at), 'HH:mm:ss')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
