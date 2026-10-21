import { randomUUID } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import type { Database } from "../../db/client";
import { recordOperation, measurementOperation } from "../../db/schema";
import { lockOwner } from "../auth/owner-lock";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { getAiMeasurementOperation, reviewAiMeasurementOperation, submitAiMeasurementOperation } from "../measurements/ai-operations";
import { systemMeasurementTimezone } from "../measurements/timezone";
import { decideMealOperation, digest, displayMealOperation, getMealOperation, prepareMealActions, readMealSnapshot, reviseMealOperation, submitMealOperation, type MealPlanner } from "../meals/records";
import { type MealAction, type MealInput, type PreviewRow, type MealSnapshot } from "../meals/model";
import { category, isBody, isEnergy, recordInputSchema, recordItemSchema, type RecordAction, type RecordInput, type RecordItem, type RecordReviewAction, type RecordReviewView, type RecordRow } from "./model";

import { submitEnergyOperation, getEnergyOperation, displayEnergyOperation, reviseEnergyOperation, decideEnergyOperation } from "../activities/records";
import type { EnergyAction } from "../activities/model";

type Stored = typeof recordOperation.$inferSelect;
type Source = "body" | "meal";

const mealItems = (items: RecordItem[]) => items.filter(item => !isBody(item.action) && !isEnergy(item.action));
const energyItems = (items: RecordItem[]) => items.filter(item => isEnergy(item.action));
const mealInput = (id: string, items: RecordItem[]): MealInput => ({ operationId: id, actions: mealItems(items).map(item => item.action as MealAction) });

/** 内嵌新食材展开成可独立取舍的一项；引用只在本批次解析。 */
function normalize(input: RecordInput): RecordItem[] {
  const items: RecordItem[] = input.items.map(({ key, ...action }) => ({ key, action: action as RecordAction, originalInput: action as RecordAction, excluded: false, checked: false }));
  const keys = new Set(items.map(item => item.key));
  if (keys.size !== items.length) throw new ApiError(400, "invalid_input", "每项 key 必须唯一。");
  const embedded = new Map<string, string>();
  for (const item of [...items]) if (item.action.kind === "save_meal") {
    item.action = { ...item.action, items: item.action.items.map((entry, index) => {
      if (entry.foodRef && (entry.foodId || entry.foodDraft || entry.nutrition)) throw new ApiError(400, "invalid_input", "foodRef 不能同时提供 foodId、foodDraft 或 nutrition。");
      if (!entry.foodDraft) return entry;
      const signature = digest(entry.foodDraft);
      let ref = embedded.get(signature);
      if (!ref) {
        ref = `food-${item.key}-${index}`.slice(0, 120);
        while (keys.has(ref)) ref = randomUUID();
        keys.add(ref); embedded.set(signature, ref);
        const action = { ...entry.foodDraft, kind: "save_food" as const };
        items.push({ key: ref, action, originalInput: action, excluded: false, checked: false });
      }
      const { foodDraft, ...rest } = entry; void foodDraft;
      return { ...rest, foodRef: ref };
    }) };
  }
  if (items.length > 100) throw new ApiError(400, "invalid_input", "展开新食材后单批最多100项。");
  return items;
}

