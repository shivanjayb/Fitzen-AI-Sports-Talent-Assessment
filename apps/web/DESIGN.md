---
name: Fitzen
description: A sports-science lab in a phone camera, styled after Apple Fitness+ (unofficial): black ground, flat cards, Liquid Glass navigation, ring hues for activity, studio artwork with a shaded human demonstrator.
sources: "Fitness+ Reference" and "Apple Native" design systems (claude.ai artifacts, unofficial)
colors:
  ground: "#000000"
  surface: "#1c1c1e"
  fill: "#2c2c2e"
  ink: "#ffffff"
  ink-muted: "#8e8e93"
  cta: "#ffffff (Let's Go: white capsule, black text)"
  tint: "#a6ff00 (links, selected tab, focus)"
  ring-move: "#fa114f"
  ring-exercise: "#92e82a"
  ring-stand: "#00d9ff"
  zone-good: "#30d158"
  zone-ok: "#ffd60a"
  zone-bad: "#ff453a"
typography:
  font: "system stack (SF Pro on Apple devices); never bundle SF Pro"
  numerals: "ui-rounded / SF Pro Rounded, tabular"
  large-title: "34px bold"
  section-title: "22px bold, tint 'See All' on the right"
  body: "17px, -0.022em"
---

# Fitzen design system (Fitness+ style)

Source of truth: `src/app/glass.css` (tokens + shared classes) and `src/app/landing.css` (landing).

- **Layers:** content is opaque (`--bg`, flat `--bg-2` cards, no shadows). Navigation floats above it as glass (`.glassy`: tint, blur, rim, `--shadow-glass`): the tab bar, search button, header buttons and detail back/share. Reduce Transparency swaps glass for a solid tint.
- **Navigation:** Summary · Train · Compete in a floating capsule plus a separate search circle (`Shell.tsx`). Phones: bottom. ≥ 900px: top centre, labels beside icons. Profile and the local coach live in every large-title header (`PageHeader`). History opens from Summary and Train › More.
- **Train (Fitness+ tab):** featured carousel (auto-advances, pauses on hover/focus/Reduce Motion), Workout Types tiles, shelves per category with See All (`/app?type=`), Learn the Technique lessons, More rows. `/search` browses and filters.
- **Artwork:** every exercise is drawn by `Figure.tsx` from the engine's own synthetic athlete: a shaded, dressed human (cylindrical limb shading, far side in shade, floor shadow) on a studio backdrop in its category hue (`[data-cat]` sets `--hue`/`--hue-2`). Cards use a cached still of the key pose; heroes, hover and the detail page loop one rep live. Demo sessions and the landing hero draw the same athlete under the tracking skeleton.
- **Exercise page (`/exercise/:id`):** animated hero, Let's Go (camera), Analyse Video, Watch Demo, facts, How to Do It (start / mid / key pose with the engine's cues and target angles), a YouTube video lesson (our artwork until tapped, then `youtube-nocookie.com`; CSP `frame-src` allows only that host), Set Up, What We Measure, More Like This.
- **Rings:** `Rings.tsx`, ring hues fixed in both themes, fill on mount over 0.9 s and pulse when closed. Only for the athlete's own data (Summary, Results).
- **Motion:** press scale 0.96, smooth/snappy springs, tab pill glides, figures pause off-screen; `prefers-reduced-motion` stops all of it.
- **Judgement colours** green/amber/red stay reserved for form feedback.
- **Brand:** Fitzen name and mark only. Never use Apple's name, logos, SF Pro files, SF Symbols or trainer imagery.
