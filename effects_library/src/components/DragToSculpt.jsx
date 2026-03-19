import { useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame, useThree, createPortal } from '@react-three/fiber'
import * as THREE from 'three'
import { Html } from '@react-three/drei'

const RESOLUTION = 256
const PLANE_SIZE = 6
const PLANE_SEGMENTS = 200

// Fullscreen quad vertex shader (for FBO passes)
const fboVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// Sculpt pass — adds height where mouse is painting
const sculptFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uPrevHeight;
  uniform vec2 uMouse;       // 0-1 UV space
  uniform float uBrushSize;
  uniform float uBrushStrength;
  uniform int uPainting;     // 1 = raise, -1 = lower, 0 = idle
  uniform float uDelta;

  varying vec2 vUv;

  void main() {
    vec4 prev = texture2D(uPrevHeight, vUv);
    float height = prev.r;

    if (uPainting != 0) {
      float dist = distance(vUv, uMouse);
      // Smooth gaussian-ish brush
      float brush = exp(-dist * dist / (uBrushSize * uBrushSize));
      float strength = uBrushStrength * float(uPainting) * uDelta;
      height += brush * strength;
    }

    // Slight relaxation — heights slowly flatten over time for organic feel
    // Pull toward neighbors (very subtle diffusion)
    float texel = 1.0 / ${RESOLUTION}.0;
    float left = texture2D(uPrevHeight, vUv + vec2(-texel, 0.0)).r;
    float right = texture2D(uPrevHeight, vUv + vec2(texel, 0.0)).r;
    float up = texture2D(uPrevHeight, vUv + vec2(0.0, texel)).r;
    float down = texture2D(uPrevHeight, vUv + vec2(0.0, -texel)).r;

    float avg = (left + right + up + down) * 0.25;
    // Very subtle smoothing — preserves detail but prevents jagged edges
    height = mix(height, avg, 0.005);

    // Clamp height range
    height = clamp(height, -1.0, 1.5);

    gl_FragColor = vec4(height, 0.0, 0.0, 1.0);
  }
`

// Terrain vertex shader — reads height from FBO texture
const terrainVertexShader = /* glsl */ `
  uniform sampler2D uHeightMap;
  uniform float uMaxHeight;

  varying vec2 vUv;
  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;

    // Sample height
    float h = texture2D(uHeightMap, uv).r;
    vHeight = h;

    // Displace vertex along Y
    vec3 pos = position;
    pos.y += h * uMaxHeight;

    // Compute normal from heightmap neighbors
    float texel = 1.0 / ${RESOLUTION}.0;
    float hL = texture2D(uHeightMap, uv + vec2(-texel, 0.0)).r * uMaxHeight;
    float hR = texture2D(uHeightMap, uv + vec2(texel, 0.0)).r * uMaxHeight;
    float hD = texture2D(uHeightMap, uv + vec2(0.0, -texel)).r * uMaxHeight;
    float hU = texture2D(uHeightMap, uv + vec2(0.0, texel)).r * uMaxHeight;

    // Tangent-space normal from height differences
    float planeTexelSize = ${PLANE_SIZE}.0 / ${PLANE_SEGMENTS}.0;
    vec3 calcNorm = normalize(vec3(
      (hL - hR) / (2.0 * planeTexelSize),
      1.0,
      (hD - hU) / (2.0 * planeTexelSize)
    ));

    vNormal = normalize(normalMatrix * calcNorm);
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

// Terrain fragment shader — height-based coloring like wet clay
const terrainFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;

  varying vec2 vUv;
  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 norm = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);

    // Height-based color: flat = dark clay, raised = lighter, peaks = warm
    vec3 baseColor = vec3(0.12, 0.1, 0.08);        // dark clay
    vec3 midColor = vec3(0.25, 0.18, 0.12);         // medium clay
    vec3 peakColor = vec3(0.55, 0.3, 0.15);         // warm terracotta
    vec3 valleyColor = vec3(0.06, 0.08, 0.14);      // dark blue for lowered areas

    float h = vHeight;
    vec3 surfaceColor;
    if (h < 0.0) {
      surfaceColor = mix(valleyColor, baseColor, clamp(h + 1.0, 0.0, 1.0));
    } else if (h < 0.4) {
      surfaceColor = mix(baseColor, midColor, h / 0.4);
    } else {
      surfaceColor = mix(midColor, peakColor, clamp((h - 0.4) / 1.1, 0.0, 1.0));
    }

    // Lighting
    vec3 lightDir = normalize(vec3(0.5, 1.2, 0.8));
    vec3 lightDir2 = normalize(vec3(-0.7, 0.4, -0.3));
    float diff = max(dot(norm, lightDir), 0.0);
    float diff2 = max(dot(norm, lightDir2), 0.0) * 0.25;

    // Specular — wet clay sheen
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(norm, halfVec), 0.0), 64.0);

    // AO from height — valleys are darker
    float ao = smoothstep(-0.5, 0.3, h);
    ao = 0.4 + ao * 0.6;

    // Fresnel rim
    float fresnel = pow(1.0 - max(dot(norm, viewDir), 0.0), 3.0);
    vec3 rimColor = vec3(0.2, 0.15, 0.1) * fresnel * 0.4;

    vec3 color = surfaceColor * (0.15 + diff * 0.7 + diff2) * ao;
    color += spec * vec3(0.8, 0.7, 0.6) * 0.3; // wet clay highlight
    color += rimColor;

    // Tone mapping
    color = color / (1.0 + color);
    color = pow(color, vec3(0.4545));

    gl_FragColor = vec4(color, 1.0);
  }
