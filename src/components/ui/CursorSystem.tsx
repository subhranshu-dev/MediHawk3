import { useEffect, useRef } from 'react'

/**
 * Subtle premium cursor interaction system.
 * - Tiny elegant cursor halo ring (follows with smooth interpolation)
 * - Soft ambient light blob (heavier lag, broader radius)
 * - Disabled on touch / coarse-pointer devices
 * - Respects prefers-reduced-motion
 */
export function CursorSystem() {
  const haloRef  = useRef<HTMLDivElement>(null)
  const lightRef = useRef<HTMLDivElement>(null)
  const mouse    = useRef({ x: -200, y: -200 })
  const haloPos  = useRef({ x: -200, y: -200 })
  const lightPos = useRef({ x: -200, y: -200 })
  const raf      = useRef<number>(0)
  const visible  = useRef(false)

  useEffect(() => {
    // Don't activate on touch / coarse-pointer devices
    const isCoarse = window.matchMedia('(pointer: coarse)').matches
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (isCoarse || prefersReduced) return

    const halo  = haloRef.current
    const light = lightRef.current
    if (!halo || !light) return

    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY }
      if (!visible.current) {
        visible.current = true
        halo.style.opacity  = '1'
        light.style.opacity = '1'
      }
    }

    const onLeave = () => {
      visible.current = false
      halo.style.opacity  = '0'
      light.style.opacity = '0'
    }

    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeave)

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    const loop = () => {
      // Halo follows quickly (smooth but snappy)
      haloPos.current.x = lerp(haloPos.current.x, mouse.current.x, 0.18)
      haloPos.current.y = lerp(haloPos.current.y, mouse.current.y, 0.18)

      // Ambient light follows slowly (dreamy lag)
      lightPos.current.x = lerp(lightPos.current.x, mouse.current.x, 0.06)
      lightPos.current.y = lerp(lightPos.current.y, mouse.current.y, 0.06)

      halo.style.transform  = `translate(${haloPos.current.x - 14}px, ${haloPos.current.y - 14}px)`
      light.style.transform = `translate(${lightPos.current.x - 150}px, ${lightPos.current.y - 150}px)`

      raf.current = requestAnimationFrame(loop)
    }

    raf.current = requestAnimationFrame(loop)

    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(raf.current)
    }
  }, [])

  return (
    <>
      {/* Halo ring — tiny precise follower */}
      <div
        ref={haloRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '1.5px solid rgba(198,40,50,0.28)',
          backgroundColor: 'rgba(232,238,241,0.15)',
          pointerEvents: 'none',
          zIndex: 9999,
          opacity: 0,
          transition: 'opacity 300ms ease',
          willChange: 'transform',
          backdropFilter: 'blur(0px)',
        }}
      />

      {/* Ambient light — large soft following glow */}
      <div
        ref={lightRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.20) 0%, rgba(232,238,241,0.07) 40%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 1,
          opacity: 0,
          transition: 'opacity 600ms ease',
          willChange: 'transform',
          filter: 'blur(20px)',
        }}
      />
    </>
  )
}
