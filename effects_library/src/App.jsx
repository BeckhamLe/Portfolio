import { useState, lazy, Suspense } from 'react'
import { Routes, Route, useParams, useNavigate, Link } from 'react-router-dom'
import { Canvas } from '@react-three/fiber'
import { effects } from './effects-registry'
import './App.css'

// Lazy load all components
const BlobMetaballs = lazy(() => import('./components/BlobMetaballs'))
const NoiseTerrain = lazy(() => import('./components/NoiseTerrain'))
const MagneticField = lazy(() => import('./components/MagneticField'))
const DisplacementWave = lazy(() => import('./components/DisplacementWave'))
const PhysicsBallPit = lazy(() => import('./components/PhysicsBallPit'))
const DancingMeshTransition = lazy(() => import('./components/DancingMeshTransition'))
const VoronoiCells = lazy(() => import('./components/VoronoiCells'))
const RaymarchBlob = lazy(() => import('./components/RaymarchBlob'))
const CurlNoiseFlow = lazy(() => import('./components/CurlNoiseFlow'))
const ReactionDiffusion = lazy(() => import('./components/ReactionDiffusion'))
const FractalZoom = lazy(() => import('./components/FractalZoom'))
const DissolveWipe = lazy(() => import('./components/DissolveWipe'))
const DistortionWipe = lazy(() => import('./components/DistortionWipe'))
const MeshMorph = lazy(() => import('./components/MeshMorph'))
const PixelSortGlitch = lazy(() => import('./components/PixelSortGlitch'))
const CardShatter = lazy(() => import('./components/CardShatter'))
const RibbonPeel = lazy(() => import('./components/RibbonPeel'))
const PortalTunnel = lazy(() => import('./components/PortalTunnel'))
const ParticleDissolve = lazy(() => import('./components/ParticleDissolve'))
const LiquidMorph = lazy(() => import('./components/LiquidMorph'))
const TerrainBridge = lazy(() => import('./components/TerrainBridge'))
const GravitySandbox = lazy(() => import('./components/GravitySandbox'))
const ScrollVelocitySmear = lazy(() => import('./components/ScrollVelocitySmear'))
const TypeToShatter = lazy(() => import('./components/TypeToShatter'))

const STATUS_COLORS = {
  working: '#00d4a1',
  'in-progress': '#ffc107',
  broken: '#ff4757',
}

const STATUS_LABELS = {
  working: 'Working',
  'in-progress': 'In Progress',
  broken: 'Broken',
}

const CATEGORY_COLORS = {
  effect: { bg: 'rgba(139, 92, 246, 0.15)', border: 'rgba(139, 92, 246, 0.3)', text: '#a78bfa' },
  transition: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)', text: '#60a5fa' },
}

function LoadingFallback() {
  return (
    <mesh>
      <octahedronGeometry args={[0.5, 0]} />
      <meshBasicMaterial color="#333" wireframe />
    </mesh>
  )
}

function SceneContent({ activeDemo }) {
  switch (activeDemo) {
    case 'blobs':
      return <BlobMetaballs />
    case 'terrain':
      return <NoiseTerrain />
    case 'magnetic':
      return <MagneticField />
    case 'wave':
      return <DisplacementWave />
    case 'ballpit':
      return (
        <>
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />
          <PhysicsBallPit />
        </>
      )
    case 'transition':
      return <DancingMeshTransition />
    case 'voronoi':
      return <VoronoiCells />
    case 'raymarch':
      return <RaymarchBlob />
    case 'curlnoise':
      return <CurlNoiseFlow />
    case 'reaction':
      return <ReactionDiffusion />
    case 'fractal':
      return <FractalZoom />
    case 'dissolve':
      return <DissolveWipe />
    case 'distortion':
      return <DistortionWipe />
    case 'meshmorph':
      return <MeshMorph />
    case 'pixelsort':
      return <PixelSortGlitch />
    case 'cardshatter':
      return <CardShatter />
    case 'ribbonpeel':
      return <RibbonPeel />
    case 'portaltunnel':
      return <PortalTunnel />
    case 'particledissolve':
      return <ParticleDissolve />
    case 'liquidmorph':
      return <LiquidMorph />
    case 'terrainbridge':
      return <TerrainBridge />
    case 'gravitysandbox':
      return <GravitySandbox />
    case 'scrollsmear':
      return <ScrollVelocitySmear />
    case 'typeshatter':
      return <TypeToShatter />
    default:
      return null
  }
}

