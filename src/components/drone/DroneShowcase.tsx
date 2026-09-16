import React, { useRef, useEffect, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const C = {
  graphite:  '#1b2024',
  graphiteM: '#252c31',
  metal:     '#3b4248',
  white:     '#edf3f6',
  crimson:   '#c62832',
  green:     '#1fc97a',
  orange:    '#e06b10',
  accent:    '#8faab5',
} as const

type HoverRef = React.MutableRefObject<number>

/* ── Two-blade propeller (unchanged) ────────────────────────── */
function Prop({ pos, dir }: { pos: [number, number, number]; dir: 1 | -1 }) {
  const ref = useRef<THREE.Group>(null!)
  useFrame(() => { ref.current.rotation.y += 0.22 * dir })
  return (
    <group ref={ref} position={pos}>
      <mesh>
        <boxGeometry args={[0.66, 0.011, 0.084]} />
        <meshStandardMaterial color={C.graphiteM} roughness={0.48} metalness={0.42} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[0.66, 0.011, 0.084]} />
        <meshStandardMaterial color={C.graphiteM} roughness={0.48} metalness={0.42} />
      </mesh>
    </group>
  )
}

/* ── Navigation light — hover-aware ─────────────────────────── */
function NavLight({ pos, color, phase, hoverRef }: {
  pos: [number, number, number]; color: string; phase: number
  hoverRef?: HoverRef
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame(({ clock }) => {
    const base  = 0.3 + 0.7 * Math.abs(Math.sin(clock.elapsedTime * 2.7 + phase))
    const boost = hoverRef ? 1 + hoverRef.current * 0.45 : 1
    matRef.current.emissiveIntensity = base * boost
  })
  return (
    <mesh position={pos}>
      <sphereGeometry args={[0.036, 8, 8]} />
      <meshStandardMaterial ref={matRef} color={color} emissive={color} emissiveIntensity={1} />
    </mesh>
  )
}

/* ── Motor housing (unchanged) ──────────────────────────────── */
function Motor({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh>
        <cylinderGeometry args={[0.125, 0.105, 0.092, 14]} />
        <meshStandardMaterial color={C.metal} roughness={0.26} metalness={0.84} />
      </mesh>
      <mesh position={[0, 0.056, 0]}>
        <cylinderGeometry args={[0.052, 0.052, 0.036, 10]} />
        <meshStandardMaterial color={C.graphiteM} roughness={0.18} metalness={0.92} />
      </mesh>
    </group>
  )
}

/* ── Arm (unchanged) ─────────────────────────────────────────── */
function Arm({ to }: { to: [number, number, number] }) {
  const [tx, , tz] = to
  const len   = Math.sqrt(tx * tx + tz * tz)
  const angle = Math.atan2(tx, tz)
  return (
    <mesh position={[tx / 2, 0, tz / 2]} rotation={[0, angle, 0]}>
      <boxGeometry args={[0.054, 0.036, len]} />
      <meshStandardMaterial color={C.graphite} roughness={0.36} metalness={0.74} />
    </mesh>
  )
}

/* ── Medical payload — enhanced cross emissive + hover glow ─── */
function Payload({ hoverRef }: { hoverRef: HoverRef }) {
  const bodyRef  = useRef<THREE.MeshStandardMaterial>(null!)
  const crossHRef = useRef<THREE.MeshStandardMaterial>(null!)
  const crossVRef = useRef<THREE.MeshStandardMaterial>(null!)

  useFrame(({ clock }) => {
    const t       = clock.elapsedTime
    const hover   = hoverRef.current
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.1)
    bodyRef.current.emissiveIntensity   = 0.04 + 0.04 * breathe + hover * 0.08
    const crossGlow = 0.22 + 0.18 * breathe + hover * 0.30
    crossHRef.current.emissiveIntensity = crossGlow
    crossVRef.current.emissiveIntensity = crossGlow
  })

  return (
    <group position={[0, -0.60, 0]}>
      {/* main box */}
      <mesh>
        <boxGeometry args={[0.44, 0.17, 0.34]} />
        <meshStandardMaterial ref={bodyRef} color={C.white} roughness={0.26} metalness={0.06}
          emissive="#ffffff" emissiveIntensity={0.04} />
      </mesh>
      {/* illuminated red cross — H */}
      <mesh position={[0, 0, 0.172]}>
        <boxGeometry args={[0.16, 0.032, 0.004]} />
        <meshStandardMaterial ref={crossHRef} color={C.crimson} roughness={0.24}
          emissive={C.crimson} emissiveIntensity={0.22} />
      </mesh>
      {/* illuminated red cross — V */}
      <mesh position={[0, 0, 0.172]}>
        <boxGeometry args={[0.032, 0.16, 0.004]} />
        <meshStandardMaterial ref={crossVRef} color={C.crimson} roughness={0.24}
          emissive={C.crimson} emissiveIntensity={0.22} />
      </mesh>
      {/* rear cross face */}
      <mesh position={[0, 0, -0.172]}>
        <boxGeometry args={[0.10, 0.022, 0.003]} />
        <meshStandardMaterial color={C.crimson} emissive={C.crimson} emissiveIntensity={0.12} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, -0.172]}>
        <boxGeometry args={[0.022, 0.10, 0.003]} />
        <meshStandardMaterial color={C.crimson} emissive={C.crimson} emissiveIntensity={0.12} roughness={0.3} />
      </mesh>
      {/* mounting struts */}
      {([-0.15, 0.15] as number[]).map((x, i) => (
        <mesh key={i} position={[x, 0.225, 0]}>
          <boxGeometry args={[0.030, 0.28, 0.030]} />
          <meshStandardMaterial color={C.metal} roughness={0.28} metalness={0.76} />
        </mesh>
      ))}
      {/* cold-chain status indicators */}
      <NavLight pos={[-0.185, 0.092, 0.176]} color={C.green}  phase={0.5} hoverRef={hoverRef} />
      <NavLight pos={[ 0.185, 0.092, 0.176]} color={C.orange} phase={2.2} hoverRef={hoverRef} />
    </group>
  )
}

