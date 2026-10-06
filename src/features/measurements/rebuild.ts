import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { measurement, measurementImport } from "../../db/schema";
import { buildHistoricalEstimates, ESTIMATION_METHOD } from "./estimation";
import { insertEstimate, supersedeEstimates } from "./estimate-records";
import { lockMeasurementOwner, type MeasurementActor } from "./records";
import { calendarOrdinal, type MeasurementInterval } from "./trend";

export type EstimationRebuildRequest = { operationId: string; range: MeasurementInterval };
type MeasurementRow = typeof measurement.$inferSelect;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function normalize(input: EstimationRebuildRequest) {
  if (!input.operationId?.trim() || input.operationId.length > 120) throw new Error("估计重建请求无效。");
  const span = calendarOrdinal(input.range.end) - calendarOrdinal(input.range.start);
  if (span < 0 || span > 365) throw new Error("重建范围须为顺序有效且不超过 366 天的日期区间。");
  return { operationId: input.operationId.trim(), range: { start: input.range.start, end: input.range.end } };
}
function preview(rows: MeasurementRow[], userId: string, request: EstimationRebuildRequest) {
  const active = rows.filter((row) => row.deletedAt === null);
  return {
    requestKey: hash(["estimate-rebuild", ESTIMATION_METHOD, userId, request]),
    digest: hash(["estimate-rebuild", ESTIMATION_METHOD, userId, request, [...rows].sort((a, b) => a.id.localeCompare(b.id))]),
    removedIds: active.filter((row) => row.recordKind === "estimated" && row.analysisDate >= request.range.start && row.analysisDate <= request.range.end).map((row) => row.id),
    ...buildHistoricalEstimates(active, request.range, { preserveExisting: false }),
  };
}
export async function previewEstimationRebuild(db: Database, userId: string, input: EstimationRebuildRequest) {
  if (!userId?.trim()) throw new Error("缺少经过验证的账号。");
  const request = normalize(input), rows = await db.select().from(measurement).where(eq(measurement.userId, userId));
  const result = preview(rows, userId, request);
  const [batch] = await db.select({ id: measurementImport.id }).from(measurementImport).where(and(eq(measurementImport.userId, userId), eq(measurementImport.fileDigest, result.requestKey)));
  return { ...result, alreadyApplied: !!batch };
}
/** 仅重建指定范围的估计，真实数值、来源及范围外估计不变。 */
export async function applyEstimationRebuild(db: Database, input: MeasurementActor & { request: EstimationRebuildRequest; digest: string }) {
  if (!input.userId?.trim() || input.actorId !== input.userId || !/^[a-f0-9]{64}$/.test(input.digest)) throw new Error("重建操作者或预览摘要无效。");
  const request = normalize(input.request), requestKey = hash(["estimate-rebuild", ESTIMATION_METHOD, input.userId, request]);
  return db.transaction(async (tx) => {
    await lockMeasurementOwner(tx, input.userId);
    const [prior] = await tx.select().from(measurementImport).where(and(eq(measurementImport.userId, input.userId), eq(measurementImport.fileDigest, requestKey)));
    if (prior) return { importId: prior.id, removed: 0, inserted: 0, warnings: [], repeated: true };
    const rows = await tx.select().from(measurement).where(eq(measurement.userId, input.userId)).for("update");
    const result = preview(rows, input.userId, request);
    if (result.digest !== input.digest) throw new Error("记录已变化，请重新预览；没有写入。");
    const [batch] = await tx.insert(measurementImport).values({ id: randomUUID(), userId: input.userId, fileDigest: requestKey, sourceLabel: `晨间基准估计重建 · ${request.operationId}`, captureChannel: "development_backend", insertedCount: result.estimates.length, skippedCount: 0, createdBy: input.actorId }).returning();
    let removed = 0;
    for (const row of rows.filter((row) => result.removedIds.includes(row.id))) removed += await supersedeEstimates(tx, input, row.analysisDate, row.period, "explicit_estimate_rebuild");
    for (const prediction of result.estimates) await insertEstimate(tx, input, prediction, { operationKey: batch.id, importId: batch.id, reason: "explicit_estimate_rebuild" });
    return { importId: batch.id, removed, inserted: result.estimates.length, warnings: result.warnings, repeated: false };
  });
}
