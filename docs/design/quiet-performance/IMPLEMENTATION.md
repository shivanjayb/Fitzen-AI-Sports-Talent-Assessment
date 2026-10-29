# UI completion pass after the Xeyo audit

Implemented 2026-10-30. This follows the historical audit of `ce5900d`; it does not rewrite its findings or claim that Xeyo’s backend or unseen branches were verified.

The prototype now has **17 main frames**, plus dialogs and controlled preview states for the observed feature inventory. All known missing feature groups have UI entry points and representative states. The broad unknown-state audit item remains open. Exact Xeyo visual/behavioral parity is not certified: Fitzen branding/features, system typography, Apple-style interaction refinements and the owner’s no-generated-image requirement are deliberate adaptations.

## What changed

- Complete Home signal inventory, calorie/weight entry, mood and training context, fifteen-signal week comparison, customizable card order/visibility and restoration.
- Shared metric navigation with 7/30/90 days, baseline percentages, coverage, missing-day selection, provenance and all Vitals/Sleep sample signals.
- Dated body, meal, journal and laboratory records; edits and reversible removal; meal analysis/voice previews; goal achievements/debt; separated test units and document-flow states.
- Account menu/Profile/privacy/sample exports, three-step preferences, portrait-studio selection/review placeholders, provider/model settings, chat/context/clear undo, source authorization/import previews and auth/recovery screens.

## iOS design thinking applied

Predictable destinations and Back navigation; direct manipulation through native sliders; immediate touch-down feedback; readable platform typography and tabular numbers; grouped controls; explicit state and recovery text; reversible edits; phone sheets with reachable dismissal and safe-area padding; 44px minimum controls; 16px form text; visible focus; reduced motion, transparency and higher-contrast fallbacks. No decorative motion or new dependencies were added.

## Boundaries

All new records/settings/connections are tab-only simulations. Reload resets them. The earlier isolated `fitzen.quiet-performance.sample-report.v1` report/graph save remains the sole deliberate persistent sample. No real profile, health storage, credentials, provider permissions or production UI is accessed. File selection uses name/type/size only; content is never read or uploaded. Sample analysis, authorization and progress states are fixtures, not running AI/import work. Export downloads contain this mockup’s records only. Portrait UI uses existing assets/diagram placeholders and **does not generate images**. Peer results never invent participants, ranks or percentiles.

## Browser verification

Root browser checks: dashboard reorder/remove/cancel; metric 90-day missing-day cursor and next navigation; fifteen-row weekly summary; AI error→success; fixed chat send/clear/undo; WHOOP decline/retry/approve/disconnect; Fitbit sample selection/preview/duplicate/error/retry/progress/completion; three preference steps; portrait review/reject; sign-out/recovery/sign-in; quick Home weight save; calendar routes and browser Back. Seventeen main frames fit both 390px and 320px without horizontal document overflow; existing assets load; phone metric sheet fits 320px. JavaScript syntax and whitespace checks pass.

Daily-flow agent browser checks are reused: meal add/edit/remove/undo, analysis error/retry/confirm, empty/dated journal and three-check-in mood comparison, reversed lab range then valid result, upload fixture/error/retry/completion/metadata and dated weight. Account child IAB was unavailable; root executed its listed probes instead. Full paired Xeyo pixel/accessibility/keyboard coverage for every state and real-device Safari testing remain outstanding.

## Inventory trace

“UI preview” means an entry and representative local flow now exist. “Adapted UI” marks intentional changes, including no image creation and metadata-only document previews. “Partial verification” means a UI exists but every state has not been checked. None of these labels certify Xeyo’s actual backend behavior. The evidence column in the baseline audit remains authoritative about what was observed on Xeyo.

