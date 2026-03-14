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
  #define MAX_STEPS 64
  #define MAX_DIST 10.0
  #define SURF_DIST 0.002

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

  // 3D noise from 2D (fake 3D by combining axes)
  float noise3D(vec3 p) {
    return snoise(p.xy + p.z * 17.3) * 0.5
         + snoise(p.yz + p.x * 31.7) * 0.3
         + snoise(p.xz + p.y * 23.1) * 0.2;
  }

  // Smooth minimum for organic blob merging
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  // --- SDF Scene ---
  // Morphs between a flat card (rounded box) and an organic blob
  float sceneSDF(vec3 p) {
    float t = uTime * 0.5;

    // Blob phase amount (peaks in the middle of progress)
    float blobPhase = sin(uProgress * PI);
    blobPhase = pow(blobPhase, 0.8); // wider peak

    // Flat card phase (strong at start and end)
    float cardPhase = 1.0 - blobPhase;

    // --- Card SDF (rounded box) ---
    vec3 cardSize = vec3(1.2, 0.75, 0.05 + blobPhase * 0.4);
    vec3 d = abs(p) - cardSize;
    float roundness = 0.08;
    float cardDist = length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - roundness;

    // --- Blob SDF (noise-displaced sphere) ---
    float baseRadius = 0.8;
    // Noise displacement for organic feel
    float noiseDisp = noise3D(p * 1.5 + t * 0.3) * 0.35;
    noiseDisp += noise3D(p * 3.0 - t * 0.2) * 0.15;
    float blobDist = length(p) - baseRadius - noiseDisp;

    // Small orbiting blobs
    vec3 orbit1 = vec3(sin(t * 0.7) * 1.2, cos(t * 0.9) * 0.8, sin(t * 0.5) * 0.4);
    float blob2 = length(p - orbit1) - 0.25 - noise3D(p * 2.0 + t) * 0.1;

    vec3 orbit2 = vec3(cos(t * 0.6) * 0.9, sin(t * 0.8) * 1.1, cos(t * 0.4) * 0.5);
    float blob3 = length(p - orbit2) - 0.2 - noise3D(p * 2.5 - t * 0.5) * 0.08;

    // Merge blobs with smooth min
    float blobs = smin(blobDist, blob2, 0.4);
    blobs = smin(blobs, blob3, 0.3);

    // Morph between card and blobs
    return mix(cardDist, blobs, blobPhase);
  }

  // Normal via gradient
  vec3 getNormal(vec3 p) {
    float d = sceneSDF(p);
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(
      sceneSDF(p + e.xyy) - d,
      sceneSDF(p + e.yxy) - d,
      sceneSDF(p + e.yyx) - d
    ));
  }

  // Raymarching
  float raymarch(vec3 ro, vec3 rd) {
    float dist = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
      vec3 p = ro + rd * dist;
      float d = sceneSDF(p);
      dist += d;
      if (d < SURF_DIST || dist > MAX_DIST) break;
    }
    return dist;
  }

  void main() {
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 uv = (vUv - 0.5) * aspect;

    // Camera
    vec2 mouse = (uMouse - 0.5) * 0.5;
    vec3 ro = vec3(mouse.x * 2.0, mouse.y * 1.5, 3.5);
    vec3 target = vec3(0.0);
    vec3 forward = normalize(target - ro);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
    vec3 up = cross(forward, right);
    vec3 rd = normalize(forward + uv.x * right + uv.y * up);

    float d = raymarch(ro, rd);

    // Background gradient
    vec3 bg = mix(vec3(0.02, 0.02, 0.05), vec3(0.04, 0.02, 0.08), vUv.y);

    vec3 color;

    if (d < MAX_DIST) {
      vec3 p = ro + rd * d;
      vec3 n = getNormal(p);

      // Lighting
      vec3 lightDir = normalize(vec3(1.0, 1.5, 2.0));
      float diff = max(dot(n, lightDir), 0.0);
      float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 32.0);

      // AO approximation from step count
      float ao = 1.0 - float(d > 1.0) * 0.3;

      // Fresnel for edge glow
      float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

      // Color based on progress phase
      float blobPhase = pow(sin(uProgress * PI), 0.8);

      // Card color: dark surface
      vec3 cardColor = vec3(0.06, 0.04, 0.1);
      cardColor += diff * vec3(0.08, 0.06, 0.12);
      cardColor += spec * vec3(0.0, 0.3, 0.4) * 0.5;

      // Blob color: iridescent
      vec3 iriBase = vec3(0.05, 0.6, 0.7);
      vec3 iriAccent = vec3(0.7, 0.1, 0.5);
      float iriMix = sin(dot(n, vec3(1.0, 0.5, 0.3)) * 3.0 + uTime) * 0.5 + 0.5;
      vec3 blobColor = mix(iriBase, iriAccent, iriMix);
      blobColor *= diff * 0.6 + 0.4;
      blobColor += spec * vec3(1.0, 0.8, 0.9) * 0.6;

      color = mix(cardColor, blobColor, blobPhase);

      // Fresnel edge glow
      vec3 fresnelColor = mix(vec3(0.0, 0.6, 0.8), vec3(0.8, 0.2, 0.6), blobPhase);
      color += fresnel * fresnelColor * 0.6;

      color *= ao;
    } else {
      color = bg;
    }

    // Subtle vignette
    float vignette = 1.0 - length(uv) * 0.3;
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function LiquidMorph() {
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

    // Auto-cycle: slow 12 second loop
    mat.uniforms.uProgress.value = (t * 0.083) % 1.0

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
