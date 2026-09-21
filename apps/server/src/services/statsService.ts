import {
  computePotential,
  evaluateBadges,
  newlyEarnedBadges,
  type AthleteStats,
  type PotentialFeatures,
  type PotentialResult,
} from '@fitzen/engines';
import type { Database } from '../db.ts';
import type { AthleteProfile } from '../domain/types.ts';

export interface AthleteStatsSummary extends AthleteStats {
  latestJumpHeightM: number;
  totalAssessments: number;
  avgConfidence: number;
  jumpCv: number;
}

function ageYears(birthDate: string, at: Date = new Date()): number {
  const born = new Date(birthDate);
  const ms = at.getTime() - born.getTime();
  return ms / (365.2425 * 24 * 3600 * 1000);
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export async function computeAthleteStats(db: Database, athleteId: string): Promise<AthleteStatsSummary> {
  const rows = await db.listVerifiedAssessments(athleteId);

  const jumpRows = rows.filter((r: any) => r.test === 'vertical_jump' || !r.test);
  const heights = jumpRows.map((r: any) => Number(r.jump_height_m) || 0);
  const bestJump = heights.length ? Math.max(...heights) : 0;
  const latestJump = heights.length ? heights[heights.length - 1]! : 0;

  const pushupValidReps = rows
    .filter((r: any) => r.test === 'pushup')
    .map((r: any) => {
      try {
        const m = typeof r.metrics_json === 'string' ? JSON.parse(r.metrics_json) : r.metrics_json;
        return typeof m.validReps === 'number' ? m.validReps : 0;
      } catch {
        return 0;
      }
    });

  const squatValidReps = rows
    .filter((r: any) => r.test === 'squat')
    .map((r: any) => {
      try {
        const m = typeof r.metrics_json === 'string' ? JSON.parse(r.metrics_json) : r.metrics_json;
        return typeof m.validReps === 'number' ? m.validReps : 0;
      } catch {
        return 0;
      }
    });

  const bestPushups = pushupValidReps.length ? Math.max(...pushupValidReps) : 0;
  const bestSquats = squatValidReps.length ? Math.max(...squatValidReps) : 0;

  const testTypes = new Set(rows.map((r: any) => r.test || 'vertical_jump'));
  const completedTestTypes = testTypes.size;

  let jumpCv = 0.12;
  if (heights.length >= 2) {
    const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
    const variance = heights.reduce((a, b) => a + (b - mean) * (b - mean), 0) / heights.length;
    jumpCv = mean > 0 ? Math.sqrt(variance) / mean : 0.12;
  }

  let runningBest = 0;
  let bestImprovement = 0;
  for (const h of heights) {
    if (h > runningBest) {
      if (runningBest > 0) bestImprovement = Math.max(bestImprovement, h - runningBest);
      runningBest = h;
    }
  }

  const days = [...new Set(rows.map((r: any) => dayKey(String(r.captured_at))))].sort();
  const streakDays = longestRecentStreak(days);

  const avgConfidence = rows.length
    ? rows.reduce((a: number, r: any) => a + (Number(r.confidence) || 0), 0) / rows.length
    : 0;

  return {
    assessmentCount: rows.length,
    totalAssessments: rows.length,
    bestJumpHeightM: bestJump,
    latestJumpHeightM: latestJump,
    bestRelativePowerWkg: rows.length ? Math.max(...rows.map((r: any) => Number(r.relative_power_wkg) || 0)) : 0,
    bestSymmetryScore: rows.length ? Math.max(...rows.map((r: any) => Number(r.symmetry_score) || 0)) : 0,
    bestMovementQuality: rows.length ? Math.max(...rows.map((r: any) => Number(r.movement_quality) || 0)) : 0,
    bestPushups,
    bestSquats,
    completedTestTypes,
    activeDays: days.length,
    streakDays,
    bestImprovementM: bestImprovement,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    jumpCv: Math.round(jumpCv * 1000) / 1000,
  };
}

function longestRecentStreak(sortedDays: string[]): number {
  if (sortedDays.length === 0) return 0;
  let streak = 1;
  for (let i = sortedDays.length - 1; i > 0; i--) {
    const cur = new Date(sortedDays[i]!);
    const prev = new Date(sortedDays[i - 1]!);
    const diffDays = Math.round((cur.getTime() - prev.getTime()) / (24 * 3600 * 1000));
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}

export async function athleteBadges(db: Database, athleteId: string) {
  const stats = await computeAthleteStats(db, athleteId);
  const earnedRows = await db.getBadges(athleteId);
  const earnedAt = new Map(earnedRows.map((r: any) => [r.badge_id, String(r.earned_at)]));
  return evaluateBadges(stats).map((b) => ({
    ...b,
    earnedAt: earnedAt.get(b.id) ?? null,
  }));
}

export async function awardBadges(
  db: Database,
  athleteId: string,
  before: AthleteStats,
): Promise<string[]> {
  const after = await computeAthleteStats(db, athleteId);
  const fresh = newlyEarnedBadges(before, after);
  const now = new Date().toISOString();
  for (const id of fresh) {
    await db.insertBadge(athleteId, id, now);
  }
  return fresh;
}

export async function potentialForAthlete(
  db: Database,
  profile: AthleteProfile,
): Promise<PotentialResult | null> {
  const stats = await computeAthleteStats(db, profile.userId);
  if (stats.assessmentCount === 0) return null;

  const rows = await db.listVerifiedAssessments(profile.userId);
  if (rows.length === 0) return null;

  const best = [...rows].sort((a: any, b: any) => (Number(b.jump_height_m) || 0) - (Number(a.jump_height_m) || 0))[0];
  if (!best) return null;

  const features: PotentialFeatures = {
    ageYears: Math.round(ageYears(profile.birthDate) * 10) / 10,
    sex: profile.sex,
    heightCm: profile.heightCm,
    massKg: profile.massKg,
    midParentalHeightCm: profile.midParentalHeightCm,
    jumpHeightM: Number(best.jump_height_m) || 0,
    relativePowerWkg: Number(best.relative_power_wkg) || 0,
    movementQuality: Number(best.movement_quality) || 0,
    symmetryScore: Number(best.symmetry_score) || 0,
    jumpCv: stats.jumpCv,
    assessmentCount: stats.assessmentCount,
  };
  return computePotential(features);
}

export interface LeaderboardEntry {
  rank: number;
  athleteId: string;
  name: string;
  region: string | null;
  sport: string | null;
  bestJumpHeightM: number;
  bestRelativePowerWkg: number;
  bestPushups: number;
  bestSquats: number;
  assessments: number;
}

export async function leaderboard(
  db: Database,
  opts: { metric?: 'jump' | 'pushup' | 'squat' | 'power'; region?: string; limit?: number } = {},
): Promise<LeaderboardEntry[]> {
  const rows = await db.getLeaderboardRows(opts);
  return rows.map((r: any, i: number) => ({
    rank: i + 1,
    athleteId: String(r.athlete_id),
    name: String(r.name),
    region: r.region ? String(r.region) : null,
    sport: r.sport ? String(r.sport) : null,
    bestJumpHeightM: Math.round((Number(r.best_jump) || 0) * 1000) / 1000,
    bestRelativePowerWkg: Math.round((Number(r.best_power) || 0) * 10) / 10,
    bestPushups: Number(r.best_pushups) || 0,
    bestSquats: Number(r.best_squats) || 0,
    assessments: Number(r.n) || 0,
  }));
}
