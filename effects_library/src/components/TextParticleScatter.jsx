import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ScrollControls, useScroll } from '@react-three/drei'

const CANVAS_WIDTH = 1024
const CANVAS_HEIGHT = 256
const WORLD_WIDTH = 8
const WORLD_HEIGHT = 2
const PARTICLE_COUNT = 6000
const POINT_SIZE = 3.0

// JS smoothstep for camera follow
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function sampleTextPositions(text, canvasWidth, canvasHeight, worldWidth, worldHeight, maxParticles) {
  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${Math.floor(canvasHeight * 0.7)}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvasWidth / 2, canvasHeight / 2)

  const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight)
  const positions = []

  for (let y = 0; y < canvasHeight; y++) {
    for (let x = 0; x < canvasWidth; x++) {
      const i = (y * canvasWidth + x) * 4
      if (imageData.data[i] > 128) {
        positions.push({
          x: (x / canvasWidth - 0.5) * worldWidth,
          y: (0.5 - y / canvasHeight) * worldHeight,
          // Store pixel coords for color sampling
          px: x,
          py: y,
        })
      }
    }
  }

  // Randomly sample down to maxParticles
  const shuffled = positions.sort(() => Math.random() - 0.5)
  return shuffled.slice(0, maxParticles)
}

function sampleTextColors(text, canvasWidth, canvasHeight) {
  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  const ctx = canvas.getContext('2d')

  // Dark background
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  // Gradient fill for the text to make it visually interesting
  const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight)
  gradient.addColorStop(0, '#00d4ff')
  gradient.addColorStop(0.5, '#7b2fff')
  gradient.addColorStop(1, '#ff2d95')
  ctx.fillStyle = gradient
  ctx.font = `bold ${Math.floor(canvasHeight * 0.7)}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvasWidth / 2, canvasHeight / 2)

  return ctx.getImageData(0, 0, canvasWidth, canvasHeight)
}

const vertexShader = /* glsl */ `
  #define PI 3.14159265359

  attribute vec3 positionA;
  attribute vec3 positionB;
  attribute float randomSeed;
  attribute float swarmSide;
  attribute vec3 aColor;

  uniform float uProgress;
  uniform float uTime;
  uniform float uPointSize;

  varying float vAlpha;
  varying vec3 vColor;
  varying float vScattered;

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
    // Per-particle stagger
    float delay = randomSeed * 0.2;

    // Phase 1: scatter from text A (0.0 - 0.25)
    float scatter = smoothstep(delay, delay + 0.25, uProgress);

    // Phase 3: reform into text B (0.75 - 1.0)
    float reformStart = 0.75 + (1.0 - randomSeed) * 0.15;
    float reform = smoothstep(reformStart, 0.97, uProgress);

    // Net displacement: how scattered is this particle right now
    float displacement = scatter * (1.0 - reform);

    // Home position: blend from A to B as reform progresses
    vec3 home = mix(positionA, positionB, reform);

    // --- Swarm movement ---
    vec3 offset = vec3(0.0);

    // 1. Initial burst: scatter laterally based on swarm side
    float burstPhase = smoothstep(0.0, 0.3, scatter);
    vec3 burstDir = vec3(
      swarmSide * (1.0 + randomSeed * 0.6),
      sin(randomSeed * 123.4) * 0.4,
      sin(randomSeed * 789.0) * 0.3
    );
    vec3 burstOffset = burstDir * burstPhase * 2.5;

    // 2. Swarm drift: arc outward then downward
    float driftPhase = smoothstep(0.15, 0.75, uProgress) * (1.0 - smoothstep(0.65, 0.92, uProgress));

    // Swarm center arcs outward then down
    float swarmX = swarmSide * 3.0 * sin(driftPhase * PI * 0.5);
    float swarmY = -driftPhase * 4.0;
    vec3 swarmCenter = vec3(swarmX, swarmY, 0.0);

    // Per-particle firefly jitter
    float timeOff = randomSeed * 50.0;
    vec3 jitter = vec3(
      sin(uTime * 1.8 + timeOff) * 0.35 + sin(uTime * 3.1 + timeOff * 1.3) * 0.15,
      sin(uTime * 2.2 + timeOff * 0.7) * 0.25 + cos(uTime * 1.4 + timeOff) * 0.1,
      sin(uTime * 1.5 + timeOff * 1.1) * 0.2
    ) * (0.6 + randomSeed * 0.5);

    // Curl noise for organic movement
    vec2 curl = curlNoise(positionA.xy * 0.5 + uTime * 0.15 + randomSeed * 10.0);
    vec3 curlOffset = vec3(curl * 0.5, snoise(positionA.xy * 0.3 + uTime * 0.1) * 0.2);

    vec3 swarmOffset = swarmCenter + jitter + curlOffset;

    // Blend from burst to swarm drift
    float burstToSwarm = smoothstep(0.12, 0.35, uProgress);
    offset = mix(burstOffset, swarmOffset, burstToSwarm) * displacement;

    vec3 pos = home + offset;

    // Point size: larger when formed, smaller when scattered
    float size = mix(uPointSize, uPointSize * 0.5, displacement);

    // Varyings
    vColor = aColor;
    vAlpha = mix(1.0, 0.6, displacement * 0.5);
    vScattered = displacement;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  #define PI 3.14159265359
  precision highp float;

  varying float vAlpha;
  varying vec3 vColor;
  varying float vScattered;

  void main() {
    // Circular point shape
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;

    float alpha = smoothstep(0.5, 0.2, d) * vAlpha;

    // Color with slight glow at center
    vec3 color = vColor;
    float glow = smoothstep(0.4, 0.0, d) * 0.3;
    color += glow;

    gl_FragColor = vec4(color, alpha);
  }
