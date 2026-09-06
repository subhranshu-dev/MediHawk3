import { motion } from 'framer-motion'
import { Play, Pause, RotateCcw, Zap, Thermometer, Wifi, Navigation, Plane } from 'lucide-react'
import { useStore } from '@/store'
import { useToast } from '@/components/ui/Toast'

export function AdminDemoControls() {
  const { simRunning, setSimRunning, triggerScenario, isDemo } = useStore()
  const { toast } = useToast()

  if (!isDemo) return null

  const scenarios = [
    { id: 'obstacle', label: 'Simulate Obstacle', Icon: Navigation, color: 'text-amber-light border-amber/30 hover:bg-amber/10' },
    { id: 'temp_warning', label: 'Temp Warning', Icon: Thermometer, color: 'text-crimson-light border-crimson/30 hover:bg-crimson/10' },
    { id: 'link_loss', label: 'Link Degradation', Icon: Wifi, color: 'text-amber-light border-amber/30 hover:bg-amber/10' },
  ]

  return (
    <div className="px-5 py-4 border-t border-amber/20 bg-amber/3">
      <div className="flex items-center gap-2 mb-3">
        <Plane size={13} className="text-amber-light" />
        <span className="text-xs font-bold text-amber uppercase tracking-widest">Demo / Simulation Controls</span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setSimRunning(!simRunning)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-semibold transition-all
            ${simRunning ? 'bg-amber/10 border-amber/30 text-amber-light' : 'bg-med-green/10 border-med-green/30 text-med-green-light'}`}
        >
          {simRunning ? <><Pause size={12} /> Pause Simulation</> : <><Play size={12} /> Resume Simulation</>}
        </button>

        <button
          onClick={() => { triggerScenario(null); toast('info', 'Simulation Reset', 'All states reset to initial values') }}
          className="flex items-center gap-2 px-3 py-1.5 rounded border border-white/15 text-xs font-semibold text-text-secondary hover:bg-white/5 transition-all"
        >
          <RotateCcw size={12} />
          Reset
        </button>

        <div className="h-4 w-px bg-white/10" />

        {scenarios.map((s) => (
          <button
            key={s.id}
            onClick={() => { triggerScenario(s.id); toast('warning', s.label, 'Scenario injected into simulation') }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-semibold transition-all ${s.color}`}
          >
            <s.Icon size={12} />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
