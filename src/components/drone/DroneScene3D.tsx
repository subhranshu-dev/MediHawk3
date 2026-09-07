import { useRef, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '@/store'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function droneRotorSpeed(status: string): number {
  switch (status) {
    case 'preparing':                return 10
    case 'in_flight': case 'returning': return 24
    case 'available':                return 1.5
    default:                         return 0
  }
}

function tempToStatus(temp: number): 'safe' | 'warning' | 'critical' {
  if (temp <= 8)  return 'safe'
  if (temp <= 12) return 'warning'
  return 'critical'
}

const STATUS_COLOR   = { safe: '#16A34A', warning: '#D97706', critical: '#DC2626' } as const
const STATUS_EMISSIVE = { safe: '#22C55E', warning: '#F59E0B', critical: '#EF4444' } as const

// ─── Navigation light ─────────────────────────────────────────────────────────

function NavLight({ position, color, phase }: {
  position: [number, number, number]; color: string; phase: number
}) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const pulse = Math.max(0, Math.sin(clock.getElapsedTime() * 2.8 + phase * Math.PI * 2))
    ;(ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + pulse * 2.5
  })
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.05, 7, 7]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.1} />
    </mesh>
  )
}

// ─── Medical payload pod ──────────────────────────────────────────────────────

function PayloadPod({ tempStatus }: { tempStatus: 'safe' | 'warning' | 'critical' }) {
  const glowRef  = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)

  useFrame(({ clock }) => {
    const beat = 0.55 + Math.sin(clock.getElapsedTime() * 1.3) * 0.3
    if (glowRef.current)
      (glowRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = beat
    if (lightRef.current)
      lightRef.current.intensity = beat * 0.3
  })

  const sc = STATUS_COLOR[tempStatus]
  const se = STATUS_EMISSIVE[tempStatus]

  return (
    <group position={[0, -0.66, 0]}>
      {/* Main ivory body */}
      <mesh castShadow>
        <boxGeometry args={[0.88, 0.36, 0.62]} />
        <meshStandardMaterial color="#DED9D0" metalness={0.03} roughness={0.50} />
      </mesh>

      {/* Top face — cooler ivory */}
      <mesh position={[0, 0.195, 0]}>
        <boxGeometry args={[0.86, 0.01, 0.60]} />
        <meshStandardMaterial color="#CAC4BB" metalness={0.05} roughness={0.55} />
      </mesh>

      {/* Front medical cross — vertical */}
      <mesh position={[0, 0.02, 0.325]}>
        <boxGeometry args={[0.06, 0.2, 0.013]} />
        <meshStandardMaterial color="#DC2626" emissive="#DC2626" emissiveIntensity={0.5} roughness={0.2} />
      </mesh>
      {/* Front medical cross — horizontal */}
      <mesh position={[0, 0.02, 0.325]}>
        <boxGeometry args={[0.2, 0.06, 0.013]} />
        <meshStandardMaterial color="#DC2626" emissive="#DC2626" emissiveIntensity={0.5} roughness={0.2} />
      </mesh>

      {/* Door seam */}
      <mesh position={[0, 0, 0.327]}>
        <boxGeometry args={[0.84, 0.004, 0.004]} />
        <meshStandardMaterial color="#B5AFA8" roughness={0.8} />
      </mesh>

      {/* Cold-chain status indicator */}
      <mesh ref={glowRef} position={[0.34, 0.06, 0.326]}>
        <sphereGeometry args={[0.048, 8, 8]} />
        <meshStandardMaterial color={sc} emissive={se} emissiveIntensity={0.55} roughness={0.1} />
      </mesh>
      <pointLight ref={lightRef} position={[0.34, 0.06, 0.45]} color={se} intensity={0.25} distance={2} decay={2} />

      {/* Mount struts */}
      {([[-0.32, 0.23, -0.24], [0.32, 0.23, -0.24],
         [-0.32, 0.23,  0.24], [0.32, 0.23,  0.24]] as [number,number,number][]).map((p, i) => (
        <mesh key={i} position={p}>
          <cylinderGeometry args={[0.03, 0.03, 0.18, 6]} />
          <meshStandardMaterial color="#1C1F2E" metalness={0.82} roughness={0.18} />
        </mesh>
      ))}

      {/* Central mount block */}
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.16, 0.13, 0.16]} />
        <meshStandardMaterial color="#1C1F2E" metalness={0.80} roughness={0.20} />
      </mesh>
    </group>
  )
}

