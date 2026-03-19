import { useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Html } from '@react-three/drei'

const FFT_SIZE = 128
const HALF_FFT = FFT_SIZE / 2

const vertexShader = /* glsl */ `
  uniform float uFreqData[${HALF_FFT}];
  uniform float uTime;
  uniform float uBassEnergy;
  uniform float uMidEnergy;
  uniform float uHighEnergy;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vDisplacement;

  #define PI 3.14159265359

  // Simplex-ish hash for variation
  vec3 hash3(vec3 p) {
    p = vec3(
      dot(p, vec3(127.1, 311.7, 74.7)),
      dot(p, vec3(269.5, 183.3, 246.1)),
      dot(p, vec3(113.5, 271.9, 124.6))
    );
    return fract(sin(p) * 43758.5453123);
  }

  void main() {
    vec3 pos = position;
    vec3 norm = normalize(normal);

    // Map vertex position on sphere to frequency bands
    // Use polar angle (theta) to map to frequency spectrum
    float theta = acos(clamp(norm.y, -1.0, 1.0)); // 0 at top, PI at bottom
    float phi = atan(norm.z, norm.x); // -PI to PI around equator

    // Map theta to frequency index (top = low freq, bottom = high freq)
    float freqIndex = theta / PI * float(${HALF_FFT} - 1);
    int idx = int(floor(freqIndex));
    int idx2 = min(idx + 1, ${HALF_FFT} - 1);
    float frac = fract(freqIndex);

    // Interpolate between adjacent frequency bins
    float freqValue = mix(uFreqData[idx], uFreqData[idx2], frac);

    // Bass drives large-scale bulge
    float bassDisplace = uBassEnergy * 0.4;

    // Mid frequencies drive medium-scale waves
    float midDisplace = uMidEnergy * 0.2 * sin(phi * 3.0 + uTime * 2.0);

    // High frequencies add surface detail
    float highDisplace = uHighEnergy * 0.1 * sin(phi * 8.0 + theta * 6.0 + uTime * 4.0);

    // Per-frequency displacement
    float freqDisplace = freqValue * 0.5;

    // Combine all displacement
    float totalDisplace = bassDisplace + midDisplace + highDisplace + freqDisplace;

    // Add subtle organic breathing even when silent
    totalDisplace += sin(uTime * 0.8 + theta * 2.0) * 0.02;
    totalDisplace += sin(uTime * 1.3 + phi * 3.0) * 0.015;

    pos += norm * totalDisplace;

    vDisplacement = totalDisplace;
    vNormal = normalize(normalMatrix * norm);
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uBassEnergy;
  uniform float uMidEnergy;
  uniform float uHighEnergy;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vDisplacement;

  void main() {
    vec3 norm = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);

    // Fresnel
    float fresnel = pow(1.0 - max(dot(norm, viewDir), 0.0), 3.0);

    // Base color shifts with energy — cool when quiet, warm when loud
    float energy = (uBassEnergy + uMidEnergy + uHighEnergy) / 3.0;

    vec3 quietColor = vec3(0.05, 0.12, 0.25);   // deep blue
    vec3 midColor = vec3(0.15, 0.05, 0.35);      // purple
    vec3 loudColor = vec3(0.5, 0.1, 0.2);        // red-pink

    vec3 baseColor;
    if (energy < 0.3) {
      baseColor = mix(quietColor, midColor, energy / 0.3);
    } else {
      baseColor = mix(midColor, loudColor, clamp((energy - 0.3) / 0.7, 0.0, 1.0));
    }

    // Displacement-based coloring — bright ridges
    float dispColor = smoothstep(0.0, 0.5, vDisplacement);
    vec3 ridgeColor = vec3(0.3, 0.7, 1.0); // cyan ridges
    baseColor = mix(baseColor, ridgeColor, dispColor * 0.4);

    // Lighting
    vec3 lightDir = normalize(vec3(1.0, 1.5, 2.0));
    vec3 lightDir2 = normalize(vec3(-1.0, 0.3, -0.5));
    float diff = max(dot(norm, lightDir), 0.0);
    float diff2 = max(dot(norm, lightDir2), 0.0) * 0.3;

    // Specular
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(norm, halfVec), 0.0), 48.0);

    // Rim glow — intensity scales with energy
    vec3 rimColor = mix(vec3(0.1, 0.3, 0.6), vec3(0.8, 0.2, 0.5), energy);
    float rim = fresnel * (0.3 + energy * 0.5);

    vec3 color = baseColor * (0.15 + diff * 0.7 + diff2);
    color += spec * vec3(1.0, 0.95, 0.9) * 0.4;
    color += rimColor * rim;

    // Tone mapping
    color = color / (1.0 + color);
    color = pow(color, vec3(0.4545));

    gl_FragColor = vec4(color, 1.0);
  }
`

