import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerspectiveCamera, Environment, Float, MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'

// ─── Drone body ───────────────────────────────────────────────────────────────
function DroneBody() {
  const bodyRef = useRef<THREE.Group>(null)
  const propRefs = [
    useRef<THREE.Mesh>(null),
    useRef<THREE.Mesh>(null),
    useRef<THREE.Mesh>(null),
    useRef<THREE.Mesh>(null),
  ]

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (bodyRef.current) {
      bodyRef.current.rotation.y = t * 0.1
    }
    propRefs.forEach((ref, i) => {
      if (ref.current) {
        ref.current.rotation.y = t * (i % 2 === 0 ? 25 : -25)
      }
    })
  })

  const armPositions: [number, number, number][] = [
    [1.4, 0, 1.4],
    [-1.4, 0, 1.4],
    [1.4, 0, -1.4],
    [-1.4, 0, -1.4],
  ]

  return (
    <group ref={bodyRef}>
      {/* Central body */}
      <mesh castShadow>
        <boxGeometry args={[1.4, 0.3, 1.4]} />
        <meshStandardMaterial
          color="#1a1d26"
          metalness={0.85}
          roughness={0.15}
          envMapIntensity={1.2}
        />
      </mesh>

      {/* Top dome — medical payload */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.6, 0.28, 24]} />
        <meshStandardMaterial
          color="#161921"
          metalness={0.7}
          roughness={0.2}
          envMapIntensity={1}
        />
      </mesh>

      {/* Medical cross indicator */}
      <mesh position={[0, 0.41, 0]}>
        <boxGeometry args={[0.08, 0.04, 0.28]} />
        <meshStandardMaterial color="#DC2626" emissive="#DC2626" emissiveIntensity={0.8} roughness={0.1} />
      </mesh>
      <mesh position={[0, 0.41, 0]}>
        <boxGeometry args={[0.28, 0.04, 0.08]} />
        <meshStandardMaterial color="#DC2626" emissive="#DC2626" emissiveIntensity={0.8} roughness={0.1} />
      </mesh>

      {/* Arms */}
      {armPositions.map((pos, i) => (
        <group key={i}>
          {/* Arm strut */}
          <mesh position={[pos[0] * 0.5, 0, pos[2] * 0.5]} rotation={[0, i < 2 ? Math.PI / 4 : -Math.PI / 4, 0]}>
            <boxGeometry args={[1.8, 0.1, 0.12]} />
            <meshStandardMaterial color="#12141a" metalness={0.9} roughness={0.1} />
          </mesh>

          {/* Motor hub */}
          <mesh position={pos} castShadow>
            <cylinderGeometry args={[0.22, 0.22, 0.18, 16]} />
            <meshStandardMaterial color="#0f1117" metalness={0.95} roughness={0.05} />
          </mesh>

          {/* Navigation LED */}
          <mesh position={[pos[0], pos[1] + 0.12, pos[2]]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial
              color={i < 2 ? '#22C55E' : '#EF4444'}
              emissive={i < 2 ? '#22C55E' : '#EF4444'}
              emissiveIntensity={2}
            />
          </mesh>

          {/* Propeller */}
          <mesh ref={propRefs[i]} position={[pos[0], pos[1] + 0.14, pos[2]]}>
            <boxGeometry args={[1.1, 0.04, 0.14]} />
            <meshStandardMaterial
              color="#1E2230"
              metalness={0.6}
              roughness={0.3}
              transparent
              opacity={0.9}
            />
          </mesh>
        </group>
      ))}

      {/* Bottom camera/sensor pod */}
      <mesh position={[0, -0.2, 0]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color="#08090c" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Landing legs */}
      {[[-0.6, -0.3, -0.6], [0.6, -0.3, -0.6], [-0.6, -0.3, 0.6], [0.6, -0.3, 0.6]].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <cylinderGeometry args={[0.04, 0.04, 0.3, 6]} />
          <meshStandardMaterial color="#0f1117" metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
    </group>
  )
}

// ─── Ground ring ──────────────────────────────────────────────────────────────
function GroundRing() {
  const ringRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = clock.getElapsedTime() * 0.2
    }
  })
  return (
    <mesh ref={ringRef} position={[0, -2.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[2.8, 3.2, 64]} />
      <meshBasicMaterial color="#DC2626" transparent opacity={0.12} side={THREE.DoubleSide} />
    </mesh>
  )
}

// ─── Route line ───────────────────────────────────────────────────────────────
function RouteLine() {
  const points = useMemo(() => {
    const pts = []
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      pts.push(new THREE.Vector3(
        -5 + t * 10,
        -1.5 + Math.sin(t * Math.PI) * 0.8,
        -3 + t * 0.5
      ))
    }
    return pts
  }, [])

  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points])
  const tubeGeom = useMemo(() => new THREE.TubeGeometry(curve, 60, 0.02, 6, false), [curve])

  return (
    <mesh geometry={tubeGeom}>
      <meshBasicMaterial color="#DC2626" transparent opacity={0.5} />
    </mesh>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────
function Scene() {
  return (
    <>
      <PerspectiveCamera makeDefault position={[3, 2, 6]} fov={45} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 8, 3]} intensity={1.2} castShadow color="#F0F0FF" />
      <pointLight position={[0, 2, 0]} intensity={0.8} color="#DC2626" distance={8} decay={2} />
      <pointLight position={[-3, 1, 2]} intensity={0.4} color="#4488FF" distance={10} decay={2} />

      <Float speed={1.2} rotationIntensity={0.2} floatIntensity={0.6}>
        <DroneBody />
      </Float>

      <GroundRing />
      <RouteLine />

      {/* Atmospheric mist */}
      <fog attach="fog" args={['#08090C', 12, 28]} />
    </>
  )
}

interface DroneScene3DProps {
  height?: number
  className?: string
}

export function DroneScene3D({ height = 480, className }: DroneScene3DProps) {
  return (
    <div style={{ height }} className={className}>
      <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
        <Scene />
      </Canvas>
    </div>
  )
}

// ─── Mini drone for admin overview ────────────────────────────────────────────
function MiniDroneBody({ color = '#DC2626' }: { color?: string }) {
  const bodyRef = useRef<THREE.Group>(null)
  const prop1 = useRef<THREE.Mesh>(null)
  const prop2 = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (bodyRef.current) bodyRef.current.rotation.y = t * 0.3
    if (prop1.current) prop1.current.rotation.y = t * 20
    if (prop2.current) prop2.current.rotation.y = -t * 20
  })

  return (
    <group ref={bodyRef} scale={0.4}>
      <mesh>
        <boxGeometry args={[1.2, 0.25, 1.2]} />
        <meshStandardMaterial color="#1a1d26" metalness={0.85} roughness={0.15} />
      </mesh>
      {[[-0.8, 0, -0.8], [0.8, 0, 0.8]].map((pos, i) => (
        <mesh key={i} ref={i === 0 ? prop1 : prop2} position={pos as [number, number, number]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.9, 0.03, 0.1]} />
          <meshStandardMaterial color="#2C3045" metalness={0.5} roughness={0.4} />
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
      <Canvas dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
        <PerspectiveCamera makeDefault position={[0, 1, 2.5]} fov={50} />
        <ambientLight intensity={0.5} />
        <pointLight position={[0, 2, 1]} intensity={1.5} color="#fff" />
        <Float speed={1.5} floatIntensity={0.5}>
          <MiniDroneBody color={color} />
        </Float>
      </Canvas>
    </div>
  )
}