// ─── Rotor assembly ───────────────────────────────────────────────────────────

function RotorAssembly({ position, dir, speedRef }: {
  position: [number, number, number]; dir: 1 | -1
  speedRef: React.MutableRefObject<number>
}) {
  const blade1 = useRef<THREE.Mesh>(null)
  const blade2 = useRef<THREE.Mesh>(null)
  const disc   = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    const spd = speedRef.current * dir
    blade1.current && (blade1.current.rotation.y += spd * delta)
    blade2.current && (blade2.current.rotation.y += spd * delta)
    if (disc.current) {
      const t = Math.min(Math.abs(speedRef.current) / 24, 1)
      ;(disc.current.material as THREE.MeshStandardMaterial).opacity = t * 0.25
    }
  })

  return (
    <group position={position}>
      {/* Motor housing */}
      <mesh>
        <cylinderGeometry args={[0.24, 0.24, 0.13, 18]} />
        <meshStandardMaterial color="#20243A" metalness={0.92} roughness={0.08} />
      </mesh>
      {/* Top cap */}
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.09, 0.24, 0.045, 18]} />
        <meshStandardMaterial color="#2A2E46" metalness={0.86} roughness={0.14} />
      </mesh>

      {/* Blade A */}
      <mesh ref={blade1} position={[0, 0.11, 0]}>
        <boxGeometry args={[0.84, 0.02, 0.09]} />
        <meshStandardMaterial color="#3A4058" metalness={0.3} roughness={0.7} transparent opacity={0.90} />
      </mesh>
      {/* Blade B */}
      <mesh ref={blade2} position={[0, 0.11, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[0.84, 0.02, 0.09]} />
        <meshStandardMaterial color="#3A4058" metalness={0.3} roughness={0.7} transparent opacity={0.90} />
      </mesh>

      {/* Motion blur disc — smaller to match blade span */}
      <mesh ref={disc} position={[0, 0.115, 0]}>
        <cylinderGeometry args={[0.40, 0.40, 0.007, 32]} />
        <meshStandardMaterial color="#9AA4C0" transparent opacity={0} roughness={0.9} />
      </mesh>
    </group>
  )
}

// ─── Complete drone body ──────────────────────────────────────────────────────

