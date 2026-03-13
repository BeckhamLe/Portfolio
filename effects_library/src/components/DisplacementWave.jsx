import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Displacement Wave — A flat grid surface that ripples with waves emanating
 * from the mouse position. Multiple waves stack and decay over time,
 * creating an organic water-like surface. Colors shift based on wave height.
 */

const vertexShader = `
uniform float time;
uniform vec3 waveOrigins[5];
uniform float waveTimes[5];
uniform int waveCount;

varying float vHeight;
varying vec2 vUv;
varying vec3 vNormal;

void main() {
  vUv = uv;
  vec3 pos = position;
  float totalDisplacement = 0.0;

  for (int i = 0; i < 5; i++) {
    if (i >= waveCount) break;

    float age = time - waveTimes[i];
    if (age < 0.0 || age > 4.0) continue;

    float dist = distance(pos.xy, waveOrigins[i].xy);
    float waveRadius = age * 3.0;
    float ringWidth = 1.5;

    // Ring wave that expands outward
    float ring = exp(-pow(dist - waveRadius, 2.0) / ringWidth);
    float amplitude = 0.4 * exp(-age * 0.8); // decay over time
    totalDisplacement += sin(dist * 4.0 - age * 6.0) * ring * amplitude;
  }

  // Ambient gentle waves
  totalDisplacement += sin(pos.x * 1.5 + time * 0.5) * cos(pos.y * 1.5 + time * 0.3) * 0.05;

  pos.z += totalDisplacement;
  vHeight = totalDisplacement;

  // Approximate normal for lighting
  vNormal = normalize(normal + vec3(0.0, 0.0, totalDisplacement * 2.0));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

const fragmentShader = `
uniform float time;

varying float vHeight;
varying vec2 vUv;
varying vec3 vNormal;

void main() {
  // Color based on displacement height
  vec3 deepColor = vec3(0.02, 0.02, 0.08);   // deep dark blue
  vec3 midColor = vec3(0.05, 0.15, 0.4);      // ocean blue
  vec3 highColor = vec3(0.0, 0.96, 0.83);     // cyan/teal
  vec3 peakColor = vec3(0.95, 0.3, 0.7);      // pink peaks

  float h = vHeight;
  vec3 color = deepColor;
  color = mix(color, midColor, smoothstep(-0.05, 0.0, h));
  color = mix(color, highColor, smoothstep(0.0, 0.15, h));
  color = mix(color, peakColor, smoothstep(0.15, 0.35, h));

  // Simple lighting
  vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));
  float diffuse = max(dot(vNormal, lightDir), 0.0);
  color *= 0.5 + diffuse * 0.7;

  // Edge glow
  float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float edgeFade = smoothstep(0.0, 0.1, edgeDist);
  color *= edgeFade;

  // Subtle grid lines
  vec2 grid = abs(fract(vUv * 40.0) - 0.5);
  float gridLine = 1.0 - smoothstep(0.45, 0.48, min(grid.x, grid.y));
  color += gridLine * vec3(0.03, 0.06, 0.1);

  gl_FragColor = vec4(color, 1.0);
}
`

export default function DisplacementWave() {
  const meshRef = useRef()
  const { camera, pointer } = useThree()
  const waves = useRef([])
  const lastClickTime = useRef(0)

  const uniforms = useMemo(() => ({
    time: { value: 0 },
    waveOrigins: { value: Array(5).fill(null).map(() => new THREE.Vector3()) },
    waveTimes: { value: new Float32Array(5) },
    waveCount: { value: 0 },
  }), [])

  useFrame(({ clock }) => {
    uniforms.time.value = clock.elapsedTime

    // Continuously spawn waves at mouse position
    const vec = new THREE.Vector3(pointer.x, pointer.y, 0).unproject(camera)
    const dir = vec.sub(camera.position).normalize()
    const dist = -camera.position.z / dir.z
    const wp = camera.position.clone().add(dir.multiplyScalar(dist))

    // Spawn a new wave every 0.3s at mouse position
    if (clock.elapsedTime - lastClickTime.current > 0.3) {
      lastClickTime.current = clock.elapsedTime
      waves.current.push({
        origin: new THREE.Vector3(wp.x, wp.y, 0),
        time: clock.elapsedTime,
      })
      // Keep only last 5 waves
      if (waves.current.length > 5) waves.current.shift()

      // Update uniforms
      waves.current.forEach((w, i) => {
        uniforms.waveOrigins.value[i].copy(w.origin)
        uniforms.waveTimes.value[i] = w.time
      })
      uniforms.waveCount.value = waves.current.length
    }

    // Slow rotation
    if (meshRef.current) {
      meshRef.current.rotation.x = -Math.PI * 0.35 + Math.sin(clock.elapsedTime * 0.1) * 0.05
    }
  })

  return (
    <group>
      <mesh ref={meshRef} rotation={[-Math.PI * 0.35, 0, 0]}>
        <planeGeometry args={[10, 10, 128, 128]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
