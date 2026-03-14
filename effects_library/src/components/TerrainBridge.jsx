import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useScroll, ScrollControls, Scroll } from '@react-three/drei'
import * as THREE from 'three'

const terrainVertexShader = /* glsl */ `
  #define PI 3.14159265359

  uniform float uTime;

  varying vec2 vUv;
  varying float vHeight;
  varying vec3 vWorldPos;

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

  float fbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
      val += amp * snoise(p * freq);
      freq *= 2.0;
      amp *= 0.5;
    }
    return val;
  }

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Terrain height from FBM noise
    // position.x runs along the bridge, position.z across
    vec2 noiseCoord = vec2(pos.x * 0.3 + uTime * 0.02, pos.z * 0.4);
    float height = fbm(noiseCoord) * 2.0;
    height += fbm(noiseCoord * 2.5) * 0.5;

    // Taper height to zero at both ends (islands are flat)
    // position.x ranges from -halfLength to halfLength
    float islandFalloff = smoothstep(0.0, 0.25, abs(uv.x - 0.5) * 2.0);
    // Also taper at the very edges so the island is flat
    float flatIslandA = smoothstep(0.15, 0.0, uv.x); // flat at x=0
    float flatIslandB = smoothstep(0.85, 1.0, uv.x); // flat at x=1
    float islandFlat = max(flatIslandA, flatIslandB);

    height *= islandFalloff;
    height *= (1.0 - islandFlat);

    // Slight dip at the edges of islands
    float islandEdge = smoothstep(0.12, 0.18, uv.x) * smoothstep(0.88, 0.82, uv.x);
    height *= mix(0.3, 1.0, islandEdge);

    pos.y += height;

    vHeight = height;
    vWorldPos = pos;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const terrainFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uProgress;

  varying vec2 vUv;
  varying float vHeight;
  varying vec3 vWorldPos;

  void main() {
    // Height-based coloring
    vec3 deep = vec3(0.02, 0.04, 0.08);    // low areas: dark blue
    vec3 mid = vec3(0.0, 0.25, 0.35);       // mid: teal
    vec3 high = vec3(0.05, 0.65, 0.75);     // peaks: bright cyan
    vec3 peak = vec3(0.8, 0.3, 0.6);        // very high: pink accent

    float h = clamp(vHeight / 2.5, 0.0, 1.0);
    vec3 terrainColor = mix(deep, mid, smoothstep(0.0, 0.3, h));
    terrainColor = mix(terrainColor, high, smoothstep(0.3, 0.65, h));
    terrainColor = mix(terrainColor, peak, smoothstep(0.75, 1.0, h));

    // Grid lines for the "islands" (flat areas)
    float islandA = smoothstep(0.12, 0.0, vUv.x);
    float islandB = smoothstep(0.88, 1.0, vUv.x);
    float onIsland = max(islandA, islandB);

    if (onIsland > 0.5) {
      // Island surface: dark with subtle grid
      vec3 islandColor = vec3(0.04, 0.03, 0.08);
      float gx = smoothstep(0.47, 0.5, abs(fract(vWorldPos.x * 2.0) - 0.5));
      float gz = smoothstep(0.47, 0.5, abs(fract(vWorldPos.z * 2.0) - 0.5));
      islandColor += vec3(0.0, 0.2, 0.25) * (gx + gz) * 0.15;

      // Which island are we on?
      if (islandA > 0.5) {
        // Island A: teal accent
        islandColor += vec3(0.0, 0.15, 0.2) * 0.3;
      } else {
        // Island B: purple accent
        islandColor += vec3(0.15, 0.05, 0.2) * 0.3;
      }

      terrainColor = mix(terrainColor, islandColor, onIsland);
    }

    // Edge wireframe effect (subtle)
    float edgeX = smoothstep(0.0, 0.01, abs(fract(vWorldPos.x * 0.5) - 0.5));
    float edgeZ = smoothstep(0.0, 0.01, abs(fract(vWorldPos.z * 0.5) - 0.5));
    float wireframe = 1.0 - min(edgeX, edgeZ);
    terrainColor += vec3(0.0, 0.3, 0.4) * wireframe * 0.08;

    // Fog based on distance (simple depth fade)
    float fogFactor = smoothstep(0.0, 1.0, abs(vUv.x - uProgress));
    terrainColor = mix(terrainColor, vec3(0.02, 0.02, 0.04), fogFactor * 0.4);

    gl_FragColor = vec4(terrainColor, 1.0);
  }
`

function TerrainScene() {
  const terrainRef = useRef()
  const cameraRef = useRef()
  const scroll = useScroll()
  const { camera } = useThree()

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
    }),
    []
  )

  // Terrain dimensions
  const terrainLength = 30
  const terrainWidth = 8

  useFrame(({ clock }) => {
    const mat = terrainRef.current?.material
    if (!mat) return

    const t = clock.getElapsedTime()
    const progress = THREE.MathUtils.clamp(scroll.offset * 1.5, 0, 1)

    mat.uniforms.uTime.value = t
    mat.uniforms.uProgress.value = progress

    // Camera path: spline from island A to island B
    const halfLen = terrainLength / 2

    // Camera position along the bridge
    const camX = THREE.MathUtils.lerp(-halfLen + 2, halfLen - 2, progress)

    // Height: higher in the middle of the journey, lower at islands
    const midFactor = Math.sin(progress * Math.PI)
    const camY = 2.0 + midFactor * 4.0

    // Slight banking / lateral sway
    const sway = Math.sin(progress * Math.PI * 3) * 0.8
    const camZ = sway

    camera.position.set(camX, camY, camZ)

    // Look slightly ahead
    const lookAheadX = THREE.MathUtils.lerp(-halfLen + 4, halfLen, progress)
    const lookAheadY = 0.5 + midFactor * 1.0
    camera.lookAt(lookAheadX, lookAheadY, 0)

    // Slight tilt for drama
    camera.rotation.z = Math.sin(progress * Math.PI * 2) * 0.03
  })

  return (
    <mesh
      ref={terrainRef}
      rotation={[0, 0, 0]}
      position={[0, -1, 0]}
    >
      <planeGeometry args={[terrainLength, terrainWidth, 200, 60]} />
      <shaderMaterial
        vertexShader={terrainVertexShader}
        fragmentShader={terrainFragmentShader}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export default function TerrainBridge() {
  return (
    <ScrollControls pages={4} damping={0.2}>
      <TerrainScene />
      <Scroll html>
        <div style={{
          position: 'absolute',
          top: '10vh',
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          pointerEvents: 'none',
        }}>
          <h2 style={{ fontSize: '1.5rem', opacity: 0.7, fontWeight: 300 }}>
            Scroll to fly across the terrain bridge
          </h2>
        </div>
      </Scroll>
    </ScrollControls>
  )
}
