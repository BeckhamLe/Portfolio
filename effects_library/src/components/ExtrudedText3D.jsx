import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame, useThree, extend } from '@react-three/fiber'
import * as THREE from 'three'
import { FontLoader } from 'three/addons/loaders/FontLoader.js'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import { Center } from '@react-three/drei'

/**
 * ExtrudedText3D — "BECKHAM" rendered as thick 3D extruded text with bevel,
 * iridescent/metallic shader material, and subtle parallax tilt on mouse move.
 * Hero centerpiece candidate.
 */

extend({ TextGeometry })

const FONT_URL = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/fonts/helvetiker_bold.typeface.json'

const vertexShader = /* glsl */ `
#define PI 3.14159265359

varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`

const fragmentShader = /* glsl */ `
#define PI 3.14159265359

uniform float uTime;
uniform vec3 uLightDir1;
uniform vec3 uLightDir2;
uniform float uLightIntensity1;
uniform float uLightIntensity2;

varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vViewDir;
varying vec2 vUv;

// HSL to RGB conversion
vec3 hsl2rgb(float h, float s, float l) {
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewDir);

  // Fresnel factor — stronger color at glancing angles
  float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.5);

  // Hue shift based on normal direction + time for iridescence
  float hueShift = normal.x * 0.3 + normal.y * 0.5 + normal.z * 0.2 + uTime * 0.1;
  // Cycle through cyan -> purple -> pink palette
  float hue = fract(hueShift * 0.5 + 0.55);
  vec3 iridescentColor = hsl2rgb(hue, 0.7, 0.55);

  // Base metallic color (dark steel)
  vec3 baseColor = vec3(0.12, 0.12, 0.15);

  // Blend iridescent color with fresnel
  vec3 surfaceColor = mix(baseColor, iridescentColor, fresnel * 0.85 + 0.15);

  // Directional lighting
  vec3 lightDir1 = normalize(uLightDir1);
  vec3 lightDir2 = normalize(uLightDir2);

  float diff1 = max(dot(normal, lightDir1), 0.0);
  float diff2 = max(dot(normal, lightDir2), 0.0);

  // Specular highlights (Blinn-Phong)
  vec3 halfDir1 = normalize(lightDir1 + viewDir);
  vec3 halfDir2 = normalize(lightDir2 + viewDir);
  float spec1 = pow(max(dot(normal, halfDir1), 0.0), 64.0);
  float spec2 = pow(max(dot(normal, halfDir2), 0.0), 32.0);

  // Ambient occlusion approximation from normal.y
  float ao = 0.5 + 0.5 * normal.y;

  // Combine lighting
  vec3 ambient = surfaceColor * 0.15 * ao;
  vec3 diffuse = surfaceColor * (diff1 * uLightIntensity1 + diff2 * uLightIntensity2);
  vec3 specular = vec3(1.0) * (spec1 * uLightIntensity1 * 0.6 + spec2 * uLightIntensity2 * 0.3);

  // Add a subtle rim glow
  float rim = pow(fresnel, 3.0);
  vec3 rimColor = iridescentColor * rim * 0.4;

  vec3 finalColor = ambient + diffuse + specular + rimColor;

  // Tone mapping
  finalColor = finalColor / (finalColor + vec3(1.0));
  // Gamma correction
  finalColor = pow(finalColor, vec3(1.0 / 2.2));

  gl_FragColor = vec4(finalColor, 1.0);
}
`

function TextMesh({ font }) {
  const meshRef = useRef()

  const geometry = useMemo(() => {
    const geo = new TextGeometry('BECKHAM', {
      font: font,
      size: 1.2,
      depth: 0.4,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.02,
      bevelOffset: 0,
      bevelSegments: 5,
    })
    geo.computeBoundingBox()
    geo.computeVertexNormals()
    return geo
  }, [font])

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uLightDir1: { value: new THREE.Vector3(5, 5, 5).normalize() },
    uLightDir2: { value: new THREE.Vector3(-3, 2, -2).normalize() },
    uLightIntensity1: { value: 0.8 },
    uLightIntensity2: { value: 0.3 },
  }), [])

  useFrame((_, delta) => {
    uniforms.uTime.value += delta
  })

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  )
}

export default function ExtrudedText3D() {
  const groupRef = useRef()
  const smoothMouse = useRef({ x: 0, y: 0 })
  const [font, setFont] = useState(null)
  const { size } = useThree()

  // Load font
  useEffect(() => {
    const loader = new FontLoader()
    loader.load(FONT_URL, (loadedFont) => {
      setFont(loadedFont)
    })
  }, [])

  // Track mouse position in normalized coords (-1 to 1)
  useEffect(() => {
    const onMouseMove = (e) => {
      smoothMouse.current.targetX = (e.clientX / size.width) * 2 - 1
      smoothMouse.current.targetY = (e.clientY / size.height) * 2 - 1
    }
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [size])

  useFrame((_, delta) => {
    if (!groupRef.current) return

    const sm = smoothMouse.current
    // Smooth lerp toward target
    const lerpFactor = 1 - Math.pow(0.05, delta)
    sm.x += ((sm.targetX || 0) - sm.x) * lerpFactor
    sm.y += ((sm.targetY || 0) - sm.y) * lerpFactor

    // Parallax tilt — max ~0.15 radians
    groupRef.current.rotation.y = sm.x * 0.15
    groupRef.current.rotation.x = -sm.y * 0.1
  })

  return (
    <>
      <color attach="background" args={['#0a0a0a']} />
      <group ref={groupRef}>
        {font && (
          <Center>
            <TextMesh font={font} />
          </Center>
        )}
      </group>
    </>
  )
}
