/**
 * @fitzen/engines — pure, isomorphic domain engines for Fitzen.
 *
 * These modules contain no I/O and no framework dependencies so they can run
 * unchanged in the browser (on-device inference), in the Node API server
 * (authoritative verification), and in the test suite.
 */

// Jump estimation
export * from './jump/types.js';
export * from './jump/uncertainty.js';
export { analyzeJump, type AnalyzeOptions } from './jump/jumpAnalyzer.js';
export { simulateJump, type SimulateJumpOptions } from './jump/simulateJump.js';

// Cryptographic assessment engine
export * from './crypto/assessmentCrypto.js';

// Potential score engine
export * from './potential/potentialScore.js';

// Gamification
export * from './gamification/badges.js';

// Kinematics & 3D Vector Geometry
export * from './kinematics/types.js';
export * from './kinematics/vectorGeometry.js';
export * from './kinematics/savitzkyGolay.js';
export * from './kinematics/gymCrowdFilter.js';

// FSM Fraud Detection & Repetition Engine
export * from './fsm/types.js';
export * from './fsm/exerciseFSM.js';

// Fatigue Analytics Engine
export * from './analytics/fatigueTracker.js';

// Digital Resume Generator
export * from './crypto/digitalResume.js';

// Multi-Assessment Analyzers & Simulators (Push-Ups & Squats)
export * from './exercise/exerciseAnalyzer.js';
export * from './exercise/simulateExercises.js';




// Config-driven motion analysis (exercise library)
export * from './motion/types.js';
export * from './motion/engine.js';
export { simulateExercise, type PuppetOptions } from './motion/puppet.js';
export * from './motion/forensics.js';
export * from './motion/catalog/index.js';
export * from './motion/integrity.js';
export * from './motion/filtfilt.js';

// Athlete profile: body & diet, norms, readiness, projection, future summary
export * from './athlete/types.js';
export * from './athlete/body.js';
export * from './athlete/norms.js';
export * from './athlete/readiness.js';
export * from './athlete/projection.js';
export * from './athlete/summary.js';
