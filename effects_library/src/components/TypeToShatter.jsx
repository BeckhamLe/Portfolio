import { useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Html } from '@react-three/drei'

/**
 * Type to Shatter — A pristine dark surface that cracks with each keystroke.
 * Damage accumulates as cracks persist. Backspace heals the last crack with
 * a reverse ripple animation. Crack state stored in JS arrays passed as
 * uniforms (no FBOs). Max 20 active cracks.
 */

const MAX_CRACKS = 20
const PLANE_SIZE = 8
const CRACK_SETTLE_TIME = 1.0
const HEAL_DURATION = 0.5

const vertexShader = /* glsl */ `
  #define MAX_CRACKS 20

  uniform float uTime;
  uniform vec2 uCrackPositions[MAX_CRACKS];
  uniform float uCrackTimes[MAX_CRACKS];
  uniform float uCrackActives[MAX_CRACKS];
  uniform int uCrackCount;
  uniform float uPlaneSize;
  uniform float uBaseDisplacements[MAX_CRACKS];

  varying float vDisplacement;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec3 pos = position;
    float totalDisplacement = 0.0;

    // Map UV to world-space coords on the plane
    vec2 worldXY = pos.xy;

    for (int i = 0; i < MAX_CRACKS; i++) {
      if (i >= uCrackCount) break;

      vec2 crackPos = uCrackPositions[i];
      float crackTime = uCrackTimes[i];
      float active = uCrackActives[i];
      float baseDis = uBaseDisplacements[i];

      float age = uTime - crackTime;
      float dist = distance(worldXY, crackPos);

      // Permanent crack displacement: sharp falloff from crack center
      float crackStrength = 0.35;
      float permanentDisp = crackStrength / (1.0 + dist * dist * 8.0);

      if (active > 0.5) {
        // Active crack — animate in over CRACK_SETTLE_TIME
        // Expanding ring that settles into permanent displacement
        float settleT = clamp(age / 1.0, 0.0, 1.0); // 1.0 = CRACK_SETTLE_TIME
        float ringRadius = age * 4.0;
        float ringWidth = 1.5;
        float ring = exp(-pow(dist - ringRadius, 2.0) / ringWidth);
        float ringAmplitude = 0.25 * exp(-age * 1.5);

        // Blend from ring animation to permanent crack
        float animDisp = ring * ringAmplitude;
        float disp = mix(animDisp, permanentDisp, settleT);
        totalDisplacement += disp;
      } else if (active < -0.5) {
        // Healing crack — reverse animation
        float healAge = uTime - crackTime; // crackTime is reset when healing starts
        float healT = clamp(healAge / 0.5, 0.0, 1.0); // 0.5 = HEAL_DURATION

        // Reverse ripple: start from permanent, fade to zero
        float reverseRingRadius = healAge * 5.0;
        float reverseRing = exp(-pow(dist - reverseRingRadius, 2.0) / 1.0);
        float reverseAmplitude = 0.15 * (1.0 - healT);

        float disp = permanentDisp * (1.0 - healT) + reverseRing * reverseAmplitude;
        totalDisplacement += disp;
      } else {
        // Fully settled crack
        totalDisplacement += permanentDisp + baseDis;
      }
    }

    // Displace downward (negative Z)
    pos.z -= totalDisplacement;
    vDisplacement = totalDisplacement;
    vWorldPos = pos;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  #define MAX_CRACKS 20

  uniform float uTime;
  uniform vec2 uCrackPositions[MAX_CRACKS];
  uniform float uCrackTimes[MAX_CRACKS];
  uniform float uCrackActives[MAX_CRACKS];
  uniform int uCrackCount;
  uniform float uPlaneSize;

  varying float vDisplacement;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    // Base color: dark metallic blue-gray
    vec3 baseColor1 = vec3(0.04, 0.05, 0.08);
    vec3 baseColor2 = vec3(0.06, 0.07, 0.12);
    vec3 baseColor = mix(baseColor1, baseColor2, vUv.y * 0.8 + vUv.x * 0.2);

    // Subtle specular highlight in pristine areas
    vec2 center = vUv - 0.5;
    float specular = exp(-dot(center, center) * 6.0) * 0.06;
    baseColor += vec3(specular * 0.6, specular * 0.7, specular);

    // Compute displacement gradient for crack edge detection
    float gradient = 0.0;
    vec2 worldXY = vWorldPos.xy;

    for (int i = 0; i < MAX_CRACKS; i++) {
      if (i >= uCrackCount) break;
      float active = uCrackActives[i];
      if (active < -0.5) {
        // Healing — fade the crack visuals
        float healAge = uTime - uCrackTimes[i];
        float healT = clamp(healAge / 0.5, 0.0, 1.0);
        if (healT >= 1.0) continue;

        float dist = distance(worldXY, uCrackPositions[i]);
        float g = 0.35 * 16.0 * dist / pow(1.0 + dist * dist * 8.0, 2.0);
        gradient += g * (1.0 - healT);
      } else {
        float dist = distance(worldXY, uCrackPositions[i]);
        // Derivative of crackStrength / (1 + d^2 * 8) with respect to d
        float g = 0.35 * 16.0 * dist / pow(1.0 + dist * dist * 8.0, 2.0);

        // For active cracks, fade in the gradient
        if (active > 0.5) {
          float age = uTime - uCrackTimes[i];
          float settleT = clamp(age / 1.0, 0.0, 1.0);
          gradient += g * settleT;
        } else {
          gradient += g;
        }
      }
    }

    // Crack edge glow: bright cyan/white where gradient is steep
    float edgeIntensity = smoothstep(0.02, 0.15, gradient);
    vec3 crackGlow = mix(vec3(0.0, 0.8, 1.0), vec3(1.0, 1.0, 1.0), edgeIntensity * 0.5);
    baseColor += crackGlow * edgeIntensity * 0.8;

    // Damage coloring: high displacement shifts toward warm orange/red
    float damageT = smoothstep(0.05, 0.35, vDisplacement);
    vec3 damageColor = mix(vec3(0.8, 0.3, 0.05), vec3(1.0, 0.15, 0.05), damageT);
    baseColor = mix(baseColor, damageColor, damageT * 0.6);

    // Subtle glow at crack centers
    float crackProximity = 0.0;
    for (int i = 0; i < MAX_CRACKS; i++) {
      if (i >= uCrackCount) break;
      float active = uCrackActives[i];
      if (active < -0.5) continue;
      float dist = distance(worldXY, uCrackPositions[i]);
      crackProximity += 0.15 / (1.0 + dist * dist * 20.0);
    }
    baseColor += vec3(0.0, 0.5, 0.7) * crackProximity;

    // Edge fade
    float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float edgeFade = smoothstep(0.0, 0.05, edgeDist);
    baseColor *= edgeFade;

    gl_FragColor = vec4(baseColor, 1.0);
  }
`

