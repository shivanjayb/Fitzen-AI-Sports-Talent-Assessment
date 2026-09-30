// Cross-check of Fitzen joint/segment angles against Sports2D (BSD-3, Pagnon et al., JOSS 2024),
// whose angle maths lives in Pose2Sim.common (angle_dict / points_to_angles / fixed_angles).
// Fixture: fixtures/gen_sports2d.py runs the upstream functions verbatim on 200 seeded poses.
//
// Convention mapping (S = Sports2D value in degrees, image y down, X flipped when facing left):
//   knee, elbow, wrist  Fitzen = 180 - |S|           (Sports2D: signed flexion, 0 = straight)
//   hip                 Fitzen = 180 - |S|           (Sports2D: signed flexion of thigh vs trunk)
//   shoulder            Fitzen = |S|                 (Sports2D: signed arm-vs-trunk flexion)
//   ankle               Fitzen = |wrap(S - 90)|      (Sports2D: dorsiflexion, +90 offset, foot = heel->toe)
//   segment (same dir)  vertical = atan2(|cos S|, sin S), horizontal = atan2(|sin S|, |cos S|)
//   shin vs shank       vertical = atan2(|cos S|, -sin S)   (Sports2D shank points knee->ankle)
// Fitzen angles are unsigned (0..180), so the sign Sports2D keeps (flexion vs hyperextension) is dropped.
//
// Landmark-definition differences (not formula errors), checked on the sagittal subset only:
//   hip/shoulder/trunk: Sports2D uses Neck (mid-shoulder) and mid-Hip; Fitzen uses the same-side shoulder/hip.
//   ankle: Sports2D foot vector is heel->big-toe; Fitzen uses ankle->foot_index.
// On all 200 poses the same Sports2D functions are fed Fitzen's landmark choice ("@side" keys) instead.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MotionSession } from '../engine.js';
import type { AngleDef, ExerciseDef } from '../types.js';

interface Case { sagittal: boolean; x: number[]; y: number[]; sports2d: Record<string, number> }
const fx = JSON.parse(readFileSync(new URL('./fixtures/sports2d_angles.json', import.meta.url), 'utf8')) as { width: number; height: number; cases: Case[] };

const TOL = 1e-6;
const R2D = 180 / Math.PI, rad = (d: number) => d / R2D;
const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const vert = (s: number) => R2D * Math.atan2(Math.abs(Math.cos(rad(s))), Math.sin(rad(s)));
const vertRev = (s: number) => R2D * Math.atan2(Math.abs(Math.cos(rad(s))), -Math.sin(rad(s)));
const horiz = (s: number) => R2D * Math.atan2(Math.abs(Math.sin(rad(s))), Math.abs(Math.cos(rad(s))));
const flex = (s: number) => 180 - Math.abs(s);

const SIDES = ['left', 'right'] as const;
const angles: AngleDef[] = [
  ...SIDES.flatMap((side) => (['knee', 'hip', 'elbow', 'shoulder', 'ankle', 'wrist'] as const).map((joint): AngleDef => ({ id: `${joint}_${side}`, label: joint, kind: 'joint', joint, side }))),
  ...SIDES.flatMap((side) => (['trunk', 'shin', 'thigh', 'upperArm', 'forearm'] as const).flatMap((segment) =>
    (['vertical', 'horizontal'] as const).map((ref): AngleDef => ({ id: `${segment}_${ref}_${side}`, label: segment, kind: 'segment', segment, ref, side })))),
  { id: 'shoulders', label: 'shoulders', kind: 'segment', segment: 'shoulders', ref: 'horizontal' },
  { id: 'hips', label: 'hips', kind: 'segment', segment: 'hips', ref: 'horizontal' },
];
const def: ExerciseDef = {
  id: 'sports2d-ref', name: 'ref', category: 'mobility', icon: '', mode: 'hold', camera: 'side', difficulty: 1,
  equipment: [], muscles: [], summary: '', setup: [], met: 1, angles, checks: [], hold: { targetSec: 1 },
};

/** First frame of a fresh session: every One Euro filter returns its input, so these are raw angles. */
function fitzen(c: Case): Record<string, number> {
  const s = new MotionSession(def);
  const st = s.push({ timestampMs: 0, landmarks: c.x.map((x, i) => ({ x, y: c.y[i]!, z: 0, visibility: 1 })) }, fx.width / fx.height);
  expect(st.tracking).toBe(true);
  return Object.fromEntries(Object.entries(st.angles).map(([k, v]) => [k, v.value]));
}