function MedicalDroneBody() {
  const bodyRef  = useRef<THREE.Group>(null)
  const speedRef = useRef(2)

  const drone   = useStore(s => s.drones.find(d => d.status === 'in_flight') ?? s.drones[0])
  const mission = useStore(s => s.activeMission)

  const ARM_CFG: Array<{ pos: [number,number,number]; dir: 1|-1; navColor: string; phase: number }> = [
    { pos: [ 1.40,  0.11,  1.40], dir:  1, navColor: '#22C55E', phase: 0.00 },
    { pos: [-1.40,  0.11,  1.40], dir: -1, navColor: '#22C55E', phase: 0.25 },
    { pos: [ 1.40,  0.11, -1.40], dir: -1, navColor: '#EF4444', phase: 0.50 },
    { pos: [-1.40,  0.11, -1.40], dir:  1, navColor: '#EF4444', phase: 0.75 },
  ]

  useFrame((_, delta) => {
    if (!bodyRef.current) return
    const t = performance.now() / 1000

    // Rotor speed
    const targetRPM = droneRotorSpeed(drone?.status ?? 'available')
    speedRef.current += (targetRPM - speedRef.current) * delta * 2.2

    // Natural hover oscillation
    bodyRef.current.position.y = Math.sin(t * 0.72) * 0.065

    // Slight forward pitch from speed
    const spd = drone?.speed ?? 0
    const tiltX = mission?.status === 'in_flight' ? -Math.min(spd / 90, 1) * 0.11 : 0
    bodyRef.current.rotation.x += (tiltX - bodyRef.current.rotation.x) * delta * 1.8

    // Gentle heading sway
    bodyRef.current.rotation.y = Math.sin(t * 0.11) * 0.055
  })

  const tempStatus  = tempToStatus(drone?.temperature ?? 5.8)
  const altitudeY   = ((drone?.altitude ?? 80) / 100) * 0.55 - 0.05

  return (
    <group ref={bodyRef} position={[0, altitudeY, 0]}>

      {/* ── Central fuselage ─────────────────────────────────────────────── */}
      <mesh castShadow>
        <boxGeometry args={[1.50, 0.32, 1.50]} />
        {/* Visible blue-graphite — clearly separated from near-black background */}
        <meshStandardMaterial color="#4A5070" metalness={0.42} roughness={0.56} />
      </mesh>

      {/* Equipment fairing top */}
      <mesh position={[0, 0.21, 0]} castShadow>
        <boxGeometry args={[0.95, 0.19, 0.95]} />
        <meshStandardMaterial color="#404565" metalness={0.40} roughness={0.58} />
      </mesh>

      {/* Sensor dome */}
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.21, 0.40, 0.11, 20]} />
        <meshStandardMaterial color="#32374E" metalness={0.72} roughness={0.28} />
      </mesh>

      {/* Brand stripe front */}
      <mesh position={[0, 0.04, 0.765]}>
        <boxGeometry args={[0.95, 0.038, 0.010]} />
        <meshStandardMaterial color="#DC2626" emissive="#DC2626" emissiveIntensity={0.28} roughness={0.2} />
      </mesh>

      {/* ── Arms ─────────────────────────────────────────────────────────── */}
      {ARM_CFG.map(({ pos }, i) => {
        const angle = i < 2 ? Math.PI / 4 : -Math.PI / 4
        return (
          <group key={i}>
            <mesh position={[pos[0]*0.48, 0, pos[2]*0.48]} rotation={[0, angle, 0]} castShadow>
              <boxGeometry args={[2.16, 0.088, 0.096]} />
              <meshStandardMaterial color="#282D42" metalness={0.86} roughness={0.14} />
            </mesh>
            {/* Arm-body brace */}
            <mesh position={[pos[0]*0.25, 0.045, pos[2]*0.25]}>
              <boxGeometry args={[0.11, 0.16, 0.11]} />
              <meshStandardMaterial color="#1E2235" metalness={0.84} roughness={0.16} />
            </mesh>
          </group>
        )
      })}

      {/* ── Rotor assemblies ─────────────────────────────────────────────── */}
      {ARM_CFG.map(({ pos, dir }, i) => (
        <RotorAssembly key={i} position={pos} dir={dir} speedRef={speedRef} />
      ))}

      {/* ── Nav lights ───────────────────────────────────────────────────── */}
      {ARM_CFG.map(({ pos, navColor, phase }, i) => (
        <NavLight key={i} position={[pos[0], pos[1]+0.13, pos[2]]} color={navColor} phase={phase} />
      ))}

      {/* ── Underside sensor pod ─────────────────────────────────────────── */}
      <mesh position={[0, -0.23, 0]}>
        <sphereGeometry args={[0.18, 18, 18]} />
        <meshStandardMaterial color="#12141E" metalness={0.92} roughness={0.08} />
      </mesh>

      {/* ── Landing legs ─────────────────────────────────────────────────── */}
      {([[-0.60,-0.32,-0.60],[0.60,-0.32,-0.60],
         [-0.60,-0.32, 0.60],[0.60,-0.32, 0.60]] as [number,number,number][]).map((p,i)=>(
        <mesh key={i} position={p} castShadow>
          <cylinderGeometry args={[0.036,0.036,0.33,6]} />
          <meshStandardMaterial color="#14172A" metalness={0.82} roughness={0.18} />
        </mesh>
      ))}

      {/* ── Medical payload pod ──────────────────────────────────────────── */}
      <PayloadPod tempStatus={tempStatus} />

    </group>
  )
}

