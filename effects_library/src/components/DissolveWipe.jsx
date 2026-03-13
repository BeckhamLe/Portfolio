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

  // Simplex noise
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

  // FBM noise for richer dissolve pattern
  float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
      value += amp * snoise(p * freq + uTime * 0.1 * float(i));
      freq *= 2.0;
      amp *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = vUv;
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 p = (uv - 0.5) * aspect;

    // Mouse influence — dissolve faster near cursor
    vec2 mouse = (uMouse - 0.5) * aspect;
    float mouseDist = length(p - mouse);
    float mouseInfluence = smoothstep(0.4, 0.0, mouseDist) * 0.15;

    // Noise threshold map
    float noise = fbm(p * 3.0) * 0.5 + 0.5; // remap to 0-1

    // Progress with mouse local boost
    float prog = uProgress + mouseInfluence;

    // Dissolve: compare noise to progress threshold
    float edgeWidth = 0.08;
    float dissolve = smoothstep(prog - edgeWidth, prog, noise);
    float edge = smoothstep(prog - edgeWidth, prog - edgeWidth * 0.5, noise)
               - smoothstep(prog - edgeWidth * 0.3, prog, noise);

    // Layer 1: dark background with subtle pattern
    vec3 dark = vec3(0.02, 0.02, 0.05);
    float darkPattern = snoise(p * 8.0 + uTime * 0.05) * 0.03;
    vec3 layer1 = dark + darkPattern;

    // Layer 2: vibrant gradient
    vec3 cyan = vec3(0.1, 0.85, 0.9);
    vec3 purple = vec3(0.45, 0.1, 0.65);
    vec3 teal = vec3(0.0, 0.55, 0.6);
    float gradMix = uv.y + uv.x * 0.3 + snoise(p * 2.0 + uTime * 0.08) * 0.2;
    vec3 layer2 = mix(teal, purple, gradMix);
    layer2 = mix(layer2, cyan, smoothstep(0.6, 0.9, gradMix) * 0.5);

    // Blend layers based on dissolve
    vec3 color = mix(layer2, layer1, dissolve);

    // Glowing edge
    vec3 edgeColor = mix(vec3(0.0, 0.9, 1.0), vec3(1.0, 0.3, 0.6), sin(uTime * 2.0 + noise * 6.0) * 0.5 + 0.5);
    color += edge * edgeColor * 1.8;

    // Subtle vignette
    float vignette = 1.0 - length(p) * 0.3;
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function DissolveWipe() {
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
    // Ping-pong progress
    mat.uniforms.uProgress.value = (Math.sin(clock.getElapsedTime() * 0.5) + 1) * 0.5

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
