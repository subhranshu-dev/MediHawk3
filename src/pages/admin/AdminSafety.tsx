import { motion } from 'framer-motion'
import { Shield, CheckCircle, AlertTriangle, Activity, Cpu, Wifi, Wind, Navigation } from 'lucide-react'
import { useStore } from '@/store'
import { clsx } from 'clsx'
import { format } from 'date-fns'

const SAFETY_CHECKS = [
  { id: 'gps', label: 'GPS Signal', status: 'pass', detail: 'Accuracy: 1.2 m HDOP · Satellites: 14', icon: Navigation },
  { id: 'battery', label: 'Battery Level', status: 'pass', detail: '78% · Above minimum threshold (20%)', icon: Activity },
  { id: 'weather', label: 'Weather Clearance', status: 'pass', detail: 'Wind: 12 km/h · Below limit (40 km/h)', icon: Wind },
  { id: 'network', label: 'Network Link', status: 'pass', detail: '4G stable · Latency: 48 ms', icon: Wifi },
  { id: 'obstacle', label: 'Obstacle Detection', status: 'pass', detail: 'Forward LiDAR active · Clear corridor', icon: Shield },
  { id: 'autonomy', label: 'Autonomy Stack', status: 'active', detail: 'Flight controller online · Mission computer nominal', icon: Cpu },
]

const AI_EVENTS = [
  { time: '14:35:06', event: 'Mission corridor restored — obstacle cleared', type: 'success' },
  { time: '14:35:05', event: 'Avoidance trajectory calculated — deviation: 12 m', type: 'warning' },
  { time: '14:35:04', event: 'Obstacle detected at bearing 030° — range: 28 m', type: 'warning' },
  { time: '14:34:22', event: 'Route corridor verified — no obstacles detected', type: 'success' },
  { time: '14:33:18', event: 'Pre-flight AI risk assessment: LOW', type: 'success' },
  { time: '14:33:10', event: 'Weather model updated — conditions nominal', type: 'info' },
  { time: '14:32:55', event: 'GPS signal locked · RTK precision mode', type: 'success' },
  { time: '14:32:45', event: 'Battery health checked · Estimated range: 22 km', type: 'info' },
  { time: '14:32:30', event: 'Mission risk score computed: 12/100 (LOW)', type: 'success' },
]

export function AdminSafety() {
  const { drones, activeMission } = useStore()
  const flyingDrone = drones.find(d => d.status === 'in_flight')
  const missionHealthScore = 92

  return (
    <div className="p-5 flex flex-col gap-5 overflow-auto">
      <div>
        <h1 className="text-lg font-bold text-text-primary">AI Flight Safety</h1>
        <p className="text-xs text-text-secondary mt-0.5">
          Autonomous safety intelligence · {activeMission ? `Mission ${activeMission.id}` : 'No active mission'}
        </p>
      </div>

      {/* Mission Health Score */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="panel p-6 flex items-center gap-8"
      >
        {/* Score ring */}
        <div className="relative w-28 h-28 flex-shrink-0">
          <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
            <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
            <circle
              cx="56" cy="56" r="48" fill="none"
              stroke={missionHealthScore > 80 ? '#16A34A' : missionHealthScore > 50 ? '#D97706' : '#DC2626'}
              strokeWidth="8"
              strokeDasharray={`${(missionHealthScore / 100) * 301.6} 301.6`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono-data font-black text-3xl text-text-primary">{missionHealthScore}</span>
            <span className="text-2xs text-text-muted">/100</span>
          </div>
        </div>

        <div className="flex-1">
          <p className="telemetry-label mb-1">Mission Health Score</p>
          <p className="text-xl font-bold text-med-green-light">NOMINAL</p>
          <p className="text-xs text-text-muted mt-1">All critical safety parameters within bounds. Autonomy stack operating normally.</p>
          <div className="flex items-center gap-3 mt-3">
            <span className="badge-safe">LOW RISK</span>
            <span className="text-2xs text-text-muted">Obstacle avoidance · ACTIVE</span>
          </div>
        </div>

        <div className="text-right">
          <p className="telemetry-label">Autonomy</p>
          <p className="text-med-green-light font-bold text-sm">ACTIVE</p>
          <p className="telemetry-label mt-3">Mode</p>
          <p className="text-text-primary text-sm font-semibold">AUTO MISSION</p>
        </div>
      </motion.div>

      {/* Checks grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {SAFETY_CHECKS.map((check, i) => (
          <motion.div
            key={check.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className={clsx(
              'panel p-4 border',
              check.status === 'pass' ? 'border-med-green/15' :
              check.status === 'active' ? 'border-amber/20' :
              'border-crimson/20'
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <check.icon size={14} className={
                  check.status === 'pass' ? 'text-med-green-light' :
                  check.status === 'active' ? 'text-amber-light' : 'text-crimson-light'
                } />
                <span className="text-xs font-semibold text-text-primary">{check.label}</span>
              </div>
              <span className={clsx(
                'text-2xs font-bold uppercase px-1.5 py-0.5 rounded',
                check.status === 'pass' ? 'text-med-green bg-med-green-glow border border-med-green/25' :
                check.status === 'active' ? 'text-amber bg-amber-glow border border-amber/25' :
                'text-crimson bg-crimson-glow border border-crimson/25'
              )}>
                {check.status === 'pass' ? 'PASS' : check.status === 'active' ? 'ACTIVE' : 'FAIL'}
              </span>
            </div>
            <p className="text-2xs text-text-muted">{check.detail}</p>
          </motion.div>
        ))}
      </div>

      {/* Event stream */}
      <div className="panel">
        <div className="px-5 py-3 border-b border-white/6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={13} className="text-text-secondary" />
            <h3 className="text-sm font-semibold text-text-primary">AI Safety Event Stream</h3>
          </div>
          <span className="text-2xs text-amber font-bold px-2 py-0.5 rounded border border-amber/25 bg-amber-glow">
            SIMULATION MODE
          </span>
        </div>
        <div className="p-4 flex flex-col gap-2 max-h-80 overflow-auto">
          {AI_EVENTS.map((evt, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className={clsx(
                'flex items-start gap-3 px-3 py-2 rounded border',
                evt.type === 'success' ? 'bg-med-green/5 border-med-green/15' :
                evt.type === 'warning' ? 'bg-amber/8 border-amber/20' :
                'bg-white/3 border-white/8'
              )}
            >
              <span className={clsx(
                'text-2xs font-mono-data mt-0.5 flex-shrink-0',
                evt.type === 'success' ? 'text-med-green' : evt.type === 'warning' ? 'text-amber' : 'text-text-muted'
              )}>
                {evt.time}
              </span>
              <p className="text-xs text-text-primary">{evt.event}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
