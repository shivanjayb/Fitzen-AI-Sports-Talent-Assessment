export interface Food { id: string; name: string; grams: number; serving: string; kcal: number; protein: number; carbs: number; fat: number; aliases: string[] }
type Row = [id: string, grams: number, serving: string, kcal: number, protein: number, carbs: number, fat: number, aliases?: string];

const row = ([id, grams, serving, kcal, protein, carbs, fat, aliases = '']: Row): Food => ({
  id, name: id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), grams, serving, kcal, protein, carbs, fat,
  aliases: aliases ? aliases.split(',').map((a) => a.trim()) : [],
});

// Food-101 classes (ids match the model labels): USDA FoodData Central SR Legacy / FNDDS values scaled to a typical restaurant serving.
const FOOD101: Row[] = [
  ['apple_pie', 125, '1 slice (1/8 pie)', 296, 2.4, 43, 14],
  ['baby_back_ribs', 200, 'half rack, meat only', 580, 44, 10, 40, 'ribs, pork ribs'],
  ['baklava', 60, '1 piece', 257, 4, 23, 17],
  ['beef_carpaccio', 100, '1 plate', 200, 21, 2, 12],
  ['beef_tartare', 150, '1 portion', 300, 30, 3, 19],
  ['beet_salad', 200, '1 bowl', 180, 5, 20, 9, 'beetroot salad'],
  ['beignets', 80, '3 pieces', 300, 5, 35, 15],
  ['bibimbap', 500, '1 bowl', 600, 25, 85, 17],
  ['bread_pudding', 150, '1 cup', 300, 8, 45, 10],
  ['breakfast_burrito', 250, '1 burrito', 550, 23, 50, 28, 'burrito'],
  ['bruschetta', 100, '2 pieces', 200, 5, 26, 9],
  ['caesar_salad', 200, '1 bowl', 360, 9, 14, 30],
  ['cannoli', 80, '1 cannoli', 300, 6, 30, 17],
  ['caprese_salad', 200, '1 plate', 340, 18, 6, 27],
  ['carrot_cake', 110, '1 slice', 420, 4, 50, 23],
  ['ceviche', 200, '1 cup', 200, 28, 12, 4],
  ['cheesecake', 125, '1 slice', 400, 7, 32, 28],
  ['cheese_plate', 100, '1 small plate with crackers', 380, 20, 12, 28, 'cheese'],
  ['chicken_curry', 250, '1 bowl', 330, 27, 10, 20, 'murgh curry, chicken gravy'],
  ['chicken_quesadilla', 180, '1 quesadilla', 530, 30, 40, 28, 'quesadilla'],
  ['chicken_wings', 150, '6 wings', 430, 38, 2, 30, 'wings'],
  ['chocolate_cake', 110, '1 slice', 400, 5, 55, 19, 'cake'],
  ['chocolate_mousse', 120, '1 cup', 330, 5, 28, 23, 'mousse'],
  ['churros', 80, '3 churros', 340, 4, 38, 19, 'churro'],
  ['clam_chowder', 250, '1 bowl', 230, 10, 22, 11, 'chowder'],
  ['club_sandwich', 250, '1 sandwich', 590, 35, 45, 30, 'sandwich'],
  ['crab_cakes', 120, '2 small cakes', 270, 20, 12, 16, 'crab cake'],
  ['creme_brulee', 120, '1 ramekin', 350, 5, 30, 24],
  ['croque_madame', 250, '1 sandwich', 630, 35, 38, 37],
  ['cup_cakes', 70, '1 cupcake', 260, 2, 38, 11, 'cupcake'],
  ['deviled_eggs', 60, '2 halves', 125, 6, 1, 11],
  ['donuts', 60, '1 glazed donut', 240, 3, 30, 12, 'donut, doughnut'],
  ['dumplings', 150, '6 pieces', 300, 12, 35, 12, 'momo, momos, dimsum'],
  ['edamame', 155, '1 cup, shelled', 189, 18.5, 13.8, 8.1],
  ['eggs_benedict', 250, '2 halves', 650, 26, 30, 47],
  ['escargots', 100, '6 snails with butter', 250, 14, 3, 20],
  ['falafel', 100, '5 pieces', 333, 13, 32, 18],
  ['filet_mignon', 200, '1 steak', 450, 56, 0, 25],
  ['fish_and_chips', 350, '1 plate', 840, 35, 80, 42],
  ['foie_gras', 50, '1 slice', 230, 6, 2, 22],
  ['french_fries', 117, '1 medium portion', 365, 4, 48, 17, 'fries, chips, finger chips'],
  ['french_onion_soup', 300, '1 bowl', 370, 15, 30, 20, 'onion soup'],
  ['french_toast', 130, '2 slices', 300, 10, 36, 13, 'bread toast'],
  ['fried_calamari', 150, '1 plate', 330, 23, 18, 18, 'calamari'],
  ['fried_rice', 250, '1 plate', 410, 11, 58, 15],
  ['frozen_yogurt', 150, '1 cup', 240, 6, 40, 6, 'froyo'],
  ['garlic_bread', 60, '2 slices', 210, 5, 26, 10],
  ['gnocchi', 250, '1 plate with sauce', 400, 9, 70, 9],
  ['greek_salad', 250, '1 bowl', 280, 8, 12, 23, 'salad'],
  ['grilled_cheese_sandwich', 120, '1 sandwich', 370, 14, 30, 22, 'cheese sandwich'],
  ['grilled_salmon', 150, '1 fillet', 309, 34, 0, 18, 'salmon'],
  ['guacamole', 60, '1/4 cup', 95, 1, 5, 9],
  ['gyoza', 120, '6 pieces', 250, 10, 28, 11],
  ['hamburger', 220, '1 burger', 540, 30, 40, 28, 'burger'],
  ['hot_and_sour_soup', 250, '1 bowl', 100, 7, 10, 4],
  ['hot_dog', 100, '1 in a bun', 290, 11, 24, 17],
  ['huevos_rancheros', 300, '1 plate', 450, 20, 40, 24],
  ['hummus', 60, '1/4 cup', 100, 4.7, 8.6, 5.8],
  ['ice_cream', 132, '1 cup', 275, 5, 31, 15, 'icecream'],
  ['lasagna', 300, '1 piece', 450, 26, 40, 20],
  ['lobster_bisque', 250, '1 bowl', 300, 10, 15, 22],
  ['lobster_roll_sandwich', 200, '1 roll', 440, 25, 35, 22, 'lobster roll'],
  ['macaroni_and_cheese', 200, '1 cup', 330, 13, 40, 13, 'mac and cheese, macaroni, pasta'],
  ['macarons', 45, '3 macarons', 190, 3, 27, 8],
  ['miso_soup', 240, '1 bowl', 60, 4, 7, 2],
  ['mussels', 150, '1 bowl, meat', 258, 36, 11, 7],
  ['nachos', 200, '1 plate', 600, 16, 56, 35],
  ['omelette', 150, '2 eggs with filling', 250, 16, 2, 19, 'omelet, egg omelette'],
  ['onion_rings', 120, '8 rings', 400, 5, 45, 22],
  ['oysters', 85, '6 medium, raw', 50, 5, 3, 1.5],
  ['pad_thai', 300, '1 plate', 600, 22, 75, 22, 'noodles'],
  ['paella', 300, '1 plate', 480, 28, 55, 15],
  ['pancakes', 150, '3 pancakes, no syrup', 340, 9, 50, 11, 'pancake'],
  ['panna_cotta', 120, '1 cup', 320, 4, 25, 23],
  ['peking_duck', 150, '1 portion with pancakes', 450, 25, 25, 28, 'duck'],
  ['pho', 500, '1 bowl', 450, 30, 55, 10],
  ['pizza', 107, '1 slice (large)', 285, 12, 36, 10],
  ['pork_chop', 150, '1 chop', 330, 40, 0, 18, 'pork'],
  ['poutine', 300, '1 plate', 740, 20, 70, 42],
  ['prime_rib', 200, '1 slice', 680, 44, 0, 55],
  ['pulled_pork_sandwich', 230, '1 sandwich', 520, 30, 50, 20],
  ['ramen', 500, '1 bowl', 550, 22, 65, 22],
  ['ravioli', 250, '1 plate with sauce', 420, 18, 55, 14],
  ['red_velvet_cake', 110, '1 slice', 420, 4, 55, 21],
  ['risotto', 250, '1 plate', 400, 10, 55, 15],
  ['samosa', 100, '1 large', 260, 5, 30, 14, 'samosas'],
  ['sashimi', 100, '6 slices', 140, 23, 0, 5],
  ['scallops', 120, '5 large, seared', 170, 24, 6, 5],
  ['seaweed_salad', 100, '1 side', 70, 1, 11, 2],
  ['shrimp_and_grits', 300, '1 bowl', 500, 28, 40, 25, 'prawns, shrimp'],
  ['spaghetti_bolognese', 350, '1 plate', 550, 27, 70, 17, 'spaghetti, bolognese'],
  ['spaghetti_carbonara', 300, '1 plate', 650, 26, 70, 28, 'carbonara'],
  ['spring_rolls', 120, '2 fried rolls', 300, 6, 30, 17, 'spring roll'],
  ['steak', 200, '1 sirloin', 500, 54, 0, 31],
  ['strawberry_shortcake', 150, '1 piece', 340, 4, 45, 16],
  ['sushi', 200, '8 pieces', 300, 11, 55, 5],
  ['tacos', 170, '2 tacos', 400, 20, 32, 21, 'taco'],
  ['takoyaki', 120, '6 balls', 250, 9, 28, 11],
  ['tiramisu', 120, '1 piece', 400, 7, 38, 24],
  ['tuna_tartare', 150, '1 portion', 250, 30, 5, 12, 'tuna'],
  ['waffles', 75, '1 round waffle', 218, 6, 25, 11, 'waffle'],
];

