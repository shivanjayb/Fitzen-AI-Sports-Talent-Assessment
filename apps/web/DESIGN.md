---
name: Fitzen
description: A sports-science lab in a phone camera, styled after Apple Fitness+ — black canvas, flat cards, ring colours, system type.
colors:
  bg: "#000000"
  card: "#1c1c1e"
  card-2: "#2c2c2e"
  fill: "rgba(118, 118, 128, 0.24)"
  text: "#ffffff"
  text-2: "rgba(235, 235, 245, 0.6)"
  text-3: "rgba(235, 235, 245, 0.32)"
  accent: "#a6ff00"
  move: "#fa114f"
  exercise: "#a6ff00"
  stand: "#00e5ff"
  yellow: "#ffd60a"
  zone-good: "#30d158"
  zone-ok: "#ffd60a"
  zone-bad: "#ff453a"
typography:
  font: "-apple-system / SF Pro (Roboto on Android); never bundle SF Pro"
  numerals: "ui-rounded / SF Pro Rounded, weight 600"
  large-title: "34px bold, +0.37 tracking, uppercase date above it"
  section-title: "22px bold with an accent 'See All' on the right"
  body: "17px regular, -0.02em"
---

# Fitzen design system (Fitness+ style)

Source of truth: `src/app/glass.css` (tokens + shared classes) and `src/app/landing.css` (landing).

- **Canvas:** pure black. Content sits on flat `#1c1c1e` cards (`.glass`, `.panel`, `.kv`, `.list-item`) — no borders, no shadows.
- **Material:** frosted blur only on the floating tab bar, sheets and the live session HUD.
- **Shelves:** the Train tab shows each category as a horizontal snap-scrolling `.shelf` of artwork cards (`.ex-card` with `data-cat` hue); "See All" switches to the `.grid`.
- **Rings:** `Rings.tsx` draws three concentric progress rings (move red, exercise green, stand cyan) on Train and Progress. Metric values use the same colours in order (`.hero-stat`, `.kv`).
- **Controls:** capsule buttons (`.btn`, 50px), accent primary with black text; iOS search field and segmented control.
- **Judgement colours** green/amber/red are reserved for form feedback.
- **Brand:** Fitzen name and mark only. Never use Apple's name, logos, SF Pro font files or product imagery.
