import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mealImage } from "../src/db/schema.ts";
import { addCalendarDays } from "../src/features/measurements/calendar.ts";
import { submitMealOperation, decideMealOperation, readMealSnapshot } from "../src/features/meals/records.ts";

/** 仅接受隔离测试入口创建的虚构账号；照片内容由本地验收服务模拟。 */
export async function seedSavedMealDetails(db, userId, today) {
  const singleDate = addCalendarDays(today, -11), multiDate = addCalendarDays(today, -12), manyDate = addCalendarDays(today, -13), unknownDate = addCalendarDays(today, -14);
  const imageIds = [randomUUID(), randomUUID()];
  await db.insert(mealImage).values(imageIds.map((id, index) => ({ id, userId, pathname: `fictional-saved-meals/${userId}/${id}.png`, sha256: createHash("sha256").update(id).digest("hex"), mimeType: "image/png", byteSize: 100 + index, fileName: `虚构照片${index + 1}.png`, source: "manual", createdBy: userId })));
  const food = (name, nutrition, extra = {}) => ({ kind: "food", name, quantity: "1", unit: "份", sourceKind: "reference", nutritionBasis: "consumed_total", nutrition, ...extra });
  const preview = await submitMealOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions: [
    { kind: "save_meal", date: singleDate, mealType: "夜宵", items: [food("榴莲大福 · 虚构", { caloriesKcal: "171", proteinG: "1", carbsG: "4.4", fatG: "16.6" })] },
    { kind: "save_meal", date: multiDate, mealType: "晚餐", notes: "虚构备注：本次只记录实际吃下的部分。", imageIds, items: [
      food("香草烤鸡、杂粮饭与时蔬 · 虚构", { caloriesKcal: "547", proteinG: "29.7", carbsG: "61.5", fatG: "10.8" }),
      food("番茄牛腩、炖土豆及青椒蘑菇彩椒的长名称组合 · 虚构", { caloriesKcal: "216", proteinG: "10.8", carbsG: "21.5", fatG: "1.2" }, { quantity: "0.675", unit: "整锅蔬菜", sourceKind: "estimated", amountDecision: "estimate_accepted", basis: "虚构依据：依据实际食用比例估算，保留原始精度。" }),
      food("无糖气泡水 · 虚构零值", { caloriesKcal: "0", proteinG: "0", carbsG: "0", fatG: "0" }),
      food("营养未齐 · 虚构", { caloriesKcal: "110", proteinG: "6.8", carbsG: null, fatG: null }),
    ] },
    ...["早餐", "午餐", "晚餐", "加餐", "夜宵"].map((mealType, index) => ({ kind: "save_meal", date: manyDate, mealType, items: [food(`${mealType}食物 · 虚构`, { caloriesKcal: String(120 + index), proteinG: "12", carbsG: "14", fatG: "3" })] })),
    { kind: "save_meal", date: unknownDate, mealType: "午餐", items: [food("热量未知、仅蛋白质已知 · 虚构", { caloriesKcal: null, proteinG: "8", carbsG: null, fatG: null })] },
  ] });
  assert.equal(preview.canConfirm, true); await decideMealOperation(db, userId, preview.id, preview.revision, "confirm");
  const snapshot = await readMealSnapshot(db, userId);
  return { singleDate, multiDate, manyDate, unknownDate, imageIds, singleMealId: snapshot.meals.find(meal => meal.date === singleDate).id };
}
