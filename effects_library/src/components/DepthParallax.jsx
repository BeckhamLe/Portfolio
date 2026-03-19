import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uColorTexture;
  uniform sampler2D uDepthTexture;
  uniform vec2 uMouse;
  uniform float uStrength;

  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;

    // Sample depth (0=far, 1=near)
    float depth = texture2D(uDepthTexture, uv).r;

    // Offset UV based on mouse and depth — near moves more
    vec2 offset = uMouse * depth * uStrength;

    // Clamp to avoid sampling outside texture
    vec2 sampledUV = clamp(uv + offset, 0.0, 1.0);

    vec3 color = texture2D(uColorTexture, sampledUV).rgb;

    // Subtle vignette
    float vignette = 1.0 - length(uv - 0.5) * 0.3;
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`

// Generate a depth map from the dark slide image
// The dark slide has: geometric shapes (foreground), title text (midground), dark bg (far)
function createDepthMapFromImage(image) {
  const canvas = document.createElement('canvas')
  const w = image.width
  const h = image.height
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  // Draw the source image to read pixel data
  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, w, h)
  const pixels = imageData.data

  // Create depth map based on brightness + position heuristics
  // Brighter/more saturated elements = foreground (geometric shapes, text)
  // Dark background = far
  const depthCanvas = document.createElement('canvas')
  depthCanvas.width = w
  depthCanvas.height = h
  const depthCtx = depthCanvas.getContext('2d')
  const depthData = depthCtx.createImageData(w, h)

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]

    // Brightness
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255

    // Saturation (how colorful — geometric shapes are colored)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const saturation = max === 0 ? 0 : (max - min) / max

    // Combine: bright or saturated = near, dark and unsaturated = far
    // Text is bright white → high depth
    // Geometric shapes are colored (saturated) → high depth
    // Dark background → low depth
    let depth = brightness * 0.6 + saturation * 0.4

    // Boost contrast
    depth = Math.pow(depth, 0.7)

    // Slight edge bias: elements near edges are slightly more foreground
    // (the geometric shapes in the dark slide are at corners)
    const px = (i / 4) % w
    const py = Math.floor((i / 4) / w)
    const edgeX = Math.abs(px / w - 0.5) * 2 // 0 at center, 1 at edge
    const edgeY = Math.abs(py / h - 0.5) * 2
    const edgeFactor = Math.max(edgeX, edgeY)

    // Boost depth for bright elements near edges (the geometric decorations)
    if (depth > 0.3 && edgeFactor > 0.4) {
      depth = Math.min(1, depth * 1.3)
    }

    const d = Math.floor(Math.min(1, Math.max(0, depth)) * 255)
    depthData.data[i] = d
    depthData.data[i + 1] = d
    depthData.data[i + 2] = d
    depthData.data[i + 3] = 255
  }

  depthCtx.putImageData(depthData, 0, 0)

  // Apply a blur pass for smoother depth transitions
  // Use canvas filter for quick gaussian blur
  const blurCanvas = document.createElement('canvas')
  blurCanvas.width = w
  blurCanvas.height = h
  const blurCtx = blurCanvas.getContext('2d')
  blurCtx.filter = 'blur(8px)'
  blurCtx.drawImage(depthCanvas, 0, 0)

  const texture = new THREE.CanvasTexture(blurCanvas)
  texture.needsUpdate = true
  return texture
}

export default function DepthParallax() {
  const meshRef = useRef()
  const mouseTarget = useRef(new THREE.Vector2())
  const mouseSmooth = useRef(new THREE.Vector2())
  const [textures, setTextures] = useState(null)

  // Load the real screenshot
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // Create color texture
      const colorTex = loader.load('/images/present_builder_app_dark_slides.png')
      colorTex.minFilter = THREE.LinearFilter
      colorTex.magFilter = THREE.LinearFilter

      // Generate depth map from image
      const depthTex = createDepthMapFromImage(img)

      setTextures({ color: colorTex, depth: depthTex })
    }
    img.src = '/images/present_builder_app_dark_slides.png'
  }, [])

  const uniforms = useMemo(
    () => ({
      uColorTexture: { value: null },
      uDepthTexture: { value: null },
      uMouse: { value: new THREE.Vector2() },
      uStrength: { value: 0.025 },
    }),
    []
  )

  // Update textures when loaded
  useEffect(() => {
    if (textures) {
      uniforms.uColorTexture.value = textures.color
      uniforms.uDepthTexture.value = textures.depth
    }
  }, [textures, uniforms])

  useFrame(({ pointer }) => {
    mouseTarget.current.set(pointer.x, pointer.y)
    mouseSmooth.current.lerp(mouseTarget.current, 0.05)
    uniforms.uMouse.value.copy(mouseSmooth.current)
  })

  // Match the screenshot aspect ratio (1918x1062 ≈ 16:9)
  const aspect = 1918 / 1062
  const planeHeight = 4.5
  const planeWidth = planeHeight * aspect

  return (
    <>
      <color attach="background" args={['#0a0a0a']} />
      {textures && (
        <mesh ref={meshRef}>
          <planeGeometry args={[planeWidth, planeHeight]} />
          <shaderMaterial
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            uniforms={uniforms}
          />
        </mesh>
      )}
    </>
  )
}
