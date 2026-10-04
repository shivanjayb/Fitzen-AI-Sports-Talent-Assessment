/**
 * Potential Score Engine.
 *
 * Predicts an athlete's future athletic potential from a small set of
 * interpretable features. The model is a transparent, weighted feature
 * pipeline (not a black box) so that every point of the score can be
 * attributed back to a concrete input — a hard requirement for talent
 * scouting where decisions must be explainable and auditable.
 *
 * Outputs:
 *   - currentPerformance: how the athlete performs *today* vs peers (0–100)
 *   - potentialScore:     projected ceiling given maturity headroom (0–100)
 *   - confidenceScore:    how much to trust the projection (0–100)
 *   - insights:           ranked, human-readable drivers with contributions
 *
 * Biological maturity uses the Khamis-Roche-style maturity-offset concept:
 * an athlete far from Peak Height Velocity (PHV) has more physical
 * development still to come, which raises potential headroom while widening
 * the confidence band.
 */

export interface PotentialFeatures {
  ageYears: number;
  sex: 'male' | 'female';
  heightCm: number;
  massKg: number;
  /** Parent-average (mid-parental) height in cm, if known — sharpens maturity estimate. */
  midParentalHeightCm?: number;

  /** Best vertical jump height in metres. */
  jumpHeightM: number;
  /** Relative peak power, W/kg. */
  relativePowerWkg: number;
  /** Movement-quality score in [0,100] from the jump analyzer. */
  movementQuality: number;
  /** Left/right symmetry in [0,100]. */
  symmetryScore: number;
  /** Coefficient of variation of recent jump heights (lower = more consistent). */
  jumpCv: number;
  /** Number of completed, verified assessments (drives confidence). */
  assessmentCount: number;
}

export interface Insight {
  /** Feature/category this insight is about. */
  factor: string;
  /** Signed contribution to potential score, in points. */
  contribution: number;
  /** 'strength' | 'opportunity' | 'context'. */
  kind: 'strength' | 'opportunity' | 'context';
  /** Plain-language explanation. */
  message: string;
}

