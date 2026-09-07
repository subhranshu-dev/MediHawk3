import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const SESSION_KEY = 'mh_init_v2'

interface Props {
  onComplete: () => void
}

export function InitSequence({ onComplete }: Props) {
  const [stage, setStage] = useState(() =>
    sessionStorage.getItem(SESSION_KEY) ? 8 : 0
  )
  const [lineProgress, setLineProgress] = useState(0)
  const doneRef = useRef(false)
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([])

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    timerRefs.current.forEach(clearTimeout)
    sessionStorage.setItem(SESSION_KEY, '1')
    onComplete()
  }, [onComplete])

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) {
      finish()
      return
    }

    const t = (delay: number, fn: () => void) => {
      const id = setTimeout(fn, delay)
      timerRefs.current.push(id)
    }

    t(200,  () => setStage(1))   // MEDI appears
    t(700,  () => setStage(2))   // HAWK appears (crimson)
    t(1300, () => setStage(3))   // sub-caption
    t(1900, () => {
      setStage(4)
      // animate line progress
      let p = 0
      const step = () => {
        p = Math.min(p + 0.025, 1)
        setLineProgress(p)
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
    t(2900, () => setStage(5))   // network nodes
    t(3400, () => setStage(6))   // drone flies
    t(4100, () => setStage(7))   // SYSTEM INITIALIZED
    t(4700, () => setStage(8))   // fade out
    t(5300, finish)

    return () => timerRefs.current.forEach(clearTimeout)
  }, [finish])

  const handleSkip = useCallback(() => {
    setStage(8)
    setTimeout(finish, 300)
  }, [finish])

  return (
    <AnimatePresence>
      {stage < 8 && (
        <motion.div
          key="init"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[9999] bg-[#08090C] flex flex-col items-center justify-center select-none"
          onClick={handleSkip}
          onKeyDown={(e) => e.key === 'Escape' && handleSkip()}
          tabIndex={0}
        >
          {/* Atmospheric radial glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full"
              style={{ background: 'radial-gradient(ellipse, rgba(220,38,38,0.06) 0%, transparent 65%)' }}
            />
          </div>

          {/* Subtle grid */}
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />

          {/* Core wordmark */}
          <div className="relative z-10 flex flex-col items-center gap-8">
            {/* MEDIHAWK */}
            <div className="flex items-baseline gap-0 overflow-hidden">
              <AnimatePresence>
                {stage >= 1 && (
                  <motion.span
                    key="medi"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="text-[72px] md:text-[96px] font-black tracking-[-0.04em] text-[#EDF0F7] leading-none"
                    style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
                  >
                    MEDI
                  </motion.span>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {stage >= 2 && (
                  <motion.span
                    key="hawk"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="text-[72px] md:text-[96px] font-black tracking-[-0.04em] leading-none"
                    style={{ color: '#DC2626', fontFamily: 'Inter, system-ui, sans-serif' }}
                  >
                    HAWK
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {/* Caption */}
            <AnimatePresence>
              {stage >= 3 && (
                <motion.div
                  key="caption"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="flex flex-col items-center gap-2"
                >
                  <p
                    className="text-xs tracking-[0.4em] uppercase text-[#8892A8]"
                    style={{ fontFamily: 'Space Mono, monospace' }}
                  >
                    AUTONOMOUS MEDICAL DELIVERY NETWORK
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="h-px w-12 bg-[#DC2626]/40" />
                    <span
                      className="text-[10px] tracking-[0.3em] text-[#4E5668]"
                      style={{ fontFamily: 'Space Mono, monospace' }}
                    >
                      SMART INDIA HACKATHON 2026
                    </span>
                    <div className="h-px w-12 bg-[#DC2626]/40" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Traveling line */}
            <AnimatePresence>
              {stage >= 4 && (
                <motion.div
                  key="line-container"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-[320px] md:w-[480px] relative"
                >
                  {/* Track */}
                  <div className="h-px w-full bg-[#1E2230]" />
                  {/* Traveling line */}
                  <div
                    className="absolute top-0 left-0 h-px bg-gradient-to-r from-transparent via-[#DC2626] to-[#DC2626]/40 transition-none"
                    style={{ width: `${lineProgress * 100}%` }}
                  />
                  {/* Moving head */}
                  <div
                    className="absolute top-[-2px] w-1.5 h-1.5 rounded-full bg-[#DC2626]"
                    style={{
                      left: `${lineProgress * 100}%`,
                      transform: 'translateX(-50%)',
                      boxShadow: '0 0 8px rgba(220,38,38,0.8)',
                      transition: 'none',
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Network topology nodes */}
            <AnimatePresence>
              {stage >= 5 && (
                <motion.div
                  key="network"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="w-[320px] md:w-[480px] relative h-20"
                >
                  <svg width="100%" height="80" viewBox="0 0 480 80">
                    {/* Connection lines */}
                    <motion.line
                      x1="60" y1="40" x2="240" y2="40"
                      stroke="rgba(220,38,38,0.25)" strokeWidth="1" strokeDasharray="4,4"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.6 }}
                    />
                    <motion.line
                      x1="240" y1="40" x2="420" y2="40"
                      stroke="rgba(22,163,74,0.25)" strokeWidth="1" strokeDasharray="4,4"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.6, delay: 0.2 }}
                    />
                    {/* Hub node */}
                    <motion.g
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <circle cx="60" cy="40" r="14" fill="rgba(22,163,74,0.1)" stroke="rgba(22,163,74,0.4)" strokeWidth="1" />
                      <circle cx="60" cy="40" r="5" fill="#16A34A" />
                      <circle cx="60" cy="40" r="14" fill="none" stroke="rgba(22,163,74,0.2)" strokeWidth="1">
                        <animate attributeName="r" values="14;22;14" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
                      </circle>
                    </motion.g>
                    {/* Relay node */}
                    <motion.g
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.15 }}
                    >
                      <circle cx="240" cy="40" r="8" fill="rgba(220,38,38,0.1)" stroke="rgba(220,38,38,0.3)" strokeWidth="1" />
                      <circle cx="240" cy="40" r="3" fill="#DC2626" />
                    </motion.g>
                    {/* PHC node */}
                    <motion.g
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.3 }}
                    >
                      <circle cx="420" cy="40" r="14" fill="rgba(217,119,6,0.1)" stroke="rgba(217,119,6,0.4)" strokeWidth="1" />
                      <circle cx="420" cy="40" r="5" fill="#D97706" />
                    </motion.g>
                    {/* Labels */}
                    <text x="60" y="65" textAnchor="middle" fill="#4E5668" fontSize="8" fontFamily="Space Mono, monospace">HUB</text>
                    <text x="420" y="65" textAnchor="middle" fill="#4E5668" fontSize="8" fontFamily="Space Mono, monospace">PHC</text>
                  </svg>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Drone flight */}
            <AnimatePresence>
              {stage >= 6 && (
                <motion.div
                  key="drone"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute"
                  style={{ top: 'calc(50% + 20px)' }}
                >
                  <motion.div
                    initial={{ x: -220, y: 0, opacity: 0 }}
                    animate={{ x: 220, y: -10, opacity: [0, 1, 1, 0.8] }}
                    transition={{ duration: 1.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                      {/* Body */}
                      <rect x="11" y="9" width="10" height="5" rx="1.5" fill="#1E2230" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
                      {/* Arms */}
                      <line x1="11" y1="11.5" x2="5" y2="7" stroke="#2C3045" strokeWidth="1.5" />
                      <line x1="21" y1="11.5" x2="27" y2="7" stroke="#2C3045" strokeWidth="1.5" />
                      <line x1="11" y1="11.5" x2="5" y2="16" stroke="#2C3045" strokeWidth="1.5" />
                      <line x1="21" y1="11.5" x2="27" y2="16" stroke="#2C3045" strokeWidth="1.5" />
                      {/* Rotors */}
                      {([[5,7],[27,7],[5,16],[27,16]] as [number,number][]).map(([cx,cy],i) => (
                        <g key={i}>
                          <circle cx={cx} cy={cy} r="4" fill="#12141A" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
                          <ellipse cx={cx} cy={cy} rx="3.5" ry="1" fill="#2C3045" opacity="0.8">
                            <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="0.1s" repeatCount="indefinite"/>
                          </ellipse>
                        </g>
                      ))}
                      {/* Medical cross */}
                      <rect x="14" y="7.5" width="4" height="1.5" rx="0.5" fill="#DC2626" />
                      <rect x="15" y="6.5" width="2" height="3.5" rx="0.5" fill="#DC2626" />
                      {/* Nav light */}
                      <circle cx="16" cy="17" r="1" fill="#22C55E" opacity="0.9">
                        <animate attributeName="opacity" values="0.9;0.3;0.9" dur="0.6s" repeatCount="indefinite"/>
                      </circle>
                    </svg>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* SYSTEM INITIALIZED */}
            <AnimatePresence>
              {stage >= 7 && (
                <motion.div
                  key="ready"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-center gap-1.5 mt-4"
                >
                  <div className="flex items-center gap-2">
                    <div className="relative flex h-2 w-2">
                      <div className="absolute inline-flex h-full w-full rounded-full bg-[#16A34A] opacity-75 animate-ping" />
                      <div className="relative inline-flex h-2 w-2 rounded-full bg-[#16A34A]" />
                    </div>
                    <span
                      className="text-xs text-[#22C55E] tracking-[0.25em] uppercase"
                      style={{ fontFamily: 'Space Mono, monospace' }}
                    >
                      SYSTEM INITIALIZED
                    </span>
                  </div>
                  <span
                    className="text-[10px] text-[#4E5668] tracking-[0.15em]"
                    style={{ fontFamily: 'Space Mono, monospace' }}
                  >
                    LOADING COMMAND INTERFACE...
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Skip hint */}
          <div className="absolute bottom-8 right-8">
            <span
              className="text-[10px] text-[#2C3045] tracking-[0.15em] uppercase cursor-pointer hover:text-[#4E5668] transition-colors"
              style={{ fontFamily: 'Space Mono, monospace' }}
              onClick={handleSkip}
            >
              CLICK TO SKIP
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
