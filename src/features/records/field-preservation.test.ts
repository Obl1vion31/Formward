import assert from "node:assert/strict";
import { test } from "node:test";
import { assertOnlyFieldsChanged, preservationResult } from "./field-preservation.test-support";

test("字段保留检查能定位关联丢失、未知清零、精度变化及其他项目修改", () => {
  const before = { items: [{ foodId: "library", quantity: "250", nutrition: { caloriesKcal: "150.0000", proteinG: null } }, { name: "保留项", quantity: "1.0000" }], notes: "原备注" };
  const allowed = ["items.0.quantity", "items.0.nutrition.caloriesKcal"];
  const after = structuredClone(before); after.items[0].quantity = "200"; after.items[0].nutrition!.caloriesKcal = "120.0000";
  assert.equal(assertOnlyFieldsChanged(before, after, allowed).actual.length, 2);
  for (const [mutate, path] of [
    [(value: typeof before) => { delete value.items[0].foodId; }, "items.0.foodId"],
    [(value: typeof before) => { (value.items[0].nutrition as Record<string, unknown>).proteinG = "0"; }, "items.0.nutrition.proteinG"],
    [(value: typeof before) => { value.items[1].quantity = "1"; }, "items.1.quantity"],
    [(value: typeof before) => { value.notes = "被意外替换"; }, "notes"],
  ] as const) {
    const broken = structuredClone(after); mutate(broken);
    assert.ok(preservationResult(before, broken, allowed).unexpected.some(change => change.path === path));
    assert.throws(() => assertOnlyFieldsChanged(before, broken, allowed), /未授权字段变化/);
  }
});
