import { useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Reaction-Diffusion (Gray-Scott model) — Ping-pong FBO simulation that
 * produces organic Turing patterns (coral, spots, stripes). Mouse click
 * seeds chemical V. Pure shader, no physics.
 */

const SIM_RES = 256

const quadVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

// Simulation fragment shader — one Gray-Scott step
const simFragment = `
uniform sampler2D texMap;
uniform vec2 texelSize;
uniform vec2 mouse;
uniform float mouseDown;

varying vec2 vUv;

void main() {
  // Sample center and neighbors
  vec4 center = texture2D(texMap, vUv);
  vec4 left   = texture2D(texMap, vUv + vec2(-texelSize.x, 0.0));
  vec4 right  = texture2D(texMap, vUv + vec2( texelSize.x, 0.0));
  vec4 up     = texture2D(texMap, vUv + vec2(0.0,  texelSize.y));
  vec4 down   = texture2D(texMap, vUv + vec2(0.0, -texelSize.y));

  // Laplacian (already in pixel-space scale since texelSize handles spacing)
  vec2 laplacian = (left.rg + right.rg + up.rg + down.rg) - 4.0 * center.rg;

  float u = center.r;
  float v = center.g;

  // Gray-Scott parameters
  float dU = 0.2097;
  float dV = 0.105;
  float feed = 0.037;
  float kill = 0.06;
  float dt = 1.0;

  float uvv = u * v * v;
  float newU = u + dt * (dU * laplacian.r - uvv + feed * (1.0 - u));
  float newV = v + dt * (dV * laplacian.g + uvv - (kill + feed) * v);

  // Mouse seeding — inject V near cursor
  float dist = length(vUv - mouse);
  // Click: strong seed
  float seed = mouseDown * smoothstep(0.06, 0.0, dist) * 0.5;
  // Always a gentle proximity seed when mouse is nearby
  seed += smoothstep(0.04, 0.0, dist) * 0.02;

  newV = clamp(newV + seed, 0.0, 1.0);
  newU = clamp(newU, 0.0, 1.0);

  gl_FragColor = vec4(newU, newV, 0.0, 1.0);
}
`

// Display fragment shader — maps U/V to colors
const displayFragment = `
uniform sampler2D texMap;
varying vec2 vUv;

void main() {
  vec4 data = texture2D(texMap, vUv);
  float u = data.r;
  float v = data.g;

  // Dark purple background
  vec3 bg = vec3(0.04, 0.02, 0.08);
  // Cyan/teal for active chemical regions
  vec3 active = vec3(0.0, 0.8, 0.75);
  // White/pink highlights at reaction fronts
  vec3 highlight = vec3(0.95, 0.85, 1.0);

  vec3 color = bg;
  color = mix(color, active, smoothstep(0.05, 0.2, v));
  color = mix(color, highlight, smoothstep(0.25, 0.45, v));

  // Darken where U is depleted
  color *= mix(0.5, 1.0, u);

  // Vignette
  float vig = 1.0 - length(vUv - 0.5) * 0.6;
  color *= vig;

  gl_FragColor = vec4(color, 1.0);
}
`

export default function ReactionDiffusion() {
  const { gl } = useThree()
  const pingPong = useRef(0)
  const mouseDown = useRef(0)
  const smoothMouse = useRef(new THREE.Vector2(0.5, 0.5))
  const displayMeshRef = useRef()

  // Two render targets for ping-pong
  const [rtA, rtB] = useMemo(() => {
    const opts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    }
    return [
      new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, opts),
      new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, opts),
    ]
  }, [])

  // Offscreen scene for simulation passes
  const simScene = useMemo(() => new THREE.Scene(), [])
  const simCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), [])

  const simUniforms = useMemo(() => ({
    texMap: { value: null },
    texelSize: { value: new THREE.Vector2(1 / SIM_RES, 1 / SIM_RES) },
    mouse: { value: new THREE.Vector2(0.5, 0.5) },
    mouseDown: { value: 0 },
  }), [])

  const displayUniforms = useMemo(() => ({
    texMap: { value: null },
  }), [])

  // Initialize both FBOs with U=1 everywhere, V=0.25 in seed patches
  useEffect(() => {
    const data = new Float32Array(SIM_RES * SIM_RES * 4)
    for (let i = 0; i < SIM_RES * SIM_RES; i++) {
      data[i * 4 + 0] = 1.0 // U
      data[i * 4 + 1] = 0.0 // V
      data[i * 4 + 2] = 0.0
      data[i * 4 + 3] = 1.0
    }

    // Seed several patches of V
    const center = SIM_RES / 2
    const seeds = [
      { x: center, y: center },
      { x: center - 30, y: center - 20 },
      { x: center + 25, y: center + 15 },
      { x: center - 10, y: center + 30 },
      { x: center + 35, y: center - 25 },
      { x: center - 40, y: center + 5 },
      { x: center + 10, y: center - 40 },
    ]
    const r = 5
    for (const s of seeds) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue
          const px = Math.round(s.x + dx)
          const py = Math.round(s.y + dy)
          if (px >= 0 && px < SIM_RES && py >= 0 && py < SIM_RES) {
            const idx = (py * SIM_RES + px) * 4
            data[idx + 0] = 0.5  // U depleted
            data[idx + 1] = 0.25 // V seeded
          }
        }
      }
    }

    const tex = new THREE.DataTexture(data, SIM_RES, SIM_RES, THREE.RGBAFormat, THREE.FloatType)
    tex.needsUpdate = true

    // Render initial state into both FBOs
    const initMat = new THREE.MeshBasicMaterial({ map: tex })
    const initMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), initMat)
    const initScene = new THREE.Scene()
    initScene.add(initMesh)
    const initCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    gl.setRenderTarget(rtA)
    gl.render(initScene, initCam)
    gl.setRenderTarget(rtB)
    gl.render(initScene, initCam)
    gl.setRenderTarget(null)

    initMat.dispose()
    tex.dispose()
    initMesh.geometry.dispose()
  }, [gl, rtA, rtB])

  // Build sim mesh in offscreen scene
  useEffect(() => {
    const geo = new THREE.PlaneGeometry(2, 2)
    const mat = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: simFragment,
      uniforms: simUniforms,
    })
    const mesh = new THREE.Mesh(geo, mat)
    simScene.add(mesh)

    return () => {
      simScene.remove(mesh)
      geo.dispose()
      mat.dispose()
    }
  }, [simScene, simUniforms])

  // Mouse events
  const onPointerDown = useCallback(() => { mouseDown.current = 1 }, [])
  const onPointerUp = useCallback(() => { mouseDown.current = 0 }, [])

  useEffect(() => {
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [onPointerDown, onPointerUp])

  // Cleanup
  useEffect(() => {
    return () => {
      rtA.dispose()
      rtB.dispose()
    }
  }, [rtA, rtB])

  // Animation: run sim steps then display result
  useFrame(({ pointer }) => {
    // Convert pointer (-1..1) to UV (0..1)
    smoothMouse.current.x += ((pointer.x * 0.5 + 0.5) - smoothMouse.current.x) * 0.1
    smoothMouse.current.y += ((pointer.y * 0.5 + 0.5) - smoothMouse.current.y) * 0.1

    simUniforms.mouse.value.set(smoothMouse.current.x, smoothMouse.current.y)
    simUniforms.mouseDown.value = mouseDown.current

    const targets = [rtA, rtB]
    const stepsPerFrame = 8

    for (let i = 0; i < stepsPerFrame; i++) {
      const readIdx = pingPong.current
      const writeIdx = 1 - pingPong.current

      simUniforms.texMap.value = targets[readIdx].texture
      gl.setRenderTarget(targets[writeIdx])
      gl.render(simScene, simCamera)
      pingPong.current = writeIdx
    }

    gl.setRenderTarget(null)
    displayUniforms.texMap.value = targets[pingPong.current].texture
  })

  return (
    <mesh ref={displayMeshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={quadVertex}
        fragmentShader={displayFragment}
        uniforms={displayUniforms}
      />
    </mesh>
  )
}
