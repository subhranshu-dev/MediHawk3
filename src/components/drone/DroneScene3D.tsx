import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Float, Html } from '@react-three/drei'
import * as THREE from 'three'

// ─── Types & constants ────────────────────────────────────────────────────────

type SimPhase =
  | 'IDLE' | 'ARMING' | 'TAKEOFF' | 'CRUISE'
  | 'APPROACHING' | 'LANDING' | 'LANDED'
  | 'DELIVERY' | 'RTL_TAKEOFF' | 'RTL_CRUISE'
  | 'RTL_LANDING' | 'COMPLETE'

const WP_HUB = new THREE.Vector3(-4.2, 0.0,  0.6)
const WP_PHC = new THREE.Vector3( 4.2, 0.0, -0.6)

const ROUTE_POINTS = [
  WP_HUB.clone(),
  new THREE.Vector3(-3.2, 1.00,  0.44),
  new THREE.Vector3(-1.6, 1.30,  0.20),
  new THREE.Vector3(-0.2, 1.38,  0.00),
  new THREE.Vector3( 1.4, 1.32, -0.20),
  new THREE.Vector3( 3.0, 0.95, -0.44),
  WP_PHC.clone(),
]
const ROUTE_CURVE = new THREE.CatmullRomCurve3(ROUTE_POINTS, false, 'catmullrom', 0.5)

const PHASE_DUR: Record<SimPhase, number> = {
  IDLE: 2.5, ARMING: 2.0, TAKEOFF: 3.0, CRUISE: 9.0,
  APPROACHING: 2.0, LANDING: 3.0, LANDED: 1.5, DELIVERY: 3.0,
  RTL_TAKEOFF: 3.0, RTL_CRUISE: 9.0, RTL_LANDING: 3.0, COMPLETE: 1.5,
}
const PHASE_SEQ: SimPhase[] = [
  'IDLE','ARMING','TAKEOFF','CRUISE','APPROACHING','LANDING',
  'LANDED','DELIVERY','RTL_TAKEOFF','RTL_CRUISE','RTL_LANDING','COMPLETE',
]

// ─── Singleton sim state ──────────────────────────────────────────────────────

interface SimState {
  phase: SimPhase; phaseStartTime: number; curveT: number
  dronePos: THREE.Vector3; prevPos: THREE.Vector3
  droneYaw: number; dronePitch: number; droneRoll: number
  rotorSpeed: number; payloadDeliveryT: number
}
const simState: SimState = {
  phase: 'IDLE', phaseStartTime: 0, curveT: 0,
  dronePos: WP_HUB.clone(), prevPos: WP_HUB.clone(),
  droneYaw: 0, dronePitch: 0, droneRoll: 0,
  rotorSpeed: 0, payloadDeliveryT: 0,
}

// ─── Arm geometry pre-compute ─────────────────────────────────────────────────

function computeArmTransform(from: THREE.Vector3, to: THREE.Vector3) {
  const dir = new THREE.Vector3().subVectors(to, from)
  const len = dir.length()
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5)
  const q   = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize())
  return { len, mid, q }
}

const ARM_CFG = [
  { root: new THREE.Vector3( 0.60, 0.02,  0.60), tip: new THREE.Vector3( 1.42, 0.10,  1.42), dir:  1 as 1|-1, nav: '#22C55E', phase: 0.00 },
  { root: new THREE.Vector3(-0.60, 0.02,  0.60), tip: new THREE.Vector3(-1.42, 0.10,  1.42), dir: -1 as 1|-1, nav: '#22C55E', phase: 0.25 },
  { root: new THREE.Vector3( 0.60, 0.02, -0.60), tip: new THREE.Vector3( 1.42, 0.10, -1.42), dir: -1 as 1|-1, nav: '#EF4444', phase: 0.50 },
  { root: new THREE.Vector3(-0.60, 0.02, -0.60), tip: new THREE.Vector3(-1.42, 0.10, -1.42), dir:  1 as 1|-1, nav: '#EF4444', phase: 0.75 },
].map(c => ({ ...c, xf: computeArmTransform(c.root, c.tip) }))

// ─── Math ─────────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }
function easeInOut(t: number) { return t < 0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2 }
function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x-e0)/(e1-e0),0,1); return t*t*(3-2*t)
}

function getCurveT(phase: SimPhase, p: number): number {
  const t = clamp(easeInOut(p),0,1)
  switch (phase) {
    case 'TAKEOFF':     return t * 0.12
    case 'CRUISE':      return 0.12 + t * 0.76
    case 'APPROACHING': return 0.88 + t * 0.09
    case 'LANDING':     return 0.97 + t * 0.03
    case 'LANDED': case 'DELIVERY': return 1.0
    case 'RTL_TAKEOFF': return 1.0 - t * 0.12
    case 'RTL_CRUISE':  return 0.88 - t * 0.76
    case 'RTL_LANDING': return 0.12 - t * 0.12
    default:            return 0.0
  }
}
function getTargetRPM(phase: SimPhase): number {
  switch (phase) {
    case 'IDLE': case 'COMPLETE': return 0
    case 'ARMING':                return 8
    case 'LANDED': case 'DELIVERY': return 4
    case 'LANDING': case 'RTL_LANDING': return 14
    default:                      return 24
  }
}

