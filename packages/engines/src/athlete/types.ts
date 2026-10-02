/** Athlete profile entered on the Profile screen. Everything downstream (diet, norms, projection) reads from this. */
export type DietPattern = 'vegetarian' | 'eggetarian' | 'non-vegetarian' | 'vegan';

export interface AthleteProfile {
  name: string;
  ageYears: number;
  sex: 'male' | 'female';
  heightCm: number;
  weightKg: number;
  /** Seated height (cm); enables the Mirwald 2002 maturity equation. */
  sittingHeightCm?: number;
  city?: string;
  state?: string;
  diet: {
    pattern: DietPattern;
    mealsPerDay: number;
    /** Servings of dal / pulses / egg / paneer / meat per day. */
    proteinServingsPerDay: number;
    /** Glasses (~200 ml) of milk or bowls of curd per day. */
    milkServingsPerDay: number;
    fruitVegServingsPerDay: number;
  };
  sleepHours: number;
  trainingDaysPerWeek: number;
  sport?: string;
  hasCoach: boolean;
}

/** An estimate with an honest range. */
export interface EstimateRange { low: number; high: number }
