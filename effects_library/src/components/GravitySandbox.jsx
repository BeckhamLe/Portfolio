import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Html } from '@react-three/drei'

const MAX_INSTANCES = 60
const INITIAL_COUNT = 40
const BOUNDARY = 5
const MAX_SPEED = 3.0
const DRAG = 0.998
const BOUNCE_DAMPING = 0.7

// Tetrahedron geometry (4 triangular faces)
function createTetrahedronGeometry(scale) {
  const geo = new THREE.TetrahedronGeometry(scale)
  return geo
}

// Per-instance state stored in a ref (not React state — mutated every frame)
function createInstance(index) {
  return {
    id: index,
    position: new THREE.Vector3(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6
    ),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5
    ),
    rotation: new THREE.Euler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    ),
    rotVelocity: new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    ),
    scale: 0.15 + Math.random() * 0.25,
    isBox: Math.random() > 0.5,
  }
}

// Vertex shader: passes velocity magnitude to fragment for coloring
const vertexShader = /* glsl */ `
  attribute float aSpeed;
  varying float vSpeed;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vSpeed = aSpeed;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

// Fragment shader: color based on velocity magnitude
const fragmentShader = /* glsl */ `
  precision highp float;
  varying float vSpeed;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    // Normalize speed: 0 = slow, 1 = fast
    float t = clamp(vSpeed / 3.0, 0.0, 1.0);

    // Cool blue/purple at rest → warm orange/pink at speed
    vec3 coolColor = vec3(0.2, 0.15, 0.55);  // purple
    vec3 midColor = vec3(0.1, 0.4, 0.7);     // blue
    vec3 warmColor = vec3(1.0, 0.45, 0.35);  // orange-pink

    vec3 baseColor;
    if (t < 0.5) {
      baseColor = mix(coolColor, midColor, t * 2.0);
    } else {
      baseColor = mix(midColor, warmColor, (t - 0.5) * 2.0);
    }

    // Simple directional lighting
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
    float diffuse = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.25;
    vec3 color = baseColor * (ambient + diffuse * 0.75);

    // Slight rim glow
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
    rim = pow(rim, 3.0) * 0.3;
    color += rim * warmColor * t;

    gl_FragColor = vec4(color, 1.0);
  }
