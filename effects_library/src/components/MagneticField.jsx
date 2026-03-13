import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Magnetic Field Lines — Hundreds of curved lines flow between your mouse
 * (positive pole) and a fixed point (negative pole). The entire field
 * reshapes in real-time as you move. Pure geometry + math, no physics.
 */

const LINE_COUNT = 80
const SEGMENTS_PER_LINE = 40
const FIXED_POLE = new THREE.Vector3(0, 0, 0)

function FieldLine({ index, total }) {
  const lineRef = useRef()
  const { camera, pointer } = useThree()
  const smoothMouse = useRef(new THREE.Vector3(2, 0, 0))

  const positions = useMemo(() => new Float32Array((SEGMENTS_PER_LINE + 1) * 3), [])
  const colors = useMemo(() => new Float32Array((SEGMENTS_PER_LINE + 1) * 3), [])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geo
  }, [positions, colors])

  useFrame(({ clock }) => {
    // Mouse to world
    const vec = new THREE.Vector3(pointer.x, pointer.y, 0).unproject(camera)
    const dir = vec.sub(camera.position).normalize()
    const dist = -camera.position.z / dir.z
    const wp = camera.position.clone().add(dir.multiplyScalar(dist))

    smoothMouse.current.lerp(wp, 0.08)

    const mousePos = smoothMouse.current
    const t = clock.elapsedTime

    // Start angle for this line — distributed around the mouse pole
    const angleOffset = (index / total) * Math.PI * 2
    const startAngle = angleOffset + Math.sin(t * 0.3 + index * 0.5) * 0.2
    const startRadius = 0.3

    // Starting position near the mouse pole
    const startX = mousePos.x + Math.cos(startAngle) * startRadius
    const startY = mousePos.y + Math.sin(startAngle) * startRadius
    const startZ = Math.sin(startAngle + t * 0.5) * 0.3

    const posAttr = geometry.getAttribute('position')
    const colAttr = geometry.getAttribute('color')

    for (let s = 0; s <= SEGMENTS_PER_LINE; s++) {
      const frac = s / SEGMENTS_PER_LINE

      // Interpolate from start (near mouse) to end (near fixed pole)
      // with a curve that bows outward
      const bow = Math.sin(frac * Math.PI) * (1.5 + Math.sin(t * 0.2 + index) * 0.5)
      const bowAngle = startAngle + frac * Math.PI * 0.5

      const x = THREE.MathUtils.lerp(startX, FIXED_POLE.x, frac) + Math.cos(bowAngle) * bow * (1 - frac * 0.5)
      const y = THREE.MathUtils.lerp(startY, FIXED_POLE.y, frac) + Math.sin(bowAngle) * bow * (1 - frac * 0.5)
      const z = THREE.MathUtils.lerp(startZ, 0, frac) + Math.sin(frac * Math.PI * 2 + t + index) * 0.2

      posAttr.array[s * 3] = x
      posAttr.array[s * 3 + 1] = y
      posAttr.array[s * 3 + 2] = z

      // Color: cyan near mouse, purple at midpoint, pink near fixed pole
      const cyan = new THREE.Color('#00f5d4')
      const purple = new THREE.Color('#9b5de5')
      const pink = new THREE.Color('#f15bb5')

      let col
      if (frac < 0.5) {
        col = cyan.clone().lerp(purple, frac * 2)
      } else {
        col = purple.clone().lerp(pink, (frac - 0.5) * 2)
      }

      // Fade at ends
      const alpha = Math.sin(frac * Math.PI)
      colAttr.array[s * 3] = col.r * alpha
      colAttr.array[s * 3 + 1] = col.g * alpha
      colAttr.array[s * 3 + 2] = col.b * alpha
    }

    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
  })

  return (
    <line ref={lineRef} geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.6} blending={THREE.AdditiveBlending} />
    </line>
  )
}

export default function MagneticField() {
  const lines = useMemo(() =>
    Array.from({ length: LINE_COUNT }, (_, i) => i),
  [])

  return (
    <group>
      {lines.map(i => (
        <FieldLine key={i} index={i} total={LINE_COUNT} />
      ))}
      {/* Center glow */}
      <mesh position={FIXED_POLE}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color="#f15bb5" transparent opacity={0.6} />
      </mesh>
      <pointLight position={[0, 0, 2]} intensity={5} color="#9b5de5" distance={8} />
    </group>
  )
}
