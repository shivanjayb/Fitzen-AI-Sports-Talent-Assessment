---
name: Fitzen
description: A sports-science lab in a phone camera. Liquid Glass over a living aurora.
colors:
  accent-lime: "#c8f135"
  accent-lime-light: "#5b8c00"
  accent-ink: "#0b1400"
  accent-cyan: "#64d2ff"
  zone-good: "#30d158"
  zone-good-light: "#137a36"
  zone-ok: "#ffd60a"
  zone-ok-light: "#a87800"
  zone-bad: "#ff453a"
  zone-bad-light: "#d93025"
  night-bg: "#05070b"
  night-text: "#f5f7fb"
  night-text-2: "rgba(235, 240, 255, 0.64)"
  night-text-3: "rgba(235, 240, 255, 0.4)"
  day-bg: "#eef2f8"
  day-text: "#0b0d12"
  day-text-2: "rgba(20, 24, 36, 0.62)"
  glass: "rgba(255, 255, 255, 0.075)"
  glass-strong: "rgba(255, 255, 255, 0.13)"
  glass-edge: "rgba(255, 255, 255, 0.16)"
  glass-hi: "rgba(255, 255, 255, 0.42)"
  aurora-blue: "#1f6fff"
  aurora-violet: "#7c3aed"
  aurora-teal: "#00c2a8"
  aurora-lime: "#b7ff3c"
typography:
  display:
    fontFamily: "Anybody Variable, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(2.7rem, 5.7vw, 5.4rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.035em"
    fontVariation: "\"wdth\" 112"
  headline:
    fontFamily: "Anybody Variable, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(2rem, 4.6vw, 3.4rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontVariation: "\"wdth\" 108"
  title:
    fontFamily: "Anybody Variable, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 700
    letterSpacing: "-0.02em"
    fontVariation: "\"wdth\" 105"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Inter, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  lede:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Inter, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(1.05rem, 1.5vw, 1.22rem)"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Inter, Segoe UI, Roboto, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 700
    letterSpacing: "0.03em"
  metric:
    fontFamily: "Anybody Variable, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 800
    letterSpacing: "-0.03em"
    fontFeature: "\"tnum\""
  mono:
    fontFamily: "SF Mono, ui-monospace, JetBrains Mono, monospace"
    fontSize: "0.95rem"
    fontWeight: 600
rounded:
  sm: "12px"
  md: "18px"
  lg: "24px"
  xl: "32px"
  stage: "34px"
  pill: "999px"
spacing:
  gutter: "clamp(16px, 4vw, 48px)"
  max: "1240px"
  app-max: "1100px"
  section: "clamp(64px, 10vw, 128px)"
  card: "18px"
  card-lg: "26px"
  gap: "12px"
components:
  button-primary:
    backgroundColor: "{colors.accent-lime}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.pill}"
    padding: "16px 26px"
  button-primary-sm:
    backgroundColor: "{colors.accent-lime}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  button-ghost:
    backgroundColor: "{colors.glass-strong}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.pill}"
    padding: "16px 26px"
  chip:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.night-text-2}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  chip-on:
    backgroundColor: "{colors.night-text}"
    textColor: "{colors.night-bg}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  glass-card:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card}"
  input-field:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.md}"
    padding: "13px 16px"
  angle-pill:
    backgroundColor: "rgba(8, 10, 18, 0.55)"
    textColor: "{colors.zone-good}"
    rounded: "{rounded.sm}"
    padding: "7px 12px"
---

# Design System: Fitzen

## Overview

**Creative North Star: "The Glass Lab at Night"**

Fitzen is a sports-science lab that fits in a pocket, and the interface looks like one: frosted instrument panels floating over a slow, living aurora, with a body drawn in light as the only picture on the page. Surfaces are translucent and refractive rather than opaque; everything the athlete touches responds on a spring. The world is dark by default and remaps, token for token, to a pale daylight version with the same structure.

Two voices share the work. Anybody, a variable-width grotesque set wide and tight, carries headlines, metrics and the wordmark with an athletic, stretched stance. The system sans carries everything you read. Colour has two jobs and never mixes them: lime and cyan are the brand accents; green, amber and red are judgement colours that mean *correct, almost, fix it* and appear only where form is being assessed.

Density is calm on the landing (big type, wide gutters, one idea per band) and instrument-dense in the app (stacked glass panels, tabular numbers, HUD overlays on the camera).

**Key Characteristics:**
- Translucent glass (blur 28px, saturate 185%) with a specular rim over a drifting four-blob aurora and 5% grain.
- Lime `#c8f135` as the single action colour; cyan `#64d2ff` for focus, timers and secondary highlights.
- Judgement colours reserved for measured form: skeleton bones, angle pills, grade tiles, accuracy bars.
- Pill-shaped controls, generously rounded panels (12–34px).
- Spring motion (`cubic-bezier(0.34, 1.56, 0.64, 1)`) on every press, chip and sheet.
- Skeleton linework and exercise pictograms are the only illustration.

