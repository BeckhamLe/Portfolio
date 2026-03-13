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
  uniform vec2 uMouse;
  uniform vec2 uResolution;

  varying vec2 vUv;

  // --- Simplex-style value noise ---
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(
      0.211324865405187,   // (3.0-sqrt(3.0))/6.0
      0.366025403784439,   // 0.5*(sqrt(3.0)-1.0)
     -0.577350269189626,   // -1.0 + 2.0 * C.x
      0.024390243902439    // 1.0 / 41.0
    );
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
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

  // --- Curl noise: perpendicular gradient of scalar noise field ---
  vec2 curlNoise(vec2 p) {
    float eps = 0.001;
    float n1 = snoise(vec2(p.x, p.y + eps));
    float n2 = snoise(vec2(p.x, p.y - eps));
    float a = (n1 - n2) / (2.0 * eps);
    float n3 = snoise(vec2(p.x + eps, p.y));
    float n4 = snoise(vec2(p.x - eps, p.y));
    float b = (n3 - n4) / (2.0 * eps);
    return vec2(a, -b);
  }

  // --- FBM curl noise with 4 octaves ---
  vec2 fbmCurl(vec2 p, float t) {
    vec2 curl = vec2(0.0);
    float amp = 1.0;
    float freq = 1.0;
    float totalAmp = 0.0;

    for (int i = 0; i < 4; i++) {
      vec2 offset = vec2(t * 0.15 * float(i + 1), t * 0.1 * float(i + 1));
      curl += amp * curlNoise(p * freq + offset);
      totalAmp += amp;
      amp *= 0.5;
      freq *= 2.2;
    }

    return curl / totalAmp;
  }

  void main() {
    vec2 uv = vUv;
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 p = (uv - 0.5) * aspect;

    float t = uTime * 0.3;

    // Mouse disturbance — swirl faster near cursor
    vec2 mouse = (uMouse - 0.5) * aspect;
    float mouseDist = length(p - mouse);
    float mouseInfluence = smoothstep(0.5, 0.0, mouseDist) * 2.0;

    // Warp coordinates with curl noise + mouse vortex
    vec2 curl = fbmCurl(p * 2.0, t);

    // Add rotational vortex around mouse
    vec2 toMouse = p - mouse;
    vec2 vortex = vec2(-toMouse.y, toMouse.x) * mouseInfluence / (mouseDist + 0.1);

    vec2 warped = p + curl * 0.3 + vortex * 0.04;

    // Sample layered noise at warped position for wisp density
    float n1 = snoise(warped * 3.0 + t * 0.4);
    float n2 = snoise(warped * 6.0 - t * 0.3);
    float n3 = snoise(warped * 12.0 + t * 0.6);
    float n4 = snoise(warped * 24.0 - t * 0.2);

    float density = n1 * 0.5 + n2 * 0.25 + n3 * 0.15 + n4 * 0.1;
    density = density * 0.5 + 0.5; // remap to 0..1

    // Shape wisps — sharpen into streaky filaments
    float wisps = smoothstep(0.35, 0.65, density);
    wisps = pow(wisps, 1.5);

    // Boost near mouse
    wisps *= 1.0 + mouseInfluence * 0.5;

    // Color: cyan/teal base with purple hints
    vec3 cyan = vec3(0.1, 0.85, 0.9);
    vec3 teal = vec3(0.0, 0.6, 0.65);
    vec3 purple = vec3(0.5, 0.15, 0.7);
    vec3 dark = vec3(0.02, 0.02, 0.05);

    // Use noise layers to blend colors
    float colorMix = smoothstep(0.3, 0.7, n1 * 0.5 + 0.5);
    vec3 wispColor = mix(teal, cyan, colorMix);
    wispColor = mix(wispColor, purple, smoothstep(0.5, 0.8, n2 * 0.5 + 0.5) * 0.35);

    // Slight glow at higher density
    float glow = pow(wisps, 3.0) * 0.4;
    wispColor += glow;

    // Final composite
    vec3 color = mix(dark, wispColor, wisps * 0.8);

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function CurlNoiseFlow() {
  const meshRef = useRef()
  const mouseTarget = useRef(new THREE.Vector2(0.5, 0.5))
  const mouseCurrent = useRef(new THREE.Vector2(0.5, 0.5))
  const { size } = useThree()

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
    }),
    []
  )

  useFrame(({ clock, pointer }) => {
    const mat = meshRef.current?.material
    if (!mat) return

    mat.uniforms.uTime.value = clock.getElapsedTime()

    // Map pointer from [-1,1] to [0,1]
    mouseTarget.current.set(pointer.x * 0.5 + 0.5, pointer.y * 0.5 + 0.5)

    // Smooth lerp
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