/* ── Holographic scan ring (unchanged) ──────────────────────── */
function ScanRing() {
  const meshRef = useRef<THREE.Mesh>(null!)
  const matRef  = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    meshRef.current.rotation.y = t * 0.34
    meshRef.current.rotation.x = Math.sin(t * 0.27) * 0.11
    matRef.current.opacity = 0.055 + 0.035 * Math.abs(Math.sin(t * 0.68))
  })
  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[1.58, 0.009, 6, 70]} />
      <meshStandardMaterial ref={matRef} color={C.crimson} emissive={C.crimson}
        emissiveIntensity={1} transparent opacity={0.07} depthWrite={false} />
    </mesh>
  )
}

/* ── Outer orbit ring (unchanged) ───────────────────────────── */
function OrbitRing() {
  const meshRef = useRef<THREE.Mesh>(null!)
  const matRef  = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    meshRef.current.rotation.y = -t * 0.18
    meshRef.current.rotation.z =  t * 0.07
    matRef.current.opacity = 0.028 + 0.018 * Math.abs(Math.sin(t * 0.48))
  })
  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[2.18, 0.007, 4, 58]} />
      <meshStandardMaterial ref={matRef} color={C.accent} emissive={C.accent}
        emissiveIntensity={0.5} transparent opacity={0.03} depthWrite={false} />
    </mesh>
  )
}

/* ── Background particles (unchanged logic, renamed) ────────── */
function BgParticles() {
  const COUNT   = 52
  const pRef    = useRef<THREE.Points>(null!)

  useEffect(() => {
    const geo = pRef.current.geometry
    const pos = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 8.5
      pos[i * 3 + 1] = (Math.random() - 0.5) * 5.5
      pos[i * 3 + 2] = (Math.random() - 0.5) * 5 - 1.5
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  }, [])

  useFrame(() => {
    const attr = pRef.current?.geometry.attributes.position
    if (!attr) return
    const arr = attr.array as Float32Array
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 1] += 0.0013
      if (arr[i * 3 + 1] > 3.2) arr[i * 3 + 1] = -3.2
    }
    attr.needsUpdate = true
  })

  return (
    <points ref={pRef}>
      <bufferGeometry />
      <pointsMaterial size={0.021} color={C.accent} transparent opacity={0.26} sizeAttenuation />
    </points>
  )
}

/* ══════════════════════════════════════════════════════════════
   NEW MEDICAL / AEROSPACE ENHANCEMENTS
══════════════════════════════════════════════════════════════ */

/* ── Cold-chain energy field — pulsing green sphere ─────────── */
function ColdChainField({ hoverRef }: { hoverRef: HoverRef }) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const matRef  = useRef<THREE.MeshStandardMaterial>(null!)

  useFrame(({ clock }) => {
    const t       = clock.elapsedTime
    const hover   = hoverRef.current
    const breathe = 0.5 + 0.5 * Math.sin(t * 0.60)
    matRef.current.opacity           = 0.036 + 0.026 * breathe + hover * 0.020
    matRef.current.emissiveIntensity = 0.28  + 0.22  * breathe + hover * 0.22
    meshRef.current.scale.setScalar(1 + 0.026 * breathe)
  })

  return (
    <mesh ref={meshRef} position={[0, -0.60, 0]}>
      <sphereGeometry args={[0.46, 16, 12]} />
      <meshStandardMaterial
        ref={matRef}
        color={C.green}
        emissive={C.green}
        emissiveIntensity={0.28}
        transparent
        opacity={0.04}
        depthWrite={false}
        side={THREE.BackSide}
      />
    </mesh>
  )
}

