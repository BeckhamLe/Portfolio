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

  // --- Procedural card content: white card with text-like content ---
  vec3 cardContent(vec2 uv, vec2 cardMin, vec2 cardMax) {
    // Normalize UV within card bounds
    vec2 cardUV = (uv - cardMin) / (cardMax - cardMin);

    // White/light gray card background
    vec3 color = vec3(0.97, 0.97, 0.98);

    // Subtle paper texture noise
    float noise = fract(sin(dot(cardUV * 200.0, vec2(12.9898, 78.233))) * 43758.5453);
    color -= noise * 0.015;

    // Header area: accent bar at top (top 12% of card)
    float headerMask = smoothstep(0.88, 0.90, cardUV.y);
    vec3 headerColor = vec3(0.15, 0.35, 0.95); // blue header
    color = mix(color, headerColor, headerMask);

    // "Title" block: dark bar simulating heading text (below header)
    float titleY = smoothstep(0.78, 0.80, cardUV.y) * (1.0 - smoothstep(0.84, 0.86, cardUV.y));
    float titleX = step(0.08, cardUV.x) * step(cardUV.x, 0.55);
    color = mix(color, vec3(0.15, 0.15, 0.18), titleY * titleX * 0.9);

    // "Subtitle" block: lighter gray bar
    float subY = smoothstep(0.72, 0.735, cardUV.y) * (1.0 - smoothstep(0.75, 0.765, cardUV.y));
    float subX = step(0.08, cardUV.x) * step(cardUV.x, 0.70);
    color = mix(color, vec3(0.55, 0.55, 0.58), subY * subX * 0.8);

    // "Body text" lines: multiple thin gray bars simulating paragraphs
    for (int i = 0; i < 8; i++) {
      float lineBase = 0.62 - float(i) * 0.065;
      float lineY = smoothstep(lineBase - 0.008, lineBase, cardUV.y) * (1.0 - smoothstep(lineBase + 0.012, lineBase + 0.02, cardUV.y));
      // Vary line width to look like real text
      float lineWidth = 0.85 - float(i % 3) * 0.15;
      float lineX = step(0.08, cardUV.x) * step(cardUV.x, lineWidth);
      color = mix(color, vec3(0.65, 0.65, 0.68), lineY * lineX * 0.6);
    }

    // Small "button" at bottom
    float btnY = smoothstep(0.08, 0.10, cardUV.y) * (1.0 - smoothstep(0.14, 0.16, cardUV.y));
    float btnX = step(0.08, cardUV.x) * step(cardUV.x, 0.35);
    vec3 btnColor = vec3(0.15, 0.35, 0.95);
    color = mix(color, btnColor, btnY * btnX * 0.9);

    // Card shadow at edges (inner shadow for depth)
    float edgeShadow = smoothstep(0.0, 0.03, cardUV.x) * smoothstep(0.0, 0.03, 1.0 - cardUV.x)
                     * smoothstep(0.0, 0.03, cardUV.y) * smoothstep(0.0, 0.03, 1.0 - cardUV.y);
    color *= 0.95 + 0.05 * edgeShadow;

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

    // Background color (soft dark gray to contrast with white card)
    vec3 bgColor = vec3(0.08, 0.08, 0.12);

    // Card drop shadow (slightly larger than card, blurred)
    float shadowDist = cardSDF(distortedUV, cardCenter + vec2(0.003, -0.005), cardHalf + 0.01, cornerRadius + 0.01);
    float shadowMask = 1.0 - smoothstep(-0.02, 0.02, shadowDist);
    bgColor = mix(bgColor, vec3(0.02, 0.02, 0.04), shadowMask * 0.5);

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
