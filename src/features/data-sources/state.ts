import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { dataConnection, dataSourceConflict, dataSourceFact, dataSourcePolicy, energyDayAdoption } from "../../db/schema";
import { readEnergySnapshot } from "../activities/records";
import { energyDays, energyModes } from "../activities/model";
import { credentialRegion } from "./credentials";
import { sevenDays } from "../garmin/client";
import { emptySources, metricLabels, sourceAccessEnabled, type AdoptionMetadata, type ConnectionView, type DailyFact, type ComparisonDay, type SourcePolicy, type SourcesView } from "./model";
export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type Connection = typeof dataConnection.$inferSelect;
export type Fact = typeof dataSourceFact.$inferSelect;

/** 管理连接不需要读取健康快照、历史差异或运动清单。 */
export async function loadSourceSettings(db: Pick<Database, "select">, userId: string, now = new Date()) {
  const enabled = sourceAccessEnabled(userId);
  const connection = enabled ? await loadEnergyConnection(db, userId) : null;
  return { enabled, connections: connection ? [connection] : [], today: sevenDays(now, connection?.timezone).to };
}

/** 普通消耗页只读取连接元数据，不为状态条重新查询七日健康对照。 */
export async function loadEnergyConnection(db: Pick<Database, "select">, userId: string): Promise<ConnectionView | null> {
  if (!sourceAccessEnabled(userId)) return null;
  const [c] = await db.select({ credential:dataConnection.credential,id:dataConnection.id,label:dataConnection.label,provider:dataConnection.provider,status:dataConnection.status,metrics:dataConnection.metrics,timezone:dataConnection.timezone,version:dataConnection.version,adoptedAt:dataConnection.adoptedAt,syncStartedAt:dataConnection.syncStartedAt,lastAttemptAt:dataConnection.lastAttemptAt,lastSuccessAt:dataConnection.lastSuccessAt,lastError:dataConnection.lastError }).from(dataConnection).where(and(eq(dataConnection.userId,userId),eq(dataConnection.provider,"garmin-personal")));
  return c ? { id:c.id,label:c.label,provider:c.provider,region:credentialRegion(c.credential),status:c.status,metrics:c.metrics,timezone:c.timezone,version:c.version,adopted:!!c.adoptedAt,syncing:!!c.syncStartedAt&&Date.now()-+c.syncStartedAt<90000,lastAttemptAt:c.lastAttemptAt?.toISOString()??null,lastSuccessAt:c.lastSuccessAt?.toISOString()??null,error:c.lastError } : null;
}

export async function readSourceState(db: Pick<Database, "select">, userId: string, now = new Date()) {
  const connections = await db.select().from(dataConnection).where(eq(dataConnection.userId, userId)).orderBy(asc(dataConnection.id));
  const zone = connections[0]?.timezone ?? "Asia/Shanghai", window = sevenDays(now, zone);
  const [saved] = await db.select().from(dataSourcePolicy).where(eq(dataSourcePolicy.userId, userId));
  const policy: SourcePolicy = saved ? { strategy: saved.strategy, sources: saved.sources, version: saved.version, effectiveFrom: saved.effectiveFrom } : { strategy: "total", sources: emptySources(), effectiveFrom: window.to, version: 0 };
  const facts = await db.select().from(dataSourceFact).where(eq(dataSourceFact.userId, userId)).orderBy(asc(dataSourceFact.id));
  const adoptions = await db.select().from(energyDayAdoption).where(eq(energyDayAdoption.userId, userId));
  const conflicts = await db.select().from(dataSourceConflict).where(eq(dataSourceConflict.userId, userId));
  return { connections, policy, facts, adoptions, conflicts, snapshot: await readEnergySnapshot(db, userId), window };
}
export type SourceState = Awaited<ReturnType<typeof readSourceState>>;

