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

  #define NUM_POINTS 18

  vec2 getPoint(int i, float t) {
    float fi = float(i);
    float angle1 = fi * 0.39 + t * (0.15 + fi * 0.01);
    float angle2 = fi * 0.73 + t * (0.12 + fi * 0.008);
    return vec2(
      sin(angle1) * (0.3 + 0.15 * sin(fi * 1.7 + t * 0.1)),
      cos(angle2) * (0.3 + 0.15 * cos(fi * 2.3 + t * 0.13))
    );
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

    float minDist1 = 1e10;
    float minDist2 = 1e10;
    int closestId = 0;

    for (int i = 0; i < NUM_POINTS; i++) {
      vec2 pt = getPoint(i, uTime);

      // Mouse interaction: attract/repel nearby seed points
      vec2 toMouse = uMouse - pt;
      float mouseDist = length(toMouse);
      float influence = smoothstep(0.5, 0.0, mouseDist) * 0.15;
      pt += toMouse * influence;

      float d = distance(uv, pt);
      if (d < minDist1) {
        minDist2 = minDist1;
        minDist1 = d;
        closestId = i;
      } else if (d < minDist2) {
        minDist2 = d;
      }
    }

    // Distance to cell edge (difference between closest and second closest)
    float edge = minDist2 - minDist1;

    // Edge glow — cyan/teal
    vec3 edgeColor = vec3(0.0, 0.85, 0.9);
    float edgeGlow = exp(-edge * 18.0) * 1.2;
    float edgeLine = smoothstep(0.02, 0.0, edge) * 0.6;

    // Subtle purple cell fill based on cell id
    float fi = float(closestId);
    float cellHue = fract(fi * 0.137 + 0.3);
    vec3 fillColor = mix(
      vec3(0.08, 0.02, 0.12),
      vec3(0.12, 0.03, 0.18),
      cellHue
    );

    // Darken cells further from center for depth
    float vignette = 1.0 - smoothstep(0.3, 0.9, length(uv));

    // Background
    vec3 bg = vec3(0.039, 0.039, 0.039); // #0a0a0a

    // Compose
    vec3 color = bg;
    color = mix(color, fillColor, 0.6 * vignette);
    color += edgeColor * edgeGlow * vignette;
    color += edgeColor * edgeLine;

    // Subtle inner distance shading per cell
    float innerGrad = smoothstep(0.0, 0.25, minDist1);
    color += vec3(0.03, 0.01, 0.05) * (1.0 - innerGrad) * vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function VoronoiCells() {
  const meshRef = useRef()
  const mouseTarget = useRef(new THREE.Vector2(0, 0))
  const mouseCurrent = useRef(new THREE.Vector2(0, 0))
  const { viewport } = useThree()

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    }),
    []
  )

  useFrame((state) => {
    const { clock, pointer, size } = state

    uniforms.uTime.value = clock.getElapsedTime()

    // Convert pointer from NDC to aspect-corrected coords matching shader space
    const aspect = size.width / size.height
    const minDim = Math.min(size.width, size.height)
    mouseTarget.current.set(
      (pointer.x * size.width * 0.5) / minDim,
      (pointer.y * size.height * 0.5) / minDim
    )

    // Smooth mouse following
    mouseCurrent.current.lerp(mouseTarget.current, 0.05)
    uniforms.uMouse.value.copy(mouseCurrent.current)

    uniforms.uResolution.value.set(size.width, size.height)
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
