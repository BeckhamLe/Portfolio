import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Particle Morph — Thousands of particles arranged in one shape morph into
 * another shape on mouse click. Particles trail with color based on velocity.
 * Mouse proximity causes local turbulence.
 */

const PARTICLE_COUNT = 3000

// Generate positions for different shapes
function generateSpherePositions(count, radius) {
  const positions = []
  for (let i = 0; i < count; i++) {
    const phi = Math.acos(2 * Math.random() - 1)
    const theta = Math.random() * Math.PI * 2
    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    )
  }
  return new Float32Array(positions)
}

function generateTorusPositions(count, major, minor) {
  const positions = []
  for (let i = 0; i < count; i++) {
    const u = Math.random() * Math.PI * 2
    const v = Math.random() * Math.PI * 2
    positions.push(
      (major + minor * Math.cos(v)) * Math.cos(u),
      (major + minor * Math.cos(v)) * Math.sin(u),
      minor * Math.sin(v)
    )
  }
  return new Float32Array(positions)
}

function generateHelixPositions(count, radius, height, turns) {
  const positions = []
  for (let i = 0; i < count; i++) {
    const t = i / count
    const angle = t * Math.PI * 2 * turns
    const r = radius + (Math.random() - 0.5) * 0.2
    positions.push(
      r * Math.cos(angle),
      (t - 0.5) * height,
      r * Math.sin(angle)
    )
  }
  return new Float32Array(positions)
}

function generateCubePositions(count, size) {
  const positions = []
  for (let i = 0; i < count; i++) {
    // Points on cube surface
    const face = Math.floor(Math.random() * 6)
    let x, y, z
    const r1 = (Math.random() - 0.5) * size
    const r2 = (Math.random() - 0.5) * size
    switch (face) {
      case 0: x = size / 2; y = r1; z = r2; break
      case 1: x = -size / 2; y = r1; z = r2; break
      case 2: x = r1; y = size / 2; z = r2; break
      case 3: x = r1; y = -size / 2; z = r2; break
      case 4: x = r1; y = r2; z = size / 2; break
      default: x = r1; y = r2; z = -size / 2; break
    }
    positions.push(x, y, z)
  }
  return new Float32Array(positions)
}

const vertexShader = `
attribute vec3 targetPosition;
attribute float speed;

uniform float morphProgress;
uniform float time;
uniform vec3 mouseWorld;

varying vec3 vColor;
varying float vAlpha;

void main() {
  // Morph between current and target
  vec3 pos = mix(position, targetPosition, morphProgress);

  // Mouse turbulence
  float mouseDist = distance(pos, mouseWorld);
  if (mouseDist < 2.0) {
    float strength = (1.0 - mouseDist / 2.0) * 0.5;
    pos += vec3(
      sin(time * 3.0 + pos.y * 5.0) * strength,
      cos(time * 2.5 + pos.x * 5.0) * strength,
      sin(time * 4.0 + pos.z * 3.0) * strength
    );
  }

  // Gentle floating
  pos += vec3(
    sin(time * 0.5 + pos.y * 2.0) * 0.02,
    cos(time * 0.4 + pos.x * 2.0) * 0.02,
    sin(time * 0.6 + pos.z * 2.0) * 0.02
  );

  // Color based on position and morph state
  float heightNorm = (pos.y + 2.5) / 5.0;
  vec3 color1 = vec3(0.0, 0.96, 0.83); // cyan
  vec3 color2 = vec3(0.61, 0.36, 0.9);  // purple
  vec3 color3 = vec3(0.95, 0.36, 0.71); // pink
  vColor = mix(mix(color1, color2, heightNorm), color3, morphProgress * heightNorm);

  // Mouse proximity glow
  if (mouseDist < 2.0) {
    vColor = mix(vColor, vec3(1.0, 1.0, 1.0), (1.0 - mouseDist / 2.0) * 0.5);
  }

  vAlpha = 0.6 + 0.4 * sin(time + speed * 10.0);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = (3.0 + speed * 2.0) * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`

const fragmentShader = `
varying vec3 vColor;
varying float vAlpha;

void main() {
  // Circular point
  float dist = length(gl_PointCoord - vec2(0.5));
  if (dist > 0.5) discard;

  float alpha = vAlpha * (1.0 - dist * 2.0);
  gl_FragColor = vec4(vColor, alpha);
}
`

export default function ParticleMorph() {
  const pointsRef = useRef()
  const { camera, pointer } = useThree()
  const shapeIndex = useRef(0)
  const morphProgress = useRef(0)
  const morphTarget = useRef(0)
  const mouseWorld = useRef(new THREE.Vector3())

  const shapes = useMemo(() => [
    generateSpherePositions(PARTICLE_COUNT, 2),
    generateTorusPositions(PARTICLE_COUNT, 2, 0.7),
    generateHelixPositions(PARTICLE_COUNT, 1.5, 5, 4),
    generateCubePositions(PARTICLE_COUNT, 3),
  ], [])

  const { geometry, uniforms } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(shapes[0].slice(), 3))
    geo.setAttribute('targetPosition', new THREE.BufferAttribute(shapes[1].slice(), 3))

    const speeds = new Float32Array(PARTICLE_COUNT)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      speeds[i] = 0.3 + Math.random() * 0.7
    }
    geo.setAttribute('speed', new THREE.BufferAttribute(speeds, 1))

    return {
      geometry: geo,
      uniforms: {
        morphProgress: { value: 0 },
        time: { value: 0 },
        mouseWorld: { value: new THREE.Vector3() },
      },
    }
  }, [shapes])

  useFrame(({ clock }) => {
    uniforms.time.value = clock.elapsedTime

    // Mouse to world
    const vec = new THREE.Vector3(pointer.x, pointer.y, 0).unproject(camera)
    const dir = vec.sub(camera.position).normalize()
    const dist = -camera.position.z / dir.z
    mouseWorld.current.copy(camera.position.clone().add(dir.multiplyScalar(dist)))
    uniforms.mouseWorld.value.copy(mouseWorld.current)

    // Smooth morph
    morphProgress.current += (morphTarget.current - morphProgress.current) * 0.03
    uniforms.morphProgress.value = morphProgress.current

    // Slow auto-rotation
    if (pointsRef.current) {
      pointsRef.current.rotation.y += 0.002
    }
  })

  const handleClick = () => {
    const currentFrom = shapeIndex.current
    const nextShape = (shapeIndex.current + 1) % shapes.length
    shapeIndex.current = nextShape
    const nextNext = (nextShape + 1) % shapes.length

    // Current displayed state becomes new "position"
    // and we set a new target
    const posAttr = geometry.getAttribute('position')
    const targetAttr = geometry.getAttribute('targetPosition')

    // Bake current interpolated positions into position attribute
    const fromPositions = shapes[currentFrom]
    const toPositions = shapes[nextShape]
    const nextPositions = shapes[nextNext]
    const progress = morphProgress.current

    for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
      posAttr.array[i] = fromPositions[i] + (toPositions[i] - fromPositions[i]) * progress
      targetAttr.array[i] = nextPositions[i]
    }
    posAttr.needsUpdate = true
    targetAttr.needsUpdate = true

    morphTarget.current = 1
    morphProgress.current = 0
  }

  return (
    <group onClick={handleClick}>
      {/* Invisible click target */}
      <mesh>
        <sphereGeometry args={[4, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <points ref={pointsRef} geometry={geometry}>
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}