export function proposeDay(state: SourceState, date: string, policy = state.policy) {
  const current = energyDays(state.snapshot, [], [date])[0], record = current.record;
  const chosen = (metric: "total" | "resting" | "active" | "steps") => {
    const connectionId = policy.sources[metric], connection = state.connections.find(c => c.id === connectionId);
    const fact = connection?.status === "active" && connection.lastSuccessAt && connection.metrics.includes(metric) ? state.facts.find(f => f.connectionId === connectionId && f.kind === "day" && f.date === date && f.payload.kind === "day" && f.payload.metrics?.includes(metric)) : undefined;
    return fact?.payload.kind === "day" ? { fact, value: fact.payload[metric] } : null;
  };
  const total = chosen("total"), resting = chosen("resting"), active = chosen("active"), steps = chosen("steps");
  const select = (metric: "total" | "resting" | "active") => policy.sources[metric] ? chosen(metric)?.value as string | null | undefined ?? null : policy.strategy === "components" && (policy.sources.resting || policy.sources.active) ? null : current[metric === "total" ? "totalKcal" : metric === "resting" ? "restingKcal" : "activeKcal"];
  const proposed = { total: policy.strategy === "total" ? select("total") : select("resting") !== null && select("active") !== null ? String(Math.round((Number(select("resting")) + Number(select("active"))) * 10000) / 10000) : null, resting: select("resting"), active: select("active"), steps: policy.sources.steps ? steps?.value as number | null | undefined ?? null : record?.steps ?? null };
  const used = [...new Map([total, resting, active, steps].filter(x => x !== null).map(x => [x!.fact.id, x!.fact])).values()];
  const sameParts = total && resting && active && total.fact.id === resting.fact.id && total.fact.id === active.fact.id && total.value !== null && resting.value !== null && active.value !== null && Math.abs(Number(total.value) - Number(resting.value) - Number(active.value)) <= 1;
  const componentSources = [policy.sources.resting, policy.sources.active].filter(Boolean), componentFacts = [resting?.fact, active?.fact].filter((v): v is Fact => !!v);
  // 跨来源仅在来源日历边界相同且用户明确选择 components 时相加；占比图要求同一快照。
  const zones = new Set(state.connections.filter(c => componentSources.includes(c.id)).map(c => c.timezone));
  let reason: string | null = zones.size > 1 && policy.strategy === "components" ? "静息与活动的来源时区不同，请统一日期边界。" : null;
  for (const metric of ["total", "resting", "active", "steps"] as const) if (policy.sources[metric] && !chosen(metric)) reason ??= `${metricLabels[metric]}来源尚未读取本日数据。`;
  const activityConnection = state.connections.find(c => c.id === policy.sources.activities && c.status === "active" && c.lastSuccessAt && c.metrics.includes("activities"));
  const activityFacts = activityConnection ? state.facts.filter(f => f.connectionId === activityConnection.id && f.kind === "activity" && f.date === date) : [];
  if (!used.length && !activityFacts.length) reason ??= "还没有选中来源的可用数据。";
  if (used.length && ![proposed.total, proposed.resting, proposed.active, proposed.steps].some(v => v !== null) && !activityFacts.length) reason ??= "来源数值尚未就绪，保留现有记录。";
  const metadata: AdoptionMetadata = { compositionKnown:false, strategy: policy.strategy, sources: policy.sources, facts: used.map(f => ({ connectionId: f.connectionId, factId: f.id, version: f.version })), restingKcal: policy.strategy === "total" ? sameParts ? proposed.resting : null : proposed.resting, activeKcal: policy.strategy === "total" ? sameParts ? proposed.active : null : proposed.active, coverageUntil: (total?.fact.payload as DailyFact | undefined)?.coverageUntil ?? null, syncedAt: used.map(f => f.observedAt.toISOString()).sort().at(-1) ?? new Date(0).toISOString(), label: [...new Set(state.connections.filter(c => used.some(f => f.connectionId === c.id) || activityConnection?.id === c.id).map(c => c.label))].join("、") || "手动" };
  const autoComponents = policy.strategy === "components" && componentFacts.length === 2 && componentFacts[0].id === componentFacts[1].id && proposed.resting !== null && proposed.active !== null;
  const modes = policy.strategy === "total" && policy.sources.total ? { entryMode: "total" as const, activityMode: "total" as const } : policy.strategy === "components" && (policy.sources.resting || policy.sources.active) ? { entryMode: "components" as const, activityMode: "total" as const } : record ? energyModes(record) : { entryMode: "components" as const, activityMode: "total" as const };
  metadata.compositionKnown = !!sameParts || autoComponents;
  return { current, record, proposed, used, reason, metadata, modes, activityFacts, allowComposition: metadata.compositionKnown };
}

