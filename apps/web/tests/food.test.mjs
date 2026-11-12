import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/x/food/nutrition.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

// id2label of onnx-community/swin-finetuned-food101-ONNX
const FOOD101 = 'apple_pie baby_back_ribs baklava beef_carpaccio beef_tartare beet_salad beignets bibimbap bread_pudding breakfast_burrito bruschetta caesar_salad cannoli caprese_salad carrot_cake ceviche cheesecake cheese_plate chicken_curry chicken_quesadilla chicken_wings chocolate_cake chocolate_mousse churros clam_chowder club_sandwich crab_cakes creme_brulee croque_madame cup_cakes deviled_eggs donuts dumplings edamame eggs_benedict escargots falafel filet_mignon fish_and_chips foie_gras french_fries french_onion_soup french_toast fried_calamari fried_rice frozen_yogurt garlic_bread gnocchi greek_salad grilled_cheese_sandwich grilled_salmon guacamole gyoza hamburger hot_and_sour_soup hot_dog huevos_rancheros hummus ice_cream lasagna lobster_bisque lobster_roll_sandwich macaroni_and_cheese macarons miso_soup mussels nachos omelette onion_rings oysters pad_thai paella pancakes panna_cotta peking_duck pho pizza pork_chop poutine prime_rib pulled_pork_sandwich ramen ravioli red_velvet_cake risotto samosa sashimi scallops seaweed_salad shrimp_and_grits spaghetti_bolognese spaghetti_carbonara spring_rolls steak strawberry_shortcake sushi tacos takoyaki tiramisu tuna_tartare waffles'.split(' ');

test('table covers every Food-101 label and has sane, unique entries', () => {
  assert.equal(FOOD101.length, 101);
  for (const id of FOOD101) assert.ok(api.foodById(id), id);
  assert.equal(new Set(api.FOODS.map((f) => f.id)).size, api.FOODS.length);
  assert.ok(api.FOODS.length >= 101 + 60);
  for (const f of api.FOODS) {
    assert.ok(f.grams > 0 && f.kcal >= 0 && f.serving, f.id);
    const atwater = f.protein * 4 + f.carbs * 4 + f.fat * 9;
    assert.ok(Math.abs(atwater - f.kcal) <= Math.max(40, f.kcal * 0.25), `${f.id}: ${f.kcal} vs ${atwater}`);
  }
});

test('searchFoods matches names and aliases, exact first', () => {
  assert.equal(api.searchFoods('roti')[0].id, 'roti');
  assert.equal(api.searchFoods('Chapati')[0].id, 'roti');
  assert.equal(api.searchFoods('dahi')[0].id, 'curd');
  assert.equal(api.searchFoods('dal')[0].id, 'dal');
  assert.ok(api.searchFoods('paneer').length > 3);
  assert.equal(api.searchFoods('french fries')[0].id, 'french_fries');
  assert.deepEqual(api.searchFoods('   '), []);
  assert.deepEqual(api.searchFoods('xyzzy'), []);
});

test('parseMeal reads quantities, grams and the longest name', () => {
  const ids = (t) => api.parseMeal(t).items.map((i) => [i.food.id, i.servings]);
  assert.deepEqual(ids('2 roti and dal'), [['roti', 2], ['dal', 1]]);
  assert.deepEqual(ids('I had 3 idlis with sambar, a cup of chai'), [['idli', 3], ['sambar', 1], ['chai', 1]]);
  assert.deepEqual(ids('half plate chicken biryani + 1 bowl dal makhani'), [['chicken_biryani', 0.5], ['dal_makhani', 1]]);
  assert.deepEqual(ids('316g rice'), [['rice', 2]]);
  assert.deepEqual(ids('two eggs'), [['boiled_egg', 2]]);
  const r = api.parseMeal('1 roti and a unicorn steak pie thing, moonrock');
  assert.deepEqual(r.items.map((i) => i.food.id), ['roti', 'steak']);
  assert.deepEqual(r.unmatched, ['moonrock']);
  assert.deepEqual(api.parseMeal('').items, []);
});

