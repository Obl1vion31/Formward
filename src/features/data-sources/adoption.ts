import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import { dataConnection, dataSourceConflict, energyDayAdoption } from "../../db/schema";
import { ApiError } from "../auth/ai-identity";
import { lockOwner, type Transaction } from "../auth/owner-lock";
import { persistEnergyPreview, planEnergyActions } from "../activities/records";
import type { ActivityRecord, EnergyAction } from "../activities/model";
import { energyFactsChanged } from "./manual-protection";
import { dayComparison, fingerprint, proposeDay, readSourceState, type Fact, type SourceState } from "./state";
import { requireSourceAccess, sourceEvent } from "./mutations";
import type { SourceRecordChange } from "./model";

export const sourceSystemFor = (connectionId: string) => `Garmin Personal:${connectionId}`;
export function duplicateActivityCandidates(fact: Fact, activities: ActivityRecord[]) {
  if (fact.payload.kind !== "activity") return [];
  const incoming = fact.payload;
  return activities.filter(a => {
    if (a.deletedAt || a.date !== fact.date || a.sourceSystem === sourceSystemFor(fact.connectionId) && a.sourceRecordId === fact.sourceRecordId) return false;
    const timeClose = fact.occurredAt && a.sourceOccurredAt && Math.abs(+fact.occurredAt - +new Date(a.sourceOccurredAt)) < 15 * 60000;
    const sameName = incoming.name.toLocaleLowerCase().replace(/\s/g, "") === a.name.toLocaleLowerCase().replace(/\s/g, "");
    const similarDuration = incoming.durationMinutes !== null && a.durationMinutes !== null && Math.abs(Number(incoming.durationMinutes) - Number(a.durationMinutes)) <= Math.max(3, Number(incoming.durationMinutes) * .15);
    const similarCalories = incoming.caloriesKcal !== null && a.caloriesKcal !== null && Math.abs(Number(incoming.caloriesKcal) - Number(a.caloriesKcal)) <= Math.max(15, Number(incoming.caloriesKcal) * .2);
    return !!timeClose || sameName || similarDuration && similarCalories;
  });
}

/** 无猜测地保留疑似重复，用户明确关联、单独采用或忽略。 */
export async function recordActivityConflicts(tx: Transaction, userId: string, state: SourceState) {
  for (const fact of state.facts.filter(f => f.kind === "activity" && state.policy.sources.activities === f.connectionId && state.connections.some(c => c.id === f.connectionId && c.status === "active" && c.metrics.includes("activities")))) {
    const prior = state.conflicts.find(c => c.factId === fact.id);
    if (prior && prior.status !== "pending") continue;
    const existing = state.snapshot.activities.find(a => !a.deletedAt && a.sourceSystem === sourceSystemFor(fact.connectionId) && a.sourceRecordId === fact.sourceRecordId);
    const protectedMove = existing && existing.date !== fact.date && state.adoptions.some(a => a.date === existing.date && a.mode === "manual");
    const candidates = protectedMove ? [existing] : existing ? [] : duplicateActivityCandidates(fact, state.snapshot.activities);
    if (!candidates.length) continue;
    const ids = candidates.map(a => a.id).sort();
    if (prior && fingerprint(ids) === fingerprint([...prior.candidates].sort())) continue;
    await tx.insert(dataSourceConflict).values({ id: prior?.id ?? randomUUID(), userId, factId: fact.id, candidates: ids }).onConflictDoUpdate({ target: [dataSourceConflict.userId, dataSourceConflict.factId], set: { candidates: ids, version: (prior?.version ?? 0) + 1, updatedAt: new Date() } });
  }
}

type AdoptionOptions = { force: boolean; includedActivityIds?: string[]; actor: string; changes?: SourceRecordChange[]; independent?: boolean; historical?: boolean; newActivityIds?: Set<string>; readActivityIds?: Set<string>; issues?: string[] };