| Audit ID | Feature | Current UI | Implementation | Scope |
|---|---|---|---|---|
| X001 | Seven wellness section destinations | Adapted UI | shell.js / account.js | Hash routes/Back, refresh status, account menu, global assistant and sample-signal controls. |
| X002 | Global health-question input | UI preview | shell.js / account.js | Hash routes/Back, refresh status, account menu, global assistant and sample-signal controls. |
| X003 | Refresh button and last-update status | UI preview | shell.js / account.js | Hash routes/Back, refresh status, account menu, global assistant and sample-signal controls. |
| X004 | Account dropdown | UI preview | shell.js / account.js | Hash routes/Back, refresh status, account menu, global assistant and sample-signal controls. |
| X005 | Sample banner and connect-source entry | UI preview | shell.js / account.js | Hash routes/Back, refresh status, account menu, global assistant and sample-signal controls. |
| X006 | Exit sample-data workspace | Adapted UI | shell.js / account.js | Exit wellness samples shows missing-source signal states. Fitzen exercise examples remain explicitly labelled design samples. |
| X007 | Route URLs and browser history | UI preview | shell.js / account.js | Hash routes/Back, refresh status, account menu, global assistant and sample-signal controls. |
| X008 | Recovery, HRV, resting-heart-rate and sleep cards | UI preview | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X009 | Fourteen-day sparklines and average labels | UI preview | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X010 | Baseline-relative percentage change | UI preview | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X011 | Strain empty card | UI preview | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X012 | Heart-rate empty card | UI preview | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X013 | Portrait/calendar feature | Adapted UI | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X014 | Calendar shortcuts: sleep goals, check-ins, blood results | UI preview | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X015 | Calories eaten versus burned | UI preview | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X016 | Quick weight entry, ruler and Save today | UI preview | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X017 | Weekly recovery, sleep and HRV table | UI preview | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X018 | Weekly mood row and today's check-in | UI preview | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X019 | Weekly comparative summary | UI preview | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X020 | Dashboard editing entry and Cancel/Done | UI preview | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X021 | Reorder earlier/later and boundary-disabled states | UI preview | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X022 | Remove metric and restore/add behavior | UI preview | shell.js / metrics.js / daily-flows.js | Six source signals plus Fitzen cards, calorie/weight controls, calendar shortcuts, mood row, comparative weekly table and reorder/remove/restore/Cancel/Done. |
| X023 | Context title and selected-day value | UI preview | metrics.js | Shared 7/30/90-day explorer, calendar-time cursor, next/previous groups, sample baseline, missing days, coverage, provenance and explanatory links. |
| X024 | Previous/next navigation and position counter | UI preview | metrics.js | Shared 7/30/90-day explorer, calendar-time cursor, next/previous groups, sample baseline, missing days, coverage, provenance and explanatory links. |
| X025 | Seven-day period | UI preview | metrics.js | Shared 7/30/90-day explorer, calendar-time cursor, next/previous groups, sample baseline, missing days, coverage, provenance and explanatory links. |
| X026 | Thirty-day period | UI preview | metrics.js | Shared 7/30/90-day explorer, calendar-time cursor, next/previous groups, sample baseline, missing days, coverage, provenance and explanatory links. |
| X027 | Ninety-day period and incomplete coverage | UI preview | metrics.js | Shared 7/30/90-day explorer, calendar-time cursor, next/previous groups, sample baseline, missing days, coverage, provenance and explanatory links. |
| X028 | Keyboard-addressable history slider | UI preview | metrics.js | Shared 7/30/90-day explorer, calendar-time cursor, next/previous groups, sample baseline, missing days, coverage, provenance and explanatory links. |
| X029 | Average and daily range | UI preview | metrics.js | Shared 7/30/90-day explorer, calendar-time cursor, next/previous groups, sample baseline, missing days, coverage, provenance and explanatory links. |
| X030 | Missing days and recorded-day coverage | UI preview | metrics.js | Shared 7/30/90-day explorer, calendar-time cursor, next/previous groups, sample baseline, missing days, coverage, provenance and explanatory links. |
| X031 | Source provenance and aggregation explanation | UI preview | metrics.js | Shared 7/30/90-day explorer, calendar-time cursor, next/previous groups, sample baseline, missing days, coverage, provenance and explanatory links. |
| X032 | Metric-specific interpretation and source links | UI preview | metrics.js | Shared 7/30/90-day explorer, calendar-time cursor, next/previous groups, sample baseline, missing days, coverage, provenance and explanatory links. |
| X033 | No-measurement detail with connect-source action | UI preview | metrics.js | Shared 7/30/90-day explorer, calendar-time cursor, next/previous groups, sample baseline, missing days, coverage, provenance and explanatory links. |
| X034 | Escape dismissal | UI preview | metrics.js | Shared 7/30/90-day explorer, calendar-time cursor, next/previous groups, sample baseline, missing days, coverage, provenance and explanatory links. |
| X035 | Recovery hero: fourteen-day low/high/coverage/usual range | UI preview | metrics.js | Eight sample signals, fourteen-day recovery hero and all supporting metric explorers. |
| X036 | Resting heart rate and HRV compact histories | UI preview | metrics.js | Eight sample signals, fourteen-day recovery hero and all supporting metric explorers. |
| X037 | Blood oxygen sample and explorer | UI preview | metrics.js | Eight sample signals, fourteen-day recovery hero and all supporting metric explorers. |
| X038 | Respiratory-rate sample and explorer | UI preview | metrics.js | Eight sample signals, fourteen-day recovery hero and all supporting metric explorers. |
| X039 | Skin-temperature sample and explorer | UI preview | metrics.js | Eight sample signals, fourteen-day recovery hero and all supporting metric explorers. |
| X040 | Steps and active-energy histories | UI preview | metrics.js | Eight sample signals, fourteen-day recovery hero and all supporting metric explorers. |
| X041 | Portrait with measurement callouts | Adapted UI | daily-flows.js / metrics.js / account.js | Dated manual measurements, scales, tab history, supporting signals, view preferences and studio preview. |
| X042 | Change view entry | UI preview | daily-flows.js / metrics.js / account.js | Dated manual measurements, scales, tab history, supporting signals, view preferences and studio preview. |
| X043 | Weight entry with unit, date and scale | UI preview | daily-flows.js / metrics.js / account.js | Dated manual measurements, scales, tab history, supporting signals, view preferences and studio preview. |
| X044 | Body-fat measurement entry | UI preview | daily-flows.js / metrics.js / account.js | Dated manual measurements, scales, tab history, supporting signals, view preferences and studio preview. |
| X045 | Lean-body-mass measurement entry | UI preview | daily-flows.js / metrics.js / account.js | Dated manual measurements, scales, tab history, supporting signals, view preferences and studio preview. |
| X046 | Measurement-history explorer | UI preview | daily-flows.js / metrics.js / account.js | Dated manual measurements, scales, tab history, supporting signals, view preferences and studio preview. |
| X047 | Seven supporting vital tiles | UI preview | daily-flows.js / metrics.js / account.js | Dated manual measurements, scales, tab history, supporting signals, view preferences and studio preview. |
| X048 | Portrait studio entry | UI preview | daily-flows.js / metrics.js / account.js | Dated manual measurements, scales, tab history, supporting signals, view preferences and studio preview. |
| X049 | 3D-avatar / photoreal style choice | Adapted UI | daily-flows.js / metrics.js / account.js | Dated manual measurements, scales, tab history, supporting signals, view preferences and studio preview. |
| X050 | Choose/change photo, connect key, review/approve render | Adapted UI | daily-flows.js / metrics.js / account.js | Style selection, filename choice, connection, placeholder review/approve/reject/error. No generated portrait is produced. |
| X051 | Three-step navigation with Back and workspace exit | UI preview | account.js | Three staged preference steps, representation, file metadata, age/identity and optional age-group participation. |
| X052 | Portrait / digital human / statistics representations | Adapted UI | account.js | Three staged preference steps, representation, file metadata, age/identity and optional age-group participation. |
| X053 | Reference-photo picker and saved-photo choice | UI preview | account.js | Three staged preference steps, representation, file metadata, age/identity and optional age-group participation. |
| X054 | Identity choices, age and adult-use context | Adapted UI | account.js | Three staged preference steps, representation, file metadata, age/identity and optional age-group participation. |
| X055 | Peer-comparison opt-in and thresholds | UI preview | account.js | Three staged preference steps, representation, file metadata, age/identity and optional age-group participation. |
| X056 | Nutrition day picker | UI preview | daily-flows.js | Selected day, manual/analysis preview, photo filename, voice simulation, macro percentages, editable records and remove/undo. |
| X057 | Meal description conversational workspace | UI preview | daily-flows.js | Selected day, manual/analysis preview, photo filename, voice simulation, macro percentages, editable records and remove/undo. |
| X058 | Meal-photo attachment | UI preview | daily-flows.js | Selected day, manual/analysis preview, photo filename, voice simulation, macro percentages, editable records and remove/undo. |
| X059 | Voice controls and no-AI disabled state | UI preview | daily-flows.js | Selected day, manual/analysis preview, photo filename, voice simulation, macro percentages, editable records and remove/undo. |
| X060 | Manual name, meal type, calories and macros | UI preview | daily-flows.js | Selected day, manual/analysis preview, photo filename, voice simulation, macro percentages, editable records and remove/undo. |
| X061 | Manual meal date | UI preview | daily-flows.js | Selected day, manual/analysis preview, photo filename, voice simulation, macro percentages, editable records and remove/undo. |
| X062 | Daily balance and macro percentages | UI preview | daily-flows.js | Selected day, manual/analysis preview, photo filename, voice simulation, macro percentages, editable records and remove/undo. |
| X063 | Food journal filtered by selected day | UI preview | daily-flows.js | Selected day, manual/analysis preview, photo filename, voice simulation, macro percentages, editable records and remove/undo. |
| X064 | Edit values and undo logged meal | UI preview | daily-flows.js | Selected day, manual/analysis preview, photo filename, voice simulation, macro percentages, editable records and remove/undo. |
| X065 | AI meal analysis and confirmation/error states | UI preview | daily-flows.js | Selected day, manual/analysis preview, photo filename, voice simulation, macro percentages, editable records and remove/undo. |
| X066 | Note and five optional mood choices | UI preview | daily-flows.js | Dated notes/mood, disabled empty save, reload/start focus, edit/remove/undo, threshold and aligned sample comparison, reflection preview. |
| X067 | Date selection | UI preview | daily-flows.js | Dated notes/mood, disabled empty save, reload/start focus, edit/remove/undo, threshold and aligned sample comparison, reflection preview. |
| X068 | Disabled empty-note save state | UI preview | daily-flows.js | Dated notes/mood, disabled empty save, reload/start focus, edit/remove/undo, threshold and aligned sample comparison, reflection preview. |
| X069 | Reload check-ins and first-note focus action | UI preview | daily-flows.js | Dated notes/mood, disabled empty save, reload/start focus, edit/remove/undo, threshold and aligned sample comparison, reflection preview. |
| X070 | Private dated history | UI preview | daily-flows.js | Dated notes/mood, disabled empty save, reload/start focus, edit/remove/undo, threshold and aligned sample comparison, reflection preview. |
| X071 | AI reflection connection and consent | UI preview | daily-flows.js | Dated notes/mood, disabled empty save, reload/start focus, edit/remove/undo, threshold and aligned sample comparison, reflection preview. |
| X072 | Mood/recovery/sleep comparison threshold | UI preview | daily-flows.js | Dated notes/mood, disabled empty save, reload/start focus, edit/remove/undo, threshold and aligned sample comparison, reflection preview. |
| X073 | Last-night hero and stage composition | UI preview | metrics.js | Seven explorers, stage composition, editable targets, achievement counts, debt comparison and goal timeline. |
| X074 | Sleep goal and recovery goal editing | UI preview | metrics.js | Seven explorers, stage composition, editable targets, achievement counts, debt comparison and goal timeline. |
| X075 | Goal achievement counts | UI preview | metrics.js | Seven explorers, stage composition, editable targets, achievement counts, debt comparison and goal timeline. |
| X076 | Seven-night debt and previous-week comparison | UI preview | metrics.js | Seven explorers, stage composition, editable targets, achievement counts, debt comparison and goal timeline. |
| X077 | Fourteen-night goal-met visualization | UI preview | metrics.js | Seven explorers, stage composition, editable targets, achievement counts, debt comparison and goal timeline. |
| X078 | Performance and efficiency explorers | UI preview | metrics.js | Seven explorers, stage composition, editable targets, achievement counts, debt comparison and goal timeline. |
| X079 | Deep, REM and light history explorers | UI preview | metrics.js | Seven explorers, stage composition, editable targets, achievement counts, debt comparison and goal timeline. |
| X080 | Awake-time explorer | UI preview | metrics.js | Seven explorers, stage composition, editable targets, achievement counts, debt comparison and goal timeline. |
| X081 | Separate results and source-documents panels | UI preview | daily-flows.js | Lab/notes fields, unit-separated test trends, manual/edit/undo records, filename validation and simulated upload/error/retry/completion/document metadata. |
| X082 | Test/date/value/unit/optional range fields | UI preview | daily-flows.js | Lab/notes fields, unit-separated test trends, manual/edit/undo records, filename validation and simulated upload/error/retry/completion/document metadata. |
| X083 | Laboratory and notes fields | UI preview | daily-flows.js | Lab/notes fields, unit-separated test trends, manual/edit/undo records, filename validation and simulated upload/error/retry/completion/document metadata. |
| X084 | Same-test trend and units kept separate | UI preview | daily-flows.js | Lab/notes fields, unit-separated test trends, manual/edit/undo records, filename validation and simulated upload/error/retry/completion/document metadata. |
| X085 | Private-upload dialog and size guidance | UI preview | daily-flows.js | Lab/notes fields, unit-separated test trends, manual/edit/undo records, filename validation and simulated upload/error/retry/completion/document metadata. |
| X086 | Upload progress/failure/success and document access | Adapted UI | daily-flows.js | Representative progress/error/retry/completion and metadata preview; actual document bytes are never read, rendered or uploaded. |
| X087 | Full assistant panel, composer and empty-state prompts | UI preview | account.js | Composer, fixed responses, context option, clear/undo, eight providers, sample model discovery, success/error/disconnect and separate voice/portrait settings. |
| X088 | Optional sharing of thirty-day averages | UI preview | account.js | Composer, fixed responses, context option, clear/undo, eight providers, sample model discovery, success/error/disconnect and separate voice/portrait settings. |
| X089 | Clear chat history | UI preview | account.js | Composer, fixed responses, context option, clear/undo, eight providers, sample model discovery, success/error/disconnect and separate voice/portrait settings. |
| X090 | Eight-provider selector | UI preview | account.js | Composer, fixed responses, context option, clear/undo, eight providers, sample model discovery, success/error/disconnect and separate voice/portrait settings. |
| X091 | Model field and Find my models | UI preview | account.js | Composer, fixed responses, context option, clear/undo, eight providers, sample model discovery, success/error/disconnect and separate voice/portrait settings. |
| X092 | Verify and connect/disconnect states | UI preview | account.js | Composer, fixed responses, context option, clear/undo, eight providers, sample model discovery, success/error/disconnect and separate voice/portrait settings. |
| X093 | Separate OpenAI key for portraits and voice | UI preview | account.js | Composer, fixed responses, context option, clear/undo, eight providers, sample model discovery, success/error/disconnect and separate voice/portrait settings. |
| X094 | Profile settings workspace | UI preview | account.js | Account workspace, sample CSV/JSON exports, privacy, reference metadata management, preferences, eligibility context and mock sign-out. |
| X095 | CSV and JSON data export actions | UI preview | account.js | Account workspace, sample CSV/JSON exports, privacy, reference metadata management, preferences, eligibility context and mock sign-out. |
| X096 | Privacy/data-use dialog and full-notice link | UI preview | account.js | Account workspace, sample CSV/JSON exports, privacy, reference metadata management, preferences, eligibility context and mock sign-out. |
| X097 | Reference-photo list/open/delete controls | UI preview | account.js | Account workspace, sample CSV/JSON exports, privacy, reference metadata management, preferences, eligibility context and mock sign-out. |
| X098 | Age-group comparison eligibility and explanation | UI preview | account.js | Account workspace, sample CSV/JSON exports, privacy, reference metadata management, preferences, eligibility context and mock sign-out. |
| X099 | Comparison-preferences entry | UI preview | account.js | Account workspace, sample CSV/JSON exports, privacy, reference metadata management, preferences, eligibility context and mock sign-out. |
| X100 | Sign-out flow | UI preview | account.js | Account workspace, sample CSV/JSON exports, privacy, reference metadata management, preferences, eligibility context and mock sign-out. |
| X101 | WHOOP-specific capability card | UI preview | account.js | WHOOP authorization/decline/retry/disconnect, Apple/Fitbit instruction and metadata selection, units, fixture preview, duplicates and controlled progress/error/completion. |
| X102 | WHOOP authorization, connected and disconnect states | UI preview | account.js | WHOOP authorization/decline/retry/disconnect, Apple/Fitbit instruction and metadata selection, units, fixture preview, duplicates and controlled progress/error/completion. |
| X103 | Apple Health import instructions and file dialog | UI preview | account.js | WHOOP authorization/decline/retry/disconnect, Apple/Fitbit instruction and metadata selection, units, fixture preview, duplicates and controlled progress/error/completion. |
| X104 | Fitbit import instructions and file types | UI preview | account.js | WHOOP authorization/decline/retry/disconnect, Apple/Fitbit instruction and metadata selection, units, fixture preview, duplicates and controlled progress/error/completion. |
| X105 | Fitbit fallback weight units | UI preview | account.js | WHOOP authorization/decline/retry/disconnect, Apple/Fitbit instruction and metadata selection, units, fixture preview, duplicates and controlled progress/error/completion. |
| X106 | Import preview/progress/errors/duplicates/completion | UI preview | account.js | WHOOP authorization/decline/retry/disconnect, Apple/Fitbit instruction and metadata selection, units, fixture preview, duplicates and controlled progress/error/completion. |
| X107 | Source/date provenance and disconnect-retention explanation | UI preview | account.js | WHOOP authorization/decline/retry/disconnect, Apple/Fitbit instruction and metadata selection, units, fixture preview, duplicates and controlled progress/error/completion. |
| X108 | Typography, color and surface treatment | Adapted UI | shell.js | Apple-informed typography, immediate press feedback, 44px controls, phone sheets, grouped settings, focus and reduced-motion/transparency fallbacks. |
| X109 | Portrait/calendar composition and metric density | Adapted UI | shell.js | Apple-informed typography, immediate press feedback, 44px controls, phone sheets, grouped settings, focus and reduced-motion/transparency fallbacks. |
| X110 | Responsive and keyboard parity across every state | Partial verification | shell.js | 17 main frames and a metric phone sheet checked at narrow widths; not every populated/dialog/focus/hover state independently paired with Xeyo. |
| X111 | Logged-out landing, authentication and recovery | UI preview | account.js | Mock login/signup/recovery/error/expired/sign-out screens implemented; actual reference auth flow was not inspected. |
| X112 | Populated histories, real imports and connected-AI behavior | Reference unverified | account.js | Catch-all discovery limitation, not a feature that code can prove complete. Hidden real-service states remain unknown. |

## Next review

Open the local HTML and review representative paths against the signed-in reference. Use disposable populated/connected fixtures or source access to discover remaining reference-only states. This task implements UI markup; real service integration requires a separate implementation decision.
