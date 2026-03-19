import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ScrollControls, useScroll } from '@react-three/drei'

const GRID_COLS = 100
const GRID_ROWS = 100
const PARTICLE_COUNT = GRID_COLS * GRID_ROWS

// JS smoothstep for camera follow
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// Card texture matching ScrollVelocitySmear style — readable content card
function createCardTexture(variant) {
  const canvas = document.createElement('canvas')
  const w = 800
  const h = 1000
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  // White card background with rounded corners
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, 16)
  ctx.fill()

  if (variant === 'A') {
    // Blue header
    ctx.fillStyle = '#2563eb'
    ctx.beginPath()
    ctx.roundRect(0, 0, w, 80, [16, 16, 0, 0])
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif'
    ctx.fillText('Presentation Builder', 30, 50)

    // Avatar
    ctx.fillStyle = '#e0e7ff'
    ctx.beginPath()
    ctx.arc(w - 55, 40, 22, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#6366f1'
    ctx.font = 'bold 18px system-ui'
    ctx.fillText('BL', w - 67, 46)

    // Title
    ctx.fillStyle = '#111827'
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif'
    ctx.fillText('AI-Powered Slide Generation', 30, 140)

    ctx.fillStyle = '#6b7280'
    ctx.font = '16px system-ui, -apple-system, sans-serif'
    ctx.fillText('Conversational presentation design tool', 30, 172)

    // Divider
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(30, 195)
    ctx.lineTo(w - 30, 195)
    ctx.stroke()

    // Body text
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

    // Stats
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

    // Button
    const btnY = h - 80
    ctx.fillStyle = '#2563eb'
    ctx.beginPath()
    ctx.roundRect(30, btnY, 180, 44, 8)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 15px system-ui'
    ctx.fillText('Try It Out →', 62, btnY + 28)
  } else {
    // Purple header for variant B
    ctx.fillStyle = '#7c3aed'
    ctx.beginPath()
    ctx.roundRect(0, 0, w, 80, [16, 16, 0, 0])
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif'
    ctx.fillText('AR Scavenger Hunt', 30, 50)

    // Avatar
    ctx.fillStyle = '#ede9fe'
    ctx.beginPath()
    ctx.arc(w - 55, 40, 22, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#7c3aed'
    ctx.font = 'bold 18px system-ui'
    ctx.fillText('AR', w - 68, 46)

    // Title
    ctx.fillStyle = '#111827'
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif'
    ctx.fillText('Location-Based AR Game', 30, 140)

    ctx.fillStyle = '#6b7280'
    ctx.font = '16px system-ui, -apple-system, sans-serif'
    ctx.fillText('iOS app built with a team of three', 30, 172)

    // Divider
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(30, 195)
    ctx.lineTo(w - 30, 195)
    ctx.stroke()

    // Body text
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

    // Stats
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

    // Button
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

  attribute vec3 positionA;
  attribute vec3 positionB;
  attribute vec2 aUv;
  attribute float randomSeed;
  attribute float swarmSide; // -1 = left swarm, +1 = right swarm

  uniform float uProgress;
  uniform float uTime;
  uniform float uPointSize;

  varying float vAlpha;
  varying float vColorMix;
  varying vec2 vUv;

  // --- Simplex noise ---
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

  vec2 curlNoise(vec2 p) {
    float eps = 0.01;
    float n1 = snoise(vec2(p.x, p.y + eps));
    float n2 = snoise(vec2(p.x, p.y - eps));
    float n3 = snoise(vec2(p.x + eps, p.y));
    float n4 = snoise(vec2(p.x - eps, p.y));
    return vec2((n1 - n2) / (2.0 * eps), -(n3 - n4) / (2.0 * eps));
  }

  void main() {
    // --- Per-particle stagger ---
    float delay = randomSeed * 0.2;

    // Phase 1: Dissolve (0.0 - 0.3)
    float particleDissolve = smoothstep(delay, delay + 0.25, uProgress);

    // Phase 3: Reform (0.7 - 1.0)
    float particleReform = smoothstep(0.72 + (1.0 - randomSeed) * 0.12, 0.97, uProgress);

    // Net displacement: 0 at rest, peaks in middle
    float displacement = particleDissolve * (1.0 - particleReform);

    // Force exact zero at endpoints
    if (uProgress <= 0.001 || uProgress >= 0.999) {
      particleDissolve = 0.0;
      particleReform = 1.0;
    }

    // Home lerps from A to B
    vec3 home = mix(positionA, positionB, particleReform);

    // --- SWARM BEHAVIOR ---

    // 1. Initial burst: scatter left/right based on swarmSide
    float burstPhase = smoothstep(0.0, 0.25, particleDissolve);
    vec3 burstDir = vec3(
      swarmSide * (0.8 + randomSeed * 0.5),  // strong lateral push
      (randomSeed - 0.5) * 0.4,               // slight vertical spread
      (sin(randomSeed * 99.0) - 0.5) * 0.3    // slight z spread
    );
    vec3 burstOffset = burstDir * burstPhase * displacement * 2.5;

    // 2. Swarm drift: both swarms fly downward together but stay clustered
    //    Each particle has individual noise but is pulled toward swarm center
    float driftPhase = smoothstep(0.15, 0.75, uProgress) * (1.0 - smoothstep(0.7, 0.95, uProgress));

    // Swarm center path: goes outward then curves down
    float swarmCenterX = swarmSide * 3.0 * sin(driftPhase * PI * 0.5); // arc outward
    float swarmCenterY = -driftPhase * 5.0; // steady downward
    vec3 swarmCenter = vec3(swarmCenterX, swarmCenterY, 0.0);

    // Individual particle offset within swarm (firefly jitter)
    float jitterScale = 0.8 + randomSeed * 0.5;
    float timeOffset = randomSeed * 50.0;
    vec3 jitter = vec3(
      sin(uTime * 1.8 + timeOffset) * 0.4 + sin(uTime * 3.1 + timeOffset * 1.3) * 0.2,
      sin(uTime * 2.2 + timeOffset * 0.7) * 0.3 + cos(uTime * 1.4 + timeOffset) * 0.15,
      sin(uTime * 1.5 + timeOffset * 1.1) * 0.25
    ) * jitterScale;

    // Curl noise for organic swarm movement
    vec2 curl = curlNoise(
      vec2(swarmCenter.x, swarmCenter.y) * 0.3 + uTime * 0.1 + randomSeed * 10.0
    );
    vec3 curlOffset = vec3(curl * 0.5, snoise(vec2(randomSeed * 20.0, uTime * 0.2)) * 0.2);

    // Combine: particle position = home + burst + swarm drift + jitter + curl
    vec3 swarmOffset = (swarmCenter + jitter + curlOffset) * displacement;

    // Blend between burst (early) and swarm drift (mid) — burst fades into swarm
    float burstToSwarm = smoothstep(0.15, 0.4, uProgress);
    vec3 totalOffset = mix(burstOffset, swarmOffset, burstToSwarm);

    vec3 pos = home + totalOffset;

    // --- Particle size ---
    float scattered = displacement;
    float size = mix(uPointSize, uPointSize * 0.5, scattered);

    // Slight size variation within swarm for depth
    size *= 0.7 + randomSeed * 0.6;

    vAlpha = mix(1.0, 0.65, scattered * 0.5);
    vColorMix = particleReform;
    vUv = aUv;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  #define PI 3.14159265359

  precision highp float;

  uniform sampler2D uTextureA;
  uniform sampler2D uTextureB;

  varying float vAlpha;
  varying float vColorMix;
  varying vec2 vUv;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.15, d) * vAlpha;

    vec3 colorA = texture2D(uTextureA, vUv).rgb;
    vec3 colorB = texture2D(uTextureB, vUv).rgb;
    vec3 color = mix(colorA, colorB, vColorMix);

    // Subtle glow at center of each particle
    float glow = smoothstep(0.4, 0.0, d) * 0.15;
    color += glow;

    gl_FragColor = vec4(color, alpha);
  }
`

function ImageParticleScene() {
  const meshRef = useRef()
  const scroll = useScroll()
  const { camera } = useThree()
  const initialCamY = useRef(null)

  const textures = useMemo(() => ({
    A: createCardTexture('A'),
    B: createCardTexture('B'),
  }), [])

  const { geometry, uniforms } = useMemo(() => {
    // Card dimensions in world space (matching 800:1000 aspect = 0.8:1)
    const cardWidth = 4.0
    const cardHeight = 5.0

    const posA = new Float32Array(PARTICLE_COUNT * 3)
    const posB = new Float32Array(PARTICLE_COUNT * 3)
    const uvs = new Float32Array(PARTICLE_COUNT * 2)
    const seeds = new Float32Array(PARTICLE_COUNT)
    const swarmSides = new Float32Array(PARTICLE_COUNT)

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const idx = row * GRID_COLS + col
        const u = col / (GRID_COLS - 1)
        const v = row / (GRID_ROWS - 1)

        // Position A: card centered at origin
        posA[idx * 3]     = (u - 0.5) * cardWidth
        posA[idx * 3 + 1] = (0.5 - v) * cardHeight
        posA[idx * 3 + 2] = 0

        // Position B: same layout, same center (camera handles the transition)
        posB[idx * 3]     = (u - 0.5) * cardWidth
        posB[idx * 3 + 1] = (0.5 - v) * cardHeight
        posB[idx * 3 + 2] = 0

        // UV (flip V for canvas top-left origin)
        uvs[idx * 2]     = u
        uvs[idx * 2 + 1] = 1.0 - v

        seeds[idx] = Math.random()

        // Swarm side: left half of card → left swarm (-1), right half → right swarm (+1)
        // Add some randomness at the center so the split isn't a hard line
        const centerBias = (u - 0.5) * 4.0 // strong left/right signal
        const noise = (Math.random() - 0.5) * 0.8 // some randomness
        swarmSides[idx] = (centerBias + noise) > 0 ? 1.0 : -1.0
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(posA.slice(), 3))
    geo.setAttribute('positionA', new THREE.BufferAttribute(posA, 3))
    geo.setAttribute('positionB', new THREE.BufferAttribute(posB, 3))
    geo.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2))
    geo.setAttribute('randomSeed', new THREE.BufferAttribute(seeds, 1))
    geo.setAttribute('swarmSide', new THREE.BufferAttribute(swarmSides, 1))

    const unis = {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uPointSize: { value: 4.0 },
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

    // Capture initial camera Y on first frame
    if (initialCamY.current === null) {
      initialCamY.current = camera.position.y
    }

    const progress = THREE.MathUtils.clamp(scroll.offset, 0, 1)
    uniforms.uProgress.value = progress
    uniforms.uTime.value = clock.getElapsedTime()

    // Camera follows swarms downward, returns for reform
    // Bell curve: ease into follow during dissolve, ease back during reform
    const followIn = smoothstep(0.15, 0.4, progress)
    const followOut = smoothstep(0.65, 0.95, progress)
    const cameraOffset = followIn * (1.0 - followOut) * 5.0
    camera.position.y = initialCamY.current - cameraOffset
  })

  return (
    <points ref={meshRef} geometry={geometry}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

export default function ImageToParticles() {
  return (
    <>
      <color attach="background" args={['#0a0a0a']} />
      <ScrollControls pages={3} damping={0.15}>
        <ImageParticleScene />
      </ScrollControls>
    </>
  )
}
