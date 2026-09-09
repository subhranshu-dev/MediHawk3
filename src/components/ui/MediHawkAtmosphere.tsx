import { useEffect, useRef } from 'react'

export function MediHawkAtmosphere() {
  const lightRef   = useRef<HTMLDivElement>(null)
  const mouseRef   = useRef<HTMLDivElement>(null)
  const raf        = useRef<number>(0)
  const t          = useRef(0)
  const mousePos   = useRef({ x: 0.5, y: 0.4 })
  const smoothMouse= useRef({ x: 0.5, y: 0.4 })

  useEffect(() => {
    const light = lightRef.current
    const mouseLight = mouseRef.current
    if (!light || !mouseLight) return

    const onMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight }
    }
    window.addEventListener('mousemove', onMove, { passive: true })

    const lerp = (a: number, b: number, f: number) => a + (b - a) * f

    const animate = () => {
      t.current += 0.00028

      const x = 44 + Math.sin(t.current * 0.75) * 16
      const y = 34 + Math.cos(t.current * 0.52) * 13
      light.style.left = `${x}%`
      light.style.top  = `${y}%`

      smoothMouse.current.x = lerp(smoothMouse.current.x, mousePos.current.x, 0.025)
      smoothMouse.current.y = lerp(smoothMouse.current.y, mousePos.current.y, 0.025)
      const mx = (smoothMouse.current.x - 0.5) * 9
      const my = (smoothMouse.current.y - 0.5) * 7
      mouseLight.style.transform = `translate(calc(-50% + ${mx}px), calc(-50% + ${my}px))`

      raf.current = requestAnimationFrame(animate)
    }

    raf.current = requestAnimationFrame(animate)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf.current)
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    >
      {/* ── Layer 1: Rich surgical blue-gray base ────────────────── */}
      {/* Darker mid-tone base — not near-white */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(158deg, #C8D8E2 0%, #BFCFD9 20%, #B8CAD5 42%, #AEBFCC 65%, #A4B8C7 82%, #9AAFC0 100%)',
      }} />

      {/* ── Layer 2: Strong cool upper-left surgical illumination ── */}
      {/* Primary light source — upper left, rich surgical blue */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 88% 72% at 4% 4%, rgba(185,215,235,0.80) 0%, rgba(165,200,225,0.38) 45%, transparent 72%)',
      }} />

      {/* ── Layer 3: Cool upper-right accent — animates slowly ───── */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 72% 65% at 97% 6%, rgba(158,195,222,0.62) 0%, rgba(140,180,210,0.25) 42%, transparent 70%)',
        animation: 'surgical-shift 20s ease-in-out infinite',
      }} />

      {/* ── Layer 4: Moving surgical luminous field (NOT white) ──── */}
      {/* KEY FIX: was rgba(255,255,255,0.52) — replaced with tinted cool blue */}
      <div ref={lightRef} className="absolute" style={{
        width: '68vw',
        height: '60vh',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(195,225,242,0.50) 0%, rgba(175,210,232,0.22) 35%, transparent 65%)',
        transform: 'translate(-50%, -50%)',
        filter: 'blur(52px)',
      }} />

      {/* ── Layer 5: Mouse-reactive surgical ambient light ───────── */}
      <div ref={mouseRef} className="absolute" style={{
        top: '44%',
        left: '50%',
        width: '52vw',
        height: '42vh',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(175,210,232,0.40) 0%, rgba(155,192,218,0.15) 42%, transparent 68%)',
        filter: 'blur(55px)',
        willChange: 'transform',
      }} />

      {/* ── Layer 6: Crimson medical atmosphere — top-right ─────── */}
      {/* More visible brand presence */}
      <div className="absolute top-0 right-0 pointer-events-none" style={{
        width: '55vw',
        height: '45vh',
        background: 'radial-gradient(ellipse at 90% 0%, rgba(198,40,50,0.12) 0%, rgba(198,40,50,0.04) 45%, transparent 68%)',
        animation: 'crimson-breath 7s ease-in-out infinite',
      }} />

      {/* ── Layer 7: Medical green safety trace — bottom-left ────── */}
      <div className="absolute bottom-0 left-0 pointer-events-none" style={{
        width: '45vw',
        height: '35vh',
        background: 'radial-gradient(ellipse at 6% 98%, rgba(31,157,104,0.055) 0%, transparent 55%)',
      }} />

      {/* ── Layer 8: Surgical blue mid-left depth accent ──────────── */}
      <div className="absolute pointer-events-none" style={{
        top: '28%',
        left: '-4%',
        width: '40vw',
        height: '52vh',
        background: 'radial-gradient(ellipse at 0% 50%, rgba(52,70,80,0.22) 0%, rgba(72,106,122,0.08) 45%, transparent 70%)',
        filter: 'blur(28px)',
      }} />

      {/* ── Layer 9: Deep graphite bottom vignette ───────────────── */}
      {/* Creates premium depth — aerospace feeling */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{
        height: '38vh',
        background: 'linear-gradient(to top, rgba(30,44,54,0.22) 0%, rgba(38,52,62,0.08) 45%, transparent 100%)',
      }} />

      {/* ── Layer 10: Side edge vignettes — depth and containment ── */}
      <div className="absolute inset-y-0 left-0 pointer-events-none" style={{
        width: '18vw',
        background: 'linear-gradient(to right, rgba(28,40,50,0.18) 0%, transparent 100%)',
      }} />
      <div className="absolute inset-y-0 right-0 pointer-events-none" style={{
        width: '15vw',
        background: 'linear-gradient(to left, rgba(28,40,50,0.12) 0%, transparent 100%)',
      }} />

      {/* ── Layer 11: Top edge depth ─────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none" style={{
        height: '20vh',
        background: 'linear-gradient(to bottom, rgba(28,42,52,0.14) 0%, transparent 100%)',
      }} />

      {/* ── Layer 12: Graphite-blue center lower accent ───────────── */}
      <div className="absolute pointer-events-none" style={{
        bottom: '5%',
        left: '30%',
        right: '30%',
        height: '40vh',
        background: 'radial-gradient(ellipse at 50% 100%, rgba(52,70,80,0.14) 0%, transparent 65%)',
        filter: 'blur(40px)',
      }} />
    </div>
  )
}
