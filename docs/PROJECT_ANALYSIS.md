# Fitzen project analysis

Date: 2026-10-17. Source baseline: main, 374b46e. Scope: repository architecture, implementation maturity, validation evidence and local build/test health. No production services were changed or independently verified.

## Assessment

Fitzen is a substantial final-year prototype with a coherent on-device assessment architecture. Its strongest contribution is the config-driven motion engine and its integration into an offline-capable athlete workflow. Its next milestone should be independent measurement validation, rather than expanding the exercise catalog. It is not yet evidenced as a reliable talent-selection instrument.

## Architecture and strengths

- `packages/engines`: shared TypeScript motion, athlete, integrity, crypto and gamification logic. Ninety exercise definitions reuse MotionSession rather than separate pipelines. MediaPipe inference is a separate web concern.
- `apps/web`: React/Vite PWA; camera, uploaded video and synthetic demonstration feed the assessment flow. Guided testing, evidence-aware results, history, personal ranges and coach validation export make a usable research workflow.
- `apps/web/src/app/store.ts`: device-first profile/history, account-scoped storage, offline retries and Supabase backup. Standard-range recounting avoids using personalized rep thresholds for leaderboard scores.
- `supabase/migrations`: account, consent, rankings, squads and role policies. The current account path uses Supabase; `apps/server` is a separate legacy API, including signing functionality that is not integrated into the current live assessment flow.
- Lazy-loaded routes/languages, low-end pose fallback and explicit offline preparation fit the intended phone-first audience. Five languages exist; translation completeness and native-speaker quality need separate verification.

## Main gaps, ordered by impact

1. **External accuracy evidence.** `motion/validation/accuracy.test.ts` uses the same synthetic athlete family as the implementation. It tests geometry, temporal logic and noise tolerance, but excludes MediaPipe errors, perspective, occlusion and actual take-off/landing mechanics. `docs/VALIDATION.md` correctly distinguishes these results from field accuracy. Run a small, protocol-controlled real-athlete study before relying on form colours, percentiles or talent ranking.
2. **Assessment authenticity.** `store.ts` uploads client-calculated values and verdicts; migration 005 explicitly documents this trust boundary. A modified client can submit altered evidence. Signing needs trusted verification and a defined threat model: a client-held signing key alone cannot prove a physical performance happened.
3. **Account operations.** The latest shared log confirms migration 005 was applied, contradicting the older Current state. Custom SMTP, owner/admin onboarding, cross-device sync and account deletion still need end-to-end verification. Profile deletion removes application data; deleting the authentication identity remains a separate concern.
4. **Privacy communication and consent.** Video remaining local does not mean all athlete data remains local: signed-in profile and session reports sync. The app has consent/profile controls, but no dedicated privacy route in App.tsx. The handoff acknowledges guardian-mailbox confirmation is not verified parental identity. Resolve these product/operational gaps before broad youth onboarding.
5. **Protocol and exercise limitations.** Current roadmap records fixed-side poses, right-handed throws, release checks sampled mid-extension, and holds triggered during entry. Prioritize a small defensible guided battery over equal accuracy claims across all 90 exercises. Personalized practice thresholds should stay separate from standardized assessment protocols.
6. **Release repeatability.** No tracked GitHub Actions workflow was found. Root build checks engines and web; server typecheck is separate, and SQL tests need local PostgreSQL server binaries. Automate these existing checks before growing the test suite. The motion engine is about 1,278 lines, but file length alone does not justify a refactor.
7. **Handoff drift.** Deployment, migration and language summaries have fallen behind the Log. Correct contradictory statements promptly so accounts do not repeat completed operational work.

## Verification and limits

Production build and separate server typecheck passed locally. All 269 tests passed: engines 209, server 34, web 26. No camera/browser/device QA or live Supabase check was performed. SQL tests could not run with the expected PostgreSQL binaries absent. Graphify query was attempted, but its CLI is unavailable; source inspection was used instead.

## Recommended next milestone

Freeze a small guided battery and camera protocol; collect consented paired reference measurements across representative phones and athletes; report per-test error, tracking failures and false flags. In parallel, verify account onboarding/sync/deletion with test accounts and turn the existing build/test commands into a repeatable release gate. Preserve the wider exercise catalog as practice/demo scope until independently validated.