/** 复用饮食规划器，只在此解析批内引用与独立入库选择。 */
function planner(items: RecordItem[], operationId: string): MealPlanner {
  return (_input, state, origin) => {
    const working = structuredClone(state), rows = new Map<string, PreviewRow>();
    const entries = mealItems(items), refs = new Map<string, NonNullable<PreviewRow["food"]>>();
    const annotate = (item: RecordItem, row: PreviewRow) => ({ ...row, excluded: item.excluded, review: { operationId, itemId: item.key, originalInput: item.originalInput, reviewedInput: item.action, ...(item.editedBy ? { editedBy: item.editedBy } : {}) } });
    for (const item of entries.filter(item => category(item.action) === "foods")) {
      const [row] = prepareMealActions({ operationId, actions: [item.action as MealAction] }, working, origin);
      rows.set(item.key, annotate(item, row));
      if (row.food && !row.error) {
        refs.set(item.key, row.food);
        if (!item.excluded) working.foods = [...working.foods.filter(food => food.id !== row.food!.id), row.food];
      }
    }
    for (const item of entries.filter(item => category(item.action) === "meals")) {
      let action = structuredClone(item.action as MealAction), error: string | undefined;
      const detached = new Set<string>();
      const local: MealSnapshot = structuredClone(working);
      if (action.kind === "save_meal") action = { ...action, items: action.items.map(entry => {
        if (!entry.foodRef) return entry;
        const ref = refs.get(entry.foodRef), source = items.find(item => item.key === entry.foodRef);
        if (!ref || source?.action.kind !== "save_food") { error = "引用的本批食材无效，请修改对应食材或本餐。"; return entry; }
        local.foods = [...local.foods.filter(food => food.id !== ref.id), ref];
        if (source.excluded) detached.add(ref.id);
        const { foodRef, ...rest } = entry; void foodRef;
        return { ...rest, foodId: ref.id, foodVersion: ref.version };
      }) };
      const [row] = prepareMealActions({ operationId, actions: [action] }, local, origin);
      if (error) row.error = error;
      if (row.meal) {
        row.meal.items = row.meal.items.map(entry => detached.has(entry.foodId ?? "") ? { ...entry, foodId: undefined, foodVersion: undefined } : entry);
        if (!item.excluded) working.meals = [...working.meals.filter(meal => meal.id !== row.meal!.id), row.meal];
      }
      rows.set(item.key, annotate(item, row));
    }
    // 同一批中重复编辑同一目标也须阻止，不能分行规避版本检查。
    const targets = new Set<string>();
    for (const item of entries.filter(item => !item.excluded)) if ("id" in item.action && item.action.id) {
      const targetId = item.action.id;
      if (targets.has(targetId)) for (const other of entries.filter(other => "id" in other.action && other.action.id === targetId && !other.excluded)) rows.get(other.key)!.error = "本批次重复修改同一记录，请取消其中一项。";
      targets.add(item.action.id);
    }
    // 食材先落库，餐次再引用；展示顺序由父批次控制。
    return [...entries.filter(item => category(item.action) === "foods"), ...entries.filter(item => category(item.action) === "meals")].map(item => rows.get(item.key)!);
  };
}

