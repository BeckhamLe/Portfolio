#define PI 3.14159265359

uniform float animateProgress;
uniform vec4 startRect; // x, y, width, height
uniform vec4 endRect;   // x, y, width, height

varying vec2 vUv;
varying float vLocalProgress;

vec2 rotateLocal(vec2 p, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

void main() {
  vUv = uv;

  // Transition weight per vertex — corners/edges transition at different times
  float transitionWeight = 1.0 - (pow(uv.x * uv.x, 0.75) + pow(uv.y, 1.5)) / 2.0;

  // Staggered local progress per vertex
  float localProgress = smoothstep(transitionWeight * 0.3, 0.7 + transitionWeight * 0.3, animateProgress);
  vLocalProgress = localProgress;

  // Interpolate position between start and end rects
  vec2 startPos = startRect.xy + (uv * startRect.zw);
  vec2 endPos = endRect.xy + (uv * endRect.zw);
  vec2 posXY = mix(startPos, endPos, localProgress);

  // Interpolate size
  float width = mix(startRect.z, endRect.z, localProgress);

  // Oscillating horizontal offset (wobble)
  posXY.x += mix(width, 0.0, cos(localProgress * PI * 2.0) * 0.5 + 0.5) * 0.1;

  // Rotation with overshoot
  float rot = (smoothstep(0.0, 1.0, localProgress) - localProgress) * -0.5;
  posXY = rotateLocal(posXY, rot);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(posXY, 0.0, 1.0);
}