// Indian staples: ICMR-NIN Indian Food Composition Tables 2017 for ingredients, home-style recipes per katori (~150-200 g) or piece; USDA FDC where noted by the plain item.
const INDIAN: Row[] = [
  ['roti', 40, '1 roti', 120, 3.5, 18, 3.7, 'chapati, chapathi, phulka, fulka'],
  ['paratha', 80, '1 plain paratha', 260, 5, 36, 10, 'parantha, parotta'],
  ['aloo_paratha', 130, '1 paratha', 300, 6, 42, 12],
  ['naan', 90, '1 naan', 262, 8.7, 45, 5, 'butter naan'],
  ['puri', 25, '1 puri', 100, 2, 12, 5, 'poori'],
  ['bhatura', 70, '1 bhatura', 230, 5, 32, 9, 'bhature'],
  ['thepla', 50, '1 thepla', 150, 4, 20, 6],
  ['rice', 158, '1 cup cooked', 205, 4.3, 45, 0.4, 'chawal, white rice, steamed rice'],
  ['brown_rice', 195, '1 cup cooked', 218, 4.5, 46, 1.6],
  ['jeera_rice', 160, '1 cup', 240, 4, 42, 6],
  ['dal', 200, '1 katori', 200, 10, 26, 6, 'daal, dhal, toor dal, arhar dal, dal tadka, dal fry'],
  ['dal_makhani', 200, '1 katori', 330, 12, 30, 18],
  ['moong_dal', 200, '1 katori', 180, 11, 25, 4],
  ['chana_dal', 200, '1 katori', 230, 12, 32, 6],
  ['sambar', 200, '1 katori', 140, 6, 20, 4, 'sambhar'],
  ['rasam', 200, '1 katori', 60, 2, 8, 2],
  ['kadhi', 200, '1 katori', 180, 6, 14, 11, 'kadi'],
  ['rajma', 200, '1 katori', 250, 12, 34, 7, 'rajma masala, kidney beans'],
  ['chole', 200, '1 katori', 280, 12, 36, 10, 'chana masala, chhole, chickpea curry'],
  ['paneer', 50, '50 g cubes', 133, 9, 2, 10, 'cottage cheese'],
  ['paneer_butter_masala', 200, '1 katori', 420, 15, 14, 34, 'paneer makhani, shahi paneer'],
  ['palak_paneer', 200, '1 katori', 300, 14, 12, 22],
  ['matar_paneer', 200, '1 katori', 270, 13, 14, 18, 'mutter paneer'],
  ['paneer_tikka', 150, '6 pieces', 330, 20, 8, 24],
  ['paneer_bhurji', 150, '1 katori', 330, 18, 8, 25],
  ['butter_chicken', 200, '1 katori', 430, 30, 12, 29, 'murgh makhani'],
  ['chicken_tikka', 150, '6 pieces', 230, 34, 4, 8],
  ['tandoori_chicken', 200, '2 pieces (leg and thigh)', 300, 40, 4, 13],
  ['chicken_breast', 150, '1 grilled breast', 248, 46, 0, 5.4, 'grilled chicken, boiled chicken'],
  ['chicken_biryani', 300, '1 plate', 500, 26, 60, 17, 'biryani, biriyani'],
  ['veg_biryani', 300, '1 plate', 420, 9, 64, 14, 'veg pulao, pulao, pulav'],
  ['mutton_curry', 200, '1 katori', 380, 28, 8, 26, 'mutton, goat curry, rogan josh'],
  ['fish_curry', 200, '1 katori', 260, 24, 8, 14, 'fish'],
  ['fish_fry', 120, '2 pieces', 260, 22, 8, 15],
  ['egg_curry', 200, '2 eggs in gravy', 290, 15, 10, 21, 'anda curry'],
  ['boiled_egg', 50, '1 large egg', 78, 6.3, 0.6, 5.3, 'egg, eggs, anda'],
  ['egg_bhurji', 120, '2 eggs', 220, 13, 4, 17, 'scrambled eggs, anda bhurji'],
  ['idli', 40, '1 idli', 58, 2, 12, 0.3, 'idly'],
  ['dosa', 100, '1 plain dosa', 170, 4, 29, 4, 'dosai, plain dosa'],
  ['masala_dosa', 200, '1 dosa', 350, 7, 48, 14],
  ['uttapam', 150, '1 uttapam', 250, 6, 40, 7, 'uthappam'],
  ['medu_vada', 50, '1 vada', 140, 5, 14, 7, 'vada, wada'],
  ['upma', 200, '1 bowl', 250, 6, 36, 9, 'uppuma'],
  ['poha', 200, '1 plate', 260, 5, 44, 7, 'pohe, aval'],
  ['khichdi', 250, '1 bowl', 290, 11, 46, 7, 'khichri'],
  ['pongal', 200, '1 bowl', 300, 8, 40, 12],
  ['sabudana_khichdi', 200, '1 plate', 380, 4, 60, 14, 'sabudana'],
  ['oats', 250, '1 bowl with milk', 250, 10, 38, 7, 'oatmeal, porridge, daliya, dalia'],
  ['aloo_sabzi', 150, '1 katori', 170, 3, 22, 8, 'aloo, potato sabzi, potato curry'],
  ['aloo_gobi', 150, '1 katori', 160, 4, 18, 8, 'gobi'],
  ['bhindi_masala', 150, '1 katori', 150, 3, 12, 10, 'bhindi, okra'],
  ['baingan_bharta', 150, '1 katori', 140, 3, 12, 9, 'baingan, brinjal'],
  ['mixed_veg', 150, '1 katori', 150, 4, 14, 9, 'sabzi, sabji, vegetable curry, veg curry'],
  ['soya_chunks_curry', 200, '1 katori', 220, 18, 16, 9, 'soya, soya chunks, nutrela'],
  ['sprouts', 150, '1 bowl', 130, 9, 20, 1, 'sprouts salad, moong sprouts'],
  ['curd', 150, '1 katori', 92, 5, 7, 5, 'dahi, yogurt, yoghurt'],
  ['raita', 150, '1 katori', 100, 5, 8, 5],
  ['lassi', 250, '1 glass, sweet', 220, 8, 35, 6],
  ['buttermilk', 250, '1 glass', 60, 3, 5, 3, 'chaas, chhachh, mattha'],
  ['milk', 244, '1 glass', 149, 7.7, 11.7, 7.9, 'doodh'],
  ['chai', 150, '1 cup with milk and sugar', 80, 2.5, 12, 2.5, 'tea, masala chai'],
  ['filter_coffee', 150, '1 cup with milk and sugar', 90, 3, 11, 3, 'coffee'],
  ['pakora', 100, '6 pieces', 280, 6, 26, 17, 'pakoda, bhajji, bhaji'],
  ['dhokla', 100, '4 pieces', 160, 6, 25, 4],
  ['kachori', 60, '1 kachori', 220, 4, 22, 13],
  ['aloo_tikki', 70, '1 tikki', 150, 3, 20, 7, 'tikki'],
  ['pav_bhaji', 300, '1 plate with 2 pav', 500, 12, 68, 20],
  ['vada_pav', 150, '1 vada pav', 300, 7, 42, 12, 'wada pav'],
  ['pani_puri', 100, '6 pieces', 180, 4, 30, 5, 'golgappa, gol gappe, puchka'],
  ['bhel_puri', 150, '1 plate', 280, 7, 44, 9, 'bhel'],
  ['maggi', 280, '1 pack, cooked', 310, 7, 44, 12, 'instant noodles'],
  ['bread', 50, '2 slices', 133, 4.5, 25, 1.7, 'toast, bread slice'],
  ['peanut_butter', 32, '2 tbsp', 190, 7, 7, 16],
  ['peanuts', 30, '1 handful', 170, 7, 5, 14, 'groundnuts, moongphali'],
  ['roasted_chana', 30, '1 handful', 110, 6, 18, 2, 'bhuna chana'],
  ['whey_protein', 30, '1 scoop', 120, 24, 3, 1.5, 'protein shake, whey'],
  ['banana', 118, '1 medium', 105, 1.3, 27, 0.4, 'kela'],
  ['apple', 182, '1 medium', 95, 0.5, 25, 0.3, 'seb'],
  ['mango', 165, '1 cup sliced', 99, 1.4, 25, 0.6, 'aam'],
  ['gulab_jamun', 40, '1 piece', 150, 2, 20, 7],
  ['rasgulla', 50, '1 piece', 110, 2, 24, 1, 'rosogolla'],
  ['jalebi', 50, '2 pieces', 200, 1, 30, 9],
  ['kheer', 150, '1 bowl', 230, 6, 35, 7, 'payasam'],
  ['halwa', 100, '1 small bowl', 330, 4, 45, 15, 'sooji halwa, sheera'],
  ['ladoo', 40, '1 ladoo', 190, 4, 22, 10, 'laddu, besan ladoo'],
];

