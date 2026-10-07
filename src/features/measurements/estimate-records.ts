import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { measurement, measurementEvent } from "../../db/schema";
import { getInitializationBatch, isFrozenDate } from "./initialization";
import type { MeasurementActor, MeasurementTransaction } from "./records";
import { buildHistoricalEstimates, isInitializationEstimate, type HistoricalEstimate } from "./estimation";

export async function supersedeEstimates(tx: MeasurementTransaction, actor: MeasurementActor, analysisDate: string, period: "daytime" | "evening", reason = "observed_replaces_estimate") {
  const before = await tx.select().from(measurement).where(and(eq(measurement.userId, actor.userId), eq(measurement.analysisDate, analysisDate), eq(measurement.period, period), eq(measurement.recordKind, "estimated"), isNull(measurement.deletedAt)));
  const frozen = isFrozenDate(await getInitializationBatch(tx, actor.userId), analysisDate);
  const observed = await tx.select().from(measurement).where(and(eq(measurement.userId, actor.userId), eq(measurement.analysisDate, analysisDate), eq(measurement.period, period), eq(measurement.recordKind, "observed"), isNull(measurement.deletedAt)));
  let deleted = 0;
  for (const row of before) {
    let replacement: Partial<typeof measurement.$inferInsert> = { deletedAt: new Date(), updatedAt: new Date() };
    if (frozen || reason === "observed_replaces_estimate") {
      if (frozen && !isInitializationEstimate(row.estimation)) throw new Error("冻结范围内不能修改非初始化估计。");
      const weightReplaced = row.weightKg !== null && observed.some(real => real.weightKg !== null);
      const fatReplaced = row.bodyFatPercent !== null && observed.some(real => real.bodyFatPercent !== null);
      if (!weightReplaced && !fatReplaced) continue;
      const weightKg = weightReplaced ? null : row.weightKg, bodyFatPercent = fatReplaced ? null : row.bodyFatPercent;
      // 两个指标都替代时保留旧快照软删除；部分替代仅移除对应指标。
      const metadata = row.estimation;
      if (weightKg !== null || bodyFatPercent !== null) replacement = { weightKg, bodyFatPercent, estimation: metadata ? metadata.method === "linear-trend-v1"
        ? { ...metadata, weightKg: weightReplaced ? null : metadata.weightKg, bodyFatPercent: fatReplaced ? null : metadata.bodyFatPercent }
        : { ...metadata, weightKg: weightReplaced ? null : metadata.weightKg, bodyFatPercent: fatReplaced ? null : metadata.bodyFatPercent } : null, updatedAt: new Date() };
    }
    const [after] = await tx.update(measurement).set(replacement).where(and(eq(measurement.userId, actor.userId), eq(measurement.id, row.id))).returning();
    await tx.insert(measurementEvent).values({ id: randomUUID(), userId: actor.userId, measurementId: row.id, action: after.deletedAt ? "delete" : "update", actorType: actor.actorType ?? "user", actorId: actor.actorId, snapshot: { before: row, after, reason: frozen ? "observed_replaces_initialized_metric" : reason } });
    if (after.deletedAt) deleted++;
  }
  return deleted;
}

/** 调用方必须已锁定归属账号，并与实测及审计使用同一事务。 */
export async function insertEstimate(tx: MeasurementTransaction, actor: MeasurementActor, prediction: HistoricalEstimate, context: { operationKey: string; importId?: string; reason: string; entryChannel?: "manual" | "api" | "development_backend" }) {
  const frozen = isFrozenDate(await getInitializationBatch(tx, actor.userId), prediction.analysisDate);
  if (frozen) throw new Error("历史初始化范围已冻结，不能新增估计。");
  const [row] = await tx.insert(measurement).values({
    id: randomUUID(), userId: actor.userId, ...prediction, recordKind: "estimated", sourceType: "estimate", entryChannel: context.entryChannel ?? "development_backend",
    sourceLocalTime: prediction.analysisDate, localDate: prediction.analysisDate, timePrecision: "day_period", occurredAt: null, timezone: null,
    assignmentMethod: "estimated_target", assignmentRuleVersion: prediction.estimation.method, fasting: prediction.period === "daytime",
    fastingSource: prediction.period === "daytime" ? "estimated_target" : "evening_rule", importId: context.importId,
    originalValues: { analysisDate: prediction.analysisDate, period: prediction.period, weightKg: null, bodyFatPercent: null, reportedTime: null },
    deduplicationKey: createHash("sha256").update(JSON.stringify([prediction.estimation.method, actor.userId, context.operationKey, prediction.analysisDate, prediction.period])).digest("hex"),
    createdBy: actor.actorId,
  }).returning();
  await tx.insert(measurementEvent).values({ id: randomUUID(), userId: actor.userId, measurementId: row.id, action: "estimate", actorType: actor.actorType ?? "user", actorId: actor.actorId,
    snapshot: { after: row, reason: context.reason, operationKey: context.operationKey, importId: context.importId } });
  return row;
}

/** 批次实测写完再刷新：只触及这些日期，模型只读取真实数据。 */
export async function refreshMeasurementDates(tx: MeasurementTransaction, actor: MeasurementActor, dates: string[], context: { operationKey: string; importId?: string; reason: string }) {
  if (!dates.length) return { inserted: 0, deleted: 0 };
  const initialization = await getInitializationBatch(tx, actor.userId);
  const active = await tx.select().from(measurement).where(and(eq(measurement.userId, actor.userId), isNull(measurement.deletedAt)));
  let inserted = 0, deleted = 0;
  for (const date of [...new Set(dates)].sort()) {
    if (isFrozenDate(initialization, date)) {
      for (const period of ["daytime", "evening"] as const) deleted += await supersedeEstimates(tx, actor, date, period, context.reason);
      continue;
    }
    const { estimates } = buildHistoricalEstimates(active, { start: date, end: date }, { preserveExisting: false });
    for (const period of ["daytime", "evening"] as const) deleted += await supersedeEstimates(tx, actor, date, period, context.reason);
    for (const prediction of estimates) { await insertEstimate(tx, actor, prediction, context); inserted++; }
  }
  return { inserted, deleted };
}
