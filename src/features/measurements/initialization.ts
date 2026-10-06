import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import type { Database } from "../../db/client";
import { measurement, measurementImport } from "../../db/schema";
import { buildInitializationEstimates, INITIALIZATION_METHOD, INITIALIZATION_POLICY, type EstimationMetadata, type EstimationOutcome, type HistoricalEstimate } from "./estimation";
import { estimateCalculation } from "./estimate-explanation";
import { insertEstimate, supersedeEstimates } from "./estimate-records";
import { lockMeasurementOwner, type MeasurementActor } from "./records";
import { calendarOrdinal, type MeasurementInterval } from "./trend";

export type HistoricalInitializationRequest = { operationId: string; range: MeasurementInterval };
type MeasurementRow = typeof measurement.$inferSelect;
type SourceSnapshot = { id: string; date: string; period: "daytime" | "evening"; fasting: boolean | null; weightKg: string | null; bodyFatPercent: string | null; sourceLocalTime: string };
type ReplacedSnapshot = { id: string; date: string; period: "daytime" | "evening"; weightKg: string | null; bodyFatPercent: string | null; estimation: EstimationMetadata | null };
export type InitializationReport = {
  batchId: string; operationId: string; mode: "historical-initialization"; ruleVersion: typeof INITIALIZATION_METHOD;
  range: MeasurementInterval; generatedAt: string; sourceDigest: string;
  sourceSnapshot: SourceSnapshot[]; outcomes: EstimationOutcome[]; replacedEstimates: ReplacedSnapshot[];
  generatedRecords: (HistoricalEstimate & { id: string })[]; warnings: string[];
};
export type InitializationBatchMetadata = {
  mode: "historical-initialization"; ruleVersion: typeof INITIALIZATION_METHOD; frozen: true;
  range: MeasurementInterval; policy: typeof INITIALIZATION_POLICY; report: InitializationReport;
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function getInitializationBatch(db: Database, userId: string) {
  if (!userId?.trim()) throw new Error("缺少经过验证的账号。");
  const [batch] = await db.select().from(measurementImport).where(and(eq(measurementImport.userId, userId), isNotNull(measurementImport.initializationMetadata)));
  return batch ?? null;
}
export function isFrozenDate(batch: Awaited<ReturnType<typeof getInitializationBatch>>, date: string) {
  return !!batch?.initializationMetadata && date >= batch.initializationMetadata.range.start && date <= batch.initializationMetadata.range.end;
}
export async function assertUnfrozenRange(db: Database, userId: string, range: MeasurementInterval) {
  const batch = await getInitializationBatch(db, userId);
  if (batch?.initializationMetadata && range.start <= batch.initializationMetadata.range.end && range.end >= batch.initializationMetadata.range.start) throw new Error("该范围包含已冻结的历史初始化日期，不能重建估计。");
}
function normalize(request: HistoricalInitializationRequest) {
  const span = calendarOrdinal(request.range.start) - calendarOrdinal(request.range.end);
  if (!request.operationId?.trim() || request.operationId.length > 120 || span > 0 || span < -365) throw new Error("历史初始化请求无效，日期范围须顺序有效且不超过 366 天。");
  return { operationId: request.operationId.trim(), range: { start: request.range.start, end: request.range.end } };
}
function preview(rows: MeasurementRow[], userId: string, request: HistoricalInitializationRequest, batchId: string, generatedAt: string) {
  const active = rows.filter(row => row.deletedAt === null);
  const inRange = (date: string) => date >= request.range.start && date <= request.range.end;
  const sourceSnapshot: SourceSnapshot[] = active.filter(row => row.recordKind === "observed" && inRange(row.analysisDate)).sort((a, b) => a.id.localeCompare(b.id)).map(row => ({ id: row.id, date: row.analysisDate, period: row.period, fasting: row.fasting, weightKg: row.weightKg, bodyFatPercent: row.bodyFatPercent, sourceLocalTime: row.sourceLocalTime }));
  const sourceDigest = hash(sourceSnapshot);
  const result = buildInitializationEstimates(active, request.range, { batchId, sourceDigest }, generatedAt);
  const replacedEstimates: ReplacedSnapshot[] = active.filter(row => row.recordKind === "estimated" && inRange(row.analysisDate)).map(row => ({ id: row.id, date: row.analysisDate, period: row.period, weightKg: row.weightKg, bodyFatPercent: row.bodyFatPercent, estimation: row.estimation }));
  return { ...result, sourceSnapshot, sourceDigest, replacedEstimates,
    requestKey: hash([INITIALIZATION_METHOD, userId, request]), digest: hash([INITIALIZATION_METHOD, userId, request, [...rows].sort((a, b) => a.id.localeCompare(b.id))]) };
}
export async function previewHistoricalInitialization(db: Database, userId: string, input: HistoricalInitializationRequest) {
  const request = normalize(input), prior = await getInitializationBatch(db, userId);
  const requestKey = hash([INITIALIZATION_METHOD, userId, request]);
  if (prior) {
    if (prior.fileDigest !== requestKey) throw new Error("当前账号已完成一次历史初始化，不能重新初始化。");
    return { alreadyApplied: true as const, batchId: prior.id, report: prior.initializationMetadata!.report };
  }
  const rows = await db.select().from(measurement).where(eq(measurement.userId, userId));
  return { alreadyApplied: false as const, ...preview(rows, userId, request, "preview", new Date().toISOString()) };
}
/** 用户已授权的一次性初始化：独立批次、快照绑定、同事务冻结与审计。 */
export async function applyHistoricalInitialization(db: Database, input: MeasurementActor & { request: HistoricalInitializationRequest; digest: string }) {
  if (!input.userId?.trim() || input.actorId !== input.userId || !/^[a-f0-9]{64}$/.test(input.digest)) throw new Error("初始化操作者或预览摘要无效。");
  const request = normalize(input.request), requestKey = hash([INITIALIZATION_METHOD, input.userId, request]);
  return db.transaction(async tx => {
    await lockMeasurementOwner(tx, input.userId);
    const prior = await getInitializationBatch(tx, input.userId);
    if (prior) {
      if (prior.fileDigest !== requestKey) throw new Error("当前账号已完成一次历史初始化，不能重新初始化。");
      return { importId: prior.id, repeated: true, report: prior.initializationMetadata!.report };
    }
    const rows = await tx.select().from(measurement).where(eq(measurement.userId, input.userId)).for("update");
    const batchId = randomUUID(), generatedAt = new Date().toISOString();
    const result = preview(rows, input.userId, request, batchId, generatedAt);
    if (result.digest !== input.digest) throw new Error("记录已变化，请重新预览；没有写入。");
    await tx.insert(measurementImport).values({ id: batchId, userId: input.userId, fileDigest: requestKey, sourceLabel: `一次性历史初始化 · ${request.operationId}`, captureChannel: "development_backend", insertedCount: result.estimates.length, skippedCount: 0, createdBy: input.actorId });
    for (const old of result.replacedEstimates) await supersedeEstimates(tx, input, old.date, old.period, "historical_initialization_replaces_estimate");
    const generatedRecords: InitializationReport["generatedRecords"] = [];
    for (const prediction of result.estimates) {
      const row = await insertEstimate(tx, input, prediction, { operationKey: batchId, importId: batchId, reason: "historical_initialization" });
      generatedRecords.push({ ...prediction, id: row.id });
    }
    const report: InitializationReport = { batchId, operationId: request.operationId, mode: "historical-initialization", ruleVersion: INITIALIZATION_METHOD, range: request.range, generatedAt, sourceDigest: result.sourceDigest, sourceSnapshot: result.sourceSnapshot, outcomes: result.outcomes, replacedEstimates: result.replacedEstimates, generatedRecords, warnings: result.warnings };
    await tx.update(measurementImport).set({ initializationMetadata: { mode: "historical-initialization", ruleVersion: INITIALIZATION_METHOD, frozen: true, range: request.range, policy: INITIALIZATION_POLICY, report } }).where(and(eq(measurementImport.userId, input.userId), eq(measurementImport.id, batchId)));
    return { importId: batchId, repeated: false, report };
  });
}
export function initializationReportMarkdown(report: InitializationReport) {
  const name = (metric: string) => metric === "weightKg" ? "体重 kg" : "体脂率 %";
  const basis = { "same-day-morning": "晨间实测加典型晨晚差", "same-day-evening": "晚间实测减典型晨晚差", "morning-trend": "真实晨间趋势", "morning-trend-plus-difference": "真实晨间趋势加典型晨晚差" };
  return [`# 一次性历史初始化报告`, ``, `批次：${report.batchId}`, `规则：${report.ruleVersion}`, `范围：${report.range.start} 至 ${report.range.end}`, `生成时间：${report.generatedAt}`, ``, `允许使用后续已经存在的真实历史记录。此范围已冻结，估计仅辅助趋势。`, ``, `生成 ${report.generatedRecords.length} 条估计，替换 ${report.replacedEstimates.length} 条旧估计。`, ``, `| 日期 | 时段 | 指标 | 状态／结果 | 依据 | 使用后续实测 |`, `|---|---|---|---|---|---|`,
    ...report.outcomes.map(row => `| ${row.date} | ${row.period === "daytime" ? "晨间" : "晚间"} | ${name(row.metric)} | ${row.status === "observed" ? "实测" : row.status === "estimated" ? "估计" : "缺项"} ${row.value ?? "—"} | ${row.evidence ? `${basis[row.evidence.basis]}${row.evidence.interpolation ? "（相邻插值）" : row.evidence.extrapolation ? "（边界外推）" : ""}；配对 ${row.evidence.availablePairCount} 日；${estimateCalculation(row.evidence, row.date, row.metric).formula}` : row.reason ?? "保持实测"} | ${row.evidence?.usesFutureData ? "是" : "否"} |`), ``, `## 替换的旧估计`, ``, ...report.replacedEstimates.map(row => `- ${row.date} ${row.period}：${row.id}，体重 ${row.weightKg ?? "—"}，体脂 ${row.bodyFatPercent ?? "—"}，${row.estimation?.method ?? "未知版本"}`), ``, `完整参考记录快照、系数、差值及逐指标依据见同批次 JSON 报告。`, ``].join("\n");
}
