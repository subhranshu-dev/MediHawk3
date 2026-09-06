import { clsx } from 'clsx'
import { motion } from 'framer-motion'

interface MetricDisplayProps {
  label: string
  value: string | number
  unit?: string
  sublabel?: string
  variant?: 'default' | 'safe' | 'warning' | 'critical'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  mono?: boolean
  className?: string
  animate?: boolean
}

export function MetricDisplay({
  label,
  value,
  unit,
  sublabel,
  variant = 'default',
  size = 'md',
  mono = true,
  className,
  animate = false,
}: MetricDisplayProps) {
  const valueColor = {
    default: 'text-text-primary',
    safe: 'text-med-green-light',
    warning: 'text-amber-light',
    critical: 'text-crimson-light',
  }[variant]

  const valueSize = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-6xl',
  }[size]

  return (
    <div className={clsx('flex flex-col gap-0.5', className)}>
      <span className="telemetry-label">{label}</span>
      <div className="flex items-baseline gap-1">
        {animate ? (
          <motion.span
            key={String(value)}
            initial={{ opacity: 0.6, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={clsx(valueSize, valueColor, mono && 'font-mono-data font-bold')}
          >
            {value}
          </motion.span>
        ) : (
          <span className={clsx(valueSize, valueColor, mono && 'font-mono-data font-bold')}>{value}</span>
        )}
        {unit && (
          <span className="text-text-secondary text-xs font-medium">{unit}</span>
        )}
      </div>
      {sublabel && <span className="text-2xs text-text-muted">{sublabel}</span>}
    </div>
  )
}

interface TelemetryCardProps {
  label: string
  value: string | number
  unit?: string
  variant?: 'default' | 'safe' | 'warning' | 'critical'
  icon?: React.ReactNode
  className?: string
}

export function TelemetryCard({ label, value, unit, variant = 'default', icon, className }: TelemetryCardProps) {
  return (
    <div className={clsx(
      'flex flex-col gap-1 px-3 py-2.5 rounded border',
      'bg-slate/40 border-white/8',
      className
    )}>
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-text-muted">{icon}</span>}
        <span className="telemetry-label">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={clsx(
          'font-mono-data font-bold text-xl',
          variant === 'default' && 'text-text-primary',
          variant === 'safe' && 'text-med-green-light',
          variant === 'warning' && 'text-amber-light',
          variant === 'critical' && 'text-crimson-light',
        )}>
          {value}
        </span>
        {unit && <span className="text-text-secondary text-xs">{unit}</span>}
      </div>
    </div>
  )
}