// ─── Navigation light ─────────────────────────────────────────────────────────

function NavLight({ position, color, phase }: {
  position: [number,number,number]; color: string; phase: number
}) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const pulse = Math.max(0, Math.sin(clock.getElapsedTime() * 2.6 + phase * Math.PI * 2))
    ;(ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + pulse * 3.2
  })
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.044, 8, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.06} />
    </mesh>
  )
}

// ─── Rotor assembly — graphite with metallic ring ─────────────────────────────

function RotorAssembly({ position, dir, speedRef }: {
  position: [number,number,number]; dir: 1|-1
  speedRef: React.MutableRefObject<number>
}) {
  const blade1   = useRef<THREE.Mesh>(null)
  const blade2   = useRef<THREE.Mesh>(null)
  const disc     = useRef<THREE.Mesh>(null)
  const orangeRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    const spd = speedRef.current * dir
    blade1.current && (blade1.current.rotation.y += spd * delta)
    blade2.current && (blade2.current.rotation.y += spd * delta)
    if (disc.current)
      (disc.current.material as THREE.MeshStandardMaterial).opacity =
        Math.min(Math.abs(speedRef.current) / 24, 1) * 0.20
    if (orangeRef.current) {
      const armed = simState.phase !== 'IDLE' && simState.phase !== 'COMPLETE'
      const beat = armed ? 0.8 + Math.sin(Date.now() * 0.003) * 0.3 : 0.15
      ;(orangeRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = beat
    }
  })

  return (
    <group position={position}>
      {/* Lower graphite mount */}
      <mesh position={[0, -0.055, 0]}>
        <cylinderGeometry args={[0.245, 0.245, 0.055, 16]} />
        <meshStandardMaterial color="#191D25" metalness={0.50} roughness={0.32} />
      </mesh>
      {/* Metallic separator ring */}
      <mesh position={[0, -0.025, 0]}>
        <cylinderGeometry args={[0.256, 0.256, 0.022, 16]} />
        <meshStandardMaterial color="#38404E" metalness={0.82} roughness={0.16} />
      </mesh>
      {/* Main motor can */}
      <mesh>
        <cylinderGeometry args={[0.215, 0.215, 0.115, 16]} />
        <meshStandardMaterial color="#1B1F27" metalness={0.54} roughness={0.24} />
      </mesh>
      {/* Bell cap */}
      <mesh position={[0, 0.070, 0]}>
        <cylinderGeometry args={[0.082, 0.215, 0.042, 16]} />
        <meshStandardMaterial color="#22262E" metalness={0.52} roughness={0.28} />
      </mesh>
      {/* Orange status indicator */}
      <mesh ref={orangeRef} position={[0.228, -0.028, 0]}>
        <sphereGeometry args={[0.030, 8, 8]} />
        <meshStandardMaterial color="#F97316" emissive="#F97316" emissiveIntensity={0.15} roughness={0.08} />
      </mesh>
      {/* Blade A */}
      <mesh ref={blade1} position={[0, 0.104, 0]}>
        <boxGeometry args={[0.86, 0.011, 0.075]} />
        <meshStandardMaterial color="#282C36" metalness={0.18} roughness={0.52} transparent opacity={0.97} />
      </mesh>
      {/* Blade B */}
      <mesh ref={blade2} position={[0, 0.104, 0]} rotation={[0, Math.PI/2, 0]}>
        <boxGeometry args={[0.86, 0.011, 0.075]} />
        <meshStandardMaterial color="#282C36" metalness={0.18} roughness={0.52} transparent opacity={0.97} />
      </mesh>
      {/* Hub */}
      <mesh position={[0, 0.104, 0]}>
        <cylinderGeometry args={[0.038, 0.038, 0.030, 10]} />
        <meshStandardMaterial color="#0C0E16" metalness={0.86} roughness={0.20} />
      </mesh>
      {/* Spin disc */}
      <mesh ref={disc} position={[0, 0.104, 0]}>
        <cylinderGeometry args={[0.44, 0.44, 0.004, 32]} />
        <meshStandardMaterial color="#C8CAD0" transparent opacity={0} roughness={0.95} />
      </mesh>
    </group>
  )
}

// ─── Arm — deep graphite carbon composite, tapered ───────────────────────────

