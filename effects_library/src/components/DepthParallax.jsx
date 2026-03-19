import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Depth Parallax — Flat image + depth map, mouse movement shifts layers
 * at different speeds creating a fake 3D "2.5D photo" effect.
 * Good for project screenshots.
 */

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
uniform vec2 uMouse;
uniform float uStrength;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;

  // Sample depth (0=far, 1=near)
  float depth = texture2D(uDepthTexture, uv).r;

  // Offset UV based on mouse position and depth
  // Near objects (depth=1) move MORE opposite to mouse
  // Far objects (depth=0) move LESS
  vec2 offset = uMouse * depth * uStrength;

  // Sample color at offset UV
  vec3 color = texture2D(uColorTexture, uv + offset).rgb;

  gl_FragColor = vec4(color, 1.0);
}
`

function drawTree(ctx, x, groundY, width, height) {
  // Trunk
  ctx.fillStyle = '#3a2510'
  ctx.fillRect(x - width * 0.15, groundY - height * 0.4, width * 0.3, height * 0.4)
  // Canopy (triangle)
  ctx.fillStyle = '#0a3a08'
  ctx.beginPath()
  ctx.moveTo(x - width, groundY - height * 0.3)
  ctx.lineTo(x, groundY - height)
  ctx.lineTo(x + width, groundY - height * 0.3)
  ctx.fill()
}

function drawTreeDepth(ctx, x, groundY, width, height, shade) {
  // Trunk
  ctx.fillStyle = shade
  ctx.fillRect(x - width * 0.15, groundY - height * 0.4, width * 0.3, height * 0.4)
  // Canopy (triangle)
  ctx.fillStyle = shade
  ctx.beginPath()
  ctx.moveTo(x - width, groundY - height * 0.3)
  ctx.lineTo(x, groundY - height)
  ctx.lineTo(x + width, groundY - height * 0.3)
  ctx.fill()
}

function createColorImage() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  // Sky gradient background
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 300)
  skyGrad.addColorStop(0, '#87CEEB')
  skyGrad.addColorStop(1, '#4A90D9')
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, 512, 512)

  // Mountains/hills (midground)
  ctx.fillStyle = '#2d5a27'
  ctx.beginPath()
  ctx.moveTo(0, 350)
  ctx.quadraticCurveTo(128, 250, 256, 300)
  ctx.quadraticCurveTo(384, 230, 512, 310)
  ctx.lineTo(512, 512)
  ctx.lineTo(0, 512)
  ctx.fill()

  // Second hill layer
  ctx.fillStyle = '#1a4a1a'
  ctx.beginPath()
  ctx.moveTo(0, 400)
  ctx.quadraticCurveTo(200, 340, 350, 380)
  ctx.quadraticCurveTo(450, 350, 512, 370)
  ctx.lineTo(512, 512)
  ctx.lineTo(0, 512)
  ctx.fill()

  // Foreground trees
  drawTree(ctx, 80, 280, 30, 120)
  drawTree(ctx, 400, 300, 25, 100)
  drawTree(ctx, 200, 310, 20, 90)

  // Ground
  ctx.fillStyle = '#1a3a12'
  ctx.fillRect(0, 430, 512, 82)

  return new THREE.CanvasTexture(canvas)
}

function createDepthMap() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  // Sky — black (far away, depth=0)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 512, 512)

  // Far hills — dark gray
  ctx.fillStyle = '#555555'
  ctx.beginPath()
  ctx.moveTo(0, 350)
  ctx.quadraticCurveTo(128, 250, 256, 300)
  ctx.quadraticCurveTo(384, 230, 512, 310)
  ctx.lineTo(512, 512)
  ctx.lineTo(0, 512)
  ctx.fill()

  // Near hills — medium gray
  ctx.fillStyle = '#888888'
  ctx.beginPath()
  ctx.moveTo(0, 400)
  ctx.quadraticCurveTo(200, 340, 350, 380)
  ctx.quadraticCurveTo(450, 350, 512, 370)
  ctx.lineTo(512, 512)
  ctx.lineTo(0, 512)
  ctx.fill()

  // Foreground trees — bright (near, depth≈1)
  drawTreeDepth(ctx, 80, 280, 30, 120, '#dddddd')
  drawTreeDepth(ctx, 400, 300, 25, 100, '#dddddd')
  drawTreeDepth(ctx, 200, 310, 20, 90, '#dddddd')

  // Ground — white (closest, depth=1)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 430, 512, 82)

  return new THREE.CanvasTexture(canvas)
}

function createTextures() {
  const colorTex = createColorImage()
  const depthTex = createDepthMap()
  return { colorTex, depthTex }
}

export default function DepthParallax() {
  const meshRef = useRef()
  const mouseTarget = useRef(new THREE.Vector2())
  const mouseSmooth = useRef(new THREE.Vector2())

  const { colorTex, depthTex } = useMemo(() => createTextures(), [])

  const uniforms = useMemo(
    () => ({
      uColorTexture: { value: colorTex },
      uDepthTexture: { value: depthTex },
      uMouse: { value: new THREE.Vector2() },
      uStrength: { value: 0.03 },
    }),
    []
  )

  useFrame(({ pointer }) => {
    mouseTarget.current.set(pointer.x, pointer.y)
    mouseSmooth.current.lerp(mouseTarget.current, 0.05)
    uniforms.uMouse.value.copy(mouseSmooth.current)
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