export default function TypeToShatter() {
  const meshRef = useRef()
  const cracksRef = useRef([]) // { x, y, time, active: 'active' | 'healing' | 'settled' }
  const healingCracksRef = useRef([]) // cracks being healed, tracked separately for cleanup
  const startTimeRef = useRef(null)

  const uniforms = useMemo(() => {
    // Pre-create vec2 array for crack positions
    const crackPositions = []
    for (let i = 0; i < MAX_CRACKS; i++) {
      crackPositions.push(new THREE.Vector2(0, 0))
    }
    // Use regular arrays for float uniforms (Float32Array can cause issues with uniform arrays)
    const crackTimes = new Array(MAX_CRACKS).fill(0)
    const crackActives = new Array(MAX_CRACKS).fill(0)
    const baseDisplacements = new Array(MAX_CRACKS).fill(0)

    return {
      uTime: { value: 0 },
      uCrackPositions: { value: crackPositions },
      uCrackTimes: { value: crackTimes },
      uCrackActives: { value: crackActives },
      uCrackCount: { value: 0 },
      uPlaneSize: { value: PLANE_SIZE },
      uBaseDisplacements: { value: baseDisplacements },
    }
  }, [])

  const handleKeyDown = useCallback((e) => {
    // Ignore held keys
    if (e.repeat) return

    const cracks = cracksRef.current
    const time = uniforms.uTime.value

    if (e.key === 'Backspace') {
      e.preventDefault()

      // Find the last active or settled crack and heal it
      for (let i = cracks.length - 1; i >= 0; i--) {
        if (cracks[i].state === 'active' || cracks[i].state === 'settled') {
          cracks[i].state = 'healing'
          cracks[i].healStart = time
          break
        }
      }
      return
    }

    // Only respond to printable characters
    if (e.key.length !== 1) return

    // Random position on the surface (in world-space coordinates of the plane)
    const halfSize = PLANE_SIZE / 2
    const x = (Math.random() - 0.5) * PLANE_SIZE * 0.8
    const y = (Math.random() - 0.5) * PLANE_SIZE * 0.8

    // If we're at max, bake the oldest settled crack and free the slot
    const activeCracks = cracks.filter(c => c.state !== 'removed')
    if (activeCracks.length >= MAX_CRACKS) {
      // Remove the oldest non-healing crack
      for (let i = 0; i < cracks.length; i++) {
        if (cracks[i].state === 'settled' || cracks[i].state === 'active') {
          cracks[i].state = 'removed'
          break
        }
      }
    }

    cracks.push({
      x,
      y,
      time,
      state: 'active', // 'active' | 'settled' | 'healing' | 'removed'
      healStart: 0,
    })
  }, [uniforms])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useFrame(({ clock }) => {
    if (startTimeRef.current === null) {
      startTimeRef.current = clock.elapsedTime
    }
    const time = clock.elapsedTime - startTimeRef.current
    uniforms.uTime.value = time

    const cracks = cracksRef.current

    // Update crack states
    for (let i = 0; i < cracks.length; i++) {
      const crack = cracks[i]
      if (crack.state === 'active') {
        const age = time - crack.time
        if (age > CRACK_SETTLE_TIME) {
          crack.state = 'settled'
        }
      } else if (crack.state === 'healing') {
        const healAge = time - crack.healStart
        if (healAge > HEAL_DURATION) {
          crack.state = 'removed'
        }
      }
    }

    // Clean up removed cracks
    cracksRef.current = cracks.filter(c => c.state !== 'removed')

    // Update uniforms from crack state
    const liveCracks = cracksRef.current
    const count = Math.min(liveCracks.length, MAX_CRACKS)

    // Build new arrays each frame for clean uniform updates
    const positions = uniforms.uCrackPositions.value
    const times = uniforms.uCrackTimes.value
    const actives = uniforms.uCrackActives.value
    const baseDis = uniforms.uBaseDisplacements.value

    for (let i = 0; i < MAX_CRACKS; i++) {
      if (i < count) {
        const crack = liveCracks[i]
        positions[i].set(crack.x, crack.y)

        if (crack.state === 'healing') {
          times[i] = crack.healStart
          actives[i] = -1.0
        } else if (crack.state === 'active') {
          times[i] = crack.time
          actives[i] = 1.0
        } else {
          times[i] = crack.time
          actives[i] = 0.0
        }
        baseDis[i] = 0.0
      } else {
        positions[i].set(0, 0)
        times[i] = 0
        actives[i] = 0
        baseDis[i] = 0
      }
    }
    uniforms.uCrackCount.value = count

    // Slow rotation
    if (meshRef.current) {
      meshRef.current.rotation.x = -Math.PI * 0.3 + Math.sin(time * 0.15) * 0.03
    }
  })

  return (
    <group>
      <mesh ref={meshRef} rotation={[-Math.PI * 0.3, 0, 0]}>
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
    </group>
  )
}
