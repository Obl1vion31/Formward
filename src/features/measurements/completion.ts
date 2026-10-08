import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import type { Database } from "../../db/client";
import { measurement, measurementEvent, measurementImport } from "../../db/schema";
import { buildHistoricalEstimates } from "./estimation";
import { getInitializationBatch } from "./initialization";
import { insertEstimate, refreshMeasurementDates } from "./estimate-records";
import type { DailyMeasurement } from "./days";
import { calendarOrdinal, type MeasurementInterval } from "./trend";
import { insertReportedMeasurement, lockMeasurementOwner, resolveReportedMeasurement, validateReportedMeasurement, type MeasurementActor, type ReportedMeasurement } from "./records";

import { rememberMeasurementSource, validateDeviceLabel } from "./sources";

export type HistoricalCompletionRequest = {
  operationId: string;
  range: MeasurementInterval;
  trainingRange: MeasurementInterval;
  deviceLabel: string;
  records: ReportedMeasurement[];
};
type MeasurementRow = typeof measurement.$inferSelect;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// 保留旧批次幂等身份；这里只生成旧格式指纹，不恢复旧业务字段或改写历史。
function completionKeys(userId: string, request: ReturnType<typeof normalizeRequest>) {
  const legacy = { ...request, records: request.records.map(row => ({
    analysisDate: row.recordDate, localDate: row.sourceLocalTime.slice(0, 10), period: row.period, sourceLocalTime: row.sourceLocalTime,
    timezone: row.timezone, occurredAt: row.occurredAt, utcOffsetMinutes: row.utcOffsetMinutes, timePrecision: row.timePrecision,
    assignmentMethod: row.assignmentMethod, assignmentRuleVersion: row.assignmentRuleVersion, fasting: row.fasting, fastingSource: row.fastingSource,
    weightKg: row.weightKg, bodyFatPercent: row.bodyFatPercent, deduplicationKey: row.deduplicationKey,
    originalValues: { analysisDate: row.originalValues.recordDate, period: row.originalValues.period, reportedTime: row.originalValues.reportedTime,
      assumedTime: row.originalValues.assumedTime, weightKg: row.originalValues.weightKg, bodyFatPercent: row.originalValues.bodyFatPercent },
  })) };
  return [hash(["historical-completion-v3", userId, request]), hash(["historical-completion-v2", userId, legacy])] as const;
}

function normalizeRequest(input: HistoricalCompletionRequest) {
  if (!input.operationId?.trim() || input.operationId.length > 120 || !Array.isArray(input.records) || input.records.length > 56) throw new Error("历史补全请求无效。");
  if (calendarOrdinal(input.range.start) > calendarOrdinal(input.range.end) || calendarOrdinal(input.trainingRange.start) > calendarOrdinal(input.trainingRange.end) || calendarOrdinal(input.trainingRange.end) - calendarOrdinal(input.trainingRange.start) > 27 || input.range.start < input.trainingRange.start || input.range.end > input.trainingRange.end) throw new Error("补全范围须位于最多 28 天的训练阶段内。");
  const records = input.records.map(validateReportedMeasurement).sort((a, b) => a.deduplicationKey.localeCompare(b.deduplicationKey));
  if (records.some((row) => row.recordDate < input.trainingRange.start || row.recordDate > input.trainingRange.end) || new Set(records.map((row) => `${row.recordDate}:${row.period}`)).size !== records.length) throw new Error("新实测须位于训练阶段内，每时段最多提供一条。");
  return { operationId: input.operationId.trim(), range: { start: input.range.start, end: input.range.end }, trainingRange: { start: input.trainingRange.start, end: input.trainingRange.end }, deviceLabel: validateDeviceLabel(input.deviceLabel), records };
}