export interface PotentialResult {
  currentPerformance: number;
  potentialScore: number;
  confidenceScore: number;
  /** Estimated years from peak height velocity (negative = pre-PHV). */
  maturityOffsetYears: number;
  /** Fraction of adult development already realized, [0,1]. */
  maturationFraction: number;
  insights: Insight[];
  /** Component sub-scores (0–100) for transparency and charting. */
  components: {
    explosiveness: number;
    power: number;
    movementQuality: number;
    coordination: number;
    consistency: number;
    anthropometric: number;
    maturityHeadroom: number;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Logistic mapping of a z-score to a 0–100 percentile-like score. */
function zToScore(z: number): number {
  return clamp(100 / (1 + Math.exp(-z * 1.1)), 0, 100);
}

/**
 * Age- and sex-referenced population means / SDs for vertical jump height (m)
 * and relative power (W/kg). Values are representative training norms used to
 * z-score an athlete against peers of the same age band and sex.
 */
function jumpNorm(age: number, sex: 'male' | 'female'): { mean: number; sd: number } {
  const a = clamp(age, 8, 30);
  // Jump height grows through adolescence then plateaus.
  const base = sex === 'male' ? 0.20 + 0.019 * (a - 8) : 0.17 + 0.013 * (a - 8);
  const mean = a > 20 ? (sex === 'male' ? 0.42 : 0.30) : base;
  return { mean, sd: 0.07 };
}

function powerNorm(age: number, sex: 'male' | 'female'): { mean: number; sd: number } {
  const a = clamp(age, 8, 30);
  const base = sex === 'male' ? 28 + 1.1 * (a - 8) : 24 + 0.7 * (a - 8);
  const mean = a > 20 ? (sex === 'male' ? 48 : 38) : base;
  return { mean, sd: 8 };
}

/**
 * Maturity offset (years from PHV) via a compact anthropometric model in the
 * spirit of Mirwald/Khamis-Roche. Pre-PHV athletes score negative; the model
 * blends chronological age distance from a sex-specific PHV age with a
 * height-for-age adjustment and, when available, mid-parental height.
 */
function estimateMaturity(f: PotentialFeatures): {
  offset: number;
  fraction: number;
} {
  const phvAge = f.sex === 'male' ? 13.8 : 11.9;
  let offset = f.ageYears - phvAge;

  // Taller-than-expected-for-age children tend to be advanced maturers.
  const expectedHeight =
    f.sex === 'male' ? 128 + 5.6 * (f.ageYears - 8) : 128 + 5.0 * (f.ageYears - 8);
  const heightAdj = (f.heightCm - expectedHeight) / 20; // ±1yr per 20cm deviation
  offset += clamp(heightAdj, -2, 2);

  if (f.midParentalHeightCm && f.midParentalHeightCm > 100) {
    // Athletes well below their genetic height target have more growth left.
    const predictedAdult =
      f.sex === 'male' ? f.midParentalHeightCm + 6.5 : f.midParentalHeightCm - 6.5;
    const remainingFrac = clamp((predictedAdult - f.heightCm) / predictedAdult, 0, 0.3);
    offset -= remainingFrac * 6;
  }

  // Maturation fraction: sigmoid of maturity offset, saturating by ~+4yr PHV.
  const fraction = clamp(1 / (1 + Math.exp(-(offset + 1.5) * 0.6)), 0.15, 1);
  return { offset, fraction };
}

export function computePotential(f: PotentialFeatures): PotentialResult {
  const { offset: maturityOffsetYears, fraction: maturationFraction } = estimateMaturity(f);

  // --- Component sub-scores (0–100) ---------------------------------------
  const jn = jumpNorm(f.ageYears, f.sex);
  const pn = powerNorm(f.ageYears, f.sex);

  const explosiveness = zToScore((f.jumpHeightM - jn.mean) / jn.sd);
  const power = zToScore((f.relativePowerWkg - pn.mean) / pn.sd);
  const movementQuality = clamp(f.movementQuality, 0, 100);
  const coordination = clamp(0.5 * f.symmetryScore + 0.5 * f.movementQuality, 0, 100);
  // Consistency: CV of 0 → 100, CV of 0.15 → ~40.
  const consistency = clamp(100 * Math.exp(-f.jumpCv / 0.09), 0, 100);

  // Anthropometric fit: power-to-mass leverage and a mild height bonus.
  const bmi = f.massKg / Math.pow(f.heightCm / 100, 2);
  const bmiPenalty = bmi > 28 ? (bmi - 28) * 3 : bmi < 16 ? (16 - bmi) * 2 : 0;
  const anthropometric = clamp(60 + (f.relativePowerWkg - pn.mean) * 1.5 - bmiPenalty, 0, 100);

  // Maturity headroom: undeveloped athletes have more ceiling to gain.
  const maturityHeadroom = clamp((1 - maturationFraction) * 100, 0, 100);

  // --- Current performance -------------------------------------------------
  const currentPerformance = Math.round(
    clamp(
      0.4 * explosiveness +
        0.3 * power +
        0.15 * coordination +
        0.15 * movementQuality,
      0,
      100,
    ),
  );

  // --- Potential score -----------------------------------------------------
  // Base is current ability; headroom adds a maturity-scaled uplift that is
  // gated by movement quality (raw athletes with poor mechanics realize less
  // of their ceiling) and consistency.
  const trainabilityGate = 0.5 + 0.5 * (0.6 * (movementQuality / 100) + 0.4 * (coordination / 100));
  const headroomUplift = maturityHeadroom * 0.45 * trainabilityGate;
  const potentialRaw = clamp(currentPerformance + headroomUplift, 0, 100);
  const potentialScore = Math.round(Math.max(potentialRaw, currentPerformance));

  // --- Confidence ----------------------------------------------------------
  // More assessments, lower CV, and being nearer to (or past) PHV all raise
  // confidence; deep pre-PHV projections are inherently less certain.
  const sampleConf = clamp(f.assessmentCount / 8, 0, 1); // saturates at 8 assessments
  const consistencyConf = clamp(1 - f.jumpCv / 0.15, 0, 1);
  const maturityConf = clamp(1 - Math.max(0, -maturityOffsetYears) / 5, 0.2, 1);
  const confidenceScore = Math.round(
    clamp((0.4 * sampleConf + 0.35 * consistencyConf + 0.25 * maturityConf) * 100, 5, 98),
  );

  // --- Insights (attribution) ---------------------------------------------
  const insights: Insight[] = [];
  const push = (
    factor: string,
    contribution: number,
    kind: Insight['kind'],
    message: string,
  ) => insights.push({ factor, contribution: Math.round(contribution * 10) / 10, kind, message });

  if (explosiveness >= 65) {
    push('Explosiveness', (explosiveness - 50) * 0.4, 'strength',
      `Vertical explosiveness is in the top tier for ${f.ageYears}-year-old ${f.sex} athletes.`);
  } else if (explosiveness < 45) {
    push('Explosiveness', (50 - explosiveness) * 0.4, 'opportunity',
      'Lower-body explosiveness is below peer average — plyometric and strength work will help most.');
  }

  if (power >= 65) {
    push('Power', (power - 50) * 0.3, 'strength', 'Relative power output is a clear strength.');
  } else if (power < 45) {
    push('Power', (50 - power) * 0.3, 'opportunity',
      'Relative power trails peers — building strength while managing mass will raise this.');
  }

  if (movementQuality < 65) {
    push('Movement quality', (65 - movementQuality) * 0.35 * trainabilityGate, 'opportunity',
      'Refining jump-and-land mechanics unlocks a large share of untapped potential.');
  } else {
    push('Movement quality', (movementQuality - 65) * 0.2, 'strength',
      'Clean, efficient movement mechanics — the athlete converts effort into output well.');
  }

  if (f.symmetryScore < 80) {
    push('Symmetry', (80 - f.symmetryScore) * 0.15, 'opportunity',
      `Left/right asymmetry (${f.symmetryScore}/100) suggests a unilateral imbalance worth addressing.`);
  }

  if (consistency < 55) {
    push('Consistency', (55 - consistency) * 0.2, 'opportunity',
      'Results vary run-to-run — more repetitions will both improve and clarify the true level.');
  } else if (consistency >= 80) {
    push('Consistency', (consistency - 60) * 0.15, 'strength',
      'Highly repeatable performances — a reliable indicator of the athlete’s real level.');
  }

  if (maturityHeadroom >= 50) {
    push('Biological maturity', maturityHeadroom * 0.3, 'context',
      `Estimated ${Math.abs(maturityOffsetYears).toFixed(1)} years from peak growth — substantial physical development is still ahead.`);
  } else if (maturityOffsetYears > 2) {
    push('Biological maturity', 5, 'context',
      'Physically mature — current results closely reflect long-term ability.');
  }

  if (f.assessmentCount < 3) {
    push('Data volume', 8, 'context',
      `Only ${f.assessmentCount} assessment(s) on record — complete a few more to tighten the projection.`);
  }

  // Rank by absolute contribution, strengths and opportunities before context.
  insights.sort((a, b) => {
    const rank = (k: Insight['kind']) => (k === 'context' ? 1 : 0);
    if (rank(a.kind) !== rank(b.kind)) return rank(a.kind) - rank(b.kind);
    return Math.abs(b.contribution) - Math.abs(a.contribution);
  });

  return {
    currentPerformance,
    potentialScore,
    confidenceScore,
    maturityOffsetYears: Math.round(maturityOffsetYears * 10) / 10,
    maturationFraction: Math.round(maturationFraction * 100) / 100,
    insights,
    components: {
      explosiveness: Math.round(explosiveness),
      power: Math.round(power),
      movementQuality: Math.round(movementQuality),
      coordination: Math.round(coordination),
      consistency: Math.round(consistency),
      anthropometric: Math.round(anthropometric),
      maturityHeadroom: Math.round(maturityHeadroom),
    },
  };
}
