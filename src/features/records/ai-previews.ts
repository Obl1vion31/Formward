import { z } from "zod";
import { and, eq, inArray, or } from "drizzle-orm";
import type { Database } from "../../db/client";
import { recordOperation, mealOperation, measurementOperation, mealImage } from "../../db/schema";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { lockOwner } from "../auth/owner-lock";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { aiOperationId, mealPreviewSchema, mealPreviewOperation } from "../meals/ai-preview";
import { applyMealChanges, mealChangesSchema, savedMealDraft } from "../meals/ai-changes";
import { foodDraftSchema, itemSchema } from "../meals/model";
import { digest, readMealSnapshot } from "../meals/records";
import { energyPreviewSchema, energyPreviewOperation } from "../activities/ai-preview";
import { trainingActionSchemas } from "../training/ai-model";
import { publicRecordInputSchema, recordItemSchema, category, type RecordInput, type RecordAction, type RecordReviewView } from "./model";
import { getRecordOperation, loadRecordReview, submitRecordOperation, extendAiRecordPreview } from "./operations";
import { recordAiResponse } from "./ai-response";

const key = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const common = { operationId: aiOperationId, timezone: z.string().max(100).optional() };
const meal = mealPreviewSchema.omit({ operationId: true }).extend({ key: key.optional() });
const food = foodDraftSchema.extend({ key: key.optional() });
const body = recordItemSchema.options[0].extend({ key: key.optional() });
const savedMealPatch = mealChangesSchema.omit({ operationId: true, previewId: true, revision: true, key: true }).extend({
  key: key.optional(), mealId: z.string().uuid(), version: z.number().int().positive(),
  imageIds: z.array(z.string().uuid()).max(8).optional(),
  addImageIds: z.array(z.string().uuid()).max(8).optional(),
});
export const previewMeasurementsSchema = z.object({ ...common, items: z.array(body).min(1).max(100) }).strict();
export const previewMealsSchema = z.object({ ...common, meals: z.array(meal).min(1).max(100) }).strict();
export const previewFoodsSchema = z.object({ ...common, foods: z.array(food).min(1).max(100) }).strict();
export const previewTrainingSchema = z.object({ ...common, items: z.array(z.union(trainingActionSchemas.map(schema => schema.extend({ key })))).min(1).max(100) }).strict();
export const previewEnergySchema = z.object({ ...common, days: z.array(energyPreviewSchema.omit({ operationId: true })).min(1).max(100) }).strict();
export const previewMealChangesSchema = z.object({ ...common, changes: z.array(savedMealPatch).min(1).max(100) }).strict();
// 组合入口仍用完整营养结构，但库引用／同批引用／自由项保持互斥，不再暗示混填。
const fullFoodBase = itemSchema.pick({ name:true, kind:true, quantity:true, unit:true, amountDecision:true, basis:true, originalItemId:true }).extend({kind:z.enum(["food","misc","whole"]).default("food")});
const libraryItem = fullFoodBase.extend({foodId:z.string().uuid(),foodVersion:z.number().int().positive()}).strict();
const batchItem = fullFoodBase.extend({foodRef:key}).strict();
const freeItem = itemSchema.omit({foodId:true,foodVersion:true,foodRef:true,foodDraft:true}).extend({kind:z.enum(["food","misc","whole"]).default("food")}).strict();
const v2RecordItems = z.union(publicRecordInputSchema.shape.items.element.options.map(schema => schema.shape.kind.value === "save_meal" ? schema.extend({items:z.array(z.union([libraryItem,batchItem,freeItem])).min(1).max(50)}) : schema));
export const previewBundleSchema = publicRecordInputSchema.omit({ previewId: true, revision: true }).extend({items:z.array(v2RecordItems).min(1).max(100)});
export const aiPreviewCreateNames = ["preview_measurements", "preview_meals", "preview_foods", "preview_training", "preview_energy", "preview_meal_changes", "preview_record_bundle"] as const;
export type AiPreviewCreateName = typeof aiPreviewCreateNames[number];
export const aiPreviewSchemas = {
  preview_measurements: previewMeasurementsSchema, preview_meals: previewMealsSchema, preview_foods: previewFoodsSchema,
  preview_training: previewTrainingSchema, preview_energy: previewEnergySchema,
  preview_meal_changes: previewMealChangesSchema, preview_record_bundle: previewBundleSchema,
};