function DroneArm({ len, mid, q }: { len: number; mid: THREE.Vector3; q: THREE.Quaternion }) {
  return (
    <group position={mid} quaternion={q}>
      {/* Tapered structural tube */}
      <mesh>
        <cylinderGeometry args={[0.030, 0.055, len, 10]} />
        <meshStandardMaterial color="#1C2028" metalness={0.44} roughness={0.34} />
      </mesh>
      {/* Mid stiffener collar */}
      <mesh>
        <cylinderGeometry args={[0.062, 0.062, 0.022, 10]} />
        <meshStandardMaterial color="#14161C" metalness={0.60} roughness={0.26} />
      </mesh>
      {/* Tip collar */}
      <mesh position={[0, len * 0.36, 0]}>
        <cylinderGeometry args={[0.050, 0.050, 0.018, 10]} />
        <meshStandardMaterial color="#14161C" metalness={0.60} roughness={0.26} />
      </mesh>
    </group>
  )
}

// ─── Fuselage — premium white aerodynamic shell ───────────────────────────────

function Fuselage() {
  return (
    <group>
      {/* === PRIMARY BODY === */}
      <mesh>
        <boxGeometry args={[1.84, 0.44, 1.42]} />
        <meshStandardMaterial color="#E4EAF4" metalness={0.06} roughness={0.26} />
      </mesh>
      {/* Lower widened shelf */}
      <mesh position={[0, -0.022, 0]}>
        <boxGeometry args={[1.92, 0.36, 1.46]} />
        <meshStandardMaterial color="#E0E6F0" metalness={0.06} roughness={0.28} />
      </mesh>

      {/* === NOSE === */}
      <mesh position={[0, 0.008, 0.834]}>
        <boxGeometry args={[1.64, 0.40, 0.24]} />
        <meshStandardMaterial color="#E6ECF6" metalness={0.06} roughness={0.26} />
      </mesh>
      <mesh position={[0, 0.002, 0.950]}>
        <boxGeometry args={[1.32, 0.32, 0.12]} />
        <meshStandardMaterial color="#E2E8F2" metalness={0.07} roughness={0.28} />
      </mesh>

      {/* === REAR TAPER === */}
      <mesh position={[0, 0.004, -0.822]}>
        <boxGeometry args={[1.56, 0.38, 0.22]} />
        <meshStandardMaterial color="#E2E8F2" metalness={0.07} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.000, -0.930]}>
        <boxGeometry args={[1.20, 0.30, 0.12]} />
        <meshStandardMaterial color="#DCE2EC" metalness={0.07} roughness={0.30} />
      </mesh>

      {/* === UPPER SUPERSTRUCTURE === */}
      <mesh position={[0, 0.326, 0]}>
        <boxGeometry args={[1.16, 0.36, 1.08]} />
        <meshStandardMaterial color="#CED4E0" metalness={0.08} roughness={0.34} />
      </mesh>
      {/* Side flanks */}
      {([-0.706, 0.706] as number[]).map((x, i) => (
        <mesh key={i} position={[x, 0.248, 0]}>
          <boxGeometry args={[0.28, 0.24, 1.10]} />
          <meshStandardMaterial color="#D2D8E4" metalness={0.07} roughness={0.36} />
        </mesh>
      ))}
      {/* Spine */}
      <mesh position={[0, 0.510, 0]}>
        <boxGeometry args={[0.48, 0.22, 0.98]} />
        <meshStandardMaterial color="#C0C6D2" metalness={0.10} roughness={0.38} />
      </mesh>
      {/* Sensor dome */}
      <mesh position={[0, 0.608, 0]}>
        <cylinderGeometry args={[0.172, 0.322, 0.100, 20]} />
        <meshStandardMaterial color="#8A9EB0" metalness={0.56} roughness={0.32} />
      </mesh>

      {/* === FRONT AVIONICS (dark anchor) === */}
      <mesh position={[0, -0.012, 0.768]}>
        <boxGeometry args={[0.60, 0.152, 0.088]} />
        <meshStandardMaterial color="#12161E" metalness={0.90} roughness={0.10} />
      </mesh>
      {/* Primary camera */}
      <mesh position={[0, -0.012, 0.820]} rotation={[Math.PI/2, 0, 0]}>
        <cylinderGeometry args={[0.040, 0.040, 0.018, 14]} />
        <meshStandardMaterial color="#030610" emissive="#1A3560" emissiveIntensity={0.55} metalness={0.96} roughness={0.04} />
      </mesh>
      {/* Side sensors */}
      {([-0.245, 0.245] as number[]).map((x, i) => (
        <mesh key={i} position={[x, -0.012, 0.820]} rotation={[Math.PI/2, 0, 0]}>
          <cylinderGeometry args={[0.017, 0.017, 0.018, 8]} />
          <meshStandardMaterial color="#030610" emissive="#162040" emissiveIntensity={0.28} metalness={0.94} roughness={0.06} />
        </mesh>
      ))}

      {/* === PANEL SEAMS === */}
      {([0.800, -0.800] as number[]).map((z, i) => (
        <mesh key={i} position={[0, 0.062, z]}>
          <boxGeometry args={[1.88, 0.007, 0.007]} />
          <meshStandardMaterial color="#849AAC" roughness={0.90} />
        </mesh>
      ))}
      {([-0.930, 0.930] as number[]).map((x, i) => (
        <mesh key={i} position={[x, 0.062, 0]}>
          <boxGeometry args={[0.007, 0.007, 1.44]} />
          <meshStandardMaterial color="#849AAC" roughness={0.90} />
        </mesh>
      ))}
      {([-0.570, 0.570] as number[]).map((x, i) => (
        <mesh key={i} position={[x, 0.162, 0]}>
          <boxGeometry args={[0.007, 0.007, 1.10]} />
          <meshStandardMaterial color="#9AAABB" roughness={0.90} />
        </mesh>
      ))}

      {/* === MEDIHAWK CRIMSON ACCENTS === */}
      <mesh position={[0, 0.058, 0.808]}>
        <boxGeometry args={[1.22, 0.040, 0.010]} />
        <meshStandardMaterial color="#DC2626" emissive="#DC2626" emissiveIntensity={0.68} roughness={0.14} />
      </mesh>
      {([-0.931, 0.931] as number[]).map((x, i) => (
        <mesh key={i} position={[x, 0.058, 0]}>
          <boxGeometry args={[0.010, 0.040, 1.42]} />
          <meshStandardMaterial color="#DC2626" emissive="#DC2626" emissiveIntensity={0.44} roughness={0.14} />
        </mesh>
      ))}

      {/* === SIDE PANELS === */}
      {([-0.931, 0.931] as number[]).map((x, i) => (
        <mesh key={i} position={[x, 0.038, 0]}>
          <boxGeometry args={[0.009, 0.26, 1.40]} />
          <meshStandardMaterial color="#B0BCC8" metalness={0.22} roughness={0.56} />
        </mesh>
      ))}

      {/* === UNDERSIDE === */}
      <mesh position={[0, -0.228, 0]}>
        <boxGeometry args={[1.80, 0.009, 1.38]} />
        <meshStandardMaterial color="#ACB8C6" metalness={0.26} roughness={0.64} />
      </mesh>
      {/* Gimbal sphere */}
      <mesh position={[0, -0.296, 0.130]}>
        <sphereGeometry args={[0.154, 18, 18]} />
        <meshStandardMaterial color="#0A0C14" metalness={0.94} roughness={0.06} />
      </mesh>
      <mesh position={[0, -0.284, 0.130]}>
        <torusGeometry args={[0.162, 0.016, 8, 22]} />
        <meshStandardMaterial color="#242838" metalness={0.88} roughness={0.12} />
      </mesh>
    </group>
  )
}

