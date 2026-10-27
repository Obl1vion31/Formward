import {numberChangeMessages} from "../../components/number-change";
import { retiredEnergyAction } from "./model";
import { requireAiUpserts } from "../auth/ai-write-policy";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { activity, energyDay, energyDefault, energyEvent, energyOperation, energyProfile } from "../../db/schema";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { lockOwner, type Transaction } from "../auth/owner-lock";
import { rememberEnergySources } from "./sources";
import { systemMeasurementTimezone, validateMeasurementTimezone } from "../measurements/timezone";
import { energyDays, energyBaseline, activityEnergyChanged, activityCalories, activityCalorieFields, ageOn, energyInputSchema, type EnergyAction, type EnergyInput, type EnergyOperationView, type EnergyPreview, type EnergyRecord, type EnergyDayRecord, type EnergySnapshot, type EnergyProvenance } from "./model";

export type EnergyActor = { userId: string; origin: "manual" | "ai"; identity?: AiIdentity };
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function snapshotDigest(state: EnergySnapshot) {
  const { defaults, ...legacy } = state;
  return digest({ rules: "explicit-energy-modes-v2", ...legacy, days: legacy.days.map(({ activeEstimated, notes, ...day }) => ({ ...day, ...(activeEstimated ? { activeEstimated } : {}), ...(notes ? { notes } : {}) })), ...(defaults?.length ? { defaults } : {}) });
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const typeOf = (action: EnergyAction) => action.kind.includes("defaults") ? "defaults" : action.kind.includes("profile") ? "profile" : action.kind.includes("energy_day") ? "day" : "activity";
const listOf = (state: EnergySnapshot, action: EnergyAction): EnergyRecord[] => typeOf(action) === "defaults" ? (state.defaults ??= []) : typeOf(action) === "profile" ? state.profiles : typeOf(action) === "day" ? state.days : state.activities;
function plain<T extends { userId: string; createdAt: Date; updatedAt: Date; deletedAt: Date | null }>(row: T) {
  const { userId, createdAt, updatedAt, deletedAt, ...record } = row;
  void userId; void createdAt; void updatedAt;
  return { ...record, deletedAt: deletedAt?.toISOString() ?? null };
}
export async function readEnergySnapshot(db: Pick<Database, "select">, userId: string): Promise<EnergySnapshot> {
  const defaults = await db.select().from(energyDefault).where(eq(energyDefault.userId, userId)).orderBy(asc(energyDefault.id));
  const profiles = await db.select().from(energyProfile).where(eq(energyProfile.userId, userId)).orderBy(asc(energyProfile.id));
  const days = await db.select().from(energyDay).where(eq(energyDay.userId, userId)).orderBy(asc(energyDay.id));
  const activities = await db.select().from(activity).where(eq(activity.userId, userId)).orderBy(asc(activity.id));
  const sourced = <T extends Parameters<typeof plain>[0] & { sourceOccurredAt: Date | null; sourceUnit: string; syncStatus: string }>(row: T) => ({ ...plain(row), sourceOccurredAt: row.sourceOccurredAt?.toISOString() ?? null, sourceUnit: "kcal" as const, syncStatus: "confirmed" as const });
  return { defaults: defaults.map(plain), profiles: profiles.map(row => ({ ...plain(row), sex: row.sex as "male" | "female" })), days: days.map(sourced), activities: activities.map(sourced) };
}
function provenance(action: EnergyAction, before?: EnergyRecord): EnergyProvenance {
  const prior = before && "timezone" in before ? before : undefined;
  const input: Partial<EnergyProvenance> = action.kind === "save_energy_day" || action.kind === "save_activity" ? action : {};
  const timezone = input.timezone ?? prior?.timezone ?? systemMeasurementTimezone();
  validateMeasurementTimezone(timezone);
  const sourceSystem = input.sourceSystem === undefined ? prior?.sourceSystem ?? null : input.sourceSystem;
  const sourceRecordId = input.sourceRecordId === undefined ? prior?.sourceRecordId ?? null : input.sourceRecordId;
  if (sourceRecordId && !sourceSystem) throw new ApiError(400, "invalid_input", "来源记录编号需要同时填写来源系统。");
  return { timezone, sourceSystem, sourceRecordId, sourceOccurredAt: input.sourceOccurredAt === undefined ? prior?.sourceOccurredAt ?? null : input.sourceOccurredAt, sourceUnit: "kcal", syncStatus: "confirmed" };
}
export function planEnergyActions(actions: EnergyAction[], snapshot: EnergySnapshot, excluded: number[] = []): EnergyPreview[] {
  const state = structuredClone(snapshot), targets = new Set<string>();
  const rows = actions.map((action, index) => {
    const row: EnergyPreview = { action, excluded: excluded.includes(index) };
    try {
      if (retiredEnergyAction(action.kind)) throw new ApiError(400, "retired_action", "日常默认值和静息公式资料已停用，请取消这一项。");
      const entries = listOf(state, action), before = action.id ? entries.find(record => record.id === action.id) : undefined;
      row.before = before;
      if (action.id && !before) throw new ApiError(404, "not_found", "记录不存在或不属于当前账号。");
      if (before && before.version !== action.version) throw new ApiError(409, "version_conflict", "记录已经改变，请重新加载后核对。");
      const target = action.id ?? (action.kind === "save_energy_defaults" ? "defaults" : "date" in action && action.kind === "save_energy_day" ? `day:${action.date}` : "effectiveFrom" in action ? `profile:${action.effectiveFrom}` : `new:${index}`);
      if (!row.excluded && targets.has(target)) throw new ApiError(409, "version_conflict", "本批次重复修改同一记录。");
      if (!row.excluded) targets.add(target);
      const base = { id: before?.id ?? randomUUID(), version: (before?.version ?? 0) + 1, deletedAt: null };
      if (action.kind === "save_energy_defaults") {
        if (before?.deletedAt) throw new ApiError(409, "deleted", "请先恢复日常默认值。");
        row.after = { ...base, restingFrom: action.restingFrom, restingKcal: action.restingKcal, zeroActivityFrom: action.zeroActivityFrom };
      } else if (action.kind === "save_energy_profile") {
        if (before?.deletedAt) throw new ApiError(409, "deleted", "请先恢复该资料。");
        const age = ageOn(action.birthDate, action.effectiveFrom);
        if (age < 18 || age > 120) throw new ApiError(400, "invalid_input", "公式资料仅支持 18–120 岁；其他情况可直接填写静息热量。");
        row.after = { ...base, effectiveFrom: action.effectiveFrom, heightCm: action.heightCm, birthDate: action.birthDate, sex: action.sex };
      } else if (action.kind === "save_energy_day") {
        if (before?.deletedAt) throw new ApiError(409, "deleted", "请先恢复这一天的记录。");
        const prior = before && "date" in before && "restingKcal" in before ? before : undefined;
        const restingKcal = action.restingKcal === undefined ? prior?.restingKcal ?? null : action.restingKcal;
        const activeKcal = action.activeKcal === undefined ? prior?.activeKcal ?? null : action.activeKcal;
        const totalKcal = action.totalKcal === undefined ? prior?.totalKcal ?? null : action.totalKcal;
        // 无模式的旧请求继续按旧的覆盖优先级解释；新请求始终显式选择。
        const entryMode = action.entryMode ?? (action.totalKcal !== undefined ? totalKcal !== null ? "total" : "components" : prior?.entryMode ?? (totalKcal !== null ? "total" : "components"));
        const activityMode = action.activityMode ?? (action.activeKcal !== undefined ? activeKcal !== null ? "total" : "activities" : prior?.activityMode ?? (activeKcal !== null ? "total" : "activities"));
        if (action.entryMode === "components" && action.totalKcal != null) throw new ApiError(400, "invalid_input", "分开记录时请使用自动合计，不要同时填写总数。");
        if (action.entryMode === "total" && (action.restingKcal != null || action.activeKcal != null)) throw new ApiError(400, "invalid_input", "只记总数时请勿同时提交分项。");
        if (action.activityMode === "activities" && action.activeKcal != null) throw new ApiError(400, "invalid_input", "按运动累计时请勿同时填写活动合计。因未采用的旧值仍会保留，可直接省略该字段。");
        row.after = { ...base, ...provenance(action, before), date: action.date, entryMode, activityMode, restingSourceSystem: action.restingSourceSystem === undefined ? prior?.restingSourceSystem ?? prior?.sourceSystem ?? null : action.restingSourceSystem, activeSourceSystem: action.activeSourceSystem === undefined ? prior?.activeSourceSystem ?? prior?.sourceSystem ?? null : action.activeSourceSystem, restingEstimated: action.restingEstimated ?? prior?.restingEstimated ?? false, activeEstimated: action.activeEstimated ?? prior?.activeEstimated ?? false, notes: action.notes === undefined ? prior?.notes ?? null : action.notes, restingKcal, activeKcal, totalKcal };
      } else if (action.kind === "save_activity") {
        if (before?.deletedAt) throw new ApiError(409, "deleted", "请先恢复该活动。");
        const prior = before && "name" in before ? before : undefined;
        row.after = { ...base, ...provenance(action, before), date: action.date, inclusion:prior?.inclusion??null,inclusionBasis:prior?.inclusionBasis??null,name: action.name, ...activityCalorieFields(action, prior), durationMinutes: action.durationMinutes === undefined ? prior?.durationMinutes ?? null : action.durationMinutes, completed: action.completed ?? prior?.completed ?? true };
      } else {
        if (!before) throw new ApiError(404, "not_found", "记录不存在。");
        const deleting = action.kind.startsWith("delete_");
        if (deleting === !!before.deletedAt) throw new ApiError(409, "state_changed", deleting ? "记录已删除。" : "记录尚未删除。");
        row.after = { ...before, version: before.version + 1, deletedAt: deleting ? new Date().toISOString() : null };
      }
      const after = row.after;
      if (after && !after.deletedAt) {
        if ("restingFrom" in after && state.defaults?.some(record => record.id !== after.id && !record.deletedAt)) throw new ApiError(409, "duplicate_defaults", "日常默认值已存在，请引用已有编号和版本编辑。");
        if ("effectiveFrom" in after && state.profiles.some(record => record.id !== after.id && !record.deletedAt && record.effectiveFrom === after.effectiveFrom)) throw new ApiError(409, "duplicate_profile", "该生效日已有资料，请引用已有编号和版本编辑。");
        if ("date" in after && "restingKcal" in after && state.days.some(record => record.id !== after.id && !record.deletedAt && record.date === after.date)) throw new ApiError(409, "duplicate_day", "该日期已有记录，请引用已有编号和版本编辑。");
        if ("name" in after && after.sourceSystem && after.sourceRecordId && state.activities.some(record => record.id !== after.id && !record.deletedAt && record.sourceSystem === after.sourceSystem && record.sourceRecordId === after.sourceRecordId)) throw new ApiError(409, "duplicate_activity", "这个来源活动已经存在，请引用已有编号和版本。");
      }
      if (after && !row.excluded) { const existing = entries.findIndex(record => record.id === after.id); if (existing >= 0) entries[existing] = after; else entries.push(after); }
    } catch (error) { row.error = error instanceof Error ? error.message : "记录无效。"; }
    return row;
  });
  // 先形成整批草稿，再核对关系，因此“先录总数／先录运动”结果一致。
  for(const row of rows) if(!row.excluded && !row.error && row.after && "name" in row.after){
    const record=row.after, action=row.action, baseline=energyBaseline(state.days.find(day=>!day.deletedAt&&day.date===record.date));
    if("inclusion" in action && action.inclusion!==undefined){
      record.inclusion=baseline?action.inclusion:null;record.inclusionBasis=record.inclusion?baseline:null;
    }
    const prior=row.before && "name" in row.before?row.before:undefined;
    const energyChanged=!prior || activityEnergyChanged(prior,record);
    if(energyChanged && !("inclusion" in action && action.inclusion!==undefined)){record.inclusion=null;record.inclusionBasis=null;}
    if(!record.deletedAt && record.completed && baseline && energyChanged && (!record.inclusion || record.inclusionBasis!==baseline)){
      row.coverageQuestions=[record];row.error="请确认“"+record.name+"”是否已包含在当天录入的总数中。";
    }
  }
  for(const row of rows) if(!row.excluded && !row.error && row.after && "restingKcal" in row.after && "date" in row.after){
    const record=row.after as EnergyDayRecord,prior=row.before && "date" in row.before && "restingKcal" in row.before?row.before as EnergyDayRecord:undefined;
    const baseline=energyBaseline(record);
    if(baseline && baseline!==energyBaseline(prior)){
      const unresolved=state.activities.filter(activity=>!activity.deletedAt&&activity.completed&&activity.date===record.date&&!rows.some(candidate=>!candidate.excluded&&!candidate.error&&candidate.after&&"name" in candidate.after&&candidate.after.id===activity.id&&"inclusion" in candidate.action&&candidate.action.inclusion!=null&&activity.inclusionBasis===baseline));
      if(unresolved.length){row.coverageQuestions=unresolved;row.error="总数或记录方式已改变，请核对 "+unresolved.length+" 项运动是否已包含。";}
    }
  }
  for(const row of rows)if(row.after&&!row.excluded){
    const after=row.after;
    if("date" in after&&"restingKcal" in after){const prior=row.before&&"restingKcal" in row.before&&"date" in row.before?row.before:snapshot.days.filter(day=>!day.deletedAt&&day.date<=after.date).sort((a,b)=>b.date.localeCompare(a.date))[0];row.warnings=numberChangeMessages((["restingKcal","activeKcal","totalKcal"] as const).map(key=>({label:key==="restingKcal"?"静息":key==="activeKcal"?"活动合计":"总消耗",unit:"kcal",value:after[key],previous:prior?.[key]})));}
    else if("name" in after){const prior=row.before&&"name" in row.before?row.before:snapshot.activities.filter(a=>!a.deletedAt&&a.name===after.name&&a.date<=after.date).sort((a,b)=>b.date.localeCompare(a.date))[0];row.warnings=numberChangeMessages([{label:"本次运动计入",unit:"kcal",value:activityCalories(after),previous:prior?activityCalories(prior):null}]);}
  }
  for(const row of rows)if(row.after&&"date" in row.after&&"restingKcal" in row.after)row.day=energyDays(state,[],[row.after.date])[0];
  return rows;
}

export function displayEnergyOperation(row: typeof energyOperation.$inferSelect): EnergyOperationView {
  return { id: row.id, revision: row.revision, status: row.status, rows: row.preview, canConfirm: row.status === "pending" && row.preview.some(row => !row.excluded) && row.preview.every(row => row.excluded || !row.error), expiresAt: row.expiresAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() };
}
export async function getEnergyOperation(db: Pick<Database, "select">, userId: string, id: string) {
  const [row] = await db.select().from(energyOperation).where(and(eq(energyOperation.userId, userId), eq(energyOperation.id, id)));
  if (!row) throw new ApiError(404, "not_found", "消耗操作不存在。");
  return row;
}
function parse(input: unknown): EnergyInput {
  const result = energyInputSchema.safeParse(input);
  if (!result.success) throw new ApiError(400, "invalid_input", result.error.issues[0]?.message ?? "消耗记录无效。");
  return result.data;
}
export async function submitEnergyOperation(db: Database, actor: EnergyActor, raw: unknown) {
  const input = parse(raw);
  if (actor.origin === "ai") requireAiUpserts(input.actions);
  return db.transaction(async tx => {
    await lockOwner(tx, actor.userId);
    if (actor.origin === "ai") {
      if (!actor.identity || actor.identity.userId !== actor.userId) throw new ApiError(401, "invalid_token", "缺少消耗授权。");
      await requireActiveAiToken(tx, actor.identity, true, "energy");
    }
    const [prior] = await tx.select().from(energyOperation).where(and(eq(energyOperation.userId, actor.userId), eq(energyOperation.operationId, input.operationId)));
    if (prior) {
      if (prior.requestDigest !== digest(input) || prior.origin !== actor.origin || prior.tokenId !== (actor.identity?.tokenId ?? null) || prior.oauthConnectionId !== (actor.identity?.oauthConnectionId ?? null)) throw new ApiError(409, "request_conflict", "不能用同一请求编号替换内容或授权。");
      return { ...displayEnergyOperation(prior), repeated: true };
    }
    if (input.actions.some(action => retiredEnergyAction(action.kind))) throw new ApiError(400, "retired_action", "日常默认值和静息公式资料已停用，请记录具体日期的消耗。");
    const state = await readEnergySnapshot(tx, actor.userId);
    const [row] = await tx.insert(energyOperation).values({ id: randomUUID(), userId: actor.userId, operationId: input.operationId, origin: actor.origin, tokenId: actor.identity?.tokenId, oauthConnectionId: actor.identity?.oauthConnectionId, requestDigest: digest(input), snapshotDigest: snapshotDigest(state), payload: input, draft: input, preview: planEnergyActions(input.actions, state), expiresAt: actor.origin === "ai" ? new Date(Date.now() + 15 * 60000) : null }).returning();
    return { ...displayEnergyOperation(row), repeated: false };
  });
}
async function checkCredential(tx: Transaction, row: typeof energyOperation.$inferSelect) {
  if (row.origin !== "ai") return;
  const identity: AiIdentity = row.tokenId ? { userId: row.userId, tokenId: row.tokenId, permission: "write" } : { userId: row.userId, oauthConnectionId: row.oauthConnectionId!, permission: "write" };
  await requireActiveAiToken(tx, identity, true, "energy");
}
export async function reviseEnergyOperation(db: Database, userId: string, id: string, revision: number, actions: EnergyAction[], excluded: number[] = []) {
  return db.transaction(async tx => {
    await lockOwner(tx, userId); const row = await getEnergyOperation(tx, userId, id);
    if (row.status !== "pending" || row.revision !== revision) throw new ApiError(409, "review_changed", "消耗审核已改变，请重新加载。");
    await checkCredential(tx, row);
    const input = parse({ operationId: row.draft.operationId, actions }), state = await readEnergySnapshot(tx, userId);
    const [updated] = await tx.update(energyOperation).set({ draft: input, preview: planEnergyActions(input.actions, state, excluded), snapshotDigest: snapshotDigest(state), revision: row.revision + 1, expiresAt: row.origin === "ai" ? new Date(Date.now() + 15 * 60000) : null }).where(eq(energyOperation.id, row.id)).returning();
    return displayEnergyOperation(updated);
  });
}
async function write(tx: Transaction, userId: string, row: EnergyPreview) {
  const record = row.after!;
  const common = { version: record.version, deletedAt: record.deletedAt ? new Date(record.deletedAt) : null, updatedAt: new Date() };
  if ("restingFrom" in record) {
    const values = { ...common, restingFrom: record.restingFrom, restingKcal: record.restingKcal, zeroActivityFrom: record.zeroActivityFrom };
    if (row.before) await tx.update(energyDefault).set(values).where(and(eq(energyDefault.userId, userId), eq(energyDefault.id, record.id)));
    else await tx.insert(energyDefault).values({ id: record.id, userId, ...values });
  } else if ("effectiveFrom" in record) {
    const values = { ...common, effectiveFrom: record.effectiveFrom, heightCm: record.heightCm, birthDate: record.birthDate, sex: record.sex };
    if (row.before) await tx.update(energyProfile).set(values).where(and(eq(energyProfile.userId, userId), eq(energyProfile.id, record.id)));
    else await tx.insert(energyProfile).values({ id: record.id, userId, ...values });
  } else {
    const source = { timezone: record.timezone, sourceSystem: record.sourceSystem, sourceRecordId: record.sourceRecordId, sourceOccurredAt: record.sourceOccurredAt ? new Date(record.sourceOccurredAt) : null, sourceUnit: record.sourceUnit, syncStatus: record.syncStatus };
    if ("restingKcal" in record) {
      const values = { ...common, ...source, date: record.date, entryMode: record.entryMode ?? null, activityMode: record.activityMode ?? null, restingSourceSystem: record.restingSourceSystem ?? null, activeSourceSystem: record.activeSourceSystem ?? null, restingEstimated: record.restingEstimated ?? false, activeEstimated: record.activeEstimated ?? false, notes: record.notes ?? null, restingKcal: record.restingKcal, activeKcal: record.activeKcal, totalKcal: record.totalKcal };
      if (row.before) await tx.update(energyDay).set(values).where(and(eq(energyDay.userId, userId), eq(energyDay.id, record.id)));
      else await tx.insert(energyDay).values({ id: record.id, userId, ...values });
    } else {
      const values = { ...common, ...source, date: record.date, name: record.name, durationMinutes: record.durationMinutes, caloriesKcal: record.caloriesKcal, calorieMode:record.calorieMode??null,exerciseRestingKcal:record.exerciseRestingKcal??null,exerciseActiveKcal:record.exerciseActiveKcal??null, inclusion:record.inclusion??null,inclusionBasis:record.inclusionBasis??null,completed: record.completed };
      if (row.before) await tx.update(activity).set(values).where(and(eq(activity.userId, userId), eq(activity.id, record.id)));
      else await tx.insert(activity).values({ id: record.id, userId, ...values });
    }
  }
}
export async function decideEnergyOperation(db: Database, userId: string, id: string, revision: number, decision: "confirm" | "cancel", options: {permanentManualDeletion?:boolean} = {}) {
  if (!["confirm", "cancel"].includes(decision)) throw new ApiError(400, "invalid_input", "消耗审核动作无效。");
  return db.transaction(async tx => {
    await lockOwner(tx, userId); const row = await getEnergyOperation(tx, userId, id), status = decision === "confirm" ? "confirmed" : "cancelled";
    if (row.status === status) return displayEnergyOperation(row);
    if (row.status !== "pending" || row.revision !== revision) throw new ApiError(409, "review_changed", "消耗审核已改变，请重新核对。");
    if (decision === "confirm") {
      if(options.permanentManualDeletion&&row.origin!=="manual")throw new ApiError(403,"forbidden","永久删除仅限网页人工确认。");
      await checkCredential(tx, row);
      if (row.expiresAt && row.expiresAt < new Date()) throw new ApiError(409, "expired", "预览已过期，请刷新。");
      if (snapshotDigest(await readEnergySnapshot(tx, userId)) !== row.snapshotDigest) throw new ApiError(409, "snapshot_changed", "消耗资料或记录已改变，请刷新预览。");
      const selected = row.preview.filter(row => !row.excluded);
      if (row.origin === "ai") requireAiUpserts(selected.map(entry => entry.action));
      if (selected.some(entry => retiredEnergyAction(entry.action.kind))) throw new ApiError(400, "retired_action", "日常默认值和静息公式资料已停用，请刷新预览并取消这一项。");
      if (!selected.length || selected.some(row => row.error || !row.after)) throw new ApiError(400, "review_required", "请修改或取消有问题的消耗记录。");
      for (const entry of selected) {
        const permanent=options.permanentManualDeletion&&entry.action.kind.startsWith("delete_");
        if(permanent){const table=entry.action.kind==="delete_energy_day"?energyDay:activity;await tx.delete(table).where(and(eq(table.userId,userId),eq(table.id,entry.before!.id)));}
        else await write(tx, userId, entry);
        await rememberEnergySources(tx, userId, entry);
        const index = row.preview.indexOf(entry);
        await tx.insert(energyEvent).values({ id: randomUUID(), userId, operationId: row.id, recordId: entry.after!.id, recordType: typeOf(entry.action), actorType: row.origin === "ai" ? "ai" : "user", actorId: row.tokenId ?? row.oauthConnectionId ?? userId, confirmedBy: userId, snapshot: { originalInput: row.payload.actions[index] ?? entry.action, action: entry.action, before: entry.before ?? null, after: permanent?null:entry.after!, ...(permanent?{permanentDeletion:true}:{}) } });
      }
    }
    const [updated] = await tx.update(energyOperation).set({ status, revision: row.revision + 1, confirmedAt: decision === "confirm" ? new Date() : null }).where(eq(energyOperation.id, id)).returning();
    return displayEnergyOperation(updated);
  });
}
