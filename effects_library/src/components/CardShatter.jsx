import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useScroll, ScrollControls, Scroll } from '@react-three/drei'
import * as THREE from 'three'

// JS smootherstep (mirrors GLSL smoothstep)
function smootherstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// Card dimensions
const CARD_WIDTH = 5
const CARD_HEIGHT = 3.5
const SUBDIVISIONS_X = 12
const SUBDIVISIONS_Y = 8

const vertexShader = /* glsl */ `
  #define PI 3.14159265359

  // Per-shard attributes
  attribute vec3 shardCenter;
  attribute vec3 scatterDir;
  attribute vec3 rotationAxis;
  attribute float delay;
  attribute float curlT;

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
    // 0 -> 0.35: fracture (slow, staggered — paper tearing apart)
    // 0.35 -> 0.65: glide downward like paper in wind
    // 0.65 -> 1.0: reform (slow, staggered — pieces settling back)

    // Clamp delay to safe range
    float d = clamp(delay, 0.0, 1.0);

    // Slow staggered fracture — each shard peels away at its own pace
    float fractureStart = d * 0.15;
    float fracture = smoothstep(fractureStart, fractureStart + 0.3, uProgress);

    // Slow staggered reform — each shard settles back gradually
    // All shards MUST complete by progress=1.0
    float reformStart = 0.6 + d * 0.2;
    float reform = smoothstep(reformStart, 0.98, uProgress);

    // Net displacement: up during fracture, sustained during glide, down during reform
    float displacement = fracture * (1.0 - reform);

    // Force exact zero at endpoints (no floating point gaps)
    if (uProgress <= 0.001 || uProgress >= 0.999) displacement = 0.0;

    vShardProgress = displacement;

    // ---- Transform vertex relative to shard center ----
    vec3 localPos = position - shardCenter;

    // ---- Paper curl: traveling wave along each shard ----
    // The bend shape itself moves over time, like paper rippling in wind
    float curlAmount = displacement * (0.4 + d * 0.7);
    float curlDir = sign(d - 0.5 + 0.001);

    // Primary wave: travels along the shard surface
    float wave1 = sin(curlT * PI * 2.0 - uTime * 4.0 + d * 12.0);
    // Secondary wave: slower, different frequency, creates irregular flutter
    float wave2 = sin(curlT * PI * 3.0 + uTime * 2.8 + d * 18.0);
    // Third wave: very slow, changes the overall bend direction
    float wave3 = sin(curlT * PI * 1.0 - uTime * 1.5 + d * 8.0);

    float totalCurl = (wave1 * 0.45 + wave2 * 0.3 + wave3 * 0.25) * curlAmount * curlDir;
    localPos.z += totalCurl;

    // ---- Rotation: continuous tumbling, not static angle ----
    // Use uTime so shards keep spinning while displaced (paper tumbling in air)
    float spinRate1 = 1.5 + d * 2.0;
    float spinRate2 = 1.0 + (1.0 - d) * 1.5;

    // Continuous rotation driven by time, gated by displacement
    float rotAngle1 = uTime * spinRate1 * displacement;
    float rotAngle2 = uTime * spinRate2 * 0.6 * displacement;

    // Primary rotation around shard's random axis
    localPos = rotateAxis(localPos, rotationAxis, rotAngle1);

    // Secondary rotation for that paper-flutter feel
    vec3 secondAxis = normalize(cross(rotationAxis, vec3(0.0, 1.0, 0.0)) + vec3(0.001));
    localPos = rotateAxis(localPos, secondAxis, rotAngle2);

    // ---- Translation: continuous glide downward ----
    vec3 offset = vec3(0.0);

    // Initial scatter outward (burst on fracture)
    float burstPhase = smoothstep(0.0, 0.3, fracture);
    offset += scatterDir * burstPhase * 1.2 * displacement;

    // Continuous downward glide — this is the main motion
    // Progresses with scroll, not just displacement, so shards TRAVEL down
    float glideProgress = smoothstep(0.1, 0.85, uProgress);
    float glideAmount = glideProgress * displacement;
    offset.y -= glideAmount * 4.0;

    // Lateral sway — sinusoidal, paper-in-wind feel
    float swayPhase = d * 15.0 + uTime * 1.2;
    offset.x += sin(swayPhase) * displacement * 0.6;
    offset.x += sin(swayPhase * 0.3 + 2.0) * displacement * 0.3; // slower secondary sway
    offset.z += cos(swayPhase * 0.7) * displacement * 0.4;

    // Gentle upward bob — paper floats, doesn't just fall
    float bobPhase = d * 20.0 + uTime * 2.0;
    offset.y += sin(bobPhase) * displacement * 0.25;

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

// How many times to subdivide each triangle shard (for curl deformation)
// N=3 → 9 sub-triangles per shard, 27 vertices per shard
const CURL_SUBDIVS = 5

/**
 * Build shard geometry: subdivide a plane into independent triangles,
 * then subdivide each triangle into smaller tris so they can curl/bend.
 */
function buildShardGeometry() {
  const plane = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT, SUBDIVISIONS_X, SUBDIVISIONS_Y)
  const posAttr = plane.getAttribute('position')
  const uvAttr = plane.getAttribute('uv')
  const index = plane.getIndex()

  const origTriCount = index.count / 3
  const N = CURL_SUBDIVS
  const subsPerShard = N * N // 9 sub-triangles per shard
  const vertsPerShard = subsPerShard * 3 // 27 vertices per shard
  const totalVerts = origTriCount * vertsPerShard

  const positions = new Float32Array(totalVerts * 3)
  const uvs = new Float32Array(totalVerts * 2)
  const shardCenters = new Float32Array(totalVerts * 3)
  const scatterDirs = new Float32Array(totalVerts * 3)
  const rotationAxes = new Float32Array(totalVerts * 3)
  const delays = new Float32Array(totalVerts)
  const curlTs = new Float32Array(totalVerts)

  function seededRandom(seed) {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  let vi = 0 // vertex index counter

  for (let tri = 0; tri < origTriCount; tri++) {
    const i0 = index.getX(tri * 3)
    const i1 = index.getX(tri * 3 + 1)
    const i2 = index.getX(tri * 3 + 2)

    // Original triangle vertices and UVs
    const p0 = [posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0)]
    const p1 = [posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1)]
    const p2 = [posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2)]
    const u0 = [uvAttr.getX(i0), uvAttr.getY(i0)]
    const u1 = [uvAttr.getX(i1), uvAttr.getY(i1)]
    const u2 = [uvAttr.getX(i2), uvAttr.getY(i2)]

    // Shard center (centroid of original triangle)
    const centerX = (p0[0] + p1[0] + p2[0]) / 3
    const centerY = (p0[1] + p1[1] + p2[1]) / 3
    const centerZ = (p0[2] + p1[2] + p2[2]) / 3

    // Per-shard attributes (same logic as before)
    const seed = tri * 7.31
    const outX = centerX / (CARD_WIDTH * 0.5)
    const outY = centerY / (CARD_HEIGHT * 0.5)
    const randAngle = (seededRandom(seed + 1) - 0.5) * 0.8
    const cosA = Math.cos(randAngle), sinA = Math.sin(randAngle)
    const scX = outX * cosA - outY * sinA
    const scY = outX * sinA + outY * cosA - 0.3
    const scZ = (seededRandom(seed + 2) - 0.5) * 0.6
    const scLen = Math.sqrt(scX * scX + scY * scY + scZ * scZ) || 1
    const nScX = scX / scLen, nScY = scY / scLen, nScZ = scZ / scLen

    const rTheta = seededRandom(seed + 3) * Math.PI * 2
    const rPhi = Math.acos(2 * seededRandom(seed + 4) - 1)
    const rX = Math.sin(rPhi) * Math.cos(rTheta)
    const rY = Math.sin(rPhi) * Math.sin(rTheta)
    const rZ = Math.cos(rPhi)

    const distFromCenter = Math.sqrt(centerX * centerX + centerY * centerY)
    const maxDist = Math.sqrt((CARD_WIDTH / 2) ** 2 + (CARD_HEIGHT / 2) ** 2)
    const normalizedDist = distFromCenter / maxDist
    const delayVal = Math.min(1.0, Math.max(0.0, 1.0 - normalizedDist + seededRandom(seed + 5) * 0.2))

    // Interpolate position using barycentric coordinates
    function baryPos(a, b) {
      const c = N - a - b
      const t0 = a / N, t1 = b / N, t2 = c / N
      return [
        t0 * p0[0] + t1 * p1[0] + t2 * p2[0],
        t0 * p0[1] + t1 * p1[1] + t2 * p2[1],
        t0 * p0[2] + t1 * p1[2] + t2 * p2[2],
      ]
    }
    function baryUV(a, b) {
      const c = N - a - b
      const t0 = a / N, t1 = b / N, t2 = c / N
      return [
        t0 * u0[0] + t1 * u1[0] + t2 * u2[0],
        t0 * u0[1] + t1 * u1[1] + t2 * u2[1],
      ]
    }

    // Write one vertex with all its attributes
    function addVertex(a, b) {
      const pos = baryPos(a, b)
      const uv = baryUV(a, b)
      const ct = a / N // curlT: 0 at vertex P0, 1 at opposite edge

      positions[vi * 3] = pos[0]
      positions[vi * 3 + 1] = pos[1]
      positions[vi * 3 + 2] = pos[2]

      uvs[vi * 2] = uv[0]
      uvs[vi * 2 + 1] = uv[1]

      shardCenters[vi * 3] = centerX
      shardCenters[vi * 3 + 1] = centerY
      shardCenters[vi * 3 + 2] = centerZ

      scatterDirs[vi * 3] = nScX
      scatterDirs[vi * 3 + 1] = nScY
      scatterDirs[vi * 3 + 2] = nScZ

      rotationAxes[vi * 3] = rX
      rotationAxes[vi * 3 + 1] = rY
      rotationAxes[vi * 3 + 2] = rZ

      delays[vi] = delayVal
      curlTs[vi] = ct

      vi++
    }

    // Barycentric subdivision: generate N² sub-triangles
    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N - a; b++) {
        // Upward triangle
        addVertex(a, b)
        addVertex(a + 1, b)
        addVertex(a, b + 1)

        // Downward triangle (if it fits)
        if (a + b < N - 1) {
          addVertex(a + 1, b)
          addVertex(a + 1, b + 1)
          addVertex(a, b + 1)
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setAttribute('shardCenter', new THREE.BufferAttribute(shardCenters, 3))
  geo.setAttribute('scatterDir', new THREE.BufferAttribute(scatterDirs, 3))
  geo.setAttribute('rotationAxis', new THREE.BufferAttribute(rotationAxes, 3))
  geo.setAttribute('delay', new THREE.BufferAttribute(delays, 1))
  geo.setAttribute('curlT', new THREE.BufferAttribute(curlTs, 1))

  plane.dispose()
  return geo
}

function ShatterPanel() {
  const meshRef = useRef()
  const scroll = useScroll()
  const { camera, viewport } = useThree()

  // Store initial camera Y so we can offset from it
  const initialCamY = useRef(null)

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

    // Capture initial camera position on first frame
    if (initialCamY.current === null) {
      initialCamY.current = camera.position.y
    }

    // Spread effect across full scroll range (was *2, now *1 = full 3 pages)
    const progress = THREE.MathUtils.clamp(scroll.offset, 0, 1)
    mat.uniforms.uProgress.value = progress
    mat.uniforms.uTime.value = clock.getElapsedTime()

    // Camera follows shards down during drift, returns home during reform
    // Bell curve: eases in with fracture, eases out with reform
    const followUp = smootherstep(0.15, 0.45, progress)   // ease into follow
    const followDown = smootherstep(0.65, 0.95, progress)  // ease back with reform
    const cameraOffset = followUp * (1.0 - followDown) * 4.0
    camera.position.y = initialCamY.current - cameraOffset
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
