import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useScroll, ScrollControls } from '@react-three/drei'
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

    // Clamp to avoid sampling outside
    zoomedUV = clamp(zoomedUV, 0.0, 1.0);

    vec3 color = texture2D(uColorTexture, zoomedUV).rgb;

    // Approximate blur on far elements at high zoom
    float blurAmount = uProgress * (1.0 - depth) * 0.003;
    vec3 blurred = color;

    if (blurAmount > 0.0005) {
      blurred += texture2D(uColorTexture, clamp(zoomedUV + vec2(blurAmount, 0.0), 0.0, 1.0)).rgb;
      blurred += texture2D(uColorTexture, clamp(zoomedUV - vec2(blurAmount, 0.0), 0.0, 1.0)).rgb;
      blurred += texture2D(uColorTexture, clamp(zoomedUV + vec2(0.0, blurAmount), 0.0, 1.0)).rgb;
      blurred += texture2D(uColorTexture, clamp(zoomedUV - vec2(0.0, blurAmount), 0.0, 1.0)).rgb;
      blurred /= 5.0;
    }

    gl_FragColor = vec4(blurred, 1.0);
  }
`

// Generate depth map from image brightness/saturation
function createDepthMapFromImage(image) {
  const canvas = document.createElement('canvas')
  const w = image.width
  const h = image.height
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, w, h)
  const pixels = imageData.data

  const depthCanvas = document.createElement('canvas')
  depthCanvas.width = w
  depthCanvas.height = h
  const depthCtx = depthCanvas.getContext('2d')
  const depthData = depthCtx.createImageData(w, h)

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]

    const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const saturation = max === 0 ? 0 : (max - min) / max

    let depth = brightness * 0.6 + saturation * 0.4
    depth = Math.pow(depth, 0.7)

    // Edge elements boost (decorative shapes at corners)
    const px = (i / 4) % w
    const py = Math.floor((i / 4) / w)
    const edgeX = Math.abs(px / w - 0.5) * 2
    const edgeY = Math.abs(py / h - 0.5) * 2
    const edgeFactor = Math.max(edgeX, edgeY)

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

  // Blur for smoother depth transitions
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

function DepthZoomScene() {
  const meshRef = useRef()
  const scroll = useScroll()
  const [textures, setTextures] = useState(null)

  useEffect(() => {
    const loader = new THREE.TextureLoader()
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const colorTex = loader.load('/images/present_builder_app_light_slides.png')
      colorTex.minFilter = THREE.LinearFilter
      colorTex.magFilter = THREE.LinearFilter

      const depthTex = createDepthMapFromImage(img)
      setTextures({ color: colorTex, depth: depthTex })
    }
    img.src = '/images/present_builder_app_light_slides.png'
  }, [])

  const uniforms = useMemo(
    () => ({
      uProgress: { value: 0 },
      uColorTexture: { value: null },
      uDepthTexture: { value: null },
    }),
    []
  )

  useEffect(() => {
    if (textures) {
      uniforms.uColorTexture.value = textures.color
      uniforms.uDepthTexture.value = textures.depth
    }
  }, [textures, uniforms])

  useFrame(() => {
    uniforms.uProgress.value = scroll.offset
  })

  // Match light slide aspect ratio (1898x1056 ≈ 16:9)
  const aspect = 1898 / 1056
  const planeHeight = 4.5
  const planeWidth = planeHeight * aspect

  return textures ? (
    <mesh ref={meshRef}>
      <planeGeometry args={[planeWidth, planeHeight]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  ) : null
}

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
