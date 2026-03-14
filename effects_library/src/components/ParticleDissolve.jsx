import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const PARTICLE_COUNT = 8000
const GRID_COLS = 100
const GRID_ROWS = 80

const vertexShader = /* glsl */ `
  #define PI 3.14159265359

  attribute vec3 positionA;
  attribute vec3 positionB;
  attribute float randomSeed;

  uniform float uProgress;
  uniform float uTime;
  uniform float uPointSize;

  varying float vAlpha;
  varying float vColorMix;
  varying float vRandomSeed;

  // Simple noise for curl-like displacement
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

  // Curl noise approximation
  vec2 curlNoise(vec2 p) {
    float eps = 0.01;
    float n1 = snoise(vec2(p.x, p.y + eps));
    float n2 = snoise(vec2(p.x, p.y - eps));
    float n3 = snoise(vec2(p.x + eps, p.y));
    float n4 = snoise(vec2(p.x - eps, p.y));
    return vec2((n1 - n2) / (2.0 * eps), -(n3 - n4) / (2.0 * eps));
  }

  void main() {
    // Progress phases:
    // 0 → 0.3: dissolve from positionA (scatter outward)
    // 0.3 → 0.7: drift with curl noise
    // 0.7 → 1.0: reform to positionB

    float dissolve = smoothstep(0.0, 0.35, uProgress);
    float drift = smoothstep(0.2, 0.8, uProgress);
    float reform = smoothstep(0.65, 1.0, uProgress);

    // Stagger per-particle
    float delay = randomSeed * 0.3;
    float particleDissolve = smoothstep(delay, delay + 0.35, uProgress);
    float particleReform = smoothstep(0.65 + (1.0 - randomSeed) * 0.15, 0.95, uProgress);

    // Start at positionA, end at positionB
    vec3 home = mix(positionA, positionB, particleReform);

    // Scatter direction (outward from center + random)
    vec3 scatterDir = normalize(positionA + vec3(0.001));
    scatterDir += vec3(
      sin(randomSeed * 123.4) * 0.5,
      cos(randomSeed * 456.7) * 0.5,
      sin(randomSeed * 789.0) * 0.3
    );
    float scatterDist = (0.5 + randomSeed * 1.5) * particleDissolve * (1.0 - particleReform);

    // Curl noise displacement during drift
    vec2 curl = curlNoise(home.xy * 0.8 + uTime * 0.2 + randomSeed * 10.0);
    vec3 curlOffset = vec3(curl * 0.8, snoise(home.xy * 0.5 + uTime * 0.15) * 0.3);
    float curlStrength = sin(drift * PI) * (1.0 - particleReform); // peak at middle

    vec3 pos = home + scatterDir * scatterDist + curlOffset * curlStrength;

    // Size: larger when formed, smaller when scattered
    float scattered = particleDissolve * (1.0 - particleReform);
    float size = mix(uPointSize, uPointSize * 0.3, scattered);

    // Alpha: fade slightly when very scattered
    vAlpha = mix(1.0, 0.5, scattered * 0.5);
    vColorMix = particleReform; // 0 = color A, 1 = color B
    vRandomSeed = randomSeed;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  varying float vAlpha;
  varying float vColorMix;
  varying float vRandomSeed;

  void main() {
    // Circular point shape
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.2, d) * vAlpha;

    // Color A: teal/cyan tones
    vec3 colorA = mix(
      vec3(0.0, 0.5, 0.6),
      vec3(0.1, 0.8, 0.9),
      vRandomSeed
    );

    // Color B: purple/pink tones
    vec3 colorB = mix(
      vec3(0.4, 0.1, 0.6),
      vec3(0.9, 0.2, 0.5),
      vRandomSeed
    );

    vec3 color = mix(colorA, colorB, vColorMix);

    // Slight glow at center
    float glow = smoothstep(0.4, 0.0, d) * 0.3;
    color += glow;

    gl_FragColor = vec4(color, alpha);
  }
`

export default function ParticleDissolve() {
  const pointsRef = useRef()
  const { size } = useThree()

  const { geometry, uniforms } = useMemo(() => {
    const geo = new THREE.BufferGeometry()

    const posA = new Float32Array(PARTICLE_COUNT * 3)
    const posB = new Float32Array(PARTICLE_COUNT * 3)
    const seeds = new Float32Array(PARTICLE_COUNT)
    const positions = new Float32Array(PARTICLE_COUNT * 3) // initial = positionA

    // Layout A: rectangular grid (like a content card)
    const spacingX = 6 / GRID_COLS
    const spacingY = 4 / GRID_ROWS
    const startX = -3
    const startY = -2

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const col = i % GRID_COLS
      const row = Math.floor(i / GRID_COLS) % GRID_ROWS

      // Position A: grid layout
      const ax = startX + col * spacingX + (Math.random() - 0.5) * spacingX * 0.3
      const ay = startY + row * spacingY + (Math.random() - 0.5) * spacingY * 0.3
      const az = (Math.random() - 0.5) * 0.1

      posA[i * 3] = ax
      posA[i * 3 + 1] = ay
      posA[i * 3 + 2] = az

      // Position B: circular/radial layout
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2 * 5 + Math.random() * 0.5
      const radius = 0.3 + (i / PARTICLE_COUNT) * 2.5 + Math.random() * 0.2
      const bx = Math.cos(angle) * radius
      const by = Math.sin(angle) * radius
      const bz = (Math.random() - 0.5) * 0.2

      posB[i * 3] = bx
      posB[i * 3 + 1] = by
      posB[i * 3 + 2] = bz

      // Initial position = posA
      positions[i * 3] = ax
      positions[i * 3 + 1] = ay
      positions[i * 3 + 2] = az

      seeds[i] = Math.random()
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('positionA', new THREE.BufferAttribute(posA, 3))
    geo.setAttribute('positionB', new THREE.BufferAttribute(posB, 3))
    geo.setAttribute('randomSeed', new THREE.BufferAttribute(seeds, 1))

    const u = {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uPointSize: { value: 3.0 },
    }

    return { geometry: geo, uniforms: u }
  }, [])

  useFrame(({ clock }) => {
    const mat = pointsRef.current?.material
    if (!mat) return

    const t = clock.getElapsedTime()
    mat.uniforms.uTime.value = t

    // Auto-cycle: 10 second loop
    const cycle = (t * 0.1) % 1.0
    mat.uniforms.uProgress.value = cycle

    // Responsive point size
    mat.uniforms.uPointSize.value = Math.min(size.width, size.height) > 600 ? 3.0 : 2.0
  })

  return (
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
  )
}