/** 按功能而非OAuth scope区分组合：新餐与历史修改不同，模板与排期同属训练。 */
export function previewTaskKinds(items: readonly {kind:string;id?:unknown}[]) {
  return new Set(items.map(item => item.kind === "save_meal" ? item.id ? "meal_changes" : "new_meals" : item.kind === "save_record" ? "body" : item.kind === "save_food" ? "foods" : item.kind === "save_training_template" || item.kind === "schedule_training" ? "training" : "energy"));
}
function images(action: RecordAction, patch: { imageIds?: string[]; addImageIds?: string[] }) {
  if (action.kind !== "save_meal" && action.kind !== "save_food") return action;
  if (patch.imageIds !== undefined && patch.addImageIds !== undefined) throw new ApiError(400, "invalid_input", "imageIds替换与addImageIds追加只能选一种。");
  if (patch.imageIds === undefined && patch.addImageIds === undefined) return action;
  const imageIds = [...new Set(patch.imageIds ?? [...(action.imageIds ?? []), ...(patch.addImageIds ?? [])])];
  if (imageIds.length > 8) throw new ApiError(400, "invalid_input", "每项最多8张照片。");
  return { ...action, imageIds };
}
export async function createAiPreview(db: Database, identity: AiIdentity, name: AiPreviewCreateName, raw: unknown, now = new Date()) {
  return db.transaction(async tx => {
    await lockOwner(tx, identity.userId);
    const connection = tx as unknown as Database;
    const parsed = aiPreviewSchemas[name].parse(raw);
    if (name === "preview_record_bundle" && previewTaskKinds(previewBundleSchema.parse(parsed).items).size < 2) throw new ApiError(400, "single_task_requires_specific_tool", "组合入口至少包含两类功能动作；单一功能使用专用入口。");
    // 相对日期的原参数固定在首次摘要；跨零点重试仍读取同一预览。
    const requestDigest = digest(parsed);
    const [prior] = await tx.select().from(recordOperation).where(and(eq(recordOperation.userId, identity.userId), eq(recordOperation.operationId, parsed.operationId)));
    if (prior) return submitRecordOperation(connection, identity, prior.payload, undefined, { requestDigest });
    let input: RecordInput;
    switch (name) {
      case "preview_meals": {
        const value = previewMealsSchema.parse(parsed);
        input = { ...value, items: value.meals.map(({ key, ...entry }, index) => ({
          key: key ?? `meal-${index}`, ...mealPreviewOperation({ ...entry, timezone: entry.timezone ?? value.timezone, operationId: value.operationId }, now).actions[0],
        })) } as RecordInput;
        break;
      }
      case "preview_foods": {
        const value = previewFoodsSchema.parse(parsed);
        input = { ...value, items: value.foods.map(({ key, ...entry }, index) => ({ key: key ?? `food-${index}`, kind: "save_food", ...entry })) };
        break;
      }
      case "preview_measurements": {
        const value = previewMeasurementsSchema.parse(parsed);
        input = { ...value, items: value.items.map((item, index) => ({ ...item, key: item.key ?? `body-${index}` })) };
        break;
      }
      case "preview_energy": {
        const value = previewEnergySchema.parse(parsed);
        input = { operationId: value.operationId, timezone: value.timezone, items: value.days.flatMap((day, index) => energyPreviewOperation({ ...day, timezone: day.timezone ?? value.timezone, operationId: value.operationId }, now).items.map(item => ({ ...item, key: `energy-${index}-${item.key}` }))) };
        break;
      }
      case "preview_meal_changes": {
        const value = previewMealChangesSchema.parse(parsed);
        await requireActiveAiToken(tx, identity, true, "meals");
        const meals = (await readMealSnapshot(connection, identity.userId)).meals;
        input = { operationId: value.operationId, timezone: value.timezone, items: value.changes.map(({ key, imageIds, addImageIds, ...patch }, index) => {
          const saved = meals.find(meal => meal.id === patch.mealId && !meal.deletedAt);
          if (!saved) throw new ApiError(404, "not_found", "餐次不存在或不属于本账号。");
          if (saved.version !== patch.version) throw new ApiError(409, "version_conflict", "餐次已变化，请查询最新版本。");
          const hasPatch = Object.keys(patch).some(field => !["mealId", "version"].includes(field));
          const action = hasPatch ? applyMealChanges(savedMealDraft(saved), { ...patch, operationId: value.operationId }, saved.items, now) : savedMealDraft(saved);
          if (!hasPatch && imageIds === undefined && addImageIds === undefined) throw new ApiError(400, "invalid_input", "请提供要修改的内容。");
          return { key: key ?? `meal-${index}`, ...images(action, { imageIds, addImageIds }) };
        }) } as RecordInput;
        break;
      }
      case "preview_training": input = previewTrainingSchema.parse(parsed); break;
      case "preview_record_bundle": {
        input = publicRecordInputSchema.parse(previewBundleSchema.parse(parsed));
        if (previewTaskKinds(input.items).size < 2) throw new ApiError(400, "single_task_requires_specific_tool", "组合入口至少包含两类功能动作。单独记餐用preview_meals，身体用preview_measurements，食材库用preview_foods，消耗用preview_energy，训练用preview_training；修改已有草稿用update_preview。");
        break;
      }
    }
    // 不把包装层字段写进业务请求；全部初始预览共用同一请求唯一约束。
    return submitRecordOperation(connection, identity, { operationId: input.operationId, timezone: input.timezone, items: input.items }, undefined, { requestDigest });
  });
}

