import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useScroll, ScrollControls, Scroll } from '@react-three/drei'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  #define PI 3.14159265359
  #define NUM_STRIPS 12.0

  uniform float uProgress;
  uniform float uTime;
  uniform float uHalfWidth;
  uniform float uHalfHeight;

  varying vec2 vUv;
  varying float vStripId;
  varying float vStripProgress;
  varying float vCurlAmount;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Which horizontal strip does this vertex belong to?
    // Map y from [-halfHeight, halfHeight] to [0, 1] then to strip index
    float normalizedY = (pos.y + uHalfHeight) / (uHalfHeight * 2.0);
    float stripFloat = normalizedY * NUM_STRIPS;
    float stripId = floor(stripFloat);
    float withinStrip = fract(stripFloat); // 0-1 within the strip
    vStripId = stripId;

    // Stagger: top strips peel first (high stripId first)
    float normalizedId = stripId / (NUM_STRIPS - 1.0);
    float delay = (1.0 - normalizedId); // top = 0 delay, bottom = max delay
    float staggerDuration = 0.5;
    float stripProgress = smoothstep(delay * staggerDuration, delay * staggerDuration + (1.0 - staggerDuration), uProgress);
    stripProgress = stripProgress * stripProgress * (3.0 - 2.0 * stripProgress); // ease
    vStripProgress = stripProgress;

    // Curl the strip upward and away
    if (stripProgress > 0.001) {
      // The curl happens along the strip's top edge
      // withinStrip 0 = bottom of strip, 1 = top
      // As progress increases, more of the strip curls up from the top

      float curlStart = 1.0 - stripProgress; // curl from top down
      float curlAmount = 0.0;

      if (withinStrip > curlStart) {
        float behindCurl = (withinStrip - curlStart) / max(stripProgress, 0.001);
        behindCurl = clamp(behindCurl, 0.0, 1.0);

        float curlAngle = behindCurl * PI * 1.2; // slightly more than 180 degrees
        float stripHeight = uHalfHeight * 2.0 / NUM_STRIPS;
        float curlRadius = stripHeight * 0.4 + behindCurl * 0.05;

        // Curl up and over
        pos.z = sin(curlAngle) * curlRadius * (0.5 + stripProgress * 0.5);
        float yOffset = (1.0 - cos(curlAngle)) * curlRadius * 0.5;
        pos.y += yOffset * stripProgress;

        curlAmount = behindCurl;
      }

      // Slight z-lift for the whole strip as it starts to peel
      pos.z += stripProgress * 0.05;

      vCurlAmount = curlAmount;
    } else {
      vCurlAmount = 0.0;
    }

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  #define PI 3.14159265359
  precision highp float;

  uniform float uProgress;
  uniform float uTime;

  varying vec2 vUv;
  varying float vStripId;
  varying float vStripProgress;
  varying float vCurlAmount;

  void main() {
    // Layer underneath (revealed): vibrant cyan/purple gradient
    vec3 cyan = vec3(0.05, 0.75, 0.85);
    vec3 purple = vec3(0.45, 0.1, 0.65);
    vec3 teal = vec3(0.0, 0.5, 0.55);
    float revealGrad = vUv.y + vUv.x * 0.3;
    vec3 revealed = mix(teal, cyan, revealGrad);
    revealed = mix(revealed, purple, smoothstep(0.6, 1.0, revealGrad) * 0.5);

    // Strip surface: dark with subtle variation per strip
    float stripHue = fract(vStripId * 0.137);
    vec3 stripColor = mix(
      vec3(0.06, 0.04, 0.1),
      vec3(0.1, 0.06, 0.14),
      stripHue
    );
    stripColor = mix(stripColor, vec3(0.08, 0.05, 0.12), vUv.x * 0.3);

    // Back of strip (when curled)
    vec3 backColor = vec3(0.04, 0.03, 0.06);

    // Choose what to show
    vec3 color;

    if (vCurlAmount > 0.01) {
      // Curled portion — show back of strip with edge lighting
      float shadow = 1.0 - vCurlAmount * 0.5;
      color = mix(stripColor, backColor, vCurlAmount) * shadow;

      // Edge highlight at curl peak
      float peakGlow = pow(sin(vCurlAmount * PI), 4.0) * 0.4;
      color += vec3(0.0, 0.85, 1.0) * peakGlow;

      // Pink accent at the crest
      float crest = pow(sin(vCurlAmount * PI), 6.0) * 0.3;
      color += vec3(1.0, 0.3, 0.55) * crest;
    } else if (vStripProgress > 0.99) {
      // Fully peeled away — show revealed layer
      color = revealed;
    } else {
      // Flat strip — blend between strip surface and revealed based on progress
      color = mix(stripColor, revealed, vStripProgress * 0.3);
    }

    // Shadow at the peel line between strips
    float stripEdge = fract(vUv.y * 12.0);
    float edgeShadow = smoothstep(0.02, 0.0, stripEdge) + smoothstep(0.98, 1.0, stripEdge);
    color *= 1.0 - edgeShadow * 0.3 * (1.0 - vStripProgress);

    // Edge glow along the curl line
    float curlEdge = smoothstep(0.05, 0.0, vCurlAmount) * vStripProgress;
    color += vec3(0.0, 0.7, 0.85) * curlEdge * 0.3;

    gl_FragColor = vec4(color, 1.0);
  }
`

function RibbonPanel() {
  const meshRef = useRef()
  const scroll = useScroll()
  const { viewport } = useThree()

  const width = Math.min(viewport.width * 0.85, 8)
  const height = Math.min(viewport.height * 0.85, 6)

  const uniforms = useMemo(
    () => ({
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uHalfWidth: { value: width / 2 },
      uHalfHeight: { value: height / 2 },
    }),
    []
  )

  useFrame(({ clock }) => {
    const mat = meshRef.current?.material
    if (!mat) return
    mat.uniforms.uProgress.value = THREE.MathUtils.clamp(scroll.offset * 2, 0, 1)
    mat.uniforms.uTime.value = clock.getElapsedTime()
    mat.uniforms.uHalfWidth.value = width / 2
    mat.uniforms.uHalfHeight.value = height / 2
  })

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[width, height, 2, 128]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export default function RibbonPeel() {
  return (
    <ScrollControls pages={3} damping={0.15}>
      <RibbonPanel />
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
            Scroll down to peel the ribbons
          </h2>
        </div>
      </Scroll>
    </ScrollControls>
  )
}
