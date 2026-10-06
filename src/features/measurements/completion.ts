import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db/client";
import { measurement, measurementEvent, measurementImport } from "../../db/schema";
import { buildHistoricalEstimates } from "./estimation";
import type { DailyMeasurement } from "./days";
import { calendarOrdinal, type MeasurementInterval } from "./trend";
import { insertReportedMeasurement, lockMeasurementOwner, supersedeEstimates, validateReportedMeasurement, type MeasurementActor, type ReportedMeasurement } from "./records";

export type HistoricalCompletionRequest = {
  operationId: string;
  range: MeasurementInterval;
  trainingRange: MeasurementInterval;
  deviceName: string;
  companionApp: string;
  records: ReportedMeasurement[];
};
type MeasurementRow = typeof measurement.$inferSelect;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function normalizeRequest(input: HistoricalCompletionRequest) {
  if (!input.operationId?.trim() || input.operationId.length > 120 || !input.deviceName?.trim() || input.deviceName.length > 200 || !input.companionApp?.trim() || input.companionApp.length > 100 || !Array.isArray(input.records) || input.records.length > 56) throw new Error("历史补全请求无效。");
  if (calendarOrdinal(input.range.start) > calendarOrdinal(input.range.end) || calendarOrdinal(input.trainingRange.start) > calendarOrdinal(input.trainingRange.end) || calendarOrdinal(input.trainingRange.end) - calendarOrdinal(input.trainingRange.start) > 27 || input.range.start < input.trainingRange.start || input.range.end > input.trainingRange.end) throw new Error("补全范围须位于最多 28 天的训练阶段内。");
  const records = input.records.map(validateReportedMeasurement).sort((a, b) => a.deduplicationKey.localeCompare(b.deduplicationKey));
  if (records.some((row) => row.analysisDate < input.trainingRange.start || row.analysisDate > input.trainingRange.end) || new Set(records.map((row) => `${row.analysisDate}:${row.period}`)).size !== records.length) throw new Error("新实测须位于训练阶段内，每时段最多提供一条。");
  return { operationId: input.operationId.trim(), range: { start: input.range.start, end: input.range.end }, trainingRange: { start: input.trainingRange.start, end: input.trainingRange.end }, deviceName: input.deviceName.trim(), companionApp: input.companionApp.trim(), records };
}

function projectRows(rows: MeasurementRow[], request: ReturnType<typeof normalizeRequest>) {
  const projected: DailyMeasurement[] = rows.filter((row) => row.deletedAt === null);
  const additions: ReturnType<typeof validateReportedMeasurement>[] = [];
  for (const record of request.records) {
    const samePeriod = rows.filter((row) => row.recordKind === "observed" && row.analysisDate === record.analysisDate && row.period === record.period);
    if (samePeriod.some((row) => (row.deletedAt === null && row.weightKg === record.weightKg && (record.bodyFatPercent === null || row.bodyFatPercent === record.bodyFatPercent) && (record.bmi === null || row.bmi === record.bmi)) || row.deduplicationKey === record.deduplicationKey)) continue;
    if (samePeriod.some((row) => row.deletedAt === null)) throw new Error("新实测对应时段已有不同数值，请先核对。");
    additions.push(record);
    projected.push({ ...record, id: `reported:${record.deduplicationKey}`, recordKind: "observed" });
  }
  const predicted = buildHistoricalEstimates(projected, request.range, request.trainingRange);
  const annotateIds = rows.filter((row) => row.recordKind === "observed" && row.analysisDate >= request.trainingRange.start && row.analysisDate <= request.trainingRange.end && (row.entryChannel !== "development_backend" || row.deviceName !== request.deviceName || row.companionApp !== request.companionApp)).map((row) => row.id);
  return { additions, annotateIds, ...predicted };
}

function makePreview(rows: MeasurementRow[], userId: string, request: ReturnType<typeof normalizeRequest>) {
  const result = projectRows(rows, request);
  return { requestKey: hash(["historical-completion-v1", userId, request]), digest: hash([userId, request, [...rows].sort((a, b) => a.id.localeCompare(b.id))]), ...result };
}

export async function previewHistoricalCompletion(db: Database, userId: string, input: HistoricalCompletionRequest) {
  if (!userId?.trim()) throw new Error("缺少经过验证的账号。");
  const request = normalizeRequest(input);
  const rows = await db.select().from(measurement).where(eq(measurement.userId, userId));
  const preview = makePreview(rows, userId, request);
  const [batch] = await db.select({ id: measurementImport.id }).from(measurementImport).where(and(eq(measurementImport.userId, userId), eq(measurementImport.fileDigest, preview.requestKey)));
  return { ...preview, alreadyApplied: Boolean(batch) };
}

