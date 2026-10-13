import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { mealImport, mealOperation } from "../../db/schema";
import { lockOwner } from "../auth/owner-lock";
import { digest, displayMealOperation, submitMealOperation } from "../meals/records";
import { nutritionSchema, type MealAction } from "../meals/model";
export type ReferenceMeal = { date: string; mealType: string; description: string; caloriesKcal: string };
const headers = ["日期", "餐次", "食物 / 餐食", "记录状态", "蛋白质 (g)", "脂肪 (g)", "碳水 (g)", "热量 (kcal)", "备注"];

export function previewMealTsv(contents: string, references: ReferenceMeal[] = []) {
  const lines = contents.replace(/^\uFEFF/, "").replace(/[\r\n]+$/, "").split(/\r?\n/);
  if (lines[0] !== headers.join("\t")) throw new Error("饮食TSV表头不符。");
  const originalRows = lines.slice(1).map((line, index) => {
    const fields = line.split("\t"); if (fields.length !== headers.length) throw new Error(`第${index + 2}行列数不符。`);
    return Object.fromEntries(headers.map((h, i) => [h, fields[i]]));
  });
  if (!originalRows.length || originalRows.length > 100) throw new Error("每次初始化支持1–100餐，请按原表分批。");
  const changes: { row: number; previous: string | null; adopted: string | null; reason: string }[] = [];
  const actions: MealAction[] = originalRows.map((r, index) => {
    const reference = references.find(ref => ref.date === r["日期"] && ref.mealType === r["餐次"] && ref.description === r["食物 / 餐食"]);
    const nutrition = nutritionSchema.parse({ caloriesKcal: reference?.caloriesKcal ?? (r["热量 (kcal)"] || null), proteinG: r["蛋白质 (g)"] || null, carbsG: r["碳水 (g)"] || null, fatG: r["脂肪 (g)"] || null });
    if (reference && (!r["热量 (kcal)"] || Number(reference.caloriesKcal) !== Number(r["热量 (kcal)"]))) changes.push({ row: index + 2, previous: r["热量 (kcal)"] || null, adopted: nutrition.caloriesKcal, reason: "采用初始化参考资料的显式热量；不使用三大营养素覆盖酒精等供能。" });
    if (r["记录状态"] !== "正常记录") changes.push({ row: index + 2, previous: nutrition.caloriesKcal, adopted: null, reason: "原记录无法计算，保留描述，营养未知。" });
    return { kind: "save_meal", date: r["日期"], mealType: r["餐次"], timezone: null, notes: `吃了：${r["食物 / 餐食"]}${r["备注"] ? `\n${r["备注"]}` : ""}`, items: [{ kind: "whole", name: "整餐估算", quantity: "1", unit: "餐", sourceKind: "estimated", nutrition: r["记录状态"] === "正常记录" ? nutrition : { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null }, basis: "初始化：沿用历史整餐估算，具体组成见备注；没有原照片或已核实食材规格。" }] };
  });
  return { fileDigest: digest([contents, references]), originalRows, actions, decisions: { policy: "whole-meal-initialization-v1", changes, referenceCount: references.length, rows: actions.length } };
}
export async function stageMealInitialization(db: Database, userId: string, contents: string, sourceLabel: string, references: ReferenceMeal[] = []) {
  const preview = previewMealTsv(contents, references);
  const batch = await db.transaction(async tx => {
    await lockOwner(tx, userId);
    const [prior] = await tx.select().from(mealImport).where(and(eq(mealImport.userId, userId), eq(mealImport.fileDigest, preview.fileDigest)));
    if (prior) return prior;
    const [created] = await tx.insert(mealImport).values({ id: randomUUID(), userId, fileDigest: preview.fileDigest, sourceLabel, originalRows: preview.originalRows, decisions: preview.decisions, createdBy: userId }).returning(); return created;
  });
  const [current] = await db.select().from(mealOperation).where(and(eq(mealOperation.userId, userId), eq(mealOperation.importId, batch.id))).orderBy(desc(mealOperation.createdAt)).limit(1);
  if (current && current.status !== "cancelled") return displayMealOperation(current);
  return submitMealOperation(db, { userId, origin: "initialization", importId: batch.id }, { operationId: current ? `import-${batch.id}-${randomUUID()}` : `import-${batch.id}`, actions: preview.actions });
}
