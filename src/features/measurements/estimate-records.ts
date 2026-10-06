import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { measurement, measurementEvent } from "../../db/schema";
import type { MeasurementActor, MeasurementTransaction } from "./records";
import { buildHistoricalEstimates, ESTIMATION_METHOD, type HistoricalEstimate } from "./estimation";

export async function supersedeEstimates(tx: MeasurementTransaction, actor: MeasurementActor, analysisDate: string, period: "daytime" | "evening", reason = "observed_replaces_estimate") {
  const before = await tx.select().from(measurement).where(and(eq(measurement.userId, actor.userId), eq(measurement.analysisDate, analysisDate), eq(measurement.period, period), eq(measurement.recordKind, "estimated"), isNull(measurement.deletedAt)));
  for (const row of before) {
    const [after] = await tx.update(measurement).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(measurement.userId, actor.userId), eq(measurement.id, row.id))).returning();
    await tx.insert(measurementEvent).values({ id: randomUUID(), userId: actor.userId, measurementId: row.id, action: "delete", actorType: actor.actorType ?? "user", actorId: actor.actorId, snapshot: { before: row, after, reason } });
  }
  return before.length;
}

/** 调用方必须已锁定归属账号，并与实测及审计使用同一事务。 */
export async function insertEstimate(tx: MeasurementTransaction, actor: MeasurementActor, prediction: HistoricalEstimate, context: { operationKey: string; importId?: string; reason: string }) {
  const [row] = await tx.insert(measurement).values({
    id: randomUUID(), userId: actor.userId, ...prediction, recordKind: "estimated", sourceType: "estimate", entryChannel: "development_backend",
    sourceLocalTime: prediction.analysisDate, localDate: prediction.analysisDate, timePrecision: "day_period", occurredAt: null, timezone: null,
    assignmentMethod: "estimated_target", assignmentRuleVersion: ESTIMATION_METHOD, fasting: prediction.period === "daytime",
    fastingSource: prediction.period === "daytime" ? "estimated_target" : "evening_rule", importId: context.importId,
    originalValues: { analysisDate: prediction.analysisDate, period: prediction.period, weightKg: null, bodyFatPercent: null, reportedTime: null },
    deduplicationKey: createHash("sha256").update(JSON.stringify([ESTIMATION_METHOD, actor.userId, context.operationKey, prediction.analysisDate, prediction.period])).digest("hex"),
    createdBy: actor.actorId,
  }).returning();
  await tx.insert(measurementEvent).values({ id: randomUUID(), userId: actor.userId, measurementId: row.id, action: "estimate", actorType: actor.actorType ?? "user", actorId: actor.actorId,
    snapshot: { after: row, reason: context.reason, operationKey: context.operationKey, importId: context.importId } });
  return row;
}

/** 批次实测写完再刷新：只触及这些日期，模型只读取真实数据。 */
export async function refreshMeasurementDates(tx: MeasurementTransaction, actor: MeasurementActor, dates: string[], context: { operationKey: string; importId?: string; reason: string }) {
  if (!dates.length) return { inserted: 0, deleted: 0 };
  const active = await tx.select().from(measurement).where(and(eq(measurement.userId, actor.userId), isNull(measurement.deletedAt)));
  let inserted = 0, deleted = 0;
  for (const date of [...new Set(dates)].sort()) {
    const { estimates } = buildHistoricalEstimates(active, { start: date, end: date }, { preserveExisting: false });
    for (const period of ["daytime", "evening"] as const) deleted += await supersedeEstimates(tx, actor, date, period, context.reason);
    for (const prediction of estimates) { await insertEstimate(tx, actor, prediction, context); inserted++; }
  }
  return { inserted, deleted };
}
