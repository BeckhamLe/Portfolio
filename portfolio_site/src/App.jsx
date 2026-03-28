import { useEffect } from 'react'
import Lenis from 'lenis'
import './App.css'

const projects = [
  {
    name: 'Presentation Builder',
    desc: 'AI-powered slide creation tool with real-time collaboration and intelligent layout suggestions.',
    tags: ['React', 'AI', 'Real-time'],
  },
  {
    name: 'AR Scavenger Hunt',
    desc: 'Location-based augmented reality game with multiplayer support and dynamic clue generation.',
    tags: ['AR', 'Mobile', 'Multiplayer'],
  },
  {
    name: 'LLM Society Experiment',
    desc: 'Autonomous agents simulating social dynamics, exploring emergent behavior in AI populations.',
    tags: ['AI Agents', 'Simulation', 'Research'],
  },
  {
    name: 'Effects Library',
    desc: 'Collection of 38+ shader-driven 3D effects, transitions, and post-processing demos built with R3F.',
    tags: ['WebGL', 'Shaders', 'R3F'],
  },
]

function App() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => lenis.destroy()
  }, [])

  return (
    <>
      {/* Nav */}
      <nav className="nav">
        <div className="nav-logo">BL</div>
        <ul className="nav-links">
          <li><a href="#about">About</a></li>
          <li><a href="#work">Work</a></li>
          <li><a href="#contact">Contact</a></li>
        </ul>
      </nav>

      {/* Hero */}
      <section className="hero">
        <span className="hero-label">Creative Developer</span>
        <h1 className="hero-title">Building Digital Experiences</h1>
        <p className="hero-subtitle">
          Developer focused on crafting immersive web experiences
          with creative technology and thoughtful design.
        </p>
        <div className="hero-scroll">
          <span>Scroll</span>
          <div className="hero-scroll-line" />
        </div>
      </section>

      <div className="divider" />

      {/* About */}
      <section id="about" className="section">
        <div className="about">
          <div className="about-left">
            <span className="section-label">About</span>
            <h2 className="section-title">Crafting at the intersection of code and design</h2>
            <p className="section-text">
              I build things for the web with a focus on interactive experiences,
              3D graphics, and creative coding. I care about performance, attention
              to detail, and making technology feel human.
            </p>
          </div>
          <div className="about-right">
            <div className="about-stat">
              <span className="about-stat-number">38+</span>
              <span className="about-stat-label">WebGL effects built</span>
            </div>
            <div className="about-stat">
              <span className="about-stat-number">4</span>
              <span className="about-stat-label">Shipped projects</span>
            </div>
            <div className="about-stat">
              <span className="about-stat-number">R3F</span>
              <span className="about-stat-label">React Three Fiber</span>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* Projects */}
      <section id="work" className="section">
        <span className="section-label">Selected Work</span>
        <h2 className="section-title">Projects</h2>
        <div className="projects-grid">
          {projects.map((project) => (
            <article key={project.name} className="project-card">
              <div className="project-image">
                {project.name}
              </div>
              <div className="project-info">
                <h3 className="project-name">{project.name}</h3>
                <p className="project-desc">{project.desc}</p>
                <div className="project-tags">
                  {project.tags.map((tag) => (
                    <span key={tag} className="project-tag">{tag}</span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="divider" />

      {/* Contact */}
      <section id="contact" className="section">
        <div className="contact">
          <div className="contact-left">
            <span className="section-label">Get in Touch</span>
            <h2 className="section-title">Let's work together</h2>
            <p className="section-text">
              Open to creative development roles, freelance projects,
              and interesting collaborations.
            </p>
            <div className="contact-links">
              <a href="https://github.com/beckhamle" className="contact-link" target="_blank" rel="noopener noreferrer">GitHub</a>
              <a href="https://linkedin.com/in/beckhamle" className="contact-link" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            </div>
          </div>
          <a href="mailto:hello@beckhamle.dev" className="contact-email">hello@beckhamle.dev</a>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <span className="footer-text">&copy; 2026 Beckham Le</span>
        <span className="footer-text">Built with care</span>
      </footer>
    </>
  )
}

export default App
