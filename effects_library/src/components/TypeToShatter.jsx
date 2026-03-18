import { useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Html } from '@react-three/drei'

const MAX_CRACKS = 20
const PLANE_SIZE = 8

const vertexShader = /* glsl */ `
  #define PI 3.14159265359
  #define MAX_CRACKS 20

  uniform float uTime;
  uniform vec2 uCrackPos[MAX_CRACKS];
  uniform float uCrackTime[MAX_CRACKS];
  uniform float uCrackState[MAX_CRACKS]; // 1.0 = active, 0.0 = settled, -1.0 = healing
  uniform int uCrackCount;

  varying float vDisplacement;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vec3 pos = position;
    float totalDisp = 0.0;

    vec2 worldXY = pos.xy;

    for (int i = 0; i < MAX_CRACKS; i++) {
      if (i >= uCrackCount) break;

      vec2 cp = uCrackPos[i];
      float ct = uCrackTime[i];
      float state = uCrackState[i];
      float age = uTime - ct;
      float dist = distance(worldXY, cp);

      // Crack shape: sharp peak at center, falls off with distance
      float crackDepth = 0.4 / (1.0 + dist * dist * 6.0);

      if (state > 0.5) {
        // Active: expanding ring settles into permanent crack
        float settle = clamp(age / 1.0, 0.0, 1.0);
        float ringRadius = age * 5.0;
        float ring = exp(-(dist - ringRadius) * (dist - ringRadius) / 1.5);
        float ringAmp = 0.3 * exp(-age * 2.0);
        totalDisp += mix(ring * ringAmp, crackDepth, settle);
      } else if (state < -0.5) {
        // Healing: fade out over 0.5s
        float healT = clamp(age / 0.5, 0.0, 1.0);
        totalDisp += crackDepth * (1.0 - healT);
      } else {
        // Settled: permanent
        totalDisp += crackDepth;
      }
    }

    pos.z -= totalDisp;
    vDisplacement = totalDisp;

    // Compute normal from displacement for lighting
    vNormal = normalize(vec3(0.0, 0.0, 1.0));

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  #define PI 3.14159265359
  #define MAX_CRACKS 20
  precision highp float;

  uniform float uTime;
  uniform vec2 uCrackPos[MAX_CRACKS];
  uniform int uCrackCount;

  varying float vDisplacement;
  varying vec2 vUv;

  void main() {
    // Base: light metallic surface (silver-blue) so it's clearly visible
    vec3 baseColor = mix(
      vec3(0.55, 0.58, 0.65),
      vec3(0.45, 0.48, 0.55),
      vUv.y
    );

    // Specular highlight
    vec2 center = vUv - 0.5;
    float spec = exp(-dot(center, center) * 4.0) * 0.2;
    baseColor += vec3(spec);

    // Subtle grid pattern on surface
    float gx = smoothstep(0.48, 0.5, abs(fract(vUv.x * 16.0) - 0.5));
    float gy = smoothstep(0.48, 0.5, abs(fract(vUv.y * 16.0) - 0.5));
    baseColor -= (gx + gy) * 0.03;

    // Crack glow: bright cyan near crack centers
    float crackGlow = 0.0;
    vec2 worldXY = (vUv - 0.5) * vec2(1.0) * 8.0; // approximate world position from UV
    for (int i = 0; i < MAX_CRACKS; i++) {
      if (i >= uCrackCount) break;
      float dist = distance(worldXY, uCrackPos[i]);
      crackGlow += 0.2 / (1.0 + dist * dist * 15.0);
    }
    vec3 glowColor = vec3(0.0, 0.85, 1.0);
    baseColor += glowColor * crackGlow * 0.8;

    // Damage: displaced areas shift warm
    float damage = smoothstep(0.05, 0.4, vDisplacement);
    vec3 damageColor = vec3(1.0, 0.4, 0.1);
    baseColor = mix(baseColor, damageColor, damage * 0.5);

    // Darken edges
    float edge = smoothstep(0.0, 0.05, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
    baseColor *= edge;

    gl_FragColor = vec4(baseColor, 1.0);
  }
`