// Audio engine — manages AudioContext, analyser, and source
function useAudioEngine() {
  const ctxRef = useRef(null)
  const analyserRef = useRef(null)
  const dataArrayRef = useRef(new Uint8Array(HALF_FFT))
  const sourceRef = useRef(null)
  const [mode, setMode] = useState('idle') // idle | oscillator | mic

  const initContext = useCallback(() => {
    if (ctxRef.current) return ctxRef.current
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = FFT_SIZE
    analyser.smoothingTimeConstant = 0.8
    analyser.connect(ctx.destination)
    ctxRef.current = ctx
    analyserRef.current = analyser
    return ctx
  }, [])

  const startOscillator = useCallback(() => {
    const ctx = initContext()
    // Clean up previous source
    if (sourceRef.current && sourceRef.current.disconnect) {
      sourceRef.current.disconnect()
    }

    // Create a rich tone: fundamental + harmonics for interesting FFT
    const gain = ctx.createGain()
    gain.gain.value = 0.15
    gain.connect(analyserRef.current)

    // Use multiple oscillators for richer spectrum
    const freqs = [80, 160, 240, 440, 880]
    const oscs = freqs.map((freq, i) => {
      const osc = ctx.createOscillator()
      const oscGain = ctx.createGain()
      oscGain.gain.value = 0.3 / (i + 1) // harmonics decay
      osc.type = i === 0 ? 'sawtooth' : 'sine'
      osc.frequency.value = freq
      // Slow modulation for movement
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.2 + i * 0.15
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = freq * 0.1
      lfo.connect(lfoGain)
      lfoGain.connect(osc.frequency)
      lfo.start()

      osc.connect(oscGain)
      oscGain.connect(gain)
      osc.start()
      return { osc, lfo }
    })

    // Mute the actual output so you don't hear it
    gain.disconnect()
    gain.connect(analyserRef.current)

    sourceRef.current = {
      disconnect: () => {
        oscs.forEach(({ osc, lfo }) => { osc.stop(); lfo.stop() })
        gain.disconnect()
      }
    }
    setMode('oscillator')
  }, [initContext])

  const startMic = useCallback(async () => {
    const ctx = initContext()
    if (sourceRef.current && sourceRef.current.disconnect) {
      sourceRef.current.disconnect()
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const micSource = ctx.createMediaStreamSource(stream)
      micSource.connect(analyserRef.current)
      sourceRef.current = {
        disconnect: () => {
          micSource.disconnect()
          stream.getTracks().forEach(t => t.stop())
        }
      }
      setMode('mic')
    } catch {
      // Mic denied — fall back to oscillator
      startOscillator()
    }
  }, [initContext, startOscillator])

  const getFrequencyData = useCallback(() => {
    if (!analyserRef.current) return dataArrayRef.current
    analyserRef.current.getByteFrequencyData(dataArrayRef.current)
    return dataArrayRef.current
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sourceRef.current && sourceRef.current.disconnect) {
        sourceRef.current.disconnect()
      }
      if (ctxRef.current) {
        ctxRef.current.close()
      }
    }
  }, [])

  return { mode, startOscillator, startMic, getFrequencyData }
}