// ─── Flight corridor (route passes BELOW the drone) ──────────────────────────

function FlightCorridor() {
  // Route arc stays well below the drone (y ≤ -0.75 at all points)
  const pts = useMemo(() => [
    new THREE.Vector3(-5.5, -2.0,  0.5),
    new THREE.Vector3(-3.5, -0.8,  0.3),
    new THREE.Vector3(-1.5, -0.75, 0.15),
    new THREE.Vector3( 0,   -0.78, 0),
    new THREE.Vector3( 1.5, -0.75,-0.15),
    new THREE.Vector3( 3.5, -0.8, -0.3),
    new THREE.Vector3( 5.5, -2.0, -0.5),
  ], [])

  const curve   = useMemo(() => new THREE.CatmullRomCurve3(pts), [pts])
  const tubeGeo = useMemo(() => new THREE.TubeGeometry(curve, 80, 0.010, 5, false), [curve])

  const dotRef     = useRef<THREE.Mesh>(null)
  const progressRef = useRef(0.38)
  const drone       = useStore(s => s.drones.find(d => d.status === 'in_flight'))

  useFrame((_, delta) => {
    if (!dotRef.current) return
    if (drone?.status === 'in_flight' || drone?.status === 'returning') {
      const dir = drone.status === 'returning' ? -1 : 1
      progressRef.current = Math.max(0.02, Math.min(0.98, progressRef.current + dir * delta * 0.038))
    }
    const p = curve.getPoint(progressRef.current)
    dotRef.current.position.set(p.x, p.y, p.z)
  })

  return (
    <group>
      {/* Primary corridor tube — thin and restrained */}
      <mesh geometry={tubeGeo}>
        <meshBasicMaterial color="#DC2626" transparent opacity={0.16} />
      </mesh>

      {/* Traveling dot */}
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.055, 10, 10]} />
        <meshBasicMaterial color="#DC2626" transparent opacity={0.75} />
      </mesh>

      {/* HUB origin */}
      <group position={[-5.5, -2.0, 0.5]}>
        <mesh>
          <sphereGeometry args={[0.14, 14, 14]} />
          <meshStandardMaterial color="#16A34A" emissive="#16A34A" emissiveIntensity={0.35} roughness={0.3} />
        </mesh>
        {/* Landing ring */}
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.15, 0]}>
          <ringGeometry args={[0.28, 0.34, 28]} />
          <meshBasicMaterial color="#16A34A" transparent opacity={0.2} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* PHC destination */}
      <group position={[5.5, -2.0, -0.5]}>
        <mesh>
          <sphereGeometry args={[0.14, 14, 14]} />
          <meshStandardMaterial color="#D97706" emissive="#D97706" emissiveIntensity={0.35} roughness={0.3} />
        </mesh>
        {/* Landing ring */}
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.15, 0]}>
          <ringGeometry args={[0.28, 0.34, 28]} />
          <meshBasicMaterial color="#D97706" transparent opacity={0.2} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}

// ─── Camera — safe framing, gentle pendulum, never clips ─────────────────────

function CameraController() {
  const { camera } = useThree()

  // Initial camera setup
  const initialized = useRef(false)
  useFrame(({ clock }) => {
    if (!initialized.current) {
      ;(camera as THREE.PerspectiveCamera).fov = 44
      ;(camera as THREE.PerspectiveCamera).updateProjectionMatrix()
      initialized.current = true
    }

    const t = clock.getElapsedTime()

    // Gentle pendulum — very small x sway to keep full drone in frame
    const sway = Math.sin(t * 0.07)
    camera.position.x = sway * 0.35 + 0.1   // ±0.35 from 0.1 center — never shifts drone off edge
    camera.position.z = 6.2 + Math.sin(t * 0.04) * 0.25  // 5.95 – 6.45, safely far
    camera.position.y = 0.85 + Math.sin(t * 0.055) * 0.10

    camera.lookAt(0, -0.05, 0)
  })

  return null
}

// ─── Lighting ─────────────────────────────────────────────────────────────────