export const FOODS: Food[] = [...FOOD101, ...INDIAN].map(row);
const byId = new Map(FOODS.map((f) => [f.id, f]));
export const foodById = (id: string) => byId.get(id);

export const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const terms = (f: Food) => [normalize(f.name), ...f.aliases.map(normalize)];

export function searchFoods(query: string, limit = 8): Food[] {
  const q = normalize(query);
  if (!q) return [];
  const rank = (f: Food) => Math.min(...terms(f).map((t) => t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 9));
  return FOODS.map((f) => [rank(f), f] as const).filter(([r]) => r < 9).sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length).slice(0, limit).map(([, f]) => f);
}

export type Portion = { calories: number; protein: number; carbs: number; fat: number };
const one = (n: number) => Math.round(n * 10) / 10;
export const scaleFood = (f: Food, servings: number): Portion =>
  ({ calories: Math.round(f.kcal * servings), protein: one(f.protein * servings), carbs: one(f.carbs * servings), fat: one(f.fat * servings) });
export const totalPortions = (items: { food: Food; servings: number }[]): Portion => {
  const parts = items.map((i) => scaleFood(i.food, i.servings));
  const sum = (k: keyof Portion) => parts.reduce((a, p) => a + p[k], 0);
  return { calories: Math.round(sum('calories')), protein: one(sum('protein')), carbs: one(sum('carbs')), fat: one(sum('fat')) };
};
export const servingsFromGrams = (f: Food, grams: number) => grams / f.grams;

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25, couple: 2, few: 3 };
const UNITS = /^(?:bowls?|plates?|cups?|katoris?|glass(?:es)?|pieces?|pcs?|slices?|servings?|portions?|handfuls?|scoops?|of)\b\s*/;
const index = FOODS.flatMap((f) => terms(f).map((t) => ({ t, f }))).sort((a, b) => b.t.length - a.t.length);

