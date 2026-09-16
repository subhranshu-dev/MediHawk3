import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { BrainCircuit, WifiOff } from 'lucide-react'
import { useStore } from '@/store'
import {
  hawkieAnswer,
  hawkieSituation,
  suggestedQuestions,
} from '@/services/hawkie'
import type { HawkieMessage, HawkieContext } from '@/services/hawkie'
import { ChatPanel } from '@/components/hawkie/HawkieFloat'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function SituationTile({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  value: number | string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="panel-elevated p-4 flex flex-col gap-1">
      <span className="telemetry-label">{label}</span>
      <span
        className={`font-mono-data font-black text-3xl ${accent ? 'text-crimson-light' : 'text-text-primary'}`}
      >
        {value}
      </span>
      {sub && <span className="text-2xs text-text-muted">{sub}</span>}
    </div>
  )
}

export function AdminHawkie() {
  const storeState = useStore()
  const [messages, setMessages] = useState<HawkieMessage[]>([])
  const [processing, setProcessing] = useState(false)

  const ctx: HawkieContext = {
    user: storeState.user,
    isDemo: storeState.isDemo,
    orders: storeState.orders,
    drones: storeState.drones,
    activeMission: storeState.activeMission,
    alerts: storeState.alerts,
    systemStatus: storeState.systemStatus,
  }

  const { orders, drones, alerts, isDemo, systemStatus, user } = storeState
  const offline = systemStatus.backend === 'disconnected'

  const activeMissionsCount = orders.filter((o) =>
    ['launched', 'in_flight', 'landing'].includes(o.status)
  ).length
  const pendingCount = orders.filter((o) => o.status === 'pending').length
  const unackedCount = alerts.filter((a) => !a.acknowledged).length
  const availableDrones = drones.filter((d) => d.status === 'available').length

  const situation = hawkieSituation(ctx)
  const suggested = suggestedQuestions(ctx)

  const pendingOrders = orders.filter((o) => o.status === 'pending')
  const critAlerts = alerts.filter((a) => a.severity === 'critical' && !a.acknowledged)
  const activeMissions = orders.filter((o) => ['launched', 'in_flight', 'landing'].includes(o.status))

  const handleSend = useCallback(
    async (text: string) => {
      const userMsg: HawkieMessage = {
        id: `${Date.now()}-u`,
        role: 'user',
        text,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg].slice(-50))
      setProcessing(true)

      await new Promise((res) => setTimeout(res, 600))

      const result = hawkieAnswer(text, ctx)
      const hawkMsg: HawkieMessage = {
        id: `${Date.now()}-h`,
        role: 'hawkie',
        text: result.text,
        cards: result.cards,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, hawkMsg].slice(-50))
      setProcessing(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx]
  )

  return (
    <div className="h-full flex flex-col gap-4 p-5 overflow-auto">
      {/* Offline banner */}
      {offline && (
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs"
          style={{
            background: 'rgba(217,139,36,0.12)',
            border: '1px solid rgba(217,139,36,0.25)',
            color: '#B87010',
          }}
        >
          <WifiOff size={14} />
          Live mission data unavailable. Hawkie is operating with last known state.
        </div>
      )}

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-1"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(198,40,50,0.12)', border: '1px solid rgba(198,40,50,0.3)' }}
          >
            <BrainCircuit size={16} style={{ color: '#C62832' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-text-primary uppercase">
                Hawkie
              </h1>
              <span className="text-xs text-text-muted">— Mission Intelligence</span>
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    background:
                      systemStatus.websocket === 'connected' ? '#1F9D68' : '#D98B24',
                  }}
                />
                <span className="text-2xs text-text-muted uppercase tracking-wide">
                  {systemStatus.websocket === 'connected' ? 'Live' : 'Degraded'}
                </span>
              </div>
              {isDemo && (
                <span
                  className="text-2xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                  style={{
                    background: 'rgba(217,139,36,0.14)',
                    color: '#D98B24',
                    border: '1px solid rgba(217,139,36,0.3)',
                  }}
                >
                  Demo
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary">
              {greeting()}, {user?.name ?? 'Admin'}. Monitoring your MediHawk operations.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Situation tiles */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <SituationTile
          label="Active Missions"
          value={activeMissionsCount}
          sub="launched / in flight"
          accent={activeMissionsCount > 0}
        />
        <SituationTile
          label="Pending Orders"
          value={pendingCount}
          sub="awaiting approval"
        />
        <SituationTile
          label="Unacked Alerts"
          value={unackedCount}
          sub={unackedCount > 0 ? `${critAlerts.length} critical` : 'all clear'}
          accent={unackedCount > 0}
        />
        <SituationTile
          label="Available Drones"
          value={availableDrones}
          sub={`of ${drones.length} total`}
        />
      </motion.div>

      {/* Two-column layout */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.10 }}
        className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 flex-1 min-h-0"
      >
        {/* Left: Assessment + Priority */}
        <div className="flex flex-col gap-4 overflow-auto">
          {/* Assessment */}
          <div className="panel p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <BrainCircuit size={13} style={{ color: '#C62832' }} />
              <span className="telemetry-label">Hawkie's Assessment</span>
            </div>
            <p
              className="text-xs leading-relaxed italic"
              style={{ color: 'rgba(23,35,43,0.75)' }}
            >
              {situation.replace(/\*\*/g, '').replace(/_/g, '').replace(/\(Simulation data\)/g, '').trim()}
            </p>
            {isDemo && (
              <span className="text-2xs text-text-muted">_(Simulation data)_</span>
            )}
          </div>

          {/* Priority attention */}
          <div className="panel p-4 flex flex-col gap-3">
            <span className="telemetry-label">Priority Attention</span>
            {pendingOrders.length === 0 && critAlerts.length === 0 && activeMissions.length === 0 ? (
              <p className="text-xs text-text-muted">No immediate action required.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {pendingOrders.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs"
                    style={{
                      background: 'rgba(198,40,50,0.06)',
                      border: '1px solid rgba(198,40,50,0.2)',
                      color: 'rgba(23,35,43,0.85)',
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: 'rgba(198,40,50,0.5)' }}
                    />
                    Review order: <strong>{o.id}</strong>
                    {o.priority === 'emergency' && (
                      <span
                        className="ml-auto text-2xs font-bold px-1 py-0.5 rounded uppercase"
                        style={{ background: 'rgba(198,40,50,0.15)', color: '#C62832' }}
                      >
                        Emergency
                      </span>
                    )}
                  </div>
                ))}
                {critAlerts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs"
                    style={{
                      background: 'rgba(198,40,50,0.06)',
                      border: '1px solid rgba(198,40,50,0.2)',
                      color: 'rgba(23,35,43,0.85)',
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: '#C62832' }}
                    />
                    {a.title}
                  </div>
                ))}
                {activeMissions.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs"
                    style={{
                      background: 'rgba(31,157,104,0.07)',
                      border: '1px solid rgba(31,157,104,0.22)',
                      color: 'rgba(23,35,43,0.85)',
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: '#1F9D68' }}
                    />
                    Mission in flight: <strong>{o.id}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Embedded chat */}
        <div className="flex flex-col min-h-0" style={{ minHeight: 480 }}>
          <ChatPanel
            embedded
            portal="admin"
            ctx={ctx}
            messages={messages}
            processing={processing}
            onSend={handleSend}
            suggested={suggested}
          />
        </div>
      </motion.div>
    </div>
  )
}
