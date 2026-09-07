import React, { Suspense, lazy } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Package, Navigation, ShieldCheck, Clock } from 'lucide-react'
import { MediHawkLogo } from '@/components/ui/MediHawkLogo'
import { HERO_STATS } from '@/data/mockData'
import { useStore } from '@/store'

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
        {/* SVG drone illustration fallback */}
        <svg width="200" height="140" viewBox="0 0 200 140" fill="none">
          {/* Body */}
          <rect x="70" y="55" width="60" height="20" rx="4" fill="#1E2230" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
          {/* Arms */}
          <line x1="70" y1="65" x2="30" y2="45" stroke="#2C3045" strokeWidth="3"/>
          <line x1="130" y1="65" x2="170" y2="45" stroke="#2C3045" strokeWidth="3"/>
          <line x1="70" y1="65" x2="30" y2="85" stroke="#2C3045" strokeWidth="3"/>
          <line x1="130" y1="65" x2="170" y2="85" stroke="#2C3045" strokeWidth="3"/>
          {/* Propeller circles */}
          {[[30,45],[170,45],[30,85],[170,85]].map(([cx,cy],i)=>(
            <g key={i}>
              <circle cx={cx} cy={cy} r="18" fill="#12141A" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
              <ellipse cx={cx} cy={cy} rx="16" ry="3" fill="#2C3045" opacity="0.7"/>
              {/* Nav lights */}
              <circle cx={cx} cy={cy-18} r="3" fill={i<2?'#22C55E':'#EF4444'} opacity="0.9">
                <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.5s" repeatCount="indefinite"/>
              </circle>
            </g>
          ))}
          {/* Medical cross */}
          <rect x="92" y="48" width="16" height="5" rx="1" fill="#DC2626"/>
          <rect x="96" y="44" width="8" height="13" rx="1" fill="#DC2626"/>
          {/* Payload box */}
          <rect x="78" y="75" width="44" height="14" rx="3" fill="#161921" stroke="rgba(220,38,38,0.3)" strokeWidth="1"/>
          <text x="100" y="85" textAnchor="middle" fill="#DC2626" fontSize="8" fontWeight="bold">PAYLOAD</text>
          {/* Landing legs */}
          {[[78,89],[122,89]].map(([x,y],i)=>(
            <line key={i} x1={x} y1={y} x2={x} y2={y+12} stroke="#2C3045" strokeWidth="2"/>
          ))}
          {/* Route line */}
          <path d="M10 120 Q100 100 190 120" stroke="#DC2626" strokeWidth="1.5" strokeDasharray="6,4" fill="none" opacity="0.4"/>
          <circle cx="15" cy="120" r="4" fill="#22C55E" opacity="0.8"/>
          <circle cx="185" cy="120" r="4" fill="#F59E0B" opacity="0.8"/>
        </svg>
      </motion.div>
    </div>
  )
}

export function LandingPage() {
  const navigate = useNavigate()
  const drone = useStore(s => s.drones.find(d => d.status === 'in_flight') ?? s.drones[0])

  return (
    <div className="min-h-screen bg-obsidian overflow-hidden relative">
      {/* Background grid */}
      <div className="absolute inset-0 border-grid opacity-100 pointer-events-none" />

      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(220,38,38,0.07) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 right-0 w-[600px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(22,163,74,0.04) 0%, transparent 70%)' }} />
      </div>

      {/* Top nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <MediHawkLogo size="md" />
        <div className="flex items-center gap-3">
          <span className="text-2xs px-2 py-1 rounded border border-amber/30 text-amber bg-amber-glow font-bold tracking-widest uppercase">
            DEMO MODE
          </span>
          <button onClick={() => navigate('/auth/doctor')} className="btn-ghost text-xs">
            Doctor Portal
          </button>
          <button onClick={() => navigate('/auth/admin')} className="btn-secondary text-xs">
            Command Center
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
              <p className="text-sm text-text-muted leading-relaxed mb-8 max-w-md">
                Autonomous medical delivery for the moments that cannot wait.
                Connecting emergency medicines to rural PHCs faster than any ground route.
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
                <div key={t.label} className="px-3 py-1.5 rounded bg-graphite/80 backdrop-blur-sm border border-white/10">
                  <div className="telemetry-label text-center">{t.label}</div>
                  <div className="font-mono-data font-bold text-xs text-text-primary text-center">{t.value}</div>
                </div>
              ))}
            </div>

            {/* Live indicator */}
            <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded bg-graphite/80 backdrop-blur-sm border border-med-green/30">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-med-green-light opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-med-green" />
              </span>
              <span className="text-2xs text-med-green-light font-bold tracking-wide">SIMULATION ACTIVE</span>
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
            <div key={i} className="panel p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-crimson/10 border border-crimson/20 flex items-center justify-center flex-shrink-0">
                <stat.icon size={18} className="text-crimson-light" />
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

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="flex flex-wrap gap-2 mt-8 justify-center"
        >
          {[
            'Real-time 4G Telemetry',
            'Cold-Chain Monitoring',
            'Autonomous Obstacle Avoidance',
            'OTP Delivery Verification',
            'AI Flight Safety',
            'ZeroTier VPN Link',
          ].map((feature) => (
            <span key={feature} className="px-3 py-1 rounded-full text-xs text-text-secondary border border-white/10 bg-white/3">
              {feature}
            </span>
          ))}
        </motion.div>

        {/* Route visualization strip */}
        <div className="mt-16 relative">
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-8" />
          <div className="flex items-center justify-between max-w-lg mx-auto">
            {/* Hub */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-lg bg-med-green/10 border border-med-green/30 flex items-center justify-center">
                <ShieldCheck size={20} className="text-med-green-light" />
              </div>
              <span className="text-xs text-text-secondary text-center">MediHawk<br/>Central Hub</span>
            </div>

            {/* Route line */}
            <div className="flex-1 mx-4 relative">
              <div className="h-px bg-gradient-to-r from-med-green/50 via-crimson to-amber/50" />
              {/* Moving drone dot */}
              <motion.div
                animate={{ x: ['0%', '100%', '0%'] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                className="absolute -top-1.5 w-3 h-3 rounded-full bg-crimson border-2 border-crimson-light"
                style={{ boxShadow: '0 0 8px rgba(220,38,38,0.6)' }}
              />
            </div>

            {/* PHC */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-lg bg-amber/10 border border-amber/30 flex items-center justify-center">
                <Package size={20} className="text-amber-light" />
              </div>
              <span className="text-xs text-text-secondary text-center">PHC<br/>Chandaka</span>
            </div>
          </div>

          <div className="text-center mt-4">
            <span className="text-2xs text-text-muted">8.4 km · Est. 11 min · Emergency Delivery</span>
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-16 text-center text-2xs text-text-muted">
          <span className="border border-amber/20 bg-amber-glow rounded px-2 py-1 text-amber">DEMO / SIMULATION</span>
          <span className="ml-2">All data is simulated for demonstration purposes. No live drone operations.</span>
        </div>
      </div>
    </div>
  )
}
