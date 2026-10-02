/**
 * Body composition, maturity and diet assessment for Indian youth athletes.
 *
 * Sources (all values below are copied from these, nothing is invented):
 *  - WHO Growth Reference 5–19 y (2007), BMI-for-age L/M/S tables (bmi-{boys,girls}-z-who-2007-exp.xlsx,
 *    cdn.who.int). Cut-offs: < −3 SD severe thinness, < −2 SD thinness, > +1 SD overweight, > +2 SD obesity.
 *  - WHO Expert Consultation (2004) Lancet 363:157–163: Asian adult public-health cut-offs 23 and 27.5 kg/m².
 *  - ICMR-NIN 2020, Nutrient Requirements for Indians — Brief Note, Table 2a (protein RDA g/kg/d) and the footnote
 *    "cereal-based diet with low quality protein → 1 g/kg/d"; text: adult BMR 10 % below FAO/WHO/UNU.
 *  - Thomas, Erdman & Burke (2016) ACSM/AND/DC joint position, Med Sci Sports Exerc 48:543–568: athletes 1.2–2.0 g/kg/d.
 *  - FAO/WHO/UNU (2004) Human energy requirements: Schofield BMR equations and PAL bands.
 *  - Mirwald et al. (2002) Med Sci Sports Exerc 34:689–694; Moore et al. (2015) Med Sci Sports Exerc 47:1755–1764
 *    (equations as quoted in Kozieł & Malina 2018, Sports Med, PMC5752743).
 *  - WHO healthy-diet fact sheet: ≥ 400 g fruit & vegetables a day (≈ 5 portions of 80 g).
 */
import type { AthleteProfile, EstimateRange } from './types.js';

export type BmiCategory = 'severe thinness' | 'thinness' | 'normal' | 'overweight' | 'obese';
export interface BmiResult { bmi: number; category: BmiCategory; zScore?: number; reference: string }

