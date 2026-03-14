import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
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

  #define PI 3.14159265359
  #define NUM_SHARDS 24

  uniform float uTime;
  uniform float uProgress;
  uniform vec2 uMouse;
  uniform vec2 uResolution;

  varying vec2 vUv;

  // --- Hash functions for deterministic per-shard randomness ---
  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  vec2 hash2(float n) {
    return vec2(
      fract(sin(n * 127.1) * 43758.5453),
      fract(sin(n * 269.5) * 18347.6512)
    );
  }

  // Rotation matrix
  mat2 rot2(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
  }

  // Original (rest) seed positions — spread across a card-shaped region
  vec2 getOriginalSeed(int i) {
    float fi = float(i);
    vec2 r = hash2(fi * 13.7 + 5.3);
    // Spread across card region: x in [-0.7, 0.7], y in [-0.4, 0.4]
    return (r - 0.5) * vec2(1.4, 0.8);
  }

  // Per-shard animation: returns (displacedSeed, rotationAngle)
  // Edge shards move first, center last
  vec2 getDisplacedSeed(int i, float prog, out float shardRotation) {
    vec2 seed = getOriginalSeed(i);
    float fi = float(i);

    // Distance from center → stagger (edge first)
    float distFromCenter = length(seed) / 0.8; // normalize to ~0-1
    float delay = 1.0 - clamp(distFromCenter, 0.0, 1.0);

    // Staggered progress
    float staggered = smoothstep(delay * 0.4, delay * 0.4 + 0.6, prog);
    staggered = staggered * staggered * (3.0 - 2.0 * staggered); // ease

    // Direction: outward from center with some random deviation
    vec2 dir = normalize(seed + vec2(0.001));
    float angleDeviation = (hash(fi * 91.3) - 0.5) * 0.8;
    dir = rot2(angleDeviation) * dir;

    // Translation
    float spread = 0.6 + hash(fi * 37.7) * 0.6;
    vec2 offset = dir * staggered * spread;

    // Rotation
    shardRotation = (hash(fi * 53.1) - 0.5) * PI * 0.6 * staggered;

    // The displaced seed center
    vec2 displaced = seed + offset;
    // Apply rotation around the displaced center (rotation of the shard piece)
    return displaced;
  }

  // --- Content layer A (dark, structured) ---
  vec3 contentA(vec2 p) {
    vec2 uv01 = p / vec2(1.4, 0.8) + 0.5;
    vec3 dark1 = vec3(0.05, 0.04, 0.1);
    vec3 dark2 = vec3(0.02, 0.12, 0.18);
    vec3 col = mix(dark1, dark2, uv01.y + uv01.x * 0.3);

    // Subtle grid
    float gx = smoothstep(0.47, 0.5, abs(fract(p.x * 6.0) - 0.5));
    float gy = smoothstep(0.47, 0.5, abs(fract(p.y * 6.0) - 0.5));
    col += vec3(0.0, 0.25, 0.3) * (gx + gy) * 0.12;

    // Corner accent
    float corner = smoothstep(0.6, 0.0, length(p - vec2(-0.5, 0.3)));
    col += vec3(0.0, 0.4, 0.5) * corner * 0.15;

    return col;
  }

  // --- Content layer B (vibrant gradient) ---
  vec3 contentB(vec2 p) {
    vec2 uv01 = p / vec2(1.4, 0.8) + 0.5;
    vec3 purple = vec3(0.4, 0.05, 0.55);
    vec3 cyan = vec3(0.05, 0.7, 0.85);
    vec3 pink = vec3(0.9, 0.2, 0.5);
    vec3 col = mix(purple, cyan, uv01.y * 0.7 + uv01.x * 0.5);
    col = mix(col, pink, smoothstep(0.7, 1.0, uv01.x + uv01.y * 0.3) * 0.4);

    // Diagonal streaks
    float streak = sin(p.x * 12.0 + p.y * 8.0) * 0.5 + 0.5;
    col += vec3(0.08, 0.03, 0.12) * streak * 0.25;

    return col;
  }

  void main() {
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 p = (vUv - 0.5) * aspect;

    // Card region for clipping
    vec2 cardHalf = vec2(0.7, 0.4);

    // Progress: 0→0.5 = shatter, 0.5→1 = reassemble
    float shatterProg = clamp(uProgress * 2.0, 0.0, 1.0);
    float reformProg = clamp((uProgress - 0.5) * 2.0, 0.0, 1.0);
    float netProg = shatterProg - reformProg;

    // Find closest displaced shard
    float minDist = 1e10;
    float secondDist = 1e10;
    int closestId = 0;
    vec2 closestDisplaced = vec2(0.0);
    float closestRotation = 0.0;

    for (int i = 0; i < NUM_SHARDS; i++) {
      float shardRot;
      vec2 displaced = getDisplacedSeed(i, netProg, shardRot);

      float d = distance(p, displaced);
      if (d < minDist) {
        secondDist = minDist;
        minDist = d;
        closestId = i;
        closestDisplaced = displaced;
        closestRotation = shardRot;
      } else if (d < secondDist) {
        secondDist = d;
      }
    }

    // Edge detection between shards
    float edgeDist = secondDist - minDist;
    float edge = smoothstep(0.0, 0.015, edgeDist);

    // Map screen pixel back to original card space
    vec2 origSeed = getOriginalSeed(closestId);

    // Inverse transform: undo rotation, then undo translation
    vec2 localP = p - closestDisplaced;         // relative to displaced center
    localP = rot2(-closestRotation) * localP;    // undo rotation
    vec2 origP = localP + origSeed;              // back to original card space

    // Check if original position is within card bounds
    bool inCard = abs(origP.x) < cardHalf.x && abs(origP.y) < cardHalf.y;

    // Content: blend between states A and B at midpoint
    float contentBlend = smoothstep(0.35, 0.65, uProgress);
    vec3 content = mix(contentA(origP), contentB(origP), contentBlend);

    // Shard edge styling
    float edgeGlow = (1.0 - edge) * netProg;
    content *= mix(1.0, 0.6, 1.0 - edge); // darken shard borders
    content += vec3(0.0, 0.85, 1.0) * edgeGlow * 0.6; // cyan glow on edges when shattered

    // Slight depth shadow on shards when displaced
    float depthShadow = 1.0 - netProg * 0.15;
    content *= depthShadow;

    // Background
    vec3 bg = vec3(0.02, 0.02, 0.04);

    // Mouse subtle highlight on nearest shard
    vec2 mouse = (uMouse - 0.5) * aspect;
    float mouseDist = length(p - mouse);
    float mouseHighlight = smoothstep(0.3, 0.0, mouseDist) * 0.08 * netProg;
    content += vec3(0.3, 0.8, 1.0) * mouseHighlight;

    // Final composite
    vec3 color = inCard ? content : bg;

    // Soft card border when not shattered (rounded rect feel)
    if (netProg < 0.01) {
      float borderDist = max(abs(origP.x) - cardHalf.x + 0.02, abs(origP.y) - cardHalf.y + 0.02);
      float borderAlpha = smoothstep(0.0, 0.02, borderDist);
      color = mix(color, bg, borderAlpha);
    }

    // Vignette
    float vignette = 1.0 - length(p) * 0.2;
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function CardShatter() {
  const meshRef = useRef()
  const mouseTarget = useRef(new THREE.Vector2(0.5, 0.5))
  const mouseCurrent = useRef(new THREE.Vector2(0.5, 0.5))
  const { size } = useThree()

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
    }),
    []
  )

  useFrame(({ clock, pointer }) => {
    const mat = meshRef.current?.material
    if (!mat) return

    const t = clock.getElapsedTime()
    mat.uniforms.uTime.value = t

    // Auto-cycle progress: slow shatter then reform
    const cycle = t * 0.25
    const saw = cycle - Math.floor(cycle) // 0→1 sawtooth
    // Ease: slow start, fast middle, slow end
    mat.uniforms.uProgress.value = saw

    // Smooth mouse
    mouseTarget.current.set(pointer.x * 0.5 + 0.5, pointer.y * 0.5 + 0.5)
    mouseCurrent.current.lerp(mouseTarget.current, 0.05)
    mat.uniforms.uMouse.value.copy(mouseCurrent.current)
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