export interface ParsedItem { food: Food; servings: number; text: string }
/** Deterministic "I ate…" parser: splits on and/with/commas, reads a leading quantity or gram weight, and matches the longest table name. */
export function parseMeal(text: string): { items: ParsedItem[]; unmatched: string[] } {
  const items: ParsedItem[] = [], unmatched: string[] = [];
  const cleaned = text.toLowerCase().replace(/^\s*(?:i\s+(?:just\s+)?(?:ate|had)|ate|had|for \w+)\b[:\s]*/, '');
  for (const raw of cleaned.split(/\s*(?:,|;|\+|&|\n|\band\b|\bwith\b|\balong with\b|\bplus\b)\s*/)) {
    let chunk = raw.replace(/(\d)\s*\/\s*(\d)/g, '$1/$2').trim();
    if (!chunk) continue;
    let qty = 1, grams = 0, m: RegExpMatchArray | null;
    if ((m = chunk.match(/^(\d+(?:\.\d+)?)\s*(?:g|gm|gms|grams?)\b\s*/))) { grams = Number(m[1]); chunk = chunk.slice(m[0].length); }
    else if ((m = chunk.match(/^(\d+)\/(\d+)\s*/))) { qty = Number(m[1]) / Number(m[2]); chunk = chunk.slice(m[0].length); }
    else if ((m = chunk.match(/^(\d+(?:\.\d+)?)\s*/))) { qty = Number(m[1]); chunk = chunk.slice(m[0].length); }
    else if ((m = chunk.match(/^([a-z]+)\b\s*/)) && m[1] && Object.hasOwn(WORDS, m[1])) { qty = WORDS[m[1]] ?? 1; chunk = chunk.slice(m[0].length); if (/^a\b/.test(chunk) && qty < 1) chunk = chunk.slice(1); }
    for (let n; (n = chunk.match(UNITS)); ) chunk = chunk.slice(n[0].length);
    const name = normalize(chunk);
    const hit = index.find(({ t }) => new RegExp(`(?:^|\\s)${t}(?:e?s)?(?:\\s|$)`).test(name));
    if (!hit || !(qty > 0)) { if (name) unmatched.push(raw.trim()); continue; }
    const servings = grams > 0 ? servingsFromGrams(hit.f, grams) : qty;
    items.push({ food: hit.f, servings: Math.min(20, servings), text: raw.trim() });
  }
  return { items, unmatched };
}