// WHO 2007 BMI-for-age, whole years 10..19 (month 120..228): [L, M, S].
const WHO_BMI: Record<'male' | 'female', Array<[number, number, number]>> = {
  male: [
    [-1.7407, 16.4433, 0.10566], [-1.7862, 16.9392, 0.1107], [-1.7751, 17.5334, 0.11522], [-1.7168, 18.233, 0.11898],
    [-1.6211, 19.005, 0.12191], [-1.4961, 19.7744, 0.12412], [-1.3529, 20.4951, 0.12579], [-1.1962, 21.1423, 0.12715],
    [-1.026, 21.7077, 0.12836], [-0.8419, 22.1883, 0.12948],
  ],
  female: [
    [-1.4864, 16.6133, 0.12307], [-1.4606, 17.2459, 0.12748], [-1.4006, 17.9966, 0.13129], [-1.3195, 18.8012, 0.13445],
    [-1.2266, 19.5647, 0.137], [-1.1311, 20.2125, 0.13904], [-1.0368, 20.7008, 0.1407], [-0.9423, 21.0367, 0.14208],
    [-0.8462, 21.2603, 0.1433], [-0.7496, 21.4269, 0.14441],
  ],
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Linear interpolation of yearly [L,M,S] rows starting at `firstAge`. Shared with the jump norms. */
export function lmsAt(rows: Array<[number, number, number]>, firstAge: number, age: number): [number, number, number] {
  const x = clamp(age - firstAge, 0, rows.length - 1);
  const i = Math.min(Math.floor(x), rows.length - 2), f = x - i;
  const a = rows[i]!, b = rows[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Cole LMS z-score. */
export const lmsZ = ([L, M, S]: [number, number, number], x: number) =>
  Math.abs(L) < 1e-6 ? Math.log(x / M) / S : ((x / M) ** L - 1) / (L * S);

export function bmiAssessment(p: Pick<AthleteProfile, 'ageYears' | 'sex' | 'heightCm' | 'weightKg'>): BmiResult {
  const bmi = r1(p.weightKg / (p.heightCm / 100) ** 2);
  if (p.ageYears < 19) {
    const z = lmsZ(lmsAt(WHO_BMI[p.sex], 10, p.ageYears), bmi);
    const category: BmiCategory = z < -3 ? 'severe thinness' : z < -2 ? 'thinness' : z > 2 ? 'obese' : z > 1 ? 'overweight' : 'normal';
    const note = p.ageYears < 10 ? ' (age < 10 evaluated at 10 y)' : '';
    return { bmi, category, zScore: Math.round(z * 100) / 100, reference: `WHO 2007 BMI-for-age 5–19 y${note}` };
  }
  const category: BmiCategory = bmi < 16 ? 'severe thinness' : bmi < 18.5 ? 'thinness' : bmi >= 27.5 ? 'obese' : bmi >= 23 ? 'overweight' : 'normal';
  return { bmi, category, reference: 'WHO 2004 Asian adult cut-offs (23 / 27.5 kg/m²)' };
}

export interface MaturityResult { offsetYears: number; ageAtPhv: number; method: 'Mirwald 2002' | 'Moore 2015'; seYears: number }

/** Years from peak height velocity. Null for 18+ (growth essentially complete; equations not meant for adults). */
export function maturityOffset(p: AthleteProfile): MaturityResult | null {
  const { ageYears: a, heightCm: h, weightKg: w, sittingHeightCm: sh } = p;
  if (a >= 18 || a < 8) return null;
  let mo: number, method: MaturityResult['method'], se: number;
  if (sh && sh > 0 && sh < h) {
    const ll = h - sh, wh = (w / h) * 100;
    mo = p.sex === 'male'
      ? -9.236 + 0.0002708 * ll * sh - 0.001663 * a * ll + 0.007216 * a * sh + 0.02292 * wh
      : -9.376 + 0.0001882 * ll * sh + 0.0022 * a * ll + 0.005841 * a * sh - 0.002658 * a * w + 0.07693 * wh;
    method = 'Mirwald 2002'; se = p.sex === 'male' ? 0.49 : 0.5;
  } else {
    mo = p.sex === 'male' ? -7.999994 + 0.0036124 * a * h : -7.709133 + 0.0042232 * a * h;
    method = 'Moore 2015'; se = p.sex === 'male' ? 0.542 : 0.528;
  }
  return { offsetYears: r1(mo), ageAtPhv: r1(a - mo), method, seYears: se };
}

// ICMR-NIN 2020 Table 2a protein RDA, g/kg/d.
function icmrProteinRda(age: number, sex: 'male' | 'female'): number {
  if (age >= 18) return 0.83;
  const m = sex === 'male';
  return age >= 16 ? (m ? 0.86 : 0.83) : age >= 13 ? (m ? 0.89 : 0.87) : m ? 0.91 : 0.9;
}

// Protein per portion, rounded from the Indian Food Composition Tables (IFCT 2017). Estimates, ±20 %.
interface Food { food: string; portion: string; proteinG: number; ok: (d: AthleteProfile['diet']['pattern']) => boolean }
const anyDiet = () => true;
const dairy = (d: string) => d !== 'vegan';
const eggs = (d: string) => d === 'eggetarian' || d === 'non-vegetarian';
const FOODS: Food[] = [
  { food: 'Dal / rajma / chole', portion: '1 katori cooked (~30 g dry)', proteinG: 7, ok: anyDiet },
  { food: 'Roasted chana', portion: '30 g (a handful)', proteinG: 6, ok: anyDiet },
  { food: 'Peanuts', portion: '30 g (a handful)', proteinG: 7, ok: anyDiet },
  { food: 'Soya chunks', portion: '25 g dry', proteinG: 13, ok: anyDiet },
  { food: 'Milk', portion: '1 glass (200 ml)', proteinG: 6.5, ok: dairy },
  { food: 'Egg', portion: '1 whole egg', proteinG: 6, ok: eggs },
  { food: 'Paneer', portion: '50 g', proteinG: 9, ok: dairy },
  { food: 'Chicken or fish', portion: '75 g cooked', proteinG: 18, ok: (d) => d === 'non-vegetarian' },
];
// Fitzen estimates for the servings the profile asks for.
const CEREAL_PER_MEAL_G = 6; // 2–3 rotis or a plate of rice
const PROTEIN_SERVING_G = 7;
const MILK_SERVING_G = 6.5;

export interface DietAssessment {
  bmi: BmiResult;
  /** Daily protein target (g) and the g/kg basis. */
  proteinNeedG: EstimateRange & { target: number; gPerKg: EstimateRange; basis: string };
  /** Estimated intake from the servings entered (estimate). */
  proteinIntakeG: number;
  proteinGapG: number;
  /** intake / target, capped at 1.5. */
  proteinAdequacy: number;
  energyKcal: EstimateRange & { basis: string };
  sleepTargetH: EstimateRange;
  fruitVegTargetServings: number;
  suggestions: Array<{ food: string; portion: string; portions: number; proteinG: number }>;
  notes: string[];
}

export function assessDiet(p: AthleteProfile): DietAssessment {
  const bmi = bmiAssessment(p);
  const w = p.weightKg, d = p.diet;
  const athlete = p.trainingDaysPerWeek >= 3;
  const lowQuality = d.pattern === 'vegan' || (d.pattern === 'vegetarian' && d.milkServingsPerDay < 2);
  const rda = Math.max(icmrProteinRda(p.ageYears, p.sex), lowQuality ? 1 : 0);
  const gPerKg: EstimateRange = athlete ? { low: 1.2, high: 1.6 } : { low: rda, high: Math.max(rda, 1.2) };
  const basis = athlete
    ? 'ACSM/AND/DC 2016 athletes 1.2–2.0 g/kg (lower part used for youth)'
    : `ICMR-NIN 2020 RDA ${rda} g/kg${lowQuality ? ' (1.0 for cereal-based diets)' : ''}`;
  const target = Math.round(w * (athlete ? 1.4 : rda));
  const intake = Math.round(d.mealsPerDay * CEREAL_PER_MEAL_G + d.proteinServingsPerDay * PROTEIN_SERVING_G + d.milkServingsPerDay * MILK_SERVING_G);
  const gap = Math.max(0, target - intake);

  // Cheapest-first foods the athlete can eat, one portion at a time until the gap closes.
  const menu = FOODS.filter((f) => f.ok(d.pattern)).slice(0, 5);
  const picks = new Map<Food, number>();
  for (let left = gap, i = 0; left > 0 && i < 8; i++) {
    const f = menu[i % menu.length]!;
    picks.set(f, (picks.get(f) ?? 0) + 1);
    left -= f.proteinG;
  }
  const suggestions = [...picks].map(([f, n]) => ({ food: f.food, portion: f.portion, portions: n, proteinG: r1(n * f.proteinG) }));

  // Energy: Schofield BMR (FAO/WHO/UNU 2004); adults −10 % per ICMR-NIN 2020; PAL band by training days.
  const young = p.ageYears < 18;
  const bmr = p.sex === 'male' ? (young ? 17.686 * w + 658.2 : 15.057 * w + 692.2) : young ? 13.384 * w + 692.6 : 14.818 * w + 486.6;
  const bmrAdj = young ? bmr : bmr * 0.9;
  const pal: EstimateRange = p.trainingDaysPerWeek >= 5 ? { low: 2.0, high: 2.4 } : p.trainingDaysPerWeek >= 2 ? { low: 1.7, high: 1.99 } : { low: 1.4, high: 1.69 };
  const energyKcal = { low: Math.round((bmrAdj * pal.low) / 10) * 10, high: Math.round((bmrAdj * pal.high) / 10) * 10, basis: `Schofield BMR ${Math.round(bmrAdj)} kcal × PAL ${pal.low}–${pal.high} (FAO/WHO/UNU 2004${young ? '' : ', ICMR-NIN 2020 −10 %'})` };

  const sleepTargetH: EstimateRange = p.ageYears < 18 ? { low: 8, high: 10 } : { low: 7, high: 9 };
  const notes: string[] = [];
  if (bmi.category === 'thinness' || bmi.category === 'severe thinness') notes.push('BMI is below the healthy range for your age — eat an extra meal or snack daily and see a doctor if weight keeps falling.');
  if (bmi.category === 'overweight' || bmi.category === 'obese') notes.push('BMI is above the healthy range for your age — cut sugary drinks and fried snacks before cutting protein.');
  if (d.fruitVegServingsPerDay < 5) notes.push(`WHO advises ≥ 400 g fruit & vegetables a day (≈ 5 servings); you have ${d.fruitVegServingsPerDay}.`);
  if (lowQuality) notes.push('Mix cereal with dal at every meal (ICMR-NIN: cereal : legume : milk ≈ 3 : 1 : 2.5) to raise protein quality.');
  if (p.sleepHours < sleepTargetH.low) notes.push(`Sleep ${p.sleepHours} h is below the ${sleepTargetH.low}–${sleepTargetH.high} h advised for your age (AASM).`);
  notes.push('Intake is estimated from servings (IFCT 2017 averages) — a ± 20 % estimate, not a lab measure.');

  return {
    bmi,
    proteinNeedG: { low: Math.round(w * gPerKg.low), high: Math.round(w * gPerKg.high), target, gPerKg, basis },
    proteinIntakeG: intake,
    proteinGapG: gap,
    proteinAdequacy: Math.round(Math.min(1.5, intake / target) * 100) / 100,
    energyKcal,
    sleepTargetH,
    fruitVegTargetServings: 5,
    suggestions,
    notes,
  };
}
