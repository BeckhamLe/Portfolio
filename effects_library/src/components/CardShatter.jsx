import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useScroll, ScrollControls, Scroll } from '@react-three/drei'
import * as THREE from 'three'

// Card dimensions
const CARD_WIDTH = 5
const CARD_HEIGHT = 3.5
const SUBDIVISIONS_X = 12
const SUBDIVISIONS_Y = 8

const vertexShader = /* glsl */ `
  #define PI 3.14159265359

  // Per-shard attributes (instanced)
  attribute vec3 shardCenter;
  attribute vec3 scatterDir;
  attribute vec3 rotationAxis;
  attribute float delay;

  // Uniforms
  uniform float uProgress;
  uniform float uTime;

  varying vec2 vUv;
  varying float vShardProgress;
  varying float vDepth;

  // Rodrigues rotation
  vec3 rotateAxis(vec3 v, vec3 axis, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
  }

  void main() {
    vUv = uv;

    // ---- Progress phases ----
    // 0 -> 0.3: fracture (staggered by delay)
    // 0.3 -> 0.7: tumble downward
    // 0.7 -> 1.0: reform (reverse stagger)

    // Per-shard staggered progress for fracture
    float fractureStart = delay * 0.25;
    float fractureEnd = fractureStart + 0.3;
    float fracture = smoothstep(fractureStart, fractureEnd, uProgress);

    // Reform phase (reverse: late shards reform first)
    float reformStart = 0.7 + (1.0 - delay) * 0.2;
    float reformEnd = reformStart + 0.15;
    float reform = smoothstep(reformStart, reformEnd, uProgress);

    // Net displacement: ramps up during fracture, stays during tumble, ramps down during reform
    float displacement = fracture * (1.0 - reform);
    displacement = displacement * displacement * (3.0 - 2.0 * displacement); // smooth ease

    vShardProgress = displacement;

    // ---- Transform vertex relative to shard center ----
    vec3 localPos = position - shardCenter;

    // Rotation: paper-tumbling feel
    // Multiple rotation axes for organic motion
    float rotSpeed1 = 1.8 + delay * 1.2;
    float rotSpeed2 = 1.2 + (1.0 - delay) * 0.8;
    float rotAngle1 = displacement * rotSpeed1 * PI;
    float rotAngle2 = displacement * rotSpeed2 * PI * 0.7;

    // Add time-based wobble for organic feel (only when displaced)
    float wobble = sin(uTime * 2.0 + delay * 20.0) * 0.3 * displacement;
    rotAngle1 += wobble;

    // Primary rotation around shard's random axis
    localPos = rotateAxis(localPos, rotationAxis, rotAngle1);

    // Secondary gentle rotation around Y for paper-drift feel
    vec3 secondAxis = normalize(cross(rotationAxis, vec3(0.0, 1.0, 0.0)) + vec3(0.001));
    localPos = rotateAxis(localPos, secondAxis, rotAngle2 * 0.5);

    // ---- Translation: scatter + gravity-like fall ----
    vec3 offset = vec3(0.0);

    // Scatter outward from card
    offset += scatterDir * displacement * 2.5;

    // Downward drift (gravity-like, accelerating)
    float fallAmount = displacement * displacement;
    offset.y -= fallAmount * 3.0;

    // Lateral drift (wind-like, sinusoidal)
    float windPhase = delay * 12.0 + uTime * 0.8;
    offset.x += sin(windPhase) * displacement * 0.4;
    offset.z += cos(windPhase * 0.7) * displacement * 0.3;

    // Subtle float/bob during mid-tumble
    float midTumble = sin(displacement * PI); // peaks at displacement=0.5
    offset.y += sin(uTime * 1.5 + delay * 15.0) * midTumble * 0.15;

    // Final position
    vec3 finalPos = shardCenter + localPos + offset;

    vDepth = offset.z;

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  #define PI 3.14159265359
  precision highp float;

  uniform float uProgress;
  uniform float uTime;

  varying vec2 vUv;
  varying float vShardProgress;
  varying float vDepth;

  void main() {
    // Card content: dark surface with subtle grid and gradient
    vec3 dark1 = vec3(0.06, 0.04, 0.1);
    vec3 dark2 = vec3(0.02, 0.12, 0.18);
    vec3 baseColor = mix(dark1, dark2, vUv.y + vUv.x * 0.3);

    // Subtle grid pattern
    float gx = smoothstep(0.47, 0.5, abs(fract(vUv.x * 8.0) - 0.5));
    float gy = smoothstep(0.47, 0.5, abs(fract(vUv.y * 6.0) - 0.5));
    baseColor += vec3(0.0, 0.25, 0.3) * (gx + gy) * 0.08;

    // Second content layer (vibrant) — blends in during middle of transition
    vec3 purple = vec3(0.4, 0.05, 0.55);
    vec3 cyan = vec3(0.05, 0.7, 0.85);
    vec3 vibrant = mix(purple, cyan, vUv.y * 0.7 + vUv.x * 0.5);
    float contentBlend = smoothstep(0.35, 0.65, uProgress);
    vec3 color = mix(baseColor, vibrant, contentBlend);

    // Edge glow on shards when displaced
    // Use UV distance from shard edge as a proxy
    float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float edgeGlow = smoothstep(0.05, 0.0, edgeDist) * vShardProgress;
    color += vec3(0.0, 0.85, 1.0) * edgeGlow * 0.6;

    // Slight shadow on displaced shards
    color *= 1.0 - vShardProgress * 0.15;

    // Depth-based shading for 3D feel
    color *= 1.0 + vDepth * 0.1;

    gl_FragColor = vec4(color, 1.0);
  }
`

