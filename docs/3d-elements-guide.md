# 3D Web Elements — Agent Context Guide

This document captures hard-won knowledge from the initial R&D spike on Lusion-style 3D web effects. Read this before writing any 3D code for the portfolio site.

## Stack Decision

We evaluated multiple approaches and landed on the **React Three Fiber (R3F) ecosystem**:

| Package | Purpose |
|---|---|
| `three` | Core 3D engine (Three.js) |
| `@react-three/fiber` | React renderer for Three.js — write 3D scenes as JSX |
| `@react-three/rapier` | Rapier WASM physics wrapped in React components |
| `@react-three/drei` | Utility components: `<Mask>`, `useMask()`, `ScrollControls`, `useScroll()`, `useVideoTexture`, `Instances` |

**Why R3F over raw Three.js**: Declarative JSX is cleaner, no performance overhead (renders outside React), built-in pointer events, integrates with React state/hooks. The portfolio is a React site.

## Critical Lesson: Shader-Driven > Physics-Driven

**Physics-based effects (Rapier RigidBodies) are fragile.** Forces compound over time, objects fly off-screen, state corrupts. The ball pit works because it's constrained (stencil mask, attraction force, damping), but anything with many unconstrained physics bodies will break.

**Shader/math-driven effects are stable.** They have no simulation state — every frame is computed fresh from inputs (time, mouse position). They cannot break. Prefer these for hero elements and backgrounds.

Stable effects we built and verified:
- **Displacement Wave** — vertex shader displacing a subdivided plane with stacked ring waves from mouse position
- **Blob Metaballs** — fullscreen fragment shader with metaball distance fields following mouse
- **Noise Terrain Flythrough** — vertex shader with simplex noise, infinite procedural landscape
- **Magnetic Field Lines** — geometry updated per-frame via `useFrame`, lines computed from math (not physics)
- **Dancing Mesh Transition** — vertex shader morphing vertices between two rects, scroll-driven via single `animateProgress` uniform

Fragile effects (broke under use):
- Gravity Well (objects escaped orbit)
- Shatter Reveal (physics explosion was unreliable)
- Particle Morph (particles disappeared after multiple morphs)

## Pattern: Writing a Shader Effect Component

```jsx
// 1. Inline GLSL as template literals (no build plugin needed)
const vertexShader = `...`
const fragmentShader = `...`

// 2. useMemo for uniforms (create once, update in useFrame)
const uniforms = useMemo(() => ({
  time: { value: 0 },
  mouse: { value: new THREE.Vector2() },
}), [])

// 3. useFrame for animation loop
useFrame(({ clock, pointer }) => {
  uniforms.time.value = clock.elapsedTime
  // Convert pointer to world coords for mouse interaction
})

// 4. shaderMaterial on geometry
<mesh>
  <planeGeometry args={[1, 1, segments, segments]} />
  <shaderMaterial vertexShader={v} fragmentShader={f} uniforms={uniforms} />
</mesh>
```

Key patterns:
- **Mouse to world coords**: `pointer` gives NDC (-1 to 1). Unproject through camera, raycast to z=0 plane.
- **Smooth mouse**: Lerp toward target each frame (`smoothMouse.lerp(target, 0.05)`) for organic feel.
- **Subdivision matters**: `planeGeometry args={[w, h, 128, 128]}` — more subdivisions = smoother vertex displacement.

## Pattern: Writing a Physics Effect Component

Only use when you need actual collision/interaction (like the ball pit). Always include these safety rails:

- **Zero gravity** world: `<Physics gravity={[0, 0, 0]}>`
- **Attraction force** pulling objects toward center every frame (prevents escape)
- **Linear damping** on every body (0.3-0.6 range)
- **Stencil mask** via Drei `<Mask id={n}>` + `useMask(n)` to visually contain objects
- **Z-clamping** in useFrame to keep objects in the plane
- **Mouse as kinematic body**: `RigidBody type="kinematicPosition"` tracking cursor, not dynamic

## Reference Material

- **Mark N's repo** (CC0 license, free to use): `github.com/canxerian/lusion-reverse-engineered` — complete vanilla Three.js + Rapier implementation of ball pit + dancing mesh transition. GLSL shaders are copy-paste portable.
- **Lusion Awwwards case study**: Their actual approach uses Houdini FX for pre-baked vertex animations (not real-time physics). Relevant for understanding the "why" but their pipeline requires Houdini — don't try to replicate it.
- **Drei docs**: `drei.docs.pmnd.rs` — check here for utility components before writing custom code.

## Claude Skills That Exist

These are `.claude/skills/` context files that improve Three.js code generation:
- **CloudAI-X/threejs-skills** (1.8k stars) — 10 skill files covering Three.js API. Install if quality drops.
- **Nice-Wolf-Studio/claude-skills-threejs-ecs-ts** — R3F + TypeScript patterns.
- **ShaderToy-MCP** — MCP server to search ShaderToy for GLSL reference. Only useful for custom shader work.

None of these are installed yet. Install them if you find yourself writing incorrect Three.js API calls.

## Test Project Location

`/effects_library/` — Vite + React project with all working demos. Run `npm run dev` from that directory. Contains 6 effects (3 shader-driven, 1 physics, 1 scroll transition, 1 displacement wave).