## Colors

A near-black night sky lit by blue, violet, teal and lime aurora, with frosted white glass and one electric lime voice.

### Primary
- **Electric Lime** (accent-lime): the one action colour. Primary buttons, the second headline line, the live dot, the wordmark's head, text selection and caret. In light mode it deepens to **Moss Lime** (accent-lime-light) with white ink so it holds contrast.
- **Lime Ink** (accent-ink): the near-black green text set on lime buttons.

### Secondary
- **Pool Cyan** (accent-cyan): focus rings, the sport-cycle timer bar, rep-mode tags and the cool wash inside the live stage.

### Tertiary: judgement colours
- **Signal Green** (zone-good / zone-good-light): correct form. Also the "facts" bullets under the hero.
- **Caution Amber** (zone-ok / zone-ok-light): moderate form, "almost".
- **Flag Red** (zone-bad / zone-bad-light): incorrect form, "fix it"; the danger button.

### Neutral
- **Night Sky** (night-bg) / **Daylight Mist** (day-bg): page background in dark / light.
- **Starlight** (night-text) and its 64% and 40% steps (night-text-2, night-text-3): primary, secondary and faint text. Light mode uses **Ink** (day-text) at the same steps.
- **Frost** (glass, glass-strong, glass-edge, glass-hi): the four glass layers: fill, raised fill, 1px edge, top highlight. In light mode these become 50%, 72%, 85% and 100% white.
- **Aurora** (aurora-blue, aurora-violet, aurora-teal, aurora-lime): background blobs only, blurred 90px; pastel equivalents in light mode.

### Named Rules
**The Judgement Rule.** Green, amber and red mean correct, almost and fix it. They appear only on measured form (skeleton, angle pills, grades, accuracy bars, coaching tips) and never as decoration or brand colour.

**The One Voice Rule.** Lime is the only filled-button colour. One primary action per view; everything else is ghost glass.

**The Two Worlds Rule.** Every colour is a semantic token remapped for light and dark. Never hard-code a hex in a component; the live camera stage is the only surface that stays dark in both modes.

## Typography

**Display Font:** Anybody Variable (with the system sans as fallback)
**Body Font:** -apple-system / SF Pro Text (with Inter, Segoe UI, Roboto)
**Mono Font:** SF Mono (with ui-monospace, JetBrains Mono) for live HUD numbers

**Character:** A stretched, heavy athletic display face against a neutral, legible system sans. The width axis is the display face's expressive tool: headlines sit wide (105–125%) and tight (−0.03 to −0.04em).

### Hierarchy
- **Display** (800, clamp 2.7–5.4rem, 0.92, width 112%): the hero headline, two lines, second line in lime. The closing "Your turn." goes wider (125%, up to 6rem).
- **Headline** (800, clamp 2–3.4rem, 1.0, width 108%): section heads, max 18–22ch, balanced wrap.
- **Title** (700, 1.45rem, width 105%): step titles, stage exercise name.
- **Body** (400, 1rem, 1.55): explanatory copy, 34–56ch.
- **Lede** (400, clamp 1.05–1.22rem, 1.55): the hero's one-paragraph explanation, max 44ch, secondary text colour.
- **Label** (700, 0.72rem, +0.03em): stat captions, tags, field labels.
- **Metric** (800, 1.6rem up to 3.6rem, tabular): rep counts, cadence, range, grades. Units drop to body sans at 0.8rem.

### Named Rules
**The Width Pulse Rule.** The width axis moves only as a response: when the sport changes, the first headline line stretches from 150% to 112% in 1.1s. Nothing else animates font-stretch.

**The Tabular Rule.** Every live or measured number uses tabular figures so counters don't jitter.

## Layout

The landing sits in a centred column of `min(1240px, 100% − 2 × gutter)` with a fluid gutter (16–48px). The hero is a two-column grid (1.1fr copy / 0.9fr stage) filling the first viewport; below 900px it stacks with the stage under the headline and both CTAs still above the fold. Sections open with `clamp(64px, 10vw, 128px)` of top space (56px on phones). The exercise marquee breaks the column and runs full-bleed with faded edges.

App screens use a 1100px column, 18px side padding, bottom padding clearing the floating tab bar, and auto-fill grids (`minmax(165px, 1fr)` for exercise cards). Two-column panels appear at 860px and above. The live session is a full-screen fixed stage with a HUD laid out top / left / bottom inside the safe-area insets.

Internal rhythm runs on 6 / 10 / 12 / 14 / 18 / 22px steps; gaps between cards are 10–12px.

## Elevation & Depth

Depth comes from translucency, not stacking shadows. Every raised surface is glass: a blurred, saturated backdrop, a diagonal gradient fill, a 1px frost edge, an inset top highlight and one soft ambient drop shadow. A pointer-tracked radial sheen (`--mx`, `--my`) and a masked specular rim finish the material. The aurora below provides the colour that the glass refracts.

