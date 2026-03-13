import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useScroll, ScrollControls, Scroll } from '@react-three/drei'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  #define PI 3.14159265359

  uniform float uProgress;
  uniform float uTime;

  varying vec2 vUv;
  varying float vFold;
  varying float vSide;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Fold line sweeps from left to right based on progress
    float foldX = mix(-1.2, 1.2, uProgress);
    float distToFold = pos.x - foldX;

    // Vertices behind the fold line curl over
    float foldAmount = 0.0;
    if (distToFold < 0.0) {
      // How far behind the fold this vertex is
      float behind = -distToFold;
      float maxBehind = 2.4;
      float normalizedBehind = clamp(behind / maxBehind, 0.0, 1.0);

      // Page curl: arc up and over
      float curlAngle = normalizedBehind * PI;
      float curlRadius = 0.6 + behind * 0.1;

      // Lift and fold over
      pos.z = sin(curlAngle) * curlRadius;
      pos.x = foldX - cos(curlAngle) * curlRadius + curlRadius;

      // Add subtle wave along the fold line
      pos.z += sin(pos.y * 4.0 + uTime * 2.0) * 0.03 * (1.0 - normalizedBehind);

      foldAmount = normalizedBehind;
    }

    // Subtle wave on the unfolded side
    float waveDist = max(distToFold, 0.0);
    pos.z += sin(waveDist * 8.0 + uTime * 1.5) * 0.02 * exp(-waveDist * 2.0);

    vFold = foldAmount;
    vSide = distToFold < 0.0 ? 1.0 : 0.0;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uProgress;
  uniform float uTime;

  varying vec2 vUv;
  varying float vFold;
  varying float vSide;

  void main() {
    // Layer 1 (revealed): vibrant gradient
    vec3 cyan = vec3(0.05, 0.75, 0.85);
    vec3 purple = vec3(0.45, 0.1, 0.65);
    vec3 teal = vec3(0.0, 0.5, 0.55);
    float grad1 = vUv.y + vUv.x * 0.3;
    vec3 revealed = mix(teal, cyan, grad1);
    revealed = mix(revealed, purple, smoothstep(0.6, 1.0, grad1) * 0.5);

    // Layer 2 (initial): dark surface
    vec3 dark1 = vec3(0.06, 0.04, 0.1);
    vec3 dark2 = vec3(0.1, 0.06, 0.14);
    vec3 initial = mix(dark1, dark2, vUv.y + vUv.x * 0.2);

    // Folded side shows the "back" of the page — slightly different shade
    vec3 backSide = mix(vec3(0.08, 0.06, 0.12), vec3(0.12, 0.08, 0.18), vUv.y);

    // Choose color based on fold state
    vec3 color;
    if (vSide > 0.5) {
      // This vertex is curled — show back of page with lighting
      float shadow = 1.0 - vFold * 0.4;
      color = backSide * shadow;

      // Highlight at the curl peak
      float peakHighlight = pow(sin(vFold * PI), 4.0) * 0.3;
      color += vec3(0.1, 0.8, 0.9) * peakHighlight;
    } else {
      // Revealed underneath
      color = revealed;

      // Subtle shadow near the fold line
      float foldX = mix(-1.2, 1.2, uProgress);
      float distToFold = (vUv.x * 2.0 - 1.0) * 1.2 - foldX; // approximate
      float shadow = smoothstep(0.0, 0.3, distToFold);
      color *= 0.7 + 0.3 * shadow;
    }

    // Fold edge glow
    float edgeGlow = vSide * pow(1.0 - vFold, 8.0) * 0.8;
    color += vec3(0.0, 0.9, 1.0) * edgeGlow;

    // Pink accent at the curl crest
    float crest = vSide * pow(sin(vFold * PI), 6.0) * 0.4;
    color += vec3(1.0, 0.3, 0.55) * crest;

    gl_FragColor = vec4(color, 1.0);
  }
`

function MorphPanel() {
  const meshRef = useRef()
  const scroll = useScroll()
  const { viewport } = useThree()

  const uniforms = useMemo(
    () => ({
      uProgress: { value: 0 },
      uTime: { value: 0 },
    }),
    []
  )

  useFrame(({ clock }) => {
    const mat = meshRef.current?.material
    if (!mat) return
    mat.uniforms.uProgress.value = THREE.MathUtils.clamp(scroll.offset * 2, 0, 1)
    mat.uniforms.uTime.value = clock.getElapsedTime()
  })

  // Size the plane to roughly fill the viewport
  const width = Math.min(viewport.width * 0.85, 8)
  const height = Math.min(viewport.height * 0.85, 6)

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[width, height, 128, 128]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export default function MeshMorph() {
  return (
    <ScrollControls pages={3} damping={0.15}>
      <MorphPanel />
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
            Scroll down to see the mesh fold
          </h2>
        </div>
      </Scroll>
    </ScrollControls>
  )
}
