import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../db/schema";
import { authenticateAi, createAiToken } from "../auth/ai-tokens";
import { queryFoods } from "./ai-api";
import { mealPreviewOperation, previewMeal } from "./ai-preview";
import { emptyNutrition, scaled, itemSchema, type ItemDraft, type MealAction } from "./model";
import { decideMealOperation, prepareMealActions, readMealSnapshot, submitMealOperation } from "./records";
import { referenceCatalogDetail, referenceCatalogOverview, requireCurrentReferenceFood, searchReferenceFoods, validatePreparedReferenceFood } from "./reference-catalog";
import { foodArtCell } from "./reference-art";
import { referenceFoodName, referenceNutrition, referenceSections } from "./reference-food";
import { recipeGrams, recipePartInputs, recipeTotals, wholeRecipeParts } from "./reference-recipe";
import { applyMealChanges, savedMealDraft } from "./ai-changes";

const leg = requireCurrentReferenceFood({ id: "drumstick-stewed-skinless", version: 1 });
const [medium] = leg.portions;
const referenceFood = { id: leg.id, version: leg.version, portionId: medium.id };

function saveMeal(items: ItemDraft[], patch: Partial<Extract<MealAction, { kind: "save_meal" }>> = {}): Extract<MealAction, { kind: "save_meal" }> {
  return { kind: "save_meal", date: "2026-11-25", mealType: "晚餐", items, ...patch };
}

test("公用目录按部位和形态给出有依据的候选", () => {
  const summary = referenceCatalogOverview();
  const families = referenceSections.flatMap(section => section.families.map(family => family.id));
  const all = families.flatMap(family => {
    const result = searchReferenceFoods("", family);
    assert.equal(result.matches, summary.families?.[family]?.count);
    assert.ok(result.matches > 0);
    return result.referenceFoods;
  });
  assert.equal(referenceSections.length, 11);
  assert.equal(all.length, summary.total);
  assert.equal(new Set(all.map(food => food.id)).size, summary.total);
  assert.equal(new Set(all.map(food => food.source.dataset + food.source.recordId)).size, summary.total);
  for (const food of all) {
    assert.notDeepEqual(foodArtCell(food.illustration), foodArtCell("generic"));
    assert.ok(food.source.title && food.source.url.startsWith("https:"));
    for (const [metric, value] of Object.entries(food.nutrition)) {
      if (value === null) continue;
      assert.match(value, /^\d+(?:\.\d{1,4})?$/);
      const limit = metric === "caloriesKcal" ? 1000 : 100;
      assert.ok(Number(value) <= limit, food.id + " " + metric);
      assert.ok(Number(referenceNutrition(food, "100").nutrition[metric as keyof typeof food.nutrition]) <= limit);
    }
    assert.ok(food.recipeIngredients?.every(ingredient => ingredient.source.url.startsWith("https:") && Number(ingredient.edibleGrams) > 0) ?? true);
    for (const portion of food.portions) {
      assert.ok(Number(portion.edibleGrams) > 0);
      assert.ok(portion.source.recordId === food.source.recordId && ["份", "人份"].includes(portion.unit) ||
        portion.source.recordId.startsWith(food.source.recordId + " · "));
    }
  }
  const chicken = searchReferenceFoods("鸡腿").referenceFoods;
  assert.deepEqual(chicken.map(food => food.source.recordId), ["24143220", "24143210", "24142501", "24142500", "24147300"]);
  assert.ok(chicken.every(food => food.state === "cooked"));
  assert.deepEqual(searchReferenceFoods("鸡腿 熟").referenceFoods, chicken);
  assert.deepEqual(searchReferenceFoods("我今天吃了鸡腿").referenceFoods, chicken);
  const raw = requireCurrentReferenceFood({ id: "chicken-leg-raw-skinless", version: 1 });
  assert.equal(referenceFoodName(raw), "生鸡腿肉（去皮去骨）");
  assert.equal(raw.source.recordId, "I0404501");
  for (const query of ["生鸡腿", "生鸡小腿", "生重鸡腿", "去皮去骨生鸡腿"]) {
    assert.deepEqual(searchReferenceFoods(query).referenceFoods, [raw]);
  }
  assert.equal(searchReferenceFoods("带皮生鸡腿").matches, 0);
  assert.equal(searchReferenceFoods("带骨生鸡腿").matches, 0);
  assert.equal(referenceNutrition(raw, "100").nutrition.caloriesKcal, "165.0000");
  assert.equal(referenceNutrition(chicken[3], "1", chicken[3].portions[0].id).nutrition.caloriesKcal, "122.4000");
  assert.ok(!searchReferenceFoods("", undefined, "search").referenceFoods.includes(raw));
  assert.deepEqual(searchReferenceFoods("去皮炖鸡腿").referenceFoods, [leg]);
  assert.equal(searchReferenceFoods("香茅焖鸡腿").matches, 0);
  assert.equal(searchReferenceFoods("带骨鸡腿").matches, 0);
  assert.equal(searchReferenceFoods("清蒸罗非鱼").referenceFoods[0].id, "tilapia-steamed");
});

