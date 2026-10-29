> Historical baseline for `ce5900d`. The subsequent [UI completion pass](./IMPLEMENTATION.md) adds previews for the observed gaps. Counts below describe the earlier revision, not the current markup. Reference-only unknown states remain unverified.

# Xeyo → Fitzen UI parity audit

**Verdict: not a complete clone.** The previous mockup is an adapted concept with material missing features and simplified interactions. No claim of complete UI, feature or backend parity is justified.

Audited 2026-10-29 against prototype revision `ce5900d`, using the signed-in Xeyo browser and the local HTML prototype. This is a finite inventory of observed feature checks, not a count of every feature in the product. No percentage-complete score is assigned because the full feature universe is unknown.

The browser inspection covered Home, Vitals, Body, Nutrition, Journal, Sleep, Blood records, Profile, Integrations, three onboarding steps, metric groups, AI settings, portrait studio and privacy dialog. It exercised dashboard reorder/cancel, metric navigation, period changes, keyboard history selection, refresh feedback, unsaved representation selection and Escape dismissal. Other forms were inspected without saving real account records. Account identifiers, personal details and filenames are omitted from this report.

**Labels:** Present means the narrow UI capability exists, not pixel parity or backend parity. Partial means a simplified or changed implementation. Missing means an observed UI control/surface is absent. Unverified means the actual reference branch or result was not exercised, even when a button or explanatory text was visible.

**Limits:** No API keys, provider permissions, file uploads, paid AI requests, portrait generation, personal-file access, record deletion, logout or export downloads were performed. Existing-reference account values were not changed. Dashboard order was canceled and onboarding preferences exited without saving. Refresh fetched saved records; the final reference tab returned to Home. Populated, connected, error and authentication states remain open. No new images were generated.

## Correction to earlier exploration notes

Dashboard editing does work after asynchronous loading: Cancel/Done, earlier/later movement and Remove controls appeared. Moving Recovery later changed the heading order, and Cancel restored it. The earlier note that customization produced no visible change was premature and is superseded. This run did not execute removal, Done, or prove persistence.

## Work needed before another parity claim

1. Restore the reference shell, complete Home card inventory, editing controls, weekly mood row and fifteen-signal week-over-week summary. Keep Fitzen additions alongside those capabilities.
2. Build one shared metric explorer with group navigation, 7/30/90-day windows, baseline comparisons, coverage, missing days, provenance and metric explanations. Populate all observed Vitals and Sleep previews.
3. Add the observed onboarding, view/portrait-studio UI, dated measurements/meals/journal, sleep-goal achievement and debt, missing lab fields, provider-specific import previews, AI settings and Profile/privacy/export surfaces. Keep services simulated within the UI-only scope; do not generate imagery.
4. Obtain disposable fixtures or source access for populated/connected/error/authentication branches; then repeat paired desktop/mobile and keyboard checks. Until then, keep those branches marked unverified.

## Inventory

112 observed checks: 6 present, 32 partial, 63 missing, 11 unverified. These are audit rows, not an exhaustive product feature total.

