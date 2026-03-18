import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useScroll, ScrollControls } from '@react-three/drei'
import * as THREE from 'three'

// Render a realistic card with real text to an offscreen canvas
function createCardTexture() {
  const canvas = document.createElement('canvas')
  const w = 800
  const h = 1000
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  // White card background
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, 16)
  ctx.fill()

  // Blue header bar
  ctx.fillStyle = '#2563eb'
  ctx.beginPath()
  ctx.roundRect(0, 0, w, 80, [16, 16, 0, 0])
  ctx.fill()

  // Header text
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif'
  ctx.fillText('Project Dashboard', 30, 50)

  // Avatar circle
  ctx.fillStyle = '#e0e7ff'
  ctx.beginPath()
  ctx.arc(w - 55, 40, 22, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6366f1'
  ctx.font = 'bold 18px system-ui'
  ctx.fillText('BL', w - 67, 46)

  // Title
  ctx.fillStyle = '#111827'
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif'
  ctx.fillText('Building Interactive 3D Effects', 30, 140)

  // Subtitle
  ctx.fillStyle = '#6b7280'
  ctx.font = '16px system-ui, -apple-system, sans-serif'
  ctx.fillText('A deep dive into shader-driven web animations', 30, 172)

  // Divider line
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(30, 195)
  ctx.lineTo(w - 30, 195)
  ctx.stroke()

  // Body text paragraphs
  ctx.fillStyle = '#374151'
  ctx.font = '15px system-ui, -apple-system, sans-serif'
  const lines = [
    'Modern web experiences demand more than static layouts.',
    'Users expect fluid, responsive interactions that feel',
    'alive. This project explores the intersection of WebGL',
    'shaders and scroll-driven animation to create effects',
    'that respond to user behavior in real time.',
    '',
    'The key insight is that scroll velocity — not just scroll',
    'position — carries expressive information. A fast scroll',
    'implies urgency or browsing, while a slow scroll implies',
    'reading. By mapping velocity to visual distortion, we',
    'create a feedback loop between user intent and visual',
    'response.',
    '',
    'This card demonstrates the concept. Scroll slowly and',
    'the content stays crisp. Scroll fast and watch the card',
    'stretch, blur, and shift — like reality bending under',
    'the force of your momentum.',
  ]
  let y = 225
  for (const line of lines) {
    if (line === '') { y += 10; continue }
    ctx.fillText(line, 30, y)
    y += 24
  }

  // Stats row
  const statsY = y + 20
  ctx.strokeStyle = '#e5e7eb'
  ctx.beginPath()
  ctx.moveTo(30, statsY - 10)
  ctx.lineTo(w - 30, statsY - 10)
  ctx.stroke()

  // Stat boxes
  const stats = [
    { label: 'Effects', value: '24' },
    { label: 'Shaders', value: '18' },
    { label: 'FPS', value: '60' },
    { label: 'Status', value: 'Live' },
  ]
  const statWidth = (w - 60) / stats.length
  stats.forEach((stat, i) => {
    const sx = 30 + i * statWidth
    ctx.fillStyle = '#111827'
    ctx.font = 'bold 24px system-ui'
    ctx.fillText(stat.value, sx + 10, statsY + 25)
    ctx.fillStyle = '#9ca3af'
    ctx.font = '13px system-ui'
    ctx.fillText(stat.label, sx + 10, statsY + 45)
  })

  // Button at bottom
  const btnY = h - 80
  ctx.fillStyle = '#2563eb'
  ctx.beginPath()
  ctx.roundRect(30, btnY, 180, 44, 8)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 15px system-ui'
  ctx.fillText('View Effects →', 55, btnY + 28)

  // Secondary button
  ctx.strokeStyle = '#d1d5db'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(230, btnY, 140, 44, 8)
  ctx.stroke()
  ctx.fillStyle = '#374151'
  ctx.font = '15px system-ui'
  ctx.fillText('Learn More', 260, btnY + 28)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uVelocity;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform sampler2D uCardTexture;

  varying vec2 vUv;

  #define PI 3.14159265359

  // Rounded rectangle SDF
  float cardSDF(vec2 uv, vec2 center, vec2 halfSize, float radius) {
    vec2 d = abs(uv - center) - halfSize + radius;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
  }

  // Sample card texture within card bounds
  vec3 sampleCard(vec2 uv, vec2 cardMin, vec2 cardMax) {
    vec2 cardUV = (uv - cardMin) / (cardMax - cardMin);
    // Canvas Y is already correct for UV space
    return texture2D(uCardTexture, clamp(cardUV, 0.0, 1.0)).rgb;
  }

  void main() {
    vec2 uv = vUv;
    float vel = uVelocity;
    float absVel = abs(vel);

    // Card bounds: match canvas aspect ratio (800x1000 = 0.8:1)
    // so card width should be 0.8x of card height to avoid stretching
    float aspect = uResolution.x / uResolution.y;
    vec2 cardCenter = vec2(0.5, 0.5);
    float cardH = 0.38; // card half-height in UV
    float cardW = cardH * 0.8 / aspect; // maintain 800:1000 ratio, corrected for screen aspect
    vec2 cardHalf = vec2(cardW, cardH);
    vec2 cardMin = cardCenter - cardHalf;
    vec2 cardMax = cardCenter + cardHalf;
    float cornerRadius = 0.008;

    // --- UV distortion based on velocity ---
    vec2 distortedUV = uv;

    // Wobble
    float wobble = sin(uv.y * 20.0 + uTime * 2.0) * 0.003 * absVel;
    distortedUV.x += wobble;

    // Vertical stretch in scroll direction
    float stretchAmount = absVel * 0.15;
    float stretchCenter = 0.5 + sign(vel) * stretchAmount * 0.3;
    distortedUV.y = mix(distortedUV.y, stretchCenter, stretchAmount * 0.5);
    distortedUV.y += vel * 0.025;

    // --- Chromatic aberration ---
    float caAmount = smoothstep(0.15, 1.0, absVel) * 0.02;
    vec2 caOffset = vec2(0.0, caAmount * sign(vel));

    vec2 uvR = distortedUV + caOffset;
    vec2 uvG = distortedUV;
    vec2 uvB = distortedUV - caOffset;

    // --- Motion blur ---
    float blurSpread = smoothstep(0.4, 1.0, absVel) * 0.05;

    // Background
    vec3 bgColor = vec3(0.06, 0.06, 0.10);

    // Card drop shadow
    float shadowDist = cardSDF(distortedUV, cardCenter + vec2(0.004, -0.006), cardHalf + 0.015, cornerRadius + 0.01);
    float shadowMask = 1.0 - smoothstep(-0.025, 0.025, shadowDist);
    bgColor = mix(bgColor, vec3(0.01, 0.01, 0.03), shadowMask * 0.6);

    vec3 finalColor = vec3(0.0);

    if (absVel > 0.4 && blurSpread > 0.001) {
      // Motion blur: multi-sample
      vec3 accumR = vec3(0.0);
      vec3 accumG = vec3(0.0);
      vec3 accumB = vec3(0.0);
      float totalWeight = 0.0;

      for (int i = 0; i < 9; i++) {
        float t = (float(i) / 8.0 - 0.5) * 2.0;
        float weight = 1.0 - abs(t) * 0.5;
        vec2 blurOff = vec2(0.0, t * blurSpread * sign(vel));

        vec2 sR = uvR + blurOff;
        vec2 sG = uvG + blurOff;
        vec2 sB = uvB + blurOff;

        float dR = cardSDF(sR, cardCenter, cardHalf, cornerRadius);
        float dG = cardSDF(sG, cardCenter, cardHalf, cornerRadius);
        float dB = cardSDF(sB, cardCenter, cardHalf, cornerRadius);

        float maskR = 1.0 - smoothstep(-0.002, 0.002, dR);
        float maskG = 1.0 - smoothstep(-0.002, 0.002, dG);
        float maskB = 1.0 - smoothstep(-0.002, 0.002, dB);

        vec3 cR = mix(bgColor, sampleCard(sR, cardMin, cardMax), maskR);
        vec3 cG = mix(bgColor, sampleCard(sG, cardMin, cardMax), maskG);
        vec3 cB = mix(bgColor, sampleCard(sB, cardMin, cardMax), maskB);

        accumR += cR * weight;
        accumG += cG * weight;
        accumB += cB * weight;
        totalWeight += weight;
      }

      finalColor = vec3(accumR.r / totalWeight, accumG.g / totalWeight, accumB.b / totalWeight);
    } else {
      // Single sample with CA
      float dR = cardSDF(uvR, cardCenter, cardHalf, cornerRadius);
      float dG = cardSDF(uvG, cardCenter, cardHalf, cornerRadius);
      float dB = cardSDF(uvB, cardCenter, cardHalf, cornerRadius);

      float maskR = 1.0 - smoothstep(-0.002, 0.002, dR);
      float maskG = 1.0 - smoothstep(-0.002, 0.002, dG);
      float maskB = 1.0 - smoothstep(-0.002, 0.002, dB);

      vec3 cR = mix(bgColor, sampleCard(uvR, cardMin, cardMax), maskR);
      vec3 cG = mix(bgColor, sampleCard(uvG, cardMin, cardMax), maskG);
      vec3 cB = mix(bgColor, sampleCard(uvB, cardMin, cardMax), maskB);

      finalColor = vec3(cR.r, cG.g, cB.b);
    }

    // Warm color shift at high velocity
    float warmShift = smoothstep(0.6, 1.0, absVel) * 0.3;
    finalColor.r += warmShift * 0.08;
    finalColor.g -= warmShift * 0.02;
    finalColor.b -= warmShift * 0.04;

    // Vignette
    float vignette = 1.0 - length((uv - 0.5) * 1.5) * 0.25;
    finalColor *= vignette;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`

function SmearScene() {
  const meshRef = useRef()
  const scroll = useScroll()
  const { size } = useThree()
  const lastOffset = useRef(null)
  const smoothedVelocity = useRef(0)

  const cardTexture = useMemo(() => createCardTexture(), [])

  const uniforms = useMemo(
    () => ({
      uVelocity: { value: 0 },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
      uCardTexture: { value: cardTexture },
    }),
    []
  )

  useFrame(({ clock }) => {
    const mat = meshRef.current?.material
    if (!mat) return

    const currentOffset = scroll.offset

    if (lastOffset.current === null) {
      lastOffset.current = currentOffset
    }

    const rawVelocity = currentOffset - lastOffset.current
    lastOffset.current = currentOffset

    const targetVelocity = rawVelocity * 50
    smoothedVelocity.current = THREE.MathUtils.lerp(
      smoothedVelocity.current,
      targetVelocity,
      0.08
    )

    const vel = THREE.MathUtils.clamp(smoothedVelocity.current, -1, 1)

    mat.uniforms.uVelocity.value = vel
    mat.uniforms.uTime.value = clock.getElapsedTime()
    mat.uniforms.uResolution.value.set(size.width, size.height)
  })

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  )
}

export default function ScrollVelocitySmear() {
  return (
    <ScrollControls pages={5} damping={0.15}>
      <SmearScene />
    </ScrollControls>
  )
}
