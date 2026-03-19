import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const RESOLUTION = 512

// Fullscreen quad vertex shader (shared by both passes)
const fullscreenVS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// Ink simulation pass — diffusion, decay, deposit
const inkFS = /* glsl */ `
  precision highp float;

  uniform sampler2D uPrevFrame;
  uniform vec2 uMouse;
  uniform int uPainting;
  uniform float uTime;
  uniform vec3 uInkColor;

  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    float texel = 1.0 / ${RESOLUTION}.0;

    vec4 prev = texture2D(uPrevFrame, uv);

    // Diffusion: sample 4 neighbors and blend toward average
    vec4 left  = texture2D(uPrevFrame, uv + vec2(-texel, 0.0));
    vec4 right = texture2D(uPrevFrame, uv + vec2( texel, 0.0));
    vec4 up    = texture2D(uPrevFrame, uv + vec2(0.0,  texel));
    vec4 down  = texture2D(uPrevFrame, uv + vec2(0.0, -texel));
    vec4 avg = (left + right + up + down) * 0.25;

    // Blend toward neighbors (spread rate)
    vec4 current = mix(prev, avg, 0.008);

    // Decay (fade over time)
    current *= 0.997;

    // Deposit ink at mouse position
    if (uPainting == 1) {
      float dist = distance(uv, uMouse);
      float brush = exp(-dist * dist / 0.002);
      current.rgb = mix(current.rgb, uInkColor, brush * 0.5);
      current.a = max(current.a, brush * 0.8);
    }

    gl_FragColor = current;
  }
`

// Display pass — render ink over dark background
const displayVS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const displayFS = /* glsl */ `
  precision highp float;

  uniform sampler2D uInkTexture;

  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec4 ink = texture2D(uInkTexture, uv);

    // Dark background
    vec3 bg = vec3(0.03, 0.03, 0.05);

    // Blend ink over background
    vec3 color = mix(bg, ink.rgb, ink.a);

    gl_FragColor = vec4(color, 1.0);
  }
`

// HSL to RGB conversion
function hslToRGB(h, s, l) {
  const a = s * Math.min(l, 1 - l)
  const f = (n) => {
    const k = (n + h * 12) % 12
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  return new THREE.Vector3(f(0), f(8), f(4))
}

export default function InkBleedCursor() {
  const displayRef = useRef()
  const { gl, size } = useThree()

  // Ping-pong FBO targets
  const targets = useMemo(() => {
    const opts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    }
    return [
      new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, opts),
      new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, opts),
    ]
  }, [])

  const pingPong = useRef(0)

  // Ink pass material
  const inkMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: fullscreenVS,
    fragmentShader: inkFS,
    uniforms: {
      uPrevFrame: { value: null },
      uMouse: { value: new THREE.Vector2(-1, -1) },
      uPainting: { value: 0 },
      uTime: { value: 0 },
      uInkColor: { value: new THREE.Vector3(0.2, 0.6, 0.9) },
    },
  }), [])

  // Ink pass scene (rendered to FBO)
  const inkScene = useMemo(() => {
    const scene = new THREE.Scene()
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      inkMaterial
    )
    scene.add(quad)
    return scene
  }, [inkMaterial])

  const inkCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), [])

  // Display uniforms
  const displayUniforms = useMemo(() => ({
    uInkTexture: { value: null },
  }), [])

  // Mouse tracking state
  const mouseState = useRef({
    rawUV: new THREE.Vector2(-1, -1),
    smoothUV: new THREE.Vector2(-1, -1),
    prevUV: new THREE.Vector2(-1, -1),
    painting: 0,
    initialized: false,
  })

  // Track mouse position via canvas events (convert to UV space 0-1)
  useEffect(() => {
    function onPointerMove(e) {
      const rect = gl.domElement.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = 1.0 - (e.clientY - rect.top) / rect.height // flip Y
      mouseState.current.rawUV.set(x, y)
      if (!mouseState.current.initialized) {
        mouseState.current.smoothUV.set(x, y)
        mouseState.current.prevUV.set(x, y)
        mouseState.current.initialized = true
      }
    }

    const canvas = gl.domElement
    canvas.addEventListener('pointermove', onPointerMove)
    return () => canvas.removeEventListener('pointermove', onPointerMove)
  }, [gl])

  // Clear FBOs on mount
  useEffect(() => {
    const renderer = gl
    const clearColor = renderer.getClearColor(new THREE.Color())
    const clearAlpha = renderer.getClearAlpha()
    renderer.setClearColor(0x000000, 0)
    renderer.setRenderTarget(targets[0])
    renderer.clear()
    renderer.setRenderTarget(targets[1])
    renderer.clear()
    renderer.setRenderTarget(null)
    renderer.setClearColor(clearColor, clearAlpha)
  }, [gl, targets])

  useFrame(({ clock }) => {
    const ms = mouseState.current
    const elapsed = clock.getElapsedTime()

    // Smooth mouse position with lerp
    ms.smoothUV.lerp(ms.rawUV, 0.15)

    // Detect movement — painting when mouse velocity exceeds threshold
    const dx = ms.smoothUV.x - ms.prevUV.x
    const dy = ms.smoothUV.y - ms.prevUV.y
    const velocity = Math.sqrt(dx * dx + dy * dy)
    const isPainting = velocity > 0.0005 && ms.initialized ? 1 : 0

    ms.prevUV.copy(ms.smoothUV)

    // Cycle ink color over time (HSL with high saturation)
    const hue = (elapsed * 0.08) % 1.0
    const inkColor = hslToRGB(hue, 0.85, 0.55)

    // Update ink pass uniforms
    const read = targets[pingPong.current]
    const write = targets[1 - pingPong.current]

    inkMaterial.uniforms.uPrevFrame.value = read.texture
    inkMaterial.uniforms.uMouse.value.copy(ms.smoothUV)
    inkMaterial.uniforms.uPainting.value = isPainting
    inkMaterial.uniforms.uTime.value = elapsed
    inkMaterial.uniforms.uInkColor.value.copy(inkColor)

    // Render ink pass to write target
    gl.setRenderTarget(write)
    gl.render(inkScene, inkCamera)
    gl.setRenderTarget(null)

    // Swap ping-pong
    pingPong.current = 1 - pingPong.current

    // Update display material
    if (displayRef.current) {
      displayRef.current.material.uniforms.uInkTexture.value = write.texture
    }
  })

  // Cleanup FBOs
  useEffect(() => {
    return () => {
      targets[0].dispose()
      targets[1].dispose()
    }
  }, [targets])

  return (
    <mesh ref={displayRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={displayVS}
        fragmentShader={displayFS}
        uniforms={displayUniforms}
      />
    </mesh>
  )
}
