/**
 * Real photos of people doing each exercise, vendored under /exercises/<id>-<n>.jpg (n = 0 start, 1 end).
 * Most come from free-exercise-db (released into the public domain via the Unlicense); the rest from Wikimedia
 * Commons, credited below as their licences require. Exercises without one fall back to the drawn demonstrator.
 */
const TWO = 'a-skip arm-circles back-squat bench-dip bench-press bent-over-row bodyweight-squat box-jump bulgarian-split-squat chin-up conventional-deadlift countermovement-jump crunch diamond-push-up dumbbell-curl dumbbell-shoulder-press forward-lunge front-raise front-squat glute-bridge goblet-squat good-morning hammer-curl hip-hinge-drill hip-thrust incline-bench-press jump-squat kettlebell-swing lateral-bound lateral-raise lying-leg-raise mountain-climber overhead-press overhead-triceps-extension parallel-bar-dip pistol-squat power-clean pull-up push-up romanian-deadlift sai-broad-jump sai-medicine-ball-throw sai-partial-curl-up sai-push-up sai-sit-up sai-vertical-jump snatch split-jerk squat-jump standing-broad-jump standing-calf-raise sumo-squat upright-row'.split(' ');
const ONE = 'bridge-pose deep-squat-hold knee-to-wall overhead-reach-test plank side-plank split-jerk-catch-hold sprint-start-set standing-toe-touch'.split(' ');
/** Wikimedia Commons photos (one frame each): author, licence, file name. */
const COMMONS: Record<string, [string, string, string]> = {
  'tree-pose': ['Kennguru', 'CC BY 3.0', 'Vriksasana_Yoga-Asana_Nina-Mel.jpg'],
  'chair-pose': ['Kennguru', 'CC BY 3.0', 'Utkatasana_Yoga-Asana_Nina-Mel.jpg'],
  'cobra-pose': ['Kennguru', 'CC BY 3.0', 'Bhujangasana_Yoga-Asana_Nina-Mel.jpg'],
  'triangle-pose': ['Kennguru', 'CC BY 3.0', 'Trikonasana_Yoga-Asana_Nina-Mel.jpg'],
  'boat-pose': ['Kennguru', 'CC BY 3.0', 'Paripurna-Navasana_Yoga-Asana_Nina-Mel.jpg'],
  'mountain-pose': ['Kennguru', 'CC BY 3.0', 'Tadasana_Yoga-Asana_Nina-Mel.jpg'],
  'warrior-ii': ['lululemon athletica (Flickr)', 'CC BY 2.0', 'Virabhadrasana_II_-_Warrior_II_Pose.jpg'],
  'downward-dog': ['Iveto', 'CC BY 3.0', 'Downward-Facing-Dog.JPG'],
  'warrior-i': ['Lilian White', 'CC BY 4.0', 'Rocket-yoga-01-4000px.jpg'],
  'boxing-straight-punch': ['Angria1', 'CC BY-SA 3.0', 'Frederick_Cornelius_Jab.jpg'],
  'burpee': ['Marine Corps photo by Sgt. Ryan Young', 'Public domain', 'Airborne_Burpee.jpg'],
  'l-sit': ['Tommy Gilligan/West Point Public Affairs', 'Public domain', 'West_Point_male_gymnast_L-sit.jpg'],
  'sai-flamingo-balance': ['U.S. Marine Corps', 'Public domain', 'USMC-09294.jpg'],
  'sai-sit-and-reach': ['Thamizhpparithi Maari', 'CC BY-SA 3.0', 'An_art_of_Paschimottanasana_1.JPG'],
  'fast-bowling-delivery': ['Acabashi', 'CC BY-SA 4.0', 'Cambridge_University_CC_v_MCC_at_Cambridge,_England_069.jpg'],
};

/** Portrait studio shots on white: shown whole rather than cropped to fill. */
const TALL = ['tree-pose', 'chair-pose', 'mountain-pose', 'triangle-pose', 'warrior-ii'];

export interface Photo { frames: string[]; credit: string; href: string; tall: boolean }

export function photoOf(id: string): Photo | null {
  const n = TWO.includes(id) ? 2 : ONE.includes(id) || COMMONS[id] ? 1 : 0;
  if (!n) return null;
  const frames = Array.from({ length: n }, (_, i) => `/exercises/${id}-${i}.jpg`);
  const c = COMMONS[id], tall = TALL.includes(id);
  return c
    ? { frames, credit: `Photo: ${c[0]}, ${c[1]}, via Wikimedia Commons`, href: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(c[2])}`, tall }
    : { frames, credit: 'Photos: free-exercise-db (public domain)', href: 'https://github.com/yuhonas/free-exercise-db', tall };
}
