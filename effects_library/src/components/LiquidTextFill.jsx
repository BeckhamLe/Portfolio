import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ScrollControls, useScroll } from '@react-three/drei'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uTextMask;
uniform float uTime;
uniform float uProgress;
uniform vec2 uResolution;

varying vec2 vUv;

// --- 2D Simplex Noise ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// FBM — 4 octaves
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 4; i++) {
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = vUv;

  float textMask = texture2D(uTextMask, uv).r;

  // Edge detection for outline
  float texelX = 1.0 / 1024.0;
  float texelY = 1.0 / 512.0;
  float nearbyMax = max(
    max(
      texture2D(uTextMask, uv + vec2(texelX, 0.0)).r,
      texture2D(uTextMask, uv - vec2(texelX, 0.0)).r
    ),
    max(
      texture2D(uTextMask, uv + vec2(0.0, texelY)).r,
      texture2D(uTextMask, uv - vec2(0.0, texelY)).r
    )
  );
  // Also check diagonals for thicker outline
  float diagMax = max(
    max(
      texture2D(uTextMask, uv + vec2(texelX, texelY)).r,
      texture2D(uTextMask, uv - vec2(texelX, texelY)).r
    ),
    max(
      texture2D(uTextMask, uv + vec2(texelX, -texelY)).r,
      texture2D(uTextMask, uv - vec2(texelX, -texelY)).r
    )
  );
  nearbyMax = max(nearbyMax, diagMax);
  float outline = step(0.1, nearbyMax) * step(textMask, 0.1) * 0.3;

  if (textMask < 0.1) {
    // Outside text — show outline glow or dark background
    vec3 bgColor = vec3(0.02, 0.02, 0.05);
    vec3 outlineColor = vec3(0.15, 0.25, 0.4) * outline;
    gl_FragColor = vec4(bgColor + outlineColor, 1.0);
    return;
  }

  // Inside text — liquid fill logic
  float fillLevel = uProgress;
  float fillY = 1.0 - fillLevel; // 1.0 = empty, 0.0 = full

  // Wobble at the liquid surface
  float wobble = sin(uv.x * 15.0 + uTime * 3.0) * 0.02
               + sin(uv.x * 8.0 - uTime * 2.0) * 0.01
               + sin(uv.x * 23.0 + uTime * 5.0) * 0.005;

  float surfaceY = fillY + wobble;

  if (uv.y < surfaceY) {
    // Above the liquid — empty interior
    vec3 emptyColor = vec3(0.03, 0.03, 0.06);
    // Subtle inner glow near the outline
    gl_FragColor = vec4(emptyColor, 1.0);
  } else {
    // Below the liquid — animated noise fill
    float depthRange = max(1.0 - surfaceY, 0.001);
    float depth = clamp((uv.y - surfaceY) / depthRange, 0.0, 1.0); // 0 at surface, 1 at bottom

    // Animated noise coordinates — scroll upward slowly
    vec2 noiseUV = uv * 4.0 + vec2(uTime * 0.1, -uTime * 0.15);
    float noise = fbm(noiseUV) * 0.5 + 0.5; // remap to 0-1

    // Secondary noise layer for more organic feel
    vec2 noiseUV2 = uv * 6.0 + vec2(-uTime * 0.08, uTime * 0.12);
    float noise2 = fbm(noiseUV2) * 0.5 + 0.5;

    float combinedNoise = mix(noise, noise2, 0.4);

    // Color palette: deep blue/purple at bottom, cyan/teal at surface
    vec3 deepColor = vec3(0.05, 0.02, 0.2);
    vec3 midColor = vec3(0.02, 0.15, 0.45);
    vec3 surfColor = vec3(0.0, 0.6, 0.8);

    vec3 liquidColor;
    if (depth < 0.5) {
      liquidColor = mix(surfColor, midColor, depth * 2.0);
    } else {
      liquidColor = mix(midColor, deepColor, (depth - 0.5) * 2.0);
    }

    // Add noise variation
    liquidColor += combinedNoise * 0.12;
    // Subtle color shift from noise
    liquidColor.r += noise2 * 0.03;
    liquidColor.b += noise * 0.05;

    // Meniscus highlight — bright line at the liquid surface
    float meniscus = smoothstep(0.035, 0.0, abs(uv.y - surfaceY));
    vec3 meniscusColor = vec3(0.5, 0.9, 1.0);
    liquidColor += meniscusColor * meniscus * 0.8;

    // Secondary softer glow just below surface
    float surfGlow = smoothstep(0.08, 0.0, abs(uv.y - surfaceY));
    liquidColor += vec3(0.1, 0.3, 0.4) * surfGlow * 0.3;

    gl_FragColor = vec4(liquidColor, 1.0);
  }
}
`

function createTextMaskTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  // Transparent background
  ctx.clearRect(0, 0, 1024, 512)

  // Draw "CREATIVE" in bold white, centered
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 130px system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'
  ctx.fillText('CREATIVE', 512, 256)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

function LiquidFillScene() {
  const meshRef = useRef()
  const scroll = useScroll()
  const { size } = useThree()

  const textMask = useMemo(() => createTextMaskTexture(), [])

  const uniforms = useMemo(() => ({
    uTextMask: { value: textMask },
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uResolution: { value: new THREE.Vector2(size.width, size.height) },
  }), [textMask])

  useFrame((state) => {
    if (!meshRef.current) return
    const mat = meshRef.current.material
    mat.uniforms.uTime.value = state.clock.elapsedTime
    mat.uniforms.uProgress.value = scroll.offset
    mat.uniforms.uResolution.value.set(size.width, size.height)
  })

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
}

export default function LiquidTextFill() {
  return (
    <ScrollControls pages={3} damping={0.15}>
      <LiquidFillScene />
    </ScrollControls>
  )
}