function sourceActivityAction(fact: Fact, prior?: ActivityRecord): EnergyAction {
  if (fact.payload.kind !== "activity") throw new Error("Expected activity fact");
  const value = fact.payload;
  return { kind: "save_activity", ...(prior ? { id: prior.id, version: prior.version } : {}), date: fact.date, name: value.name, durationMinutes: value.durationMinutes, calorieMode: "components", exerciseRestingKcal: value.bmrKcal, exerciseActiveKcal: null, completed: true, inclusion: "included", sourceSystem: sourceSystemFor(fact.connectionId), sourceRecordId: fact.sourceRecordId, sourceOccurredAt: fact.occurredAt?.toISOString() ?? null, timezone: fact.timezone };
}

async function markIndependent(tx: Transaction, userId: string, state: SourceState, fact: Fact) {
  const conflict = state.conflicts.find(c => c.factId === fact.id);
  if (conflict?.status === "pending") await tx.update(dataSourceConflict).set({ status: "adopted", version: conflict.version + 1, updatedAt: new Date() }).where(and(eq(dataSourceConflict.userId, userId), eq(dataSourceConflict.id, conflict.id)));
}

/** 保护日只补全新来源明细，不改日汇总、手工事实或已经人工维护／删除的来源运动。 */
async function importActivityDetails(tx: Transaction, userId: string, state: SourceState, date: string, options: AdoptionOptions, protectedDay: boolean) {
  let changed = false;
  for (const fact of state.facts.filter(f => f.kind === "activity" && f.date === date && state.policy.sources.activities === f.connectionId && state.connections.some(c => c.id === f.connectionId && c.status === "active" && c.metrics.includes("activities")))) {
    if (!options.readActivityIds?.has(fact.sourceRecordId)) continue;
    const prior = state.snapshot.activities.find(a => a.sourceSystem === sourceSystemFor(fact.connectionId) && a.sourceRecordId === fact.sourceRecordId);
    if (prior?.deletedAt || protectedDay && (prior || !options.newActivityIds?.has(fact.sourceRecordId))) continue;
    const conflict = state.conflicts.find(c => c.factId === fact.id);
    if (conflict?.status === "ignored" || conflict?.status === "linked") continue;
    const [row] = planEnergyActions([sourceActivityAction(fact, prior)], state.snapshot);
    if (row.error || !row.after || !("name" in row.after)) { options.issues?.push(`${date} 有运动未能载入，来源数据已保留。`); continue; }
    if (fact.payload.kind !== "activity") continue;
    row.after.sourceDetails = fact.payload;
    if (!energyFactsChanged(row.before, row.after) && fingerprint(prior?.sourceDetails ?? null) === fingerprint(row.after.sourceDetails)) continue;
    await persistEnergyPreview(tx, userId, row);
    await markIndependent(tx, userId, state, fact);
    options.changes?.push({ key: "activity:" + row.after.id, version: String(row.after.version) });
    await sourceEvent(tx, userId, fact.connectionId, "import_activity", options.actor, { date, before: row.before ?? null, after: row.after, preservedDay: protectedDay });
    changed = true;
  }
  return changed;
}

