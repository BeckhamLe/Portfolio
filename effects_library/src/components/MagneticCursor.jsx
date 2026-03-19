import { useRef, useEffect } from 'react'
import { Html } from '@react-three/drei'

export default function MagneticCursor() {
  const cursorRef = useRef(null)
  const mousePos = useRef({ x: 0, y: 0 })
  const cursorPos = useRef({ x: 0, y: 0 })
  const prevCursorPos = useRef({ x: 0, y: 0 })
  const velocity = useRef({ x: 0, y: 0 })
  const rafRef = useRef(null)
  const isDown = useRef(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const handleMouseMove = (e) => {
      mousePos.current.x = e.clientX
      mousePos.current.y = e.clientY
    }

    const handleMouseDown = () => {
      isDown.current = true
      if (cursorRef.current) {
        cursorRef.current.style.width = '12px'
        cursorRef.current.style.height = '12px'
      }
    }

    const handleMouseUp = () => {
      isDown.current = false
      if (cursorRef.current) {
        cursorRef.current.style.width = '16px'
        cursorRef.current.style.height = '16px'
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)

    const animate = () => {
      const lerpFactor = 0.15

      // Lerp cursor position toward mouse
      cursorPos.current.x += (mousePos.current.x - cursorPos.current.x) * lerpFactor
      cursorPos.current.y += (mousePos.current.y - cursorPos.current.y) * lerpFactor

      // Calculate velocity
      const vx = cursorPos.current.x - prevCursorPos.current.x
      const vy = cursorPos.current.y - prevCursorPos.current.y
      velocity.current.x = vx
      velocity.current.y = vy
      prevCursorPos.current.x = cursorPos.current.x
      prevCursorPos.current.y = cursorPos.current.y

      // Magnetic pull toward data-magnetic elements
      let targetX = cursorPos.current.x
      let targetY = cursorPos.current.y
      let isNearMagnetic = false

      if (containerRef.current) {
        const magneticEls = containerRef.current.querySelectorAll('[data-magnetic]')
        magneticEls.forEach((el) => {
          const rect = el.getBoundingClientRect()
          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          const dist = Math.sqrt(
            (mousePos.current.x - centerX) ** 2 + (mousePos.current.y - centerY) ** 2
          )
          if (dist < 80) {
            const pull = (1 - dist / 80) * 0.4
            targetX += (centerX - targetX) * pull
            targetY += (centerY - targetY) * pull
            isNearMagnetic = true
          }
        })
      }

      // Apply magnetic offset
      const finalX = cursorPos.current.x + (targetX - cursorPos.current.x)
      const finalY = cursorPos.current.y + (targetY - cursorPos.current.y)

      // Velocity stretch
      const speed = Math.sqrt(vx * vx + vy * vy)
      const angle = Math.atan2(vy, vx)
      const stretch = 1 + Math.min(speed * 0.003, 0.5)
      const compress = 1 / stretch

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${finalX}px, ${finalY}px) translate(-50%, -50%) rotate(${angle}rad) scaleX(${stretch}) scaleY(${compress})`

        // Magnetic proximity appearance
        if (isNearMagnetic && !isDown.current) {
          cursorRef.current.style.width = '24px'
          cursorRef.current.style.height = '24px'
          cursorRef.current.style.border = '1px solid rgba(255,255,255,0.4)'
        } else if (!isDown.current) {
          cursorRef.current.style.width = '16px'
          cursorRef.current.style.height = '16px'
          cursorRef.current.style.border = 'none'
        }
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const buttonStyle = {
    padding: '14px 28px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    color: 'rgba(255,255,255,0.7)',
    fontSize: '14px',
    fontFamily: 'system-ui',
    cursor: 'none',
    transition: 'border-color 0.2s, color 0.2s',
  }

  const handleButtonEnter = (e) => {
    e.target.style.borderColor = 'rgba(255,255,255,0.6)'
    e.target.style.color = 'rgba(255,255,255,1)'
  }

  const handleButtonLeave = (e) => {
    e.target.style.borderColor = 'rgba(255,255,255,0.2)'
    e.target.style.color = 'rgba(255,255,255,0.7)'
  }

  return (
    <>
      <color attach="background" args={['#0a0a0a']} />
      <Html fullscreen>
        <div
          ref={containerRef}
          style={{
            width: '100vw',
            height: '100vh',
            cursor: 'none',
            background: '#0a0a0a',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Cursor dot */}
          <div
            ref={cursorRef}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'white',
              pointerEvents: 'none',
              zIndex: 9999,
              mixBlendMode: 'difference',
              transition: 'width 0.2s, height 0.2s, border 0.2s',
              willChange: 'transform',
            }}
          />

          {/* Demo content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 30,
            }}
          >
            <p
              style={{
                color: 'rgba(255,255,255,0.4)',
                fontSize: 14,
                fontFamily: 'system-ui',
                marginBottom: 10,
                letterSpacing: '0.02em',
              }}
            >
              Custom cursor with smooth follow, velocity stretch, and magnetic snap
            </p>

            <p
              style={{
                color: 'rgba(255,255,255,0.25)',
                fontSize: 12,
                fontFamily: 'system-ui',
                marginBottom: 20,
              }}
            >
              Move your cursor around. Hover near the buttons.
            </p>

            <div style={{ display: 'flex', gap: 20 }}>
              <button
                data-magnetic
                style={buttonStyle}
                onMouseEnter={handleButtonEnter}
                onMouseLeave={handleButtonLeave}
              >
                View Project
              </button>
              <button
                data-magnetic
                style={buttonStyle}
                onMouseEnter={handleButtonEnter}
                onMouseLeave={handleButtonLeave}
              >
                Learn More
              </button>
              <button
                data-magnetic
                style={buttonStyle}
                onMouseEnter={handleButtonEnter}
                onMouseLeave={handleButtonLeave}
              >
                Contact
              </button>
            </div>
          </div>
        </div>
      </Html>
    </>
  )
}