function StatusBadge({ status }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12,
      color: STATUS_COLORS[status],
    }}>
      <span style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        backgroundColor: STATUS_COLORS[status],
        display: 'inline-block',
        boxShadow: `0 0 6px ${STATUS_COLORS[status]}40`,
      }} />
      {STATUS_LABELS[status]}
    </span>
  )
}

function CategoryPill({ category }) {
  const c = CATEGORY_COLORS[category]
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 500,
      borderRadius: 99,
      backgroundColor: c.bg,
      border: `1px solid ${c.border}`,
      color: c.text,
      textTransform: 'capitalize',
    }}>
      {category}
    </span>
  )
}

function ToolPill({ children }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      fontSize: 11,
      borderRadius: 4,
      backgroundColor: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.1)',
      color: 'rgba(255,255,255,0.5)',
    }}>
      {children}
    </span>
  )
}

function Homepage() {
  const [hoveredId, setHoveredId] = useState(null)

  return (
    <div style={{
      width: '100vw',
      minHeight: '100vh',
      background: '#0a0a0a',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#fff',
      padding: '80px 40px 60px',
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ maxWidth: 1200, margin: '0 auto 60px' }}>
        <h1 style={{
          fontSize: 48,
          fontWeight: 700,
          margin: '0 0 12px',
          letterSpacing: '-0.02em',
          color: '#fff',
        }}>
          Effects Library
        </h1>
        <p style={{
          fontSize: 20,
          color: 'rgba(255,255,255,0.4)',
          margin: '0 0 4px',
          fontWeight: 400,
        }}>
          WebGL shader effects & transitions — R3F + Three.js
        </p>
        <p style={{
          fontSize: 14,
          color: 'rgba(255,255,255,0.5)',
          margin: '12px 0 0',
          fontWeight: 400,
          lineHeight: 1.7,
          maxWidth: 640,
        }}>
          A living catalog of experimental WebGL effects I'm building and iterating on.
          Many will be in broken or half-finished states at any given time — that's by design.
          I pull from these for other projects, and circle back to fix and refine as I go.
        </p>
        <p style={{
          fontSize: 14,
          color: 'rgba(255,255,255,0.4)',
          margin: '8px 0 0',
          fontWeight: 400,
          lineHeight: 1.7,
        }}>
          Made with the help of <a href="https://claude.ai/code" target="_blank" rel="noopener noreferrer" style={{ color: '#7ba4d4', textDecoration: 'none', borderBottom: '1px solid rgba(96,165,250,0.25)' }}>Claude Code</a>.
          {' '}Inspired by and wouldn't be possible without{' '}
          <a href="https://mark-n.co/projects/lusion-reverse-engineered/" target="_blank" rel="noopener noreferrer" style={{ color: '#7ba4d4', textDecoration: 'none', borderBottom: '1px solid rgba(96,165,250,0.25)' }}>Mark N's reverse-engineering case study</a>
          {' '}and the{' '}
          <a href="https://www.awwwards.com/case-study-for-lusion-by-lusion-winner-of-site-of-the-month-may.html" target="_blank" rel="noopener noreferrer" style={{ color: '#7ba4d4', textDecoration: 'none', borderBottom: '1px solid rgba(96,165,250,0.25)' }}>Lusion Awwwards case study</a>.
        </p>
      </div>

      {/* Grid */}
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 16,
      }}>
        {effects.map(effect => {
          const isHovered = hoveredId === effect.id
          return (
            <Link
              key={effect.id}
              to={`/effect/${effect.id}`}
              onMouseEnter={() => setHoveredId(effect.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: '20px 22px',
                background: isHovered
                  ? 'rgba(255,255,255,0.04)'
                  : 'rgba(255,255,255,0.015)',
                border: `1px solid ${isHovered ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 12,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                color: '#fff',
                transition: 'all 0.2s ease',
                backdropFilter: 'blur(10px)',
                boxShadow: isHovered ? '0 4px 24px rgba(0,0,0,0.3)' : 'none',
                textDecoration: 'none',
              }}
            >
              {/* Top row: label + status */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}>
                <span style={{
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                }}>
                  {effect.label}
                </span>
                <StatusBadge status={effect.status} />
              </div>

              {/* Category + technique */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <CategoryPill category={effect.category} />
                <span style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.35)',
                }}>
                  {effect.technique}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function InfoPanel({ effect, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 380,
          height: '100vh',
          backgroundColor: 'rgba(18,18,18,0.95)',
          backdropFilter: 'blur(20px)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          padding: '32px 28px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#fff',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          boxSizing: 'border-box',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            alignSelf: 'flex-end',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.6)',
            borderRadius: 8,
            width: 32,
            height: 32,
            cursor: 'pointer',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'inherit',
          }}
        >
          x
        </button>

        {/* Title + badges */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {effect.label}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusBadge status={effect.status} />
            <CategoryPill category={effect.category} />
          </div>
        </div>

        {/* Description */}
        <div>
          <div style={sectionLabel}>Description</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.7)' }}>
            {effect.description}
          </p>
        </div>

        {/* Technique */}
        <div>
          <div style={sectionLabel}>Technique</div>
          <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
            {effect.technique}
          </p>
        </div>

        {/* Tools */}
        <div>
          <div style={sectionLabel}>Tools</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {effect.tools.map(tool => (
              <ToolPill key={tool}>{tool}</ToolPill>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <div style={sectionLabel}>Notes</div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.5)' }}>
            {effect.notes}
          </p>
        </div>
      </div>
    </div>
  )
}

const sectionLabel = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'rgba(255,255,255,0.3)',
  marginBottom: 8,
}

function DemoView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [showInfo, setShowInfo] = useState(false)
  const currentEffect = effects.find(e => e.id === id)

  // Unknown effect ID — go home
  if (!currentEffect) {
    return <Homepage />
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#0a0a0a',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Back button */}
      <Link
        to="/"
        onClick={() => setShowInfo(false)}
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
          zIndex: 20,
          padding: '8px 16px',
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          color: 'rgba(255,255,255,0.7)',
          cursor: 'pointer',
          fontSize: 13,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontWeight: 500,
          transition: 'all 0.2s',
          textDecoration: 'none',
        }}
      >
        ← Library
      </Link>

      {/* Info button */}
      <button
        onClick={() => setShowInfo(v => !v)}
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 20,
          width: 36,
          height: 36,
          background: showInfo ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          color: 'rgba(255,255,255,0.7)',
          cursor: 'pointer',
          fontSize: 16,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
        }}
      >
        i
      </button>

      {/* Canvas */}
      <Suspense fallback={
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 14,
        }}>
          Loading...
        </div>
      }>
        <Canvas
          key={id}
          camera={{ position: [0, 0, 8], fov: 50 }}
          style={{ width: '100%', height: '100%' }}
          gl={{ stencil: true, antialias: true }}
        >
          <Suspense fallback={<LoadingFallback />}>
            <SceneContent activeDemo={id} />
          </Suspense>
        </Canvas>
      </Suspense>

      {/* Hint */}
      <div style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.35)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 13,
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        {currentEffect?.hint}
      </div>

      {/* Info panel */}
      {showInfo && currentEffect && (
        <InfoPanel
          effect={currentEffect}
          onClose={() => setShowInfo(false)}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
      <Route path="/effect/:id" element={<DemoView />} />
    </Routes>
  )
}
