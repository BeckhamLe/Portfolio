import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Physics, RigidBody, BallCollider } from '@react-three/rapier'
import * as THREE from 'three'

/**
 * Gravity Well — Objects orbit lazily in space. Your mouse is a gravity well
 * that sucks nearby objects in and flings them out. Click to reverse polarity
 * (repel instead of attract).
 */

const OBJECT_COUNT = 50
const ORBIT_RADIUS = 3.5
const MOUSE_GRAVITY = 15
const ORBIT_FORCE = 1.2

const SHAPES = ['sphere', 'box', 'torus']
const PALETTE = ['#00f5d4', '#00bbf9', '#9b5de5', '#f15bb5', '#fee440']

function OrbitObject({ index, total, shape, color }) {
  const ref = useRef()
  const angle = (index / total) * Math.PI * 2
  const radius = ORBIT_RADIUS + (Math.random() - 0.5) * 2
  const speed = 0.3 + Math.random() * 0.4
  const phase = Math.random() * Math.PI * 2
  const size = 0.12 + Math.random() * 0.15

  return (
    <RigidBody
      ref={ref}
      position={[
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        (Math.random() - 0.5) * 1.5,
      ]}
      linearDamping={0.3}
      colliders={false}
      mass={size * 2}
      userData={{ index, speed, phase, orbitRadius: radius }}
    >
      <BallCollider args={[size]} />
      <mesh>
        {shape === 'sphere' && <sphereGeometry args={[size, 16, 16]} />}
        {shape === 'box' && <boxGeometry args={[size * 1.5, size * 1.5, size * 1.5]} />}
        {shape === 'torus' && <torusGeometry args={[size, size * 0.4, 8, 16]} />}
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          metalness={0.6}
          roughness={0.2}
        />
      </mesh>
    </RigidBody>
  )
}

function ForceSystem({ objectRefs, repelRef }) {
  const { camera, pointer } = useThree()
  const mouseWorld = useRef(new THREE.Vector3())
  const time = useRef(0)

  useFrame((_, delta) => {
    time.current += delta

    // Mouse to world
    const vec = new THREE.Vector3(pointer.x, pointer.y, 0).unproject(camera)
    const dir = vec.sub(camera.position).normalize()
    const dist = -camera.position.z / dir.z
    mouseWorld.current.copy(camera.position.clone().add(dir.multiplyScalar(dist)))

    objectRefs.current.forEach((ref) => {
      if (!ref?.current) return
      const rb = ref.current
      const pos = rb.translation()
      const posVec = new THREE.Vector3(pos.x, pos.y, pos.z)

      // Orbital force — tangential to center
      const toCenter = new THREE.Vector3(-pos.x, -pos.y, 0)
      const dist2Center = toCenter.length()
      if (dist2Center > 0.1) {
        // Tangential direction (perpendicular to radius)
        const tangent = new THREE.Vector3(-toCenter.y, toCenter.x, 0).normalize()
        const userData = rb.userData
        const orbitalSpeed = userData?.speed || 0.5
        tangent.multiplyScalar(ORBIT_FORCE * orbitalSpeed)

        // Gentle centering force
        toCenter.normalize().multiplyScalar(0.5 * Math.max(0, dist2Center - ORBIT_RADIUS))

        rb.applyImpulse(
          { x: (tangent.x + toCenter.x) * delta, y: (tangent.y + toCenter.y) * delta, z: -pos.z * delta * 2 },
          true
        )
      }

      // Mouse gravity well
      const toMouse = new THREE.Vector3(
        mouseWorld.current.x - pos.x,
        mouseWorld.current.y - pos.y,
        0
      )
      const mouseDist = toMouse.length()
      if (mouseDist < 4 && mouseDist > 0.2) {
        const strength = MOUSE_GRAVITY / (mouseDist * mouseDist)
        toMouse.normalize().multiplyScalar(strength * delta)
        if (repelRef.current) toMouse.negate()
        rb.applyImpulse({ x: toMouse.x, y: toMouse.y, z: 0 }, true)
      }
    })
  })

  return null
}

