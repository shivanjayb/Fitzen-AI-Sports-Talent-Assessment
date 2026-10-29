# Fitzen — Quiet performance

**Parity audit (2026-10-29): this is not a complete Xeyo clone.** The owner requested a fresh cross-check. The [112-check inventory](./PARITY_AUDIT.md), also available as [searchable HTML](./parity-audit.html), records 63 missing capabilities, 32 partial adaptations, 6 narrow UI capabilities present and 11 unverified checks. These are inventory counts, not a complete product feature total. The audit supersedes any impression that fifteen frames establish feature completeness.

An editable, high-fidelity HTML design concept. This is a review artifact, not a production app change or a native Figma document. No generated imagery is used. Visual content uses HTML, CSS, inline vector interface graphics and existing repository exercise photos; it makes no external requests. Keep it inside the repository so the relative asset paths resolve.

Open `index.html` directly, or serve the repository locally:

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

Visit http://127.0.0.1:8766/docs/design/quiet-performance/. The browser preview was opened in Codex. Use **View all frames** for the presentation board, **Back to prototype** to resume navigation, or the browser's Print command to export all fifteen frames to PDF.

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

At a 390px viewport, navigation becomes horizontally scrollable and cards stack. The sample-data banner cramped its text into a narrow column and extended an action beyond the viewport. Correction from the follow-up audit: dashboard editing loaded asynchronously and does work. Earlier/later and Remove controls plus Cancel/Done appear; moving Recovery later changed order and Cancel restored it. Removal, final Done and persistence were not exercised. AI response quality, provider imports, persistence, portrait generation, uploads and destructive actions were not tested.

## Design direction

**Emotional target:** calm confidence in your own movement.

Borrow the reference's restraint, precise data hierarchy, context-on-demand and warm neutral palette. Use Fitzen’s existing running-athlete mark alongside calibration arcs, sport-specific language, exercise preparation and evidence-aware reports. The expanded reference preview includes wellness surfaces, with explicit sample labels and source requirements: the camera does not measure recovery, sleep, HRV or resting heart rate.

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

## Fifteen frames and feature previews

The owner's expanded brief uses Xeyo's complete main navigation and dashboard composition as the reference, combined with Fitzen's existing movement flows. This is an interactive UI interpretation, not a claim that Xeyo's backend or every account/provider behavior has been reproduced.

- **Summary:** recovery, HRV, resting heart rate, sleep stages, calendar, weekly signals, exercise cards, growth comparisons and recent reports. Wellness samples can be hidden.
- **Vitals, Body, Nutrition, Journal, Sleep, Blood records and Sources:** reference-style layouts; metric-history dialogs and sliders; weight controls; manual meal totals; check-ins; sleep preferences; result entry and supplied-range validation; filename-only document selection; future-source explanations.
- **Train, Prepare, Results, Progress, History, Compete and Guided assessment:** the existing Fitzen concepts, with independent history entry points on exercise cards, filtered global history and report timelines.

`history.js` seeds 17 illustrative attempts across four exercises, including a demo and an incomplete attempt. Those two remain in History but never enter eligible trend comparisons. Each exercise supports all-session/last-three windows, historical selection, report opening, previous-session change and change since the first shown session. Dates are equally spaced by session rather than elapsed days.

The fixed 29 October squat report can be saved once, including its graph series, under `fitzen.quiet-performance.sample-report.v1` in browser localStorage. It then appears as an eighteenth attempt after reload. Reset removes only this prototype key. If storage is unavailable, the save is tab-only and the interface says so. No real Fitzen storage is read or modified. Other forms in `wellness.js` are tab-only previews; reloading clears their entries.

Results disclose that the full sample assessment is a squat report. Framing artwork remains explicitly a squat example for other selected movements. Dialogs retain Escape dismissal, initial focus and focus return. Inputs use native validation, and entered text is escaped before rendering.

## Verification and boundaries

Browser checks cover desktop composition, 390px and 320px phone layouts, all fifteen frames, exercise histories and selected reports, all/last-three calculations, demo/incomplete filtering, saving and reload persistence, manual meal totals, journal entries, and reversed laboratory-range rejection. Existing catalogue images load locally. JavaScript syntax and whitespace checks pass. Tables and navigation scroll within their own containers on phones.

The production application, live database, production styles and engine remain outside this concept. Camera analysis, wearable imports, authentication, AI analysis, actual uploads and cloud synchronization are not connected. No generated imagery is used. The body image is an existing exercise reference, not a personal portrait or body-composition scan.

Graphify query/update were attempted, but the local command is unavailable. The pre-task pull was blocked by unrelated engine edits, which remain untouched.

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

The local-coach interface contains fixed, sample-report responses to three prompts. Profile, offline and goal controls update only the visible prototype or in-memory preview state. No camera, auth, production storage, service worker, model download or network API is wired. The later history extension stores only its isolated sample-report key as described above. Completing a guided test is not simulated as an eligible real result; the fixed squat sample report remains explicitly identified.

Browser checks cover the real navigation, all seven local photos loading, guided test 4 opening Plank with standard-protocol context, personal-range toggle, nested profile/offline focus, prepared-state disclosure, coach responses, competition scopes, target units, search/filter/reset and board mode. Desktop and narrow-phone layouts were inspected; the review fixed an inherited diagram-only instruction and overly broad icon sizing. Production application files and unrelated engine edits were left unchanged.