function projectRows(rows: MeasurementRow[], request: ReturnType<typeof normalizeRequest>, frozenRange?: MeasurementInterval) {
  const projected: DailyMeasurement[] = rows.filter((row) => row.deletedAt === null);
  const additions: ReturnType<typeof validateReportedMeasurement>[] = [];
  for (const record of request.records) {
    const samePeriod = rows.filter((row) => row.recordKind === "observed" && row.recordDate === record.recordDate && row.period === record.period);
    const resolution = resolveReportedMeasurement(samePeriod, record);
    if (resolution.kind === "duplicate") continue;
    additions.push(record);
    if (resolution.kind === "supplement") {
      const index = projected.findIndex(row => row.id === resolution.row.id);
      projected[index] = { ...projected[index], weightKg: resolution.row.weightKg ?? record.weightKg, bodyFatPercent: resolution.row.bodyFatPercent ?? record.bodyFatPercent };
    } else projected.push({ ...record, id: `reported:${record.deduplicationKey}`, recordKind: "observed" });
  }
  const affectedDates = new Set(additions.map(row => row.recordDate));
  const frozen = (date: string) => !!frozenRange && date >= frozenRange.start && date <= frozenRange.end;
  const refreshed = projected.flatMap(row => {
    if (row.recordKind !== "estimated" || !affectedDates.has(row.recordDate)) return [row];
    if (!frozen(row.recordDate)) return [];
    const actual = projected.filter(real => real.recordKind !== "estimated" && real.recordDate === row.recordDate && real.period === row.period);
    const remaining = { ...row, weightKg: actual.some(real => real.weightKg !== null) ? null : row.weightKg, bodyFatPercent: actual.some(real => real.bodyFatPercent !== null) ? null : row.bodyFatPercent };
    return remaining.weightKg !== null || remaining.bodyFatPercent !== null ? [remaining] : [];
  });
  const predicted = buildHistoricalEstimates(refreshed, request.range, { frozenRange });
  for (const date of affectedDates) {
    if (frozen(date)) continue;
    const sameDay = buildHistoricalEstimates(refreshed, { start: date, end: date }, { preserveExisting: false });
    for (const estimate of sameDay.estimates) if (!predicted.estimates.some(row => row.recordDate === estimate.recordDate && row.period === estimate.period)) predicted.estimates.push(estimate);
    predicted.warnings.push(...sameDay.warnings);
  }
  predicted.warnings = [...new Set(predicted.warnings)];
  const annotateIds = rows.filter((row) => row.recordKind === "observed" && row.recordDate >= request.trainingRange.start && row.recordDate <= request.trainingRange.end && (row.entryChannel !== "development_backend" || row.deviceLabel !== request.deviceLabel)).map((row) => row.id);
  return { additions, annotateIds, ...predicted };
}

function makePreview(rows: MeasurementRow[], userId: string, request: ReturnType<typeof normalizeRequest>, frozenRange?: MeasurementInterval) {
  const result = projectRows(rows, request, frozenRange);
  return { requestKey: completionKeys(userId, request)[0], digest: hash([userId, request, frozenRange, [...rows].sort((a, b) => a.id.localeCompare(b.id))]), ...result };
}

export async function previewHistoricalCompletion(db: Database, userId: string, input: HistoricalCompletionRequest) {
  if (!userId?.trim()) throw new Error("缺少经过验证的账号。");
  const request = normalizeRequest(input);
  const rows = await db.select().from(measurement).where(eq(measurement.userId, userId));
  const initialization = await getInitializationBatch(db, userId);
  const preview = makePreview(rows, userId, request, initialization?.initializationMetadata?.range);
  const keys = completionKeys(userId, request);
  const [batch] = await db.select({ id: measurementImport.id }).from(measurementImport).where(and(eq(measurementImport.userId, userId), or(eq(measurementImport.fileDigest, keys[0]), eq(measurementImport.fileDigest, keys[1]))));
  return { ...preview, alreadyApplied: Boolean(batch) };
}