async function resolve(db: Database, identity: AiIdentity, id: string) {
  const [parent] = await db.select().from(recordOperation).where(and(eq(recordOperation.userId, identity.userId), or(eq(recordOperation.id, id), eq(recordOperation.mealOperationId, id), eq(recordOperation.measurementOperationId, id), eq(recordOperation.energyOperationId, id))));
  if (parent) return { id: parent.id, source: undefined, operation: await loadRecordReview(db, identity.userId, parent.id) };
  const [meal] = await db.select({ id: mealOperation.id }).from(mealOperation).where(and(eq(mealOperation.userId, identity.userId), eq(mealOperation.id, id)));
  if (meal) return { id, source: "meal" as const, operation: await loadRecordReview(db, identity.userId, id, "meal") };
  const [body] = await db.select({ id: measurementOperation.id }).from(measurementOperation).where(and(eq(measurementOperation.userId, identity.userId), eq(measurementOperation.id, id)));
  if (body) return { id, source: "body" as const, operation: await loadRecordReview(db, identity.userId, id, "body") };
  throw new ApiError(404, "not_found", "预览不存在或不属于当前账号。");
}
export async function getAiPreview(db: Database, identity: AiIdentity, id: string) {
  const target = await resolve(db, identity, id);
  if (!target.source) return getRecordOperation(db, identity, target.id);
  await requireActiveAiToken(db as unknown as Parameters<typeof requireActiveAiToken>[0], identity, false, target.source === "meal" ? "meals" : undefined);
  return target.operation;
}
const mealPatch = mealChangesSchema.omit({ operationId: true, mealId: true, version: true, previewId: true, revision: true, key: true }).extend({
  kind: z.literal("save_meal"), key, imageIds: z.array(z.string().uuid()).max(8).optional(), addImageIds: z.array(z.string().uuid()).max(8).optional(),
});
const mutable = <T extends z.ZodObject>(schema: T) => schema.omit(Object.fromEntries(["key", "kind", "id", "version", "recordId"].filter(field => field in schema.shape).map(field => [field, true])) as never).partial();
const otherPatches = publicRecordInputSchema.shape.items.element.options.filter(schema => schema.shape.kind.value !== "save_meal").map(schema => mutable(schema).extend({ kind: schema.shape.kind, key, ...(schema.shape.kind.value === "save_food" ? { addImageIds: z.array(z.string().uuid()).max(8).optional() } : {}) }).strict());
export const updatePreviewSchema = z.object({
  operationId: aiOperationId, id: z.string().uuid(), revision: z.number().int().positive(),
  changes: z.array(z.union([mealPatch, ...otherPatches])).max(100).optional().describe("按key仅提供要改的字段，kind沿用返回项目的kind；save_meal使用addFoods/updateFoods；不传历史对象id/version"),
  appendItems: z.array(v2RecordItems).min(1).max(100).optional().describe("确实遗漏的新项目，使用新的key追加到原草稿；不替换已有key，不重复列出原项目"),
}).strict();
export async function updateAiPreview(db: Database, identity: AiIdentity, raw: unknown, now = new Date(), grantedScopes?: readonly string[]) {
  const input = updatePreviewSchema.parse(raw), requestDigest = digest(input);
  if (!input.changes?.length && !input.appendItems?.length) throw new ApiError(400, "invalid_input", "请提供局部修改或需要追加的项目。");
  return db.transaction(async tx => {
    await lockOwner(tx, identity.userId);
    const connection = tx as unknown as Database, target = await resolve(connection, identity, input.id);
    const additions = input.appendItems?.length ? publicRecordInputSchema.parse({operationId:input.operationId,items:input.appendItems}).items : [];
    const scopes = new Set([...target.operation.rows.map(row => category(row.action)), ...additions.map(category)].map(domain => (domain === "body" ? "measurements" : domain === "foods" ? "meals" : domain) + ":write"));
    if (grantedScopes && [...scopes].some(scope => !grantedScopes.includes(scope))) throw new ApiError(403, "insufficient_scope", "当前访问凭据缺少原草稿或追加项目的写入权限。");
    const edits = target.operation.rows.flatMap(row => row.aiEdits ?? []).filter(edit => edit.operationId === input.operationId);
    // 重试必须先查修改账，不能再次按改变后的索引追加食物。
    if (edits.length) {
      if (edits.some(edit => edit.digest !== requestDigest)) throw new ApiError(409, "request_conflict", "同一修改请求不能更换内容。");
      return extendAiRecordPreview(connection, identity, target.id, target.source, input.revision, [], [], input.operationId, requestDigest);
    }
    const changed = new Set<string>();
    const actions = (input.changes ?? []).map(patch => {
      const row = target.operation.rows.find(row => row.key === patch.key);
      if (!row || row.excluded || row.persisted || changed.has(patch.key)) throw new ApiError(400, "invalid_input", "只能修改不重复的、尚未保存的原项目key。");
      changed.add(patch.key);
      let action: RecordAction;
      if (patch.kind === "save_meal") {
        if (row.action.kind !== "save_meal") throw new ApiError(400, "invalid_input", "此key不是餐次，不能更换项目类型。");
        const { key: _key, kind: _kind, imageIds, addImageIds, ...values } = mealPatch.parse(patch); void _key; void _kind;
        action = Object.keys(values).length ? applyMealChanges(row.action, { ...values, operationId: input.operationId }, row.meal?.meal?.items, now) : row.action;
        action = images(action, { imageIds, addImageIds });
      } else {
        if (row.action.kind !== patch.kind) throw new ApiError(400, "invalid_input", "不能更换项目类型。");
        const { key: _key, kind: _kind, ...values } = patch; void _key; void _kind;
        const addImageIds = "addImageIds" in values ? values.addImageIds as string[] : undefined;
        delete (values as Record<string, unknown>).addImageIds;
        action = images({ ...row.action, ...values } as RecordAction, addImageIds ? { addImageIds } : {});
      }
      return { key: row.key, ...action };
    });
    const imageIds = [...new Set(actions.flatMap(action => action.kind === "save_meal" || action.kind === "save_food" ? action.imageIds ?? [] : []))];
    if (imageIds.length) {
      const owned = await tx.select({ id: mealImage.id }).from(mealImage).where(and(eq(mealImage.userId, identity.userId), inArray(mealImage.id, imageIds)));
      if (owned.length !== imageIds.length) throw new ApiError(403, "image_owner", "照片不存在或不属于当前账号，原草稿没有修改。");
    }
    return extendAiRecordPreview(connection, identity, target.id, target.source, input.revision, actions, additions, input.operationId, requestDigest);
  });
}
export function aiPreviewResponse(operation: RecordReviewView & { repeated?: boolean }, view: "summary" | "status" = "summary") {
  const result = recordAiResponse(operation, view);
  // V2统一预览无需meal.meal两层包装；业务原视图及旧HTTP返回不变。
  return { ...result, previewRef: operation.id, ...(result.rows ? { rows: result.rows.map(row => {
    const { meal, ...rest } = row;
    return { ...rest, ...(meal ? { ...(meal.meal ? {meal:meal.meal} : {}), ...(meal.food ? {food:meal.food} : {}), error:meal.error, warnings:meal.warnings, needsUserInput:meal.needsUserInput } : {}) };
  }) } : {}) };
}
