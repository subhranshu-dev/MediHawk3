import { clsx } from 'clsx'

interface MediHawkLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  mono?: boolean
}

export function MediHawkLogo({ size = 'md', className, mono = false }: MediHawkLogoProps) {
  const textSize = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
    xl: 'text-3xl',
  }[size]

  const iconSize = {
    sm: 18,
    md: 24,
    lg: 32,
    xl: 44,
  }[size]

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      {/* Hawk icon mark */}
      <div className="relative flex-shrink-0">
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Cross / medical mark */}
          <rect x="18" y="6" width="8" height="32" rx="1.5" fill={mono ? '#EDF0F7' : '#DC2626'} opacity={mono ? 0.9 : 1} />
          <rect x="6" y="18" width="32" height="8" rx="1.5" fill={mono ? '#EDF0F7' : '#DC2626'} opacity={mono ? 0.9 : 1} />
          {/* Hawk wing marks */}
          <path d="M4 22 L14 14 L14 18 L22 22 L14 26 L14 30 Z" fill={mono ? '#8892A8' : '#475569'} opacity="0.7" />
          <path d="M40 22 L30 14 L30 18 L22 22 L30 26 L30 30 Z" fill={mono ? '#8892A8' : '#475569'} opacity="0.7" />
        </svg>
      </div>

      <div className="flex flex-col leading-none">
        <span className={clsx(
          'font-bold tracking-widest uppercase',
          textSize,
          mono ? 'text-text-primary' : 'text-text-primary'
        )}>
          MEDI<span className={mono ? 'text-text-secondary' : 'text-crimson'}>HAWK</span>
        </span>
        {(size === 'lg' || size === 'xl') && (
          <span className="text-2xs text-text-muted tracking-widest uppercase mt-0.5">
            Autonomous Medical Delivery
          </span>
        )}
      </div>
    </div>
  )
}