/* ── Expanding medical scan ring ────────────────────────────── */
function MedScanRing({ hoverRef, color, speed, offset }: {
  hoverRef: HoverRef; color: string; speed: number; offset: number
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const matRef  = useRef<THREE.MeshStandardMaterial>(null!)

  useFrame(({ clock }) => {
    const p = ((clock.elapsedTime * speed + offset) % 1)
    meshRef.current.scale.setScalar(0.20 + p * 2.0)
    matRef.current.opacity = (1 - p) * (0.09 + hoverRef.current * 0.04)
  })

  return (
    <mesh ref={meshRef} position={[0, -0.83, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.22, 0.235, 40]} />
      <meshStandardMaterial
        ref={matRef}
        color={color}
        emissive={color}
        emissiveIntensity={1}
        transparent
        opacity={0.07}
        depthWrite={false}
      />
    </mesh>
  )
}

/* ── Heartbeat pulse — thin ring with traveling dot ─────────── */
function HeartbeatPulse({ hoverRef }: { hoverRef: HoverRef }) {
  const dotRef = useRef<THREE.Mesh>(null!)
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
  const R = 0.52

  useFrame(({ clock }) => {
    const t     = clock.elapsedTime
    const hover = hoverRef.current
    const ang   = t * 0.55
    dotRef.current.position.x = Math.cos(ang) * R
    dotRef.current.position.z = Math.sin(ang) * R
    const spike = Math.max(0, Math.sin(t * 3.8))
    matRef.current.emissiveIntensity = 0.45 + spike * (1.1 + hover * 0.6)
  })

  return (
    <group position={[0, -0.64, 0]}>
      {/* static thin ring */}
      <mesh>
        <torusGeometry args={[R, 0.0052, 4, 52]} />
        <meshStandardMaterial
          color={C.crimson} emissive={C.crimson} emissiveIntensity={0.18}
          transparent opacity={0.14} depthWrite={false}
        />
      </mesh>
      {/* traveling pulse dot */}
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.018, 6, 6]} />
        <meshStandardMaterial ref={matRef} color={C.crimson} emissive={C.crimson} emissiveIntensity={0.6} />
      </mesh>
    </group>
  )
}

/* ── Medical payload particles — drift near payload ─────────── */
function MedPayloadParticles() {
  const COUNT = 26
  const pRef  = useRef<THREE.Points>(null!)
  const vels  = useRef(new Float32Array(COUNT * 3))

  useEffect(() => {
    const geo = pRef.current.geometry
    const pos = new Float32Array(COUNT * 3)
    const vel = vels.current
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * Math.PI * 2
      const r = 0.10 + Math.random() * 0.25
      pos[i * 3]     = Math.cos(a) * r
      pos[i * 3 + 1] = -0.62 + (Math.random() - 0.5) * 0.22
      pos[i * 3 + 2] = Math.sin(a) * r
      vel[i * 3]     = (Math.random() - 0.5) * 0.0022
      vel[i * 3 + 1] = 0.0007 + Math.random() * 0.001
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.0022
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  }, [])

  useFrame(() => {
    const attr = pRef.current?.geometry.attributes.position
    if (!attr) return
    const arr = attr.array as Float32Array
    const vel = vels.current
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3]     += vel[i * 3]
      arr[i * 3 + 1] += vel[i * 3 + 1]
      arr[i * 3 + 2] += vel[i * 3 + 2]
      const d = Math.sqrt(arr[i * 3] ** 2 + arr[i * 3 + 2] ** 2)
      if (d > 0.72 || arr[i * 3 + 1] > -0.25) {
        const a = Math.random() * Math.PI * 2
        const r = 0.06 + Math.random() * 0.16
        arr[i * 3]     = Math.cos(a) * r
        arr[i * 3 + 1] = -0.62 + (Math.random() - 0.5) * 0.14
        arr[i * 3 + 2] = Math.sin(a) * r
      }
    }
    attr.needsUpdate = true
  })

  return (
    <points ref={pRef}>
      <bufferGeometry />
      <pointsMaterial size={0.014} color={C.green} transparent opacity={0.44} sizeAttenuation />
    </points>
  )
}

