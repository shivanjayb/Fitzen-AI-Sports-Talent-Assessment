# Fitzen × Fitness+ — design system and screen spec

Reference study of Apple's **Fitness app (with Fitness+), iOS 26/27**, and how Fitzen rebuilds it.
Studied from Apple's own App Store screenshots (Summary, Workout, Fitness+ For You, Plans, workout-type
picker), apple.com/apple-fitness-plus (player metrics overlay, product-page layout) and the App Store
description (2026-10). Colours were sampled from Apple's screenshots. Fitzen copies the **design language
and interaction patterns**, never Apple's name, logos, SF Pro font files, trainer photos or video.

## 1. Information architecture (Apple → Fitzen)

| Apple Fitness tab | What it holds | Fitzen tab / route |
|---|---|---|
| **Summary** | Activity Rings card, 2-column metric cards (Step Count, Distance, Sessions, Awards), Fitness+ promo | **Summary** `/progress` — rings, form trend, sessions, personal best, awards, plan promo |
| **Fitness+** | Pills: For You · Explore · Plans · Library. Hero carousel ("Let's Go"), shelves by workout type | **Train** `/app` — For You (hero carousel + shelves), Explore (types grid), Plans (made-for-you plans), Library (saved) |
| **Workout** | Large cards per workout type: icon, lime play button, 3 option buttons (music, Workout Buddy, alerts) | **Workout** `/workout` — quick-start cards for assessments/tests: play, voice coach toggle, camera view, how-to video |
| **Sharing** | Friends' activity, competitions | **Compete** `/compete` |
| Avatar (top right) | Account, settings, history | Avatar → `/profile`; history from Summary "Sessions" card → `/history` |

Four tabs, exactly like Apple. Profile and History move out of the tab bar.

## 2. Tokens

### Colour (dark, sampled)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#000000` | canvas |
| `--card` | `#1c1c1e` (sampled #1f1f1f–#222) | cards |
| `--card-2` | `#2c2c2e` | chips off, inner controls |
| `--fill` | `rgba(118,118,128,.24)` | search, segmented, fields |
| `--text` / `--text-2` / `--text-3` | `#fff` / `rgba(235,235,245,.6)` / `.3` | labels |
| `--accent` (Fitness lime) | `#a0f102` | Let's Go, play buttons, kickers, active tab |
| `--move` | `#fa114f` | ring 1, calories-style values |
| `--exercise` | `#a6ff00` | ring 2 |
| `--stand` | `#00e5ff` | ring 3, distance-style values |
| `--steps` | `#a282f1` | step/sessions purple charts |
| `--yellow` | `#ffd60a` | timers, interval clock |
| Workout card tint | `#101801` card, `#384720` option buttons | Workout tab cards |
| Tab bar | `#1c1c1c` material, `#3d3d3e` selected pill | floating Liquid Glass capsule |

### Type (system font; SF Pro on Apple devices, Roboto on Android — never ship SF files)
| Role | Size / weight | Notes |
|---|---|---|
| Large title | 34 / 700, +0.37 tracking | "Summary", "Workout"; **date in 13 / 400 grey below** (Summary) |
| Section title | 22 / 700 | shelf heading, e.g. "Strength" |
| Shelf subtitle | 12 / 600 caps | lime first part ("MORE OF WHAT YOU DO") + grey rest ("30MIN · TOTAL BODY") |
| Card title | 17 / 600 | "Activity Rings", "Step Count" + grey circular chevron button top right |
| Hero kicker | 12 / 700 caps lime | "ANOTHER STRENGTH WORKOUT" |
| Hero title | 22 / 700, centred | "Strength with Jenn" |
| Metric value | SF Rounded 28–34 / 700, unit in small caps 13 | "665/750 CAL" coloured per ring |
| Body | 17 / 400, −0.02em | |
| Tab label | 10–11 / 600 | |

### Shape and material
- Card radius 20–22 (iOS 26+), hero 24, buttons full capsule, chips capsule 32px tall.
- Flat cards, no borders or shadows. Blur only on the tab bar, sheets, nav bar on scroll and the player overlay.
- Tab bar: floating capsule inset 16px from edges, 4 items, selected item gets a lighter pill; icons lime when selected.

## 3. Components

1. **Activity Rings card** — rings left (3 concentric, 13px stroke, track at 22% opacity, round caps), stacked label/value pairs right: white label, value coloured `value/goal` + small-caps unit.
2. **Metric tile (2-column)** — title + chevron button, grey "Today"/period label, big coloured rounded number, mini bar chart (thin bars, faint 24-slot grid).
3. **Segment pills** — For You / Explore / Plans / Library; selected = white bg black text; others `#2c2c2e`.
4. **Hero carousel card** — full-bleed photo top 60%, photo colour bleeds into the bottom via gradient; centred kicker, title, meta "20min · Back & legs", lime full-width capsule **Let's Go**. Next card peeks 16px; snap paging.
5. **Shelf** — section title + two-tone caps subtitle; 16:10 photo thumbnails radius 12, glass "NEW" badge bottom-left, title 15/600 below, grey meta line.
6. **Workout-type tile** — cut-out person on light grey `#e9e9eb` card, label strip at bottom, info "i" top right; selected = 3px lime border (onboarding "pick what you like" grid, "4 of 5 selected" pill, Get Started / Skip capsules).
7. **Plan card** — tall card, abstract gradient art (blue→peach / purple→peach blobs), title, grey types, lime caps "3 DAYS · 40MIN / DAY", glass capsule "Plan Preview".
8. **Workout card** — dark-green tint card, lime outline icon, lime circular play button, title, row of 3 olive option buttons.
9. **Player overlay** — frosted rounded panel top-left: yellow interval timer with stopwatch glyph, white elapsed time, value + red unit rows; mini rings top-right; Burn-Bar-style effort bar.

## 4. Motion
- Rings fill from 0 on appear with a spring (≈0.9 s, slight overshoot); numbers count up.
- Cards and buttons scale to 0.97 on press with spring release.
- Carousel and shelves: native horizontal scroll-snap with momentum; the hero next card peeks.
- Large title collapses into a small centred title in a blurred bar when the page scrolls.
- Pills/segment selection slides (spring); tab-bar selected pill slides between tabs.
- Sheets rise with a spring; scrim fades. Respect `prefers-reduced-motion`.

## 5. Fitzen content model additions
- **Exercise photo**: `photo` per exercise (licensed or generated, never Apple's). Fallback: pictogram art.
- **How-to video**: `video` per exercise — YouTube video ID played via `youtube-nocookie.com` embed in the exercise sheet; fallback is a YouTube search link "`<exercise> proper form`".
- **Plans**: "Stay Consistent" (3 days, guided battery), "Push Further" (5 days), "Build your own".

## 6. Do / don't
- Do: black canvas, lime accent, rounded numerals, photo-first cards, two-tone caps subtitles.
- Don't: Apple logo, "Fitness+" wordmark, trainer names/photos, SF font files, Apple video.
