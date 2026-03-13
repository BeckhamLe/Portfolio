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

  uniform float time;
  uniform vec2 mouse;
  uniform vec2 resolution;

  varying vec2 vUv;

  vec3 palette(float t) {
    // dark purple -> cyan/teal -> bright pink/white -> black for inside
    vec3 a = vec3(0.02, 0.01, 0.06);  // deep purple base
    vec3 b = vec3(0.7, 0.8, 0.9);
    vec3 c = vec3(0.5, 0.6, 0.7);
    vec3 d = vec3(0.0, 0.15, 0.2);
    return a + b * cos(6.28318 * (c * t + d));
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);

    // Auto-zoom: ping-pong scale over time
    float zoomCycle = mod(time * 0.08, 2.0);
    float zoomT = zoomCycle < 1.0 ? zoomCycle : 2.0 - zoomCycle;
    float scale = mix(2.0, 0.15, zoomT * zoomT); // quadratic easing for smoother feel

    uv *= scale;

    // Julia set constant from mouse position
    vec2 c = mouse;

    vec2 z = uv;

    const int MAX_ITER = 256;
    float iter = 0.0;
    bool escaped = false;

    for (int i = 0; i < MAX_ITER; i++) {
      // z = z^2 + c
      float x = z.x * z.x - z.y * z.y + c.x;
      float y = 2.0 * z.x * z.y + c.y;
      z = vec2(x, y);

      float d = dot(z, z);
      if (d > 256.0) {
        // Smooth iteration count
        float si = float(i) - log2(log2(d)) + 4.0;
        iter = si;
        escaped = true;
        break;
      }
    }

    vec3 color;
    if (!escaped) {
      // Inside the set — near-black
      color = vec3(0.039, 0.039, 0.039); // #0a0a0a
    } else {
      float t = iter / 80.0; // normalize for palette cycling

      vec3 base = palette(t);

      // Blend toward white/pink at edges (low iteration = escaped fast = edge)
      float edgeFactor = exp(-iter * 0.04);
      vec3 edgeColor = vec3(1.0, 0.85, 0.95); // bright pink-white
      color = mix(base, edgeColor, edgeFactor * 0.7);

      // Push deep iterations toward dark purple
      float deepFactor = smoothstep(0.0, 60.0, iter);
      vec3 deepColor = vec3(0.08, 0.02, 0.18); // dark purple
      color = mix(color, deepColor, deepFactor * 0.4);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function FractalZoom() {
  const meshRef = useRef()
  const mouseTarget = useRef(new THREE.Vector2(-0.7269, 0.1889))
  const mouseCurrent = useRef(new THREE.Vector2(-0.7269, 0.1889))
  const { size } = useThree()

  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      mouse: { value: new THREE.Vector2(-0.7269, 0.1889) },
      resolution: { value: new THREE.Vector2(size.width, size.height) },
    }),
    []
  )

  useFrame(({ clock, pointer }) => {
    if (!meshRef.current) return

    const mat = meshRef.current.material

    // Map pointer (-1..1) to c range (-1..1)
    mouseTarget.current.set(pointer.x, pointer.y)

    // Smooth lerp
    mouseCurrent.current.lerp(mouseTarget.current, 0.05)

    mat.uniforms.time.value = clock.getElapsedTime()
    mat.uniforms.mouse.value.copy(mouseCurrent.current)
    mat.uniforms.resolution.value.set(size.width, size.height)
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
