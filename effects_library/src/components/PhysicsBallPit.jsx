import { useRef, useMemo, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Physics, RigidBody, BallCollider } from '@react-three/rapier'
import { Mask, useMask } from '@react-three/drei'
import * as THREE from 'three'

const BALL_COUNT = 30
const BALL_RADIUS = 0.3
const ATTRACTION_FORCE = 3.5
const MOUSE_FORCE = 10
const DAMPING = 0.6
const RESTITUTION = 0.3

// Rounded rectangle shape for the mask
function MaskPlane() {
  const shape = useMemo(() => {
    const s = new THREE.Shape()
    const w = 3
    const h = 2
    const r = 0.3
    s.moveTo(-w + r, -h)
    s.lineTo(w - r, -h)
    s.quadraticCurveTo(w, -h, w, -h + r)
    s.lineTo(w, h - r)
    s.quadraticCurveTo(w, h, w - r, h)
    s.lineTo(-w + r, h)
    s.quadraticCurveTo(-w, h, -w, h - r)
    s.lineTo(-w, -h + r)
    s.quadraticCurveTo(-w, -h, -w + r, -h)
    return s
  }, [])

  return (
    <Mask id={1} position={[0, 0, 0]}>
      <shapeGeometry args={[shape]} />
    </Mask>
  )
}

// Single physics ball
function Ball({ position, color }) {
  const stencil = useMask(1)
  const ref = useRef()

  return (
    <RigidBody
      ref={ref}
      position={position}
      linearDamping={DAMPING}
      restitution={RESTITUTION}
      colliders={false}
      mass={BALL_RADIUS}
    >
      <BallCollider args={[BALL_RADIUS]} />
      <mesh>
        <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
        <meshStandardMaterial
          color={color}
          metalness={0.1}
          roughness={0.22}
          {...stencil}
        />
      </mesh>
    </RigidBody>
  )
}

// Mouse-tracking kinematic ball + point light
function MouseBall() {
  const rigidBodyRef = useRef()
  const lightRef = useRef()
  const { camera, pointer } = useThree()
  const lastMouse = useRef(new THREE.Vector3())
  const currentMouse = useRef(new THREE.Vector3())

  useFrame(() => {
    // Convert pointer to world coords
    const vec = new THREE.Vector3(pointer.x, pointer.y, 0)
    vec.unproject(camera)
    // For perspective camera, project onto z=0 plane
    const dir = vec.sub(camera.position).normalize()
    const distance = -camera.position.z / dir.z
    const worldPos = camera.position.clone().add(dir.multiplyScalar(distance))

    lastMouse.current.copy(currentMouse.current)
    currentMouse.current.copy(worldPos)

    if (rigidBodyRef.current) {
      rigidBodyRef.current.setNextKinematicTranslation({
        x: worldPos.x,
        y: worldPos.y,
        z: 0,
      })
    }
    if (lightRef.current) {
      lightRef.current.position.set(worldPos.x, worldPos.y, 2)
    }
  })

  const stencil = useMask(1)

  return (
    <>
      <RigidBody
        ref={rigidBodyRef}
        type="kinematicPosition"
        colliders={false}
      >
        <BallCollider args={[BALL_RADIUS * 1.5]} />
        <mesh>
          <sphereGeometry args={[BALL_RADIUS * 0.3, 16, 16]} />
          <meshBasicMaterial transparent opacity={0} {...stencil} />
        </mesh>
      </RigidBody>
      <pointLight ref={lightRef} intensity={40} color="#ff6b9d" distance={10} />
    </>
  )
}

// Attraction force system — pulls balls toward center
function AttractionSystem({ ballRefs }) {
  const center = useMemo(() => new THREE.Vector3(0, 0, 0), [])

  useFrame(() => {
    ballRefs.current.forEach((ref) => {
      if (!ref?.current) return
      const rb = ref.current
      const pos = rb.translation()
      const dir = new THREE.Vector3(
        center.x - pos.x,
        center.y - pos.y,
        center.z - pos.z
      )
      if (dir.length() > 0.1) {
        dir.setLength(ATTRACTION_FORCE)
        rb.applyImpulse({ x: dir.x * 0.016, y: dir.y * 0.016, z: 0 }, true)
      }
      // Clamp Z to keep balls in the plane
      if (Math.abs(pos.z) > 0.1) {
        rb.setTranslation({ x: pos.x, y: pos.y, z: 0 }, true)
      }
    })
  })

  return null
}

// Colors for the balls
const COLORS = ['#E91E63', '#FF5722', '#FF9800', '#E91E63', '#F44336', '#FF6B6B']

export default function PhysicsBallPit() {
  const ballRefs = useRef([])

  // Generate initial positions in a cluster
  const balls = useMemo(() => {
    const arr = []
    for (let i = 0; i < BALL_COUNT; i++) {
      const angle = (i / BALL_COUNT) * Math.PI * 2
      const radius = 0.5 + Math.random() * 1.5
      arr.push({
        position: [
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          0,
        ],
        color: COLORS[i % COLORS.length],
      })
    }
    return arr
  }, [])

  // Create refs for each ball
  const refs = useMemo(() => {
    const r = []
    for (let i = 0; i < BALL_COUNT; i++) {
      r.push(useRef())
    }
    ballRefs.current = r
    return r
  }, [])

  return (
    <Physics gravity={[0, 0, 0]}>
      <MaskPlane />
      {balls.map((ball, i) => (
        <RigidBody
          key={i}
          ref={refs[i]}
          position={ball.position}
          linearDamping={DAMPING}
          restitution={RESTITUTION}
          colliders={false}
          mass={BALL_RADIUS}
        >
          <BallCollider args={[BALL_RADIUS]} />
          <StencilBall color={ball.color} />
        </RigidBody>
      ))}
      <MouseBall />
      <AttractionSystem ballRefs={ballRefs} />
    </Physics>
  )
}

function StencilBall({ color }) {
  const stencil = useMask(1)
  return (
    <mesh>
      <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
      <meshStandardMaterial
        color={color}
        metalness={0.1}
        roughness={0.22}
        {...stencil}
      />
    </mesh>
  )
}
