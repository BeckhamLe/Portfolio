# Product

## Register

brand

## Users

Anyone who lands on the site — hiring managers, collaborators, peers, curious strangers, people following a link from somewhere. The portfolio intentionally does not narrow to a single persona or try to optimize for a specific buyer. The assumption is a visitor makes a ten-second judgment on whether Beckham is interesting, then either bounces or keeps exploring.

The site is not a resumé. Anyone who wants a resumé-shaped summary can read the LinkedIn. This is the thing you send when you want someone to form their own opinion about whether they'd want to work with you.

## Product Purpose

Be a portfolio that refuses the template.

Most personal sites are Squarespace-shaped: hero, three-column grid of services, logo wall, contact form. They read AI-generated on first glance and say nothing about the person who built them. This site exists to be the opposite of that — a site where the first thing you notice is that it's not generic, and the second thing you notice is that someone made a deliberate choice about what it should *be*.

Success has two gates:
1. **Internal** — Beckham is content with it. No longer embarrassed to link.
2. **External** — a visitor can't confuse this with any of the portfolios that come out of template builders or AI generators.

The site being a crafted object IS the argument for working with him. It's not an argument the copy makes; it's an argument the interface makes by existing.

## Brand Personality

Three words: **intentional, alive, authored.**

- **Intentional** — every element is a chosen element, not a default. No template-shaped sections. No "because every site has this" sections.
- **Alive** — things respond. The page is not static. Motion, state, interactivity are part of the design language, not decoration on top of it.
- **Authored** — a human with specific taste made this. You can tell from the object itself, before reading any copy.

Confident without being loud. Not a site screaming "HIRE ME." A site that presents a world and lets the world do the talking.

Lusion.co is the spiritual reference for *commitment level* and *motion as personality* — not for aesthetic copy-paste. Personal aesthetic influences (JoJo, Gachiakuta, anime design) inform Beckham's general taste but do not dictate the site's visual style. The site's look emerges from whichever environment it commits to, not from a pre-chosen aesthetic mood board.

## Anti-references

The site must not read as any of these on first glance:

- **Template-builder output** — Wix, Squarespace, Webflow community templates, Framer starter packs. Anything that reads as a purchased layout.
- **Corporate template site** — top-right hamburger nav, hero + three-column grid of services, logo wall, centered CTA, FAQ accordion, footer-as-sitemap. The entire pattern.
- **AI-generated slop** — if a stranger could look at it and say "an LLM made this" without doubt, it has failed. This is the hardest bar and the most important one.
- **Generic dev portfolio** — photo + "I'm passionate about building digital experiences" + job timeline + skill-bars + contact form. The visual language of the bootcamp-graduate portfolio genre.
- **LinkedIn-voice copy** — "I'm a developer passionate about X," "driven by curiosity," "always learning." No hedging, no filler credentials language, no self-description-by-adjective.
- **Neo-brutalism / radical minimalism** — stripped-down raw aesthetic that reads as "I didn't design this on purpose."
- **Dark-and-moody by reflex** — not a dark theme just because dark themes look cool. Theme should emerge from the committed environment, not a mood preset.

The category-reflex check from impeccable applies in reverse: if someone could guess the aesthetic from the phrase "developer portfolio" alone (dark background, terminal green, monospace font, matrix rain, typewriter hero), it has collapsed to the training-data default.

## Design Principles

1. **Environment-as-navigation.** The site IS a world. Interaction elements (buttons, knobs, levers, plots, doors — whatever the world contains) live *inside* the environment and do the job that a nav bar would do. There is no traditional top-of-page nav, ever. If the user needs to get somewhere, they use something that exists in the world.

2. **Commit to one world hard.** Araki principle: one chosen object or scene, executed with full conviction, beats five competing metaphors every time. Five half-ideas read as template. One idea pushed to its logical end reads as authored. The first environment (v1) is a vintage elevator panel. Later environments, if any, replace it wholesale — they don't stack on top of it.

3. **Every element earns its place.** Cut is the default. If a section, element, or decoration doesn't serve the world or the content, it goes. Fake volume (more projects than exist, padding sections to feel full) is forbidden. Real over plentiful.

4. **Motion reads physical without simulating physics.** Spring curves, secondary motion, eased timing, tiny imperfections (slight overshoot, micro-vibration on press, end-of-travel settle). The site feels mechanical without shipping a physics engine. Match-and-refuse: linear easing on anything that should feel weighted.

5. **Code-as-art over asset-heavy.** Default to drawing visual elements in CSS, SVG, and shaders instead of shipping raster assets. A committed-reduced style reads as authored. Raster assets either look generic (stock) or require illustration time that blows scope. Exceptions allowed when the asset is genuinely load-bearing to the aesthetic.

## Accessibility & Inclusion

Commitment floor — what must not be compromised for visitors who can't use the site the intended way:

- **`prefers-reduced-motion` respected.** Heavy transitions (door slides, screen static, camera pushes) downgrade to simple cuts when the user has this OS setting enabled.
- **Keyboard navigable.** Any element that functions as navigation (buttons, knobs, levers, clickable world elements) must be focusable with `Tab` and triggerable with `Enter` / `Space`. Focus indicators must be visible, even if styled to match the environment.
- **Meaningful alt text** on images that carry information. Decorative elements get empty alt.
- **Readable body text contrast.** No hard WCAG AA blanket commitment — the aesthetic is allowed to break AA for accents and mood — but actual sentences of content must not be unreadable.
- **No dependence on color alone** for state. Paired with shape, position, or motion.

This is the "creative sites that still give a shit" posture — the same bar Lusion, Resn, Awwwards winners hit in practice. Roughly 2% of build effort, keeps the door open to users who'd otherwise bounce instantly.