export async function adoptDate(tx: Transaction, userId: string, state: SourceState, date: string, options: AdoptionOptions) {
  const previous = state.adoptions.find(a => a.date === date);
  const policy = !options.force && date < state.policy.effectiveFrom && previous?.metadata ? { ...state.policy, strategy: previous.metadata.strategy, sources: previous.metadata.sources } : state.policy;
  const p = proposeDay(state, date, policy);
  const authorized = state.connections.some(c => c.adoptedAt && c.status === "active" && Object.values(policy.sources).includes(c.id));
  if (options.independent && !authorized) return false;
  if (p.reason) { if (options.force) throw new ApiError(409, "source_not_ready", p.reason); return options.independent ? importActivityDetails(tx, userId, state, date, options, previous?.mode === "manual") : false; }
  if (!options.force) {
    const differentManualTotal = !previous && p.record && (p.current.totalKcal === null || p.proposed.total === null || Math.abs(Number(p.current.totalKcal) - Number(p.proposed.total)) > .0001);
    const extra = state.snapshot.activities.some(a => !a.deletedAt && a.date === date && a.inclusion === "additional");
    if (previous?.mode === "manual" || options.independent && (differentManualTotal || extra)) {
      if(options.independent && !previous){
        await tx.insert(energyDayAdoption).values({userId,date,mode:"manual",protectedAt:new Date()}).onConflictDoNothing();
        await sourceEvent(tx,userId,p.used[0]?.connectionId??null,"preserve_manual",options.actor,{date});
      }
      return options.independent ? importActivityDetails(tx, userId, state, date, options, true) : false;
    }
    if (!previous && (date < policy.effectiveFrom && !options.historical || !options.independent && (p.record || state.snapshot.activities.some(a => !a.deletedAt && a.date === date)))) return false;
    if (!authorized) return false;
  }
  const existing = state.snapshot.activities.filter(a => !a.deletedAt && a.date === date), manual = existing.filter(a => !a.sourceSystem?.startsWith("Garmin Personal:"));
  if (options.force && manual.some(a => !options.includedActivityIds?.includes(a.id))) throw new ApiError(409, "activity_inclusion", "请逐项确认现有运动已经包含在来源汇总中；额外运动请保留该天手动记录。");
  if (!options.force && !options.independent && existing.some(a => a.inclusion === "additional" || !a.inclusion && !a.sourceSystem?.startsWith("Garmin Personal:"))) return false;
  const sourceTotal = policy.strategy === "total" && !!policy.sources.total;
  const sourceComponents = policy.strategy === "components" && !!(policy.sources.resting || policy.sources.active);
  const day: EnergyAction = { kind: "save_energy_day", date, ...(p.record ? { id: p.record.id, version: p.record.version } : {}), entryMode: p.modes.entryMode, activityMode: p.modes.activityMode, restingKcal: sourceTotal ? null : sourceComponents ? p.proposed.resting : p.record?.restingKcal ?? null, activeKcal: sourceTotal ? null : sourceComponents ? p.proposed.active : p.record?.activeKcal ?? null, totalKcal: sourceTotal ? p.proposed.total : p.modes.entryMode === "total" ? p.record?.totalKcal ?? null : null, steps: p.proposed.steps, timezone: state.connections.find(c => c.id === (policy.sources.total ?? policy.sources.resting ?? policy.sources.steps))?.timezone ?? p.record?.timezone ?? state.window.timeZone, sourceSystem: p.metadata.label, sourceRecordId: date, restingSourceSystem: sourceComponents ? state.connections.find(c => c.id === policy.sources.resting)?.label ?? p.record?.restingSourceSystem ?? null : null, activeSourceSystem: sourceComponents ? state.connections.find(c => c.id === policy.sources.active)?.label ?? p.record?.activeSourceSystem ?? null : null, sourceOccurredAt: p.metadata.coverageUntil, restingEstimated: false, activeEstimated: false };
  const actions: EnergyAction[] = [day];
  const activityIds = new Set<string>();
  for (const fact of p.activityFacts) {
    if (fact.payload.kind !== "activity") continue;
    const conflict = state.conflicts.find(c => c.factId === fact.id);
    if (conflict && conflict.status !== "adopted" && !(options.independent && conflict.status === "pending")) continue;
    const prior = state.snapshot.activities.find(a => a.sourceSystem === sourceSystemFor(fact.connectionId) && a.sourceRecordId === fact.sourceRecordId);
    if (prior?.deletedAt) continue;
    if (prior && prior.date !== date && state.adoptions.some(a => a.date === prior.date && a.mode === "manual")) continue;
    if (!options.independent && !prior && duplicateActivityCandidates(fact, state.snapshot.activities).length && !conflict) continue;
    // gross kcal 与期间静息保留在来源事实中。未核实纯活动热量前，不自行相减后参与运动累计。
    actions.push(sourceActivityAction(fact, prior));
    if (prior) activityIds.add(prior.id);
  }
  // 日汇总变化后重绑已确认的 included 关系，不能使旧额外运动悄悄消失。
  for (const a of existing) if (!activityIds.has(a.id)) {
    if (a.inclusion === "additional" && !options.force) return false;
    actions.push({ kind: "save_activity", id: a.id, version: a.version, date, name: a.name, durationMinutes: a.durationMinutes, calorieMode: a.calorieMode ?? "total", exerciseRestingKcal: a.exerciseRestingKcal ?? null, exerciseActiveKcal: a.exerciseActiveKcal ?? null, caloriesKcal: a.caloriesKcal, completed: a.completed, inclusion: "included" });
  }
  const rows = planEnergyActions(actions, state.snapshot);
  const error = rows.find(r => r.error); if (error) { if (options.force) throw new ApiError(409, "source_conflict", error.error!); if(options.independent){options.issues?.push(`${date} 的日汇总保持原值。`);return importActivityDetails(tx,userId,state,date,options,true);}return false; }
  // 完全相同的同步不更新正式版本，不使正在编辑的表单无故冲突。
  for(const row of rows){if(!row.after||!("name" in row.after))continue;const fact=p.activityFacts.find(f=>row.after&&"sourceRecordId" in row.after&&f.sourceRecordId===row.after.sourceRecordId&&sourceSystemFor(f.connectionId)===row.after.sourceSystem);if(fact?.payload.kind==="activity")row.after.sourceDetails=fact.payload;}
  const changed = rows.filter(row => energyFactsChanged(row.before, row.after) || row.after&&"sourceDetails" in row.after&&fingerprint(row.after.sourceDetails)!==fingerprint(row.before&&"sourceDetails" in row.before?row.before.sourceDetails:null) || row.before && row.after && "inclusionBasis" in row.after && "inclusionBasis" in row.before && row.before.inclusionBasis !== row.after.inclusionBasis);
  const beforeMeta = previous?.metadata;
  const newMeta = { ...p.metadata, syncedAt: beforeMeta && fingerprint({ ...beforeMeta, syncedAt: null }) === fingerprint({ ...p.metadata, syncedAt: null }) ? beforeMeta.syncedAt : p.metadata.syncedAt };
  const visibleMetadata=(value:typeof beforeMeta)=>value?{strategy:value.strategy,sources:value.sources,restingKcal:value.restingKcal,activeKcal:value.activeKcal,compositionKnown:value.compositionKnown,label:value.label}:null;
  if (fingerprint(previous?.mode==="source"?visibleMetadata(beforeMeta):null)!==fingerprint(visibleMetadata(newMeta)) && !changed.includes(rows[0])) changed.unshift(rows[0]);
  if (!changed.length && previous?.mode === "source" && fingerprint(beforeMeta) === fingerprint(newMeta)) return false;
  for (const row of changed) {
    await persistEnergyPreview(tx, userId, row);
    if (row.after && "date" in row.after) options.changes?.push({ key: "name" in row.after ? "activity:"+row.after.id : "energyDay:"+row.after.date, version:String(row.after.version) });
  }
  if (options.independent) for (const fact of p.activityFacts) if (rows.some(row => row.after && "name" in row.after && row.after.sourceRecordId === fact.sourceRecordId && row.after.sourceSystem === sourceSystemFor(fact.connectionId))) await markIndependent(tx, userId, state, fact);
  await tx.insert(energyDayAdoption).values({ userId, date, mode: "source", metadata: newMeta }).onConflictDoUpdate({ target: [energyDayAdoption.userId, energyDayAdoption.date], set: { mode: "source", metadata: newMeta, protectedAt: null, version: (previous?.version ?? 0) + 1, updatedAt: new Date() } });
  await sourceEvent(tx, userId, p.used[0]?.connectionId ?? p.activityFacts[0]?.connectionId ?? null, "adopt", options.actor, { date, before: p.record, after: changed.includes(rows[0]) ? rows[0].after : p.record, activities: changed.filter(r => r.after && "name" in r.after).map(r => ({ before: r.before ?? null, after: r.after })), metadata: newMeta });
  return true;
}

