import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalMatrix * normal;

    // Subtle breathing bulge — push center vertices slightly forward
    float dist = length(uv - 0.5);
    float bulge = (1.0 - smoothstep(0.0, 0.5, dist)) * 0.04 * sin(uTime * 1.2);
    vec3 pos = position + normal * bulge;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform vec3 uGlowColor;
  uniform float uGlowIntensity;
  uniform float uTexelSize;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;

  void main() {
    vec4 texColor = texture2D(uTexture, vUv);

    if (texColor.a < 0.05) discard;

    // Edge detection via neighbor alpha sampling
    float ts = uTexelSize;
    float alphaL = texture2D(uTexture, vUv + vec2(-ts, 0.0)).a;
    float alphaR = texture2D(uTexture, vUv + vec2(ts, 0.0)).a;
    float alphaU = texture2D(uTexture, vUv + vec2(0.0, ts)).a;
    float alphaD = texture2D(uTexture, vUv + vec2(0.0, -ts)).a;

    float edgeStrength = abs(texColor.a - alphaL)
                       + abs(texColor.a - alphaR)
                       + abs(texColor.a - alphaU)
                       + abs(texColor.a - alphaD);
    edgeStrength = smoothstep(0.0, 0.5, edgeStrength);

    // Wider glow — sample further out too
    float ts2 = ts * 3.0;
    float alphaL2 = texture2D(uTexture, vUv + vec2(-ts2, 0.0)).a;
    float alphaR2 = texture2D(uTexture, vUv + vec2(ts2, 0.0)).a;
    float alphaU2 = texture2D(uTexture, vUv + vec2(0.0, ts2)).a;
    float alphaD2 = texture2D(uTexture, vUv + vec2(0.0, -ts2)).a;

    float outerEdge = abs(texColor.a - alphaL2)
                    + abs(texColor.a - alphaR2)
                    + abs(texColor.a - alphaU2)
                    + abs(texColor.a - alphaD2);
    outerEdge = smoothstep(0.0, 0.4, outerEdge);

    float combinedEdge = max(edgeStrength, outerEdge * 0.6);

    // Pulsing glow
    float pulse = 0.7 + 0.3 * sin(uTime * 2.0);
    float glowAmount = combinedEdge * uGlowIntensity * pulse;

    // Fresnel-like effect based on view angle (from tilt)
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = 1.0 - max(dot(normalize(vNormal), viewDir), 0.0);
    fresnel = pow(fresnel, 2.0) * 0.4;

    // Combine base texture with glow
    vec3 color = texColor.rgb;
    color += uGlowColor * glowAmount;
    color += uGlowColor * fresnel * 0.5;

    float alpha = texColor.a + glowAmount * 0.3;
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(color, alpha);
  }
