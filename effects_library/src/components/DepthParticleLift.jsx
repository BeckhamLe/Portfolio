import { useRef, useMemo, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const GRID = 80

// ---------- Canvas texture generators ----------

function createColorTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  // Sky — sunset gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 300)
  skyGrad.addColorStop(0, '#1a0533')
  skyGrad.addColorStop(0.3, '#5c2d91')
  skyGrad.addColorStop(0.6, '#e85d26')
  skyGrad.addColorStop(1.0, '#f7a440')
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, 512, 300)

  // Sun — bright yellow circle
  ctx.beginPath()
  ctx.arc(256, 140, 50, 0, Math.PI * 2)
  const sunGrad = ctx.createRadialGradient(256, 140, 0, 256, 140, 50)
  sunGrad.addColorStop(0, '#fffbe0')
  sunGrad.addColorStop(0.6, '#ffd54f')
  sunGrad.addColorStop(1.0, '#f7a440')
  ctx.fillStyle = sunGrad
  ctx.fill()

  // Sun glow
  ctx.beginPath()
  ctx.arc(256, 140, 90, 0, Math.PI * 2)
  const glowGrad = ctx.createRadialGradient(256, 140, 40, 256, 140, 90)
  glowGrad.addColorStop(0, 'rgba(255, 213, 79, 0.4)')
  glowGrad.addColorStop(1, 'rgba(255, 213, 79, 0.0)')
  ctx.fillStyle = glowGrad
  ctx.fill()

  // Mountains — dark purple silhouette
  ctx.fillStyle = '#2a1045'
  ctx.beginPath()
  ctx.moveTo(0, 280)
  ctx.lineTo(60, 210)
  ctx.lineTo(130, 250)
  ctx.lineTo(200, 190)
  ctx.lineTo(270, 230)
  ctx.lineTo(340, 180)
  ctx.lineTo(400, 220)
  ctx.lineTo(460, 200)
  ctx.lineTo(512, 240)
  ctx.lineTo(512, 310)
  ctx.lineTo(0, 310)
  ctx.closePath()
  ctx.fill()

  // Water — reflective blue
  const waterGrad = ctx.createLinearGradient(0, 300, 0, 512)
  waterGrad.addColorStop(0, '#1a3a5c')
  waterGrad.addColorStop(0.3, '#1e4d6e')
  waterGrad.addColorStop(1.0, '#0d2137')
  ctx.fillStyle = waterGrad
  ctx.fillRect(0, 300, 512, 212)

  // Sun reflection on water
  ctx.beginPath()
  for (let y = 310; y < 420; y += 6) {
    const w = 30 - (y - 310) * 0.15
    const alpha = 0.5 - (y - 310) * 0.003
    ctx.fillStyle = `rgba(255, 200, 80, ${Math.max(0, alpha)})`
    ctx.fillRect(256 - w / 2 + Math.sin(y * 0.1) * 4, y, w, 3)
  }

  // Dock / pier — dark wood extending into water
  ctx.fillStyle = '#3d2b1f'
  // Main pier body
  ctx.fillRect(180, 350, 160, 12)
  // Pier planks (horizontal)
  ctx.fillStyle = '#4a3728'
  for (let x = 185; x < 335; x += 10) {
    ctx.fillRect(x, 350, 8, 12)
  }
  // Pier legs
  ctx.fillStyle = '#2a1d14'
  ctx.fillRect(195, 350, 6, 80)
  ctx.fillRect(240, 350, 6, 90)
  ctx.fillRect(290, 350, 6, 85)
  ctx.fillRect(330, 350, 6, 75)

  // Boat silhouette near pier
  ctx.fillStyle = '#1a1218'
  ctx.beginPath()
  ctx.moveTo(360, 380)
  ctx.quadraticCurveTo(390, 370, 420, 380)
  ctx.quadraticCurveTo(390, 400, 360, 380)
  ctx.fill()
  // Mast
  ctx.strokeStyle = '#1a1218'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(390, 375)
  ctx.lineTo(390, 330)
  ctx.stroke()

  return ctx
}

function createDepthTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  // Sky — far (black)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 512, 300)

  // Sun — slightly closer than sky
  ctx.beginPath()
  ctx.arc(256, 140, 50, 0, Math.PI * 2)
  ctx.fillStyle = '#111111'
  ctx.fill()

  // Mountains — dark gray (mid-far)
  ctx.fillStyle = '#444444'
  ctx.beginPath()
  ctx.moveTo(0, 280)
  ctx.lineTo(60, 210)
  ctx.lineTo(130, 250)
  ctx.lineTo(200, 190)
  ctx.lineTo(270, 230)
  ctx.lineTo(340, 180)
  ctx.lineTo(400, 220)
  ctx.lineTo(460, 200)
  ctx.lineTo(512, 240)
  ctx.lineTo(512, 310)
  ctx.lineTo(0, 310)
  ctx.closePath()
  ctx.fill()

  // Water — medium gray
  ctx.fillStyle = '#666666'
  ctx.fillRect(0, 300, 512, 212)

  // Dock — near (bright white)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(180, 350, 160, 12)
  ctx.fillRect(195, 350, 6, 80)
  ctx.fillRect(240, 350, 6, 90)
  ctx.fillRect(290, 350, 6, 85)
  ctx.fillRect(330, 350, 6, 75)

  // Boat — near (white)
  ctx.fillStyle = '#dddddd'
  ctx.beginPath()
  ctx.moveTo(360, 380)
  ctx.quadraticCurveTo(390, 370, 420, 380)
  ctx.quadraticCurveTo(390, 400, 360, 380)
  ctx.fill()
  ctx.fillRect(389, 330, 3, 45)

  return ctx
}