`

function TextScatterScene() {
  const pointsRef = useRef()
  const scroll = useScroll()
  const { camera } = useThree()
  const initialCamY = useRef(null)

  const { geometry, uniforms } = useMemo(() => {
    // Sample positions from both texts
    const positionsA = sampleTextPositions('BECKHAM', CANVAS_WIDTH, CANVAS_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, PARTICLE_COUNT)
    const positionsB = sampleTextPositions('CREATES', CANVAS_WIDTH, CANVAS_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, PARTICLE_COUNT)

    // Sample colors from text A
    const colorData = sampleTextColors('BECKHAM', CANVAS_WIDTH, CANVAS_HEIGHT)

    // Ensure both have the same count by padding/truncating
    const count = PARTICLE_COUNT
    while (positionsA.length < count) {
      positionsA.push({
        x: (Math.random() - 0.5) * WORLD_WIDTH * 0.8,
        y: (Math.random() - 0.5) * WORLD_HEIGHT * 0.5,
        px: Math.floor(Math.random() * CANVAS_WIDTH),
        py: Math.floor(Math.random() * CANVAS_HEIGHT),
      })
    }
    while (positionsB.length < count) {
      positionsB.push({
        x: (Math.random() - 0.5) * WORLD_WIDTH * 0.8,
        y: (Math.random() - 0.5) * WORLD_HEIGHT * 0.5,
        px: Math.floor(Math.random() * CANVAS_WIDTH),
        py: Math.floor(Math.random() * CANVAS_HEIGHT),
      })
    }

    const posA = new Float32Array(count * 3)
    const posB = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    const sides = new Float32Array(count)
    const colors = new Float32Array(count * 3)
    const positions = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const pa = positionsA[i]
      const pb = positionsB[i]

      posA[i * 3] = pa.x
      posA[i * 3 + 1] = pa.y
      posA[i * 3 + 2] = (Math.random() - 0.5) * 0.05

      posB[i * 3] = pb.x
      posB[i * 3 + 1] = pb.y
      posB[i * 3 + 2] = (Math.random() - 0.5) * 0.05

      // Initial position = posA
      positions[i * 3] = posA[i * 3]
      positions[i * 3 + 1] = posA[i * 3 + 1]
      positions[i * 3 + 2] = posA[i * 3 + 2]

      seeds[i] = Math.random()

      // Swarm side based on x position
      sides[i] = pa.x > 0 ? 1.0 : -1.0

      // Sample color from the color canvas
      const px = Math.min(pa.px, CANVAS_WIDTH - 1)
      const py = Math.min(pa.py, CANVAS_HEIGHT - 1)
      const ci = (py * CANVAS_WIDTH + px) * 4
      colors[i * 3] = colorData.data[ci] / 255
      colors[i * 3 + 1] = colorData.data[ci + 1] / 255
      colors[i * 3 + 2] = colorData.data[ci + 2] / 255

      // If color is black (padding particle), give it a random nice color
      if (colors[i * 3] < 0.05 && colors[i * 3 + 1] < 0.05 && colors[i * 3 + 2] < 0.05) {
        const hue = Math.random()
        // Simple HSL to RGB for vivid colors
        const h = hue * 6
        const x = 1 - Math.abs(h % 2 - 1)
        if (h < 1) { colors[i * 3] = 1; colors[i * 3 + 1] = x; colors[i * 3 + 2] = 0 }
        else if (h < 2) { colors[i * 3] = x; colors[i * 3 + 1] = 1; colors[i * 3 + 2] = 0 }
        else if (h < 3) { colors[i * 3] = 0; colors[i * 3 + 1] = 1; colors[i * 3 + 2] = x }
        else if (h < 4) { colors[i * 3] = 0; colors[i * 3 + 1] = x; colors[i * 3 + 2] = 1 }
        else if (h < 5) { colors[i * 3] = x; colors[i * 3 + 1] = 0; colors[i * 3 + 2] = 1 }
        else { colors[i * 3] = 1; colors[i * 3 + 1] = 0; colors[i * 3 + 2] = x }
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('positionA', new THREE.BufferAttribute(posA, 3))
    geo.setAttribute('positionB', new THREE.BufferAttribute(posB, 3))
    geo.setAttribute('randomSeed', new THREE.BufferAttribute(seeds, 1))
    geo.setAttribute('swarmSide', new THREE.BufferAttribute(sides, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))

    const u = {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uPointSize: { value: POINT_SIZE },
    }

    return { geometry: geo, uniforms: u }
  }, [])

  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  useFrame(({ clock }) => {
    if (!pointsRef.current) return

    if (initialCamY.current === null) {
      initialCamY.current = camera.position.y
    }

    const progress = THREE.MathUtils.clamp(scroll.offset, 0, 1)
    uniforms.uProgress.value = progress
    uniforms.uTime.value = clock.getElapsedTime()

    // Camera follows swarm downward during drift, returns during reform
    const followIn = smoothstep(0.15, 0.4, progress)
    const followOut = smoothstep(0.65, 0.95, progress)
    const cameraOffset = followIn * (1.0 - followOut) * 4.0
    camera.position.y = initialCamY.current - cameraOffset
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

export default function TextParticleScatter() {
  return (
    <>
      <color attach="background" args={['#0a0a0a']} />
      <ScrollControls pages={3} damping={0.15}>
        <TextScatterScene />
      </ScrollControls>
    </>
  )
}
