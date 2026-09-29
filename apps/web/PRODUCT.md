# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primary: young athletes aged 13–25, often students in towns and villages, with only a phone. They want to test themselves at a sport or exercise, get told exactly what they did right or wrong, and be noticed. Secondary (confirmed context, not the landing audience): coaches and Sports Authority of India (SAI) officials who evaluate talent.

## Product Purpose
Fitzen turns a phone or laptop camera into a sports-science lab. The athlete picks an exercise, the camera opens, and every measured joint angle is drawn on the video in green (correct), yellow (moderate) or red (fix it). When the session ends, Fitzen gives a detailed report (reps, cadence, tempo, range of motion, time under tension, fatigue, per-joint accuracy, jump height, release angle) and a list of how to do better. Success: an athlete finishes a session and understands how to improve.

## Positioning
90 exercises, one coach. Gym lifts, calisthenics, athletics, throws and strikes, Olympic lifts, the SAI fitness battery, yoga and mobility are all measured by the same joint-angle engine with live colour-coded feedback and coaching, on the device, with no equipment.

## Operating Context
Built for SIH25073 (Smart India Hackathon problem statement from SAI / Ministry of Youth Affairs & Sports: AI-powered mobile sports talent assessment). Final-year project at K.K. Wagh CSD. Used on a phone propped 2–3 m away, side-on or facing, often outdoors or in a small room.

## Capabilities and Constraints
- 90 exercise definitions across 8 categories: Gym, Calisthenics, Athletics, Throws & Strikes, Olympic Lifts, SAI Battery, Yoga, Mobility.
- Pose estimation runs on-device (MediaPipe Pose Landmarker). Video never leaves the device.
- No account needed right now; email sign-in is paused. Profile and history are stored locally.
- Every exercise can be run with live camera, an uploaded video, or a demo with a synthetic athlete.
- Measurements are single-camera screening estimates, not clinical measurements.

## Brand Commitments
- Name: Fitzen. No logo exists; a wordmark may be designed.
- May reference SIH25073, SAI and Khelo India as context. Do not imply endorsement.
- The landing page must match the existing app's Liquid Glass look (translucent glass over a living aurora, spring motion, lime `#c8f135` and cyan `#64d2ff` accents), per the user.

## Evidence on Hand
Real: the exercise catalogue (`packages/engines/src/motion/catalog`), the live engine and its demo athlete, which can be shown running. Absent: user counts, testimonials, accuracy benchmarks against lab equipment, partnerships. Do not fabricate these.

## Product Principles
- Show the athlete's body being understood; don't describe AI.
- Instant: from landing to moving in two taps, no sign-up.
- Honest numbers: every figure shown is measured, and its limits are stated.
- Private by default: the camera feed stays on the device.