function MouseIndicator({ repelRef }) {
  const meshRef = useRef()
  const ringRef = useRef()
  const { camera, pointer } = useThree()

  useFrame((_, delta) => {
    const vec = new THREE.Vector3(pointer.x, pointer.y, 0).unproject(camera)
    const dir = vec.sub(camera.position).normalize()
    const dist = -camera.position.z / dir.z
    const wp = camera.position.clone().add(dir.multiplyScalar(dist))

    if (meshRef.current) {
      meshRef.current.position.lerp(wp, 0.15)
      meshRef.current.rotation.z += delta * (repelRef.current ? -3 : 3)
    }
    if (ringRef.current) {
      ringRef.current.position.lerp(wp, 0.12)
      ringRef.current.scale.setScalar(repelRef.current ? 1.5 : 1)
      ringRef.current.rotation.z -= delta * 1.5
    }
  })

  return (
    <>
      <mesh ref={meshRef}>
        <octahedronGeometry args={[0.15, 0]} />
        <meshStandardMaterial
          color={repelRef.current ? '#f15bb5' : '#00f5d4'}
          emissive={repelRef.current ? '#f15bb5' : '#00f5d4'}
          emissiveIntensity={0.8}
          wireframe
        />
      </mesh>
      <mesh ref={ringRef}>
        <torusGeometry args={[0.4, 0.02, 8, 32]} />
        <meshBasicMaterial
          color={repelRef.current ? '#f15bb5' : '#00f5d4'}
          transparent
          opacity={0.3}
        />
      </mesh>
    </>
  )
}

export default function GravityWell() {
  const objectRefs = useRef([])
  const repelRef = useRef(false)

  const objects = useMemo(() => {
    const arr = []
    const refs = []
    for (let i = 0; i < OBJECT_COUNT; i++) {
      const ref = { current: null }
      refs.push(ref)
      arr.push({
        shape: SHAPES[i % SHAPES.length],
        color: PALETTE[i % PALETTE.length],
        ref,
      })
    }
    objectRefs.current = refs
    return arr
  }, [])

  return (
    <group
      onClick={() => { repelRef.current = !repelRef.current }}
    >
      <Physics gravity={[0, 0, 0]}>
        {objects.map((obj, i) => (
          <RigidBody
            key={i}
            ref={(r) => { if (objectRefs.current[i]) objectRefs.current[i].current = r }}
            position={[
              Math.cos((i / OBJECT_COUNT) * Math.PI * 2) * (ORBIT_RADIUS + (Math.random() - 0.5) * 2),
              Math.sin((i / OBJECT_COUNT) * Math.PI * 2) * (ORBIT_RADIUS + (Math.random() - 0.5) * 2),
              (Math.random() - 0.5) * 1,
            ]}
            linearDamping={0.3}
            colliders={false}
            mass={0.2}
            userData={{ speed: 0.3 + Math.random() * 0.4 }}
          >
            <BallCollider args={[0.15]} />
            <mesh>
              {obj.shape === 'sphere' && <sphereGeometry args={[0.12 + Math.random() * 0.1, 16, 16]} />}
              {obj.shape === 'box' && <boxGeometry args={[0.2, 0.2, 0.2]} />}
              {obj.shape === 'torus' && <torusGeometry args={[0.12, 0.05, 8, 16]} />}
              <meshStandardMaterial
                color={obj.color}
                emissive={obj.color}
                emissiveIntensity={0.3}
                metalness={0.6}
                roughness={0.2}
              />
            </mesh>
          </RigidBody>
        ))}
        <ForceSystem objectRefs={objectRefs} repelRef={repelRef} />
      </Physics>
      <MouseIndicator repelRef={repelRef} />
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 5]} intensity={20} color="#00f5d4" />
    </group>
  )
}
