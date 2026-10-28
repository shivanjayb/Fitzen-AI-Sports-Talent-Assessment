# Fitzen — Fieldwork

An editable, high-fidelity HTML design concept. This is a review artifact, not a production app change or a native Figma document. No generated imagery is used. All visual content is HTML, CSS, and inline vector interface graphics; it makes no external requests.

Open `index.html` directly, or serve the repository locally:

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

Visit http://127.0.0.1:8766/docs/design/quiet-performance/. The browser preview was opened in Codex. Use **View all screens** for the presentation board, **Back to prototype** to resume navigation, or the browser's Print command to export all six screens to PDF.

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

## Revision 02: Fieldwork

The owner found revision 01 too similar to Xeyo. This revision keeps only reference principles: clear hierarchy, context on demand, and calm presentation. It replaces the reference's metric-card dashboard, orange accent, rounded capsule navigation, wording and calendar feature with an original assessment-first structure.

**Goal:** help an athlete complete a clearly explained assessment and understand one practical next step. Geography is not a proxy for skill or literacy; the same core flow supports different languages, phones, confidence levels, and access to coaching.

## Apple design principles applied

| Principle | Fitzen decision | Reason |
|---|---|---|
| Purpose and simplicity | One guided squat starting action, with another-movement choice nearby | The first task is obvious before the user understands sports metrics. |
| Familiarity and wayfinding | Start, Practice, Progress; desktop rail and labelled phone bottom navigation | Predictable destinations without horizontally scrolling navigation. |
| Understanding | Get set → Move → Result, with preparation before measurement | Explain phone placement and what happens next. |
| Flexibility | English/Hindi across all primary flows; system type; large primary controls; simple-display toggle | Language and display choices are available without account setup. |
| Agency | Back, pause, continue, and recovery actions | Athletes can stop or correct setup without losing their place. |
| Responsibility | Tracking-loss state stops preview counting; recovery preserves an intentional pause | Missing evidence must not become an invented result. |
| Craft | Text and symbols accompany status; visible focus; persistent live repetition region | The experience does not rely on color, animation, or a visual skeleton alone. |
| Restraint | One result and an action before expandable measurements | Avoid overwhelming a first-time athlete with percentages and unexplained scores. |

No gesture-driven animation is introduced. Native controls and immediate press feedback suffice; no spring or motion dependency is necessary. Reduced-motion, reduced-transparency and increased-contrast preferences have explicit CSS behavior.

## Distinct Fitzen identity

| Token | Value / purpose |
|---|---|
| Chalk | `#f7f8f4`, calm light canvas |
| Pine ink | `#20362e`, primary text |
| Pine action | `#245846`, primary controls |
| Sage | `#e4eddf`, movement preparation surfaces |
| Secondary ink | `#617067`, supporting copy |
| Structure | `#dce3da`, dividers |
| Primary type | Platform system sans, 100% base size; fluid headings |
| Primary control | At least 52px high, 12px corner radius |
| Surfaces | 20px corners, sparse containers; open dividers for lists and reports |
| Signature | Joint mark, body-framing brackets and a field measurement ruler |

There are no generated raster images, remote fonts, new dependencies, external asset requests or user-data requests. Inline vectors are interface diagrams only.

## Six screens and clickable behavior

1. **Start:** one clear guided starting movement, visible no-account context, and a three-step explanation.
2. **Practice:** four curated movement examples, localized search, categories and a recoverable empty state.
3. **Get set:** selected movement, phone distance, full-body framing, correct view instructions, warm-up/safety note and guide.
4. **Sample movement:** clear single cue, preview repetitions, pause/resume, tracking-loss and recovery states.
5. **Result:** one complete illustrative squat report, a positive observation, one actionable cue, missing-evidence context and expandable technical details.
6. **Progress:** self-comparison with selectable sample history periods, consistent-setup guidance and a route back to reports.

English and Hindi each have 160 matching text keys. Hindi applies to navigation, headings, instructions, status/recovery messages, help, design explanation, result details and controls. Search accepts localized and English movement names. There is no persistence or account connection.

**Simple display** removes optional transitions, backdrop blur and the decorative ruler. It is a display preference; no unmeasured performance, connectivity or offline-readiness claim is made. Opening the self-contained HTML file requires no network assets, but the real app still needs its own model preparation and offline verification.

## Prototype boundaries

Camera access remains off. Tracking and repetition controls are explicit simulations, with no measurements made from the user's body. Finishing a sample explains that it opens the same fixed 12-repetition squat report rather than presenting preview clicks as measured results. Other movements use a clearly labelled squat diagram and report example, with selected-movement preparation instructions; production needs exercise-specific guides and correct demonstrators.

The results concept does not diagnose injury, rank talent, or invent validation. Improvements to setup and comprehension can help users collect better evidence; they cannot replace the engine calibration and independent ground-truth work in PROJECT_STATE.md.

The working athlete application, production design system, local storage, translations, camera pipeline and server remain outside this artifact's scope. This is editable HTML/CSS/JavaScript, not a native Figma document.

## Verification and next evaluation

Local syntax and localization checks: JavaScript parses; all 160 English keys have Hindi counterparts; no external asset URLs. Built-in browser checks cover language switching, guided setup, preview repetitions, lost-tracking count preservation, recovery, pause disabling, report disclosure, filtering/search/reset, measurement disclosure, simple display and all-screens exit. Responsive checks include desktop and narrow phone widths. Independent file review corrected narrow-header layout, paused-state recovery, repetition live announcements and nested-help dialog focus.

Usability is a hypothesis until tested with people. Before integration, test with first-time and experienced athletes using representative low-end Android phones and other target devices, in their preferred language, with varied lighting and connectivity. Observe whether they can:

- Start a local test and explain what happens next without a coach.
- Set up the camera and recover from a framing problem.
- Pause deliberately and resume only when ready.
- Describe the result's main improvement cue and its limitations.
- Find a previous result or switch language without assistance.

A native Hindi speaker should review terminology and comprehension. Include athletes who use larger text and assistive technology. Record task completion, mistakes, help requests and comprehension before claiming the flow is easy. Live-camera correctness remains part of the separate product validation roadmap.

Pre-task `git pull --rebase` was blocked by existing unrelated engine edits; these were preserved. Graphify query/update are required but the local `graphify` command is unavailable.
