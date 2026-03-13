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

  // Hash for pseudo-random
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Simplex noise for distortion pattern
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

  // Layer 1: dark atmospheric gradient
  vec3 layer1(vec2 uv) {
    vec3 dark1 = vec3(0.02, 0.02, 0.06);
    vec3 dark2 = vec3(0.06, 0.02, 0.08);
    float n = snoise(uv * 4.0 + uTime * 0.05) * 0.04;
    return mix(dark1, dark2, uv.y + uv.x * 0.3) + n;
  }

  // Layer 2: vibrant gradient
  vec3 layer2(vec2 uv) {
    vec3 cyan = vec3(0.05, 0.7, 0.8);
    vec3 purple = vec3(0.5, 0.1, 0.7);
    vec3 pink = vec3(0.9, 0.2, 0.5);
    float grad = uv.y + uv.x * 0.4 + snoise(uv * 3.0 + uTime * 0.08) * 0.15;
    vec3 col = mix(cyan, purple, grad);
    col = mix(col, pink, smoothstep(0.7, 1.0, grad) * 0.4);
    return col;
  }

  void main() {
    vec2 uv = vUv;
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 p = (uv - 0.5) * aspect;

    // Mouse influence on distortion center
    vec2 mouse = (uMouse - 0.5) * aspect;
    float mouseDist = length(p - mouse);
    float mouseInfluence = smoothstep(0.5, 0.0, mouseDist);

    // Transition sweep: diagonal wipe with noise variation
    float wipePos = uv.x * 0.7 + uv.y * 0.3 + snoise(p * 2.0) * 0.08;
    float prog = uProgress * 1.4 - 0.2; // expand range so transition fully covers
    float transitionZone = smoothstep(prog - 0.3, prog, wipePos) - smoothstep(prog, prog + 0.3, wipePos);

    // Boost distortion near mouse
    transitionZone = max(transitionZone, mouseInfluence * 0.3 * sin(uProgress * 3.14159));

    // Distortion amount
    float distortAmount = transitionZone * 0.08;

    // Barrel distortion in transition zone
    vec2 center = uv - 0.5;
    float r2 = dot(center, center);
    vec2 barrel = center * (1.0 + distortAmount * r2 * 4.0) + 0.5;

    // Ripple distortion
    float ripple = sin(length(p - mouse) * 20.0 - uTime * 3.0) * transitionZone * 0.015;
    vec2 rippleUV = uv + vec2(ripple, ripple * 0.7);

    // Chromatic aberration — split R/G/B in transition zone
    float caAmount = transitionZone * 0.02;
    vec2 caDir = normalize(center + 0.001) * caAmount;

    vec2 uvR = mix(uv, barrel, transitionZone) + caDir + vec2(ripple);
    vec2 uvG = mix(uv, barrel, transitionZone) + vec2(ripple * 0.5);
    vec2 uvB = mix(uv, barrel, transitionZone) - caDir + vec2(ripple * -0.3);

    // Sample both layers with offset UVs
    float blend = smoothstep(prog - 0.15, prog + 0.15, wipePos);

    float r = mix(layer2(uvR).r, layer1(uvR).r, blend);
    float g = mix(layer2(uvG).g, layer1(uvG).g, blend);
    float b = mix(layer2(uvB).b, layer1(uvB).b, blend);

    vec3 color = vec3(r, g, b);

    // Edge glow in transition zone
    float edgeGlow = transitionZone * transitionZone * 0.6;
    vec3 glowColor = mix(vec3(0.0, 0.8, 1.0), vec3(0.8, 0.2, 0.6), sin(uTime * 1.5 + wipePos * 6.0) * 0.5 + 0.5);
    color += edgeGlow * glowColor;

    // Subtle wave lines in transition zone
    float scanline = sin(uv.y * uResolution.y * 0.5) * 0.5 + 0.5;
    color -= transitionZone * scanline * 0.05;

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function DistortionWipe() {
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
    mat.uniforms.uProgress.value = (Math.sin(clock.getElapsedTime() * 0.4) + 1) * 0.5

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