| ID | Section | Feature | Prototype | Xeyo evidence | Gap / scope |
|---|---|---|---|---|---|
| X001 | Shell | Seven wellness section destinations | Partial | Opened all seven sections | Present, but Home is renamed Summary and three Fitzen tabs are added. |
| X002 | Shell | Global health-question input | Partial | Focused input; opened assistant through Journal | Local input opens fixed Fitzen coach prompts, not the Xeyo conversation UI. |
| X003 | Shell | Refresh button and last-update status | Missing | Exercised: updating state then records-refreshed status | No refresh control or sync timestamp in the mockup. |
| X004 | Shell | Account dropdown | Missing | Opened menu | Reference has Profile, Integrations, Privacy & data and Sign out. Local avatar opens a Fitzen settings dialog. |
| X005 | Shell | Sample banner and connect-source entry | Partial | Viewed banner and opened Integrations | Local banner hides wellness samples; source entry is elsewhere. |
| X006 | Shell | Exit sample-data workspace | Missing | Button visible; not executed | Hiding wellness cards is not equivalent to leaving sample mode. |
| X007 | Shell | Route URLs and browser history | Missing | Observed hash routes for all sections | Local navigation changes hidden sections without matching route URLs. |
| X008 | Home | Recovery, HRV, resting-heart-rate and sleep cards | Partial | Viewed all four; opened their dialogs | Cards exist but history lengths, averages, comparison semantics and positioning differ. |
| X009 | Home | Fourteen-day sparklines and average labels | Partial | Observed reference card labels and dates | Local cards show seven-day samples and omit visible average labels. |
| X010 | Home | Baseline-relative percentage change | Missing | Opened metric and selected historical day | Local changes compare with the preceding sample, not the thirty-day baseline. |
| X011 | Home | Strain empty card | Missing | Opened Strain detail | Replaced by Fitzen exercise cards; reference empty state and explanation absent. |
| X012 | Home | Heart-rate empty card | Missing | Opened Heart rate detail | No corresponding Summary tile or metric explorer. |
| X013 | Home | Portrait/calendar feature | Partial | Viewed month and recorded dates | Local calibration arcs replace portrait; fewer dates and different content. |
| X014 | Home | Calendar shortcuts: sleep goals, check-ins, blood results | Partial | Viewed shortcuts; visited destination surfaces | Local calendar has Session history and Check in, omitting the other two shortcuts. |
| X015 | Home | Calories eaten versus burned | Missing | Viewed card, source explanation and meal action | No calories card on Summary. |
| X016 | Home | Quick weight entry, ruler and Save today | Missing | Viewed input, scale and action; not saved | Weight preview exists only on Body. |
| X017 | Home | Weekly recovery, sleep and HRV table | Partial | Viewed rows and opened related explorers | Core rows exist, but weekday headers, today treatment and linked detail differ. |
| X018 | Home | Weekly mood row and today's check-in | Missing | Viewed row and navigated Check in | Local row is Training, not Mood; it does not connect journal mood to dates. |
| X019 | Home | Weekly comparative summary | Missing | Opened full week-over-week summary table | Local dialog discusses jump changes instead of the reference's fifteen wellness rows. |
| X020 | Home | Dashboard editing entry and Cancel/Done | Missing | Opened edit mode; moved Recovery later; canceled | No dashboard editing interface. Earlier documentation saying editing was unverified is superseded. |
| X021 | Home | Reorder earlier/later and boundary-disabled states | Missing | Moved Recovery later and observed first/last boundary controls | No equivalent controls. |
| X022 | Home | Remove metric and restore/add behavior | Missing | Remove controls visible; not executed; restore behavior unverified | No remove/add-card interface; restore design still needs evidence. |
| X023 | Metric explorer | Context title and selected-day value | Partial | Opened Home, Vitals, Body and Sleep metric groups | Only four wellness signals have simplified local dialogs. |
| X024 | Metric explorer | Previous/next navigation and position counter | Missing | Traversed all six Home metrics, supplemental Vitals and all seven Sleep metrics | Local dialogs do not navigate within metric groups. |
| X025 | Metric explorer | Seven-day period | Partial | Selected seven days: seven recorded days and changed average | Local explorer is fixed to seven days, without a period selector. |
| X026 | Metric explorer | Thirty-day period | Missing | Default thirty-day explorer observed | No local thirty-day wellness history. |
| X027 | Metric explorer | Ninety-day period and incomplete coverage | Missing | Selected ninety days: thirty of ninety recorded days | No local ninety-day view or coverage denominator. |
| X028 | Metric explorer | Keyboard-addressable history slider | Partial | ArrowLeft changed Recovery to preceding day | Local slider exists, but shorter data and less context. |
| X029 | Metric explorer | Average and daily range | Partial | Observed changes across period selections | Local seven-day average/range only. |
| X030 | Metric explorer | Missing days and recorded-day coverage | Missing | Ninety-day explorer reported thirty of ninety | Local signals have complete fixed samples and no missing-day coverage UI. |
| X031 | Metric explorer | Source provenance and aggregation explanation | Partial | Read source and daily-mean explanations | Local sample labels exist; full baseline/daily-mean methodology is absent. |
| X032 | Metric explorer | Metric-specific interpretation and source links | Partial | Read explanation/link in each traversed metric | Local notes are shorter; no equivalent authoritative-link area. |
| X033 | Metric explorer | No-measurement detail with connect-source action | Partial | Opened Strain and Heart rate no-measurement states | Local hide-samples state is generic; those two metric-specific dialogs are absent. |
| X034 | Metric explorer | Escape dismissal | Present | Escape closed the separate OpenAI settings dialog | Local native dialog also supports Escape; no claim of a full keyboard-accessibility audit. |
| X035 | Vitals | Recovery hero: fourteen-day low/high/coverage/usual range | Partial | Opened Vitals and hero detail | Local seven-day graph omits low/high/coverage and usual-range legend. |
| X036 | Vitals | Resting heart rate and HRV compact histories | Partial | Viewed cards and opened explorers | Local cards exist with reduced time window and baseline context. |
| X037 | Vitals | Blood oxygen sample and explorer | Missing | Opened Blood oxygen history | Local card is a source placeholder despite reference sample data being available. |
| X038 | Vitals | Respiratory-rate sample and explorer | Missing | Opened through metric-next | Local card is a source placeholder. |
| X039 | Vitals | Skin-temperature sample and explorer | Missing | Opened through metric-next | Local card is a source placeholder. |
| X040 | Vitals | Steps and active-energy histories | Missing | Opened both through metric-next | Local cards are source placeholders. |
| X041 | Body | Portrait with measurement callouts | Partial | Viewed portrait and opened callouts | Local exercise photograph is not the same portrait composition. |
| X042 | Body | Change view entry | Missing | Opened three-step preferences | No equivalent view preference flow. |
| X043 | Body | Weight entry with unit, date and scale | Partial | Opened dated Weight form and trend | Local weight preview has no measurement date or retained entry series. |
| X044 | Body | Body-fat measurement entry | Partial | Opened Body fat form | Local generic form lacks a dedicated scale/date and does not create a measurement record. |
| X045 | Body | Lean-body-mass measurement entry | Partial | Opened Lean body mass form | Same generic local form; no dedicated scale/date or retained record. |
| X046 | Body | Measurement-history explorer | Partial | Opened Weight trend: one recorded date, thirty-day context | Local invented five-point weight trend differs from reference sample coverage. |
| X047 | Body | Seven supporting vital tiles | Missing | Viewed all seven Body vital tiles | Reference tiles absent from local Body page. |
| X048 | Body | Portrait studio entry | Missing | Opened loaded studio | No studio UI. Image generation remains excluded by the owner's instruction. |
| X049 | Body | 3D-avatar / photoreal style choice | Missing | Viewed both style controls; did not generate | No local representation of the choice. |
| X050 | Body | Choose/change photo, connect key, review/approve render | Missing | Viewed change-photo/key controls; approval described in privacy text | No local studio controls. Actual generated review state was not exercised. |
| X051 | Onboarding | Three-step navigation with Back and workspace exit | Missing | Visited steps one, two and three; exited without saving | No Xeyo-equivalent onboarding. |
| X052 | Onboarding | Portrait / digital human / statistics representations | Missing | Selected Digital human then Statistics in unsaved form | No representation selector. Existing own-brand artwork is not equivalent. |
| X053 | Onboarding | Reference-photo picker and saved-photo choice | Missing | Viewed fields; did not open personal file | No saved-photo or reference-photo UI. |
| X054 | Onboarding | Identity choices, age and adult-use context | Missing | Viewed step two without editing profile values | Local Fitzen experience selector serves a different purpose. |
| X055 | Onboarding | Peer-comparison opt-in and thresholds | Missing | Viewed step three; did not save preferences | No same-source/age-group opt-in flow. |
| X056 | Nutrition | Nutrition day picker | Missing | Viewed dated workspace | Local meals are fixed to the preview day. |
| X057 | Nutrition | Meal description conversational workspace | Partial | Viewed text, send, manual and connection states | Local Continue opens manual entry, not an AI meal conversation. |
| X058 | Nutrition | Meal-photo attachment | Missing | Attachment control visible; no file selected | No local meal-photo control. |
| X059 | Nutrition | Voice controls and no-AI disabled state | Partial | Viewed both reference voice controls disabled | One local disabled voice control; recording flow not represented. |
| X060 | Nutrition | Manual name, meal type, calories and macros | Present | Opened reference form; local sample add verified in prior run | Core manual fields exist; parity here covers fields only, not cloud saving. |
| X061 | Nutrition | Manual meal date | Missing | Viewed Day field in reference dialog | No Day field locally. |
| X062 | Nutrition | Daily balance and macro percentages | Partial | Viewed reference zero-entry state | Local totals exist but reference rings/percentage treatment differ. |
| X063 | Nutrition | Food journal filtered by selected day | Partial | Viewed empty journal | Local list exists, without selected-day filtering. |
| X064 | Nutrition | Edit values and undo logged meal | Unverified | Privacy text advertises edit/undo; no populated meal fixture used | Local list lacks these actions; actual reference populated-state controls need evidence. |
| X065 | Nutrition | AI meal analysis and confirmation/error states | Unverified | Connection prompt visible; no AI connected | No actual analysis locally; connected, failure and confirmation states not exercised. |
| X066 | Journal | Note and five optional mood choices | Present | Viewed reference form; local note addition verified in prior run | Core fields exist; persistence and dates are separate gaps. |
| X067 | Journal | Date selection | Missing | Viewed Journal date input | Local date is hard-coded. |
| X068 | Journal | Disabled empty-note save state | Missing | Observed disabled Save check-in with explanatory help | Local submit stays enabled and uses native required validation. |
| X069 | Journal | Reload check-ins and first-note focus action | Missing | Viewed Reload check-ins and Write your first check-in | No equivalent local reload/start controls. |
| X070 | Journal | Private dated history | Partial | Viewed empty reference history | Local entries are tab-only and fixed to one date; populated reference controls unverified. |
| X071 | Journal | AI reflection connection and consent | Partial | Opened Connect your AI into assistant | Local action opens deterministic coach; no reference reflection UI. |
| X072 | Journal | Mood/recovery/sleep comparison threshold | Missing | Observed zero of three tagged check-ins requirement | Local panel shows count only, without threshold or aligned mood graph. |
| X073 | Sleep | Last-night hero and stage composition | Partial | Viewed duration, stages, date and baseline | Local sample stage bar exists separately; layout and baseline differ. |
| X074 | Sleep | Sleep goal and recovery goal editing | Present | Opened both numeric fields; did not save reference settings | Local tab-only target editor exists; account persistence is outside this check. |
| X075 | Sleep | Goal achievement counts | Missing | Viewed nights/days meeting goals | No computed counts locally. |
| X076 | Sleep | Seven-night debt and previous-week comparison | Missing | Viewed debt total and change | No debt calculation or comparison locally. |
| X077 | Sleep | Fourteen-night goal-met visualization | Missing | Viewed goal timeline and legend | No equivalent local goal timeline. |
| X078 | Sleep | Performance and efficiency explorers | Missing | Opened both metric dialogs | Local cards are placeholders. |
| X079 | Sleep | Deep, REM and light history explorers | Missing | Opened all three through metric-next | Local stage totals do not open individual historical explorers. |
| X080 | Sleep | Awake-time explorer | Missing | Opened Awake time dialog | Local placeholder only. |
| X081 | Blood records | Separate results and source-documents panels | Present | Viewed both reference panels | Local layout has the same separation, with prototype-only records. |
| X082 | Blood records | Test/date/value/unit/optional range fields | Present | Opened reference form; local reversed-range rejection tested previously | Core fields exist. Actual reference save and server validation not tested. |
| X083 | Blood records | Laboratory and notes fields | Missing | Viewed optional Laboratory and Notes | Both omitted locally. |
| X084 | Blood records | Same-test trend and units kept separate | Unverified | Empty-state text promises time series and separate units | Local table has no per-test trend/grouping; reference filled-data behavior not tested. |
| X085 | Blood records | Private-upload dialog and size guidance | Missing | Opened Add a lab report: PDF/image and ten-MB limit | Local filename chooser skips this dialog and does not upload. |
| X086 | Blood records | Upload progress/failure/success and document access | Unverified | Controls inspected; no file submitted | No real upload, private download or retained file locally; reference execution not tested. |
| X087 | AI | Full assistant panel, composer and empty-state prompts | Missing | Opened through Journal and read loaded empty conversation | Local coach is a different fixed-response dialog. |
| X088 | AI | Optional sharing of thirty-day averages | Missing | Viewed unchecked context control | No local context-sharing control. |
| X089 | AI | Clear chat history | Missing | Button visible; not executed | No equivalent history management; deletion not tested. |
| X090 | AI | Eight-provider selector | Missing | Opened Your AI settings and read all eight provider options | OpenAI, Anthropic, Gemini, OpenRouter, Mistral, Groq, xAI and DeepSeek absent locally. |
| X091 | AI | Model field and Find my models | Missing | Viewed editable model and discovery action | No model selection/discovery UI. |
| X092 | AI | Verify and connect/disconnect states | Unverified | Connection form visible; no key entered | No connection lifecycle locally; valid/invalid-key/disconnect states need evidence. |
| X093 | AI | Separate OpenAI key for portraits and voice | Missing | Opened separate settings dialog | No corresponding UI locally; no credentials accessed or changed. |
| X094 | Profile | Profile settings workspace | Missing | Opened Profile page | Local avatar opens Fitzen settings only. |
| X095 | Profile | CSV and JSON data export actions | Missing | Both visible; downloads not executed | No corresponding export UI in the mockup. |
| X096 | Profile | Privacy/data-use dialog and full-notice link | Missing | Opened disclosure dialog and observed notice link | Local notes are not the same privacy workspace. |
| X097 | Profile | Reference-photo list/open/delete controls | Missing | Viewed controls; personal file not opened or deleted | No local photo-management list. |
| X098 | Profile | Age-group comparison eligibility and explanation | Missing | Viewed empty group state and methodology | Fitzen competition scope is a different feature, not a replacement for this comparison. |
| X099 | Profile | Comparison-preferences entry | Missing | Visible entry; same preferences flow inspected separately | No local opt-in preferences entry. |
| X100 | Profile | Sign-out flow | Unverified | Visible in account menu and Profile; not executed | No mock account/session lifecycle; reference sign-out result not tested. |
| X101 | Integrations | WHOOP-specific capability card | Missing | Viewed automatic-sync capabilities and ninety-day scope | Generic local wearable card does not preserve provider-specific content. |
| X102 | Integrations | WHOOP authorization, connected and disconnect states | Unverified | Connect control visible; not authorized | No mock OAuth/connected/disconnect states; reference execution not tested. |
| X103 | Integrations | Apple Health import instructions and file dialog | Missing | Opened zip/XML dialog; device parsing and ninety-day scope visible | Generic export card omits provider instructions and import interface. |
| X104 | Integrations | Fitbit import instructions and file types | Missing | Opened Google Takeout/archive/JSON/CSV dialog | No Fitbit-specific local interface. |
| X105 | Integrations | Fitbit fallback weight units | Missing | Viewed in-file / kg / lb selector | No local unit fallback control. |
| X106 | Integrations | Import preview/progress/errors/duplicates/completion | Unverified | Import disabled without file; no file submitted | Not implemented locally; reference post-selection states need fixtures. |
| X107 | Integrations | Source/date provenance and disconnect-retention explanation | Partial | Viewed source policy paragraph | Local generic provenance explanation omits disconnect/retention behavior. |
| X108 | Visual fidelity | Typography, color and surface treatment | Partial | Compared rendered pages in both tabs | System font and warm Fitzen palette are intentional; reference spacing, composition and card content still differ. |
| X109 | Visual fidelity | Portrait/calendar composition and metric density | Partial | Compared Home, Body and Sleep content | Current mockup is a reinterpretation, not an exact visual clone. |
| X110 | Visual fidelity | Responsive and keyboard parity across every state | Unverified | Earlier phone checks covered local layouts, not every reference branch | No complete paired responsive, focus, hover, loading or error-state comparison. |
| X111 | Unseen states | Logged-out landing, authentication and recovery | Unverified | Signed-in session retained; no logout performed | Not audited in this run and not represented by the mockup. |
| X112 | Unseen states | Populated histories, real imports and connected-AI behavior | Unverified | Reference sample/empty states only | Cannot certify hidden or data-dependent features from these observations. |

## Verification trail

Evidence consists of the browser tool observations in this audit conversation and the reproduced paths described above. This report does not claim an independent screenshot archive, source-code access to Xeyo, or an exhaustive automated crawl. Prototype wellness/profile/source surfaces were reopened for direct comparison. Prior local save/reload, sample form and responsive checks are reused only where explicitly noted.

The pull was blocked by unrelated working-tree edits, which were preserved. Graphify query/update were attempted but the CLI is unavailable. This audit changes reports and handoff notes only, not product markup.
