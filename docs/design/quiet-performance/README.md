# Fitzen — Quiet performance

An editable, high-fidelity HTML design concept. This is a review artifact, not a production app change or a native Figma document. No generated imagery is used. Visual content uses HTML, CSS, inline vector interface graphics and existing repository exercise photos; it makes no external requests. Keep it inside the repository so the relative asset paths resolve.

Open `index.html` directly, or serve the repository locally:

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

Visit http://127.0.0.1:8766/docs/design/quiet-performance/. The browser preview was opened in Codex. Use **View all frames** for the presentation board, **Back to prototype** to resume navigation, or the browser's Print command to export all seven frames to PDF.

## Reference study

Studied [Xeyo](https://xeyo.ai/) in the user's signed-in Chrome tab on 2026-10-29 (India time). Dashboard readings were explicitly marked sample data. No health data was entered, records saved, files uploaded, credentials accessed, or providers connected. Account content is not copied into this artifact.

Inspected the following surfaces and behaviors:

| Surface | Observed UX |
|---|---|
| Home | Four-column dashboard; a dark recovery card establishes priority; compact white metric cards; orange portrait/calendar feature; task and check-in rows; empty metrics lead to source connection. |
| Metric detail | Centered white dialog over a dimmed, blurred page; previous/next metric controls; 7/30/90-day selectors; keyboard-addressable history slider; averages, coverage, range, source and interpretation. Changing the period updates the displayed summary. |
| Vitals | A large recovery trend beside smaller signal cards. Each signal compares the user with their own recent baseline. |
| Body | Portrait with anchored measurement callouts; missing measurements have Add actions; weight trend and measurement form; date and ruler-style numeric input. Portrait explicitly described as illustrative. |
| Nutrition | Conversational meal entry as the main workspace; daily balance and food history alongside; manual-entry dialog; unavailable voice functions are disabled with explanations. |
| Journal | Note, optional mood and date; private-history empty state; AI reflection and mood correlations explain what data is needed. Initial loading state observed. |
| Sleep | Last-night overview, sleep stages, recent history, goals and supporting metrics. Goal editor exposes two direct inputs and one save action. |
| Blood records | Results separated from source documents. Manual results request value, unit, date and optional reference range; upload entry points are separate. |
| Integrations | WHOOP automatic sync distinguished from Apple Health and Fitbit file imports. Limitations and data provenance are explained. No connection flow was completed. |
| Profile | Settings grouped around AI connections, sources, exports, privacy and account. Secondary navigation sits behind the account menu. |

Measured visible computed styles: DM Sans; canvas `rgb(244,244,242)`; white cards; 20px card corners and padding; 30px/400 page headings with −0.9px tracking; 16px/400 card titles. Selected navigation is black; orange marks, endpoints and selective highlights provide continuity. Translucency is concentrated in portrait overlays and dialog separation.

At a 390px viewport, navigation becomes horizontally scrollable and cards stack. The sample-data banner cramped its text into a narrow column and extended an action beyond the viewport. The dashboard customization button produced no visible change during inspection; its editing behavior remains unverified. AI response quality, provider imports, persistence, portrait generation, uploads and destructive actions were not tested.

## Design direction

**Emotional target:** calm confidence in your own movement.

Borrow the reference's restraint, precise data hierarchy, context-on-demand and warm neutral palette. Use Fitzen’s existing running-athlete mark alongside calibration arcs, sport-specific language, exercise preparation and evidence-aware reports. Avoid importing unrelated wellness metrics into a camera-based assessment product.

The requested Apple design skill informs platform typography, instant press feedback, spatially consistent dialogs, clear hierarchy, meaningful depth, keyboard access, and reduced-motion/transparency alternatives. There are no gesture-driven animations requiring a spring library, so the prototype introduces no dependencies.

| Token | Value / use |
|---|---|
| Chalk | `#f4f4f1`, page canvas |
| Paper | `#ffffff`, working surfaces |
| Graphite | `#252521`, primary ink and selected controls |
| Secondary ink | `#6e6e66` on light surfaces; `#c5c5ba` for dark result labels |
| Ember | `#b94b22`, interaction accent; brighter orange reserved for chart points |
| Sand | `#eedac5`, calibration feature |
| Assessment green | `#456650`, positive contextual feedback |
| Surface radius | 24px; smaller nested controls have smaller corners |
| Body / display | Platform system sans; 15px body; fluid 32–48px primary headings |
| Layout | 16px desktop grid gaps; 32px page gutters, 16px on small phones |
| Interaction | 44px primary controls; 160ms press/background feedback; visible focus rings |

## Seven frames

1. **Summary:** a current measurement, observed movement quality, practical next cue, weekly consistency, readiness and local-processing explanation.
2. **Train:** eight movements from the real catalogue, seven existing exercise photos, source-backed categories, search, empty state and guided-battery entry.
3. **Prepare:** framing example, exercise-specific viewing instructions and a safe sample-session path.
4. **Results:** one complete illustrative squat report, clear coaching cues, measurements and evidence limits.
5. **Progress:** self-comparison, selectable history periods, training-goal/retest preview and report history.
6. **Compete:** City/State/India scope selection, an honest account-disconnected leaderboard layout, groups and participation context.
7. **Guided assessment:** the actual four-test order, standard-protocol context and exercise-specific setup entry.

Clickable paths include exercise filtering/search/reset, selected movement setup, sample-report navigation, metric detail, progress periods, readiness selection, goal preview, design notes, and all-frames mode. Dialogs support Escape and focus return. No inputs persist. Results always disclose that the complete sample report is a squat report. The fixed framing diagram is explicitly labeled as a squat example when another movement is selected.

## Verification and boundaries

Verified in the built-in browser: desktop composition; 390px mobile frames; no horizontal document overflow across all five mobile frames; library search/empty/reset; movement-to-setup-to-sample-report flow. A file review found and corrected all-frames exit visibility, stale squat shortcut selection, framing-example labeling and chart-scale alignment. Follow-up browser checks cover corrected behavior and period/readiness controls.

The running athlete application, live database, production styles and engine remain outside this concept's scope. This does not implement camera tracking, video processing, real reports, accounts, exports or native Figma editing. Its goal is a concrete visual and interaction direction for review before integration.

Graphify query/update were attempted, but the local `graphify` command is unavailable. The pre-task pull was blocked by pre-existing engine edits, which were left alone.


## Real-project UI adaptation (2026-10-29)

The owner requested the preferred Quiet performance markup with real-project branding and selected feature interfaces, without building or changing the complete app. The approved typography, palette, surfaces and Summary composition remain the visual base.

| Source | Adapted into the markup |
|---|---|
| `apps/web/src/app/icons.tsx` | Existing FitzenMark running athlete and Rings/Run/People/Coach/Search glyph geometry; logo head uses the concept’s ember color. |
| `apps/web/src/app/Shell.tsx` | Summary · Train · Compete navigation, separate search, local coach and profile entry points. |
| `apps/web/public/icon.svg` | Existing favicon, referenced directly. |
| `apps/web/src/app/photos.ts` and `apps/web/public/exercises/` | Seven vendored public-domain free-exercise-db images; credited in Train and Asset details. Tree pose retains its typographic placeholder. |
| `apps/web/src/app/battery.ts`, `Guided.tsx` | Countermovement jump → Bodyweight squat → Push-up → Plank; standard protocol and eligibility context. |
| `apps/web/src/app/Profile.tsx` | Experience and personal-range setting previews; guided tests stay standard. Existing app language options are described rather than pretending this English markup translates. |
| `apps/web/src/app/Offline.tsx` | Needs preparation and simulated prepared state, clearly separated from actual cache verification/downloads. |
| `apps/web/src/app/TrainingGoal.tsx` | Test, target, units and retest-date controls; a goal preview with bounded numeric validation and no storage. |
| `apps/web/src/app/Compete.tsx` | Scope selection, account requirement, group entry point and privacy context. No fabricated leaderboard people or rankings. |

The local-coach interface contains fixed, sample-report responses to three prompts. Profile, offline and goal controls update only the visible prototype or in-memory preview state. No camera, auth, storage, service worker, model download or network API is wired. Completing a guided test is not simulated as an eligible real result; the fixed squat sample report remains explicitly identified.

Browser checks cover the real navigation, all seven local photos loading, guided test 4 opening Plank with standard-protocol context, personal-range toggle, nested profile/offline focus, prepared-state disclosure, coach responses, competition scopes, target units, search/filter/reset and board mode. Desktop and narrow-phone layouts were inspected; the review fixed an inherited diagram-only instruction and overly broad icon sizing. Production application files and unrelated engine edits were left unchanged.
