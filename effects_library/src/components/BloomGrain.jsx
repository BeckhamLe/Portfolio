import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const postVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const postFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uSceneTexture;
  uniform float uTime;
  uniform float uBloomIntensity;
  uniform float uGrainIntensity;
  uniform vec2 uResolution;

  varying vec2 vUv;

  void main() {
    vec3 color = texture2D(uSceneTexture, vUv).rgb;

    // Bloom: radial multi-sample at increasing offsets, weighted by brightness
    vec3 bloom = vec3(0.0);
    float totalWeight = 0.0;

    for (int i = 1; i <= 8; i++) {
      float offset = float(i) * 0.004;
      for (int j = 0; j < 8; j++) {
        float angle = float(j) * 0.785398; // PI/4 increments
        vec2 sampleUV = vUv + vec2(cos(angle), sin(angle)) * offset;
        sampleUV = clamp(sampleUV, 0.0, 1.0);
        vec3 s = texture2D(uSceneTexture, sampleUV).rgb;
        float brightness = dot(s, vec3(0.299, 0.587, 0.114));
        float weight = max(brightness - 0.5, 0.0) * 2.0;
        bloom += s * weight;
        totalWeight += 1.0;
      }
    }
    bloom /= totalWeight;

    // Add bloom to original color
    color += bloom * uBloomIntensity;

    // Film grain
    float grain = fract(sin(dot(vUv * uTime * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
    grain = (grain - 0.5) * uGrainIntensity;
    color += grain;

    // Reinhard tone mapping
    color = color / (1.0 + color);

    // Slight vignette for cinematic feel
    float dist = distance(vUv, vec2(0.5));
    float vignette = smoothstep(0.7, 0.3, dist);
    color *= mix(0.6, 1.0, vignette);

    gl_FragColor = vec4(color, 1.0);
  }
`

function BloomGrainEffect() {
  const { gl, size } = useThree()
  const quadRef = useRef()

  // Create a separate scene with bright content
  const { contentScene, contentCamera, brightSpheres, dimSpheres, gridLines } = useMemo(() => {
    const s = new THREE.Scene()
    s.background = new THREE.Color('#0a0a0a')

    // Bright spheres that will bloom
    const brightGeo = new THREE.SphereGeometry(0.35, 32, 32)

    const sphere1 = new THREE.Mesh(
      brightGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 2, 2) }) // bright cyan (HDR-ish)
    )
    sphere1.position.set(-1.5, 0.5, 0)
    s.add(sphere1)

    const sphere2 = new THREE.Mesh(
      brightGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 0, 1.5) }) // bright magenta
    )
    sphere2.position.set(1.5, -0.3, 0)
    s.add(sphere2)

    const sphere3 = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 32, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 2) }) // bright white
    )
    sphere3.position.set(0, 1.2, 0)
    s.add(sphere3)

    const sphere4 = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 32, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.0, 0) }) // warm gold
    )
    sphere4.position.set(0.5, -1.0, 0.5)
    s.add(sphere4)

    const brights = [sphere1, sphere2, sphere3, sphere4]

    // Dim spheres (won't bloom, for contrast)
    const dimGeo = new THREE.SphereGeometry(0.25, 24, 24)
    const dimMat = new THREE.MeshBasicMaterial({ color: '#222222' })

    const dim1 = new THREE.Mesh(dimGeo, dimMat)
    dim1.position.set(-0.5, -0.8, 0.3)
    s.add(dim1)

    const dim2 = new THREE.Mesh(dimGeo, dimMat.clone())
    dim2.material.color.set('#1a1a2e')
    dim2.position.set(2.0, 0.8, -0.5)
    s.add(dim2)

    const dim3 = new THREE.Mesh(dimGeo, dimMat.clone())
    dim3.material.color.set('#1e1e1e')
    dim3.position.set(-2.0, -0.2, -0.3)
    s.add(dim3)

    const dims = [dim1, dim2, dim3]

    // Subtle ground grid
    const gridGroup = new THREE.Group()
    const lineMat = new THREE.LineBasicMaterial({ color: '#1a1a1a' })
    const gridSize = 6
    const gridDivisions = 12
    const step = gridSize / gridDivisions

    for (let i = -gridDivisions / 2; i <= gridDivisions / 2; i++) {
      const x = i * step
      // Lines along Z
      const pointsZ = [new THREE.Vector3(x, -1.8, -gridSize / 2), new THREE.Vector3(x, -1.8, gridSize / 2)]
      const geoZ = new THREE.BufferGeometry().setFromPoints(pointsZ)
      gridGroup.add(new THREE.Line(geoZ, lineMat))

      // Lines along X
      const pointsX = [new THREE.Vector3(-gridSize / 2, -1.8, x), new THREE.Vector3(gridSize / 2, -1.8, x)]
      const geoX = new THREE.BufferGeometry().setFromPoints(pointsX)
      gridGroup.add(new THREE.Line(geoX, lineMat))
    }
    s.add(gridGroup)

    // Camera
    const cam = new THREE.PerspectiveCamera(50, size.width / size.height, 0.1, 100)
    cam.position.set(0, 0.5, 5)
    cam.lookAt(0, 0, 0)

    return { contentScene: s, contentCamera: cam, brightSpheres: brights, dimSpheres: dims, gridLines: gridGroup }
  }, [])

  // Render target
  const target = useMemo(() => {
    const dpr = Math.min(window.devicePixelRatio, 2)
    return new THREE.WebGLRenderTarget(
      size.width * dpr,
      size.height * dpr,
      { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
    )
  }, [size])

  // Update camera aspect on resize
  useEffect(() => {
    contentCamera.aspect = size.width / size.height
    contentCamera.updateProjectionMatrix()
  }, [size, contentCamera])

  // Cleanup
  useEffect(() => {
    return () => {
      target.dispose()
    }
  }, [target])

  // Post-process uniforms
  const uniforms = useMemo(() => ({
    uSceneTexture: { value: null },
    uTime: { value: 0 },
    uBloomIntensity: { value: 0.6 },
    uGrainIntensity: { value: 0.04 },
    uResolution: { value: new THREE.Vector2(size.width, size.height) }
  }), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime

    // Animate bright spheres with slow sin-based movement
    brightSpheres[0].position.x = -1.5 + Math.sin(t * 0.5) * 0.3
    brightSpheres[0].position.y = 0.5 + Math.cos(t * 0.7) * 0.2

    brightSpheres[1].position.x = 1.5 + Math.cos(t * 0.4) * 0.25
    brightSpheres[1].position.y = -0.3 + Math.sin(t * 0.6) * 0.3

    brightSpheres[2].position.y = 1.2 + Math.sin(t * 0.8) * 0.15
    brightSpheres[2].position.x = Math.cos(t * 0.3) * 0.4

    brightSpheres[3].position.x = 0.5 + Math.sin(t * 0.35) * 0.2
    brightSpheres[3].position.y = -1.0 + Math.cos(t * 0.55) * 0.15

    // Slow camera orbit
    contentCamera.position.x = Math.sin(t * 0.15) * 0.5
    contentCamera.position.y = 0.5 + Math.sin(t * 0.1) * 0.2
    contentCamera.lookAt(0, 0, 0)

    // Render content scene to FBO
    gl.setRenderTarget(target)
    gl.render(contentScene, contentCamera)
    gl.setRenderTarget(null)

    // Update uniforms
    const mat = quadRef.current.material
    mat.uniforms.uSceneTexture.value = target.texture
    mat.uniforms.uTime.value = t
    mat.uniforms.uResolution.value.set(size.width, size.height)
  })

  return (
    <mesh ref={quadRef} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={postVertexShader}
        fragmentShader={postFragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

export default function BloomGrain() {
  return (
    <>
      <BloomGrainEffect />
    </>
  )
}
