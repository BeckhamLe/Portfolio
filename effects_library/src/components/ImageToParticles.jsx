import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ScrollControls, useScroll } from '@react-three/drei'

const PARTICLE_COUNT = 10000
const GRID_COLS = 100
const GRID_ROWS = 100

const vertexShader = /* glsl */ `
  #define PI 3.14159265359

  attribute vec3 positionA;
  attribute vec3 positionB;
  attribute vec2 aUv;
  attribute float randomSeed;

  uniform float uProgress;
  uniform float uTime;
  uniform float uPointSize;

  varying float vAlpha;
  varying float vColorMix;
  varying float vRandomSeed;
  varying vec2 vUv;

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
    // Staggered per-particle timing
    float delay = randomSeed * 0.2;

    // Phase 1: Dissolve from image A (0.0 - 0.3)
    float particleDissolve = smoothstep(delay, delay + 0.3, uProgress);

    // Phase 3: Reform into image B (0.7 - 1.0)
    float particleReform = smoothstep(0.7 + (1.0 - randomSeed) * 0.15, 0.98, uProgress);

    // Drift factor peaks in the middle
    float drift = smoothstep(0.2, 0.5, uProgress) * (1.0 - smoothstep(0.7, 0.95, uProgress));

    // Home position lerps from A to B as reform kicks in
    vec3 home = mix(positionA, positionB, particleReform);

    // Scatter direction — biased downward toward positionB
    vec3 scatterDir = normalize(vec3(
      sin(randomSeed * 123.4) * 0.4,
      -0.8 + cos(randomSeed * 456.7) * 0.3,
      sin(randomSeed * 789.0) * 0.2
    ));
    float scatterDist = (0.3 + randomSeed * 1.2) * particleDissolve * (1.0 - particleReform);

    // Curl noise for organic drift
    vec2 curl = curlNoise(home.xy * 0.8 + uTime * 0.15 + randomSeed * 10.0);
    vec3 curlOffset = vec3(curl * 0.6, snoise(home.xy * 0.5 + uTime * 0.1) * 0.2);
    float curlStrength = sin(drift * PI) * (1.0 - particleReform);

    // Gravity-like downward pull during drift
    float gravityPull = drift * 1.5 * (1.0 - particleReform);

    vec3 pos = home + scatterDir * scatterDist + curlOffset * curlStrength;
    pos.y -= gravityPull * (0.5 + randomSeed * 0.5);

    // Particle size — smaller when scattered
    float scattered = particleDissolve * (1.0 - particleReform);
    float size = mix(uPointSize, uPointSize * 0.4, scattered);

    vAlpha = mix(1.0, 0.6, scattered * 0.5);
    vColorMix = particleReform;
    vRandomSeed = randomSeed;
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
  varying float vRandomSeed;
  varying vec2 vUv;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.15, d) * vAlpha;

    vec3 colorA = texture2D(uTextureA, vUv).rgb;
    vec3 colorB = texture2D(uTextureB, vUv).rgb;
    vec3 color = mix(colorA, colorB, vColorMix);

    // Subtle glow
    float glow = smoothstep(0.4, 0.0, d) * 0.2;
    color += glow;

    gl_FragColor = vec4(color, alpha);
  }
`

