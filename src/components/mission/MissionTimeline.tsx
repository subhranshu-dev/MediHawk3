import { clsx } from 'clsx'
import { CheckCircle, Circle, Loader2, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import type { MissionEvent, MissionWaypoint } from '@/types'
import { useStore } from '@/store'

interface TimelineStep {
  label: string
  status: 'completed' | 'active' | 'pending'
  time?: string
}

export function OrderTimeline({ orderStatus }: { orderStatus: string }) {
  const steps: TimelineStep[] = [
    { label: 'Order Placed', status: orderStatus !== 'pending' ? 'completed' : 'active' },
    { label: 'Mission Approved', status: ['approved', 'preparing', 'launched', 'in_flight', 'landing', 'delivered', 'verified'].includes(orderStatus) ? 'completed' : orderStatus === 'pending' ? 'pending' : 'active' },
    { label: 'Drone Launched', status: ['in_flight', 'landing', 'delivered', 'verified'].includes(orderStatus) ? 'completed' : ['launched', 'preparing'].includes(orderStatus) ? 'active' : 'pending' },
    { label: 'In Flight', status: ['landing', 'delivered', 'verified'].includes(orderStatus) ? 'completed' : orderStatus === 'in_flight' ? 'active' : 'pending' },
    { label: 'Landed', status: ['delivered', 'verified'].includes(orderStatus) ? 'completed' : orderStatus === 'landing' ? 'active' : 'pending' },
    { label: 'Delivered', status: orderStatus === 'verified' ? 'completed' : orderStatus === 'delivered' ? 'active' : 'pending' },
  ]

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={clsx(
              'w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all',
              step.status === 'completed' && 'bg-med-green/20 border-med-green text-med-green-light',
              step.status === 'active' && 'bg-crimson/20 border-crimson text-crimson-light',
              step.status === 'pending' && 'bg-white/5 border-white/15 text-text-muted',
            )}>
              {step.status === 'completed' && <CheckCircle size={12} />}
              {step.status === 'active' && <Loader2 size={12} className="animate-spin" />}
              {step.status === 'pending' && <Circle size={10} />}
            </div>
            <span className={clsx(
              'text-2xs text-center whitespace-nowrap font-medium',
              step.status === 'completed' && 'text-med-green',
              step.status === 'active' && 'text-crimson-light',
              step.status === 'pending' && 'text-text-muted',
            )}>
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={clsx(
              'h-px w-8 mx-1 -mt-5',
              steps[i + 1].status !== 'pending' || step.status === 'completed' ? 'bg-med-green/40' : 'bg-white/10'
            )} />
          )}
        </div>
      ))}
    </div>
  )
}

export function MissionEventLog({ events }: { events: MissionEvent[] }) {
  return (
    <div className="flex flex-col gap-2">
      {[...events].reverse().map((evt, i) => (
        <div key={i} className={clsx(
          'flex items-start gap-3 px-3 py-2 rounded border',
          evt.type === 'success' && 'bg-med-green/5 border-med-green/15',
          evt.type === 'warning' && 'bg-amber-glow border-amber/20',
          evt.type === 'critical' && 'bg-crimson-glow border-crimson/20',
          evt.type === 'info' && 'bg-white/3 border-white/8',
        )}>
          <span className={clsx(
            'mt-0.5 flex-shrink-0',
            evt.type === 'success' && 'text-med-green-light',
            evt.type === 'warning' && 'text-amber-light',
            evt.type === 'critical' && 'text-crimson-light',
            evt.type === 'info' && 'text-text-muted',
          )}>
            {evt.type === 'warning' || evt.type === 'critical'
              ? <AlertTriangle size={12} />
              : <CheckCircle size={12} />
            }
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-primary">{evt.event}</p>
            <p className="text-2xs text-text-muted font-mono-data mt-0.5">
              {format(new Date(evt.timestamp), 'HH:mm:ss')}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function WaypointProgress() {
  const { activeMission } = useStore()
  if (!activeMission) return null

  return (
    <div className="flex flex-col gap-2">
      {(activeMission.waypoints ?? []).map((wp) => (
        <div key={wp.index} className="flex items-center gap-3">
          <div className={clsx(
            'w-5 h-5 rounded-full flex items-center justify-center border flex-shrink-0',
            wp.reached ? 'bg-med-green/20 border-med-green text-med-green-light' : 'bg-white/5 border-white/15 text-text-muted'
          )}>
            {wp.reached ? <CheckCircle size={11} /> : <Circle size={9} />}
          </div>
          <div className="flex-1 min-w-0">
            <span className={clsx('text-xs font-medium', wp.reached ? 'text-text-primary' : 'text-text-muted')}>
              {wp.label}
            </span>
          </div>
          <span className="text-2xs text-text-muted font-mono-data">
            {wp.reached_at ? format(new Date(wp.reached_at), 'HH:mm:ss') : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}