// ─── Landing gear — dark graphite ────────────────────────────────────────────

function LandingGear() {
  const LEGS: [number, number][] = [[-0.62, -0.64], [0.62, -0.64], [-0.62, 0.64], [0.62, 0.64]]
  return (
    <group>
      {LEGS.map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x, -0.370, z]}>
            <cylinderGeometry args={[0.026, 0.032, 0.30, 8]} />
            <meshStandardMaterial color="#181C24" metalness={0.52} roughness={0.36} />
          </mesh>
          <mesh position={[x, -0.534, z]}>
            <cylinderGeometry args={[0.046, 0.046, 0.026, 8]} />
            <meshStandardMaterial color="#0E1018" metalness={0.68} roughness={0.28} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -0.386,  0.64]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.020, 0.020, 1.26, 8]} />
        <meshStandardMaterial color="#1C2030" metalness={0.48} roughness={0.40} />
      </mesh>
      <mesh position={[0, -0.386, -0.64]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.020, 0.020, 1.26, 8]} />
        <meshStandardMaterial color="#1C2030" metalness={0.48} roughness={0.40} />
      </mesh>
    </group>
  )
}

// ─── Medical payload pod — delivery animation ────────────────────────────────

function PayloadPod() {
  const groupRef   = useRef<THREE.Group>(null)
  const glowRef    = useRef<THREE.Mesh>(null)
  const lightRef   = useRef<THREE.PointLight>(null)
  const displayRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t     = clock.getElapsedTime()
    const phase = simState.phase
    const dt    = simState.payloadDeliveryT

    if (!groupRef.current) return

    if (phase === 'DELIVERY') {
      groupRef.current.visible = true
      const lowerStart = 0.45
      if (dt > lowerStart) {
        const lp = (dt - lowerStart) / (1 - lowerStart)
        groupRef.current.position.y = -0.68 - 0.75 * easeInOut(lp)
      } else {
        groupRef.current.position.y = -0.68
      }
    } else if (phase === 'RTL_TAKEOFF' || phase === 'RTL_CRUISE' || phase === 'RTL_LANDING' || phase === 'COMPLETE') {
      groupRef.current.visible = false
      groupRef.current.position.y = -0.68
    } else {
      groupRef.current.visible = true
      groupRef.current.position.y = -0.68
    }

    const isDelivery = phase === 'DELIVERY'
    const rate = isDelivery ? 8.0 : 1.2
    const pulse = Math.max(0, Math.sin(t * rate))
    if (glowRef.current)
      (glowRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + pulse * (isDelivery ? 4.5 : 1.8)
    if (lightRef.current)
      lightRef.current.intensity = pulse * (isDelivery ? 1.2 : 0.30)
    if (displayRef.current)
      (displayRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.22 + Math.sin(t * 0.6) * 0.04
  })

  return (
    <group ref={groupRef} position={[0, -0.68, 0]}>
      {/* Main insulated shell */}
      <mesh>
        <boxGeometry args={[0.90, 0.36, 0.62]} />
        <meshStandardMaterial color="#EDE9E0" metalness={0.04} roughness={0.44} />
      </mesh>
      <mesh position={[0, 0.192, 0]}>
        <boxGeometry args={[0.88, 0.011, 0.60]} />
        <meshStandardMaterial color="#C6C0B8" metalness={0.06} roughness={0.54} />
      </mesh>
      {/* Graphite lower rail */}
      <mesh position={[0, -0.204, 0]}>
        <boxGeometry args={[0.88, 0.011, 0.60]} />
        <meshStandardMaterial color="#1A1E28" metalness={0.60} roughness={0.38} />
      </mesh>
      {/* Medical cross */}
      <mesh position={[0, 0.022, 0.320]}>
        <boxGeometry args={[0.058, 0.202, 0.011]} />
        <meshStandardMaterial color="#DC2626" emissive="#DC2626" emissiveIntensity={0.62} roughness={0.16} />
      </mesh>
      <mesh position={[0, 0.022, 0.320]}>
        <boxGeometry args={[0.202, 0.058, 0.011]} />
        <meshStandardMaterial color="#DC2626" emissive="#DC2626" emissiveIntensity={0.62} roughness={0.16} />
      </mesh>
      {/* Temperature display */}
      <mesh ref={displayRef} position={[0.302, -0.040, 0.322]}>
        <boxGeometry args={[0.20, 0.10, 0.009]} />
        <meshStandardMaterial color="#050A14" emissive="#1A9A5A" emissiveIntensity={0.22} roughness={0.04} metalness={0.92} />
      </mesh>
      {/* Latch */}
      <mesh position={[-0.400, 0.020, 0.322]}>
        <boxGeometry args={[0.054, 0.044, 0.013]} />
        <meshStandardMaterial color="#1A1E30" metalness={0.90} roughness={0.10} />
      </mesh>
      {/* Door seam */}
      <mesh position={[0, 0, 0.324]}>
        <boxGeometry args={[0.88, 0.003, 0.003]} />
        <meshStandardMaterial color="#9A948E" roughness={0.84} />
      </mesh>
      {/* Cold-chain LED */}
      <mesh ref={glowRef} position={[0.336, 0.084, 0.325]}>
        <sphereGeometry args={[0.040, 8, 8]} />
        <meshStandardMaterial color="#16A34A" emissive="#22C55E" emissiveIntensity={0.5} roughness={0.08} />
      </mesh>
      <pointLight ref={lightRef} position={[0.336, 0.084, 0.44]} color="#22C55E" intensity={0.30} distance={2} decay={2} />
      {/* Mounting struts */}
      {([[-0.32,0.22,-0.24],[0.32,0.22,-0.24],[-0.32,0.22,0.24],[0.32,0.22,0.24]] as [number,number,number][]).map((p, i) => (
        <mesh key={i} position={p}>
          <cylinderGeometry args={[0.022, 0.022, 0.165, 6]} />
          <meshStandardMaterial color="#181C2C" metalness={0.86} roughness={0.16} />
        </mesh>
      ))}
      <mesh position={[0, 0.240, 0]}>
        <boxGeometry args={[0.14, 0.116, 0.14]} />
        <meshStandardMaterial color="#181C2C" metalness={0.84} roughness={0.18} />
      </mesh>
    </group>
  )
}

