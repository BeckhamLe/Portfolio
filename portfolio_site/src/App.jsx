import { useState, useMemo, useCallback } from 'react'
import './App.css'

/* ---------------------------------------------------------
   5x7 dot-matrix alphabet
   Only the letters the site uses. Each row is 5 chars wide.
   '1' = lit, '0' = dim.
   --------------------------------------------------------- */
const DOT_FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  W: ['10001', '10001', '10001', '10001', '10101', '11011', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
}

const DOT_COLS = 5
const DOT_ROWS = 7

function DotMatrixText({ text, cellSize = 6, gap = 1, letterGap = 3 }) {
  const step = cellSize + gap
  const letterWidth = DOT_COLS * step - gap
  const spacing = letterGap * step
  const letters = text.toUpperCase().split('')
  const totalWidth = letters.length * letterWidth + (letters.length - 1) * spacing
  const totalHeight = DOT_ROWS * step - gap

  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className="lcd-svg"
    >
      {letters.map((char, li) => {
        const bitmap = DOT_FONT[char] || DOT_FONT[' ']
        const xOffset = li * (letterWidth + spacing)
        return bitmap.flatMap((row, ri) =>
          row.split('').map((bit, ci) => (
            <circle
              key={`${li}-${ri}-${ci}`}
              cx={xOffset + ci * step + cellSize / 2}
              cy={ri * step + cellSize / 2}
              r={cellSize / 2}
              className={bit === '1' ? 'lcd-dot lcd-dot--on' : 'lcd-dot lcd-dot--off'}
            />
          ))
        )
      })}
    </svg>
  )
}

/* ---------------------------------------------------------
   Floor content
   --------------------------------------------------------- */

function Lobby() {
  return (
    <section className="floor floor--lobby" aria-labelledby="lobby-heading">
      <div className="directory-plate" role="group" aria-labelledby="lobby-heading">
        <div className="plate-header">
          <span className="plate-chip" aria-hidden="true" />
          <span className="plate-serial">SERIES 3 &middot; 1987</span>
          <span className="plate-chip" aria-hidden="true" />
        </div>
        <h1 id="lobby-heading" className="plate-name">BECKHAM LE</h1>
        <p className="plate-role">ENGINEER &nbsp;·&nbsp; WITH TASTE</p>
        <div className="plate-rule" aria-hidden="true" />
        <dl className="plate-directory">
          <div className="plate-row">
            <dt>FLOOR 1</dt><dd>WORK</dd>
          </div>
          <div className="plate-row">
            <dt>FLOOR 2</dt><dd>ABOUT</dd>
          </div>
          <div className="plate-row">
            <dt>FLOOR 3</dt><dd>CONTACT</dd>
          </div>
        </dl>
        <div className="plate-screws" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
      </div>

      <div className="index-card" aria-label="Welcome note">
        <span className="card-pin" aria-hidden="true" />
        <p className="card-body">
          I build ambitious things and I’m someone you actually want on your
          team. Pick a floor.
        </p>
        <span className="card-sig">— BL</span>
      </div>
    </section>
  )
}

const PROJECTS = [
  {
    name: 'Unpack',
    tagline: 'Presentation builder',
    status: 'LIVE',
    blurb:
      'An AI tool that helps you figure out what you’re trying to say before it generates slides. Content clarity before content creation.',
    href: 'https://unpack.pro',
    hrefLabel: 'unpack.pro',
  },
  {
    name: 'Doji',
    tagline: 'Avatar-creation waiting UX',
    status: 'DELIVERED',
    blurb:
      'Reimagining the waiting experience during avatar creation for the Doji app. Built for the Doji team.',
    href: 'https://dojiavatarcreating.vercel.app/',
    hrefLabel: 'dojiavatarcreating.vercel.app',
  },
  {
    name: 'Effects Library',
    tagline: 'R3F shader demos',
    status: 'ONGOING',
    blurb:
      '38+ shader-driven 3D effects, transitions, and post-processing demos. A test bed for everything I want to learn about real-time visuals.',
    href: 'https://effectslibrary.vercel.app/',
    hrefLabel: 'effectslibrary.vercel.app',
  },
  {
    name: 'AR Scavenger Hunt',
    tagline: 'Location-based multiplayer AR',
    status: 'DEPLOYED',
    blurb:
      'Team-built AR game with location anchors, multiplayer state, and dynamic clue generation. Deployed to TestFlight.',
    href: 'https://github.com/beckhamle',
    hrefLabel: 'github.com/beckhamle',
  },
  {
    name: 'LLM Society',
    tagline: 'Emergent-behavior experiment',
    status: 'EXPERIMENTAL',
    blurb:
      'Autonomous LLM agents simulating social dynamics. Research into what shows up when you let models talk to each other long enough.',
    href: 'https://github.com/beckhamle',
    hrefLabel: 'github.com/beckhamle',
  },
]

