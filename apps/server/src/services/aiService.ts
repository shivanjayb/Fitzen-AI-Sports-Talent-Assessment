import type { PotentialResult } from '@fitzen/engines';
import type { AthleteStatsSummary } from './statsService.ts';

/** Rule-based coaching only. Athlete measurements never leave the server for an external model. */

export interface CoachingBriefInput {
  athleteName: string;
  ageYears: number;
  sport?: string;
  stats: AthleteStatsSummary;
  potential: PotentialResult | null;
}

export interface CoachingBrief {
  source: 'deterministic';
  headline: string;
  brief: string;
  focusAreas: string[];
}

function cm(m: number): string {
  return `${Math.round(m * 100)} cm`;
}

/** Deterministic fallback — rule-based but genuinely useful coaching text. */
export function deterministicBrief(input: CoachingBriefInput): CoachingBrief {
  const { athleteName, stats, potential } = input;
  const focusAreas: string[] = [];
  const lines: string[] = [];

  if (stats.assessmentCount === 0) {
    return {
      source: 'deterministic',
      headline: `Welcome, ${athleteName} — time for a baseline`,
      brief:
        'No assessments on record yet. Run 2–3 vertical jump assessments this week to establish a reliable baseline; everything else builds from there.',
      focusAreas: ['Complete first assessment', 'Establish baseline'],
    };
  }

  lines.push(
    `Best recorded jump (integrity checked): ${cm(stats.bestJumpHeightM)} across ${stats.assessmentCount} assessment(s); latest at ${cm(stats.latestJumpHeightM)}.`,
  );

  if (potential) {
    lines.push(
      `Experimental screening estimate: current performance ${potential.currentPerformance}/100 and potential ${potential.potentialScore}/100. These heuristic scores and their confidence labels are not validated predictions or selection criteria.`,
    );
    const opportunities = potential.insights.filter((i) => i.kind === 'opportunity').slice(0, 3);
    for (const opp of opportunities) {
      lines.push(opp.message);
      focusAreas.push(opp.factor);
    }
    const strengths = potential.insights.filter((i) => i.kind === 'strength').slice(0, 2);
    for (const s of strengths) lines.push(`Strength to build on: ${s.message}`);
  }

  if (stats.jumpCv > 0.1) {
    lines.push(
      'Session-to-session variability is high — prioritise consistent warm-up and jump technique before chasing bigger numbers.',
    );
    focusAreas.push('Consistency');
  }
  if (stats.streakDays >= 3) {
    lines.push(`Good momentum: a ${stats.streakDays}-day training streak. Protect the habit.`);
  }
  if (focusAreas.length === 0) focusAreas.push('Explosive strength', 'Keep testing weekly');

  return {
    source: 'deterministic',
    headline: `${athleteName}: ${cm(stats.bestJumpHeightM)} personal best`,
    brief: lines.join(' '),
    focusAreas: [...new Set(focusAreas)],
  };
}

export async function generateCoachingBrief(input: CoachingBriefInput): Promise<CoachingBrief> {
  return deterministicBrief(input);
}
