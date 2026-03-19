import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Image Hover Distortion — A project card image that warps like liquid
 * when you hover near it. Distortion radiates from the cursor position
 * using procedural noise for organic feel, with chromatic aberration
 * in the distortion zone.
 */

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform sampler2D uTexture;
uniform vec2 uMouse;
uniform float uTime;
uniform float uHoverStrength;
uniform vec2 uResolution;

varying vec2 vUv;

//
// Simplex 2D noise (Ashima Arts)
//
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,   // (3.0 - sqrt(3.0)) / 6.0
    0.366025403784439,   // 0.5 * (sqrt(3.0) - 1.0)
   -0.577350269189626,   // -1.0 + 2.0 * C.x
    0.024390243902439    // 1.0 / 41.0
  );

  // First corner
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);

  // Other corners
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

  // Permutations
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;

  // Gradients
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  // Compute final noise value at P
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  // Aspect ratio correction so distortion is circular, not elliptical
  float aspect = uResolution.x / uResolution.y;
  vec2 uvCorrected = vUv;
  uvCorrected.x *= aspect;
  vec2 mouseCorrected = uMouse;
  mouseCorrected.x *= aspect;

  // Distance from fragment to mouse in aspect-corrected space
  float dist = distance(uvCorrected, mouseCorrected);

  // Radial falloff — smooth bubble around cursor
  float radius = 0.25;
  float falloff = smoothstep(radius, 0.0, dist);
  float strength = falloff * uHoverStrength;

  // Noise-based UV offset for organic liquid distortion
  float noiseScale = 4.0;
  float timeOffset = uTime * 0.5;
  float n1 = snoise(vUv * noiseScale + vec2(timeOffset, 0.0));
  float n2 = snoise(vUv * noiseScale + vec2(0.0, timeOffset + 31.7));

  // Combine radial push (away from cursor) with noise swirl
  vec2 dir = normalize(vUv - uMouse + 0.001); // direction away from mouse
  vec2 noiseOffset = vec2(n1, n2) * 0.04;
  vec2 radialOffset = dir * 0.02 * falloff;

  vec2 totalOffset = (noiseOffset + radialOffset) * strength;

  // Chromatic aberration — sample each channel at slightly different offsets
  float aberrationAmount = 1.0 + strength * 0.6;

  vec2 uvR = vUv + totalOffset * aberrationAmount * 1.1;
  vec2 uvG = vUv + totalOffset * aberrationAmount * 1.0;
  vec2 uvB = vUv + totalOffset * aberrationAmount * 0.9;

  // Clamp UVs to avoid sampling outside texture
  uvR = clamp(uvR, 0.0, 1.0);
  uvG = clamp(uvG, 0.0, 1.0);
  uvB = clamp(uvB, 0.0, 1.0);

  float r = texture2D(uTexture, uvR).r;
  float g = texture2D(uTexture, uvG).g;
  float b = texture2D(uTexture, uvB).b;

  gl_FragColor = vec4(r, g, b, 1.0);
}
`

function createCardTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  // Gradient background: deep blue to purple
  const grad = ctx.createLinearGradient(0, 0, 512, 512)
  grad.addColorStop(0, '#0f0c29')
  grad.addColorStop(0.5, '#302b63')
  grad.addColorStop(1, '#24243e')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 512, 512)

  // Decorative circles
  ctx.globalAlpha = 0.15
  ctx.fillStyle = '#7f5af0'
  ctx.beginPath()
  ctx.arc(380, 120, 100, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#2cb67d'
  ctx.beginPath()
  ctx.arc(130, 380, 80, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#e53170'
  ctx.beginPath()
  ctx.arc(400, 400, 60, 0, Math.PI * 2)
  ctx.fill()

  // Decorative lines
  ctx.globalAlpha = 0.1
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  for (let i = 0; i < 8; i++) {
    ctx.beginPath()
    ctx.moveTo(0, 60 + i * 60)
    ctx.lineTo(512, 60 + i * 60)
    ctx.stroke()
  }

  // Main text
  ctx.globalAlpha = 1.0
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 52px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Project', 256, 220)

  // Subtitle
  ctx.globalAlpha = 0.6
  ctx.font = '24px system-ui, sans-serif'
  ctx.fillText('Hover to distort', 256, 290)

  // Small tag line
  ctx.globalAlpha = 0.35
  ctx.font = '16px system-ui, sans-serif'
  ctx.fillText('React Three Fiber', 256, 340)

  return new THREE.CanvasTexture(canvas)
}

export default function ImageHoverDistortion() {
  const materialRef = useRef()
  const smoothMouse = useRef(new THREE.Vector2(0.5, 0.5))
  const hoverStrength = useRef(0)
  const { size } = useThree()

  const texture = useMemo(() => createCardTexture(), [])

  const uniforms = useMemo(
    () => ({
      uTexture: { value: texture },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uTime: { value: 0 },
      uHoverStrength: { value: 0 },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
    }),
    [texture]
  )

  useFrame((state, delta) => {
    if (!materialRef.current) return

    // Update time
    uniforms.uTime.value = state.clock.elapsedTime

    // Update resolution if window resized
    uniforms.uResolution.value.set(size.width, size.height)

    // Convert pointer from NDC (-1..1) to UV space (0..1)
    const targetX = (state.pointer.x + 1) * 0.5
    const targetY = (state.pointer.y + 1) * 0.5

    // Smooth mouse with lerp
    const lerpFactor = 1.0 - Math.pow(0.001, delta)
    smoothMouse.current.x += (targetX - smoothMouse.current.x) * lerpFactor
    smoothMouse.current.y += (targetY - smoothMouse.current.y) * lerpFactor

    uniforms.uMouse.value.copy(smoothMouse.current)

    // Determine if pointer is roughly over the card
    // Pointer in NDC: x in -1..1, y in -1..1
    // Card roughly fills center of viewport
    const pointerOverCard =
      Math.abs(state.pointer.x) < 0.8 && Math.abs(state.pointer.y) < 0.6

    const targetStrength = pointerOverCard ? 1.0 : 0.0
    const strengthLerp = 1.0 - Math.pow(0.0001, delta)
    hoverStrength.current +=
      (targetStrength - hoverStrength.current) * strengthLerp

    uniforms.uHoverStrength.value = hoverStrength.current
  })

  return (
    <>
      <color attach="background" args={['#0a0a0a']} />
      <mesh>
        <planeGeometry args={[4, 2.5]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
        />
      </mesh>
    </>
  )
}