// ─── Phase-reactive label ────────────────────────────────────────────────────

function DroneLabel() {
  const spanRef = useRef<HTMLSpanElement>(null)
  useFrame(() => {
    if (!spanRef.current) return
    const p = simState.phase
    let txt: string
    if      (p === 'IDLE' || p === 'COMPLETE')                txt = 'MH-01  ○  READY'
    else if (p === 'ARMING')                                   txt = 'MH-01  ◐  ARMING'
    else if (p === 'TAKEOFF' || p === 'RTL_TAKEOFF')           txt = 'MH-01  ↑  ASCENDING'
    else if (p === 'CRUISE'  || p === 'RTL_CRUISE')            txt = 'MH-01  ●  IN FLIGHT'
    else if (p === 'APPROACHING')                              txt = 'MH-01  →  APPROACHING'
    else if (p === 'LANDING' || p === 'RTL_LANDING')           txt = 'MH-01  ↓  DESCENDING'
    else if (p === 'LANDED')                                   txt = 'MH-01  ■  LANDED'
    else if (p === 'DELIVERY')                                 txt = 'MH-01  ⊕  DELIVERING'
    else                                                       txt = 'MH-01  ●  ACTIVE'
    spanRef.current.textContent = txt
  })
  return (
    <Html position={[0, 1.52, 0]} center distanceFactor={6} style={{ pointerEvents:'none', userSelect:'none' }}>
      <span ref={spanRef} style={{
        fontFamily:"'Space Mono',monospace", fontSize:'9px', color:'#8899BB',
        letterSpacing:'0.18em', whiteSpace:'nowrap',
        textShadow:'0 1px 6px rgba(0,0,0,1)',
      }} />
    </Html>
  )
}

