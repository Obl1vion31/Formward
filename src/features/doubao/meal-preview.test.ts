import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { ApiError } from "../auth/ai-identity";
import { publicMealInputSchema } from "../meals/model";
import { mealPreviewOperation, mealPreviewSchema, type MealPreviewInput } from "./meal-preview";
import { doubaoInputSchema } from "./mcp";

const lunch: MealPreviewInput = {
  operationId: "fictional-lunch-20261110", date: "2026-11-10", mealType: "午餐", timezone: "Asia/Shanghai",
  foods: [{ name: "虚构午餐", quantity: "2", unit: "份", caloriesKcal: "600", proteinG: "0", sourceKind: "estimated", basis: "两份合计估计600 kcal，未提供配料，实际油量不确定。" }],
};
const action = (input = lunch) => {
  const result = mealPreviewOperation(input).actions[0];
  assert.equal(result.kind, "save_meal");
  if (result.kind !== "save_meal") throw new Error();
  return result;
};

test("模型契约只有对象、数组及简单字段，没有组合分支或引用", () => {
  const schema = z.toJSONSchema(mealPreviewSchema), previous = z.toJSONSchema(publicMealInputSchema);
  const encoded = JSON.stringify(schema);
  assert.ok(Buffer.byteLength(encoded) < Buffer.byteLength(JSON.stringify(previous)) / 3);
  const inspect = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!["anyOf", "oneOf", "allOf", "$ref", "exclusiveMinimum"].includes(key), key);
      inspect(child);
    }
  };
  inspect(schema);
  assert.deepEqual(schema.required, ["operationId", "date", "mealType", "foods"]);
});

test("豆包整数边界转换保持相同含义，不修改原schema和服务器校验", () => {
  const original = { type: "object", properties: { version: { type: "integer", exclusiveMinimum: 0 }, negative: { type: "integer", minimum: -1, exclusiveMinimum: -1.5 } } };
  assert.deepEqual(doubaoInputSchema(original), { type: "object", properties: { version: { type: "integer", minimum: 1 }, negative: { type: "integer", minimum: -1 } } });
  assert.equal(original.properties.version.exclusiveMinimum, 0);
  assert.equal(publicMealInputSchema.safeParse({ operationId: "fictional-version-check", actions: [{ kind: "save_meal", id: "8df6cc94-d77f-4edb-8fad-d35eb63e9a84", version: 0, date: "2026-11-10", mealType: "午餐", items: [{ kind: "misc", name: "虚构", nutrition: { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null } }] }] }).success, false);
});

test("实际食用总营养不再乘数量，未知为null、明确0和精度保留", () => {
  const item = action().items[0];
  assert.equal(item.nutritionBasis, "consumed_total");
  assert.deepEqual(item.nutrition, { caloriesKcal: "600", proteinG: "0", carbsG: null, fatG: null });
  assert.equal(item.quantity, "2");
  assert.equal(item.sourceKind, "estimated");
  const unknown = action({ ...lunch, foods: [{ name: "虚构食物", quantity: "1", unit: "份" }] }).items[0];
  assert.equal(unknown.sourceKind, "unknown");
  assert.deepEqual(unknown.nutrition, { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null });
});

test("食材只映射真实引用，服务器沿用原规格换算", () => {
  const item = action({ ...lunch, foods: [{ name: "虚构库食材", foodId: "8df6cc94-d77f-4edb-8fad-d35eb63e9a84", foodVersion: 3, quantity: "150", unit: "g" }] }).items[0];
  assert.equal(item.kind, "food");
  assert.equal(item.foodVersion, 3);
  assert.equal(item.nutrition, undefined);
  assert.equal(item.foodDraft, undefined);
});

test("食量未知或接受估算必须显式表达，不替用户默认同意", () => {
  const item = action({ ...lunch, foods: [{ name: "虚构食物", amountDecision: "unknown_accepted" }] }).items[0];
  assert.equal(item.quantity, null);
  assert.equal(item.amountDecision, "unknown_accepted");
  assert.throws(() => action({ ...lunch, foods: [{ name: "虚构食物" }] }), /foods.0.quantity/);
  assert.throws(() => action({ ...lunch, foods: [{ name: "虚构食物", quantity: "1", amountDecision: "unknown_accepted" }] }), /foods.0.quantity/);
});

test("拒绝缺失来源、无依据估算、食材和自由营养混填，错误指出可修正字段", () => {
  for (const [food, field] of [
    [{ ...lunch.foods[0], sourceKind: undefined }, "sourceKind"],
    [{ ...lunch.foods[0], basis: undefined }, "basis"],
    [{ ...lunch.foods[0], foodId: "8df6cc94-d77f-4edb-8fad-d35eb63e9a84" }, "foodVersion"],
    [{ ...lunch.foods[0], foodId: "8df6cc94-d77f-4edb-8fad-d35eb63e9a84", foodVersion: 1 }, "foods.0"],
  ] as const) assert.throws(() => action({ ...lunch, foods: [food] }), error => error instanceof ApiError && error.message.includes(field));
});

test("转换后继续执行原有格式、数值、版本、图片及大小约束", () => {
  for (const input of [
    { ...lunch, operationId: "short" },
    { ...lunch, foods: [] },
    { ...lunch, foods: [{ ...lunch.foods[0], quantity: "-1" }] },
    { ...lunch, foods: [{ ...lunch.foods[0], name: "" }] },
    { ...lunch, foods: [{ ...lunch.foods[0], caloriesKcal: "1000001" }] },
    { ...lunch, foods: [{ ...lunch.foods[0], fatG: "0.01kg" }] },
    { ...lunch, foods: [{ ...lunch.foods[0], sourceKind: "invented_source" }] },
    { ...lunch, foods: [{ name: "虚构库食材", quantity: "1", unit: "g", foodId: "invalid", foodVersion: 1 }] },
    { ...lunch, imageIds: ["invalid"] },
    { ...lunch, expectedImageCount: -1 },
    { ...lunch, foods: [{ ...lunch.foods[0], userId: "another-account" }] },
  ]) assert.throws(() => mealPreviewOperation(input as MealPreviewInput), ApiError);
});

test("明确等价的标签名称和同单位后缀只作格式兼容，不猜测来源或换算", () => {
  const item = action({ ...lunch, foods: [{ ...lunch.foods[0], caloriesKcal: "600 kcal", fatG: "12.50g", sourceKind: "package_label" }] }).items[0];
  assert.equal(item.sourceKind, "label");
  assert.equal(item.nutrition?.caloriesKcal, "600");
  assert.equal(item.nutrition?.fatG, "12.50");
  assert.equal(item.nutrition?.carbsG, null);
});