// ---------- Shaders ----------

const vertexShader = /* glsl */ `
  attribute float aDepth;
  attribute vec3 aColor;

  uniform float uLift;
  uniform float uTime;
  uniform float uPointSize;
  uniform vec2 uMouse;

  varying vec3 vColor;
  varying float vDepth;

  void main() {
    vec3 pos = position;

    // Lift Z based on depth and hover state
    float lift = aDepth * uLift * 2.0;

    // Mouse proximity: particles near mouse lift more
    float mouseDist = distance(pos.xy, (uMouse - 0.5) * vec2(5.0, 5.0));
    float mouseInfluence = smoothstep(2.0, 0.0, mouseDist);
    lift += mouseInfluence * uLift * aDepth * 1.5;

    // Slight wobble when lifted
    lift += sin(uTime * 2.0 + pos.x * 3.0 + pos.y * 4.0) * 0.05 * uLift * aDepth;

    pos.z += lift;

    vColor = aColor;
    vDepth = aDepth;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);

    // Particles closer to camera (higher Z) appear slightly larger
    float sizeBoost = 1.0 + pos.z * 0.15;
    gl_PointSize = uPointSize * sizeBoost * (300.0 / -mvPos.z);

    gl_Position = projectionMatrix * mvPos;
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vDepth;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.2, d);

    vec3 color = vColor;

    gl_FragColor = vec4(color, alpha);
  }
`

// ---------- Component ----------

function DepthParticleLiftScene() {
  const pointsRef = useRef()
  const mouseSmooth = useRef(new THREE.Vector2(0.5, 0.5))
  const liftRef = useRef(0)
  const isHovered = useRef(false)
  const { size, viewport } = useThree()

  const { geo, uniforms } = useMemo(() => {
    const count = GRID * GRID
    const positions = new Float32Array(count * 3)
    const depths = new Float32Array(count)
    const colors = new Float32Array(count * 3)

    const colorCtx = createColorTexture()
    const depthCtx = createDepthTexture()

    const colorData = colorCtx.getImageData(0, 0, 512, 512)
    const depthData = depthCtx.getImageData(0, 0, 512, 512)

    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const i = row * GRID + col
        const u = col / (GRID - 1)
        const v = row / (GRID - 1)

        // World position (flat grid)
        positions[i * 3] = (u - 0.5) * 5
        positions[i * 3 + 1] = (0.5 - v) * 5
        positions[i * 3 + 2] = 0

        // Sample from canvas image data
        const px = Math.floor(u * 511)
        const py = Math.floor(v * 511)
        const pixelIndex = (py * 512 + px) * 4

        colors[i * 3] = colorData.data[pixelIndex] / 255
        colors[i * 3 + 1] = colorData.data[pixelIndex + 1] / 255
        colors[i * 3 + 2] = colorData.data[pixelIndex + 2] / 255

        depths[i] = depthData.data[pixelIndex] / 255
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))

    const u = {
      uLift: { value: 0 },
      uTime: { value: 0 },
      uPointSize: { value: 4.0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    }

    return { geo: geometry, uniforms: u }
  }, [])

  const onPointerMove = useCallback(
    (e) => {
      // Convert pointer to UV space (0-1)
      const x = (e.clientX / size.width)
      const y = (e.clientY / size.height)
      mouseSmooth.current.set(x, y)
    },
    [size]
  )

  const onPointerEnter = useCallback(() => {
    isHovered.current = true
  }, [])

  const onPointerLeave = useCallback(() => {
    isHovered.current = false
  }, [])

  useFrame((state, delta) => {
    if (!pointsRef.current) return

    const mat = pointsRef.current.material

    // Animate lift
    const target = isHovered.current ? 1 : 0
    liftRef.current += (target - liftRef.current) * Math.min(delta * 3.0, 1.0)
    mat.uniforms.uLift.value = liftRef.current

    // Smooth mouse
    mat.uniforms.uMouse.value.lerp(mouseSmooth.current, Math.min(delta * 5.0, 1.0))

    // Time
    mat.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <>
      <color attach="background" args={['#0a0a0a']} />
      <points
        ref={pointsRef}
        geometry={geo}
        onPointerMove={onPointerMove}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
        />
      </points>
      {/* Invisible plane for pointer events since points don't raycast well */}
      <mesh
        visible={false}
        onPointerMove={onPointerMove}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        <planeGeometry args={[5, 5]} />
        <meshBasicMaterial />
      </mesh>
    </>
  )
}

export default function DepthParticleLift() {
  return <DepthParticleLiftScene />
}
