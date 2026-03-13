import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Blob Metaballs — Fullscreen shader that renders organic blobby shapes
 * using a metaball distance function. Blobs follow the mouse with trailing
 * motion. Pure math, no physics engine.
 */

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fragmentShader = `
uniform float time;
uniform vec2 mouse;
uniform vec2 resolution;

varying vec2 vUv;

// Smooth metaball field function
float metaball(vec2 p, vec2 center, float radius) {
  float d = length(p - center);
  return radius * radius / (d * d + 0.001);
}

// Simple 2D noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0) * 2.0;

  // Blob positions — some follow mouse, some orbit
  vec2 b1 = mouse * 0.8;
  vec2 b2 = mouse * 0.5 + vec2(sin(time * 0.7) * 0.3, cos(time * 0.9) * 0.3);
  vec2 b3 = vec2(sin(time * 0.5) * 0.6, cos(time * 0.4) * 0.5);
  vec2 b4 = vec2(cos(time * 0.3) * 0.7, sin(time * 0.6) * 0.4);
  vec2 b5 = mouse * 0.3 + vec2(cos(time * 0.8) * 0.4, sin(time * 0.5) * 0.5);
  vec2 b6 = vec2(sin(time * 0.4 + 2.0) * 0.5, cos(time * 0.7 + 1.0) * 0.6);

  // Compute metaball field
  float field = 0.0;
  field += metaball(uv, b1, 0.35);
  field += metaball(uv, b2, 0.28);
  field += metaball(uv, b3, 0.25);
  field += metaball(uv, b4, 0.22);
  field += metaball(uv, b5, 0.20);
  field += metaball(uv, b6, 0.18);

  // Threshold to create the blob boundary
  float threshold = 1.0;

  // Color layers
  vec3 bgColor = vec3(0.02, 0.02, 0.05);
  vec3 glowColor = vec3(0.05, 0.1, 0.25);
  vec3 edgeColor = vec3(0.0, 0.96, 0.83);   // cyan edge
  vec3 innerColor1 = vec3(0.08, 0.04, 0.2);  // deep purple inside
  vec3 innerColor2 = vec3(0.15, 0.05, 0.3);  // lighter purple

  vec3 color = bgColor;

  // Outer glow
  float glowField = smoothstep(0.3, 1.0, field);
  color = mix(color, glowColor, glowField * 0.5);

  // Edge highlight
  float edge = smoothstep(threshold - 0.15, threshold, field) - smoothstep(threshold, threshold + 0.15, field);
  color = mix(color, edgeColor, edge * 1.5);

  // Inner fill with noise texture
  if (field > threshold) {
    float n = noise(uv * 8.0 + time * 0.3) * 0.3;
    vec3 inner = mix(innerColor1, innerColor2, n + (field - threshold) * 0.5);

    // Iridescent shift based on position
    inner += vec3(
      sin(uv.x * 3.0 + time * 0.5) * 0.05,
      sin(uv.y * 3.0 + time * 0.4) * 0.03,
      cos(uv.x * 2.0 + uv.y * 2.0 + time * 0.3) * 0.08
    );

    color = inner;
  }

  // Subtle vignette
  float vig = 1.0 - length(vUv - 0.5) * 0.8;
  color *= vig;

  gl_FragColor = vec4(color, 1.0);
}
`

export default function BlobMetaballs() {
  const meshRef = useRef()
  const { viewport } = useThree()
  const smoothMouse = useRef(new THREE.Vector2(0, 0))

  const uniforms = useMemo(() => ({
    time: { value: 0 },
    mouse: { value: new THREE.Vector2(0, 0) },
    resolution: { value: new THREE.Vector2(1, 1) },
  }), [])

  useFrame(({ clock, pointer }) => {
    uniforms.time.value = clock.elapsedTime

    // Smooth mouse following
    smoothMouse.current.x += (pointer.x - smoothMouse.current.x) * 0.05
    smoothMouse.current.y += (pointer.y - smoothMouse.current.y) * 0.05
    uniforms.mouse.value.set(smoothMouse.current.x * viewport.aspect, smoothMouse.current.y)
    uniforms.resolution.value.set(viewport.width, viewport.height)
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
