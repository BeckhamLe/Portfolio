import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useScroll, ScrollControls, Scroll } from '@react-three/drei'
import * as THREE from 'three'

const vertexShader = `
#define PI 3.14159265359

uniform float animateProgress;
uniform vec4 startRect;
uniform vec4 endRect;

varying vec2 vUv;
varying float vLocalProgress;

vec2 rotateLocal(vec2 p, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

void main() {
  vUv = uv;

  float transitionWeight = 1.0 - (pow(uv.x * uv.x, 0.75) + pow(uv.y, 1.5)) / 2.0;
  float localProgress = smoothstep(transitionWeight * 0.3, 0.7 + transitionWeight * 0.3, animateProgress);
  vLocalProgress = localProgress;

  vec2 startPos = startRect.xy + (uv * startRect.zw);
  vec2 endPos = endRect.xy + (uv * endRect.zw);
  vec2 posXY = mix(startPos, endPos, localProgress);

  float width = mix(startRect.z, endRect.z, localProgress);
  posXY.x += mix(width, 0.0, cos(localProgress * PI * 2.0) * 0.5 + 0.5) * 0.1;

  float rot = (smoothstep(0.0, 1.0, localProgress) - localProgress) * -0.5;
  posXY = rotateLocal(posXY, rot);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(posXY, 0.0, 1.0);
}
`

const fragmentShader = `
uniform vec3 tintColor;
uniform float animateProgress;
uniform vec3 color1;
uniform vec3 color2;

varying vec2 vUv;
varying float vLocalProgress;

float roundedCornerMask(vec2 uv, vec2 size, float radius) {
  vec2 q = abs(uv - 0.5) * size - (size * 0.5 - radius);
  return 1.0 - smoothstep(0.0, 2.0 / min(size.x, size.y), length(max(q, 0.0)) - radius);
}

void main() {
  // Gradient background for the panel
  vec3 gradColor = mix(color1, color2, vUv.y + vUv.x * 0.3);

  // Tint fades out as transition progresses
  float tintCurve = 1.0 - smoothstep(0.0, 0.6, vLocalProgress);
  vec3 color = mix(gradColor, gradColor * tintColor, tintCurve);

  // Rounded corners
  float mask = roundedCornerMask(vUv, vec2(200.0, 200.0), 15.0);

  gl_FragColor = vec4(color, mask);
}
`

function TransitionPanel() {
  const meshRef = useRef()
  const scroll = useScroll()
  const { viewport } = useThree()

  const uniforms = useMemo(() => ({
    animateProgress: { value: 0 },
    startRect: { value: new THREE.Vector4(-0.8, -0.3, 1.2, 0.8) },
    endRect: { value: new THREE.Vector4(-2.5, -1.5, 5.0, 3.0) },
    tintColor: { value: new THREE.Color('#ff6b9d') },
    color1: { value: new THREE.Color('#1a0a2e') },
    color2: { value: new THREE.Color('#16213e') },
  }), [])

  useFrame(() => {
    if (!meshRef.current) return

    // Map scroll offset to animation progress
    const progress = scroll.offset
    uniforms.animateProgress.value = THREE.MathUtils.clamp(progress * 2, 0, 1)

    // Scale rects based on viewport
    const aspect = viewport.width / viewport.height
    uniforms.startRect.value.set(
      -0.6 * aspect, -0.2,
      1.0 * aspect, 0.7
    )
    uniforms.endRect.value.set(
      -viewport.width / 2 * 0.9, -viewport.height / 2 * 0.9,
      viewport.width * 0.9, viewport.height * 0.9
    )
  })

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1, 1, 32, 32]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

export default function DancingMeshTransition() {
  return (
    <ScrollControls pages={3} damping={0.15}>
      <TransitionPanel />
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
            Scroll down to see the transition
          </h2>
        </div>
      </Scroll>
    </ScrollControls>
  )
}