test("公共检索处理日常名称、真实状态和分页", () => {
  assert.equal(searchReferenceFoods("生菜").referenceFoods[0].id, "lettuce-ready");
  assert.equal(searchReferenceFoods("生抽").referenceFoods[0].id, "soy-sauce-light");
  assert.equal(searchReferenceFoods("清蒸 虾").referenceFoods[0].id, "shrimp-boiled");
  assert.equal(searchReferenceFoods("无糖茉莉花茶").referenceFoods[0].nutrition.fatG, null);
  assert.equal(searchReferenceFoods("无糖茉莉花茶").referenceFoods[0].nutrition.caloriesKcal, "0");
  for (const [query, id] of Object.entries({
    "空气炸鸡翅": "air-fryer-wings", "可乐鸡翅": "cola-wings",
    "肉眼": "beef-ribeye", Ribeye: "beef-ribeye", Striploin: "beef-striploin-grilled",
    "番茄炖牛腩": "tomato-beef-brisket", "红烧牛腩": "red-braised-brisket",
    "炒粿条": "char-kway-teow", "叻沙": "singapore-laksa",
  })) {
    assert.equal(searchReferenceFoods(query).referenceFoods[0]?.id, id, query);
  }
  for (const [query, name] of Object.entries({ "橘子": "橘子", "橙子": "鲜橙", "梨": "梨", "熟猪小里脊": "猪里脊肉" })) {
    assert.equal(searchReferenceFoods(query).referenceFoods[0]?.name, name, query);
  }
  for (const query of ["茂谷柑", "新兴梨", "海南鸡饭", "牛丼", "咖喱鸡饭"]) assert.equal(searchReferenceFoods(query).matches, 0, query);
  assert.deepEqual(searchReferenceFoods("空气炸鸡翅").referenceFoods.map(food => food.id), ["air-fryer-wings"]);
  assert.ok(searchReferenceFoods("牛排").referenceFoods.some(food => food.id === "beef-tenderloin-cooked"));
  const first = searchReferenceFoods("熟");
  assert.equal(first.referenceFoods.length, 40);
  assert.equal(first.nextOffset, 40);
  const second = searchReferenceFoods("熟", undefined, "search", first.nextOffset);
  assert.ok(second.referenceFoods.length > 0);
  assert.equal(new Set([...first.referenceFoods, ...second.referenceFoods].map(food => food.id)).size,
    first.referenceFoods.length + second.referenceFoods.length);
});