async function find(db: Database, userId: string, id: string, source?: Source) {
  const [row] = await db.select().from(recordOperation).where(and(eq(recordOperation.userId, userId), source ? eq(source === "body" ? recordOperation.measurementOperationId : recordOperation.mealOperationId, id) : or(eq(recordOperation.id, id), eq(recordOperation.measurementOperationId, id))));
  return row;
}
async function legacy(db: Database, userId: string, id: string, source: Source): Promise<Stored> {
  let draft: RecordItem[], status = "pending", createdAt: Date;
  if (source === "body") {
    const body = await getAiMeasurementOperation(db, userId, id);
    draft = body.items.map(item => ({ key: item.id, action: item.input, originalInput: item.originalInput, excluded: item.status === "cancelled", checked: false, persisted: item.status === "confirmed", measurementItemId: item.id, editedBy: item.editedBy }));
    status = body.status === "completed" && !body.counts.saved ? "completed" : ["confirmed", "completed"].includes(body.status) ? "confirmed" : body.status === "cancelled" ? "cancelled" : "pending"; createdAt = new Date(body.createdAt);
  } else {
    const meal = await getMealOperation(db, userId, id);
    draft = meal.draft.actions.map((action, index) => ({ key: `item-${index}`, action, originalInput: meal.payload.actions[index], excluded: meal.status === "cancelled", checked: false, persisted: meal.status === "confirmed" }));
    status = meal.status; createdAt = meal.createdAt;
  }
  const payload: RecordInput = { operationId: `legacy-${id}`, items: draft.map(item => ({ key: item.key, ...item.action })) };
  return { id, userId, operationId: payload.operationId, payload, requestDigest: digest(payload), draft, revision: 1, status, createdAt, confirmedAt: null, measurementOperationId: source === "body" ? id : null, mealOperationId: source === "meal" ? id : null, energyOperationId: null, energyRevision: null, measurementRevision: source === "body" ? (await getAiMeasurementOperation(db, userId, id)).revision : null, mealRevision: source === "meal" ? (await getMealOperation(db, userId, id)).revision : null };
}
async function view(db: Database, row: Stored): Promise<RecordReviewView> {
  const body = row.measurementOperationId ? await getAiMeasurementOperation(db, row.userId, row.measurementOperationId) : null;
  const meal = row.mealOperationId ? displayMealOperation(await getMealOperation(db, row.userId, row.mealOperationId)) : undefined;
  const energy = row.energyOperationId ? displayEnergyOperation(await getEnergyOperation(db, row.userId, row.energyOperationId)) : undefined;
  const snapshot = await readMealSnapshot(db, row.userId);
  const needsBody = row.draft.some(item => isBody(item.action) && !item.excluded && !item.persisted && body?.items.find(candidate => candidate.id === item.measurementItemId)?.status === "pending");
  const needsMeal = mealItems(row.draft).some(item => !item.excluded && !item.persisted);
  const needsEnergy = energyItems(row.draft).some(item => !item.excluded && !item.persisted);
  const expirations = [needsBody ? body?.expiresAt : null, needsMeal ? meal?.expiresAt : null, needsEnergy ? energy?.expiresAt : null].filter((value): value is string => !!value).sort();
  const rows: RecordRow[] = row.draft.map(item => {
    const bodyRow = body?.items.find(candidate => candidate.id === item.measurementItemId);
    const index = mealItems(row.draft).findIndex(candidate => candidate.key === item.key);
    const mealRow = meal?.rows.find(candidate => candidate.review?.itemId === item.key) ?? (meal?.rows.some(candidate => candidate.review) ? undefined : meal?.rows[index]);
    const energyRow = energy?.rows[energyItems(row.draft).findIndex(candidate => candidate.key === item.key)];
    const targetId = "id" in item.action ? item.action.id : undefined;
    const before = mealRow?.before ?? (targetId ? [...snapshot.foods, ...snapshot.meals].find(record => record.id === targetId) : undefined);
    const persisted = item.persisted || bodyRow?.status === "confirmed" || (!!meal && meal.status === "confirmed" && !item.excluded && !isBody(item.action) && !isEnergy(item.action)) || (!!energy && energy.status === "confirmed" && !item.excluded && isEnergy(item.action));
    return { ...item, persisted, ...(bodyRow ? { body: bodyRow } : {}), ...(mealRow ? { meal: { ...mealRow, before } } : {}), ...(energyRow ? { energy: energyRow } : {}) };
  });
  const pending = rows.filter(item => !item.excluded && !item.persisted && item.body?.status !== "skipped");
  const needsUserInput = pending.flatMap(item => {
    const questions = isBody(item.action) ? item.body?.preview.canConfirm ? [] : item.body?.preview.needsUserInput?.map(issue => issue.message) ?? [item.body?.preview.message ?? "身体记录需要核对。"] : isEnergy(item.action) ? item.energy?.error ? [item.energy.error] : !item.energy ? ["消耗记录需要核对。"] : [] : item.meal?.needsUserInput?.length ? [...item.meal.needsUserInput] : item.meal?.error ? [item.meal.error] : [];
    if ((item.action.kind === "save_meal" || item.action.kind === "save_food") && (item.action.expectedImageCount ?? 0) > (item.meal?.meal?.imageIds?.length ?? item.meal?.food?.imageIds?.length ?? 0)) questions.push("照片未齐，请补传或由用户在网页明确选择先保存文字。");
    return questions.length ? [{ key: item.key, questions }] : [];
  });
  return { id: row.id, revision: row.revision, status: row.status, createdAt: row.createdAt.toISOString(), expiresAt: expirations[0] ?? null, confirmationPath: `/dashboard/ai/operations/${row.id}`, foods: snapshot.foods.filter(food => !food.deletedAt), mealOperation: meal, energyOperation: energy, rows, needsUserInput, canConfirm: row.status === "pending" && pending.length > 0 && !needsUserInput.length && (!expirations[0] || Date.parse(expirations[0]) > Date.now()), saved: rows.filter(item => item.persisted).length };
}
export async function loadRecordReview(db: Database, userId: string, id: string, source?: Source) {
  const row = await find(db, userId, id, source);
  if (row) return view(db, row);
  if (source) return view(db, await legacy(db, userId, id, source));
  // 旧身体链接与统一入口共用路径。
  return view(db, await legacy(db, userId, id, "body"));
}
export async function submitRecordOperation(db: Database, identity: AiIdentity, raw: unknown, timezone = systemMeasurementTimezone()) {
  const parsed = recordInputSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "invalid_input", parsed.error.issues[0]?.message ?? "记录无效。");
  const input = parsed.data;
  if (Buffer.byteLength(JSON.stringify(input)) > 65536) throw new ApiError(413, "invalid_input", "单次提交最多64 KiB。");
  return db.transaction(async tx => {
    await lockOwner(tx, identity.userId); const connection = tx as unknown as Database;
    if (input.items.some(item => item.kind === "save_record" || item.kind === "estimate_cell")) await requireActiveAiToken(tx, identity, true);
    if (input.items.some(item => item.kind !== "save_record" && item.kind !== "estimate_cell" && !isEnergy(item))) await requireActiveAiToken(tx, identity, true, "meals");
    if (input.items.some(isEnergy)) await requireActiveAiToken(tx, identity, true, "energy");
    const [prior] = await tx.select().from(recordOperation).where(and(eq(recordOperation.userId, identity.userId), eq(recordOperation.operationId, input.operationId)));
    if (prior) {
      if (prior.requestDigest !== digest(input)) throw new ApiError(409, "request_conflict", "同一 operationId 不能替换内容。");
      const child = prior.mealOperationId ? await getMealOperation(connection, identity.userId, prior.mealOperationId) : null;
      if (child && (child.tokenId !== (identity.tokenId ?? null) || child.oauthConnectionId !== (identity.oauthConnectionId ?? null))) throw new ApiError(409, "request_conflict", "不能替换提交授权。");
      if (prior.measurementOperationId) {
        const original = await tx.select().from(measurementOperation).where(eq(measurementOperation.id, prior.measurementOperationId));
        if (original[0]?.tokenId !== (identity.tokenId ?? null) || original[0]?.oauthConnectionId !== (identity.oauthConnectionId ?? null)) throw new ApiError(409, "request_conflict", "不能替换提交授权。");
      }
      if (prior.energyOperationId) {
        const original = await getEnergyOperation(connection, identity.userId, prior.energyOperationId);
        if (original.tokenId !== (identity.tokenId ?? null) || original.oauthConnectionId !== (identity.oauthConnectionId ?? null)) throw new ApiError(409, "request_conflict", "不能替换提交授权。");
      }
      return { ...await view(connection, prior), repeated: true };
    }
    const id = randomUUID(), items = normalize(input), bodies = items.filter(item => isBody(item.action));
    const body = bodies.length ? await submitAiMeasurementOperation(connection, identity, { kind: "batch", operationId: `records-${id}`, items: bodies.map(item => item.action) }, input.timezone ?? timezone) : null;
    bodies.forEach((item, index) => { item.measurementItemId = body!.items[index].id; item.action = body!.items[index].input; });
    for (const item of energyItems(items)) if (item.action.kind === "save_energy_day" || item.action.kind === "save_activity") item.action = { ...item.action, timezone: item.action.timezone ?? input.timezone ?? timezone };
    const energy = energyItems(items).length ? await submitEnergyOperation(connection, { userId: identity.userId, origin: "ai", identity }, { operationId: `records-${id}`, actions: energyItems(items).map(item => item.action) }) : null;
    const meal = mealItems(items).length ? await submitMealOperation(connection, { userId: identity.userId, origin: "ai", identity }, mealInput(`records-${id}`, items), planner(items, id)) : null;
    const [row] = await tx.insert(recordOperation).values({ id, userId: identity.userId, operationId: input.operationId, requestDigest: digest(input), payload: input, draft: items, measurementOperationId: body?.id, mealOperationId: meal?.id, measurementRevision: body?.revision, mealRevision: meal?.revision, energyOperationId: energy?.id, energyRevision: energy?.revision, status: !meal && !energy && body && !body.counts.pending ? "completed" : "pending" }).returning();
    return { ...await view(connection, row), repeated: false };
  });
}

