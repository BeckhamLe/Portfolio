import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Focus Pull — Depth-of-field effect driven by mouse Y position.
 * A procedurally generated urban park scene with a matching depth map.
 * Moving the mouse up focuses on far objects (buildings/sky),
 * moving down focuses on near objects (flowers/foreground).
 * Uses disc blur sampling in the fragment shader.
 */

function createColorTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, size * 0.4)
  skyGrad.addColorStop(0, '#b0c4de')
  skyGrad.addColorStop(1, '#d0dae8')
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, size, size * 0.4)

  // Buildings silhouettes (background)
  const buildingColors = ['#5a6272', '#4e5565', '#636d7e', '#6b7385']
  const buildings = [
    { x: 20, w: 60, h: 120 },
    { x: 90, w: 45, h: 160 },
    { x: 150, w: 70, h: 100 },
    { x: 230, w: 55, h: 140 },
    { x: 295, w: 80, h: 110 },
    { x: 380, w: 50, h: 170 },
    { x: 435, w: 65, h: 130 },
  ]
  buildings.forEach((b, i) => {
    ctx.fillStyle = buildingColors[i % buildingColors.length]
    const top = size * 0.4 - b.h
    ctx.fillRect(b.x, top, b.w, b.h)
    // Windows
    ctx.fillStyle = 'rgba(255, 255, 200, 0.3)'
    for (let wy = top + 10; wy < size * 0.4 - 10; wy += 18) {
      for (let wx = b.x + 8; wx < b.x + b.w - 8; wx += 14) {
        ctx.fillRect(wx, wy, 6, 8)
      }
    }
  })

  // Grass (lower portion)
  const grassGrad = ctx.createLinearGradient(0, size * 0.4, 0, size)
  grassGrad.addColorStop(0, '#4a7c3f')
  grassGrad.addColorStop(0.5, '#3d6b34')
  grassGrad.addColorStop(1, '#2d5a26')
  ctx.fillStyle = grassGrad
  ctx.fillRect(0, size * 0.4, size, size * 0.6)

  // Path (curved lighter strip)
  ctx.strokeStyle = '#8b7d6b'
  ctx.lineWidth = 28
  ctx.beginPath()
  ctx.moveTo(0, size * 0.6)
  ctx.quadraticCurveTo(size * 0.3, size * 0.55, size * 0.5, size * 0.58)
  ctx.quadraticCurveTo(size * 0.7, size * 0.61, size, size * 0.56)
  ctx.stroke()

  // Park bench (midground)
  // Seat
  ctx.fillStyle = '#6b4226'
  ctx.fillRect(190, size * 0.5 - 8, 130, 12)
  // Legs
  ctx.fillStyle = '#3e2b1a'
  ctx.fillRect(200, size * 0.5 + 4, 6, 22)
  ctx.fillRect(310, size * 0.5 + 4, 6, 22)
  // Back rest
  ctx.fillStyle = '#7a4e30'
  ctx.fillRect(190, size * 0.5 - 30, 130, 6)
  ctx.fillRect(190, size * 0.5 - 20, 130, 6)
  // Back supports
  ctx.fillStyle = '#3e2b1a'
  ctx.fillRect(195, size * 0.5 - 32, 5, 40)
  ctx.fillRect(315, size * 0.5 - 32, 5, 40)

  // Foreground flowers
  const flowers = [
    { x: 60, y: size * 0.82, r: 10, color: '#e63946' },
    { x: 120, y: size * 0.88, r: 12, color: '#f4a261' },
    { x: 180, y: size * 0.85, r: 9, color: '#e76f51' },
    { x: 310, y: size * 0.83, r: 11, color: '#f72585' },
    { x: 390, y: size * 0.87, r: 10, color: '#ffd166' },
    { x: 440, y: size * 0.84, r: 13, color: '#e63946' },
    { x: 70, y: size * 0.92, r: 8, color: '#ffd166' },
    { x: 350, y: size * 0.91, r: 9, color: '#f72585' },
  ]
  flowers.forEach((f) => {
    // Stem
    ctx.strokeStyle = '#2d5a26'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(f.x, f.y + f.r)
    ctx.lineTo(f.x, f.y + f.r + 16)
    ctx.stroke()
    // Petals
    ctx.fillStyle = f.color
    for (let a = 0; a < 6; a++) {
      const angle = (a / 6) * Math.PI * 2
      const px = f.x + Math.cos(angle) * f.r * 0.6
      const py = f.y + Math.sin(angle) * f.r * 0.6
      ctx.beginPath()
      ctx.arc(px, py, f.r * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    // Center
    ctx.fillStyle = '#ffd166'
    ctx.beginPath()
    ctx.arc(f.x, f.y, f.r * 0.3, 0, Math.PI * 2)
    ctx.fill()
  })

  // Foreground grass tufts
  ctx.strokeStyle = '#1e4d1a'
  ctx.lineWidth = 2
  for (let i = 0; i < 30; i++) {
    const bx = Math.random() * size
    const by = size * 0.78 + Math.random() * size * 0.22
    for (let j = -2; j <= 2; j++) {
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(bx + j * 4, by - 10 - Math.random() * 8)
      ctx.stroke()
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

function createDepthTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  // Sky — far (black)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size * 0.35)

  // Buildings — far (dark gray)
  ctx.fillStyle = '#222222'
  // Cover the building region
  ctx.fillRect(0, size * 0.15, size, size * 0.25)

  // Sky remains black on top
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size * 0.15)

  // Transition from far to mid
  const midGrad = ctx.createLinearGradient(0, size * 0.35, 0, size * 0.5)
  midGrad.addColorStop(0, '#333333')
  midGrad.addColorStop(1, '#666666')
  ctx.fillStyle = midGrad
  ctx.fillRect(0, size * 0.35, size, size * 0.15)

  // Midground — bench area (medium gray)
  ctx.fillStyle = '#777777'
  ctx.fillRect(0, size * 0.5, size, size * 0.15)

  // Bench itself slightly closer
  ctx.fillStyle = '#888888'
  ctx.fillRect(180, size * 0.46, 155, size * 0.1)

  // Transition to foreground
  const fgGrad = ctx.createLinearGradient(0, size * 0.65, 0, size * 0.78)
  fgGrad.addColorStop(0, '#888888')
  fgGrad.addColorStop(1, '#cccccc')
  ctx.fillStyle = fgGrad
  ctx.fillRect(0, size * 0.65, size, size * 0.13)

  // Foreground — near (white)
  const nearGrad = ctx.createLinearGradient(0, size * 0.78, 0, size)
  nearGrad.addColorStop(0, '#cccccc')
  nearGrad.addColorStop(1, '#ffffff')
  ctx.fillStyle = nearGrad
  ctx.fillRect(0, size * 0.78, size, size * 0.22)

  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform sampler2D uColorTexture;
uniform sampler2D uDepthTexture;
uniform float uFocalDepth;
uniform float uBlurStrength;
uniform vec2 uResolution;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  float depth = texture2D(uDepthTexture, uv).r;

  // Blur amount = distance from focal plane
  float blur = abs(depth - uFocalDepth) * uBlurStrength;

  vec2 texelSize = 1.0 / uResolution;

  vec3 color = vec3(0.0);
  float totalWeight = 0.0;

  // 12-tap disc blur sampling
  for (int i = 0; i < 12; i++) {
    float angle = float(i) * 6.28318 / 12.0;
    vec2 offset = vec2(cos(angle), sin(angle)) * blur;

    // Correct for aspect ratio
    offset *= texelSize * uResolution;

    // Weight: center-biased
    float weight = 1.0 - float(i) / 24.0;

    color += texture2D(uColorTexture, uv + offset).rgb * weight;
    totalWeight += weight;
  }

  // Center sample with higher weight
  color += texture2D(uColorTexture, uv).rgb * 1.5;
  totalWeight += 1.5;

  color /= totalWeight;

  // Subtle vignette
  float vignette = 1.0 - length(uv - 0.5) * 0.4;
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`

export default function FocusPull() {
  const meshRef = useRef()
  const mouseSmooth = useRef(0.5)

  const { colorTex, depthTex } = useMemo(() => ({
    colorTex: createColorTexture(),
    depthTex: createDepthTexture(),
  }), [])

  const uniforms = useMemo(() => ({
    uColorTexture: { value: colorTex },
    uDepthTexture: { value: depthTex },
    uFocalDepth: { value: 0.5 },
    uBlurStrength: { value: 0.012 },
    uResolution: { value: new THREE.Vector2(512, 512) },
  }), [colorTex, depthTex])

  useFrame(({ pointer }) => {
    // Mouse Y: -1 (bottom) to 1 (top)
    // Map: up = focus far (0), down = focus near (1)
    const target = (1.0 - (pointer.y + 1.0) / 2.0)
    mouseSmooth.current += (target - mouseSmooth.current) * 0.05
    uniforms.uFocalDepth.value = mouseSmooth.current
  })

  return (
    <>
      <color attach="background" args={['#0a0a0a']} />
      <mesh ref={meshRef}>
        <planeGeometry args={[5, 5]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
        />
      </mesh>
    </>
  )
}