test("长小数保留真实小数位，毫升标签的零和未知独立保留", () => {
  assert.equal(scaled("0.28999999999999998", "330", "100"), "0.9570");
  assert.equal(scaled("0.28000000000000003", "100", "100"), "0.2800");
  const old = { ...leg, nutrition: { caloriesKcal: "2", proteinG: "0.11", carbsG: "0.28999999999999998", fatG: "0.03" } };
  assert.deepEqual(referenceNutrition(old, "330").nutrition,
    { caloriesKcal: "6.6000", proteinG: "0.3630", carbsG: "0.9570", fatG: "0.0990" });
  const [cola] = searchReferenceFoods("无糖可乐").referenceFoods;
  assert.equal(cola.basisUnit, "mL");
  assert.deepEqual(referenceNutrition(cola, "330"), {
    edibleGrams: null, volumeMl: "330",
    nutrition: { caloriesKcal: "0.0000", proteinG: "0.0000", carbsG: "0.0000", fatG: "0.0000" },
  });
  assert.equal(referenceNutrition({ ...cola, nutrition: { ...cola.nutrition, fatG: null } }, "330").nutrition.fatG, null);
  assert.throws(() => requireCurrentReferenceFood({ id: "cola-diet", version: 1 }), /重新搜索选择/);
});

test("盖饭、单点鸡翅及多人份按同一配方计量", () => {
  const meals = searchReferenceFoods("", "chinese-meal").referenceFoods;
  assert.deepEqual(meals.map(food => food.id), ["tomato-brisket-rice"]);
  const [tomato] = meals;
  const [wings] = searchReferenceFoods("可乐鸡翅").referenceFoods;
  assert.equal(wings.id, "cola-wings");
  assert.equal(wings.family, "chicken-wing");
  assert.equal(wings.recipe?.kind, "dish");
  assert.equal(tomato.recipe?.kind, "meal");
  assert.equal(searchReferenceFoods("可乐鸡翅配饭").matches, 0);
  assert.equal(referenceCatalogDetail("cola-wings-rice"), null);
  assert.equal(wings.recipe?.suggestedFoods[0]?.id, "white-rice-cooked");
  assert.deepEqual(tomato.components?.map(part => [part.food.id, Number(part.grams)]), [
    ["brisket-cooked", 90], ["tomato-cooked", 70], ["white-rice-cooked", 150], ["vegetable-oil", 5],
    ["soy-sauce-light", 4], ["table-salt", 1], ["tomato-ketchup", 8], ["ginger-raw", 2],
  ]);
  assert.deepEqual(wings.components?.map(part => part.food.id),
    ["chicken-wing-stewed", "cola-glaze", "vegetable-oil", "soy-sauce-light", "ginger-raw", "table-salt"]);
  for (const meal of [tomato, wings]) {
    assert.ok(meal.recipe?.note && meal.version >= 2);
    assert.ok(!meal.components?.some(part => part.food.id === "napa-cooked" || part.food.id === "potato-boiled"));
    for (const { food } of meal.components ?? []) {
      const ingredient = referenceCatalogDetail(food.id)!.referenceFoods[0];
      assert.deepEqual(ingredient.relatedMeals?.find(link => link.id === meal.id),
        meal === wings ? undefined : { id: meal.id, name: meal.name, version: meal.version });
    }
    const full = wholeRecipeParts(meal, "1", "meal-serving");
    const half = wholeRecipeParts(meal, "0.5", "meal-serving");
    assert.equal(recipeGrams(full), meal.portions[0].edibleGrams);
    assert.ok(half.every((part, index) => Number(part.grams) * 2 === Number(full[index].grams)));
    const people = wholeRecipeParts(meal, "3", "meal-servings");
    assert.equal(Number(recipeGrams(people)), Number(meal.portions[0].edibleGrams) * 3);
    assert.ok(people.every((part, index) => Number(part.grams) === Number(full[index].grams) * 3));
    const custom = wholeRecipeParts(meal, "277.35");
    assert.equal(recipeTotals(custom).grams, "277.3500");
    assert.equal(recipeGrams(wholeRecipeParts(meal, "0.0001")), "0.0001");
    const estimate = referenceNutrition(meal, "1", "meal-serving");
    assert.ok(Math.abs(Number(recipeTotals(full).nutrition.caloriesKcal) - Number(estimate.nutrition.caloriesKcal)) < 0.001);
  }
  const defaultParts = wholeRecipeParts(tomato, "1", "meal-serving");
  const first = defaultParts[0];
  assert.equal(recipeTotals([{ ...first, food: { ...first.food, nutrition: { ...first.food.nutrition, fatG: null } } },
    ...defaultParts.slice(1)]).nutrition.fatG, null);
  assert.equal(Number(tomato.portions[0].edibleGrams), 330);
  assert.equal(Number(wings.portions[0].edibleGrams), 123);
  assert.equal(tomato.recipe?.sourceAmounts["vegetable-oil"], "用量未注明");
  assert.match(wings.recipe!.note, /40 g.*12 g/);
  assert.ok(referenceCatalogDetail("tomato-beef-brisket")?.referenceFoods[0].relatedMeals?.some(link => link.id === tomato.id));
  assert.equal(referenceCatalogDetail("cola-wings")?.referenceFoods[0].relatedMeals, undefined);
});

