import { clsx } from 'clsx'

interface BatteryIndicatorProps {
  level: number
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function BatteryIndicator({ level, showLabel = true, size = 'md', className }: BatteryIndicatorProps) {
  const color = level > 50 ? 'bg-med-green' : level > 20 ? 'bg-amber' : 'bg-crimson'
  const textColor = level > 50 ? 'text-med-green-light' : level > 20 ? 'text-amber-light' : 'text-crimson-light'

  const barH = size === 'sm' ? 'h-1' : size === 'md' ? 'h-1.5' : 'h-2'
  const w = size === 'sm' ? 'w-16' : size === 'md' ? 'w-20' : 'w-28'

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div className={clsx('relative rounded-sm overflow-hidden bg-white/10', w, barH)}>
        <div
          className={clsx('h-full rounded-sm transition-all duration-1000', color)}
          style={{ width: `${level}%` }}
        />
      </div>
      {showLabel && (
        <span className={clsx('font-mono-data font-bold text-sm', textColor)}>{level.toFixed(0)}%</span>
      )}
    </div>
  )
}