// ─── Complete drone assembly ──────────────────────────────────────────────────

function MedicalDroneBody({ groupRef, speedRef }: {
  groupRef: React.RefObject<THREE.Group | null>
  speedRef: React.MutableRefObject<number>
}) {
  return (
    <group ref={groupRef} scale={1.55}>
      <DroneLabel />
      <Fuselage />
      {ARM_CFG.map(({ xf }, i) => (
        <DroneArm key={i} len={xf.len} mid={xf.mid} q={xf.q} />
      ))}
      {/* Arm root joints — graphite */}
      {ARM_CFG.map(({ root }, i) => (
        <mesh key={i} position={[root.x, root.y, root.z]}>
          <cylinderGeometry args={[0.070, 0.070, 0.115, 10]} />
          <meshStandardMaterial color="#14161E" metalness={0.62} roughness={0.26} />
        </mesh>
      ))}
      {ARM_CFG.map(({ tip, dir }, i) => (
        <RotorAssembly key={i} position={[tip.x, tip.y, tip.z]} dir={dir} speedRef={speedRef} />
      ))}
      {ARM_CFG.map(({ tip, nav, phase }, i) => (
        <NavLight key={i} position={[tip.x, tip.y + 0.17, tip.z]} color={nav} phase={phase} />
      ))}
      <LandingGear />
      <PayloadPod />
    </group>
  )
}

// ─── Landing platform ─────────────────────────────────────────────────────────

function LandingPlatform({ position, color, label, status }: {
  position: [number,number,number]; color: string; label: string; status: string
}) {
  const lightRef = useRef<THREE.PointLight>(null)
  const outerRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (lightRef.current) lightRef.current.intensity = 0.24 + Math.sin(clock.getElapsedTime() * 0.9) * 0.08
    if (outerRef.current) outerRef.current.rotation.z += 0.003
  })
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[1.04, 0.058, 1.04]} />
        <meshStandardMaterial color={color} metalness={0.22} roughness={0.70} />
      </mesh>
      <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.032, 0]}>
        <ringGeometry args={[0.300, 0.375, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={outerRef} rotation={[-Math.PI/2, 0, 0]} position={[0, 0.034, 0]}>
        <ringGeometry args={[0.440, 0.460, 36]} />
        <meshBasicMaterial color={color} transparent opacity={0.26} side={THREE.DoubleSide} />
      </mesh>
      {([[-0.45,-0.45],[-0.45,0.45],[0.45,-0.45],[0.45,0.45]] as [number,number][]).map(([x,z],i) => (
        <mesh key={i} position={[x, 0.062, z]}>
          <cylinderGeometry args={[0.024, 0.024, 0.082, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.28} metalness={0.70} roughness={0.30} />
        </mesh>
      ))}
      <pointLight ref={lightRef} position={[0, 0.45, 0]} color={color} intensity={0.24} distance={4} decay={2} />
      <Html position={[0, 0.62, 0]} center distanceFactor={6} style={{ pointerEvents:'none', userSelect:'none' }}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'2px' }}>
          <span style={{ fontFamily:"'Space Mono',monospace", fontSize:'7px', color,
            letterSpacing:'0.20em', textShadow:'0 1px 4px rgba(0,0,0,0.9)', whiteSpace:'nowrap' }}>{label}</span>
          <span style={{ fontFamily:"'Space Mono',monospace", fontSize:'6px', color:'#445566',
            letterSpacing:'0.18em', textShadow:'0 1px 4px rgba(0,0,0,0.9)', whiteSpace:'nowrap' }}>{status}</span>
        </div>
      </Html>
    </group>
  )
}

// ─── Flight route (subtle) ────────────────────────────────────────────────────

