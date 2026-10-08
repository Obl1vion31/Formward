import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { measurement, measurementImport, measurementOperation } from "../../db/schema";
import { ApiError, requireActiveAiToken, type AiIdentity } from "../auth/ai-tokens";
import { estimateUserExplanation } from "./estimate-explanation";
import { estimateMeasurementCell, measurementDisplay, prepareMeasurementDay, prepareMeasurementEstimate, saveMeasurementDay, type EstimateCellInput, type PeriodEdit, type SaveMeasurementDayInput } from "./editing";
import { lockMeasurementOwner, validateDecimal, type MeasurementTransaction } from "./records";
import { calendarOrdinal } from "./trend";
import { entryMetrics, entryPeriods } from "./entry-state";

export type AiMeasurementInput = ({ kind: "save_day" } & SaveMeasurementDayInput) | ({ kind: "estimate_cell" } & EstimateCellInput);
type PreviewRow = { period: "daytime" | "evening"; state: "new" | "edit" | "supplement" | "duplicate" | "conflict" | "estimate"; before: Record<string, unknown> | null; after: Record<string, unknown> | null; message: string; replacedEstimates?: Record<string, unknown>[] };
export type OperationPreview = { date: string; kind: AiMeasurementInput["kind"]; canConfirm: boolean; rows: PreviewRow[]; message: string; resolved?: SaveMeasurementDayInput; explanation?: ReturnType<typeof estimateUserExplanation> };
const hash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
const fields = ["weightKg", "bodyFatPercent", "deviceLabel", "fasting"] as const;
function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new ApiError(400, "invalid_input", "请求包含无效或不支持的字段。");
  return value as Record<string, unknown>;
}
export function parseAiMeasurementInput(value: unknown): AiMeasurementInput {
  const base = object(value, ["kind", "date", "operationId", "timezone", "periods", "period", "metric"]);
  if (typeof base.date !== "string" || typeof base.operationId !== "string" || !/^[a-zA-Z0-9-]{8,120}$/.test(base.operationId)) throw new ApiError(400, "invalid_input", "请提供 YYYY-MM-DD 日期和 8–120 位唯一 operationId。");
  calendarOrdinal(base.date);
  const common = { date: base.date, operationId: base.operationId };
  if (base.kind === "estimate_cell") {
    object(base, ["kind", "date", "operationId", "period", "metric"]);
    if (!entryPeriods.includes(base.period as never) || !entryMetrics.includes(base.metric as never)) throw new ApiError(400, "invalid_input", "估算时段或指标无效。");
    return { ...common, kind: "estimate_cell", period: base.period as EstimateCellInput["period"], metric: base.metric as EstimateCellInput["metric"] };
  }
  if (base.kind !== "save_day") throw new ApiError(400, "invalid_input", "kind 须为 save_day 或 estimate_cell。");
  object(base, ["kind", "date", "operationId", "timezone", "periods"]);
  if (base.timezone !== undefined && base.timezone !== null && typeof base.timezone !== "string") throw new ApiError(400, "invalid_input", "timezone 须为 IANA 时区或 null。");
  const periods = object(base.periods, [...entryPeriods]);
  if (!Object.keys(periods).length) throw new ApiError(400, "invalid_input", "请选择晨间或晚间字段。");
  const parsed: SaveMeasurementDayInput["periods"] = {};
  for (const period of entryPeriods) {
    if (!Object.hasOwn(periods, period)) continue;
    const edit = object(periods[period], ["recordId", "version", ...fields]);
    if (!fields.some(field => Object.hasOwn(edit, field))) throw new ApiError(400, "invalid_input", "请选择要保存的字段。");
    if ((edit.recordId === undefined) !== (edit.version === undefined) || (edit.recordId !== undefined && (typeof edit.recordId !== "string" || typeof edit.version !== "string"))) throw new ApiError(400, "invalid_input", "历史编辑须同时提供 recordId 和 version。");
    const canonical: PeriodEdit = {};
    for (const field of ["recordId", "version", ...fields] as const) {
      if (!Object.hasOwn(edit, field)) continue;
      const item = edit[field];
      if (field === "fasting" ? item !== null && typeof item !== "boolean" : item !== null && typeof item !== "string") throw new ApiError(400, "invalid_input", `${field} 类型无效；数值使用十进制字符串。`);
      Object.assign(canonical, { [field]: entryMetrics.includes(field as never) && item !== null ? validateDecimal(item as string, field === "weightKg" ? "体重" : "体脂率", 0, field === "weightKg" ? 99999.99 : 100, field !== "weightKg") : field === "deviceLabel" && typeof item === "string" ? item.trim() : item });
    }
    parsed[period] = canonical;
  }
  return { ...common, kind: "save_day", timezone: (base.timezone as string | null | undefined) ?? null, periods: parsed };
}
async function snapshot(tx: MeasurementTransaction, userId: string) {
  const records = await tx.select().from(measurement).where(eq(measurement.userId, userId)).orderBy(measurement.id);
  const batches = await tx.select({ id: measurementImport.id, initialization: measurementImport.initializationMetadata }).from(measurementImport).where(eq(measurementImport.userId, userId)).orderBy(measurementImport.id);
  return { records, digest: hash([records, batches.filter(row => row.initialization)]) };
}
async function previewOperation(tx: MeasurementTransaction, userId: string, input: AiMeasurementInput, records: typeof measurement.$inferSelect[]): Promise<OperationPreview> {
  const actor = { userId, actorId: userId, actorType: "ai" as const };
  if (input.kind === "estimate_cell") {
    const plan = await prepareMeasurementEstimate(tx, actor, input);
    return { date: input.date, kind: input.kind, canConfirm: !!plan.prediction, message: plan.prediction ? "此项为估计，只辅助趋势；确认后保存所展示的依据。" : plan.message,
      rows: [{ period: input.period, state: "estimate", before: null, after: plan.prediction ? { [input.metric]: plan.prediction[input.metric], recordKind: "estimated" } : null, message: plan.prediction ? "只保存这一项，其他空项保持空白。" : plan.message }],
      ...(plan.prediction ? { explanation: estimateUserExplanation(plan.prediction.estimation, input.date, input.metric) } : {}) };
  }
  const resolved: SaveMeasurementDayInput = { ...input, periods: {} }, rows: PreviewRow[] = [];
  for (const period of entryPeriods) {
    const requested = input.periods[period];
    if (!requested) continue;
    const samePeriod = records.filter(row => row.recordDate === input.date && row.period === period && row.recordKind === "observed");
    const active = samePeriod.filter(row => !row.deletedAt);
    let edit = requested, state: PreviewRow["state"] = requested.recordId ? "edit" : "new";
    if (!requested.recordId && active.length) {
      const matching = active.find(row => fields.every(field => !Object.hasOwn(requested, field) || (period === "evening" && field === "fasting" ? row.fasting === false : row[field] === requested[field])));
      const supplement = active.length === 1 && fields.every(field => !Object.hasOwn(requested, field) || (period === "evening" && field === "fasting") || active[0][field] === null || active[0][field] === requested[field]) ? active[0] : null;
      const target = matching ?? supplement;
      if (!target) { rows.push({ period, state: "conflict", before: active.length === 1 ? measurementDisplay(active[0]) : { candidates: active.map(measurementDisplay) }, after: requested, message: "已有不同实测或多个候选。请查询后明确指定 recordId 和 version，再提交修改。" }); continue; }
      edit = { ...requested, recordId: target.id, version: target.updatedAt.toISOString() };
      state = matching ? "duplicate" : "supplement";
    }
    const [plan] = await prepareMeasurementDay(tx, actor, { ...resolved, periods: { [period]: edit } });
    if (!plan.before && samePeriod.some(row => row.deletedAt && row.deduplicationKey === plan.valid.deduplicationKey)) {
      rows.push({ period, state: "duplicate", before: null, after: null, message: "相同记录曾被删除，本接口不会恢复它。" }); continue;
    }
    if (plan.before && fields.every(field => plan.before![field] === (field === "deviceLabel" ? plan.deviceLabel : plan.valid[field]))) state = "duplicate";
    const replacedEstimates = state === "duplicate" ? [] : records.filter(row => !row.deletedAt && row.recordDate === input.date && row.period === period && row.recordKind === "estimated").map(row => ({ id: row.id, weightKg: plan.valid.weightKg !== null ? row.weightKg : null, bodyFatPercent: plan.valid.bodyFatPercent !== null ? row.bodyFatPercent : null })).filter(row => row.weightKg !== null || row.bodyFatPercent !== null);
    rows.push({ period, state, before: plan.before ? measurementDisplay(plan.before) : null, after: { weightKg: plan.valid.weightKg, bodyFatPercent: plan.valid.bodyFatPercent, fasting: plan.valid.fasting, deviceLabel: plan.deviceLabel }, replacedEstimates, message: state === "duplicate" ? "已记录相同内容，将跳过。" : state === "supplement" ? "补充缺失字段，保留已有值。" : state === "edit" ? "修改明确指定的历史记录。" : "新增实测，其他未知项保持空白。" });
    if (state !== "duplicate") resolved.periods[period] = edit;
  }
  const conflict = rows.some(row => row.state === "conflict"), hasChanges = Object.keys(resolved.periods).length > 0;
  return { date: input.date, kind: input.kind, rows, resolved, canConfirm: !conflict && hasChanges, message: conflict ? "存在冲突，整次操作不会保存。请澄清后重新提交。" : hasChanges ? "请核对日期、时段、数值与来源，确认后保存。" : "内容已记录，无需重复保存。" };
}
export function operationDisplay(row: typeof measurementOperation.$inferSelect) {
  return { id: row.id, operationId: row.operationId, status: row.status === "pending" && row.expiresAt.getTime() <= Date.now() ? "expired" : row.status,
    preview: row.preview, result: row.result, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(), confirmedAt: row.confirmedAt?.toISOString() ?? null,
    confirmationPath: `/dashboard/ai/operations/${row.id}` };
}
export async function submitAiMeasurementOperation(db: Database, identity: AiIdentity, raw: unknown) {
  const input = parseAiMeasurementInput(raw), requestDigest = hash(input);
  return db.transaction(async tx => {
    await lockMeasurementOwner(tx, identity.userId); await requireActiveAiToken(tx, identity, true);
    const [prior] = await tx.select().from(measurementOperation).where(and(eq(measurementOperation.userId, identity.userId), eq(measurementOperation.operationId, input.operationId)));
    if (prior) {
      if (prior.requestDigest !== requestDigest || prior.tokenId !== identity.tokenId) throw new ApiError(409, "request_conflict", "同一 operationId 不能用于不同内容或不同令牌。");
      return { ...operationDisplay(prior), repeated: true };
    }
    const current = await snapshot(tx, identity.userId), preview = await previewOperation(tx, identity.userId, input, current.records);
    const [row] = await tx.insert(measurementOperation).values({ id: randomUUID(), userId: identity.userId, tokenId: identity.tokenId, operationId: input.operationId, requestDigest, snapshotDigest: current.digest, payload: input, preview, expiresAt: new Date(Date.now() + 15 * 60000) }).returning();
    return { ...operationDisplay(row), repeated: false };
  });
}
export async function getAiMeasurementOperation(db: Database, userId: string, id: string) {
  const [row] = await db.select().from(measurementOperation).where(and(eq(measurementOperation.userId, userId), eq(measurementOperation.id, id)));
  if (!row) throw new ApiError(404, "not_found", "操作不存在。");
  return operationDisplay(row);
}
export async function listAiMeasurementOperations(db: Database, userId: string) {
  return (await db.select().from(measurementOperation).where(eq(measurementOperation.userId, userId)).orderBy(desc(measurementOperation.createdAt)).limit(20)).map(operationDisplay);
}
/** 只能由已登录网页确认；版本检查、共享写入、审计和状态更新同一事务提交。 */
export async function decideAiMeasurementOperation(db: Database, userId: string, id: string, decision: "confirm" | "cancel") {
  if (!["confirm", "cancel"].includes(decision)) throw new ApiError(400, "invalid_input", "确认操作无效。");
  return db.transaction(async tx => {
    await lockMeasurementOwner(tx, userId);
    const [row] = await tx.select().from(measurementOperation).where(and(eq(measurementOperation.userId, userId), eq(measurementOperation.id, id)));
    if (!row) throw new ApiError(404, "not_found", "操作不存在。");
    if (row.status !== "pending") return operationDisplay(row);
    if (decision === "cancel") { const [cancelled] = await tx.update(measurementOperation).set({ status: "cancelled" }).where(eq(measurementOperation.id, id)).returning(); return operationDisplay(cancelled); }
    if (row.expiresAt.getTime() <= Date.now()) throw new ApiError(410, "expired", "预览已过期，请让 AI 重新提交。" );
    await requireActiveAiToken(tx, { userId, tokenId: row.tokenId, permission: "write" }, true);
    if (!row.preview.canConfirm) throw new ApiError(409, "no_changes", row.preview.message);
    if ((await snapshot(tx, userId)).digest !== row.snapshotDigest) throw new ApiError(409, "stale_preview", "身体记录已变化，请让 AI 查询后重新生成预览。" );
    const confirmedAt = new Date(), actor = { userId, actorId: userId, actorType: "ai" as const, aiContext: { tokenId: row.tokenId, operationId: row.id, confirmedBy: userId, confirmedAt: confirmedAt.toISOString() } };
    // Drizzle 的嵌套事务使用 savepoint，外层失败时写入和审计一起回滚。
    const transactionalDb = tx as unknown as Database;
    let result: { message: string; saved: number };
    if (row.payload.kind === "save_day") {
      const saved = await saveMeasurementDay(transactionalDb, actor, { ...row.preview.resolved!, operationId: `ai-${row.id}` });
      result = { message: "已保存确认的身体记录。", saved: saved.saved };
    } else {
      const estimated = await estimateMeasurementCell(transactionalDb, actor, { ...row.payload, operationId: `ai-${row.id}` });
      result = { message: estimated.message, saved: 1 };
    }
    const [confirmed] = await tx.update(measurementOperation).set({ status: "confirmed", confirmedAt, result }).where(eq(measurementOperation.id, id)).returning();
    return operationDisplay(confirmed);
  });
}
