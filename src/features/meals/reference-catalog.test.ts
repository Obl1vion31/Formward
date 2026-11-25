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
import { emptyNutrition, type ItemDraft, type MealAction } from "./model";
import { decideMealOperation, prepareMealActions, readMealSnapshot, submitMealOperation } from "./records";
import { referenceCatalogOverview, requireCurrentReferenceFood, searchReferenceFoods, validatePreparedReferenceFood } from "./reference-catalog";
import { foodArtCell } from "./reference-art";
import { referenceFoodName, referenceNutrition, referenceSections } from "./reference-food";

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
    assert.ok(Object.values(food.nutrition).every(value => value === null || Number.isFinite(Number(value)) && Number(value) >= 0));
    for (const portion of food.portions) {
      assert.ok(Number(portion.edibleGrams) > 0);
      assert.ok(portion.source.recordId.startsWith(food.source.recordId + " · "));
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

test("公共检索保留食物原名，按真实状态筛选且支持浏览下一批", () => {
  assert.equal(searchReferenceFoods("生菜").referenceFoods[0].id, "lettuce-ready");
  assert.equal(searchReferenceFoods("生抽").referenceFoods[0].id, "soy-sauce-light");
  assert.equal(searchReferenceFoods("清蒸 虾").referenceFoods[0].id, "shrimp-boiled");
  assert.equal(searchReferenceFoods("无糖茉莉花茶").referenceFoods[0].nutrition.fatG, null);
  assert.equal(searchReferenceFoods("无糖茉莉花茶").referenceFoods[0].nutrition.caloriesKcal, "0");
  assert.deepEqual(searchReferenceFoods("海南鸡饭").referenceFoods, []);
  const first = searchReferenceFoods("熟");
  assert.equal(first.referenceFoods.length, 40);
  assert.equal(first.nextOffset, 40);
  const second = searchReferenceFoods("熟", undefined, "search", first.nextOffset);
  assert.ok(second.referenceFoods.length > 0);
  assert.equal(new Set([...first.referenceFoods, ...second.referenceFoods].map(food => food.id)).size,
    first.referenceFoods.length + second.referenceFoods.length);
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
      quantity: "100", unit: "g", caloriesKcal: "159.0000" })
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
    assert.equal(revised.items[0].referenceSnapshot?.food.source.recordId, "I0404302");
    assert.equal(revised.items[0].referenceSnapshot?.food.version, historical.version);
    for (const invalid of [staleReference, { ...fromWeb, referenceFood: { ...referenceFood, version: 2 } }, { ...fromWeb, unit: "碗" }, { ...fromWeb, referenceFood: { ...referenceFood, portionId: "fictional-portion" } }]) {
      const [row] = prepareMealActions({ operationId: randomUUID(), actions: [saveMeal([invalid])] }, initial, "manual");
      assert.ok(row.error);
    }

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