test("已核对的下架规格按原快照确认，新选材提示重新选择", () => {
  const retired = { id: "drumstick-raw-edible", version: 1 };
  const retained = { ...leg, ...retired, name: "生鸡小腿", state: "raw", method: "生", portions: [] } as const;
  const snapshot = { food: retained, edibleGrams: "100.0000" };
  assert.throws(() => requireCurrentReferenceFood(retired), /重新搜索选择/);
  assert.throws(() => validatePreparedReferenceFood(retired), /重新搜索选择/);
  assert.throws(() => validatePreparedReferenceFood(retired, { ...snapshot, food: leg }), /重新搜索选择/);
  assert.doesNotThrow(() => validatePreparedReferenceFood(retired, snapshot));
});

test("计件食量使用原表独立换算，实称直接使用可食克数，未知保留", () => {
  assert.equal(medium.source.recordId, "24143220 · 3");
  assert.deepEqual(referenceNutrition(leg, "0.5", medium.id), {
    edibleGrams: "27.5000",
    nutrition: { caloriesKcal: "40.7000", proteinG: "6.5203", carbsG: "0.0000", fatG: "1.6225" },
  });
  assert.equal(referenceNutrition(leg, "42").nutrition.caloriesKcal, "62.1600");
  assert.equal(referenceNutrition({ ...leg, nutrition: { ...leg.nutrition, proteinG: null } }, "42").nutrition.proteinG, null);
  assert.ok(Object.values(referenceNutrition(leg, null, medium.id).nutrition).every(value => value === null));
});