export default function TypeToShatter() {
  const meshRef = useRef()
  const cracksRef = useRef([])
  const timeRef = useRef(0)

  // Create uniform values that persist across frames
  const crackPosArray = useMemo(() => {
    const arr = []
    for (let i = 0; i < MAX_CRACKS; i++) arr.push(new THREE.Vector2(0, 0))
    return arr
  }, [])
  const crackTimeArray = useMemo(() => new Array(MAX_CRACKS).fill(0), [])
  const crackStateArray = useMemo(() => new Array(MAX_CRACKS).fill(0), [])

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uCrackPos: { value: crackPosArray },
    uCrackTime: { value: crackTimeArray },
    uCrackState: { value: crackStateArray },
    uCrackCount: { value: 0 },
  }), [])

  // Keyboard handler
  useEffect(() => {
    function onKeyDown(e) {
      if (e.repeat) return

      const time = timeRef.current
      const cracks = cracksRef.current

      if (e.key === 'Backspace') {
        e.preventDefault()
        // Heal last active/settled crack
        for (let i = cracks.length - 1; i >= 0; i--) {
          if (cracks[i].state === 'active' || cracks[i].state === 'settled') {
            cracks[i].state = 'healing'
            cracks[i].healStart = time
            break
          }
        }
        return
      }

      // Only printable characters
      if (e.key.length !== 1) return

      // Random position on surface (world coords: -3.2 to 3.2 on each axis)
      const x = (Math.random() - 0.5) * PLANE_SIZE * 0.8
      const y = (Math.random() - 0.5) * PLANE_SIZE * 0.8

      // Cap active cracks
      const live = cracks.filter(c => c.state !== 'removed')
      if (live.length >= MAX_CRACKS) {
        for (let i = 0; i < cracks.length; i++) {
          if (cracks[i].state === 'settled' || cracks[i].state === 'active') {
            cracks[i].state = 'removed'
            break
          }
        }
      }

      cracks.push({ x, y, time, state: 'active', healStart: 0 })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime()
    timeRef.current = time
    uniforms.uTime.value = time

    const cracks = cracksRef.current

    // Update states
    for (const crack of cracks) {
      if (crack.state === 'active' && time - crack.time > 1.0) {
        crack.state = 'settled'
      }
      if (crack.state === 'healing' && time - crack.healStart > 0.5) {
        crack.state = 'removed'
      }
    }

    // Remove dead cracks
    cracksRef.current = cracks.filter(c => c.state !== 'removed')

    // Sync to uniforms
    const live = cracksRef.current
    const count = Math.min(live.length, MAX_CRACKS)

    for (let i = 0; i < MAX_CRACKS; i++) {
      if (i < count) {
        const c = live[i]
        crackPosArray[i].set(c.x, c.y)

        if (c.state === 'healing') {
          crackTimeArray[i] = c.healStart
          crackStateArray[i] = -1.0
        } else if (c.state === 'active') {
          crackTimeArray[i] = c.time
          crackStateArray[i] = 1.0
        } else {
          crackTimeArray[i] = c.time
          crackStateArray[i] = 0.0
        }
      } else {
        crackPosArray[i].set(0, 0)
        crackTimeArray[i] = 0
        crackStateArray[i] = 0
      }
    }
    uniforms.uCrackCount.value = count

    // Gentle tilt
    if (meshRef.current) {
      meshRef.current.rotation.x = -0.5 + Math.sin(time * 0.15) * 0.03
    }
  })

  return (
    <>
      <color attach="background" args={['#0a0a12']} />
      <mesh ref={meshRef} rotation={[-0.5, 0, 0]}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE, 64, 64]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Html fullscreen style={{ pointerEvents: 'none' }}>
        <div style={{
          position: 'fixed',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.35)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 13,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          pointerEvents: 'none',
        }}>
          Type to crack the surface &nbsp;|&nbsp; Backspace to heal
        </div>
      </Html>
    </>
  )
}