export async function reviewRecordOperation(db: Database, userId: string, id: string, action: RecordReviewAction, source?: Source) {
  if (!action || !Number.isInteger(action.revision) || action.revision < 1 || !["check", "exclude", "restore", "update", "refresh", "cancel", "confirm"].includes(action.kind)) throw new ApiError(400, "invalid_input", "审核操作无效。");
  if (action.kind === "confirm" && action.allowMissingImageKeys !== undefined && (!Array.isArray(action.allowMissingImageKeys) || action.allowMissingImageKeys.length > 100 || action.allowMissingImageKeys.some(key => typeof key !== "string"))) throw new ApiError(400, "invalid_input", "缺图确认项目无效。");
  return db.transaction(async tx => {
    await lockOwner(tx, userId); const connection = tx as unknown as Database;
    let row = await find(connection, userId, id, source);
    if (!row) {
      const seed = await legacy(connection, userId, id, source ?? "body");
      [row] = await tx.insert(recordOperation).values({ ...seed, id: randomUUID() }).returning();
    }
    if (row.status !== "pending") {
      if ((action.kind === "confirm" && row.status === "confirmed") || (action.kind === "cancel" && row.status === "cancelled")) return view(connection, row);
      throw new ApiError(409, "closed_review", "本次审核已结束。");
    }
    if (row.revision !== action.revision) throw new ApiError(409, "review_changed", "审核已在另一个页面变化，请加载最新状态；当前输入仍保留。");
    const items = structuredClone(row.draft), before = await view(connection, row);
    for (const item of items) if (before.rows.find(current => current.key === item.key)?.persisted) item.persisted = true;
    const bodyRevision = row.measurementOperationId ? (await getAiMeasurementOperation(connection, userId, row.measurementOperationId)).revision : null;
    const mealRevision = row.mealOperationId ? (await getMealOperation(connection, userId, row.mealOperationId)).revision : null;
    const energyRevision = row.energyOperationId ? (await getEnergyOperation(connection, userId, row.energyOperationId)).revision : null;
    if (action.kind !== "refresh" && action.kind !== "cancel" && (bodyRevision !== row.measurementRevision || mealRevision !== row.mealRevision || energyRevision !== row.energyRevision)) throw new ApiError(409, "review_changed", "子审核内容已变化，请刷新预览后重新核对。");
    if (action.kind === "confirm") {
      const selected = before.rows.filter(item => !item.excluded && !item.persisted && item.body?.status !== "skipped");
      if (!selected.length) throw new ApiError(400, "no_changes", "没有待保存内容。");
      if (selected.some(item => isBody(item.action) ? !item.body?.preview.canConfirm : isEnergy(item.action) ? !item.energy || item.energy.error : !item.meal || item.meal.error || item.meal.needsUserInput?.length)) throw new ApiError(400, "review_required", "请修改或取消仍需核对的项目。");
      const missingKeys = selected.filter(item => item.meal && (item.action.kind === "save_meal" || item.action.kind === "save_food") && (item.action.expectedImageCount ?? 0) > (item.meal.meal?.imageIds?.length ?? item.meal.food?.imageIds?.length ?? 0)).map(item => item.key);
      if (missingKeys.some(key => !action.allowMissingImageKeys?.includes(key))) throw new ApiError(400, "images_required", "请补传照片，或在对应项明确选择先保存文字。");
      if (row.measurementOperationId) {
        let body = await getAiMeasurementOperation(connection, userId, row.measurementOperationId);
        const selectedIds = selected.flatMap(item => item.measurementItemId && item.body?.status === "pending" ? [item.measurementItemId] : []);
        if (selectedIds.length) body = await reviewAiMeasurementOperation(connection, userId, body.id, { kind: "confirm", revision: body.revision, itemIds: selectedIds });
        const remaining = body.items.filter(item => item.status === "pending").map(item => item.id);
        if (remaining.length) await reviewAiMeasurementOperation(connection, userId, body.id, { kind: "cancel", revision: body.revision, itemIds: remaining });
      }
      if (row.mealOperationId) {
        const meal = await getMealOperation(connection, userId, row.mealOperationId);
        await decideMealOperation(connection, userId, meal.id, meal.revision, selected.some(item => !isBody(item.action) && !isEnergy(item.action)) ? "confirm" : "cancel", missingKeys.length > 0);
      }
      if (row.energyOperationId) {
        const energy = await getEnergyOperation(connection, userId, row.energyOperationId);
        await decideEnergyOperation(connection, userId, energy.id, energy.revision, selected.some(item => isEnergy(item.action)) ? "confirm" : "cancel");
      }
      for (const item of items) if (selected.some(selected => selected.key === item.key)) item.persisted = true;
    } else if (action.kind === "cancel") {
      if (row.measurementOperationId) { const body = await getAiMeasurementOperation(connection, userId, row.measurementOperationId); if (body.counts.pending) await reviewAiMeasurementOperation(connection, userId, body.id, { kind: "cancel", revision: body.revision }); }
      if (row.mealOperationId) { const meal = await getMealOperation(connection, userId, row.mealOperationId); if (meal.status === "pending") await decideMealOperation(connection, userId, meal.id, meal.revision, "cancel"); }
      if (row.energyOperationId) { const energy = await getEnergyOperation(connection, userId, row.energyOperationId); if (energy.status === "pending") await decideEnergyOperation(connection, userId, energy.id, energy.revision, "cancel"); }
      for (const item of items) if (!item.persisted) item.excluded = true;
    } else {
      if (action.kind === "update") {
        const item = items.find(item => item.key === action.key);
        if (!item || item.persisted) throw new ApiError(400, "invalid_input", "只能修改本次尚未保存的项目。");
        const parsed = recordItemSchema.safeParse({ ...action.action, key: item.key });
        if (!parsed.success || action.action.kind !== item.action.kind) throw new ApiError(400, "invalid_input", "修改内容或类型无效。");
        const { key, ...input } = parsed.data; void key;
        item.action = input as RecordAction; item.checked = false; item.editedBy = { userId, at: new Date().toISOString() };
        for (const dependent of items) if (dependent.action.kind === "save_meal" && dependent.action.items.some(entry => entry.foodRef === item.key)) dependent.checked = false;
        if (isBody(item.action) && row.measurementOperationId) { const body = await getAiMeasurementOperation(connection, userId, row.measurementOperationId); await reviewAiMeasurementOperation(connection, userId, body.id, { kind: "update", revision: body.revision, changes: [{ itemId: item.measurementItemId!, input: item.action }] }); }
      } else if ("keys" in action) {
        if (!Array.isArray(action.keys) || !action.keys.length || new Set(action.keys).size !== action.keys.length || action.keys.some(key => !items.some(item => item.key === key && !item.persisted))) throw new ApiError(400, "invalid_input", "请选择本次尚未保存的项目。");
        for (const item of items.filter(item => action.keys.includes(item.key))) {
          if (action.kind === "check") item.checked = true;
          else { item.excluded = action.kind === "exclude"; item.checked = false; }
        }
      }
      if (action.kind === "refresh" && row.measurementOperationId) { const body = await getAiMeasurementOperation(connection, userId, row.measurementOperationId); if (body.counts.pending) await reviewAiMeasurementOperation(connection, userId, body.id, { kind: "refresh", revision: body.revision }); }
      if (row.mealOperationId && action.kind !== "check") {
        const meal = await getMealOperation(connection, userId, row.mealOperationId);
        if (meal.status === "pending") await reviseMealOperation(connection, userId, meal.id, meal.revision, mealInput(meal.draft.operationId, items).actions, planner(items, row.id));
      }
      if (row.energyOperationId && action.kind !== "check") {
        const energy = await getEnergyOperation(connection, userId, row.energyOperationId), entries = energyItems(items);
        if (energy.status === "pending") await reviseEnergyOperation(connection, userId, energy.id, energy.revision, entries.map(item => item.action as EnergyAction), entries.flatMap((item,index) => item.excluded ? [index] : []));
      }
      if (action.kind === "refresh") for (const item of items) item.checked = false;
    }
    const latestBody = row.measurementOperationId ? await getAiMeasurementOperation(connection, userId, row.measurementOperationId) : null;
    const latestBodyRevision = latestBody?.revision ?? null;
    for (const item of items) { const child = latestBody?.items.find(child => child.id === item.measurementItemId); if (child) item.action = child.input; }
    const latestMealRevision = row.mealOperationId ? (await getMealOperation(connection, userId, row.mealOperationId)).revision : null;
    const latestEnergyRevision = row.energyOperationId ? (await getEnergyOperation(connection, userId, row.energyOperationId)).revision : null;
    const [updated] = await tx.update(recordOperation).set({ energyRevision: latestEnergyRevision, measurementRevision: latestBodyRevision, mealRevision: latestMealRevision, draft: items, revision: row.revision + 1, status: action.kind === "confirm" ? "confirmed" : action.kind === "cancel" ? "cancelled" : "pending", ...(action.kind === "confirm" ? { confirmedAt: new Date() } : {}) }).where(eq(recordOperation.id, row.id)).returning();
    return view(connection, updated);
  });
}

