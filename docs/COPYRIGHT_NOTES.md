# Copyright filing: study notes

Digest of the owner's copyright draft, **Copyright_Draft.pdf** (3 pages, Microsoft Word, created 2026-06-29), read on 2026-11-21. Kept in the owner's OneDrive project folder `.../TY CSD/Project/CopyRight/`, not in this repository. The same folder also holds `Acknowledgment_letter.pdf`, `Copyright Office.pdf`, `Copyright Office1.pdf`, `Author noc.pdf`, `NOC noname.pdf` and a payment receipt; those were not read.

## What the draft says

- **Title:** Fitzen Decentralized Edge-Native Biomechanics and Cryptographic Assessment Engine. The final report gives this filing **Diary No. LD-30387/2026-CO** (Annexure D); the registration outcome is not stated in either document.
- **Authors (in this order):** Manodnya Pratik Deshmukh, Shivanjay Prakash Bajpai, Kadamb Sonawane, Aryan Sukhwal, Deepasha Sakhare.
- **Abstract:** Indian scouting is fragmented and costly; "over 85 % of potential athletes remain unassessed" (consistent with KIRTI: ~51,000 assessed of 3,62,683 registered ≈ 86 % not assessed). Proposes a proprietary dual-mode (offline/online) app: on-device MediaPipe pose tracking, hybrid microservices, API gateway with JWT, PostgreSQL/Supabase, a Verification & Flagging Engine, cheat detection, and a gamified GUI with leaderboards and badges, to help government sports authorities.
- **Keywords:** AI, edge computing, computer vision, pose estimation, MediaPipe, biomechanical assessment, microservices architecture, cheat detection engine, software framework.
- **Description:** feature-extraction pipeline for body angles, speed and endurance from camera and sensor input; works without continuous internet. Names the stack **React Native, Node.js/Express, Flask, MongoDB/PostgreSQL**. Modules: registration/login, pre-assessment training, video capture, server-side cross-check engine, JWT API gateway, **DeepSeek/CV integration and liveness prompts** for tampered videos, official dashboard with analytics and shortlist export, preprocessing (noise reduction, normalisation), selective streaming to a central database.
- **Literature survey:** three entries: Aulton et al. 2025 (deep-learning pose estimation in sport, systematic review; gap: no offline low-resource pipeline), Bansal et al. 2025 (MediaPipe rep counting and form; gap: no gamified, secure, government-database architecture), Islam et al. 2025 (CNN deepfake detection for remote video). The third entry has a purpose but no description; the list looks cut short.
- **Objectives (5):** study existing scouting systems for gaps; analyse a dual-mode edge-to-cloud architecture; design on-device pose extraction and cheat detection; analyse performance on speed, endurance and body angle; test the GUI and backend under variable network conditions.

## Draft versus what was built (checked in code 2026-11-21)

| Draft says | Repository |
|---|---|
| On-device MediaPipe, offline-first | Yes: MediaPipe Pose Landmarker in the browser; PWA works offline once prepared. |
| React Native client | React 18 + Vite PWA, with Capacitor 8 iOS/Android shells (not React Native). |
| Node.js/Express, Flask, MongoDB | No Express, Flask or MongoDB in the code. `apps/server` uses Node's built-in `node:http`; data is Supabase PostgreSQL. |
| JWT API gateway | `apps/server` issues HS256 JWTs with role checks; the web app itself talks to Supabase Auth directly. |
| Verification & Flagging Engine / cross-check | `integrity.ts` (physics checks) + `forensics.ts` (container/C2PA) + genuine/review/suspect verdicts; the server verifies ECDSA-signed assessments and audit chains. |
| DeepSeek/CV cheat detection | Not used for cheat detection. DeepSeek appears only as one bring-your-own-key provider in `apps/web/src/x/Profile.tsx` for Ask Fitzen and journal reflections. Anti-cheat is physics-based. |
| Liveness prompts | Not in the main PWA. Acoustic challenges and random cues exist in the separate research prototype (see `RESEARCH_CONTEXT.md`) and the published IJEDR paper. |
| Official dashboard, shortlist export | Coach and admin portals (`/coach`, `/admin`), coach validation CSV export. |
| Gamification: leaderboards, badges | Yes: 50 badges (`engines/src/gamification/badges.ts`), group/city/state/country/world, activity and size-class leaderboards. |
| Speed and endurance metrics | Partly: tempo, time under tension, fatigue drift, holds; sprint/endurance timing is listed as future work in the report. |

## Use

The draft records the filed scope (Jun 2026), written before the TypeScript rebuild. When describing the copyright, use its title and diary number; when describing the system, use the report and the code. Do not say Fitzen runs on React Native, Express, Flask, MongoDB or DeepSeek.