`

function GravitySimulation() {
  const boxMeshRef = useRef()
  const tetraMeshRef = useRef()
  const { camera } = useThree()

  // Simulation state stored in ref for mutation without re-renders
  const simState = useRef({
    instances: [],
    gravity: new THREE.Vector3(0, 0, 0),
    frozen: false,
    nextId: 0,
  })

  // Speed attributes for instanced mesh coloring
  const boxSpeedAttr = useRef(null)
  const tetraSpeedAttr = useRef(null)

  // Initialize instances
  useEffect(() => {
    const state = simState.current
    for (let i = 0; i < INITIAL_COUNT; i++) {
      state.instances.push(createInstance(state.nextId++))
    }
  }, [])

  // Keyboard handling
  useEffect(() => {
    const state = simState.current
    const keysDown = new Set()

    function updateGravity() {
      const g = new THREE.Vector3(0, 0, 0)
      if (keysDown.has('ArrowLeft')) g.x -= 3
      if (keysDown.has('ArrowRight')) g.x += 3
      if (keysDown.has('ArrowUp')) g.y += 3
      if (keysDown.has('ArrowDown')) g.y -= 3
      state.gravity.copy(g)
    }

    function onKeyDown(e) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault()
      }
      if (e.key === ' ') {
        state.frozen = !state.frozen
        return
      }
      keysDown.add(e.key)
      updateGravity()
    }

    function onKeyUp(e) {
      keysDown.delete(e.key)
      updateGravity()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Click to spawn
  useEffect(() => {
    function onClick() {
      const state = simState.current
      const inst = createInstance(state.nextId++)
      // Spawn near center
      inst.position.set(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      )
      state.instances.push(inst)
      // Enforce spawn cap
      if (state.instances.length > MAX_INSTANCES) {
        state.instances.shift()
      }
    }

    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [])

  // Dummy object for building instance matrices
  const dummy = useMemo(() => new THREE.Object3D(), [])

  // Create speed attribute buffers
  const boxSpeedArray = useMemo(() => new Float32Array(MAX_INSTANCES), [])
  const tetraSpeedArray = useMemo(() => new Float32Array(MAX_INSTANCES), [])

  useFrame((_, delta) => {
    const state = simState.current
    const dt = Math.min(delta, 0.05) // cap delta to avoid huge jumps

    const boxMesh = boxMeshRef.current
    const tetraMesh = tetraMeshRef.current
    if (!boxMesh || !tetraMesh) return

    let boxCount = 0
    let tetraCount = 0

    for (let i = 0; i < state.instances.length; i++) {
      const inst = state.instances[i]

      if (!state.frozen) {
        // Apply gravity
        inst.velocity.addScaledVector(state.gravity, dt)

        // Apply drag
        inst.velocity.multiplyScalar(DRAG)

        // Clamp speed
        const speed = inst.velocity.length()
        if (speed > MAX_SPEED) {
          inst.velocity.multiplyScalar(MAX_SPEED / speed)
        }

        // Update position
        inst.position.addScaledVector(inst.velocity, dt)

        // Update rotation
        inst.rotation.x += inst.rotVelocity.x * dt
        inst.rotation.y += inst.rotVelocity.y * dt
        inst.rotation.z += inst.rotVelocity.z * dt

        // Boundary bounce
        for (const axis of ['x', 'y', 'z']) {
          if (inst.position[axis] > BOUNDARY) {
            inst.position[axis] = BOUNDARY
            inst.velocity[axis] *= -BOUNCE_DAMPING
          } else if (inst.position[axis] < -BOUNDARY) {
            inst.position[axis] = -BOUNDARY
            inst.velocity[axis] *= -BOUNCE_DAMPING
          }
        }
      }

      // Build matrix
      const currentSpeed = inst.velocity.length()
      dummy.position.copy(inst.position)
      dummy.rotation.copy(inst.rotation)
      dummy.scale.setScalar(inst.scale)
      dummy.updateMatrix()

      if (inst.isBox) {
        boxMesh.setMatrixAt(boxCount, dummy.matrix)
        boxSpeedArray[boxCount] = currentSpeed
        boxCount++
      } else {
        tetraMesh.setMatrixAt(tetraCount, dummy.matrix)
        tetraSpeedArray[tetraCount] = currentSpeed
        tetraCount++
      }
    }

    // Update instance counts
    boxMesh.count = boxCount
    tetraMesh.count = tetraCount

    boxMesh.instanceMatrix.needsUpdate = true
    tetraMesh.instanceMatrix.needsUpdate = true

    // Update speed attributes
    if (boxMesh.geometry.attributes.aSpeed) {
      boxMesh.geometry.attributes.aSpeed.needsUpdate = true
    }
    if (tetraMesh.geometry.attributes.aSpeed) {
      tetraMesh.geometry.attributes.aSpeed.needsUpdate = true
    }
  })

  return (
    <>
      {/* Boxes */}
      <instancedMesh ref={boxMeshRef} args={[null, null, MAX_INSTANCES]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]}>
          <instancedBufferAttribute
            ref={boxSpeedAttr}
            attach="attributes-aSpeed"
            args={[boxSpeedArray, 1]}
          />
        </boxGeometry>
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          side={THREE.DoubleSide}
        />
      </instancedMesh>

      {/* Tetrahedrons */}
      <instancedMesh ref={tetraMeshRef} args={[null, null, MAX_INSTANCES]} frustumCulled={false}>
        <tetrahedronGeometry args={[1, 0]}>
          <instancedBufferAttribute
            ref={tetraSpeedAttr}
            attach="attributes-aSpeed"
            args={[tetraSpeedArray, 1]}
          />
        </tetrahedronGeometry>
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </>
  )
}

function GravityArrow() {
  const arrowRef = useRef()
  const simGravity = useRef(new THREE.Vector3(0, 0, 0))

  // Listen for gravity changes
  useEffect(() => {
    const keysDown = new Set()

    function updateGravity() {
      const g = new THREE.Vector3(0, 0, 0)
      if (keysDown.has('ArrowLeft')) g.x -= 3
      if (keysDown.has('ArrowRight')) g.x += 3
      if (keysDown.has('ArrowUp')) g.y += 3
      if (keysDown.has('ArrowDown')) g.y -= 3
      simGravity.current.copy(g)
    }

    function onKeyDown(e) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        keysDown.add(e.key)
        updateGravity()
      }
    }

    function onKeyUp(e) {
      keysDown.delete(e.key)
      updateGravity()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useFrame(() => {
    if (!arrowRef.current) return
    const g = simGravity.current
    const len = g.length()

    if (len < 0.01) {
      arrowRef.current.visible = false
    } else {
      arrowRef.current.visible = true
      // Point arrow in gravity direction (in 2D on screen)
      const angle = Math.atan2(g.y, g.x)
      arrowRef.current.rotation.z = angle
    }
  })

  return (
    <group ref={arrowRef} position={[-5.5, -3.5, 0]}>
      {/* Arrow body */}
      <mesh position={[0.25, 0, 0]}>
        <planeGeometry args={[0.5, 0.06]} />
        <meshBasicMaterial color="#ffffff" opacity={0.35} transparent />
      </mesh>
      {/* Arrow head */}
      <mesh position={[0.55, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.08, 0.15, 3]} />
        <meshBasicMaterial color="#ffffff" opacity={0.35} transparent />
      </mesh>
    </group>
  )
}

export default function GravitySandbox() {
  return (
    <>
      <color attach="background" args={['#080810']} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 8, 5]} intensity={0.6} />
      <GravitySimulation />
      <GravityArrow />
      <Html
        fullscreen
        style={{ pointerEvents: 'none' }}
      >
        <div style={{
          position: 'fixed',
          bottom: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.3)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 12,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          Arrow keys: gravity &nbsp;|&nbsp; Click: spawn &nbsp;|&nbsp; Space: freeze
        </div>
      </Html>
    </>
  )
}