export async function listRecordOperations(db: Database, userId: string) {
  const rows = await db.select().from(recordOperation).where(eq(recordOperation.userId, userId)).orderBy(desc(recordOperation.createdAt)).limit(30);
  return rows.map(row => ({ id: row.id, status: row.status, count: row.draft.length, createdAt: row.createdAt.toISOString(), measurementOperationId: row.measurementOperationId, mealOperationId: row.mealOperationId, energyOperationId: row.energyOperationId, confirmationPath: `/dashboard/ai/operations/${row.id}` }));
}

export async function getRecordOperation(db: Database, identity: AiIdentity, id: string) {
  const row = await find(db, identity.userId, id);
  if (!row) throw new ApiError(404, "not_found", "操作不存在。");
  if (row.measurementOperationId) await requireActiveAiToken(db as unknown as Parameters<typeof requireActiveAiToken>[0], identity, false);
  if (row.mealOperationId) await requireActiveAiToken(db as unknown as Parameters<typeof requireActiveAiToken>[0], identity, false, "meals");
  if (row.energyOperationId) await requireActiveAiToken(db as unknown as Parameters<typeof requireActiveAiToken>[0], identity, false, "energy");
  // 查询与提交返回相同结果，调用端仍须以 status 判定是否正式保存。
  return view(db, row);
}
