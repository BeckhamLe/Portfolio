import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec2 uResolution;

  varying vec2 vUv;

  // Rotation matrix around Y axis
  mat3 rotateY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
  }

  // Rotation matrix around X axis
  mat3 rotateX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
  }

  // Sphere SDF with sine-based organic deformation
  float sdBlob(vec3 pos, float time) {
    float radius = 1.0;
    float d = length(pos) - radius;

    // Sine-based displacement for organic blobby look
    float f = 3.0;
    float displacement = sin(pos.x * f + time) * sin(pos.y * f + time) * sin(pos.z * f + time);
    d += displacement * 0.3;

    // Secondary higher-freq detail
    float f2 = 7.0;
    float detail = sin(pos.x * f2 + time * 1.3) * sin(pos.y * f2 - time * 0.8) * sin(pos.z * f2 + time * 1.1);
    d += detail * 0.06;

    return d;
  }

  // Scene SDF
  float map(vec3 pos) {
    return sdBlob(pos, uTime);
  }

  // Normal via central differences
  vec3 calcNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(
      map(p + e.xyy) - map(p - e.xyy),
      map(p + e.yxy) - map(p - e.yxy),
      map(p + e.yyx) - map(p - e.yyx)
    ));
  }

  // Soft shadow
  float softShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
    float res = 1.0;
    float t = mint;
    for (int i = 0; i < 32; i++) {
      float h = map(ro + rd * t);
      res = min(res, k * h / t);
      t += clamp(h, 0.02, 0.1);
      if (h < 0.001 || t > maxt) break;
    }
    return clamp(res, 0.0, 1.0);
  }

  // Iridescent color from normal direction
  vec3 iridescence(vec3 normal, vec3 viewDir) {
    float NdotV = dot(normal, viewDir);
    float fresnel = pow(1.0 - abs(NdotV), 2.0);

    // Shift hue based on normal direction — cyan/purple/pink palette
    float hueShift = normal.x * 0.3 + normal.y * 0.5 + normal.z * 0.2 + uTime * 0.1;

    vec3 col1 = vec3(0.1, 0.8, 0.9);  // cyan
    vec3 col2 = vec3(0.6, 0.2, 0.8);  // purple
    vec3 col3 = vec3(0.9, 0.3, 0.6);  // pink

    float t = fract(hueShift);
    vec3 baseColor;
    if (t < 0.33) {
      baseColor = mix(col1, col2, t * 3.0);
    } else if (t < 0.66) {
      baseColor = mix(col2, col3, (t - 0.33) * 3.0);
    } else {
      baseColor = mix(col3, col1, (t - 0.66) * 3.0);
    }

    // Boost iridescence at glancing angles
    baseColor = mix(baseColor, vec3(1.0, 0.7, 0.9), fresnel * 0.5);

    return baseColor;
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

    // Background
    vec3 bgColor = vec3(0.04, 0.04, 0.04); // #0a0a0a

    // Camera setup
    vec3 ro = vec3(0.0, 0.0, 3.5);
    vec3 rd = normalize(vec3(uv, -1.5));

    // Mouse-driven rotation
    vec2 mouse = uMouse * 0.4;
    mat3 rotY = rotateY(mouse.x);
    mat3 rotX = rotateX(-mouse.y);
    mat3 rot = rotY * rotX;
    ro = rot * ro;
    rd = rot * rd;

    // Raymarch
    float t = 0.0;
    float d;
    int steps = 0;
    int maxSteps = 100;

    for (int i = 0; i < 100; i++) {
      vec3 p = ro + rd * t;
      d = map(p);
      if (d < 0.001) break;
      if (t > 20.0) break;
      t += d * 0.8; // slight understep for safety
      steps = i;
    }

    vec3 color = bgColor;

    if (d < 0.001) {
      vec3 p = ro + rd * t;
      vec3 n = calcNormal(p);

      // AO approximation from step count
      float ao = 1.0 - float(steps) / float(maxSteps);
      ao = pow(ao, 1.5);

      // Lighting
      vec3 lightDir = normalize(vec3(1.0, 1.5, 2.0));
      vec3 lightDir2 = normalize(vec3(-1.0, 0.5, -1.0));

      float diff = max(dot(n, lightDir), 0.0);
      float diff2 = max(dot(n, lightDir2), 0.0) * 0.3;

      // Soft shadow from main light
      float shadow = softShadow(p + n * 0.01, lightDir, 0.02, 5.0, 8.0);

      // Iridescent surface color
      vec3 viewDir = normalize(ro - p);
      vec3 surfaceColor = iridescence(n, viewDir);

      // Rim lighting
      float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
      vec3 rimColor = vec3(0.4, 0.6, 0.9) * rim * 0.6;

      // Specular
      vec3 halfVec = normalize(lightDir + viewDir);
      float spec = pow(max(dot(n, halfVec), 0.0), 32.0);

      // Combine
      color = surfaceColor * (diff * shadow + diff2) * ao;
      color += spec * vec3(1.0, 0.9, 0.95) * 0.5 * shadow;
      color += rimColor;
      color += surfaceColor * 0.05; // ambient

      // Subtle distance fog to background
      float fog = 1.0 - exp(-t * 0.15);
      color = mix(color, bgColor, fog);
    }

    // Tone mapping and gamma
    color = color / (1.0 + color);
    color = pow(color, vec3(0.4545));

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function RaymarchBlob() {
  const meshRef = useRef()
  const mouseTarget = useRef(new THREE.Vector2(0, 0))
  const mouseLerped = useRef(new THREE.Vector2(0, 0))
  const { size } = useThree()

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
    }),
    []
  )

  useFrame(({ clock, pointer }) => {
    if (!meshRef.current) return

    const mat = meshRef.current.material

    mat.uniforms.uTime.value = clock.getElapsedTime()

    // Smooth mouse lerp
    mouseTarget.current.set(pointer.x, pointer.y)
    mouseLerped.current.lerp(mouseTarget.current, 0.05)
    mat.uniforms.uMouse.value.copy(mouseLerped.current)

    mat.uniforms.uResolution.value.set(
      window.innerWidth * window.devicePixelRatio,
      window.innerHeight * window.devicePixelRatio
    )
  })

  return (
    <mesh ref={meshRef} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
}