/* ── Foreground particles — stronger parallax layer ─────────── */
function FgParticles() {
  const COUNT = 20
  const pRef  = useRef<THREE.Points>(null!)

  useEffect(() => {
    const geo = pRef.current.geometry
    const pos = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 4.5
      pos[i * 3 + 1] = (Math.random() - 0.5) * 3.5
      pos[i * 3 + 2] = 1.2 + Math.random() * 1.5
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  }, [])

  useFrame(() => {
    const attr = pRef.current?.geometry.attributes.position
    if (!attr) return
    const arr = attr.array as Float32Array
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 1] += 0.0009
      if (arr[i * 3 + 1] > 2.2) arr[i * 3 + 1] = -2.2
    }
    attr.needsUpdate = true
  })

  return (
    <points ref={pRef}>
      <bufferGeometry />
      <pointsMaterial size={0.016} color={C.white} transparent opacity={0.17} sizeAttenuation />
    </points>
  )
}

/* ══════════════════════════════════════════════════════════════
   MOTOR POSITIONS
══════════════════════════════════════════════════════════════ */
const MOTORS: [number, number, number][] = [
  [ 1.04, 0,  1.04],
  [-1.04, 0,  1.04],
  [ 1.04, 0, -1.04],
  [-1.04, 0, -1.04],
]

/* ── Drone assembly — includes all medical effects ──────────── */
function DroneAssembly({ mouseRef, hoverRef }: {
  mouseRef: React.MutableRefObject<{ x: number; y: number }>
  hoverRef: HoverRef
}) {
  const groupRef  = useRef<THREE.Group>(null!)
  const lightRef  = useRef<THREE.PointLight>(null!)
  const cy = useRef(0)
  const cp = useRef(0)

  useFrame(({ clock }) => {
    const t     = clock.elapsedTime
    const hover = hoverRef.current

    cy.current += (mouseRef.current.x * 0.30 - cy.current) * 0.044
    cp.current += (mouseRef.current.y * 0.15 - cp.current) * 0.044

    groupRef.current.rotation.y = cy.current
    groupRef.current.rotation.x = cp.current
    groupRef.current.position.y = Math.sin(t * 0.86) * 0.11
    groupRef.current.rotation.z = Math.sin(t * 0.60) * 0.015

    if (lightRef.current) lightRef.current.intensity = 0.20 + hover * 0.36
  })

  return (
    <group ref={groupRef}>
      {/* ── Structural body ───────────────────── */}
      <mesh position={[0, 0.10, 0]}>
        <boxGeometry args={[0.52, 0.054, 0.42]} />
        <meshStandardMaterial color={C.graphite} roughness={0.30} metalness={0.70} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.48, 0.152, 0.38]} />
        <meshStandardMaterial color={C.graphiteM} roughness={0.38} metalness={0.62} />
      </mesh>
      <mesh position={[0, -0.082, 0]}>
        <sphereGeometry args={[0.112, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={C.metal} roughness={0.16} metalness={0.88} />
      </mesh>
      <mesh position={[0, 0.022, 0.193]}>
        <boxGeometry args={[0.27, 0.026, 0.003]} />
        <meshStandardMaterial color={C.crimson} emissive={C.crimson} emissiveIntensity={0.38} roughness={0.28} />
      </mesh>

      {/* ── Propulsion ────────────────────────── */}
      {MOTORS.map((mp, i) => <Arm key={i} to={mp} />)}
      {MOTORS.map((mp, i) => <Motor key={i} pos={mp} />)}
      {MOTORS.map((mp, i) => (
        <Prop key={i} pos={[mp[0], mp[1] + 0.096, mp[2]]} dir={i % 2 === 0 ? 1 : -1} />
      ))}

      {/* ── Navigation lights ─────────────────── */}
      <NavLight pos={[ 1.04, 0.046, -1.04]} color={C.green}   phase={0.0} hoverRef={hoverRef} />
      <NavLight pos={[-1.04, 0.046, -1.04]} color={C.crimson} phase={1.1} hoverRef={hoverRef} />
      <NavLight pos={[ 1.04, 0.046,  1.04]} color={C.orange}  phase={2.2} hoverRef={hoverRef} />
      <NavLight pos={[-1.04, 0.046,  1.04]} color={C.orange}  phase={3.3} hoverRef={hoverRef} />

      {/* ── Landing gear ──────────────────────── */}
      {([-0.19, 0.19] as number[]).flatMap((x, xi) =>
        ([-0.17, 0.17] as number[]).map((z, zi) => (
          <mesh key={`${xi}-${zi}`} position={[x, -0.21, z]}>
            <boxGeometry args={[0.027, 0.165, 0.027]} />
            <meshStandardMaterial color={C.metal} roughness={0.30} metalness={0.72} />
          </mesh>
        ))
      )}
      {([-0.19, 0.19] as number[]).map((x, i) => (
        <mesh key={i} position={[x, -0.295, 0]}>
          <boxGeometry args={[0.030, 0.015, 0.44]} />
          <meshStandardMaterial color={C.metal} roughness={0.26} metalness={0.66} />
        </mesh>
      ))}

      {/* ── Medical payload ───────────────────── */}
      <Payload hoverRef={hoverRef} />

      {/* ── Medical / cold-chain effects ──────── */}
      <ColdChainField  hoverRef={hoverRef} />
      <HeartbeatPulse  hoverRef={hoverRef} />
      <MedPayloadParticles />
      <MedScanRing hoverRef={hoverRef} color={C.green}   speed={0.27} offset={0.0} />
      <MedScanRing hoverRef={hoverRef} color={C.crimson} speed={0.21} offset={0.5} />

      {/* ── Holographic rings ─────────────────── */}
      <ScanRing />
      <OrbitRing />

      {/* ── Dynamic medical point light ───────── */}
      <pointLight ref={lightRef} position={[0, -0.5, 0.8]} intensity={0.20}
        color={C.crimson} distance={4} decay={2} />
    </group>
  )
}

