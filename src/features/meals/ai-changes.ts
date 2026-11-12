import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import type { Database } from "../../db/client";
import { mealOperation, recordOperation } from "../../db/schema";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { lockOwner } from "../auth/owner-lock";
import { loadRecordReview, reviewRecordOperation } from "../records/operations";
import { aiDate, aiOperationId, normalizeSimpleFood, resolveAiDate, simpleFoodSchema, aiFoodSchema } from "./ai-preview";
import { emptyNutrition, itemSchema, metrics, publicMealInputSchema, scaled, type ItemDraft, type ItemView, type MealView, type Nutrition } from "./model";
import { digest, getMealOperation, readMealSnapshot, submitMealOperation } from "./records";

const reference = { itemId: z.string().uuid().optional(), index: z.number().int().min(0).max(49).optional() };
const updateFood = simpleFoodSchema.pick({ name: true, quantity: true, unit: true, caloriesKcal: true, caloriesKj: true, proteinG: true, carbsG: true, fatG: true, sourceKind: true, basis: true, evidenceUrl: true }).partial().extend({
  ...reference,
  quantityEffect: z.enum(["keep_total", "scale_total"]).optional().describe("自由填写的本次总量只改食量时须明确保持营养或同比缩放；食材库／每份会自动换算"),
  clearFields: z.array(z.enum(["caloriesKcal", "proteinG", "carbsG", "fatG", "basis", "evidenceUrl"])).max(6).optional(),
}).strict();
export const mealChangesSchema = z.object({
  operationId: aiOperationId,
  mealId: z.string().uuid().optional(), version: z.number().int().positive().optional(),
  previewId: z.string().uuid().optional(), revision: z.number().int().positive().optional(),
  key: z.string().max(120).optional().describe("混合预览的餐次key；仅一餐时可省略"),
  date: aiDate.optional(), timezone: z.string().max(100).optional(),
  mealType: z.string().trim().min(1).max(50).optional(),
  notes: z.string().max(12000).optional(), clearNotes: z.boolean().optional(),
  addFoods: z.array(aiFoodSchema).max(50).optional(),
  updateFoods: z.array(updateFood).max(50).optional(),
  removeFoods: z.array(z.object(reference).strict()).max(49).optional(),
}).strict();
export type MealChangesInput = z.infer<typeof mealChangesSchema>;
type MealAction = Extract<import("./model").MealAction, { kind: "save_meal" }>;
const fail = (message: string, code = "invalid_input"): never => { throw new ApiError(400, code, message); };
export function savedMealDraft(meal: MealView): MealAction {
  return {
    kind: "save_meal", id: meal.id, version: meal.version, date: meal.date, mealType: meal.mealType,
    timezone: meal.timezone, occurredAt: meal.occurredAt, notes: meal.notes, imageIds: meal.imageIds,
    items: meal.items.map(item => {
      const copy = Object.fromEntries(Object.entries(item).filter(([key]) => key in itemSchema.shape)) as ItemDraft;
      copy.originalItemId = item.id;
      if (item.foodId || item.foodSnapshot) { delete copy.nutrition; delete copy.perPortionNutrition; }
      else if (item.nutritionBasis === "per_portion") delete copy.nutrition;
      return copy;
    }),
  };
}
function targetIndex(items: ItemDraft[], target: { itemId?: string; index?: number }) {
  if ((target.itemId === undefined) === (target.index === undefined)) return fail("食物定位须填写itemId或index其中一种。");
  const index = target.index ?? items.findIndex(item => item.originalItemId === target.itemId);
  if (index < 0 || index >= items.length) return fail("食物已变化，请重新读取当前餐次。");
  return index;
}
export function applyMealChanges(original: MealAction, input: MealChangesInput, currentItems?: ItemView[], now = new Date()): MealAction {
  const meal = structuredClone(original);
  const changed = input.date !== undefined || input.timezone !== undefined || input.mealType !== undefined || input.notes !== undefined || input.clearNotes || input.addFoods?.length || input.updateFoods?.length || input.removeFoods?.length;
  if (!changed) return fail("请至少提供一项实际修改。");
  if (input.notes !== undefined && input.clearNotes) return fail("notes与clearNotes不能同时填写。");
  if (input.date !== undefined || input.timezone !== undefined) {
    const resolved = resolveAiDate(input.date ?? meal.date, input.timezone ?? meal.timezone ?? undefined, now);
    Object.assign(meal, resolved);
    // 原准确时间属于原日期；改日不制造新的准确发生时间。
    if (resolved.date !== original.date) meal.occurredAt = null;
  }
  if (input.mealType !== undefined) meal.mealType = input.mealType;
  if (input.notes !== undefined || input.clearNotes) meal.notes = input.clearNotes ? null : input.notes;
  const removed = new Set<number>(), updated = new Set<number>();
  for (const target of input.removeFoods ?? []) {
    const index = targetIndex(meal.items, target);
    if (removed.has(index)) return fail("不能重复移除同一食物。");
    removed.add(index);
  }
  for (const patch of input.updateFoods ?? []) {
    const index = targetIndex(meal.items, patch);
    if (removed.has(index) || updated.has(index)) return fail("同一食物不能重复修改或同时移除。");
    updated.add(index);
    const old = meal.items[index], view = currentItems?.[index];
    const library = !!(old.foodId || old.foodRef || old.foodDraft || view?.foodSnapshot);
    const nutrientsChanged = metrics.some(metric => patch[metric] !== undefined || patch.clearFields?.includes(metric)) || patch.caloriesKj !== undefined;
    if (library && (nutrientsChanged || patch.sourceKind !== undefined || patch.evidenceUrl !== undefined || patch.clearFields?.length || patch.quantityEffect !== undefined || patch.name !== undefined || patch.unit !== undefined && patch.unit !== old.unit)) return fail("库食材由原快照换算；更换名称、单位或营养请移除本项并添加新食物。");
    const next = { ...old };
    for (const field of ["name", "quantity", "unit", "sourceKind", "basis", "evidenceUrl"] as const) if (patch[field] !== undefined) Object.assign(next, { [field]: patch[field] });
    if (patch.quantity !== undefined) next.amountDecision = "provided";
    const quantityChanged = patch.quantity !== undefined && Number(patch.quantity) !== Number(old.quantity);
    const unitChanged = patch.unit !== undefined && patch.unit !== old.unit;
    let total = view?.nutrition ?? old.nutrition ?? emptyNutrition();
    if (!library && (nutrientsChanged || quantityChanged && old.nutritionBasis !== "per_portion" || unitChanged)) {
      const unchangedKnown = metrics.some(metric => total[metric] !== null && patch[metric] === undefined && !(metric === "caloriesKcal" && patch.caloriesKj !== undefined) && !patch.clearFields?.includes(metric));
      if ((quantityChanged || unitChanged) && unchangedKnown) {
        if (!patch.quantityEffect) return fail("本项营养是原食用量的总数：请说明改变食量后保持总营养，还是同比缩放。", "needs_input");
        if (patch.quantityEffect === "scale_total") {
          if (!old.quantity || !next.quantity || unitChanged) return fail("缺少相同单位的原食量，不能同比缩放；请提供新总营养。", "needs_input");
          total = Object.fromEntries(metrics.map(metric => [metric, total[metric] === null ? null : scaled(total[metric]!, next.quantity!, old.quantity!)])) as Nutrition;
        }
      }
      next.nutritionBasis = "consumed_total";
      delete next.perPortionNutrition;
      next.nutrition = { ...total };
      if (nutrientsChanged) {
        const normalized = normalizeSimpleFood({ name: next.name, quantity: next.quantity ?? undefined, unit: next.unit ?? undefined, amountDecision: next.amountDecision, sourceKind: patch.sourceKind ?? next.sourceKind, basis: patch.basis ?? next.basis ?? undefined, ...Object.fromEntries(metrics.filter(metric => patch[metric] !== undefined).map(metric => [metric, patch[metric]])), ...(patch.caloriesKj !== undefined ? { caloriesKj: patch.caloriesKj } : {}) }, index);
        for (const metric of metrics) if (patch[metric] !== undefined || metric === "caloriesKcal" && patch.caloriesKj !== undefined) next.nutrition[metric] = normalized.nutrition![metric];
      }
    }
    for (const field of patch.clearFields ?? []) {
      if (field in patch || field === "caloriesKcal" && patch.caloriesKj !== undefined) return fail("同一字段不能同时设置和清空。");
      if (metrics.includes(field as typeof metrics[number])) {
        next.nutritionBasis = "consumed_total"; delete next.perPortionNutrition;
        next.nutrition = { ...(next.nutrition ?? total), [field]: null };
      } else Object.assign(next, { [field]: null });
    }
    meal.items[index] = next;
  }
  meal.items = [...meal.items.filter((_, index) => !removed.has(index)), ...(input.addFoods ?? []).map(normalizeSimpleFood)];
  if (!meal.items.length) return fail("不能通过AI清空整餐；如需删除，请本人在网页操作。");
  const parsed = publicMealInputSchema.safeParse({ operationId: input.operationId, actions: [meal] });
  if (!parsed.success) return fail("修改后餐次格式无效，请检查名称、食量及营养。");
  return parsed.data.actions[0] as MealAction;
}
export async function previewMealChanges(db: Database, identity: AiIdentity, raw: MealChangesInput, now = new Date()) {
  const input = mealChangesSchema.parse(raw), fingerprint = digest({ tool: "preview_meal_changes", input });
  if (Boolean(input.mealId) === Boolean(input.previewId)) return fail("请选择已保存餐次mealId或待确认previewId其中一种。");
  if (input.mealId && (input.version === undefined || input.revision !== undefined || input.key !== undefined) || input.previewId && (input.revision === undefined || input.version !== undefined)) return fail("已保存餐次须带version；待确认预览须带revision。");
  return db.transaction(async tx => {
    await lockOwner(tx, identity.userId); await requireActiveAiToken(tx, identity, true, "meals");
    const connection = tx as unknown as Database;
    if (input.mealId) {
      const [repeated] = await tx.select().from(mealOperation).where(and(eq(mealOperation.userId, identity.userId), eq(mealOperation.operationId, input.operationId)));
      if (repeated) return { operationType: "meal" as const, ...await submitMealOperation(connection, { userId: identity.userId, origin: "ai", identity }, repeated.payload, undefined, { requestDigest: fingerprint }) };
      const meal = (await readMealSnapshot(connection, identity.userId)).meals.find(meal => meal.id === input.mealId && !meal.deletedAt);
      if (!meal) throw new ApiError(404, "not_found", "餐次不存在。");
      if (meal.version !== input.version) throw new ApiError(409, "version_conflict", "餐次已变化，请读取最新版本后修改。");
      return { operationType: "meal" as const, ...await submitMealOperation(connection, { userId: identity.userId, origin: "ai", identity }, { operationId: input.operationId, actions: [applyMealChanges(savedMealDraft(meal), input, meal.items, now)] }, undefined, { requestDigest: fingerprint }) };
    }
    const [parent] = await tx.select().from(recordOperation).where(and(eq(recordOperation.userId, identity.userId), or(eq(recordOperation.id, input.previewId!), eq(recordOperation.mealOperationId, input.previewId!))));
    const original = await getMealOperation(connection, identity.userId, parent?.mealOperationId ?? input.previewId!);
    if (original.origin !== "ai" || original.tokenId !== (identity.tokenId ?? null) || original.oauthConnectionId !== (identity.oauthConnectionId ?? null)) throw new ApiError(403, "forbidden", "只能修改原授权提交的预览。");
    const current = await loadRecordReview(connection, identity.userId, parent?.id ?? input.previewId!, parent ? undefined : "meal");
    const meals = current.rows.filter(row => row.action.kind === "save_meal");
    const row = input.key ? meals.find(row => row.key === input.key) : meals.length === 1 ? meals[0] : undefined;
    if (!row || row.action.kind !== "save_meal") return fail("请指定餐次key。");
    // 重试先由协调器查账，不再次按已修改的索引合并，避免重复增加食物。
    const repeated = current.rows.flatMap(row => row.aiEdits ?? []).some(edit => edit.operationId === input.operationId);
    if (!repeated && (row.excluded || row.persisted)) return fail("请指定本次尚未保存、未取消的餐次key。");
    const childId = input.previewId === original.id;
    if (!repeated && input.revision !== (childId ? original.revision : current.revision)) throw new ApiError(409, "review_changed", "预览已变化，请读取最新revision后再修改。");
    const action = repeated ? row.action : applyMealChanges(row.action, input, row.meal?.meal?.items, now);
    const operation = await reviewRecordOperation(connection, identity.userId, parent?.id ?? input.previewId!, { kind: "update", key: row.key, revision: childId ? current.revision : input.revision!, action }, parent ? undefined : "meal", { identity, operationId: input.operationId, digest: fingerprint });
    return { operationType: "record" as const, ...operation, repeated: "repeated" in operation && operation.repeated === true, rows: operation.rows.filter(item => item.key === row.key), needsUserInput: operation.needsUserInput.filter(item => item.key === row.key), foods: [], energySnapshot: undefined, mealOperation: undefined, energyOperation: undefined };
  });
}
