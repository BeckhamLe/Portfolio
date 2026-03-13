uniform sampler2D videoTexture;
uniform vec3 tintColor;
uniform vec2 resolution;

varying vec2 vUv;
varying float vLocalProgress;

float roundedCornerMask(vec2 uv, vec2 size, float radius) {
  vec2 q = abs(uv - 0.5) * size - (size * 0.5 - radius);
  return 1.0 - smoothstep(0.0, 2.0 / min(size.x, size.y), length(max(q, 0.0)) - radius);
}

void main() {
  // Aspect-correct UV sampling
  vec2 texUv = vUv;

  vec4 albedo = texture2D(videoTexture, texUv);

  // Rounded corner mask
  float mask = roundedCornerMask(vUv, resolution, 20.0);

  // Tint that fades out as animation progresses
  float tintCurve = 1.0 - smoothstep(0.0, 0.6, vLocalProgress);
  vec3 color = mix(albedo.rgb, albedo.rgb * tintColor, tintCurve);

  gl_FragColor = vec4(color, mask);
}