const adoptSchema = z.object({ days: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), digest: z.string().regex(/^[a-f0-9]{64}$/), includedActivityIds: z.array(z.string().uuid()).max(100) }).strict()).min(1).max(7) }).strict();
export async function adoptSourceDays(db: Database, userId: string, raw: unknown, now = new Date()) {
  requireSourceAccess(userId); const input = adoptSchema.safeParse(raw);
  if (!input.success || new Set(input.data.days.map(d => d.date)).size !== input.data.days.length) throw new ApiError(400, "invalid_input", "请选择有效日期并重新核对来源。 ");
  return db.transaction(async tx => {
    await lockOwner(tx, userId); requireSourceAccess(userId);
    const state = await readSourceState(tx, userId, now);
    for (const item of input.data.days) if (!state.window.dates.includes(item.date) || dayComparison(state, item.date).digest !== item.digest) throw new ApiError(409, "source_changed", "来源或正式记录已经改变，请重新读取对照后采用。 ");
    const changes:SourceRecordChange[]=[];
    for (const item of input.data.days) await adoptDate(tx, userId, state, item.date, { force: true, includedActivityIds: item.includedActivityIds, actor: userId, changes });
    for (const connection of state.connections.filter(c => c.status === "active" && Object.values(state.policy.sources).includes(c.id))) await tx.update(dataConnection).set({ adoptedAt: connection.adoptedAt ?? now, updatedAt: now }).where(and(eq(dataConnection.userId, userId), eq(dataConnection.id, connection.id)));
    return { dates: input.data.days.map(d => d.date), changes };
  });
}

