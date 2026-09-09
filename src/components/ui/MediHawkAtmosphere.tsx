import { useEffect, useRef } from 'react'

/**
 * Global atmospheric background for MediHawk.
 * Warm platinum environment with extremely subtle living light.
 * Sits behind all content. pointer-events: none throughout.
 */
export function MediHawkAtmosphere() {
  const lightRef = useRef<HTMLDivElement>(null)
  const raf = useRef<number>(0)
  const t = useRef(0)

  useEffect(() => {
    const el = lightRef.current
    if (!el) return

    // Very slow autonomous drift of the soft light source
    const animate = () => {
      t.current += 0.0004
      const x = 48 + Math.sin(t.current * 0.7) * 12
      const y = 38 + Math.cos(t.current * 0.5) * 10
      el.style.left  = `${x}%`
      el.style.top   = `${y}%`
      raf.current = requestAnimationFrame(animate)
    }

    raf.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    >
      {/* ── Layer 1: Warm platinum base ──────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(165deg, #FAFAF7 0%, #F4F3EF 40%, #EDECE6 70%, #E8E6DE 100%)',
        }}
      />

      {/* ── Layer 2: Very soft upper-left cool light ─────────── */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 10% 10%, rgba(230,235,248,0.30) 0%, transparent 70%)',
        }}
      />

      {/* ── Layer 3: Moving main soft light source ───────────── */}
      <div
        ref={lightRef}
        className="absolute"
        style={{
          width: '70vw',
          height: '60vh',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(255,254,250,0.55) 0%, rgba(250,249,245,0.20) 40%, transparent 70%)',
          transform: 'translate(-50%, -50%)',
          filter: 'blur(40px)',
        }}
      />

      {/* ── Layer 4: Very subtle crimson atmosphere (top right) ─ */}
      <div
        className="absolute top-0 right-0 pointer-events-none"
        style={{
          width: '55vw',
          height: '45vh',
          background: 'radial-gradient(ellipse at 90% 0%, rgba(215,25,32,0.045) 0%, transparent 65%)',
          animation: 'crimson-breath 7s ease-in-out infinite',
        }}
      />

      {/* ── Layer 5: Green operational glow (bottom left) ────── */}
      <div
        className="absolute bottom-0 left-0 pointer-events-none"
        style={{
          width: '50vw',
          height: '40vh',
          background: 'radial-gradient(ellipse at 10% 100%, rgba(26,158,95,0.035) 0%, transparent 60%)',
        }}
      />

      {/* ── Layer 6: Subtle graphite depth (bottom edge) ─────── */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: '30vh',
          background: 'linear-gradient(to top, rgba(23,25,28,0.03) 0%, transparent 100%)',
        }}
      />
    </div>
  )
}
