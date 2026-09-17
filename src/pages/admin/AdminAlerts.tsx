import { motion, AnimatePresence } from 'framer-motion'
import { Bell, AlertTriangle, AlertCircle, Info, CheckCircle, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '@/store'
import { useToast } from '@/components/ui/Toast'
import { alertSeverityBadge } from '@/components/ui/StatusBadge'
import { adminService } from '@/services/api'
import { useAdminData } from '@/hooks/useAdminData'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import type { AlertSeverity } from '@/types'

function AlertCard({ alert, onAck, onResolve }: { alert: any; onAck: () => void; onResolve: () => void }) {
  const borderColor = alert.severity === 'critical' ? 'border-crimson/30 bg-crimson/5' :
    alert.severity === 'warning' ? 'border-amber/25 bg-amber/5' : 'border-white/10 bg-white/3'

  const Icon = alert.severity === 'critical' ? AlertCircle : alert.severity === 'warning' ? AlertTriangle : Info

  const iconColor = alert.severity === 'critical' ? 'text-crimson-light' :
    alert.severity === 'warning' ? 'text-amber-light' : 'text-metal-200'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
      className={clsx('panel p-5 border', borderColor, alert.acknowledged && 'opacity-50')}
    >
      <div className="flex items-start gap-4">
        <div className={clsx('mt-0.5 flex-shrink-0', iconColor)}>
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-bold text-text-primary">{alert.title}</span>
            {alertSeverityBadge(alert.severity)}
            {alert.acknowledged && (
              <span className="text-2xs text-med-green border border-med-green/25 bg-med-green-glow rounded px-1.5 py-0.5 font-bold uppercase">
                Acknowledged
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary mb-2">{alert.description}</p>
          <div className="flex items-start gap-1 text-xs text-amber-light">
            <span className="font-semibold flex-shrink-0">Action:</span>
            <span className="text-text-muted">{alert.recommended_action}</span>
          </div>
          <div className="flex items-center gap-4 mt-3 text-2xs text-text-muted">
            <span className="font-mono-data">{format(new Date(alert.timestamp), 'HH:mm:ss · MMM d')}</span>
            {alert.mission_id && <span>Mission: {alert.mission_id}</span>}
            {alert.drone_id && <span>Drone: {alert.drone_id}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          {!alert.acknowledged && (
            <button
              onClick={onAck}
              className="btn-ghost py-1 px-3 text-xs"
            >
              <CheckCircle size={13} />
              Acknowledge
            </button>
          )}
          <button
            onClick={onResolve}
            className="btn-ghost py-1 px-3 text-xs text-med-green hover:text-med-green-light"
          >
            <XCircle size={13} />
            Resolve
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export function AdminAlerts() {
  const { alerts, acknowledgeAlert } = useStore()
  const { toast } = useToast()
  const { refetch } = useAdminData()
  const [filter, setFilter] = useState<'all' | AlertSeverity>('all')

  const filtered = alerts.filter((a) => filter === 'all' || a.severity === filter)
  const unacked = alerts.filter((a) => !a.acknowledged).length
  const critical = alerts.filter((a) => a.severity === 'critical' && !a.acknowledged).length

  const handleAck = (id: string) => {
    acknowledgeAlert(id)   // optimistic update
    toast('info', 'Alert acknowledged', '')
    adminService.acknowledgeAlert(id).then(() => refetch()).catch(() => {/* already acknowledged locally */})
  }

  const handleResolve = (id: string) => {
    toast('info', 'Alert resolved', '')
    adminService.resolveAlert(id).then(() => refetch()).catch(() => {/* backend unavailable */})
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell size={18} className="text-text-secondary" />
            <div>
              <h1 className="text-lg font-bold text-text-primary">Alert Center</h1>
              <p className="text-xs text-text-secondary">
                {unacked} unacknowledged · {critical > 0 ? `${critical} critical` : 'No critical alerts'}
              </p>
            </div>
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            {(['all', 'critical', 'warning', 'info'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={clsx('px-3 py-1.5 rounded text-xs font-semibold capitalize transition-all',
                  filter === f ? (
                    f === 'critical' ? 'bg-crimson text-white' :
                    f === 'warning' ? 'bg-amber text-obsidian' :
                    f === 'info' ? 'bg-metal-300 text-obsidian' :
                    'bg-crimson text-white'
                  ) : 'bg-white/8 text-text-secondary hover:bg-white/12')}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Critical banner */}
        {critical > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 flex items-center gap-2 px-3 py-2 rounded bg-crimson/10 border border-crimson/30"
          >
            <AlertCircle size={14} className="text-crimson-light" />
            <span className="text-xs font-semibold text-crimson-light">
              {critical} critical alert{critical > 1 ? 's' : ''} require immediate attention
            </span>
          </motion.div>
        )}
      </div>

      {/* Alerts list */}
      <div className="flex-1 overflow-auto p-5">
        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {filtered.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-3 py-16 text-center">
                <CheckCircle size={40} className="text-med-green/40" />
                <div>
                  <p className="text-base font-semibold text-text-secondary">All Clear</p>
                  <p className="text-sm text-text-muted mt-1">No active alerts in this category</p>
                </div>
              </motion.div>
            ) : (
              filtered.map((alert) => (
                <AlertCard key={alert.id} alert={alert} onAck={() => handleAck(alert.id)} onResolve={() => handleResolve(alert.id)} />
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