function SoundMesh({ getFrequencyData, mode }) {
  const meshRef = useRef()
  const mouseTarget = useRef(new THREE.Vector2(0, 0))
  const mouseLerped = useRef(new THREE.Vector2(0, 0))

  // Uniform arrays need to be created once and mutated
  const freqDataUniform = useMemo(() => new Array(HALF_FFT).fill(0), [])

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uFreqData: { value: freqDataUniform },
    uBassEnergy: { value: 0 },
    uMidEnergy: { value: 0 },
    uHighEnergy: { value: 0 },
  }), [])

  // Smoothed energy values
  const smoothBass = useRef(0)
  const smoothMid = useRef(0)
  const smoothHigh = useRef(0)

  useFrame(({ clock, pointer }) => {
    if (!meshRef.current) return
    const mat = meshRef.current.material

    mat.uniforms.uTime.value = clock.getElapsedTime()

    // Get FFT data
    const data = getFrequencyData()

    // Normalize FFT data to 0-1 range and update uniform array
    let bassSum = 0, midSum = 0, highSum = 0
    const bassEnd = Math.floor(HALF_FFT * 0.15)
    const midEnd = Math.floor(HALF_FFT * 0.5)

    for (let i = 0; i < HALF_FFT; i++) {
      const val = data[i] / 255
      freqDataUniform[i] = val

      if (i < bassEnd) bassSum += val
      else if (i < midEnd) midSum += val
      else highSum += val
    }

    // Average energy per band
    const bass = bassSum / bassEnd
    const mid = midSum / (midEnd - bassEnd)
    const high = highSum / (HALF_FFT - midEnd)

    // Smooth the energy values
    const smoothing = 0.12
    smoothBass.current += (bass - smoothBass.current) * smoothing
    smoothMid.current += (mid - smoothMid.current) * smoothing
    smoothHigh.current += (high - smoothHigh.current) * smoothing

    mat.uniforms.uBassEnergy.value = smoothBass.current
    mat.uniforms.uMidEnergy.value = smoothMid.current
    mat.uniforms.uHighEnergy.value = smoothHigh.current

    // Slow mouse-driven rotation
    mouseTarget.current.set(pointer.x, pointer.y)
    mouseLerped.current.lerp(mouseTarget.current, 0.03)

    meshRef.current.rotation.y = mouseLerped.current.x * 0.5 + clock.getElapsedTime() * 0.1
    meshRef.current.rotation.x = mouseLerped.current.y * 0.3
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1.8, 64, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  )
}

export default function SoundReactiveMesh() {
  const { mode, startOscillator, startMic, getFrequencyData } = useAudioEngine()

  return (
    <>
      <color attach="background" args={['#050510']} />
      <SoundMesh getFrequencyData={getFrequencyData} mode={mode} />
      <Html fullscreen style={{ pointerEvents: 'none' }}>
        <div style={{
          position: 'fixed',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 8,
          pointerEvents: 'auto',
        }}>
          {mode === 'idle' && (
            <button
              onClick={startOscillator}
              style={{
                padding: '8px 16px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              Start Audio
            </button>
          )}
          {mode !== 'idle' && (
            <>
              <button
                onClick={startOscillator}
                style={{
                  padding: '8px 16px',
                  background: mode === 'oscillator' ? 'rgba(100,150,255,0.2)' : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${mode === 'oscillator' ? 'rgba(100,150,255,0.4)' : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: 8,
                  color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                Generated Audio
              </button>
              <button
                onClick={startMic}
                style={{
                  padding: '8px 16px',
                  background: mode === 'mic' ? 'rgba(255,100,150,0.2)' : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${mode === 'mic' ? 'rgba(255,100,150,0.4)' : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: 8,
                  color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                Microphone
              </button>
            </>
          )}
        </div>
        {mode === 'idle' && (
          <div style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.25)',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
            textAlign: 'center',
            pointerEvents: 'none',
          }}>
            Click "Start Audio" to activate — WebAudio requires a user gesture
          </div>
        )}
      </Html>
    </>
  )
}