function createCanvasTexture(type) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  if (type === 'A') {
    // Blue/teal gradient background
    const grad = ctx.createLinearGradient(0, 0, 512, 512)
    grad.addColorStop(0, '#0a2a3a')
    grad.addColorStop(0.5, '#0d4f5f')
    grad.addColorStop(1, '#1a6b7a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 512, 512)

    // Geometric shapes — circles
    ctx.strokeStyle = 'rgba(100, 220, 255, 0.4)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(380, 120, 60, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(400, 140, 40, 0, Math.PI * 2)
    ctx.stroke()

    // Triangle
    ctx.strokeStyle = 'rgba(80, 200, 230, 0.3)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(80, 380)
    ctx.lineTo(160, 280)
    ctx.lineTo(240, 380)
    ctx.closePath()
    ctx.stroke()

    // Horizontal lines
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(100, 200, 240, ${0.15 + i * 0.05})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(60, 400 + i * 20)
      ctx.lineTo(280, 400 + i * 20)
      ctx.stroke()
    }

    // Text
    ctx.fillStyle = '#b0e8f0'
    ctx.font = 'bold 48px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Project', 256, 200)
    ctx.fillText('Alpha', 256, 260)

    // Small dot grid
    ctx.fillStyle = 'rgba(150, 230, 255, 0.2)'
    for (let x = 0; x < 6; x++) {
      for (let y = 0; y < 6; y++) {
        ctx.beginPath()
        ctx.arc(320 + x * 25, 300 + y * 25, 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else {
    // Purple/pink gradient background
    const grad = ctx.createLinearGradient(0, 0, 512, 512)
    grad.addColorStop(0, '#2a0a3a')
    grad.addColorStop(0.5, '#4f0d5f')
    grad.addColorStop(1, '#7a1a6b')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 512, 512)

    // Geometric shapes — diamond
    ctx.strokeStyle = 'rgba(255, 130, 220, 0.4)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(400, 80)
    ctx.lineTo(450, 140)
    ctx.lineTo(400, 200)
    ctx.lineTo(350, 140)
    ctx.closePath()
    ctx.stroke()

    // Concentric squares
    ctx.strokeStyle = 'rgba(220, 100, 255, 0.3)'
    for (let i = 0; i < 3; i++) {
      const s = 30 + i * 20
      ctx.strokeRect(80 - s / 2, 340 - s / 2, s, s)
    }

    // Wavy line
    ctx.strokeStyle = 'rgba(255, 150, 200, 0.3)'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 60; x < 450; x += 2) {
      const y = 420 + Math.sin(x * 0.03) * 15
      if (x === 60) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Text
    ctx.fillStyle = '#e0b0f0'
    ctx.font = 'bold 48px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Project', 256, 200)
    ctx.fillText('Beta', 256, 260)

    // Small cross pattern
    ctx.strokeStyle = 'rgba(255, 180, 240, 0.2)'
    ctx.lineWidth = 1
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const cx = 300 + x * 30
        const cy = 300 + y * 30
        ctx.beginPath()
        ctx.moveTo(cx - 4, cy)
        ctx.lineTo(cx + 4, cy)
        ctx.moveTo(cx, cy - 4)
        ctx.lineTo(cx, cy + 4)
        ctx.stroke()
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

function ImageParticleScene() {
  const meshRef = useRef()
  const scroll = useScroll()
  const { viewport } = useThree()

  const textures = useMemo(() => ({
    A: createCanvasTexture('A'),
    B: createCanvasTexture('B'),
  }), [])

  const { geometry, uniforms } = useMemo(() => {
    const gridWidth = 4.0
    const gridHeight = 4.0
    const offsetY_A = 2.5
    const offsetY_B = -2.5

    const posA = new Float32Array(PARTICLE_COUNT * 3)
    const posB = new Float32Array(PARTICLE_COUNT * 3)
    const uvs = new Float32Array(PARTICLE_COUNT * 2)
    const seeds = new Float32Array(PARTICLE_COUNT)

    for (let i = 0; i < GRID_ROWS; i++) {
      for (let j = 0; j < GRID_COLS; j++) {
        const idx = i * GRID_COLS + j
        const u = j / (GRID_COLS - 1)
        const v = i / (GRID_ROWS - 1)

        // Position A — upper grid
        posA[idx * 3] = (u - 0.5) * gridWidth
        posA[idx * 3 + 1] = (0.5 - v) * gridHeight + offsetY_A
        posA[idx * 3 + 2] = 0

        // Position B — lower grid
        posB[idx * 3] = (u - 0.5) * gridWidth
        posB[idx * 3 + 1] = (0.5 - v) * gridHeight + offsetY_B
        posB[idx * 3 + 2] = 0

        // UV for texture sampling
        uvs[idx * 2] = u
        uvs[idx * 2 + 1] = 1.0 - v // flip V to match canvas top-left origin

        // Random seed
        seeds[idx] = Math.random()
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(posA.slice(), 3))
    geo.setAttribute('positionA', new THREE.BufferAttribute(posA, 3))
    geo.setAttribute('positionB', new THREE.BufferAttribute(posB, 3))
    geo.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2))
    geo.setAttribute('randomSeed', new THREE.BufferAttribute(seeds, 1))

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

  useFrame((state) => {
    if (!meshRef.current) return
    uniforms.uProgress.value = scroll.offset
    uniforms.uTime.value = state.clock.elapsedTime
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
