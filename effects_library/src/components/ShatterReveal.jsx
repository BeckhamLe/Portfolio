import { useRef, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

/**
 * Shatter Reveal — A solid panel floats in space. Click it and it shatters
 * into physics-driven shards that fall and scatter, revealing text behind.
 * Mouse proximity causes shards to gently ripple before the shatter.
 */

const GRID_X = 12
const GRID_Y = 8
const SHARD_SIZE_X = 0.42
const SHARD_SIZE_Y = 0.42
const GAP = 0.03
const PANEL_WIDTH = GRID_X * (SHARD_SIZE_X + GAP)
const PANEL_HEIGHT = GRID_Y * (SHARD_SIZE_Y + GAP)

const COLORS = ['#1a1a2e', '#16213e', '#0f3460', '#1a1a2e', '#162447']

function Shard({ position, color, shattered, index, mouseWorld }) {
  const ref = useRef()
  const meshRef = useRef()
  const originalPos = useRef(new THREE.Vector3(...position))
  const hasExploded = useRef(false)
  const hoverOffset = useRef(0)

  useFrame((_, delta) => {
    if (!ref.current) return

    if (shattered && !hasExploded.current) {
      hasExploded.current = true
      // Random explosion impulse
      const angle = Math.random() * Math.PI * 2
      const upForce = 2 + Math.random() * 5
      const outForce = 1 + Math.random() * 3
      ref.current.applyImpulse(
        {
          x: Math.cos(angle) * outForce,
          y: upForce,
          z: Math.sin(angle) * outForce + 2 + Math.random() * 3,
        },
        true
      )
      // Random torque for spinning
      ref.current.applyTorqueImpulse(
        {
          x: (Math.random() - 0.5) * 2,
          y: (Math.random() - 0.5) * 2,
          z: (Math.random() - 0.5) * 2,
        },
        true
      )
    }

    // Pre-shatter hover effect — ripple based on mouse proximity
    if (!shattered && meshRef.current && mouseWorld.current) {
      const dx = originalPos.current.x - mouseWorld.current.x
      const dy = originalPos.current.y - mouseWorld.current.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const targetOffset = dist < 2 ? (1 - dist / 2) * 0.3 : 0
      hoverOffset.current += (targetOffset - hoverOffset.current) * 5 * delta
      meshRef.current.position.z = hoverOffset.current
    }
  })

  if (!shattered) {
    return (
      <group position={position}>
        <mesh ref={meshRef}>
          <boxGeometry args={[SHARD_SIZE_X, SHARD_SIZE_Y, 0.05]} />
          <meshStandardMaterial
            color={color}
            metalness={0.8}
            roughness={0.15}
          />
        </mesh>
      </group>
    )
  }

  return (
    <RigidBody
      ref={ref}
      position={position}
      colliders={false}
      mass={0.1}
      linearDamping={0.1}
    >
      <CuboidCollider args={[SHARD_SIZE_X / 2, SHARD_SIZE_Y / 2, 0.025]} />
      <mesh>
        <boxGeometry args={[SHARD_SIZE_X, SHARD_SIZE_Y, 0.05]} />
        <meshStandardMaterial
          color={color}
          metalness={0.8}
          roughness={0.15}
        />
      </mesh>
    </RigidBody>
  )
}

function RevealText() {
  return (
    <group position={[0, 0, -0.2]}>
      <Text
        fontSize={1.2}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        HELLO
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.5}
        />
      </Text>
      <Text
        fontSize={0.4}
        color="#9b5de5"
        anchorX="center"
        anchorY="middle"
        position={[0, -1, 0]}
        font={undefined}
      >
        click to shatter
        <meshStandardMaterial
          color="#9b5de5"
          emissive="#9b5de5"
          emissiveIntensity={0.3}
        />
      </Text>
    </group>
  )
}

export default function ShatterReveal() {
  const [shattered, setShattered] = useState(false)
  const mouseWorld = useRef(new THREE.Vector3())
  const { camera, pointer } = useThree()

  useFrame(() => {
    const vec = new THREE.Vector3(pointer.x, pointer.y, 0).unproject(camera)
    const dir = vec.sub(camera.position).normalize()
    const dist = -camera.position.z / dir.z
    mouseWorld.current.copy(camera.position.clone().add(dir.multiplyScalar(dist)))
  })

  const shards = useMemo(() => {
    const arr = []
    for (let x = 0; x < GRID_X; x++) {
      for (let y = 0; y < GRID_Y; y++) {
        arr.push({
          position: [
            (x - GRID_X / 2 + 0.5) * (SHARD_SIZE_X + GAP),
            (y - GRID_Y / 2 + 0.5) * (SHARD_SIZE_Y + GAP),
            0,
          ],
          color: COLORS[(x + y) % COLORS.length],
          index: x * GRID_Y + y,
        })
      }
    }
    return arr
  }, [])

  return (
    <group onClick={() => !shattered && setShattered(true)}>
      <Physics gravity={[0, -9.81, 0]} paused={!shattered}>
        {shards.map((shard, i) => (
          <Shard
            key={i}
            {...shard}
            shattered={shattered}
            mouseWorld={mouseWorld}
          />
        ))}
        {/* Floor to catch falling shards */}
        {shattered && (
          <RigidBody type="fixed" position={[0, -6, 0]}>
            <CuboidCollider args={[20, 0.1, 20]} />
          </RigidBody>
        )}
      </Physics>
      <RevealText />
    </group>
  )
}
