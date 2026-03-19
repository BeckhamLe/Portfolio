import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * VignetteGrade — Post-processing demo: vignette + color grading.
 * Renders a scene with a content card and floating shapes to an FBO,
 * then applies vignette, contrast, saturation, color tinting, and
 * subtle film grain as a fullscreen shader pass.
 */

function createCardTexture() {
  const canvas = document.createElement('canvas')
  const w = 600
  const h = 750
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  // White card background
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, 12)
  ctx.fill()

  // Blue header bar
  ctx.fillStyle = '#2563eb'
  ctx.beginPath()
  ctx.roundRect(0, 0, w, 70, [12, 12, 0, 0])
  ctx.fill()

  // Header text
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif'
  ctx.fillText('Film Grade Preview', 24, 44)

  // Avatar circle
  ctx.fillStyle = '#e0e7ff'
  ctx.beginPath()
  ctx.arc(w - 45, 35, 18, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6366f1'
  ctx.font = 'bold 14px system-ui'
  ctx.fillText('VG', w - 55, 40)

  // Title
  ctx.fillStyle = '#111827'
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif'
  ctx.fillText('Cinematic Post-Processing', 24, 120)

  // Subtitle
  ctx.fillStyle = '#6b7280'
  ctx.font = '14px system-ui, -apple-system, sans-serif'
  ctx.fillText('Vignette, color grading, and film grain', 24, 148)

  // Divider
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(24, 168)
  ctx.lineTo(w - 24, 168)
  ctx.stroke()

  // Body text
  ctx.fillStyle = '#374151'
  ctx.font = '13px system-ui, -apple-system, sans-serif'
  const lines = [
    'This scene is rendered to a framebuffer object and',
    'then processed through a fullscreen shader pass.',
    '',
    'The post-processing chain applies:',
    '  - Contrast adjustment',
    '  - Saturation control',
    '  - Shadow tinting (cool blue)',
    '  - Highlight tinting (warm)',
    '  - Vignette (darkened edges)',
    '  - Subtle film grain',
    '',
    'Without grading, the scene looks flat and digital.',
    'With grading, it feels cohesive and cinematic.',
    '',
    'The shapes orbit slowly to show how the grade',
    'affects different colors in motion.',
  ]
  lines.forEach((line, i) => {
    ctx.fillText(line, 24, 195 + i * 22)
  })

  // Buttons at bottom
  const btnY = h - 80
  // Primary button
  ctx.fillStyle = '#2563eb'
  ctx.beginPath()
  ctx.roundRect(24, btnY, 160, 40, 8)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 14px system-ui'
  ctx.fillText('Apply Grade', 60, btnY + 26)

  // Secondary button
  ctx.strokeStyle = '#d1d5db'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(200, btnY, 160, 40, 8)
  ctx.stroke()
  ctx.fillStyle = '#374151'
  ctx.fillText('Reset Scene', 240, btnY + 26)

  return canvas
}

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform sampler2D uSceneTexture;
uniform float uTime;
uniform float uVignetteIntensity;
uniform float uVignetteRadius;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uContrast;
uniform float uSaturation;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec3 color = texture2D(uSceneTexture, uv).rgb;

  // --- Contrast ---
  color = (color - 0.5) * uContrast + 0.5;

  // --- Saturation ---
  float gray = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(gray), color, uSaturation);

  // --- Color grading (lift/gamma/gain style) ---
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  float shadowMask = 1.0 - smoothstep(0.0, 0.4, luminance);
  float highlightMask = smoothstep(0.6, 1.0, luminance);

  color = mix(color, color * uShadowTint / vec3(0.15), shadowMask * 0.3);
  color *= mix(vec3(1.0), uHighlightTint, highlightMask * 0.2);

  // --- Vignette ---
  float dist = distance(uv, vec2(0.5));
  float vignette = smoothstep(uVignetteRadius, uVignetteRadius - 0.4, dist);
  color *= mix(1.0 - uVignetteIntensity, 1.0, vignette);

  // --- Subtle film grain ---
  float grain = fract(sin(dot(uv * 500.0 + uTime * 10.0, vec2(12.9898, 78.233))) * 43758.5453);
  color += (grain - 0.5) * 0.02;

  // Clamp
  color = clamp(color, 0.0, 1.0);

  gl_FragColor = vec4(color, 1.0);
}
`

function VignetteGradeEffect() {
  const { gl, size } = useThree()
  const quadRef = useRef()

  const { contentScene, contentCamera, shapes, renderTarget, uniforms } = useMemo(() => {
    const aspect = size.width / size.height

    // --- Content scene ---
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#111118')

    // Card
    const cardCanvas = createCardTexture()
    const cardTex = new THREE.CanvasTexture(cardCanvas)
    cardTex.needsUpdate = true
    const cardMat = new THREE.MeshBasicMaterial({ map: cardTex })
    const card = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.75), cardMat)
    scene.add(card)

    // Floating geometric shapes
    const shapeArray = []
    const colors = [0x4466ff, 0xff4488, 0x44ddaa, 0xffaa44]
    for (let i = 0; i < 6; i++) {
      const geo = i % 2 === 0
        ? new THREE.BoxGeometry(0.3, 0.3, 0.3)
        : new THREE.OctahedronGeometry(0.2)
      const mat = new THREE.MeshStandardMaterial({ color: colors[i % 4], roughness: 0.5 })
      const mesh = new THREE.Mesh(geo, mat)
      // Position shapes around the card
      const angle = (i / 6) * Math.PI * 2
      const radius = 2.2 + Math.random() * 0.8
      mesh.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.8,
        (Math.random() - 0.5) * 2
      )
      mesh.userData.orbitAngle = angle
      mesh.userData.orbitRadius = radius
      mesh.userData.orbitSpeed = 0.15 + Math.random() * 0.15
      mesh.userData.yFactor = 0.8 + Math.random() * 0.4
      scene.add(mesh)
      shapeArray.push(mesh)
    }

    // Lighting
    const ambient = new THREE.AmbientLight(0x404060, 0.5)
    scene.add(ambient)
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(3, 5, 4)
    scene.add(dir)

    // Camera
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100)
    camera.position.z = 5

    // Render target
    const target = new THREE.WebGLRenderTarget(size.width, size.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    })

    // Uniforms
    const u = {
      uSceneTexture: { value: target.texture },
      uTime: { value: 0 },
      uVignetteIntensity: { value: 0.4 },
      uVignetteRadius: { value: 0.85 },
      uShadowTint: { value: new THREE.Vector3(0.1, 0.12, 0.2) },
      uHighlightTint: { value: new THREE.Vector3(1.05, 1.0, 0.95) },
      uContrast: { value: 1.2 },
      uSaturation: { value: 1.0 },
    }

    return {
      contentScene: scene,
      contentCamera: camera,
      shapes: shapeArray,
      renderTarget: target,
      uniforms: u,
    }
  }, [size.width, size.height])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()

    // Animate shapes — orbit around center
    shapes.forEach((mesh) => {
      const a = mesh.userData.orbitAngle + t * mesh.userData.orbitSpeed
      const r = mesh.userData.orbitRadius
      mesh.position.x = Math.cos(a) * r
      mesh.position.y = Math.sin(a) * r * mesh.userData.yFactor
      mesh.rotation.x = t * 0.5
      mesh.rotation.y = t * 0.7
    })

    // Slight camera sway
    contentCamera.position.x = Math.sin(t * 0.2) * 0.15
    contentCamera.position.y = Math.cos(t * 0.15) * 0.1
    contentCamera.lookAt(0, 0, 0)

    // Render content scene to FBO
    gl.setRenderTarget(renderTarget)
    gl.render(contentScene, contentCamera)
    gl.setRenderTarget(null)

    // Update time uniform
    uniforms.uTime.value = t
  })

  return (
    <mesh ref={quadRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

export default function VignetteGrade() {
  return <VignetteGradeEffect />
}