/* ── Scene — manages parallax layers + hover smoothing ──────── */
function Scene({ mouseRef, isHoveredRef, hoverRef }: {
  mouseRef:     React.MutableRefObject<{ x: number; y: number }>
  isHoveredRef: React.MutableRefObject<boolean>
  hoverRef:     HoverRef
}) {
  const bgRef = useRef<THREE.Group>(null!)
  const fgRef = useRef<THREE.Group>(null!)
  const bx = useRef(0); const by = useRef(0)
  const fx = useRef(0); const fy = useRef(0)

  useFrame(() => {
    // Smooth hover value (0 → 1)
    hoverRef.current += ((isHoveredRef.current ? 1 : 0) - hoverRef.current) * 0.05

    // Background: slow parallax drift
    bx.current += (mouseRef.current.x * 0.06 - bx.current) * 0.025
    by.current += (mouseRef.current.y * 0.04 - by.current) * 0.025
    bgRef.current.position.x = bx.current
    bgRef.current.position.y = by.current

    // Foreground: faster parallax
    fx.current += (mouseRef.current.x * 0.15 - fx.current) * 0.042
    fy.current += (mouseRef.current.y * 0.09 - fy.current) * 0.042
    fgRef.current.position.x = fx.current
    fgRef.current.position.y = fy.current
  })

  return (
    <>
      <group ref={bgRef}><BgParticles /></group>
      <DroneAssembly mouseRef={mouseRef} hoverRef={hoverRef} />
      <group ref={fgRef}><FgParticles /></group>
    </>
  )
}

/* ── Main exported component ─────────────────────────────────── */
export function DroneShowcase() {
  const mouseRef     = useRef({ x: 0, y: 0 })
  const isHoveredRef = useRef(false)
  const hoverRef     = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = containerRef.current!.getBoundingClientRect()
    mouseRef.current = {
      x:  ((e.clientX - r.left) / r.width  - 0.5) * 2,
      y: -((e.clientY - r.top)  / r.height - 0.5) * 2,
    }
  }, [])

  const onMouseEnter = useCallback(() => { isHoveredRef.current = true  }, [])
  const onMouseLeave = useCallback(() => {
    mouseRef.current     = { x: 0, y: 0 }
    isHoveredRef.current = false
  }, [])

  return (
    <div
      ref={containerRef}
      onMouseMove={onMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ height: '500px' }}
      className="w-full"
    >
      <Canvas
        camera={{ position: [0, 1.2, 6.5], fov: 40 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault() }, false)
        }}
      >
        <ambientLight intensity={0.78} color="#d8e8f0" />
        <directionalLight position={[3, 7, 4]}   intensity={1.10} color="#e8f0f4" />
        <directionalLight position={[-3, 2, -2]} intensity={0.32} color="#c0d4dc" />
        <pointLight       position={[0, -1.5, 1.5]} intensity={0.22} color={C.crimson} />
        <Scene mouseRef={mouseRef} isHoveredRef={isHoveredRef} hoverRef={hoverRef} />
      </Canvas>
    </div>
  )
}