function Work() {
  return (
    <section className="floor floor--work" aria-labelledby="work-heading">
      <header className="floor-header">
        <span id="work-heading" className="floor-header-title">
          DISPATCH LOG
        </span>
        <span className="floor-header-meta">
          <span>{PROJECTS.length.toString().padStart(2, '0')} ITEMS ON FILE</span>
          <span className="floor-header-dot" aria-hidden="true" />
          <span>FLOOR 1</span>
        </span>
      </header>

      <ol className="ticket-rail">
        {PROJECTS.map((p, i) => (
          <li
            className="ticket"
            key={p.name}
            style={{ '--ticket-tilt': `${(i % 2 === 0 ? -0.4 : 0.3)}deg` }}
          >
            <span className="ticket-clip" aria-hidden="true" />
            <div className="ticket-header">
              <span className="ticket-serial">
                NO. {String(i + 1).padStart(3, '0')}
              </span>
              <span className={`ticket-stamp ticket-stamp--${p.status.toLowerCase()}`}>
                {p.status}
              </span>
            </div>
            <h3 className="ticket-title">{p.name}</h3>
            <p className="ticket-tagline">{p.tagline}</p>
            <p className="ticket-body">{p.blurb}</p>
            <div className="ticket-route">
              <span className="ticket-route-label">ROUTE&nbsp;TO</span>
              <a
                className="ticket-route-link"
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {p.hrefLabel} <span aria-hidden="true">↗</span>
              </a>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function About() {
  return (
    <section className="floor floor--about" aria-labelledby="about-heading">
      <div className="folder">
        <div className="folder-tab">
          <span className="folder-tab-text">PERSONNEL&nbsp;:&nbsp;LE, B.</span>
        </div>
        <div className="folder-body">
          <div className="folder-stamp" aria-hidden="true">FILE OPENED</div>

          <h2 id="about-heading" className="sr-only">About</h2>

          <dl className="dossier">
            <div className="dossier-row">
              <dt>NAME</dt>
              <dd>Beckham Le</dd>
            </div>
            <div className="dossier-row">
              <dt>CLASSIFICATION</dt>
              <dd>Engineer with creative-director taste</dd>
            </div>
            <div className="dossier-row">
              <dt>STATUS</dt>
              <dd>Early-career on paper. Trajectory confirmed by work.</dd>
            </div>
            <div className="dossier-row">
              <dt>PRINCIPLES</dt>
              <dd>
                <ol className="dossier-principles">
                  <li>
                    <span className="principle-k">Craft over comfort.</span>
                    {' '}Complacency is poison. Rather be challenged than safe.
                  </li>
                  <li>
                    <span className="principle-k">Tech + taste.</span>
                    {' '}Engineering skill expressed through intentional design,
                    not one or the other.
                  </li>
                  <li>
                    <span className="principle-k">Trajectory over credentials.</span>
                    {' '}Judge by the work, not the resume line.
                  </li>
                </ol>
              </dd>
            </div>
            <div className="dossier-row">
              <dt>NOTES</dt>
              <dd>
                The Araki principle: find the one or two things that are
                distinctly yours and commit to them fully. This elevator is one
                of them.
              </dd>
            </div>
          </dl>

          <footer className="folder-footer" aria-hidden="true">
            <span>FORM 3B-87</span>
            <span>AUTH: INTERNAL</span>
            <span>REV. 04/2026</span>
          </footer>
        </div>
      </div>
    </section>
  )
}

const LINKS = [
  { label: 'EMAIL',    value: 'beckhamle2023@gmail.com',       href: 'mailto:beckhamle2023@gmail.com' },
  { label: 'GITHUB',   value: 'github.com/beckhamle',          href: 'https://github.com/beckhamle' },
  { label: 'LINKEDIN', value: 'linkedin.com/in/beckham-le',    href: 'https://www.linkedin.com/in/beckham-le-51050a1b6/' },
  { label: 'RADIO',    value: 'x.com/beckhamle2023',           href: 'https://x.com/beckhamle2023' },
]

function Contact() {
  return (
    <section className="floor floor--contact" aria-labelledby="contact-heading">
      <div className="patch-panel">
        <header className="patch-header">
          <span className="patch-title">COMM&nbsp;PATCH</span>
          <span className="patch-series" id="contact-heading">
            SERIES 3 &nbsp;·&nbsp; FLOOR 3
          </span>
          <span className="patch-lamp" aria-hidden="true" />
        </header>

        <ul className="channel-list">
          {LINKS.map((l, i) => {
            const isExternal = l.href.startsWith('http')
            return (
              <li key={l.label} className="channel">
                <a
                  className="channel-link"
                  href={l.href}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  aria-label={`Patch to ${l.label.toLowerCase()}: ${l.value}`}
                >
                  <span className="channel-num">CH.{String(i + 1).padStart(2, '0')}</span>
                  <span className="channel-name">{l.label}</span>
                  <span className="channel-lcd">
                    <span className="channel-lcd-text">{l.value}</span>
                  </span>
                  <span className="patch-action" aria-hidden="true">
                    <span className="patch-socket" />
                    <span className="patch-label">PATCH</span>
                    <span className="patch-arrow">→</span>
                  </span>
                </a>
              </li>
            )
          })}
        </ul>

        <footer className="patch-footer">
          <span>ROUTE A CHANNEL TO CONNECT.</span>
        </footer>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------
   Floor registry
   --------------------------------------------------------- */
const FLOORS = [
  { num: 'L', label: 'LOBBY',   Component: Lobby },
  { num: '1', label: 'WORK',    Component: Work },
  { num: '2', label: 'ABOUT',   Component: About },
  { num: '3', label: 'CONTACT', Component: Contact },
]

/* ---------------------------------------------------------
   Elevator panel
   --------------------------------------------------------- */
function ElevatorPanel({ floors, activeNum, onSelect, disabled }) {
  const current = floors.find((f) => f.num === activeNum) ?? floors[0]

  return (
    <aside className="panel" aria-label="Elevator control panel">
      <div className="panel-bezel">
        <div className="panel-face">
          <div className="lcd" role="status" aria-live="polite">
            <span className="lcd-frame">
              <span className="lcd-scanline" aria-hidden="true" />
              <span className="lcd-inner">
                <DotMatrixText text={current.label} />
              </span>
            </span>
            <span className="lcd-caption">
              <span className="lcd-caption-dot" aria-hidden="true" /> FLOOR
            </span>
          </div>

          <div className="button-stack">
            {floors.map((f) => {
              const isActive = f.num === activeNum
              return (
                <button
                  key={f.num}
                  type="button"
                  className={`floor-btn${isActive ? ' is-active' : ''}`}
                  onClick={() => onSelect(f.num)}
                  disabled={disabled && !isActive}
                  aria-pressed={isActive}
                  aria-label={`Floor ${f.num}, ${f.label}`}
                >
                  <span className="floor-btn-led" aria-hidden="true" />
                  <span className="floor-btn-cap">
                    <span className="floor-btn-num">{f.num}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="panel-plate" aria-hidden="true">
            <span className="plate-row">
              <span className="plate-dot" />
              <span className="plate-text">BL-87 / SERIES 3</span>
            </span>
            <span className="plate-row">
              <span className="plate-text plate-text--muted">
                IN CASE OF FIRE USE STAIRS
              </span>
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}

/* ---------------------------------------------------------
   Interior — the framed content region, with sliding doors
   --------------------------------------------------------- */
function Interior({ doorsClosed, children }) {
  return (
    <section className="interior" aria-label="Floor content">
      <div className="interior-wall">
        <div className="interior-frame">
          <div className="interior-content">{children}</div>
        </div>
      </div>
      <div
        className={`door door--left${doorsClosed ? ' is-closed' : ''}`}
        aria-hidden="true"
      />
      <div
        className={`door door--right${doorsClosed ? ' is-closed' : ''}`}
        aria-hidden="true"
      />
      <div className="interior-glyph" aria-hidden="true">
        <span>▲</span>
        <span>▼</span>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------
   App root — floor state, transition orchestration
   --------------------------------------------------------- */
const DOOR_CLOSE_MS = 720
const DOOR_HOLD_MS = 100   // doors fully closed, content swap window
const DOOR_OPEN_MS = 820

function App() {
  const [activeNum, setActiveNum] = useState('L')
  const [displayedNum, setDisplayedNum] = useState('L')
  const [doorsClosed, setDoorsClosed] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  )

  const handleSelect = useCallback(
    (num) => {
      if (num === activeNum || isTransitioning) return

      if (prefersReducedMotion) {
        setActiveNum(num)
        setDisplayedNum(num)
        return
      }

      setActiveNum(num)
      setIsTransitioning(true)
      setDoorsClosed(true)

      // Swap content while doors are closed.
      window.setTimeout(() => {
        setDisplayedNum(num)
      }, DOOR_CLOSE_MS + DOOR_HOLD_MS / 2)

      // Open doors after hold, clear transition flag after open completes.
      window.setTimeout(() => {
        setDoorsClosed(false)
      }, DOOR_CLOSE_MS + DOOR_HOLD_MS)

      window.setTimeout(() => {
        setIsTransitioning(false)
      }, DOOR_CLOSE_MS + DOOR_HOLD_MS + DOOR_OPEN_MS)
    },
    [activeNum, isTransitioning, prefersReducedMotion]
  )

  const DisplayedComponent =
    (FLOORS.find((f) => f.num === displayedNum) ?? FLOORS[0]).Component

  return (
    <main className="stage">
      <ElevatorPanel
        floors={FLOORS}
        activeNum={activeNum}
        onSelect={handleSelect}
        disabled={isTransitioning}
      />
      <Interior doorsClosed={doorsClosed}>
        <DisplayedComponent />
      </Interior>
    </main>
  )
}

export default App
