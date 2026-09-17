import { clsx } from 'clsx'
import type { OrderStatus, DroneStatus, MissionStatus, AlertSeverity } from '@/types'

type BadgeVariant = 'safe' | 'warning' | 'critical' | 'info' | 'active' | 'muted'

interface StatusBadgeProps {
  variant: BadgeVariant
  label: string
  pulse?: boolean
  size?: 'xs' | 'sm' | 'md'
  icon?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  safe: 'bg-med-green-glow text-med-green-light border border-med-green/30',
  warning: 'bg-amber-glow text-amber-light border border-amber/30',
  critical: 'bg-crimson-glow text-crimson-light border border-crimson/30',
  info: 'bg-metal-500/20 text-metal-200 border border-metal-400/30',
  active: 'bg-crimson/10 text-red-400 border border-crimson/20',
  muted: 'bg-white/5 text-text-secondary border border-white/10',
}

export function StatusBadge({ variant, label, pulse = false, size = 'sm', icon }: StatusBadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 rounded font-semibold tracking-wide uppercase',
      variantStyles[variant],
      size === 'xs' && 'px-1.5 py-0.5 text-2xs',
      size === 'sm' && 'px-2 py-0.5 text-xs',
      size === 'md' && 'px-3 py-1 text-xs',
    )}>
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className={clsx(
            'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
            variant === 'safe' && 'bg-med-green-light',
            variant === 'warning' && 'bg-amber-light',
            variant === 'critical' && 'bg-crimson-light',
            (variant === 'active' || variant === 'info') && 'bg-metal-200',
          )} />
          <span className={clsx(
            'relative inline-flex rounded-full h-1.5 w-1.5',
            variant === 'safe' && 'bg-med-green',
            variant === 'warning' && 'bg-amber',
            variant === 'critical' && 'bg-crimson',
            (variant === 'active' || variant === 'info') && 'bg-metal-300',
          )} />
        </span>
      )}
      {icon && <span>{icon}</span>}
      {label}
    </span>
  )
}

export function orderStatusBadge(status: OrderStatus) {
  const map: Record<OrderStatus, { variant: BadgeVariant; label: string }> = {
    pending: { variant: 'warning', label: 'Pending' },
    approved: { variant: 'info', label: 'Approved' },
    preparing: { variant: 'info', label: 'Preparing' },
    launched: { variant: 'active', label: 'Launched' },
    in_flight: { variant: 'active', label: 'In Flight' },
    landing: { variant: 'active', label: 'Landing' },
    delivered: { variant: 'safe', label: 'Delivered' },
    verified: { variant: 'safe', label: 'Verified' },
    cancelled: { variant: 'muted', label: 'Cancelled' },
  }
  const cfg = map[status]
  if (!cfg) {
    if (import.meta.env.DEV) console.warn('[StatusBadge] Unknown order status:', status)
    return <StatusBadge variant="muted" label={String(status)} />
  }
  return <StatusBadge variant={cfg.variant} label={cfg.label} pulse={status === 'in_flight' || status === 'landing'} />
}

export function droneStatusBadge(status: DroneStatus) {
  const map: Record<DroneStatus, { variant: BadgeVariant; label: string }> = {
    available: { variant: 'safe', label: 'Available' },
    preparing: { variant: 'warning', label: 'Preparing' },
    in_flight: { variant: 'active', label: 'In Flight' },
    returning: { variant: 'info', label: 'Returning' },
    maintenance: { variant: 'warning', label: 'Maintenance' },
    offline: { variant: 'muted', label: 'Offline' },
  }
  const cfg = map[status]
  if (!cfg) {
    if (import.meta.env.DEV) console.warn('[StatusBadge] Unknown drone status:', status)
    return <StatusBadge variant="muted" label={String(status)} />
  }
  return <StatusBadge variant={cfg.variant} label={cfg.label} pulse={status === 'in_flight'} />
}

export function priorityBadge(priority: 'emergency' | 'urgent' | 'normal') {
  const map: Record<string, { variant: BadgeVariant; label: string }> = {
    emergency: { variant: 'critical', label: 'Emergency' },
    urgent: { variant: 'warning', label: 'Urgent' },
    normal: { variant: 'info', label: 'Normal' },
  }
  const cfg = map[priority]
  if (!cfg) {
    if (import.meta.env.DEV) console.warn('[StatusBadge] Unknown priority:', priority)
    return <StatusBadge variant="muted" label={String(priority)} />
  }
  return <StatusBadge variant={cfg.variant} label={cfg.label} />
}

export function alertSeverityBadge(severity: AlertSeverity) {
  const map: Record<AlertSeverity, { variant: BadgeVariant; label: string }> = {
    critical: { variant: 'critical', label: 'Critical' },
    warning: { variant: 'warning', label: 'Warning' },
    info: { variant: 'info', label: 'Info' },
  }
  const cfg = map[severity]
  if (!cfg) {
    if (import.meta.env.DEV) console.warn('[StatusBadge] Unknown alert severity:', severity)
    return <StatusBadge variant="muted" label={String(severity)} />
  }
  return <StatusBadge variant={cfg.variant} label={cfg.label} />
}
