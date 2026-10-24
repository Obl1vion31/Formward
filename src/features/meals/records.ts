import { aiActionAllowed, requireAiUpserts } from "../auth/ai-write-policy";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, ne, inArray } from "drizzle-orm";
import type { Database } from "../../db/client";
import { food, meal, mealEvent, mealImport, mealItem, mealOperation, mealImage, mealImageLink } from "../../db/schema";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { lockOwner, type Transaction } from "../auth/owner-lock";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { calendarOrdinal } from "../measurements/trend";
import { validateMeasurementTimezone } from "../measurements/timezone";
import { localMeasurementDate } from "../measurements/entry-state";
import { emptyNutrition, metrics, nutritionFor, operationSchema, sumNutrition, missingMealImages, type FoodDraft, type FoodView, type ItemDraft, type ItemView, type MealAction, type MealInput, type MealOperationView, type MealSnapshot, type MealView, type Nutrition, type PreviewRow } from "./model";
import { foodDescriptionProblem } from "./food-description";
import { readMealDayViews, invalidateMealDays } from "./day-status";

export type MealActor = { userId: string; origin: "manual" | "ai" | "initialization"; identity?: AiIdentity; importId?: string };
// PostgreSQL jsonb会重排对象字段；请求和保存后的原始快照使用相同的稳定摘要。
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") { const record = value as Record<string, unknown>; return Object.fromEntries(Object.keys(record).sort().filter(k => record[k] !== undefined).map(k => [k, canonical(record[k])])); }
  return value;
}
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
function parse(raw: unknown): MealInput {
  const result = operationSchema.safeParse(raw);
  if (!result.success) throw new ApiError(400, "invalid_input", `饮食数据无效：${result.error.issues[0]?.path.join(".")} ${result.error.issues[0]?.message}`);
  if (Buffer.byteLength(JSON.stringify(result.data)) > 65536) throw new ApiError(413, "invalid_input", "单次操作最多64 KiB，请分批提交。");
  return result.data;
}
function validateFoodDescriptions(input: MealInput) {
  for (const action of input.actions) {
    const foods = action.kind === "save_food" ? [action] : action.kind === "save_meal" ? action.items.flatMap(item => item.foodDraft ? [item.foodDraft] : []) : [];
    for (const food of foods) {
      const problem = foodDescriptionProblem(food);
      if (problem) throw new ApiError(400, "food_description", problem);
    }
  }
}
const norm = (s?: string | null) => (s ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export const foodIdentity = (f: FoodDraft) => digest([norm(f.name), norm(f.brand), norm(f.preparation), Number(f.baseQuantity), norm(f.unit)]);
const nutrients = (row: { caloriesKcal: string | null; proteinG: string | null; carbsG: string | null; fatG: string | null }): Nutrition => Object.fromEntries(metrics.map(m => [m, row[m]])) as Nutrition;
export async function readMealSnapshot(db: Pick<Database, "select">, userId: string): Promise<MealSnapshot> {
  const foods = (await db.select().from(food).where(eq(food.userId, userId)).orderBy(desc(food.updatedAt))).map(row => ({ id: row.id, version: row.version, category: row.category as FoodDraft["category"], name: row.name, brand: row.brand, preparation: row.preparation, baseQuantity: row.baseQuantity, unit: row.unit, nutrition: nutrients(row), sourceKind: row.sourceKind as FoodDraft["sourceKind"], basis: row.basis, evidenceUrl: row.evidenceUrl, deletedAt: row.deletedAt?.toISOString() ?? null }));
  const meals = await db.select().from(meal).where(eq(meal.userId, userId)).orderBy(desc(meal.localDate), desc(meal.createdAt), asc(meal.sourceRow), asc(meal.id));
  const items = await db.select().from(mealItem).where(and(eq(mealItem.userId, userId), isNull(mealItem.deletedAt))).orderBy(mealItem.position);
  const links = await db.select().from(mealImageLink).where(eq(mealImageLink.userId,userId)).orderBy(mealImageLink.position);
  for (const f of foods) Object.assign(f,{imageIds:links.filter(l=>l.foodId===f.id).map(l=>l.imageId)});
  const dayStates=await readMealDayViews(db,userId,meals);
  return { foods, meals: meals.map(row => {
    const entries: ItemView[] = items.filter(i => i.mealId === row.id).map(i => ({ id: i.id, kind: i.kind as ItemDraft["kind"], name: i.name, quantity: i.quantity, amountDecision:(i.amountDecision??undefined) as ItemDraft["amountDecision"], ...(i.reviewExplanation ? { reviewExplanation: i.reviewExplanation } : {}), unit: i.unit, ...(i.foodId ? { foodId: i.foodId, foodVersion: i.foodSnapshot?.version } : {}), ...(i.foodSnapshot ? { foodSnapshot: i.foodSnapshot } : {}), nutrition: nutrients(i), sourceKind: i.sourceKind as ItemDraft["sourceKind"], basis: i.basis, evidenceUrl: i.evidenceUrl }));
    return { imageIds:links.filter(l=>l.mealId===row.id).map(l=>l.imageId), id: row.id, version: row.version, day:dayStates.get(row.localDate), date: row.localDate, mealType: row.mealType, timezone: row.timezone, occurredAt: row.occurredAt?.toISOString() ?? null, notes: row.notes, items: entries, totals: sumNutrition(entries.map(i => i.nutrition)), source: row.source as MealView["source"], deletedAt: row.deletedAt?.toISOString() ?? null };
  }) };
}
export async function searchFoods(db: Database, userId: string, query = "") {
  if (query.length > 200) throw new ApiError(400, "invalid_input", "搜索文字过长。");
  return (await readMealSnapshot(db, userId)).foods.filter(f => !f.deletedAt && norm(`${f.name} ${f.brand ?? ""} ${f.preparation ?? ""}`).includes(norm(query))).slice(0, 100);
}
function evidenceValid(f: { sourceKind: string; basis?: string | null; evidenceUrl?: string | null }) {
  if (["label", "composition_table"].includes(f.sourceKind) && !f.basis?.trim() && !f.evidenceUrl) throw new ApiError(400, "source_required", "标签或成分表数据请附转录说明或来源链接。");
}
function prepareFood(input: FoodDraft, state: MealSnapshot): FoodView {
  evidenceValid(input);
  const old = input.id ? state.foods.find(f => f.id === input.id) : undefined;
  if (input.id && (!old || old.deletedAt)) throw new ApiError(404, "not_found", "食材不存在或已停用。");
  if (old && old.version !== input.version) throw new ApiError(409, "version_conflict", "食材已被修改，请刷新后重试。");
  const duplicate = state.foods.find(f => f.id !== input.id && foodIdentity(f) === foodIdentity(input));
  if (duplicate) throw new ApiError(409, "duplicate_food", `已有同规格食材“${duplicate.name}”，请选择已有条目${duplicate.deletedAt ? "或恢复它" : ""}。`);
  return { ...input, category: input.category ?? old?.category ?? "ingredient", imageIds:input.imageIds ?? old?.imageIds ?? [], id: old?.id ?? randomUUID(), version: (old?.version ?? 0) + 1, deletedAt: null };
}
function prepareItem(input: ItemDraft, state: MealSnapshot, previous?: ItemView): ItemView {
  if (input.foodRef) throw new ApiError(400, "invalid_input", "foodRef 仅用于统一记录提交。");
  if(input.amountDecision==="estimate_accepted"&&!input.basis?.trim())throw new ApiError(400,"amount_basis_required","请填写已接受的食用量估算依据。");
  if(input.amountDecision==="unknown_accepted"&&input.quantity)throw new ApiError(400,"invalid_input","明确未知食用量时quantity须为null。");
  if (input.foodId && input.foodDraft) throw new ApiError(400, "invalid_input", "请选择已有食材或新食材中的一种。");
  if (input.kind !== "food" && (input.foodId || input.foodDraft)) throw new ApiError(400, "invalid_input", "杂和整餐估算直接填写营养，不引用食材库。");
  const archived = previous?.foodSnapshot && !previous.foodId && !input.foodDraft && (!input.foodId || input.foodId === previous.foodSnapshot.id);
  if (input.foodId || input.foodDraft || archived) {
    if (input.nutrition) throw new ApiError(400, "invalid_input", "食材库营养会自动换算，无需另填餐项营养。");
    if (input.foodDraft?.id) throw new ApiError(400, "invalid_input", "已有食材请使用foodId引用。");
    const historical = previous?.foodSnapshot && (previous.foodId === input.foodId || archived) && (archived || previous.foodSnapshot.version === input.foodVersion) ? previous.foodSnapshot : undefined;
    const entry = archived ? historical : input.foodId ? historical ?? state.foods.find(f => f.id === input.foodId && !f.deletedAt) : prepareFood(input.foodDraft!, state);
    if (!entry) throw new ApiError(404, "not_found", "食材不属于当前账号或已停用。");
    if (input.foodId && !archived && entry.version !== input.foodVersion) throw new ApiError(409, "version_conflict", "食材规格已更新，请重新选择。");
    if ((!input.quantity && input.amountDecision !== "unknown_accepted") || input.unit !== entry.unit) throw new ApiError(400, "unit_required", `请选择食用量，单位须为“${entry.unit}”。`);
    const nutrition = input.quantity ? nutritionFor(entry, input.quantity) : emptyNutrition();
    if (Object.values(nutrition).some(v => v !== null && Number(v) > 1000000)) throw new ApiError(400, "invalid_input", "换算结果超出有效范围。");
    return { ...input, id: previous?.id, name: entry.name, foodId: archived ? undefined : entry.id, foodVersion: archived ? undefined : entry.version, foodSnapshot: entry, nutrition, sourceKind: entry.sourceKind, basis: input.amountDecision==="estimate_accepted"?input.basis:entry.basis, evidenceUrl: entry.evidenceUrl };
  }
  evidenceValid(input);
  return { ...input, id: previous?.id, nutrition: input.nutrition ?? emptyNutrition() };
}
function mealFingerprint(m: Pick<MealView, "date" | "mealType" | "notes" | "items">) {
  return digest([m.date, norm(m.mealType), norm(m.notes), m.items.map(i => [i.kind, norm(i.name), i.quantity == null ? null : Number(i.quantity), norm(i.unit), metrics.map(k => i.nutrition[k] === null ? null : Number(i.nutrition[k]))])]);
}
export type MealPlanner = (input: MealInput, state: MealSnapshot, origin: MealActor["origin"]) => PreviewRow[];
export function prepareMealActions(input: MealInput, state: MealSnapshot, origin: MealActor["origin"]): PreviewRow[] {
  const working: MealSnapshot = structuredClone(state), targets = new Set<string>();
  return input.actions.map(action => {
    const row: PreviewRow = { action, duplicateIds: [], warnings: [], ...(action.id ? { before: structuredClone((action.kind.endsWith("food") ? state.foods : state.meals).find(r => r.id === action.id)) } : {}) };
    try {
      if (action.id) { if (targets.has(action.id)) throw new ApiError(400, "invalid_input", "一批操作不能重复修改同一记录。"); targets.add(action.id); }
      if (action.kind === "save_food") {
        row.food = prepareFood(action, working);
        working.foods = [...working.foods.filter(f => f.id !== row.food!.id), row.food];
      } else if (action.kind === "save_meal") {
        calendarOrdinal(action.date);
        if (action.timezone) validateMeasurementTimezone(action.timezone);
        if (action.occurredAt && (!action.timezone || localMeasurementDate(new Date(action.occurredAt), action.timezone) !== action.date)) throw new ApiError(400, "invalid_time", "准确时间须提供时区并与餐次日期一致。");
        const old = action.id ? working.meals.find(m => m.id === action.id) : undefined;
        if (action.id && (!old || old.deletedAt)) throw new ApiError(404, "not_found", "餐次不存在或已删除。");
        if (old && old.version !== action.version) throw new ApiError(409, "version_conflict", "餐次已被修改，请刷新后重试，草稿会保留。");
        if (action.items.some(i => i.kind === "whole") && action.items.length !== 1) throw new ApiError(400, "whole_meal_conflict", "整餐估算须独立记录，不能再叠加具体食物。");
        if (action.items.filter(i => i.kind === "misc").length > 1) throw new ApiError(400, "invalid_input", "每餐使用一个杂项，合并剩余食物的描述。");
        const items = action.items.map(i => {
          const previous = i.originalItemId ? old?.items.find(item => item.id === i.originalItemId) : old?.items.find(item => i.foodId && (item.foodId === i.foodId || (!item.foodId && item.foodSnapshot?.id === i.foodId)) && item.foodSnapshot?.version === i.foodVersion);
          if (i.originalItemId && !previous) throw new ApiError(400, "invalid_item", "餐项不属于当前餐次或版本，请刷新后重试。");
          const entry = prepareItem(i, working, previous);
          if (entry.foodDraft && entry.foodSnapshot) working.foods.push(entry.foodSnapshot);
          return entry;
        });
        row.meal = { ...action, imageIds:action.imageIds ?? old?.imageIds ?? [], id: old?.id ?? randomUUID(), version: (old?.version ?? 0) + 1, items, totals: sumNutrition(items.map(i => i.nutrition)), source: old?.source ?? origin, deletedAt: null };
        row.duplicateIds = working.meals.filter(m => !m.deletedAt && m.id !== action.id && mealFingerprint(m) === mealFingerprint(row.meal!)).map(m => m.id);
        if (row.duplicateIds.length && !action.allowDuplicate) row.error = "发现内容相同的餐次。确认是另一次进食后勾选“仍然新增”，或取消重复录入。";
        if (items.some(i => metrics.some(k => i.nutrition[k] === null))) row.warnings.push("部分营养未知，合计仅包含已知数据。");
        if (items.some(i => i.kind === "misc")) row.warnings.push("杂只包含未单列的剩余食物。");
        if (action.photoReview || (origin === "ai" && (row.meal.imageIds?.length || action.expectedImageCount))) {
          const review=action.photoReview;
          const requirements={dateConfirmed:"请确认是哪一天进食。",mealTypeConfirmed:"请确认是哪一餐。",identityConfirmed:"请核对不确定的食物、品牌和生熟做法。",amountConfirmed:"请确认实际食用份量；整份须由用户明确确认。",cookingConfirmed:"请核对额外烹饪油和酱料，未知先询问再接受估算或留空。"};
          row.needsUserInput=[...Object.entries(requirements).filter(([key])=>!review?.[key as keyof typeof requirements]).map(([,question])=>question),...(review?.questions??[])];
          if(row.needsUserInput.length) row.error="照片信息尚未核对，请先补充或确认待核对项。";
        }
        working.meals = [...working.meals.filter(m => m.id !== row.meal!.id), row.meal];
      } else {
        const isFood = action.kind.endsWith("food"), entries = isFood ? working.foods : working.meals;
        const existing = entries.find(e => e.id === action.id);
        if (!existing) throw new ApiError(404, "not_found", "记录不属于当前账号。");
        if (existing.version !== action.version) throw new ApiError(409, "version_conflict", "记录已改变，请刷新后重试。");
        const deleting = action.kind.startsWith("delete");
        if (Boolean(existing.deletedAt) === deleting) throw new ApiError(409, "state_conflict", "记录状态已改变，请刷新。");
        const next = { ...existing, version: existing.version + 1, deletedAt: deleting ? new Date().toISOString() : null };
        Object.assign(existing, next);
        if (isFood) row.food = next as FoodView; else row.meal = next as MealView;
      }
    } catch (error) { row.error = error instanceof ApiError || (error instanceof Error && !("query" in error)) ? error.message : "无法生成此项预览。"; }
    return row;
  });
}
const stateDigest = (state: MealSnapshot) => digest([state.foods.map(f => [f.id, f.version, f.deletedAt]).sort(), state.meals.map(m => [m.id, m.version, m.deletedAt]).sort()]);
export function displayMealOperation(row: typeof mealOperation.$inferSelect): MealOperationView {
  const status = row.status === "pending" && row.expiresAt && row.expiresAt <= new Date() ? "expired" : row.status;
  const healthy = status === "pending" && row.preview.filter(p => !p.excluded).every(p => !p.error && !p.needsUserInput?.length), missingImages = missingMealImages(row.preview);
  return { id: row.id, revision: row.revision, origin: row.origin, status, rows: row.preview, canConfirm: healthy && !missingImages, canConfirmWithoutImages: healthy && missingImages > 0, missingImages, needsUserInput: row.preview.flatMap((p,index)=>p.needsUserInput?.length ? [{index,questions:p.needsUserInput}] : []), createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null, confirmationPath: `/dashboard/meals/review/${row.id}`, result: row.result };
}
export async function getMealOperation(db: Pick<Database, "select">, userId: string, id: string) {
  const [row] = await db.select().from(mealOperation).where(and(eq(mealOperation.userId, userId), eq(mealOperation.id, id)));
  if (!row) throw new ApiError(404, "not_found", "饮食审核不存在。");
  return row;
}
export async function listMealOperations(db: Database, userId: string) {
  return (await db.select().from(mealOperation).where(and(eq(mealOperation.userId, userId), ne(mealOperation.origin, "manual"))).orderBy(desc(mealOperation.createdAt)).limit(30)).map(displayMealOperation);
}
export async function submitMealOperation(db: Database, actor: MealActor, raw: unknown, planner: MealPlanner = prepareMealActions) {
  const input = parse(raw), hash = digest(input);
  if (actor.origin === "ai") requireAiUpserts(input.actions);
  return db.transaction(async tx => {
    await lockOwner(tx, actor.userId);
    if (actor.origin === "ai") {
      if (!actor.identity || actor.identity.userId !== actor.userId) throw new ApiError(401, "invalid_token", "缺少饮食授权。");
      await requireActiveAiToken(tx, actor.identity, true, "meals");
    }
    if (actor.origin === "initialization") {
      const [batch] = await tx.select().from(mealImport).where(and(eq(mealImport.id, actor.importId!), eq(mealImport.userId, actor.userId)));
      if (!batch) throw new ApiError(404, "not_found", "初始化批次不存在。");
      const [active] = await tx.select().from(mealOperation).where(and(eq(mealOperation.userId, actor.userId), eq(mealOperation.importId, batch.id), ne(mealOperation.status, "cancelled"))).orderBy(desc(mealOperation.createdAt)).limit(1);
      if (active) {
        if (digest(active.payload.actions) !== digest(input.actions)) throw new ApiError(409, "request_conflict", "同一初始化批次不能替换原始内容。");
        return { ...displayMealOperation(active), repeated: true };
      }
    }
    const [prior] = await tx.select().from(mealOperation).where(and(eq(mealOperation.userId, actor.userId), eq(mealOperation.operationId, input.operationId)));
    if (prior) {
      if (prior.requestDigest !== hash || prior.origin !== actor.origin || prior.tokenId !== (actor.identity?.tokenId ?? null) || prior.oauthConnectionId !== (actor.identity?.oauthConnectionId ?? null) || prior.importId !== (actor.importId ?? null)) throw new ApiError(409, "request_conflict", "同一请求标识不能用于不同内容或授权。");
      return { ...displayMealOperation(prior), repeated: true };
    }
    validateFoodDescriptions(input);
    const state = await readMealSnapshot(tx, actor.userId), preview = planner(input, state, actor.origin);
    await validatePreviewImages(tx,actor.userId,preview);
    const [row] = await tx.insert(mealOperation).values({ id: randomUUID(), userId: actor.userId, operationId: input.operationId, origin: actor.origin, tokenId: actor.identity?.tokenId ?? null, oauthConnectionId: actor.identity?.oauthConnectionId ?? null, importId: actor.importId ?? null, requestDigest: hash, snapshotDigest: stateDigest(state), payload: input, draft: input, preview, expiresAt: actor.origin === "ai" ? new Date(Date.now() + 15 * 60000) : null }).returning();
    return { ...displayMealOperation(row), repeated: false };
  });
}
export async function reviseMealOperation(db: Database, userId: string, id: string, revision: number, actions?: MealAction[], planner: MealPlanner = prepareMealActions) {
  return db.transaction(async tx => {
    await lockOwner(tx, userId); const row = await getMealOperation(tx, userId, id);
    if (row.status !== "pending" || row.revision !== revision) throw new ApiError(409, "version_conflict", "审核已改变，请重新打开。");
    await checkCredential(tx, row);
    const input = parse({ operationId: row.draft.operationId, actions: actions ?? row.draft.actions });
    validateFoodDescriptions(input);
    const state = await readMealSnapshot(tx, userId), preview = planner(input, state, row.origin as MealActor["origin"]);
    if (row.origin === "ai") for (const entry of preview) if (!aiActionAllowed(entry.action.kind)) entry.error = "AI不能删除或恢复整条记录，请取消这一项。";
    await validatePreviewImages(tx,userId,preview);
    const [updated] = await tx.update(mealOperation).set({ draft: input, preview, snapshotDigest: stateDigest(state), revision: row.revision + 1, expiresAt: row.origin === "ai" ? new Date(Date.now() + 15 * 60000) : null }).where(eq(mealOperation.id, row.id)).returning();
    return displayMealOperation(updated);
  });
}
async function checkCredential(tx: Transaction, row: typeof mealOperation.$inferSelect) {
  if (row.origin !== "ai") return;
  const identity: AiIdentity = row.tokenId ? { userId: row.userId, tokenId: row.tokenId, permission: "write" } : { userId: row.userId, oauthConnectionId: row.oauthConnectionId!, permission: "write" };
  await requireActiveAiToken(tx, identity, true, "meals");
}
async function validatePreviewImages(tx: Transaction,userId:string,preview:PreviewRow[]) {
  for(const row of preview.filter(r => !r.excluded)) {
    const ids=[...(row.food?.imageIds??[]),...(row.meal?.imageIds??[]),...(row.meal?.items.flatMap(i=>i.foodSnapshot?.imageIds??[])??[])];
    if(!ids.length) continue;
    const owned=await tx.select({id:mealImage.id}).from(mealImage).where(and(eq(mealImage.userId,userId),inArray(mealImage.id,[...new Set(ids)])));
    if(new Set(owned.map(i=>i.id)).size!==new Set(ids).size) row.error="照片不属于当前账号或不存在，请重新上传。";
  }
}
async function writeImageLinks(tx:Transaction,userId:string,record:{id:string;imageIds?:string[]},isFood:boolean) {
  await tx.delete(mealImageLink).where(and(eq(mealImageLink.userId,userId),eq(isFood?mealImageLink.foodId:mealImageLink.mealId,record.id)));
  if(record.imageIds?.length) await tx.insert(mealImageLink).values(record.imageIds.map((imageId,position)=>({id:randomUUID(),userId,imageId,position,...(isFood?{foodId:record.id}:{mealId:record.id})})));
}
async function writeFood(tx: Transaction, userId: string, f: FoodView) {
  const values = { category: f.category ?? "ingredient", name: f.name, brand: f.brand ?? null, preparation: f.preparation ?? null, identityKey: foodIdentity(f), baseQuantity: f.baseQuantity, unit: f.unit, ...f.nutrition, sourceKind: f.sourceKind, basis: f.basis ?? null, evidenceUrl: f.evidenceUrl ?? null, version: f.version, deletedAt: f.deletedAt ? new Date(f.deletedAt) : null, updatedAt: new Date() };
  const [old] = await tx.select().from(food).where(and(eq(food.userId, userId), eq(food.id, f.id)));
  if (old) await tx.update(food).set(values).where(and(eq(food.id, f.id), eq(food.userId, userId)));
  else await tx.insert(food).values({ id: f.id, userId, ...values });
  await writeImageLinks(tx,userId,f,true);
}
export async function decideMealOperation(db: Database, userId: string, id: string, revision: number, decision: "confirm" | "cancel", allowMissingImages = false) {
  if (!["confirm", "cancel"].includes(decision)) throw new ApiError(400, "invalid_input", "审核操作无效。");
  return db.transaction(async tx => {
    await lockOwner(tx, userId); const op = await getMealOperation(tx, userId, id);
    // 重复确认返回既有结果，不重新执行写入。
    if (op.status === (decision === "confirm" ? "confirmed" : "cancelled")) return displayMealOperation(op);
    if (op.status !== "pending" || op.revision !== revision) throw new ApiError(409, "version_conflict", "审核已改变，请刷新。");
    if (decision === "cancel") {
      const [updated] = await tx.update(mealOperation).set({ status: "cancelled", revision: op.revision + 1 }).where(eq(mealOperation.id, id)).returning(); return displayMealOperation(updated);
    }
    await checkCredential(tx, op);
    if (op.expiresAt && op.expiresAt < new Date()) throw new ApiError(409, "expired", "预览已过期，请刷新预览后确认。");
    validateFoodDescriptions(op.draft);
    await validatePreviewImages(tx,userId,op.preview);
    if (op.preview.some(r => !r.excluded && (r.error || r.needsUserInput?.length))) throw new ApiError(400, "review_required", "请先修正预览中的问题。");
    const missingImages = missingMealImages(op.preview);
    if (missingImages && !allowMissingImages) throw new ApiError(400, "images_required", "照片尚未全部保存，请补传，或明确选择先保存文字记录。");
    const before = await readMealSnapshot(tx, userId);
    if (stateDigest(before) !== op.snapshotDigest) throw new ApiError(409, "snapshot_changed", "饮食或食材已改变，请刷新预览后重新核对。");
    const active = op.preview.filter(row => !row.excluded);
    if (op.origin === "ai") requireAiUpserts(active.map(row => row.action));
    for (let index = 0; index < active.length; index++) {
      const row = active[index];
      if (row.food) await writeFood(tx, userId, row.food);
      if (row.meal) {
        const m = row.meal;
        if (row.action.kind === "save_meal") {
          for (const i of m.items) if (i.foodDraft && i.foodSnapshot) {
            await writeFood(tx, userId, i.foodSnapshot);
            await tx.insert(mealEvent).values({ id: randomUUID(), userId, recordId: i.foodSnapshot.id, recordType: "food", operationId: op.id, actorType: op.origin === "ai" ? "ai" : "user", actorId: op.tokenId ?? op.oauthConnectionId ?? userId, confirmedBy: userId, snapshot: { originalInput: i.foodDraft, before: null, after: i.foodSnapshot, origin: op.origin, mealId: m.id } });
          }
          const values = { localDate: m.date, mealType: m.mealType, notes: m.notes ?? null, timezone: m.timezone ?? null, occurredAt: m.occurredAt ? new Date(m.occurredAt) : null, source: m.source, version: m.version, updatedAt: new Date() };
          if (row.action.id) await tx.update(meal).set(values).where(and(eq(meal.id, m.id), eq(meal.userId, userId)));
          else await tx.insert(meal).values({ id: m.id, userId, ...values, sourceSystem: op.origin === "initialization" ? "historical-meal-initialization" : "formward", sourceRecordId: op.origin === "initialization" ? `${op.importId}:${index + 2}` : `${op.operationId}:${index}`, importId: op.importId, sourceRow: op.importId ? index + 2 : null, syncStatus: "confirmed" });
          await writeImageLinks(tx,userId,m,false);
          await tx.update(mealItem).set({ deletedAt: new Date() }).where(and(eq(mealItem.userId, userId), eq(mealItem.mealId, m.id), isNull(mealItem.deletedAt)));
          await tx.insert(mealItem).values(m.items.map((item, position) => ({ id: randomUUID(), userId, mealId: m.id, position, kind: item.kind, name: item.name, quantity: item.quantity ?? null, amountDecision:item.amountDecision??null, reviewExplanation:item.reviewExplanation??null, unit: item.unit ?? null, foodId: item.foodId ?? null, foodSnapshot: item.foodSnapshot, ...item.nutrition, sourceKind: item.sourceKind, basis: item.basis ?? null, evidenceUrl: item.evidenceUrl ?? null })));
        } else await tx.update(meal).set({ version: m.version, deletedAt: m.deletedAt ? new Date(m.deletedAt) : null, updatedAt: new Date() }).where(and(eq(meal.userId, userId), eq(meal.id, m.id)));
      }
      const record = row.food ?? row.meal!;
      await tx.insert(mealEvent).values({ id: randomUUID(), userId, recordId: record.id, recordType: row.food ? "food" : "meal", operationId: op.id, actorType: op.origin === "ai" ? "ai" : "user", actorId: op.tokenId ?? op.oauthConnectionId ?? userId, confirmedBy: userId, snapshot: { action: row.action, originalInput: row.review?.originalInput ?? op.payload.actions[index] ?? null, ...(row.review ? { review: row.review } : {}), before: (row.food ? before.foods : before.meals).find(r => r.id === record.id) ?? null, after: record, origin: op.origin, ...(missingImages && allowMissingImages ? { confirmedWithoutImages: true, missingImages } : {}) } });
    }
    const changedDates=active.flatMap(row=>row.meal?[row.meal.date,...before.meals.filter(m=>m.id===row.meal!.id).map(m=>m.date)]:[]);
    if(changedDates.length)await invalidateMealDays(tx,userId,changedDates,op.id,op.tokenId??op.oauthConnectionId??userId);
    if (op.importId) await tx.update(mealImport).set({ confirmedAt: new Date() }).where(and(eq(mealImport.userId, userId), eq(mealImport.id, op.importId)));
    const [updated] = await tx.update(mealOperation).set({ status: "confirmed", revision: op.revision + 1, confirmedAt: new Date(), result: { saved: active.length, message: `已保存${active.length}项饮食／食材记录。${missingImages ? `已按你的选择先保存文字，${missingImages}张照片尚未保存。` : ""}` } }).where(eq(mealOperation.id, id)).returning();
    return displayMealOperation(updated);
  });
}