test("网页与 AI 共用份量校验，确认后只保存服务端来源及可重读的历史快照", async () => {
  const pg = new PGlite();
  try {
    const db = drizzle(pg, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    const userId = randomUUID(), otherId = randomUUID();
    await db.insert(schema.user).values([userId, otherId].map(id => ({ id, name: "虚构食材验收", email: id + "@example.test" })));
    const actor = { userId, origin: "manual" } as const;
    const personal = await submitMealOperation(db, actor, {
      operationId: randomUUID(),
      actions: [{ kind: "save_food", name: "虚构鸡腿配方", sourceKind: "estimated", nutrition: emptyNutrition(), baseQuantity: "100", unit: "g" }],
    });
    assert.equal(personal.canConfirm, true);
    await decideMealOperation(db, userId, personal.id, personal.revision, "confirm");
    const own = await queryFoods(db, userId, "鸡腿");
    const other = await queryFoods(db, otherId, "鸡腿");
    assert.deepEqual(own.foods.map(food => food.name), ["虚构鸡腿配方"]);
    assert.deepEqual(own.presets, []);
    assert.equal(typeof own.foodLibraryRules, "string");
    assert.deepEqual(other.foods, []);
    assert.deepEqual(own.referenceFoods, other.referenceFoods);
    assert.equal(own.referenceFoods.length, 5);
    assert.ok(own.referenceFoods.every(food => food.state === "cooked"));
    assert.deepEqual((await queryFoods(db, userId, "生鸡小腿")).referenceFoods.map(food => food.id), ["chicken-leg-raw-skinless"]);

    const fromWeb: ItemDraft = { kind: "food", name: leg.name, quantity: "0.5", unit: "只", sourceKind: "composition_table", referenceFood };
    const initial = await readMealSnapshot(db, userId);
    const [web] = prepareMealActions({ operationId: randomUUID(), actions: [saveMeal([fromWeb])] }, initial, "manual");
    const token = await createAiToken(db, userId, "虚构食材写令牌", "write");
    const identity = await authenticateAi(db, "Bearer " + token.rawToken);
    const ai = await previewMeal(db, identity, {
      operationId: randomUUID(), date: "2026-11-25", mealType: "晚餐",
      foods: [{ name: "模型提交的名称", referenceFood, quantity: "0.5", unit: "只" }],
    });
    assert.equal(ai.canConfirm, true);
    assert.deepEqual(ai.rows[0].meal?.items[0].nutrition, web.meal?.items[0].nutrition);
    assert.deepEqual(ai.rows[0].meal?.items[0].referenceSnapshot, web.meal?.items[0].referenceSnapshot);
    assert.equal((await readMealSnapshot(db, userId)).meals.length, 0);
    await decideMealOperation(db, userId, ai.id, ai.revision, "confirm");

    const [saved] = (await readMealSnapshot(db, userId)).meals;
    const [item] = saved.items;
    assert.equal(item.name, leg.name);
    assert.equal(item.foodId, undefined);
    assert.equal(item.nutrition.caloriesKcal, "40.7000");
    assert.equal(item.referenceSnapshot?.edibleGrams, "27.5000");
    assert.deepEqual(item.referenceSnapshot?.food.source, leg.source);
    assert.deepEqual((await readMealSnapshot(db, otherId)).meals, []);
    const crossAccount = await submitMealOperation(db, { userId: otherId, origin: "manual" }, {
      operationId: randomUUID(), actions: [saveMeal([{ ...fromWeb, originalItemId: item.id }], { id: saved.id, version: saved.version })],
    });
    assert.equal(crossAccount.canConfirm, false);

    const historical = { ...leg, id: "drumstick-raw-edible", version: 1, name: "生鸡小腿", state: "raw", method: "生",
      portions: [], nutrition: { ...leg.nutrition, caloriesKcal: "159" }, source: { ...leg.source, recordId: "I0404302" } } as const;
    assert.ok(item.id);
    await db.update(schema.mealItem).set({ referenceSnapshot: { food: historical, edibleGrams: "100.0000" },
      quantity: "100", unit: "g", caloriesKcal: "159.0000", carbsG: "0.1234" })
      .where(eq(schema.mealItem.id, item.id));
    const staleReference = { ...fromWeb, quantity: "100", unit: "g", referenceFood: { id: historical.id, version: historical.version } };
    const updated = await submitMealOperation(db, actor, {
      operationId: randomUUID(),
      actions: [saveMeal([{ ...staleReference, originalItemId: item.id }], { id: saved.id, version: saved.version, notes: "修改历史餐次备注" })],
    });
    assert.equal(updated.canConfirm, true);
    await decideMealOperation(db, userId, updated.id, updated.revision, "confirm");
    const [revised] = (await readMealSnapshot(db, userId)).meals;
    assert.equal(revised.items[0].nutrition.caloriesKcal, "159.0000");
    assert.equal(revised.items[0].nutrition.carbsG, "0.1234");
    assert.equal(revised.items[0].referenceSnapshot?.food.source.recordId, "I0404302");
    assert.equal(revised.items[0].referenceSnapshot?.food.version, historical.version);
    for (const invalid of [staleReference, { ...fromWeb, referenceFood: { ...referenceFood, version: 2 } }, { ...fromWeb, unit: "碗" }, { ...fromWeb, referenceFood: { ...referenceFood, portionId: "fictional-portion" } }]) {
      const [row] = prepareMealActions({ operationId: randomUUID(), actions: [saveMeal([invalid])] }, initial, "manual");
      assert.ok(row.error);
    }

    const [cola] = (await queryFoods(db, userId, "无糖可乐")).referenceFoods;
    const volumeItem: ItemDraft = { kind: "food", name: cola.name, quantity: "330", unit: "mL",
      referenceFood: { id: cola.id, version: cola.version }, sourceKind: "label" };
    const withCola = await submitMealOperation(db, actor, {
      operationId: randomUUID(), actions: [saveMeal([volumeItem], { mealType: "加餐" })],
    });
    assert.equal(withCola.canConfirm, true);
    await decideMealOperation(db, userId, withCola.id, withCola.revision, "confirm");
    const drink = (await readMealSnapshot(db, userId)).meals.find(meal => meal.mealType === "加餐")!.items[0];
    assert.equal(drink.sourceKind, "label");
    assert.equal(drink.referenceSnapshot?.volumeMl, "330");
    assert.equal(drink.referenceSnapshot?.edibleGrams, null);
    assert.equal(drink.nutrition.caloriesKcal, "0.0000");
    const [wrongUnit] = prepareMealActions({
      operationId: randomUUID(), actions: [saveMeal([{ ...volumeItem, unit: "g" }])],
    }, initial, "manual");
    assert.ok(wrongUnit.error);

    const recipe = requireCurrentReferenceFood({ id: "tomato-brisket-rice", version: 3 });
    const sharedRecipe = { id: recipe.id, version: recipe.version, portionId: "meal-servings" };
    const partyItem: ItemDraft = { kind: "food", name: recipe.name, quantity: "3", unit: "人份", sourceKind: "estimated",
      referenceFood: sharedRecipe };
    const party = await previewMeal(db, identity, { operationId: randomUUID(), date: "2026-11-25", mealType: "多人份验收",
      foods: [{ name: recipe.name, quantity: "3", unit: "人份", referenceFood: sharedRecipe }] });
    assert.equal(party.canConfirm, true);
    assert.equal(party.rows[0].meal?.items[0].referenceSnapshot?.edibleGrams, "990.0000");
    await decideMealOperation(db, userId, party.id, party.revision, "confirm");
    const [peopleServed] = (await readMealSnapshot(db, userId)).meals.find(meal => meal.mealType === "多人份验收")!.items;
    assert.equal(peopleServed.unit, "人份");
    assert.equal(peopleServed.quantity, "3.0000");
    assert.equal(peopleServed.referenceSnapshot?.recipeParts?.find(part => part.food.id === "white-rice-cooked")?.grams, "450.0000");
    for (const quantity of ["1", "2.5"]) {
      const [row] = prepareMealActions({ operationId: randomUUID(), actions: [saveMeal([{ ...partyItem, quantity }])] }, initial, "manual");
      assert.match(row.error ?? "", /整数人数/);
    }
    const [oldPortion] = prepareMealActions({ operationId: randomUUID(), actions: [saveMeal([{
      ...partyItem, unit: "份", quantity: "1.5", referenceFood: { ...sharedRecipe, portionId: "meal-serving" },
    }])] }, initial, "manual");
    assert.equal(oldPortion.meal?.items[0].referenceSnapshot?.edibleGrams, "495.0000");
    const parts = recipePartInputs(wholeRecipeParts(recipe, "1", "meal-serving"));
    const grouped = { kind: "food", name: recipe.name, quantity: "330", unit: "g", sourceKind: "estimated",
      referenceFood: { id: recipe.id, version: recipe.version, parts } } satisfies ItemDraft;
    const invalidParts = [parts[0], parts[0]];
    assert.equal(itemSchema.safeParse({ ...grouped, referenceFood: { ...grouped.referenceFood, parts: invalidParts } }).success, false);
    const splitDraft = await previewMeal(db, identity, { operationId: randomUUID(), date: "2026-11-25",
      mealType: "整餐测试", foods: [{ name: grouped.name, quantity: "330", unit: "g", referenceFood: grouped.referenceFood }] });
    assert.equal(splitDraft.canConfirm, true);
    const [manual] = prepareMealActions({ operationId: randomUUID(), actions: [saveMeal([grouped])] }, initial, "manual");
    assert.deepEqual(splitDraft.rows[0].meal?.items[0].referenceSnapshot, manual.meal?.items[0].referenceSnapshot);
    await decideMealOperation(db, userId, splitDraft.id, splitDraft.revision, "confirm");
    const groupedMeal = (await readMealSnapshot(db, userId)).meals.find(meal => meal.mealType === "整餐测试")!;
    assert.equal(groupedMeal.items.length, 1);
    const groupedItem = groupedMeal.items[0];
    assert.equal(groupedItem.referenceSnapshot?.recipeMode, "split");
    assert.equal(groupedItem.referenceSnapshot?.edibleGrams, "330.0000");
    assert.equal(groupedItem.referenceFood?.parts?.length, 8);
    const adjustedParts = parts.map(part => part.id === "vegetable-oil" ? { ...part, grams: "8", estimated: false } :
      part.id === "white-rice-cooked" ? { ...part, grams: "147", estimated: false } : part);
    assert.equal(recipeGrams(adjustedParts), recipeGrams(parts));
    const adjustedAction = applyMealChanges(savedMealDraft(groupedMeal), { operationId: randomUUID(),
      updateFoods: [{ itemId: groupedItem.id, recipeParts: adjustedParts }] });
    const [sameWeight] = prepareMealActions({ operationId: randomUUID(), actions: [adjustedAction] }, await readMealSnapshot(db, userId), "manual");
    assert.ok(!sameWeight.error);
    assert.equal(sameWeight.meal?.items[0].referenceSnapshot?.edibleGrams, "330.0000");
    assert.notEqual(groupedItem.nutrition.caloriesKcal, sameWeight.meal?.items[0].nutrition.caloriesKcal);
    assert.equal(sameWeight.meal?.items[0].referenceSnapshot?.recipeParts?.find(part => part.food.id === "vegetable-oil")?.grams, "8");
    for (const item of [
      { ...grouped, quantity: "329" },
      { ...grouped, referenceFood: { ...grouped.referenceFood, parts: [{ id: cola.id, version: cola.version, grams: "330" }] } },
      { ...grouped, referenceFood: { ...grouped.referenceFood, parts: [{ id: recipe.id, version: recipe.version, grams: "330" }] } },
      { ...grouped, referenceFood: { ...grouped.referenceFood, parts: [{ id: parts[0].id, version: 99, grams: "330" }] } },
    ]) {
      assert.ok(prepareMealActions({ operationId: randomUUID(), actions: [saveMeal([item])] }, initial, "manual")[0].error);
    }

    const cabbage = requireCurrentReferenceFood({ id: "napa-cooked", version: 2 });
    const legacyFood = { ...recipe, version: 1, recipe: undefined,
      components: [{ food: cabbage, role: "配菜" as const, grams: "60" }],
      portions: [{ ...recipe.portions[0], edibleGrams: "370" }],
    };
    await db.update(schema.mealItem).set({
      referenceSnapshot: { food: legacyFood, portionId: "meal-serving", edibleGrams: "370.0000" },
      quantity: "1", unit: "份", caloriesKcal: "459.0000",
    }).where(eq(schema.mealItem.id, groupedItem.id!));
    const beforeLegacyEdit = await readMealSnapshot(db, userId);
    const legacy = beforeLegacyEdit.meals.find(meal => meal.id === groupedMeal.id)!;
    const legacyAction = savedMealDraft(legacy);
    const [legacyRow] = prepareMealActions({ operationId: randomUUID(),
      actions: [{ ...legacyAction, notes: "调整备注" }] }, beforeLegacyEdit, "manual");
    assert.equal(legacyRow.meal?.items[0].nutrition.caloriesKcal, "459.0000");
    assert.equal(legacyRow.meal?.items[0].referenceSnapshot?.food.version, 1);
    assert.equal(legacyRow.meal?.items[0].referenceSnapshot?.food.components?.[0].food.id, cabbage.id);
    assert.equal(legacyRow.meal?.items[0].referenceSnapshot?.edibleGrams, "370.0000");

    const unknown = mealPreviewOperation({
      operationId: randomUUID(), date: "2026-11-25", mealType: "晚餐",
      foods: [{ name: leg.name, referenceFood, unit: "只", amountDecision: "unknown_accepted" }],
    });
    const [unknownRow] = prepareMealActions(unknown, initial, "ai");
    assert.equal(unknownRow.meal?.items[0].referenceSnapshot?.edibleGrams, null);
    assert.equal(unknownRow.meal?.items[0].nutrition.caloriesKcal, null);
  } finally {
    await pg.close();
  }
});
