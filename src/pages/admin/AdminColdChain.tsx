import { motion } from 'framer-motion'
import { Thermometer, CheckCircle, AlertTriangle, Clock, Package } from 'lucide-react'
import { useStore } from '@/store'
import { TemperatureChart } from '@/components/charts/TemperatureChart'
import { clsx } from 'clsx'
import { format } from 'date-fns'

const CHAIN_EVENTS = [
  { event: 'Payload loaded into cold box', status: 'complete', icon: '📦' },
  { event: 'Cold box sealed & QR tagged', status: 'complete', icon: '🔒' },
  { event: 'Mounted to Drone MH-D01', status: 'complete', icon: '🚁' },
  { event: 'Launched — in-transit', status: 'active', icon: '✈️' },
  { event: 'Arrived at PHC Chandaka', status: 'pending', icon: '📍' },
  { event: 'Receiver verification', status: 'pending', icon: '✅' },
]

export function AdminColdChain() {
  const { temperatureLogs, activeMission } = useStore()
  const temps = temperatureLogs.map(l => l.temperature)
  const currentTemp = temps[temps.length - 1] ?? 5.8
  const minTemp = Math.min(...temps)
  const maxTemp = Math.max(...temps)
  const excursions = temperatureLogs.filter(l => l.temperature < 2 || l.temperature > 8).length
  const tempSafe = currentTemp >= 2 && currentTemp <= 8

  return (
    <div className="p-5 flex flex-col gap-5 overflow-auto">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Cold-Chain Payload Monitoring</h1>
        <p className="text-xs text-text-secondary mt-0.5">
          {activeMission ? `Mission ${activeMission.id} · ${activeMission.medicine}` : 'No active cold-chain'}
        </p>
      </div>

      {/* Current temperature — hero metric */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className={clsx(
          'panel p-6 flex items-center gap-6',
          tempSafe ? 'border-med-green/20' : 'border-crimson/30'
        )}
      >
        <div className={clsx(
          'w-20 h-20 rounded-full border-4 flex items-center justify-center',
          tempSafe ? 'border-med-green bg-med-green/10' : 'border-crimson bg-crimson/10'
        )}>
          <Thermometer size={32} className={tempSafe ? 'text-med-green-light' : 'text-crimson-light'} />
        </div>
        <div className="flex-1">
          <p className="telemetry-label mb-1">Current Payload Temperature</p>
          <p className={clsx('font-mono-data font-black text-6xl leading-none', tempSafe ? 'text-med-green-light' : 'text-crimson-light')}>
            {currentTemp.toFixed(1)}<span className="text-2xl">°C</span>
          </p>
          <div className="flex items-center gap-3 mt-2">
            <span className={clsx(
              'text-xs font-bold px-2 py-0.5 rounded border uppercase tracking-wide',
              tempSafe ? 'text-med-green bg-med-green-glow border-med-green/30' : 'text-crimson bg-crimson-glow border-crimson/30'
            )}>
              {tempSafe ? '✓ SAFE' : '⚠ EXCURSION'}
            </span>
            <span className="text-xs text-text-muted">Safe range: 2–8°C</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6 text-center">
          {[
            { label: 'MIN', value: `${minTemp.toFixed(1)}°C`, color: 'text-med-green-light' },
            { label: 'MAX', value: `${maxTemp.toFixed(1)}°C`, color: maxTemp > 8 ? 'text-crimson-light' : 'text-text-primary' },
            { label: 'EXCURSIONS', value: excursions, color: excursions > 0 ? 'text-amber-light' : 'text-med-green-light' },
          ].map((m) => (
            <div key={m.label}>
              <p className="telemetry-label">{m.label}</p>
              <p className={clsx('font-mono-data font-bold text-xl', m.color)}>{m.value}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Chart */}
      <div className="panel p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">Temperature History</h3>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-px bg-med-green" />
              Safe zone 2–8°C
            </span>
          </div>
        </div>
        <TemperatureChart height={200} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Payload manifest */}
        <div className="panel">
          <div className="px-5 py-3 border-b border-white/6">
            <h3 className="text-sm font-semibold text-text-primary">Payload Manifest</h3>
          </div>
          <div className="p-5 flex flex-col gap-3">
            {[
              { label: 'Medicine', value: activeMission?.medicine ?? 'Polyvalent Antivenin' },
              { label: 'Quantity', value: `${activeMission?.quantity ?? 2} vials` },
              { label: 'Required Range', value: '2–8°C' },
              { label: 'Expiry', value: '2027-03-15' },
              { label: 'Lot Number', value: 'AV-2026-Lot-09' },
              { label: 'Cold Box ID', value: 'CB-MH-008' },
            ].map((r) => (
              <div key={r.label} className="flex justify-between text-xs">
                <span className="text-text-muted">{r.label}</span>
                <span className="text-text-primary font-medium">{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chain of custody */}
        <div className="panel">
          <div className="px-5 py-3 border-b border-white/6">
            <h3 className="text-sm font-semibold text-text-primary">Chain of Custody</h3>
          </div>
          <div className="p-5 flex flex-col gap-3">
            {CHAIN_EVENTS.map((evt, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={clsx(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs border',
                  evt.status === 'complete' ? 'bg-med-green/15 border-med-green/30 text-med-green-light' :
                  evt.status === 'active' ? 'bg-crimson/15 border-crimson/30 text-crimson-light' :
                  'bg-white/5 border-white/10 text-text-muted'
                )}>
                  {evt.status === 'complete' ? '✓' : evt.status === 'active' ? '→' : '○'}
                </div>
                <span className={clsx('text-xs', evt.status === 'pending' ? 'text-text-muted' : 'text-text-primary')}>
                  {evt.event}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Temperature log table */}
      <div className="panel">
        <div className="px-5 py-3 border-b border-white/6">
          <h3 className="text-sm font-semibold text-text-primary">Recent Temperature Log</h3>
        </div>
        <div className="overflow-auto max-h-48">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/6">
                <th className="px-5 py-2 text-left text-2xs text-text-muted uppercase tracking-wider">Time</th>
                <th className="px-5 py-2 text-left text-2xs text-text-muted uppercase tracking-wider">Temperature</th>
                <th className="px-5 py-2 text-left text-2xs text-text-muted uppercase tracking-wider">Status</th>
                <th className="px-5 py-2 text-left text-2xs text-text-muted uppercase tracking-wider">Event</th>
              </tr>
            </thead>
            <tbody>
              {[...temperatureLogs].reverse().slice(0, 15).map((log, i) => {
                const safe = log.temperature >= 2 && log.temperature <= 8
                return (
                  <tr key={i} className="border-b border-white/4 hover:bg-white/2">
                    <td className="px-5 py-2 font-mono-data text-text-muted">{format(new Date(log.timestamp), 'HH:mm:ss')}</td>
                    <td className={clsx('px-5 py-2 font-mono-data font-bold', safe ? 'text-med-green-light' : 'text-crimson-light')}>
                      {log.temperature.toFixed(1)}°C
                    </td>
                    <td className="px-5 py-2">
                      <span className={clsx('text-2xs font-bold uppercase', safe ? 'text-med-green' : 'text-crimson')}>
                        {safe ? 'SAFE' : 'EXCURSION'}
                      </span>
                    </td>
                    <td className="px-5 py-2 text-text-muted">{log.event ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