export function dayComparison(state: SourceState, date: string): ComparisonDay {
  const proposal = proposeDay(state, date), adoption = state.adoptions.find(a => a.date === date);
  const activities = state.snapshot.activities.filter(a => !a.deletedAt && a.date === date);
  return { date, digest: fingerprint({ policy: state.policy, connections: state.connections.map(c => [c.id, c.version, c.status, c.accessVersion, c.adoptedAt]), facts: state.facts.filter(f => f.date === date).map(f => [f.id, f.version, f.digest]), day: proposal.record, activities, adoption, conflicts: state.conflicts.filter(c => state.facts.some(f => f.id === c.factId && f.date === date)) }), current: { total: proposal.current.totalKcal, resting: proposal.current.restingKcal, active: proposal.current.activeKcal, steps: proposal.record?.steps ?? null }, proposed: proposal.proposed, mode: adoption?.mode ?? "unadopted", canAdopt: !proposal.reason, reason: proposal.reason, activityCount: proposal.activityFacts.length, manualActivities: activities.filter(a => !a.sourceSystem?.startsWith("Garmin Personal:")).map(a => ({ id: a.id, name: a.name, version: a.version })), coverageUntil: proposal.metadata.coverageUntil };
}

export async function loadSources(db: Pick<Database, "select">, userId: string, now = new Date()): Promise<SourcesView> {
  if (!sourceAccessEnabled(userId)) return { enabled: false, connections: [], policy: { strategy: "total", sources: emptySources(), effectiveFrom: sevenDays(now).to, version: 0 }, comparison: [], conflicts: [], today: sevenDays(now).to };
  const state = await readSourceState(db, userId, now);
  return { enabled: true, connections: state.connections.map(c => ({ id: c.id, label: c.label, provider: c.provider, region: credentialRegion(c.credential), status: c.status, metrics: c.metrics, timezone: c.timezone, version: c.version, adopted: !!c.adoptedAt, syncing: !!c.syncStartedAt && +now - +c.syncStartedAt < 90000, lastAttemptAt: c.lastAttemptAt?.toISOString() ?? null, lastSuccessAt: c.lastSuccessAt?.toISOString() ?? null, error: c.lastError })), policy: state.policy, comparison: state.window.dates.map(date => dayComparison(state, date)), conflicts: state.conflicts.filter(c => c.status === "pending" && state.facts.some(f=>f.id===c.factId&&state.policy.sources.activities===f.connectionId&&state.connections.some(conn=>conn.id===f.connectionId&&conn.status==="active"&&conn.metrics.includes("activities")))).flatMap(c => { const fact = state.facts.find(f => f.id === c.factId); return fact?.payload.kind === "activity" ? [{ id: c.id, version: c.version, date: fact.date, name: fact.payload.name, sourceId: fact.sourceRecordId, candidates: state.snapshot.activities.filter(a => c.candidates.includes(a.id) && !a.deletedAt).map(a => ({ id: a.id, version: a.version, name: a.name, durationMinutes: a.durationMinutes, caloriesKcal: a.caloriesKcal })) }] : []; }), today: state.window.to };
}