test('portion maths scales and sums', () => {
  const roti = api.foodById('roti'), dal = api.foodById('dal');
  assert.deepEqual(api.scaleFood(roti, 2), { calories: 240, protein: 7, carbs: 36, fat: 7.4 });
  assert.deepEqual(api.scaleFood(dal, 0.25), { calories: 50, protein: 2.5, carbs: 6.5, fat: 1.5 });
  assert.equal(api.servingsFromGrams(dal, 300), 1.5);
  assert.deepEqual(api.totalPortions([{ food: roti, servings: 2 }, { food: dal, servings: 1 }]), { calories: 440, protein: 17, carbs: 62, fat: 13.4 });
});

test('parseMeal: Hindi names, combos, fractions, units and piece counts', () => {
  const ids = (t) => api.parseMeal(t).items.map((i) => [i.food.id, Math.round(i.servings * 100) / 100]);
  assert.deepEqual(ids('rajma chawal'), [['rajma', 1], ['rice', 1]]);
  assert.deepEqual(ids('i had idli sambar'), [['idli', 1], ['sambar', 1]]);
  assert.deepEqual(ids('chole bhature'), [['chole_bhature', 1]]);
  assert.deepEqual(ids('for breakfast I had 3 idlis and chutney'), [['idli', 3], ['coconut_chutney', 1]]);
  assert.deepEqual(ids('1 and a half roti'), [['roti', 1.5]]);
  assert.deepEqual(ids('1½ roti'), [['roti', 1.5]]);
  assert.deepEqual(ids('half a roti'), [['roti', 0.5]]);
  assert.deepEqual(ids('roti 2, dal 1 bowl'), [['roti', 2], ['dal', 1]]);
  assert.deepEqual(ids('1 scoop whey with 250 ml milk'), [['whey_protein', 1], ['milk', 1.02]]);
  assert.deepEqual(ids('egg fried rice'), [['fried_rice', 1]]);
  assert.deepEqual(ids('mutton biryani'), [['mutton_biryani', 1]]);
  assert.deepEqual(ids('4 egg whites'), [['egg_white', 4]]);
  assert.deepEqual(ids('3 egg omelette'), [['omelette', 1.5]]);
  assert.deepEqual(ids('3 pc chicken tikka'), [['chicken_tikka', 0.5]]);
  assert.deepEqual(ids('1 plate pani puri'), [['pani_puri', 1]]);
  assert.deepEqual(ids('2 nos idly'), [['idli', 2]]);
  assert.deepEqual(ids('2 phulkas and sabji'), [['roti', 2], ['mixed_veg', 1]]);
  assert.deepEqual(ids('grilled chicken with sweet potato'), [['chicken_breast', 1], ['sweet_potato', 1]]);
  assert.deepEqual(ids('a handful of almonds'), [['almonds', 1]]);
});

test('Indian portions sit in realistic ranges and every entry is Atwater-consistent within 12.5%', () => {
  const f = api.foodById;
  assert.ok(f('roti').grams >= 30 && f('roti').grams <= 40 && f('roti').kcal >= 100 && f('roti').kcal <= 120);
  assert.ok(f('idli').kcal >= 50 && f('idli').kcal <= 70);
  assert.ok(f('dal').kcal >= 150 && f('dal').kcal <= 200);
  assert.ok(f('oats').kcal < 200, 'a bowl of oats is not 250 kcal before milk');
  for (const x of api.FOODS) if (x.kcal > 20) {
    const atwater = x.protein * 4 + x.carbs * 4 + x.fat * 9;
    // fruit carbs include fibre, so USDA's own fruit values run ~11-12% under plain 4/4/9
    assert.ok(Math.abs(atwater - x.kcal) <= x.kcal * 0.125, `${x.id}: ${x.kcal} vs ${atwater}`);
  }
});