function LightingRig() {
  const drone       = useStore(s => s.drones.find(d => d.status === 'in_flight') ?? s.drones[0])
  const tempStatus  = tempToStatus(drone?.temperature ?? 5.8)

  return (
    <>
      {/* Ambient — strong enough to show body colour clearly */}
      <ambientLight intensity={0.75} color="#FFFFFF" />

      {/* Key light — front upper, slightly warm white */}
      <directionalLight position={[2, 7, 6]} intensity={1.8} color="#EEF0FF" castShadow
        shadow-mapSize-width={512} shadow-mapSize-height={512}
      />

      {/* Rim light — behind drone, cool blue-white defines silhouette */}
      <pointLight position={[-4, 2, -5]} intensity={1.6} color="#C8D4FF" distance={16} decay={2} />

      {/* Secondary rim — opposite side */}
      <pointLight position={[ 4, 1, -5]} intensity={0.9} color="#C8D4FF" distance={14} decay={2} />

      {/* Top fill */}
      <pointLight position={[0, 6, 1]}   intensity={0.6} color="#FFFFFF"  distance={10} decay={2} />

      {/* Underside crimson — brand accent */}
      <pointLight position={[0, -3, 1]}  intensity={0.7} color="#DC2626"  distance={8}  decay={2} />

      {/* Payload warm fill from below-front */}
      <pointLight position={[0, -1.4, 2]} intensity={0.55} color="#F0EDE8" distance={5} decay={2} />

      {/* Status glow from payload area */}
      <pointLight
        position={[0, -0.8, 1.2]}
        intensity={0.4}
        color={STATUS_EMISSIVE[tempStatus]}
        distance={3.5}
        decay={2}
      />
    </>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene() {
  return (
    <>
      <CameraController />
      <LightingRig />
      {/* No fog — transparent canvas must show page background through */}
      <MedicalDroneBody />
      <FlightCorridor />
    </>
  )
}

// ─── Public export ─────────────────────────────────────────────────────────────

interface DroneScene3DProps {
  height?: number
  className?: string
}

export function DroneScene3D({ height = 480, className }: DroneScene3DProps) {
  return (
    <div style={{ height }} className={className}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0.1, 0.85, 6.2], fov: 44 }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color(0, 0, 0), 0)
        }}
      >
        <Scene />
      </Canvas>
    </div>
  )
}

// ─── Mini drone for admin fleet cards ────────────────────────────────────────

function MiniDroneBody({ color = '#DC2626' }: { color?: string }) {
  const bodyRef = useRef<THREE.Group>(null)
  const prop1   = useRef<THREE.Mesh>(null)
  const prop2   = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (bodyRef.current) bodyRef.current.rotation.y = t * 0.3
    if (prop1.current)   prop1.current.rotation.y   = t * 20
    if (prop2.current)   prop2.current.rotation.y   = -t * 20
  })

  return (
    <group ref={bodyRef} scale={0.4}>
      <mesh>
        <boxGeometry args={[1.2, 0.25, 1.2]} />
        <meshStandardMaterial color="#2E3348" metalness={0.80} roughness={0.20} />
      </mesh>
      {([[-0.8,0,-0.8],[0.8,0,0.8]] as [number,number,number][]).map((pos,i)=>(
        <mesh key={i} ref={i===0?prop1:prop2} position={pos}>
          <boxGeometry args={[0.9, 0.03, 0.1]} />
          <meshStandardMaterial color="#3A4058" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.06, 0.03, 0.2]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.2, 0.03, 0.06]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} />
      </mesh>
    </group>
  )
}

export function MiniDroneScene({ color, height = 80 }: { color?: string; height?: number }) {
  return (
    <div style={{ height, width: height }}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 1, 2.5], fov: 50 }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => { gl.setClearColor(new THREE.Color(0,0,0), 0) }}
      >
        <ambientLight intensity={0.55} />
        <pointLight position={[0, 2, 1]} intensity={1.5} color="#fff" />
        <Float speed={1.5} floatIntensity={0.5}>
          <MiniDroneBody color={color} />
        </Float>
      </Canvas>
    </div>
  )
}
