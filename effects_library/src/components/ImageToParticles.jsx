import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ScrollControls, useScroll } from '@react-three/drei'

// Card dimensions
const CARD_WIDTH = 4.0
const CARD_HEIGHT = 5.0
const SUBDIVS_X = 20
const SUBDIVS_Y = 25
// Each triangle shard gets subdivided for smoother look
const SHARD_SUBDIVS = 3

// JS smoothstep for camera follow
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// Card texture — readable content card
function createCardTexture(variant) {
  const canvas = document.createElement('canvas')
  const w = 800
  const h = 1000
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, 16)
  ctx.fill()

  if (variant === 'A') {
    ctx.fillStyle = '#2563eb'
    ctx.beginPath()
    ctx.roundRect(0, 0, w, 80, [16, 16, 0, 0])
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif'
    ctx.fillText('Presentation Builder', 30, 50)

    ctx.fillStyle = '#e0e7ff'
    ctx.beginPath()
    ctx.arc(w - 55, 40, 22, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#6366f1'
    ctx.font = 'bold 18px system-ui'
    ctx.fillText('BL', w - 67, 46)

    ctx.fillStyle = '#111827'
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif'
    ctx.fillText('AI-Powered Slide Generation', 30, 140)

    ctx.fillStyle = '#6b7280'
    ctx.font = '16px system-ui, -apple-system, sans-serif'
    ctx.fillText('Conversational presentation design tool', 30, 172)

    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(30, 195)
    ctx.lineTo(w - 30, 195)
    ctx.stroke()

    ctx.fillStyle = '#374151'
    ctx.font = '15px system-ui, -apple-system, sans-serif'
    const lines = [
      'A chatbot that focuses on conversation first —',
      'clarifying your messy presentation idea into a',
      'concrete structure before generating any slides.',
      '',
      'The AI asks targeted questions to understand your',
      'audience, key messages, and desired outcomes. Only',
      'then does it generate slides with critical content,',
      'not filler text.',
      '',
      'Built with React, Claude API, and real-time',
      'collaboration features.',
    ]
    let y = 225
    for (const line of lines) {
      if (line === '') { y += 10; continue }
      ctx.fillText(line, 30, y)
      y += 24
    }

    const statsY = y + 20
    ctx.strokeStyle = '#e5e7eb'
    ctx.beginPath()
    ctx.moveTo(30, statsY - 10)
    ctx.lineTo(w - 30, statsY - 10)
    ctx.stroke()

    const stats = [
      { label: 'Slides', value: '∞' },
      { label: 'AI Model', value: 'Claude' },
      { label: 'Status', value: 'Live' },
    ]
    const statWidth = (w - 60) / stats.length
    stats.forEach((stat, i) => {
      const sx = 30 + i * statWidth
      ctx.fillStyle = '#111827'
      ctx.font = 'bold 24px system-ui'
      ctx.fillText(stat.value, sx + 10, statsY + 25)
      ctx.fillStyle = '#9ca3af'
      ctx.font = '13px system-ui'
      ctx.fillText(stat.label, sx + 10, statsY + 45)
    })

    const btnY = h - 80
    ctx.fillStyle = '#2563eb'
    ctx.beginPath()
    ctx.roundRect(30, btnY, 180, 44, 8)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 15px system-ui'
    ctx.fillText('Try It Out →', 62, btnY + 28)
  } else {
    ctx.fillStyle = '#7c3aed'
    ctx.beginPath()
    ctx.roundRect(0, 0, w, 80, [16, 16, 0, 0])
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif'
    ctx.fillText('AR Scavenger Hunt', 30, 50)

    ctx.fillStyle = '#ede9fe'
    ctx.beginPath()
    ctx.arc(w - 55, 40, 22, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#7c3aed'
    ctx.font = 'bold 18px system-ui'
    ctx.fillText('AR', w - 68, 46)

    ctx.fillStyle = '#111827'
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif'
    ctx.fillText('Location-Based AR Game', 30, 140)

    ctx.fillStyle = '#6b7280'
    ctx.font = '16px system-ui, -apple-system, sans-serif'
    ctx.fillText('iOS app built with a team of three', 30, 172)

    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(30, 195)
    ctx.lineTo(w - 30, 195)
    ctx.stroke()

    ctx.fillStyle = '#374151'
    ctx.font = '15px system-ui, -apple-system, sans-serif'
    const lines = [
      'An augmented reality scavenger hunt game where',
      'players explore real-world locations to discover',
      'hidden AR objects and solve clues.',
      '',
      'Built collaboratively with two peers in the',
      'Fractal bootcamp program. Currently in the final',
      'stages of App Store deployment.',
      '',
      'Features real-time multiplayer, location tracking,',
      'and persistent game state across sessions.',
    ]
    let y = 225
    for (const line of lines) {
      if (line === '') { y += 10; continue }
      ctx.fillText(line, 30, y)
      y += 24
    }

    const statsY = y + 20
    ctx.strokeStyle = '#e5e7eb'
    ctx.beginPath()
    ctx.moveTo(30, statsY - 10)
    ctx.lineTo(w - 30, statsY - 10)
    ctx.stroke()

    const stats = [
      { label: 'Platform', value: 'iOS' },
      { label: 'Team', value: '3 devs' },
      { label: 'Status', value: 'Beta' },
    ]
    const statWidth = (w - 60) / stats.length
    stats.forEach((stat, i) => {
      const sx = 30 + i * statWidth
      ctx.fillStyle = '#111827'
      ctx.font = 'bold 24px system-ui'
      ctx.fillText(stat.value, sx + 10, statsY + 25)
      ctx.fillStyle = '#9ca3af'
      ctx.font = '13px system-ui'
      ctx.fillText(stat.label, sx + 10, statsY + 45)
    })

    const btnY = h - 80
    ctx.fillStyle = '#7c3aed'
    ctx.beginPath()
    ctx.roundRect(30, btnY, 180, 44, 8)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 15px system-ui'
    ctx.fillText('View Project →', 55, btnY + 28)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

const vertexShader = /* glsl */ `
  #define PI 3.14159265359

  // Per-shard attributes
  attribute vec3 shardCenter;
  attribute vec3 scatterDir;
  attribute float delay;
  attribute float swarmSide; // -1 = left, +1 = right

  uniform float uProgress;
  uniform float uTime;

  varying vec2 vUv;
  varying float vDisplacement;

  // Simplex noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Rodrigues rotation
  vec3 rotateAxis(vec3 v, vec3 axis, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
  }

  void main() {
    vUv = uv;

    // Per-shard staggered timing
    float d = clamp(delay, 0.0, 1.0);

    // Dissolve: staggered outward from edges
    float fractureStart = d * 0.15;
    float fracture = smoothstep(fractureStart, fractureStart + 0.25, uProgress);

    // Reform: staggered settle
    float reformStart = 0.65 + d * 0.18;
    float reform = smoothstep(reformStart, 0.97, uProgress);

    // Net displacement
    float displacement = fracture * (1.0 - reform);
    if (uProgress <= 0.001 || uProgress >= 0.999) displacement = 0.0;
    vDisplacement = displacement;

    // Local position relative to shard center
    vec3 localPos = position - shardCenter;

    // --- Rotation: tumble while displaced ---
    float spinRate = 2.0 + d * 3.0;
    float rotAngle = uTime * spinRate * displacement;
    vec3 rotAxis = normalize(scatterDir + vec3(0.001));
    localPos = rotateAxis(localPos, rotAxis, rotAngle);

    // Secondary slower tumble
    vec3 rotAxis2 = normalize(cross(rotAxis, vec3(0.0, 1.0, 0.0)) + vec3(0.001));
    localPos = rotateAxis(localPos, rotAxis2, rotAngle * 0.4);

    // --- Swarm movement ---
    vec3 offset = vec3(0.0);

    // 1. Initial burst: scatter left/right
    float burstPhase = smoothstep(0.0, 0.3, fracture);
    vec3 burstDir = vec3(
      swarmSide * (1.0 + d * 0.6),
      scatterDir.y * 0.4,
      scatterDir.z * 0.3
    );
    vec3 burstOffset = burstDir * burstPhase * 2.0;

    // 2. Swarm drift downward
    float driftPhase = smoothstep(0.15, 0.75, uProgress) * (1.0 - smoothstep(0.65, 0.92, uProgress));

    // Swarm center: arcs outward then down
    float swarmX = swarmSide * 2.5 * sin(driftPhase * PI * 0.5);
    float swarmY = -driftPhase * 5.0;
    vec3 swarmCenter = vec3(swarmX, swarmY, 0.0);

    // Per-shard jitter within swarm (firefly feel)
    float timeOff = d * 50.0;
    vec3 jitter = vec3(
      sin(uTime * 1.8 + timeOff) * 0.35 + sin(uTime * 3.1 + timeOff * 1.3) * 0.15,
      sin(uTime * 2.2 + timeOff * 0.7) * 0.25 + cos(uTime * 1.4 + timeOff) * 0.1,
      sin(uTime * 1.5 + timeOff * 1.1) * 0.2
    ) * (0.6 + d * 0.5);

    // Curl-like noise offset
    float nx = snoise(vec2(shardCenter.x * 0.5 + uTime * 0.15, shardCenter.y * 0.5));
    float ny = snoise(vec2(shardCenter.y * 0.5 + uTime * 0.12, shardCenter.x * 0.5 + 100.0));
    vec3 noiseOff = vec3(nx, ny, 0.0) * 0.4;

    vec3 swarmOffset = (swarmCenter + jitter + noiseOff);

    // Blend burst → swarm
    float burstToSwarm = smoothstep(0.12, 0.35, uProgress);
    offset = mix(burstOffset, swarmOffset, burstToSwarm) * displacement;

    vec3 finalPos = shardCenter + localPos + offset;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  #define PI 3.14159265359
  precision highp float;

  uniform sampler2D uTextureA;
  uniform sampler2D uTextureB;
  uniform float uProgress;

  varying vec2 vUv;
  varying float vDisplacement;

  void main() {
    // Blend between textures based on progress
    // Card A at start, Card B at end, crossfade in middle
    float texMix = smoothstep(0.35, 0.65, uProgress);
    vec3 colorA = texture2D(uTextureA, vUv).rgb;
    vec3 colorB = texture2D(uTextureB, vUv).rgb;
    vec3 color = mix(colorA, colorB, texMix);

    // Subtle edge darkening on displaced shards
    color *= 1.0 - vDisplacement * 0.1;

    gl_FragColor = vec4(color, 1.0);
  }
`

function seededRandom(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function buildShardGeometry() {
  const plane = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT, SUBDIVS_X, SUBDIVS_Y)
  const posAttr = plane.getAttribute('position')
  const uvAttr = plane.getAttribute('uv')
  const index = plane.getIndex()

  const origTriCount = index.count / 3
  const N = SHARD_SUBDIVS
  const subsPerShard = N * N
  const vertsPerShard = subsPerShard * 3
  const totalVerts = origTriCount * vertsPerShard

  const positions = new Float32Array(totalVerts * 3)
  const uvs = new Float32Array(totalVerts * 2)
  const shardCenters = new Float32Array(totalVerts * 3)
  const scatterDirs = new Float32Array(totalVerts * 3)
  const delays = new Float32Array(totalVerts)
  const swarmSides = new Float32Array(totalVerts)

  let vi = 0

  for (let tri = 0; tri < origTriCount; tri++) {
    const i0 = index.getX(tri * 3)
    const i1 = index.getX(tri * 3 + 1)
    const i2 = index.getX(tri * 3 + 2)

    const p0 = [posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0)]
    const p1 = [posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1)]
    const p2 = [posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2)]
    const u0 = [uvAttr.getX(i0), uvAttr.getY(i0)]
    const u1 = [uvAttr.getX(i1), uvAttr.getY(i1)]
    const u2 = [uvAttr.getX(i2), uvAttr.getY(i2)]

    const centerX = (p0[0] + p1[0] + p2[0]) / 3
    const centerY = (p0[1] + p1[1] + p2[1]) / 3
    const centerZ = 0

    const seed = tri * 7.31

    // Scatter direction: mostly outward from center
    const outX = centerX / (CARD_WIDTH * 0.5)
    const outY = centerY / (CARD_HEIGHT * 0.5)
    const scX = outX + (seededRandom(seed + 1) - 0.5) * 0.5
    const scY = outY + (seededRandom(seed + 2) - 0.5) * 0.5
    const scZ = (seededRandom(seed + 3) - 0.5) * 0.4
    const scLen = Math.sqrt(scX * scX + scY * scY + scZ * scZ) || 1

    // Delay: edge shards fracture first, center last
    const distFromCenter = Math.sqrt(centerX * centerX + centerY * centerY)
    const maxDist = Math.sqrt((CARD_WIDTH / 2) ** 2 + (CARD_HEIGHT / 2) ** 2)
    const normalizedDist = distFromCenter / maxDist
    const delayVal = Math.min(1.0, Math.max(0.0, 1.0 - normalizedDist + seededRandom(seed + 4) * 0.2))

    // Swarm side: based on x position with some randomness
    const sideBias = centerX / (CARD_WIDTH * 0.5) * 3.0 + (seededRandom(seed + 5) - 0.5) * 0.6
    const side = sideBias > 0 ? 1.0 : -1.0

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

    function addVertex(a, b) {
      const pos = baryPos(a, b)
      const uv = baryUV(a, b)

      positions[vi * 3] = pos[0]
      positions[vi * 3 + 1] = pos[1]
      positions[vi * 3 + 2] = pos[2]

      uvs[vi * 2] = uv[0]
      uvs[vi * 2 + 1] = uv[1]

      shardCenters[vi * 3] = centerX
      shardCenters[vi * 3 + 1] = centerY
      shardCenters[vi * 3 + 2] = centerZ

      scatterDirs[vi * 3] = scX / scLen
      scatterDirs[vi * 3 + 1] = scY / scLen
      scatterDirs[vi * 3 + 2] = scZ / scLen

      delays[vi] = delayVal
      swarmSides[vi] = side

      vi++
    }

    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N - a; b++) {
        addVertex(a, b)
        addVertex(a + 1, b)
        addVertex(a, b + 1)

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
  geo.setAttribute('delay', new THREE.BufferAttribute(delays, 1))
  geo.setAttribute('swarmSide', new THREE.BufferAttribute(swarmSides, 1))

  plane.dispose()
  return geo
}

function ShardScene() {
  const meshRef = useRef()
  const scroll = useScroll()
  const { camera } = useThree()
  const initialCamY = useRef(null)

  const textures = useMemo(() => ({
    A: createCardTexture('A'),
    B: createCardTexture('B'),
  }), [])

  const { geometry, uniforms } = useMemo(() => {
    const geo = buildShardGeometry()
    const unis = {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uTextureA: { value: textures.A },
      uTextureB: { value: textures.B },
    }
    return { geometry: geo, uniforms: unis }
  }, [textures])

  useEffect(() => {
    return () => {
      textures.A.dispose()
      textures.B.dispose()
      geometry.dispose()
    }
  }, [textures, geometry])

  useFrame(({ clock }) => {
    if (!meshRef.current) return

    if (initialCamY.current === null) {
      initialCamY.current = camera.position.y
    }

    const progress = THREE.MathUtils.clamp(scroll.offset, 0, 1)
    uniforms.uProgress.value = progress
    uniforms.uTime.value = clock.getElapsedTime()

    // Camera follows shards downward, returns for reform
    const followIn = smoothstep(0.15, 0.4, progress)
    const followOut = smoothstep(0.65, 0.95, progress)
    const cameraOffset = followIn * (1.0 - followOut) * 5.0
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

export default function ImageToParticles() {
  return (
    <>
      <color attach="background" args={['#0a0a0a']} />
      <ScrollControls pages={3} damping={0.15}>
        <ShardScene />
      </ScrollControls>
    </>
  )
}
