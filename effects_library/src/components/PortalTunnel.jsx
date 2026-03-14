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

  uniform float uTime;
  uniform float uProgress;
  uniform vec2 uMouse;
  uniform vec2 uResolution;

  varying vec2 vUv;

  // --- Noise ---
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * aspect;
    float dist = length(p);
    float angle = atan(p.y, p.x);

    // --- Phase 1: 0→0.3 — Content with growing circular hole ---
    // --- Phase 2: 0.3→0.7 — Tunnel zoom ---
    // --- Phase 3: 0.7→1.0 — Exit into new content ---

    float phase1 = smoothstep(0.0, 0.3, uProgress);    // 0→1 during phase 1
    float phase2 = smoothstep(0.3, 0.7, uProgress);    // 0→1 during phase 2
    float phase3 = smoothstep(0.7, 1.0, uProgress);    // 0→1 during phase 3

    // --- Content Layer A (before) ---
    vec3 dark1 = vec3(0.05, 0.03, 0.1);
    vec3 dark2 = vec3(0.02, 0.12, 0.18);
    vec3 contentA = mix(dark1, dark2, uv.y + uv.x * 0.2);
    // Subtle grid
    float gx = smoothstep(0.47, 0.5, abs(fract(p.x * 5.0) - 0.5));
    float gy = smoothstep(0.47, 0.5, abs(fract(p.y * 5.0) - 0.5));
    contentA += vec3(0.0, 0.2, 0.25) * (gx + gy) * 0.1;

    // --- Content Layer B (after) ---
    vec3 purple = vec3(0.35, 0.05, 0.5);
    vec3 cyan = vec3(0.05, 0.65, 0.8);
    vec3 contentB = mix(purple, cyan, uv.y * 0.7 + uv.x * 0.4);
    float streaks = sin(p.x * 10.0 + p.y * 6.0) * 0.5 + 0.5;
    contentB += vec3(0.06, 0.02, 0.1) * streaks * 0.2;

    // --- Portal hole ---
    float holeRadius = phase1 * 0.5; // grows from 0 to 0.5
    float holeMask = smoothstep(holeRadius, holeRadius - 0.02, dist);
    float holeEdge = smoothstep(holeRadius - 0.02, holeRadius - 0.05, dist)
                   - smoothstep(holeRadius + 0.02, holeRadius, dist);

    // --- Tunnel effect ---
    // Radial UV warp: fake depth by warping UVs inward
    float tunnelDepth = phase2 * 8.0;
    float tunnelDist = dist + 0.001;
    float tunnelR = 1.0 / (tunnelDist + 0.3) + tunnelDepth;
    float tunnelTheta = angle / PI;

    // Tunnel texture coordinates
    vec2 tunnelUv = vec2(tunnelTheta, tunnelR - uTime * 2.0);

    // Noise on tunnel walls
    float wallNoise = snoise(tunnelUv * vec2(3.0, 1.5)) * 0.5 + 0.5;
    float wallDetail = snoise(tunnelUv * vec2(8.0, 4.0)) * 0.3;

    // Tunnel wall color
    vec3 tunnelColor = vec3(0.02, 0.02, 0.04);
    tunnelColor += vec3(0.0, 0.4, 0.5) * wallNoise * 0.4;
    tunnelColor += vec3(0.3, 0.05, 0.4) * wallDetail * 0.3;

    // Speed lines
    float speedLines = pow(abs(sin(angle * 20.0 + tunnelR * 2.0)), 12.0);
    tunnelColor += vec3(0.15, 0.6, 0.7) * speedLines * phase2 * 0.3;

    // Chromatic aberration during tunnel
    float chromaStrength = phase2 * (1.0 - phase3) * 0.03;
    vec2 chromaOffset = normalize(p + 0.001) * chromaStrength;
    // We simulate chroma by tinting edges
    float chromaR = length(p - chromaOffset);
    float chromaB = length(p + chromaOffset);
    vec3 chromaTint = vec3(
      smoothstep(0.4, 0.0, chromaR) * 0.3,
      0.0,
      smoothstep(0.4, 0.0, chromaB) * 0.3
    );
    tunnelColor += chromaTint;

    // Vignette darkens edges during tunnel
    float tunnelVignette = 1.0 - smoothstep(0.0, 0.8, dist) * 0.7 * phase2;

    // --- Compose phases ---
    vec3 color;

    if (uProgress < 0.3) {
      // Phase 1: content A with growing hole
      color = contentA;
      // Hole reveals darkness (tunnel entrance)
      float insideHole = 1.0 - holeMask;
      color = mix(color, vec3(0.01, 0.01, 0.02), insideHole);
      // Glowing edge around hole
      color += vec3(0.0, 0.8, 1.0) * holeEdge * 1.5;
    } else if (uProgress < 0.7) {
      // Phase 2: tunnel zoom
      float tunnelBlend = smoothstep(0.3, 0.4, uProgress);
      color = mix(contentA, tunnelColor, tunnelBlend);
      color *= tunnelVignette;
      // Center glow (light at end of tunnel)
      float centerGlow = smoothstep(0.3, 0.0, dist) * phase2;
      color += vec3(0.1, 0.5, 0.6) * centerGlow * 0.5;
    } else {
      // Phase 3: exit into content B
      float exitBlend = phase3;
      // Expand from center
      float exitRadius = exitBlend * 1.5;
      float exitMask = smoothstep(exitRadius, exitRadius - 0.1, dist);
      color = mix(tunnelColor * tunnelVignette, contentB, 1.0 - exitMask);
      // Exit glow
      float exitEdge = smoothstep(exitRadius - 0.1, exitRadius - 0.15, dist)
                      - smoothstep(exitRadius + 0.02, exitRadius, dist);
      color += vec3(0.0, 0.7, 0.9) * exitEdge * 1.0;
    }

    // Mouse subtle light
    vec2 mouse = (uMouse - 0.5) * aspect;
    float mouseDist = length(p - mouse);
    float mouseGlow = smoothstep(0.3, 0.0, mouseDist) * 0.05;
    color += vec3(0.2, 0.6, 0.8) * mouseGlow;

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function PortalTunnel() {
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
    // Auto-cycle: 8 second loop
    mat.uniforms.uProgress.value = (t * 0.125) % 1.0

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