`

function createCutoutTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  // Start fully transparent
  ctx.clearRect(0, 0, size, size)

  // Create a blue-to-purple gradient
  const gradient = ctx.createLinearGradient(size * 0.3, size * 0.1, size * 0.7, size * 0.9)
  gradient.addColorStop(0, '#4488ff')
  gradient.addColorStop(0.5, '#6644dd')
  gradient.addColorStop(1, '#9933cc')

  // --- Draw a rocket ship ---

  ctx.save()
  ctx.translate(size / 2, size / 2)

  // Main body
  ctx.beginPath()
  ctx.moveTo(0, -180)  // nose tip
  ctx.bezierCurveTo(50, -140, 55, -60, 55, 20)
  ctx.lineTo(55, 120)
  ctx.bezierCurveTo(55, 150, 30, 160, 0, 170) // bottom curve
  ctx.bezierCurveTo(-30, 160, -55, 150, -55, 120)
  ctx.lineTo(-55, 20)
  ctx.bezierCurveTo(-55, -60, -50, -140, 0, -180)
  ctx.closePath()
  ctx.fillStyle = gradient
  ctx.fill()

  // Left fin
  ctx.beginPath()
  ctx.moveTo(-55, 80)
  ctx.lineTo(-110, 160)
  ctx.lineTo(-100, 170)
  ctx.lineTo(-55, 130)
  ctx.closePath()
  ctx.fillStyle = '#5533aa'
  ctx.fill()

  // Right fin
  ctx.beginPath()
  ctx.moveTo(55, 80)
  ctx.lineTo(110, 160)
  ctx.lineTo(100, 170)
  ctx.lineTo(55, 130)
  ctx.closePath()
  ctx.fillStyle = '#5533aa'
  ctx.fill()

  // Window (porthole)
  ctx.beginPath()
  ctx.arc(0, -40, 25, 0, Math.PI * 2)
  ctx.fillStyle = '#88ccff'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, -40, 20, 0, Math.PI * 2)
  ctx.fillStyle = '#112244'
  ctx.fill()
  // Window highlight
  ctx.beginPath()
  ctx.arc(-6, -46, 7, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(200, 230, 255, 0.6)'
  ctx.fill()

  // Nose cone accent stripe
  ctx.beginPath()
  ctx.moveTo(-30, -100)
  ctx.quadraticCurveTo(0, -115, 30, -100)
  ctx.quadraticCurveTo(0, -105, -30, -100)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
  ctx.fill()

  // Body highlight line (left side reflection)
  ctx.beginPath()
  ctx.moveTo(-35, -120)
  ctx.quadraticCurveTo(-40, 0, -35, 110)
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
  ctx.stroke()

  // Exhaust nozzle
  ctx.beginPath()
  ctx.moveTo(-30, 165)
  ctx.lineTo(30, 165)
  ctx.lineTo(25, 185)
  ctx.lineTo(-25, 185)
  ctx.closePath()
  ctx.fillStyle = '#443388'
  ctx.fill()

  // Flame
  ctx.beginPath()
  ctx.moveTo(-20, 185)
  ctx.quadraticCurveTo(-15, 210, 0, 230)
  ctx.quadraticCurveTo(15, 210, 20, 185)
  ctx.closePath()
  const flameGrad = ctx.createLinearGradient(0, 185, 0, 230)
  flameGrad.addColorStop(0, 'rgba(255, 180, 50, 0.9)')
  flameGrad.addColorStop(0.5, 'rgba(255, 100, 20, 0.7)')
  flameGrad.addColorStop(1, 'rgba(255, 50, 10, 0.0)')
  ctx.fillStyle = flameGrad
  ctx.fill()

  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  texture.premultiplyAlpha = false
  texture.needsUpdate = true
  return texture
}

export default function CutoutImageEffect() {
  const meshRef = useRef()
  const mouseTarget = useRef(new THREE.Vector2(0, 0))
  const mouseSmooth = useRef(new THREE.Vector2(0, 0))

  const texture = useMemo(() => createCutoutTexture(), [])

  const uniforms = useMemo(() => ({
    uTexture: { value: texture },
    uTime: { value: 0 },
    uGlowColor: { value: new THREE.Vector3(0.0, 0.8, 1.0) },
    uGlowIntensity: { value: 0.5 },
    uTexelSize: { value: 1.0 / 512.0 },
  }), [])

  useFrame(({ clock, pointer }) => {
    if (!meshRef.current) return

    const mesh = meshRef.current
    const mat = mesh.material

    // Update time uniform
    mat.uniforms.uTime.value = clock.elapsedTime

    // Track mouse — pointer is normalized -1 to 1
    mouseTarget.current.set(pointer.x, pointer.y)

    // Smooth interpolation
    mouseSmooth.current.lerp(mouseTarget.current, 0.05)

    // Tilt mesh toward cursor (parallax)
    mesh.rotation.y = mouseSmooth.current.x * 0.15
    mesh.rotation.x = -mouseSmooth.current.y * 0.1

    // Gentle floating oscillation
    mesh.position.y = Math.sin(clock.elapsedTime * 0.8) * 0.15
  })

  return (
    <>
      <color attach="background" args={['#0a0a0a']} />
      <mesh ref={meshRef}>
        <planeGeometry args={[3, 3]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent={true}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}