// [Fitzen id, Sports2D key, mapping, sagittal-only]
type Row = [string, string, (s: number) => number, boolean];
const rows: Row[] = SIDES.flatMap((sd): Row[] => [
  [`knee_${sd}`, `${sd} knee`, flex, false],
  [`elbow_${sd}`, `${sd} elbow`, flex, false],
  [`wrist_${sd}`, `${sd} wrist@ordered`, flex, false],
  [`hip_${sd}`, `${sd} hip@side`, flex, false],
  [`hip_${sd}`, `${sd} hip`, flex, true],
  [`shoulder_${sd}`, `${sd} shoulder@side`, Math.abs, false],
  [`shoulder_${sd}`, `${sd} shoulder`, Math.abs, true],
  [`ankle_${sd}`, `${sd} ankle@side`, (s) => Math.abs(wrap(s - 90)), false],
  [`ankle_${sd}`, `${sd} ankle`, (s) => Math.abs(wrap(s - 90)), true],
  [`thigh_vertical_${sd}`, `${sd} thigh`, vert, false],
  [`thigh_horizontal_${sd}`, `${sd} thigh`, horiz, false],
  [`shin_vertical_${sd}`, `${sd} shank`, vertRev, false],
  [`shin_horizontal_${sd}`, `${sd} shank`, horiz, false],
  [`upperArm_vertical_${sd}`, `${sd} arm`, vert, false],
  [`upperArm_horizontal_${sd}`, `${sd} arm`, horiz, false],
  [`forearm_vertical_${sd}`, `${sd} forearm`, vert, false],
  [`forearm_horizontal_${sd}`, `${sd} forearm`, horiz, false],
  [`trunk_vertical_${sd}`, `${sd} trunk@side`, vert, false],
  [`trunk_horizontal_${sd}`, `${sd} trunk@side`, horiz, false],
  [`trunk_vertical_${sd}`, 'trunk', vert, true],
]).concat([['shoulders', 'shoulders', horiz, false], ['hips', 'pelvis', horiz, false]]);

describe('Sports2D reference angles', () => {
  const got = fx.cases.map(fitzen);
  const maxErr = (r: Row) => Math.max(...fx.cases.flatMap((c, i) => (r[3] && !c.sagittal ? [] : [Math.abs(got[i]![r[0]]! - r[2](c.sports2d[r[1]]!))])));

  it('has 200 poses, 20 sagittal', () => {
    expect(fx.cases).toHaveLength(200);
    expect(fx.cases.filter((c) => c.sagittal)).toHaveLength(20);
  });

  it.each(rows.map((r) => [`${r[0]} ~ ${r[1]}${r[3] ? ' (sagittal)' : ''}`, r] as const))('%s', (_n, r) => {
    const e = maxErr(r);
    console.log(`max|err| ${r[0]} vs "${r[1]}"${r[3] ? ' [sagittal]' : ''}: ${e.toExponential(2)} deg`);
    expect(e).toBeLessThan(TOL);
  });

  it('documents landmark-definition gaps on non-sagittal poses (informational)', () => {
    const gap = (r: Row) => Math.max(...fx.cases.map((c, i) => Math.abs(got[i]![r[0]]! - r[2](c.sports2d[r[1]]!))));
    const g = {
      hip: Math.max(...SIDES.map((sd) => gap([`hip_${sd}`, `${sd} hip`, flex, false]))),
      shoulder: Math.max(...SIDES.map((sd) => gap([`shoulder_${sd}`, `${sd} shoulder`, Math.abs, false]))),
      ankle: Math.max(...SIDES.map((sd) => gap([`ankle_${sd}`, `${sd} ankle`, (s) => Math.abs(wrap(s - 90)), false]))),
      trunk: Math.max(...SIDES.map((sd) => gap([`trunk_vertical_${sd}`, 'trunk', vert, false]))),
      // Pose2Sim angle_dict lists 'left wrist' as [LElbow, LIndex, LWrist] (vertex = index) vs right [RElbow, RWrist, RIndex].
      leftWristUpstream: gap(['wrist_left', 'left wrist', flex, false]),
    };
    console.log('definition gaps (deg, max over 200 poses):', g);
    expect(g.leftWristUpstream).toBeGreaterThan(1); // upstream asymmetry is real; if Pose2Sim fixes it this flips
  });
});
