import React, { Suspense, lazy } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Package, Navigation, ShieldCheck, Clock } from 'lucide-react'
import { MediHawkLogo } from '@/components/ui/MediHawkLogo'
import { HERO_STATS } from '@/data/mockData'
import { useStore } from '@/store'
import { DroneShowcase } from '@/components/drone/DroneShowcase'

const DroneScene3D = lazy<React.FC<{ height?: number; className?: string }>>(() =>
  import('@/components/drone/DroneScene3D').then(m => ({ default: m.DroneScene3D }))
)

const STATS = [
  { value: HERO_STATS.deliveries_today, unit: '', label: 'Deliveries Today', icon: Package },
  { value: HERO_STATS.drones_active, unit: '', label: 'Drones Active', icon: Navigation },
  { value: `${HERO_STATS.avg_delivery_min}`, unit: 'min', label: 'Avg Delivery', icon: Clock },
  { value: `${HERO_STATS.mission_success_rate}%`, unit: '', label: 'Mission Success', icon: ShieldCheck },
]

function FallbackDrone() {
  return (
    <div className="flex items-center justify-center h-full">
      <motion.div
        animate={{ y: [0, -12, 0], rotate: [0, 2, 0, -2, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="relative"
      >
        <svg width="200" height="140" viewBox="0 0 200 140" fill="none">
          <rect x="70" y="55" width="60" height="20" rx="4" fill="#DCE8EC" stroke="rgba(23,35,43,0.10)" strokeWidth="1"/>
          <line x1="70" y1="65" x2="30" y2="45" stroke="#B5C8D0" strokeWidth="3"/>
          <line x1="130" y1="65" x2="170" y2="45" stroke="#B5C8D0" strokeWidth="3"/>
          <line x1="70" y1="65" x2="30" y2="85" stroke="#B5C8D0" strokeWidth="3"/>
          <line x1="130" y1="65" x2="170" y2="85" stroke="#B5C8D0" strokeWidth="3"/>
          {[[30,45],[170,45],[30,85],[170,85]].map(([cx,cy],i)=>(
            <g key={i}>
              <circle cx={cx} cy={cy} r="18" fill="#D5E1E6" stroke="rgba(23,35,43,0.08)" strokeWidth="1"/>
              <ellipse cx={cx} cy={cy} rx="16" ry="3" fill="#B5C8D0" opacity="0.7"/>
              <circle cx={cx} cy={cy-18} r="3" fill={i<2?'#20C878':'#EF4444'} opacity="0.9">
                <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.5s" repeatCount="indefinite"/>
              </circle>
            </g>
          ))}
          <rect x="92" y="48" width="16" height="5" rx="1" fill="#C62832"/>
          <rect x="96" y="44" width="8" height="13" rx="1" fill="#C62832"/>
          <rect x="78" y="75" width="44" height="14" rx="3" fill="#F3F6F7" stroke="rgba(198,40,50,0.25)" strokeWidth="1"/>
          <text x="100" y="85" textAnchor="middle" fill="#C62832" fontSize="8" fontWeight="bold">PAYLOAD</text>
          {[[78,89],[122,89]].map(([x,y],i)=>(
            <line key={i} x1={x} y1={y} x2={x} y2={y+12} stroke="#C8C6BC" strokeWidth="2"/>
          ))}
          <path d="M10 120 Q100 100 190 120" stroke="#C62832" strokeWidth="1.5" strokeDasharray="6,4" fill="none" opacity="0.35"/>
          <circle cx="15" cy="120" r="4" fill="#20C878" opacity="0.8"/>
          <circle cx="185" cy="120" r="4" fill="#E06B10" opacity="0.8"/>
        </svg>
      </motion.div>
    </div>
  )
}

export function LandingPage() {
  const navigate = useNavigate()
  const drone = useStore(s => s.drones.find(d => d.status === 'in_flight') ?? s.drones[0])

  return (
    <div className="min-h-screen overflow-hidden relative" style={{ background: 'transparent' }}>
      {/* Top nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <MediHawkLogo size="md" />
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/auth/doctor')} className="btn-secondary text-xs">
            Doctor Portal
          </button>
          <button onClick={() => navigate('/auth/admin')} className="btn-secondary text-xs">
            Admin Portal
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-6 pb-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[500px]">
          {/* Left — copy */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              {/* Eyebrow */}
              <div className="flex items-center gap-2 mb-6">
                <div className="h-px w-10 bg-crimson" />
                <span className="text-2xs text-crimson font-bold tracking-widest uppercase">
                  Smart India Hackathon 2026
                </span>
              </div>

              {/* Headline */}
              <h1 className="text-5xl lg:text-6xl font-black tracking-tight leading-[1.05] text-text-primary mb-3">
                MEDI<span className="text-crimson">HAWK</span>
              </h1>
              <p className="text-xl font-medium text-text-secondary mb-2">
                When every second counts.
              </p>
              <p className="text-sm text-text-muted leading-relaxed mb-3 max-w-md">
                Autonomous medical delivery for the moments that cannot wait.
                Connecting emergency medicines to rural PHC/CHC faster than any ground route.
              </p>
              <p className="text-sm font-medium text-text-secondary mb-8 max-w-md">
                Bridging distances. Saving lives.{' '}
                <span className="text-crimson">A healthier, Stronger tomorrow.</span>
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => navigate('/auth/doctor')}
                  className="btn-primary text-sm"
                >
                  <Package size={15} />
                  Request Delivery
                </button>
                <button
                  onClick={() => navigate('/doctor/track')}
                  className="btn-secondary text-sm"
                >
                  <Navigation size={15} />
                  Track Delivery
                </button>
              </div>

              {/* Admin link */}
              <button
                onClick={() => navigate('/auth/admin')}
                className="btn-ghost text-xs mt-4 pl-0"
              >
                <ShieldCheck size={13} />
                Enter Command Center →
              </button>
            </motion.div>
          </div>

          {/* Right — 3D drone */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <Suspense fallback={<FallbackDrone />}>
              <DroneScene3D height={420} />
            </Suspense>

            {/* Floating telemetry overlay */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-3 px-4">
              {[
                { label: 'ALT',  value: `${drone?.altitude.toFixed(0) ?? '82'} m` },
                { label: 'SPD',  value: `${drone?.speed.toFixed(0) ?? '46'} km/h` },
                { label: 'BAT',  value: `${drone?.battery.toFixed(0) ?? '78'}%` },
                { label: 'TEMP', value: `${drone?.temperature.toFixed(1) ?? '5.8'}°C` },
              ].map((t) => (
                <div key={t.label}
                  className="px-3 py-1.5 rounded"
                  style={{
                    background: 'rgba(238,244,248,0.88)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(23,35,43,0.12)',
                    boxShadow: '0 2px 8px rgba(23,35,43,0.08)',
                  }}>
                  <div className="telemetry-label text-center">{t.label}</div>
                  <div className="font-mono-data font-bold text-xs text-primary text-center" style={{ color: '#17232B' }}>{t.value}</div>
                </div>
              ))}
            </div>

            {/* Mission caption strip */}
            <div className="absolute bottom-[4.8rem] left-0 right-0 flex justify-center pointer-events-none overflow-hidden">
              <p className="text-[8px] tracking-[0.24em] text-text-muted" style={{ fontFamily: 'Space Mono, monospace' }}>
                AUTONOMOUS MEDICAL FLIGHT · MH-01 · PHC CHANDAKA · COLD CHAIN STABLE · 5.8°C
              </p>
            </div>

            {/* Live indicator */}
            <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded"
              style={{
                background: 'rgba(238,244,248,0.88)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(31,157,104,0.25)',
                boxShadow: '0 2px 8px rgba(23,35,43,0.07)',
              }}>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-med-green-light opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-med-green" />
              </span>
              <span className="text-2xs font-bold tracking-wide" style={{ color: '#1A7E55' }}>SIMULATION ACTIVE</span>
            </div>
          </motion.div>
        </div>

        {/* Stats strip */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-12"
        >
          {STATS.map((stat, i) => (
            <div key={i} className="panel p-4 flex items-center gap-4 panel-interactive">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(198,40,50,0.08)', border: '1px solid rgba(198,40,50,0.18)' }}>
                <stat.icon size={18} className="text-crimson" />
              </div>
              <div>
                <div className="font-mono-data font-black text-2xl text-text-primary">
                  {stat.value}
                  {stat.unit && <span className="text-base font-normal text-text-secondary ml-1">{stat.unit}</span>}
                </div>
                <div className="text-2xs text-text-muted uppercase tracking-wide">{stat.label}</div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Premium 3D drone showcase */}
        <DroneShowcase />
      </div>
    </div>
  )
}
