import { clsx } from 'clsx'
import { Wifi, WifiOff, Radio, AlertTriangle } from 'lucide-react'
import { useStore } from '@/store'

type ConnState = 'connected' | 'disconnected' | 'reconnecting' | 'degraded'

interface ConnectionIndicatorProps {
  label: string
  state: ConnState
  compact?: boolean
}

export function ConnectionIndicator({ label, state, compact = false }: ConnectionIndicatorProps) {
  const Icon = state === 'connected' ? Wifi
    : state === 'degraded' ? AlertTriangle
    : state === 'reconnecting' ? Radio
    : WifiOff

  const color = state === 'connected' ? 'text-med-green-light'
    : state === 'degraded' ? 'text-amber-light'
    : state === 'reconnecting' ? 'text-amber-light animate-pulse'
    : 'text-crimson-light'

  if (compact) {
    return (
      <div className="flex items-center gap-1" title={`${label}: ${state}`}>
        <Icon size={10} className={color} />
        <span className={clsx('text-2xs font-semibold uppercase tracking-wide', color)}>{label}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className={color} />
      <span className="text-xs text-text-secondary">{label}</span>
      <span className={clsx('text-xs font-semibold uppercase', color)}>{state}</span>
    </div>
  )
}

export function SystemStatusBar() {
  const { systemStatus, isDemo } = useStore()

  return (
    <div className="flex items-center gap-4 px-4 py-2" style={{ borderTop: '1px solid rgba(23,25,28,0.09)', background: 'rgba(236,235,230,0.70)', backdropFilter: 'blur(8px)' }}>
      <ConnectionIndicator label="Backend" state={systemStatus.backend} compact />
      <ConnectionIndicator label="WebSocket" state={systemStatus.websocket} compact />
      <ConnectionIndicator label="4G" state={systemStatus.fourG as ConnState} compact />
      <ConnectionIndicator label="ZeroTier" state={systemStatus.zerotier} compact />
      <div className="flex-1" />
      {isDemo && (
        <span className="text-2xs font-bold tracking-widest uppercase px-2 py-0.5 rounded"
          style={{ border: '1px solid rgba(224,107,16,0.28)', color: '#B85700', background: 'rgba(224,107,16,0.08)' }}>
          SIMULATION
        </span>
      )}
      <span className="text-2xs text-text-muted">
        {new Date(systemStatus.last_sync).toLocaleTimeString()}
      </span>
    </div>
  )
}