function FlightRoute() {
  const coreTube = useMemo(() => new THREE.TubeGeometry(ROUTE_CURVE, 80, 0.009, 5, false), [])
  const glowTube = useMemo(() => new THREE.TubeGeometry(ROUTE_CURVE, 80, 0.028, 5, false), [])
  return (
    <group>
      <mesh geometry={coreTube}>
        <meshBasicMaterial color="#DC2626" transparent opacity={0.55} />
      </mesh>
      <mesh geometry={glowTube}>
        <meshBasicMaterial color="#DC2626" transparent opacity={0.07} />
      </mesh>
    </group>
  )
}

// ─── Terrain — very faint, atmospheric depth only ────────────────────────────

function Terrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(40, 28, 44, 30)
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i)
      const h = Math.sin(x*0.20)*Math.cos(y*0.16)*0.80
              + Math.sin(x*0.13+1.3)*Math.cos(y*0.28+0.8)*0.44
      pos.setZ(i, h)
    }
    g.computeVertexNormals()
    return g
  }, [])
  return (
    <mesh geometry={geo} rotation={[-Math.PI/2, 0, 0]} position={[0, -2.6, 0]}>
      <meshStandardMaterial color="#0A1018" roughness={0.98} transparent opacity={0.06} />
    </mesh>
  )
}

// ─── Simulation runner ────────────────────────────────────────────────────────

const _v = new THREE.Vector3()

function SimRunner({ groupRef, speedRef }: {
  groupRef: React.RefObject<THREE.Group | null>
  speedRef: React.MutableRefObject<number>
}) {
  const { camera, clock } = useThree()

  useEffect(() => {
    const now = clock.getElapsedTime()
    Object.assign(simState, {
      phase: 'IDLE' as SimPhase, phaseStartTime: now, curveT: 0,
      droneYaw: 0, dronePitch: 0, droneRoll: 0, rotorSpeed: 0, payloadDeliveryT: 0,
    })
    simState.dronePos.copy(WP_HUB)
    simState.prevPos.copy(WP_HUB)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame(({ clock: c }, delta) => {
    if (!groupRef.current) return
    const now = c.getElapsedTime()

    if (now - simState.phaseStartTime >= PHASE_DUR[simState.phase]) {
      const idx = PHASE_SEQ.indexOf(simState.phase)
      simState.phase = PHASE_SEQ[(idx + 1) % PHASE_SEQ.length]
      simState.phaseStartTime = now
    }

    const progress = clamp((now - simState.phaseStartTime) / PHASE_DUR[simState.phase], 0, 1)
    simState.curveT = getCurveT(simState.phase, progress)

    const raw = ROUTE_CURVE.getPoint(clamp(simState.curveT, 0, 1))
    const hoverAmp = smoothstep(0.05, 0.16, simState.curveT) * smoothstep(0.96, 0.84, simState.curveT)
    raw.y += Math.sin(now * 0.90) * 0.055 * hoverAmp

    // Delivery: drone rises for hover-release
    if (simState.phase === 'DELIVERY') {
      simState.payloadDeliveryT = progress
      raw.y += 0.80 * easeInOut(Math.min(progress / 0.5, 1.0))
    } else {
      simState.payloadDeliveryT = 0
    }

    simState.prevPos.copy(simState.dronePos)
    simState.dronePos.copy(raw)

    _v.subVectors(simState.dronePos, simState.prevPos)
    const horizSpd = Math.sqrt(_v.x**2 + _v.z**2) / Math.max(delta, 0.001)
    const vertSpd  = _v.y / Math.max(delta, 0.001)

    if (_v.lengthSq() > 1e-6) {
      const targetYaw = Math.atan2(_v.x, _v.z)
      let diff = targetYaw - simState.droneYaw
      if (diff >  Math.PI) diff -= 2*Math.PI
      if (diff < -Math.PI) diff += 2*Math.PI
      simState.droneYaw += diff * clamp(delta * 3.5, 0, 1)
    }

    const targetPitch = clamp(-horizSpd * 0.12 + vertSpd * 0.04, -0.22, 0.12)
    simState.dronePitch += (targetPitch - simState.dronePitch) * clamp(delta * 4, 0, 1)

    const lateralSpd = (_v.x * Math.cos(simState.droneYaw) - _v.z * Math.sin(simState.droneYaw)) / Math.max(delta, 0.001)
    const targetRoll = clamp(-lateralSpd * 0.18, -0.22, 0.22)
    simState.droneRoll += (targetRoll - simState.droneRoll) * clamp(delta * 3, 0, 1)

    speedRef.current += (getTargetRPM(simState.phase) - speedRef.current) * clamp(delta * 2.2, 0, 1)
    simState.rotorSpeed = speedRef.current

    groupRef.current.position.copy(simState.dronePos)
    groupRef.current.rotation.set(simState.dronePitch, simState.droneYaw, simState.droneRoll, 'YXZ')

    const lerpK = clamp(0.008 * delta * 60, 0, 0.08)
    camera.position.x += (simState.dronePos.x * 0.52 - camera.position.x) * lerpK
    camera.position.y += (0.90 + simState.dronePos.y * 0.10 - camera.position.y) * lerpK
    camera.position.z = 7.5
    camera.lookAt(simState.dronePos.x * 0.44, simState.dronePos.y * 0.18 + 0.10, 0)
  })

  return null
}

// ─── Lighting — white fuselage + graphite arms ────────────────────────────────

function LightingRig() {
  return (
    <>
      {/* Ambient — low enough to keep arm shadows dark */}
      <ambientLight intensity={0.60} color="#F0F6FF" />

      {/* Primary key — strong, 45° upper-right-front, warm white */}
      <directionalLight position={[5, 12, 9]} intensity={3.4} color="#FFF8F0" />

      {/* Camera-axis fill — ensures front of white fuselage stays bright */}
      <directionalLight position={[0, 2, 10]} intensity={1.8} color="#FFFFFF" />

      {/* Upper-left secondary */}
      <directionalLight position={[-3, 7, 8]} intensity={1.1} color="#F2F6FF" />

      {/* Dramatic back-light — behind/below drone, creates halo on arms/payload */}
      <pointLight position={[0, -1, -6]} intensity={4.0} color="#6080C8" distance={18} decay={2} />

      {/* Left cool rim — defines graphite arm silhouette */}
      <pointLight position={[-9, 5, -3]} intensity={3.2} color="#7AAADE" distance={30} decay={2} />

      {/* Right warm rim */}
      <pointLight position={[ 9, 4, -3]} intensity={2.4} color="#A0B8E0" distance={28} decay={2} />

      {/* Top overhead */}
      <pointLight position={[0, 10, 1]}  intensity={0.90} color="#FFFFFF" distance={22} decay={2} />

      {/* MediHawk crimson underlight */}
      <pointLight position={[0, -5, 3]}  intensity={1.10} color="#DC2626" distance={16} decay={2} />

      {/* Payload warm fill */}
      <pointLight position={[0, -2, 5]}  intensity={0.55} color="#F8F2E8" distance={10} decay={2} />

      {/* Terrain atmosphere */}
      <pointLight position={[0, -3, -6]} intensity={0.24} color="#1A2840" distance={18} decay={2} />
    </>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene() {
  const droneGroupRef = useRef<THREE.Group>(null)
  const speedRef      = useRef<number>(2)
  return (
    <>
      <LightingRig />
      <Terrain />
      <LandingPlatform position={[-4.2, -0.029,  0.6]} color="#16A34A" label="MEDIHAWK HUB" status="DEPARTED" />
      <LandingPlatform position={[ 4.2, -0.029, -0.6]} color="#D97706" label="PHC CHANDAKA" status="AWAITING" />
      <FlightRoute />
      <MedicalDroneBody groupRef={droneGroupRef} speedRef={speedRef} />
      <SimRunner groupRef={droneGroupRef} speedRef={speedRef} />
    </>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

interface DroneScene3DProps { height?: number; className?: string }

export function DroneScene3D({ height = 480, className }: DroneScene3DProps) {
  return (
    <div style={{ height }} className={className}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0.1, 0.90, 7.5], fov: 58 }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color(0, 0, 0), 0)
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.28
          const canvas = gl.domElement
          canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault() }, false)
        }}
      >
        <Scene />
      </Canvas>
    </div>
  )
}