/**
 * Build the shard geometry: take a subdivided plane and split every triangle
 * so each owns its own 3 vertices (no shared vertices between triangles).
 * Returns the geometry + per-shard attribute data.
 */
function buildShardGeometry() {
  // Create subdivided plane
  const plane = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT, SUBDIVISIONS_X, SUBDIVISIONS_Y)
  const posAttr = plane.getAttribute('position')
  const uvAttr = plane.getAttribute('uv')
  const index = plane.getIndex()

  const triCount = index.count / 3
  // Each triangle gets 3 unique vertices
  const positions = new Float32Array(triCount * 3 * 3)
  const uvs = new Float32Array(triCount * 3 * 2)
  const shardCenters = new Float32Array(triCount * 3 * 3) // repeated per vertex of each tri
  const scatterDirs = new Float32Array(triCount * 3 * 3)
  const rotationAxes = new Float32Array(triCount * 3 * 3)
  const delays = new Float32Array(triCount * 3)

  // Seeded random for determinism
  function seededRandom(seed) {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  for (let tri = 0; tri < triCount; tri++) {
    const i0 = index.getX(tri * 3)
    const i1 = index.getX(tri * 3 + 1)
    const i2 = index.getX(tri * 3 + 2)

    // Vertex positions
    const ax = posAttr.getX(i0), ay = posAttr.getY(i0), az = posAttr.getZ(i0)
    const bx = posAttr.getX(i1), by = posAttr.getY(i1), bz = posAttr.getZ(i1)
    const cx = posAttr.getX(i2), cy = posAttr.getY(i2), cz = posAttr.getZ(i2)

    const base = tri * 9
    positions[base + 0] = ax; positions[base + 1] = ay; positions[base + 2] = az
    positions[base + 3] = bx; positions[base + 4] = by; positions[base + 5] = bz
    positions[base + 6] = cx; positions[base + 7] = cy; positions[base + 8] = cz

    // UVs
    const uvBase = tri * 6
    uvs[uvBase + 0] = uvAttr.getX(i0); uvs[uvBase + 1] = uvAttr.getY(i0)
    uvs[uvBase + 2] = uvAttr.getX(i1); uvs[uvBase + 3] = uvAttr.getY(i1)
    uvs[uvBase + 4] = uvAttr.getX(i2); uvs[uvBase + 5] = uvAttr.getY(i2)

    // Shard center (centroid)
    const centerX = (ax + bx + cx) / 3
    const centerY = (ay + by + cy) / 3
    const centerZ = (az + bz + cz) / 3

    // Write center for all 3 vertices of this triangle
    for (let v = 0; v < 3; v++) {
      shardCenters[base + v * 3 + 0] = centerX
      shardCenters[base + v * 3 + 1] = centerY
      shardCenters[base + v * 3 + 2] = centerZ
    }

    // Scatter direction: generally outward + downward, with per-shard randomness
    const seed = tri * 7.31
    const outX = centerX / (CARD_WIDTH * 0.5) // normalized -1 to 1
    const outY = centerY / (CARD_HEIGHT * 0.5)
    const randAngle = (seededRandom(seed + 1) - 0.5) * 0.8
    const cosA = Math.cos(randAngle), sinA = Math.sin(randAngle)
    const scX = outX * cosA - outY * sinA
    const scY = outX * sinA + outY * cosA - 0.3 // bias downward
    const scZ = (seededRandom(seed + 2) - 0.5) * 0.6
    const scLen = Math.sqrt(scX * scX + scY * scY + scZ * scZ) || 1
    const nScX = scX / scLen, nScY = scY / scLen, nScZ = scZ / scLen

    for (let v = 0; v < 3; v++) {
      scatterDirs[base + v * 3 + 0] = nScX
      scatterDirs[base + v * 3 + 1] = nScY
      scatterDirs[base + v * 3 + 2] = nScZ
    }

    // Random rotation axis (unit vector)
    const rTheta = seededRandom(seed + 3) * Math.PI * 2
    const rPhi = Math.acos(2 * seededRandom(seed + 4) - 1)
    const rX = Math.sin(rPhi) * Math.cos(rTheta)
    const rY = Math.sin(rPhi) * Math.sin(rTheta)
    const rZ = Math.cos(rPhi)

    for (let v = 0; v < 3; v++) {
      rotationAxes[base + v * 3 + 0] = rX
      rotationAxes[base + v * 3 + 1] = rY
      rotationAxes[base + v * 3 + 2] = rZ
    }

    // Delay: based on distance from center (edge shards go first)
    const distFromCenter = Math.sqrt(centerX * centerX + centerY * centerY)
    const maxDist = Math.sqrt((CARD_WIDTH / 2) ** 2 + (CARD_HEIGHT / 2) ** 2)
    const normalizedDist = distFromCenter / maxDist
    // Edge first = low delay for high distance
    const delayVal = 1.0 - normalizedDist + seededRandom(seed + 5) * 0.2

    for (let v = 0; v < 3; v++) {
      delays[tri * 3 + v] = delayVal
    }
  }

  // Build non-indexed BufferGeometry
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setAttribute('shardCenter', new THREE.BufferAttribute(shardCenters, 3))
  geo.setAttribute('scatterDir', new THREE.BufferAttribute(scatterDirs, 3))
  geo.setAttribute('rotationAxis', new THREE.BufferAttribute(rotationAxes, 3))
  geo.setAttribute('delay', new THREE.BufferAttribute(delays, 1))

  plane.dispose()
  return geo
}

function ShatterPanel() {
  const meshRef = useRef()
  const scroll = useScroll()
  const { viewport } = useThree()

  const { geometry, uniforms } = useMemo(() => {
    const geo = buildShardGeometry()
    const u = {
      uProgress: { value: 0 },
      uTime: { value: 0 },
    }
    return { geometry: geo, uniforms: u }
  }, [])

  useFrame(({ clock }) => {
    const mat = meshRef.current?.material
    if (!mat) return
    mat.uniforms.uProgress.value = THREE.MathUtils.clamp(scroll.offset * 2, 0, 1)
    mat.uniforms.uTime.value = clock.getElapsedTime()
  })

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export default function CardShatter() {
  return (
    <ScrollControls pages={3} damping={0.15}>
      <ShatterPanel />
      <Scroll html>
        <div style={{
          position: 'absolute',
          top: '10vh',
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          pointerEvents: 'none',
        }}>
          <h2 style={{ fontSize: '1.5rem', opacity: 0.7, fontWeight: 300 }}>
            Scroll down to shatter the card
          </h2>
        </div>
      </Scroll>
    </ScrollControls>
  )
}
