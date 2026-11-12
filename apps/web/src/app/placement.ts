import type { ExerciseDef } from '@fitzen/engines';

/** Where to put the phone for this exercise. Floor work needs a low, landscape camera; standing work an upright one. */
export function placementFor(def: ExerciseDef): { floor: boolean; orientation: 'portrait' | 'landscape'; steps: string[] } {
  const floor = def.angles.some((a) => a.kind === 'joint' && a.joint === 'bodyLine') || /plank|push-?up|bridge|crunch|sit-?up|superman|cobra|mountain|dead-bug|bird-dog/.test(def.id);
  const where = def.camera === 'side' ? 'to your side' : 'in front of you';
  return floor
    ? { floor, orientation: 'landscape', steps: [`Turn the phone sideways and lean it on the floor, 2–3 m ${where}`, 'Lens at about knee height, so head and feet both fit', def.camera === 'side' ? 'Lie or kneel side-on to the lens' : 'Face the lens'] }
    : { floor, orientation: 'portrait', steps: [`Prop the phone upright at hip height, 2–3 m ${where}`, 'Leave space above your head and below your feet', def.camera === 'side' ? 'Stand side-on to the lens' : 'Face the lens squarely'] };
}