// ─── Mini drone ───────────────────────────────────────────────────────────────

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
          <boxGeometry args={[0.9,0.03,0.1]}/>
          <meshStandardMaterial color="#3A4058" metalness={0.5} roughness={0.4}/>
        </mesh>
      ))}
      <mesh position={[0,0.18,0]}>
        <boxGeometry args={[0.06,0.03,0.2]}/>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5}/>
      </mesh>
      <mesh position={[0,0.18,0]}>
        <boxGeometry args={[0.2,0.03,0.06]}/>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5}/>
      </mesh>
    </group>
  )
}

export function MiniDroneScene({ color, height = 80 }: { color?: string; height?: number }) {
  return (
    <div style={{ height, width: height }}>
      <Canvas
        dpr={[1,1.5]}
        gl={{ antialias:true, alpha:true }}
        camera={{ position:[0,1,2.5], fov:50 }}
        style={{ background:'transparent' }}
        onCreated={({ gl })=>{
          gl.setClearColor(new THREE.Color(0,0,0),0)
          gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault() }, false)
        }}
      >
        <ambientLight intensity={0.55}/>
        <pointLight position={[0,2,1]} intensity={1.5} color="#fff"/>
        <Float speed={1.5} floatIntensity={0.5}>
          <MiniDroneBody color={color}/>
        </Float>
      </Canvas>
    </div>
  )
}