/** 已授权的开发维护入口；仅在显式调用时修正来源、写入实测与历史估计。 */
export async function applyHistoricalCompletion(db: Database, input: MeasurementActor & { request: HistoricalCompletionRequest; digest: string }) {
  if (!input.userId?.trim() || input.actorId !== input.userId || !/^[a-f0-9]{64}$/.test(input.digest)) throw new Error("补全操作者或预览摘要无效。");
  const request = normalizeRequest(input.request);
  const requestKey = hash(["historical-completion-v1", input.userId, request]);
  return db.transaction(async (tx) => {
    await lockMeasurementOwner(tx, input.userId);
    const [prior] = await tx.select().from(measurementImport).where(and(eq(measurementImport.userId, input.userId), eq(measurementImport.fileDigest, requestKey)));
    if (prior) return { importId: prior.id, observedInserted: 0, estimatesInserted: 0, annotated: 0, repeated: true };
    const rows = await tx.select().from(measurement).where(eq(measurement.userId, input.userId)).for("update");
    const preview = makePreview(rows, input.userId, request);
    if (preview.digest !== input.digest) throw new Error("记录已变化，请重新预览；没有写入。");
    const [batch] = await tx.insert(measurementImport).values({ id: randomUUID(), userId: input.userId, fileDigest: requestKey, sourceLabel: `历史来源与估计补全 · ${request.operationId}`, captureChannel: "development_backend", insertedCount: 0, skippedCount: 0, createdBy: input.actorId }).returning();
    for (const id of preview.annotateIds) {
      const before = rows.find((row) => row.id === id)!;
      const [after] = await tx.update(measurement).set({ entryChannel: "development_backend", deviceName: request.deviceName, companionApp: request.companionApp, updatedAt: new Date() }).where(and(eq(measurement.userId, input.userId), eq(measurement.id, id))).returning();
      await tx.insert(measurementEvent).values({ id: randomUUID(), userId: input.userId, measurementId: id, action: "update", actorType: input.actorType ?? "development_backend", actorId: input.actorId, snapshot: { before, after, reason: "user_confirmed_provenance", operationDigest: input.digest, importId: batch.id } });
    }
    let observedInserted = 0;
    for (const record of preview.additions) if (await insertReportedMeasurement(tx, input, record, batch.id, { entryChannel: "development_backend", deviceName: request.deviceName, companionApp: request.companionApp })) observedInserted++;
    const active = await tx.select().from(measurement).where(and(eq(measurement.userId, input.userId), isNull(measurement.deletedAt)));
    const { estimates, warnings } = buildHistoricalEstimates(active, request.range, request.trainingRange);
    for (const prediction of estimates) {
      await supersedeEstimates(tx, input, prediction.analysisDate, prediction.period, "estimate_replaced");
      const [row] = await tx.insert(measurement).values({ id: randomUUID(), userId: input.userId,
        ...prediction, recordKind: "estimated", entryChannel: "development_backend", sourceType: "estimate", sourceSystem: null,
        sourceLocalTime: prediction.analysisDate, localDate: prediction.analysisDate, timePrecision: "day_period", timezone: null, occurredAt: null,
        assignmentMethod: "estimated_target", assignmentRuleVersion: "reported-period-v1", fasting: prediction.period === "daytime",
        fastingSource: prediction.period === "daytime" ? "estimated_target" : "evening_rule", importId: batch.id,
        originalValues: { analysisDate: prediction.analysisDate, period: prediction.period, weightKg: null, bodyFatPercent: null, reportedTime: null },
        deduplicationKey: hash(["historical-estimate-v1", requestKey, prediction.analysisDate, prediction.period]), createdBy: input.actorId,
      }).returning();
      await tx.insert(measurementEvent).values({ id: randomUUID(), userId: input.userId, measurementId: row.id, action: "estimate", actorType: input.actorType ?? "development_backend", actorId: input.actorId, snapshot: { after: row, operationDigest: input.digest, importId: batch.id } });
    }
    await tx.update(measurementImport).set({ insertedCount: observedInserted + estimates.length, skippedCount: request.records.length - observedInserted }).where(and(eq(measurementImport.userId, input.userId), eq(measurementImport.id, batch.id)));
    return { importId: batch.id, observedInserted, estimatesInserted: estimates.length, annotated: preview.annotateIds.length, warnings, repeated: false };
  });
}
