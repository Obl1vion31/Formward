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
import { requireCurrentReferenceFood, searchReferenceFoods } from "./reference-catalog";
import { referenceNutrition, referenceSections } from "./reference-food";

const leg = requireCurrentReferenceFood({ id: "drumstick-stewed-skinless", version: 1 });
const [medium] = leg.portions;
const referenceFood = { id: leg.id, version: leg.version, portionId: medium.id };

function saveMeal(items: ItemDraft[], patch: Partial<Extract<MealAction, { kind: "save_meal" }>> = {}): Extract<MealAction, { kind: "save_meal" }> {
  return { kind: "save_meal", date: "2026-11-25", mealType: "晚餐", items, ...patch };
}

test("公用目录按部位和形态给出有依据的候选", () => {
  const all = searchReferenceFoods();
  assert.equal(all.total, 18);
  assert.equal(new Set(all.referenceFoods.map(food => food.id)).size, 18);
  const families = referenceSections.flatMap(section => section.families.map(family => family.id));
  assert.deepEqual(families.map(family => searchReferenceFoods("", family).matches), [7, 4, 2, 3, 2]);
  const chicken = searchReferenceFoods("鸡腿").referenceFoods;
  assert.deepEqual(chicken.map(food => food.source.recordId), ["24143220", "24143210", "24142501", "24142500", "24147300", "I0404302", "I0404501"]);
  assert.deepEqual(chicken.map(food => food.state), ["cooked", "cooked", "cooked", "cooked", "cooked", "raw", "raw"]);
  assert.deepEqual(searchReferenceFoods("鸡腿 熟").referenceFoods, chicken.slice(0, 5));
  assert.deepEqual(searchReferenceFoods("生重鸡腿").referenceFoods, chicken.slice(5));
  assert.deepEqual(searchReferenceFoods("去皮炖鸡腿").referenceFoods, [leg]);
  assert.equal(searchReferenceFoods("香茅焖鸡腿").matches, 0);
  assert.equal(searchReferenceFoods("带骨鸡腿").matches, 0);
  assert.equal(searchReferenceFoods("清蒸罗非鱼").referenceFoods[0].id, "tilapia-steamed");
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

    const historical = { ...leg, version: 2, nutrition: { ...leg.nutrition, caloriesKcal: "140" } };
    assert.ok(item.id);
    await db.update(schema.mealItem).set({ referenceSnapshot: { food: historical, portionId: medium.id, edibleGrams: "27.5000" }, caloriesKcal: "38.5000" })
      .where(eq(schema.mealItem.id, item.id));
    const staleReference = { ...fromWeb, referenceFood: { ...referenceFood, version: historical.version } };
    const updated = await submitMealOperation(db, actor, {
      operationId: randomUUID(),
      actions: [saveMeal([{ ...staleReference, originalItemId: item.id }], { id: saved.id, version: saved.version, notes: "修改历史餐次备注" })],
    });
    assert.equal(updated.canConfirm, true);
    await decideMealOperation(db, userId, updated.id, updated.revision, "confirm");
    const [revised] = (await readMealSnapshot(db, userId)).meals;
    assert.equal(revised.items[0].nutrition.caloriesKcal, "38.5000");
    assert.equal(revised.items[0].referenceSnapshot?.food.version, historical.version);
    for (const invalid of [staleReference, { ...fromWeb, unit: "碗" }, { ...fromWeb, referenceFood: { ...referenceFood, portionId: "fictional-portion" } }]) {
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