const resolveSchema = z.object({ id: z.string().uuid(), version: z.number().int().positive(), decision: z.enum(["adopt", "link", "ignore"]), activityId: z.string().uuid().nullable(), activityVersion: z.number().int().positive().nullable() }).strict();
export async function resolveSourceConflict(db: Database, userId: string, raw: unknown) {
  requireSourceAccess(userId); const input = resolveSchema.safeParse(raw); if (!input.success) throw new ApiError(400, "invalid_input", "冲突处理请求无效。");
  await db.transaction(async tx => {
    await lockOwner(tx, userId); requireSourceAccess(userId);
    const state = await readSourceState(tx, userId), value = input.data, conflict = state.conflicts.find(c => c.id === value.id);
    if (!conflict || conflict.status !== "pending" || conflict.version !== value.version) throw new ApiError(409, "source_changed", "冲突已改变，请重新读取。");
    const linked = value.decision === "link" ? state.snapshot.activities.find(a => a.id === value.activityId && !a.deletedAt && a.version === value.activityVersion && conflict.candidates.includes(a.id)) : null;
    if (value.decision === "link" && !linked) throw new ApiError(409, "source_changed", "原运动已改变或不属于此冲突，请重新读取。");
    await tx.update(dataSourceConflict).set({ status: value.decision === "adopt" ? "adopted" : value.decision === "link" ? "linked" : "ignored", linkedActivityId: linked?.id ?? null, version: conflict.version + 1, updatedAt: new Date() }).where(and(eq(dataSourceConflict.userId, userId), eq(dataSourceConflict.id, conflict.id)));
    await sourceEvent(tx, userId, null, "resolve_conflict", userId, { id: conflict.id, decision: value.decision, linkedActivityId: linked?.id ?? null });
  });
}