/** 已授权的开发维护入口；仅在显式调用时修正来源、写入实测与历史估计。 */
export async function applyHistoricalCompletion(db: Database, input: MeasurementActor & { request: HistoricalCompletionRequest; digest: string }) {
  if (!input.userId?.trim() || input.actorId !== input.userId || !/^[a-f0-9]{64}$/.test(input.digest)) throw new Error("补全操作者或预览摘要无效。");
  const request = normalizeRequest(input.request);
  const [requestKey, legacyKey] = completionKeys(input.userId, request);
  return db.transaction(async (tx) => {
    await lockMeasurementOwner(tx, input.userId);
    const [prior] = await tx.select().from(measurementImport).where(and(eq(measurementImport.userId, input.userId), or(eq(measurementImport.fileDigest, requestKey), eq(measurementImport.fileDigest, legacyKey))));
    if (prior) return { importId: prior.id, observedInserted: 0, observedUpdated: 0, estimatesInserted: 0, annotated: 0, repeated: true };
    const rows = await tx.select().from(measurement).where(eq(measurement.userId, input.userId)).for("update");
    const initialization = await getInitializationBatch(tx, input.userId);
    const frozenRange = initialization?.initializationMetadata?.range;
    const preview = makePreview(rows, input.userId, request, frozenRange);
    if (preview.digest !== input.digest) throw new Error("记录已变化，请重新预览；没有写入。");
    const [batch] = await tx.insert(measurementImport).values({ id: randomUUID(), userId: input.userId, fileDigest: requestKey, sourceLabel: `历史来源与估计补全 · ${request.operationId}`, captureChannel: "development_backend", insertedCount: 0, skippedCount: 0, createdBy: input.actorId }).returning();
    for (const id of preview.annotateIds) {
      const before = rows.find((row) => row.id === id)!;
      const [after] = await tx.update(measurement).set({ entryChannel: "development_backend", deviceLabel: request.deviceLabel, updatedAt: new Date() }).where(and(eq(measurement.userId, input.userId), eq(measurement.id, id))).returning();
      await tx.insert(measurementEvent).values({ id: randomUUID(), userId: input.userId, measurementId: id, action: "update", actorType: input.actorType ?? "development_backend", actorId: input.actorId, snapshot: { before, after, reason: "user_confirmed_provenance", operationDigest: input.digest, importId: batch.id } });
    }
    if (preview.annotateIds.length || preview.additions.length) await rememberMeasurementSource(tx, input.userId, request.deviceLabel);
    let observedInserted = 0, observedUpdated = 0;
    const affectedDates: string[] = [];
    for (const record of preview.additions) {
      const row = await insertReportedMeasurement(tx, input, record, batch.id, { entryChannel: "development_backend", deviceLabel: request.deviceLabel });
      if (row) { if (row.writeKind === "inserted") observedInserted++; else observedUpdated++; affectedDates.push(row.recordDate); }
    }
    const refreshed = await refreshMeasurementDates(tx, input, affectedDates, { operationKey: batch.id, importId: batch.id, reason: "same_day_observed_refresh" });
    const active = await tx.select().from(measurement).where(and(eq(measurement.userId, input.userId), isNull(measurement.deletedAt)));
    const { estimates, warnings } = buildHistoricalEstimates(active, request.range, { frozenRange });
    for (const prediction of estimates) await insertEstimate(tx, input, prediction, { operationKey: batch.id, importId: batch.id, reason: "explicit_historical_completion" });
    await tx.update(measurementImport).set({ insertedCount: observedInserted + refreshed.inserted + estimates.length, skippedCount: request.records.length - observedInserted - observedUpdated }).where(and(eq(measurementImport.userId, input.userId), eq(measurementImport.id, batch.id)));
    return { importId: batch.id, observedInserted, observedUpdated, estimatesInserted: refreshed.inserted + estimates.length, annotated: preview.annotateIds.length, warnings, repeated: false };
  });
}
