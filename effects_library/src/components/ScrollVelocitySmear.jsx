import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useScroll, ScrollControls } from '@react-three/drei'
import * as THREE from 'three'

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

  varying vec2 vUv;

  #define PI 3.14159265359

  // --- Card geometry ---
  // Rounded rectangle SDF for card shape
  float cardSDF(vec2 uv, vec2 center, vec2 halfSize, float radius) {
    vec2 d = abs(uv - center) - halfSize + radius;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
  }

  // --- Procedural card content ---
  vec3 cardContent(vec2 uv, vec2 cardMin, vec2 cardMax) {
    // Normalize UV within card bounds
    vec2 cardUV = (uv - cardMin) / (cardMax - cardMin);

    // Dark gradient background
    vec3 bg1 = vec3(0.08, 0.06, 0.14);
    vec3 bg2 = vec3(0.04, 0.08, 0.16);
    vec3 color = mix(bg1, bg2, cardUV.y);

    // Subtle grid lines
    vec2 gridUV = cardUV * vec2(12.0, 8.0);
    vec2 grid = abs(fract(gridUV) - 0.5);
    float gridLine = 1.0 - smoothstep(0.0, 0.03, min(grid.x, grid.y));
    color += gridLine * vec3(0.08, 0.06, 0.12);

    // Accent gradient bar at top (top 6% of card)
    float barMask = smoothstep(0.94, 0.96, cardUV.y);
    vec3 accentLeft = vec3(0.2, 0.5, 1.0);
    vec3 accentRight = vec3(0.7, 0.2, 0.9);
    vec3 accent = mix(accentLeft, accentRight, cardUV.x);
    color = mix(color, accent, barMask);

    // Subtle inner glow near center
    float centerGlow = 1.0 - length((cardUV - 0.5) * vec2(1.4, 1.8));
    centerGlow = max(centerGlow, 0.0);
    color += centerGlow * vec3(0.03, 0.02, 0.06);

    return color;
  }

  void main() {
    vec2 uv = vUv;
    float vel = uVelocity; // -1 to 1, negative = up, positive = down
    float absVel = abs(vel);

    // --- Card bounds ---
    vec2 cardCenter = vec2(0.5, 0.5);
    vec2 cardHalf = vec2(0.30, 0.20); // 60% width, 40% height
    vec2 cardMin = cardCenter - cardHalf;
    vec2 cardMax = cardCenter + cardHalf;
    float cornerRadius = 0.012;

    // --- UV distortion based on velocity ---
    vec2 distortedUV = uv;

    // Low velocity: subtle wobble
    float wobble = sin(uv.y * 20.0 + uTime * 2.0) * 0.002 * absVel;
    distortedUV.x += wobble;

    // Medium-high velocity: vertical stretch in scroll direction
    float stretchAmount = absVel * 0.15;
    float stretchDir = sign(vel);
    // Offset the stretch center in the direction of motion
    float stretchCenter = 0.5 + stretchDir * stretchAmount * 0.3;
    distortedUV.y = mix(distortedUV.y, stretchCenter, stretchAmount * 0.5);
    // Directional offset
    distortedUV.y += vel * 0.02;

    // --- Chromatic aberration ---
    float caAmount = smoothstep(0.2, 1.0, absVel) * 0.015;
    // Split along vertical axis (scroll direction)
    vec2 caOffset = vec2(0.0, caAmount * sign(vel));

    vec2 uvR = distortedUV + caOffset;
    vec2 uvG = distortedUV;
    vec2 uvB = distortedUV - caOffset;

    // --- Motion blur (multi-sample along scroll direction) ---
    float blurSpread = smoothstep(0.5, 1.0, absVel) * 0.04;

    // Background color (dark)
    vec3 bgColor = vec3(0.03, 0.02, 0.05);

    vec3 finalColor = vec3(0.0);

    if (absVel > 0.5 && blurSpread > 0.001) {
      // Motion blur path: multi-sample
      vec3 accumR = vec3(0.0);
      vec3 accumG = vec3(0.0);
      vec3 accumB = vec3(0.0);
      float totalWeight = 0.0;

      for (int i = 0; i < 7; i++) {
        float t = (float(i) / 6.0 - 0.5) * 2.0; // -1 to 1
        float weight = 1.0 - abs(t) * 0.5; // center-weighted
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

        vec3 cR = mix(bgColor, cardContent(sR, cardMin, cardMax), maskR);
        vec3 cG = mix(bgColor, cardContent(sG, cardMin, cardMax), maskG);
        vec3 cB = mix(bgColor, cardContent(sB, cardMin, cardMax), maskB);

        accumR += cR * weight;
        accumG += cG * weight;
        accumB += cB * weight;
        totalWeight += weight;
      }

      accumR /= totalWeight;
      accumG /= totalWeight;
      accumB /= totalWeight;

      finalColor = vec3(accumR.r, accumG.g, accumB.b);
    } else {
      // No motion blur: single sample with chromatic aberration
      float dR = cardSDF(uvR, cardCenter, cardHalf, cornerRadius);
      float dG = cardSDF(uvG, cardCenter, cardHalf, cornerRadius);
      float dB = cardSDF(uvB, cardCenter, cardHalf, cornerRadius);

      float maskR = 1.0 - smoothstep(-0.002, 0.002, dR);
      float maskG = 1.0 - smoothstep(-0.002, 0.002, dG);
      float maskB = 1.0 - smoothstep(-0.002, 0.002, dB);

      vec3 cR = mix(bgColor, cardContent(uvR, cardMin, cardMax), maskR);
      vec3 cG = mix(bgColor, cardContent(uvG, cardMin, cardMax), maskG);
      vec3 cB = mix(bgColor, cardContent(uvB, cardMin, cardMax), maskB);

      finalColor = vec3(cR.r, cG.g, cB.b);
    }

    // --- Warm color shift at high velocity ---
    float warmShift = smoothstep(0.6, 1.0, absVel) * 0.3;
    finalColor.r += warmShift * 0.08;
    finalColor.g -= warmShift * 0.02;
    finalColor.b -= warmShift * 0.04;

    // --- Subtle vignette ---
    float vignette = 1.0 - length((uv - 0.5) * 1.5) * 0.3;
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

  const uniforms = useMemo(
    () => ({
      uVelocity: { value: 0 },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
    }),
    []
  )

  useFrame(({ clock }) => {
    const mat = meshRef.current?.material
    if (!mat) return

    const currentOffset = scroll.offset

    // Initialize lastOffset on first frame to avoid velocity spike
    if (lastOffset.current === null) {
      lastOffset.current = currentOffset
    }

    // Compute raw velocity
    const rawVelocity = currentOffset - lastOffset.current
    lastOffset.current = currentOffset

    // Smooth and scale velocity
    const targetVelocity = rawVelocity * 50
    smoothedVelocity.current = THREE.MathUtils.lerp(
      smoothedVelocity.current,
      targetVelocity,
      0.08
    )

    // Clamp to -1..1 range
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