### Shadow Vocabulary
- **Glass ambient** (`inset 0 1px 0 var(--glass-hi), inset 0 -1px 1px rgba(255,255,255,.04), 0 18px 50px rgba(0,0,0,.45)`; light mode drop `0 16px 40px rgba(40,60,110,.16)`): every glass panel.
- **Lime glow** (`inset 0 1px 0 rgba(255,255,255,.55), 0 12px 32px -8px color-mix(accent 60%)`): primary buttons; the glow deepens to 75% on hover.
- **Zone ring** (`inset 0 0 0 1px color-mix(zone 55–70%)`): angle pills and zone chips carry their judgement as a hairline, not a fill.
- **Joint glow** (canvas shadowBlur 18px in the zone colour): skeleton bones in a judged zone.

### Named Rules
**The Frost-Not-Fill Rule.** A surface is raised by being glass (blur + edge + top highlight), never by a heavier opaque shadow.

## Shapes

Everything is rounded, and anything you press is a full pill (999px): buttons, chips, the nav bar, the tab bar, search, segmented controls. Panels step through 12 / 18 / 24 / 32px; the live stage and sheets use 34px, the mission panel 36px. Grade tiles are rounded squares (15–28px). Borders are always 1px frost edges, never solid lines; dividers are 1px glass-edge rules that fade out at the ends.

## Components

### Buttons
Confident, springy pills.
- **Shape:** full pill (999px).
- **Primary:** lime fill, lime-ink text, 800 weight, 16px × 26px (small 10px × 18px, large 20px × 34px), lime glow shadow.
- **Hover / Active:** lifts 2px with a wider glow; a trailing arrow nudges 4px right; press scales to 0.96 in 0.12s. Focus shows the 2px cyan ring offset 3px.
- **Ghost:** raised glass fill with top highlight and 20px blur; used for the secondary action beside the primary.
- **Danger (app):** red at 85% with white text.

### Chips
- **Style:** pill, glass fill, 1px frost edge, secondary text, 700 weight; counts inside at 60% opacity, tabular.
- **State:** selected inverts to text colour on background colour and scales to 1.04 on a spring. On the dark camera stage, chips are 8% white, selected is solid white with near-black text, and the auto-cycling chip carries a 2px cyan timer bar.

### Cards / Containers
- **Corner Style:** 24px (panels), 30–34px (report card, stage, hero).
- **Background:** glass (see Elevation).
- **Border:** 1px glass-edge plus the specular rim.
- **Internal Padding:** 16–26px.
- Nested stat tiles inside a card drop to plain glass fill at 12–16px radius.

### Inputs / Fields
- **Style:** glass fill, 1px frost edge, 18px radius, 13px × 16px padding; label above at 0.78rem 600 in secondary text. Search is the same material in a pill with a faint leading icon.
- **Focus:** the global cyan focus ring.

### Navigation
- **Landing:** a sticky glass pill bar floating 12px from the top, wordmark left, section links (0.9rem 600, secondary text, glass hover) and a small primary "Try now" right. Links hide below 760px.
- **App:** a floating glass tab bar centred at the bottom with a spring-sliding raised pill behind the active tab.

### Angle Pill (signature)
The live readout of a measured joint: dark glass (8,10,18 at 55%) with 12px blur, joint label at 75% opacity, value in tabular bold coloured by zone, and a 1px zone-coloured inner ring. On the canvas the same idea is drawn as a rounded pill beside a filled angle arc at the joint.

### Live Skeleton (signature)
Bones 4px white at 55% when unjudged, 7px with an 18px glow in the zone colour when judged; joints as dots with a white stroke. It is the only illustration in the product.

### Accuracy Bar
A 10px, 6px-radius glass track split into green / amber / red segments by share of time in each zone; on the landing the bar fills from the left on reveal.

## Do's and Don'ts

### Do:
- **Do** build every raised surface from the glass tokens (`--glass`, `--glass-strong`, `--glass-edge`, `--glass-hi`) so it remaps in light mode.
- **Do** use lime for the single primary action per view and cyan for focus and timing.
- **Do** colour form feedback with the three judgement tokens only, as hairline rings, bar segments or skeleton strokes.
- **Do** set headlines and metrics in Anybody at 800 with width 105–125% and tight tracking; set reading text in the system sans.
- **Do** use the spring easing for presses, chips and sheets, and the soft ease (`cubic-bezier(0.22, 1, 0.36, 1)`) for reveals and fills; honour reduced motion.
- **Do** use tabular figures for every measured number.

### Don't:
- **Don't** use green, amber or red for decoration, category coding or brand accents.
- **Don't** give a surface an opaque fill or a heavy shadow to raise it; use glass.
- **Don't** add a second filled button colour beside lime.
- **Don't** draw illustrations other than skeleton linework and the exercise pictograms.
- **Don't** hard-code hex values in components; go through the tokens.
