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

  uniform float uTime;
  uniform float uProgress;
  uniform vec2 uMouse;
  uniform vec2 uResolution;

  varying vec2 vUv;

  // Hash functions
  float hash(float n) { return fract(sin(n) * 43758.5453123); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // Simplex noise for base pattern
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

  // Base procedural pattern — geometric shapes and gradients
  vec3 basePattern(vec2 uv) {
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 p = (uv - 0.5) * aspect;

    // Gradient background
    vec3 bg1 = vec3(0.05, 0.02, 0.1);
    vec3 bg2 = vec3(0.02, 0.06, 0.12);
    vec3 color = mix(bg1, bg2, uv.y);

    // Noise-based organic shapes
    float n1 = snoise(p * 3.0 + uTime * 0.1);
    float n2 = snoise(p * 6.0 - uTime * 0.08);

    // Teal blobs
    float blob = smoothstep(0.2, 0.5, n1);
    color = mix(color, vec3(0.0, 0.6, 0.65), blob * 0.6);

    // Purple streaks
    float streak = smoothstep(0.3, 0.6, n2) * smoothstep(0.7, 0.3, n2);
    color = mix(color, vec3(0.5, 0.1, 0.7), streak * 0.5);

    // Bright cyan accents
    float accent = smoothstep(0.55, 0.65, n1 * 0.5 + n2 * 0.5);
    color = mix(color, vec3(0.1, 0.9, 1.0), accent * 0.4);

    // Geometric grid lines
    vec2 grid = fract(uv * 12.0);
    float lines = step(0.96, grid.x) + step(0.96, grid.y);
    color = mix(color, vec3(0.15, 0.1, 0.2), lines * 0.3);

    return color;
  }

  void main() {
    vec2 uv = vUv;
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 p = (uv - 0.5) * aspect;

    // Mouse influence
    vec2 mouse = (uMouse - 0.5) * aspect;
    float mouseDist = length(p - mouse);
    float mouseInfluence = smoothstep(0.4, 0.0, mouseDist);

    // Glitch intensity: progress + mouse boost
    float intensity = uProgress + mouseInfluence * 0.3;
    intensity = clamp(intensity, 0.0, 1.0);

    // Block displacement — shift rectangular regions
    float blockSize = 0.05 + hash(floor(uTime * 2.0)) * 0.1;
    vec2 blockId = floor(uv / blockSize);
    float blockRand = hash2(blockId + floor(uTime * 3.0));
    vec2 blockOffset = vec2(0.0);
    if (blockRand > 1.0 - intensity * 0.4) {
      blockOffset.x = (hash(blockRand * 17.0) - 0.5) * intensity * 0.15;
      blockOffset.y = (hash(blockRand * 31.0) - 0.5) * intensity * 0.05;
    }

    // Pixel row sorting — offset UV.x based on row hash and intensity
    float rowId = floor(uv.y * uResolution.y);
    float rowRand = hash(rowId + floor(uTime * 4.0) * 0.1);
    float sortOffset = 0.0;
    if (rowRand > 1.0 - intensity * 0.6) {
      // This row gets sorted/shifted
      float sortAmount = (hash(rowId * 7.0 + floor(uTime * 2.0)) - 0.3) * intensity;
      sortOffset = sortAmount * 0.2;
    }

    // Apply displacements
    vec2 glitchedUV = uv + blockOffset;
    glitchedUV.x += sortOffset;

    // Chromatic aberration — stronger with intensity
    float caAmount = intensity * 0.015;
    float caAngle = hash(floor(uTime * 5.0)) * 6.28;
    vec2 caDir = vec2(cos(caAngle), sin(caAngle)) * caAmount;

    vec3 colorR = basePattern(glitchedUV + caDir);
    vec3 colorG = basePattern(glitchedUV);
    vec3 colorB = basePattern(glitchedUV - caDir);

    vec3 color = vec3(colorR.r, colorG.g, colorB.b);

    // Scanlines
    float scanline = sin(uv.y * uResolution.y * 1.0) * 0.5 + 0.5;
    scanline = pow(scanline, 1.0 + intensity * 4.0);
    color *= 0.85 + 0.15 * scanline;

    // Horizontal glitch lines — bright colored bars
    float glitchLine = step(0.97, hash(floor(uv.y * 200.0) + floor(uTime * 8.0)));
    if (glitchLine > 0.5 && intensity > 0.3) {
      vec3 lineColor = mix(vec3(0.0, 1.0, 0.9), vec3(1.0, 0.2, 0.5),
                           hash(floor(uv.y * 200.0) + 0.5));
      color = mix(color, lineColor, intensity * 0.7);
    }

    // VHS-style color bleed on high intensity
    if (intensity > 0.5) {
      float bleed = sin(uv.y * 100.0 + uTime * 10.0) * (intensity - 0.5) * 0.1;
      color.r += bleed;
      color.b -= bleed * 0.5;
    }

    // Darken edges slightly
    float vignette = 1.0 - length(p) * 0.25;
    color *= vignette;

    // Random color flash near mouse
    if (mouseInfluence > 0.5 && hash(floor(uTime * 12.0)) > 0.7) {
      color = mix(color, vec3(1.0, 0.3, 0.6), (mouseInfluence - 0.5) * 0.4);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function PixelSortGlitch() {
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

    mat.uniforms.uTime.value = clock.getElapsedTime()
    mat.uniforms.uProgress.value = (Math.sin(clock.getElapsedTime() * 0.5) + 1) * 0.5

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
