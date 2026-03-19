import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useScroll, ScrollControls } from '@react-three/drei'
import * as THREE from 'three'

/**
 * Depth Zoom — Scroll-driven dolly zoom effect on a flat image.
 * As you scroll, the camera "pushes into" the depth map: foreground
 * elements grow/approach while the background recedes. Uses a
 * canvas-generated nightscape with a matching depth map.
 */

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform float uProgress;
uniform sampler2D uColorTexture;
uniform sampler2D uDepthTexture;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  float depth = texture2D(uDepthTexture, uv).r;

  // Zoom: scale UV toward center, MORE for near objects (depth=1)
  float zoomAmount = uProgress * 0.4;
  vec2 center = vec2(0.5);

  float depthZoom = zoomAmount * depth;
  vec2 zoomedUV = mix(uv, center, depthZoom);

  // Sample color at zoomed UV
  vec3 color = texture2D(uColorTexture, zoomedUV).rgb;

  // Approximate blur on far elements at high zoom via neighbor sampling
  float blurAmount = uProgress * (1.0 - depth) * 0.003;
  vec3 blurred = color;

  if (blurAmount > 0.0005) {
    blurred += texture2D(uColorTexture, zoomedUV + vec2(blurAmount, 0.0)).rgb;
    blurred += texture2D(uColorTexture, zoomedUV - vec2(blurAmount, 0.0)).rgb;
    blurred += texture2D(uColorTexture, zoomedUV + vec2(0.0, blurAmount)).rgb;
    blurred += texture2D(uColorTexture, zoomedUV - vec2(0.0, blurAmount)).rgb;
    blurred /= 5.0;
  }

  gl_FragColor = vec4(blurred, 1.0);
}
`

// --- Canvas texture generation ---

function drawPineTree(ctx, x, groundY, width, height) {
  // Three stacked triangles for a pine silhouette
  const layers = 3
  for (let i = 0; i < layers; i++) {
    const layerY = groundY - height * (i / layers)
    const layerW = width * (1.0 - i * 0.2)
    const layerH = height * 0.45
    ctx.beginPath()
    ctx.moveTo(x - layerW, layerY)
    ctx.lineTo(x, layerY - layerH)
    ctx.lineTo(x + layerW, layerY)
    ctx.closePath()
    ctx.fill()
  }
  // Trunk
  ctx.fillRect(x - width * 0.15, groundY, width * 0.3, height * 0.15)
}

function drawPineTreeDepth(ctx, x, groundY, width, height, shade) {
  ctx.fillStyle = shade
  drawPineTree(ctx, x, groundY, width, height)
}

function createColorImage() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  // Night sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 512)
  skyGrad.addColorStop(0, '#0a0a2a')
  skyGrad.addColorStop(0.5, '#12103a')
  skyGrad.addColorStop(1, '#1a1040')
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, 512, 512)

  // Stars — scattered white dots in the upper portion
  ctx.fillStyle = '#ffffff'
  const starPositions = [
    [45, 30], [120, 55], [200, 20], [280, 70], [350, 35],
    [420, 50], [480, 25], [70, 100], [160, 130], [310, 110],
    [440, 95], [90, 170], [250, 150], [380, 165], [30, 80],
    [210, 90], [470, 140], [140, 40], [330, 45], [400, 120],
    [60, 145], [180, 170], [290, 15], [360, 85], [500, 65],
    [15, 55], [230, 115], [410, 30], [105, 10], [340, 140],
    [460, 170], [85, 60], [195, 45], [270, 130], [390, 100],
    [150, 85], [320, 60], [445, 155], [55, 120], [245, 45],
    [375, 20], [495, 100], [25, 160], [170, 110], [300, 75],
    [430, 60], [110, 135], [220, 165], [365, 50], [490, 130],
  ]
  for (const [sx, sy] of starPositions) {
    const r = 0.5 + Math.random() * 1.2
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Moon — pale yellow circle, top-right area
  const moonGrad = ctx.createRadialGradient(400, 60, 0, 400, 60, 30)
  moonGrad.addColorStop(0, '#fffde0')
  moonGrad.addColorStop(0.7, '#f5e6a0')
  moonGrad.addColorStop(1, '#d4c070')
  ctx.fillStyle = moonGrad
  ctx.beginPath()
  ctx.arc(400, 60, 25, 0, Math.PI * 2)
  ctx.fill()

  // Moon glow
  const glowGrad = ctx.createRadialGradient(400, 60, 20, 400, 60, 80)
  glowGrad.addColorStop(0, 'rgba(255, 250, 200, 0.15)')
  glowGrad.addColorStop(1, 'rgba(255, 250, 200, 0.0)')
  ctx.fillStyle = glowGrad
  ctx.beginPath()
  ctx.arc(400, 60, 80, 0, Math.PI * 2)
  ctx.fill()

  // Mountain range — jagged silhouette across the middle
  ctx.fillStyle = '#2a1a40'
  ctx.beginPath()
  ctx.moveTo(0, 320)
  ctx.lineTo(40, 260)
  ctx.lineTo(90, 290)
  ctx.lineTo(140, 230)
  ctx.lineTo(180, 270)
  ctx.lineTo(230, 210)
  ctx.lineTo(280, 250)
  ctx.lineTo(320, 220)
  ctx.lineTo(370, 260)
  ctx.lineTo(410, 200)
  ctx.lineTo(450, 240)
  ctx.lineTo(490, 210)
  ctx.lineTo(512, 250)
  ctx.lineTo(512, 512)
  ctx.lineTo(0, 512)
  ctx.closePath()
  ctx.fill()

  // Second mountain layer (closer, darker)
  ctx.fillStyle = '#1e1030'
  ctx.beginPath()
  ctx.moveTo(0, 350)
  ctx.lineTo(60, 300)
  ctx.lineTo(120, 330)
  ctx.lineTo(190, 280)
  ctx.lineTo(250, 320)
  ctx.lineTo(300, 290)
  ctx.lineTo(360, 330)
  ctx.lineTo(420, 300)
  ctx.lineTo(480, 330)
  ctx.lineTo(512, 310)
  ctx.lineTo(512, 512)
  ctx.lineTo(0, 512)
  ctx.closePath()
  ctx.fill()

  // Ground
  ctx.fillStyle = '#0a0a15'
  ctx.fillRect(0, 420, 512, 92)

  // Pine tree silhouettes in foreground
  ctx.fillStyle = '#0a0a15'
  drawPineTree(ctx, 60, 400, 22, 100)
  drawPineTree(ctx, 150, 410, 18, 80)
  drawPineTree(ctx, 240, 395, 25, 110)
  drawPineTree(ctx, 340, 405, 20, 90)
  drawPineTree(ctx, 430, 400, 24, 105)
  drawPineTree(ctx, 500, 410, 16, 75)
  drawPineTree(ctx, 20, 415, 14, 65)

  return new THREE.CanvasTexture(canvas)
}

function createDepthMap() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  // Sky — black (far, depth=0)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 512, 512)

  // Moon — also far
  // (stays black, no need to draw)

  // Far mountain range — medium gray
  ctx.fillStyle = '#555555'
  ctx.beginPath()
  ctx.moveTo(0, 320)
  ctx.lineTo(40, 260)
  ctx.lineTo(90, 290)
  ctx.lineTo(140, 230)
  ctx.lineTo(180, 270)
  ctx.lineTo(230, 210)
  ctx.lineTo(280, 250)
  ctx.lineTo(320, 220)
  ctx.lineTo(370, 260)
  ctx.lineTo(410, 200)
  ctx.lineTo(450, 240)
  ctx.lineTo(490, 210)
  ctx.lineTo(512, 250)
  ctx.lineTo(512, 512)
  ctx.lineTo(0, 512)
  ctx.closePath()
  ctx.fill()

  // Near mountain layer — brighter gray
  ctx.fillStyle = '#777777'
  ctx.beginPath()
  ctx.moveTo(0, 350)
  ctx.lineTo(60, 300)
  ctx.lineTo(120, 330)
  ctx.lineTo(190, 280)
  ctx.lineTo(250, 320)
  ctx.lineTo(300, 290)
  ctx.lineTo(360, 330)
  ctx.lineTo(420, 300)
  ctx.lineTo(480, 330)
  ctx.lineTo(512, 310)
  ctx.lineTo(512, 512)
  ctx.lineTo(0, 512)
  ctx.closePath()
  ctx.fill()

  // Ground — white (nearest, depth=1)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 420, 512, 92)

  // Pine trees — white (nearest, depth=1)
  drawPineTreeDepth(ctx, 60, 400, 22, 100, '#ffffff')
  drawPineTreeDepth(ctx, 150, 410, 18, 80, '#ffffff')
  drawPineTreeDepth(ctx, 240, 395, 25, 110, '#ffffff')
  drawPineTreeDepth(ctx, 340, 405, 20, 90, '#ffffff')
  drawPineTreeDepth(ctx, 430, 400, 24, 105, '#ffffff')
  drawPineTreeDepth(ctx, 500, 410, 16, 75, '#ffffff')
  drawPineTreeDepth(ctx, 20, 415, 14, 65, '#ffffff')

  return new THREE.CanvasTexture(canvas)
}

function createTextures() {
  const colorTex = createColorImage()
  const depthTex = createDepthMap()
  return { colorTex, depthTex }
}

// --- Scene component (inside ScrollControls) ---

function DepthZoomScene() {
  const meshRef = useRef()
  const scroll = useScroll()

  const { colorTex, depthTex } = useMemo(() => createTextures(), [])

  const uniforms = useMemo(
    () => ({
      uProgress: { value: 0 },
      uColorTexture: { value: colorTex },
      uDepthTexture: { value: depthTex },
    }),
    []
  )

  useFrame(() => {
    uniforms.uProgress.value = scroll.offset
  })

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[6, 6]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  )
}

// --- Main export ---

export default function DepthZoom() {
  return (
    <>
      <color attach="background" args={['#0a0a0a']} />
      <ScrollControls pages={3} damping={0.15}>
        <DepthZoomScene />
      </ScrollControls>
    </>
  )
}