`

function SculptEngine() {
  const { gl, camera, size } = useThree()
  const meshRef = useRef()

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

  // Sculpt pass material (fullscreen quad)
  const sculptMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: fboVertexShader,
    fragmentShader: sculptFragmentShader,
    uniforms: {
      uPrevHeight: { value: null },
      uMouse: { value: new THREE.Vector2(-1, -1) },
      uBrushSize: { value: 0.06 },
      uBrushStrength: { value: 3.0 },
      uPainting: { value: 0 },
      uDelta: { value: 0 },
    },
  }), [])

  // Sculpt quad scene (rendered to FBO)
  const sculptScene = useMemo(() => {
    const scene = new THREE.Scene()
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      sculptMaterial
    )
    scene.add(quad)
    return scene
  }, [sculptMaterial])

  const sculptCamera = useMemo(() => {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return cam
  }, [])

  // Terrain material
  const terrainUniforms = useMemo(() => ({
    uHeightMap: { value: null },
    uMaxHeight: { value: 1.2 },
    uTime: { value: 0 },
  }), [])

  // Mouse state
  const mouseState = useRef({
    painting: 0, // 0 = idle, 1 = raise, -1 = lower
    uv: new THREE.Vector2(-1, -1),
    isDown: false,
    shiftHeld: false,
  })

  // Raycaster for mouse-to-UV
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pointer = useRef(new THREE.Vector2())

  // Mouse event handlers
  useEffect(() => {
    function onPointerMove(e) {
      pointer.current.set(
        (e.clientX / size.width) * 2 - 1,
        -(e.clientY / size.height) * 2 + 1
      )

      if (mouseState.current.isDown && meshRef.current) {
        raycaster.setFromCamera(pointer.current, camera)
        const hits = raycaster.intersectObject(meshRef.current)
        if (hits.length > 0) {
          mouseState.current.uv.copy(hits[0].uv)
          mouseState.current.painting = mouseState.current.shiftHeld ? -1 : 1
        }
      }
    }

    function onPointerDown(e) {
      mouseState.current.isDown = true
      mouseState.current.shiftHeld = e.shiftKey

      pointer.current.set(
        (e.clientX / size.width) * 2 - 1,
        -(e.clientY / size.height) * 2 + 1
      )

      if (meshRef.current) {
        raycaster.setFromCamera(pointer.current, camera)
        const hits = raycaster.intersectObject(meshRef.current)
        if (hits.length > 0) {
          mouseState.current.uv.copy(hits[0].uv)
          mouseState.current.painting = e.shiftKey ? -1 : 1
        }
      }
    }

    function onPointerUp() {
      mouseState.current.isDown = false
      mouseState.current.painting = 0
    }

    function onKeyDown(e) {
      if (e.key === 'Shift') mouseState.current.shiftHeld = true
      if (e.key === ' ') {
        e.preventDefault()
        // Reset: clear both FBOs
        const renderer = gl
        const clearColor = renderer.getClearColor(new THREE.Color())
        const clearAlpha = renderer.getClearAlpha()
        renderer.setClearColor(0x000000, 1)
        renderer.setRenderTarget(targets[0])
        renderer.clear()
        renderer.setRenderTarget(targets[1])
        renderer.clear()
        renderer.setRenderTarget(null)
        renderer.setClearColor(clearColor, clearAlpha)
      }
    }

    function onKeyUp(e) {
      if (e.key === 'Shift') mouseState.current.shiftHeld = false
    }

    const canvas = gl.domElement
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerup', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [gl, camera, size, raycaster, targets])

  // Clear FBOs on mount
  useEffect(() => {
    const renderer = gl
    const clearColor = renderer.getClearColor(new THREE.Color())
    const clearAlpha = renderer.getClearAlpha()
    renderer.setClearColor(0x000000, 1)
    renderer.setRenderTarget(targets[0])
    renderer.clear()
    renderer.setRenderTarget(targets[1])
    renderer.clear()
    renderer.setRenderTarget(null)
    renderer.setClearColor(clearColor, clearAlpha)
  }, [gl, targets])

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05)
    const read = targets[pingPong.current]
    const write = targets[1 - pingPong.current]

    // Sculpt pass
    sculptMaterial.uniforms.uPrevHeight.value = read.texture
    sculptMaterial.uniforms.uMouse.value.copy(mouseState.current.uv)
    sculptMaterial.uniforms.uPainting.value = mouseState.current.painting
    sculptMaterial.uniforms.uDelta.value = dt

    gl.setRenderTarget(write)
    gl.render(sculptScene, sculptCamera)
    gl.setRenderTarget(null)

    // Swap
    pingPong.current = 1 - pingPong.current

    // Update terrain material
    if (meshRef.current) {
      meshRef.current.material.uniforms.uHeightMap.value = write.texture
      meshRef.current.material.uniforms.uTime.value = clock.getElapsedTime()
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
    <mesh ref={meshRef} rotation={[-Math.PI * 0.35, 0, 0]} position={[0, -0.3, 0]}>
      <planeGeometry args={[PLANE_SIZE, PLANE_SIZE, PLANE_SEGMENTS, PLANE_SEGMENTS]} />
      <shaderMaterial
        vertexShader={terrainVertexShader}
        fragmentShader={terrainFragmentShader}
        uniforms={terrainUniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export default function DragToSculpt() {
  return (
    <>
      <color attach="background" args={['#0a0808']} />
      <SculptEngine />
      <Html fullscreen style={{ pointerEvents: 'none' }}>
        <div style={{
          position: 'fixed',
          bottom: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.3)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 12,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          Click+drag: sculpt up &nbsp;|&nbsp; Shift+drag: sculpt down &nbsp;|&nbsp; Space: flatten
        </div>
      </Html>
    </>
  )
}
