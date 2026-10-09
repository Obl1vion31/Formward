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
import { systemMeasurementTimezone, timezoneLabel, validateMeasurementTimezone } from "./timezone";

type SingleInput = ({ kind: "save_day" } & SaveMeasurementDayInput) | ({ kind: "estimate_cell" } & EstimateCellInput);
export type ReviewInput = ({ kind: "save_record"; date: string; period: "daytime" | "evening" } & PeriodEdit) | { kind: "estimate_cell"; date: string; period: "daytime" | "evening"; metric: "weightKg" | "bodyFatPercent" };
export type AiMeasurementInput = SingleInput | { kind: "batch"; operationId: string; items: ReviewInput[] };
type PreviewRow = { period: "daytime" | "evening"; state: "new" | "edit" | "supplement" | "duplicate" | "conflict" | "estimate" | "invalid"; before: Record<string, unknown> | null; after: Record<string, unknown> | null; message: string; replacedEstimates?: Record<string, unknown>[] };
export type OperationPreview = { date: string; kind: AiMeasurementInput["kind"]; canConfirm: boolean; rows: PreviewRow[]; message: string; defaultTimezone?: string; resolved?: SaveMeasurementDayInput; explanation?: ReturnType<typeof estimateUserExplanation>; items?: ReviewItem[] };
export type ReviewItem = { id: string; input: ReviewInput; originalInput: ReviewInput; status: "pending" | "confirmed" | "cancelled" | "skipped"; preview: OperationPreview; editedBy?: { userId: string; at: string }; result?: { saved: number; message: string; confirmedAt: string } };
export type ReviewAction = { revision: number } & (
  { kind: "update"; changes: { itemId: string; input: ReviewInput }[] } |
  { kind: "refresh" } | { kind: "confirm" | "cancel"; itemIds?: string[] }
);
const hash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
const fields = ["weightKg", "bodyFatPercent", "deviceLabel", "fasting", "timezone"] as const;
function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new ApiError(400, "invalid_input", "请求包含无效或不支持的字段。");
  return value as Record<string, unknown>;
}
export function parseAiMeasurementInput(value: unknown): AiMeasurementInput {
  const base = object(value, ["kind", "date", "operationId", "timezone", "periods", "period", "metric", "items"]);
  if (base.kind === "batch") {
    object(base, ["kind", "operationId", "items"]);
    if (typeof base.operationId !== "string" || !/^[a-zA-Z0-9-]{8,120}$/.test(base.operationId) || !Array.isArray(base.items) || !base.items.length || base.items.length > 100) throw new ApiError(400, "invalid_input", "批量提交须有唯一 operationId 和 1–100 条记录。");
    return { kind: "batch", operationId: base.operationId, items: base.items.map(parseReviewInput) };
  }
  if (typeof base.date !== "string" || typeof base.operationId !== "string" || !/^[a-zA-Z0-9-]{8,120}$/.test(base.operationId)) throw new ApiError(400, "invalid_input", "请提供 YYYY-MM-DD 日期和 8–120 位唯一 operationId。");
  calendarOrdinal(base.date);
  const common = { date: base.date, operationId: base.operationId };
  if (base.kind === "estimate_cell") {
    object(base, ["kind", "date", "operationId", "period", "metric"]);
    if (!entryPeriods.includes(base.period as never) || !entryMetrics.includes(base.metric as never)) throw new ApiError(400, "invalid_input", "估算时段或指标无效。");
    return { ...common, kind: "estimate_cell", period: base.period as EstimateCellInput["period"], metric: base.metric as EstimateCellInput["metric"] };
  }
  if (base.kind !== "save_day") throw new ApiError(400, "invalid_input", "kind 须为 batch、save_day 或 estimate_cell。");
  object(base, ["kind", "date", "operationId", "timezone", "periods"]);
  if (base.timezone !== undefined && base.timezone !== null && typeof base.timezone !== "string") throw new ApiError(400, "invalid_input", "timezone 须为固定偏移、IANA 时区或 null。");
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
async function previewOperation(tx: MeasurementTransaction, userId: string, input: SingleInput, records: typeof measurement.$inferSelect[]): Promise<OperationPreview> {
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
    rows.push({ period, state, before: plan.before ? measurementDisplay(plan.before) : null, after: { weightKg: plan.valid.weightKg, bodyFatPercent: plan.valid.bodyFatPercent, fasting: plan.valid.fasting, deviceLabel: plan.deviceLabel, timezone: plan.valid.timezone, timezoneLabel: timezoneLabel(plan.valid.timezone, input.date, plan.time ? plan.time.utcOffsetMinutes : plan.before?.utcOffsetMinutes) }, replacedEstimates, message: state === "duplicate" ? "已记录相同内容，将跳过。" : state === "supplement" ? "补充缺失字段，保留已有值。" : state === "edit" ? "修改明确指定的历史记录。" : "新增实测，其他未知项保持空白。" });
    if (state !== "duplicate") resolved.periods[period] = edit;
  }
  const conflict = rows.some(row => row.state === "conflict"), hasChanges = Object.keys(resolved.periods).length > 0;
  return { date: input.date, kind: input.kind, rows, resolved, canConfirm: !conflict && hasChanges, message: conflict ? "存在冲突，整次操作不会保存。请澄清后重新提交。" : hasChanges ? "请核对日期、时段、数值与来源，确认后保存。" : "内容已记录，无需重复保存。" };
}
export function operationDisplay(row: typeof measurementOperation.$inferSelect) {
  const items = operationItems(row), counts = reviewCounts(items), status = !counts.pending && row.status === "pending" ? reviewStatus(items) : row.status;
  return { id: row.id, operationId: row.operationId, revision: row.revision, items, counts, status: counts.pending && ["pending", "partially_confirmed"].includes(status) && row.expiresAt.getTime() <= Date.now() ? "expired" : status,
    preview: row.preview, result: row.result, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(), confirmedAt: row.confirmedAt?.toISOString() ?? null,
    confirmationPath: `/dashboard/ai/operations/${row.id}` };
}
export async function submitAiMeasurementOperation(db: Database, identity: AiIdentity, raw: unknown, defaultTimezone = systemMeasurementTimezone()) {
  const input = parseAiMeasurementInput(raw), requestDigest = hash(input.kind === "save_day" ? [input, Object.hasOwn(raw as object, "timezone")] : input);
  return db.transaction(async tx => {
    await lockMeasurementOwner(tx, identity.userId); await requireActiveAiToken(tx, identity, true);
    const [prior] = await tx.select().from(measurementOperation).where(and(eq(measurementOperation.userId, identity.userId), eq(measurementOperation.operationId, input.operationId)));
    if (prior) {
      const legacyRequest = !prior.preview.defaultTimezone && prior.requestDigest === hash(input);
      if ((prior.requestDigest !== requestDigest && !legacyRequest) || prior.tokenId !== identity.tokenId) throw new ApiError(409, "request_conflict", "同一 operationId 不能用于不同内容或不同令牌。");
      return { ...operationDisplay(prior), repeated: true };
    }
    validateMeasurementTimezone(defaultTimezone);
    const current = await snapshot(tx, identity.userId);
    const items = input.kind === "batch" ? input.items.map(item => {
      const isNew = item.kind === "save_record" && !item.recordId && !current.records.some(record => !record.deletedAt && record.recordKind === "observed" && record.recordDate === item.date && record.period === item.period);
      const draft = isNew && !Object.hasOwn(item, "timezone") ? { ...item, timezone: defaultTimezone } : item;
      return { id: randomUUID(), input: draft, originalInput: item, status: "pending" as const, preview: emptyPreview(draft) };
    }) : null;
    if (items) await rebuildItems(tx, identity.userId, items, current.records);
    const candidate = input.kind === "save_day" && !Object.hasOwn(raw as object, "timezone") ? { ...input, timezone: defaultTimezone } : input;
    const preview = items ? combinedPreview(input.kind, items) : await previewOperation(tx, identity.userId, candidate as SingleInput, current.records);
    preview.defaultTimezone = defaultTimezone;
    const [row] = await tx.insert(measurementOperation).values({ id: randomUUID(), userId: identity.userId, tokenId: identity.tokenId, operationId: input.operationId, requestDigest, snapshotDigest: current.digest, payload: input, preview, ...(items ? { status: reviewStatus(items) } : {}), expiresAt: new Date(Date.now() + 15 * 60000) }).returning();
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
    if (row.payload.kind === "batch" || row.preview.items) return reviewAiMeasurementOperation(tx as unknown as Database, userId, id, { kind: decision, revision: row.revision });
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
    } else if (row.payload.kind === "estimate_cell") {
      const estimated = await estimateMeasurementCell(transactionalDb, actor, { ...row.payload, operationId: `ai-${row.id}` });
      result = { message: estimated.message, saved: 1 };
    } else throw new ApiError(400, "invalid_input", "操作类型无效。");
    const [confirmed] = await tx.update(measurementOperation).set({ status: "confirmed", confirmedAt, result }).where(eq(measurementOperation.id, id)).returning();
    return operationDisplay(confirmed);
  });
}

/** 批量请求只拒绝不受支持的形状；业务错误保留在对应行供用户纠正。 */
function parseReviewInput(raw: unknown): ReviewInput {
  const item = object(raw, ["kind", "date", "period", "metric", "recordId", "version", ...fields]);
  if (typeof item.date !== "string" || item.date.length > 120 || !entryPeriods.includes(item.period as never)) throw new ApiError(400, "invalid_input", "每条记录须有日期和晨晚时段。");
  if (item.kind === "estimate_cell") {
    object(item, ["kind", "date", "period", "metric"]);
    if (!entryMetrics.includes(item.metric as never)) throw new ApiError(400, "invalid_input", "估算指标无效。");
    return { kind: "estimate_cell", date: item.date, period: item.period as ReviewInput["period"], metric: item.metric as "weightKg" | "bodyFatPercent" };
  }
  if (item.kind !== "save_record") throw new ApiError(400, "invalid_input", "批量项须为 save_record 或 estimate_cell。");
  object(item, ["kind", "date", "period", "recordId", "version", ...fields]);
  if ((item.recordId === undefined) !== (item.version === undefined) || (item.recordId !== undefined && (typeof item.recordId !== "string" || typeof item.version !== "string"))) throw new ApiError(400, "invalid_input", "历史编辑须同时提供 recordId 和 version。");
  const result: ReviewInput = { kind: "save_record", date: item.date, period: item.period as ReviewInput["period"] };
  for (const key of ["recordId", "version", ...fields] as const) {
    if (!Object.hasOwn(item, key)) continue;
    let value = item[key];
    if (key === "fasting" ? value !== null && typeof value !== "boolean" : value !== null && typeof value !== "string") throw new ApiError(400, "invalid_input", `${key} 类型无效。`);
    if (typeof value === "string" && value.length > (key === "deviceLabel" ? 300 : 120)) throw new ApiError(400, "invalid_input", "字段内容过长。");
    if (entryMetrics.includes(key as never) && typeof value === "string") {
      try { value = validateDecimal(value, key === "weightKg" ? "体重" : "体脂率", 0, key === "weightKg" ? 99999.99 : 100, key !== "weightKg"); } catch { /* 保留错误数值供预览编辑。 */ }
    }
    Object.assign(result, { [key]: key === "deviceLabel" && typeof value === "string" ? value.trim() : value });
  }
  return result;
}
function singleInput(input: ReviewInput): SingleInput {
  if (input.kind === "estimate_cell") return { ...input, operationId: "review-preview" };
  const { kind: _kind, date, period, ...edit } = input;
  void _kind;
  return parseAiMeasurementInput({ kind: "save_day", date, operationId: "review-preview", periods: { [period]: edit } }) as SingleInput;
}
function originalItems(input: AiMeasurementInput, preview: OperationPreview): ReviewInput[] {
  if (input.kind === "batch") return input.items;
  if (input.kind === "estimate_cell") return [{ kind: "estimate_cell", date: input.date, period: input.period, metric: input.metric }];
  return entryPeriods.flatMap(period => {
    const edit = input.periods[period];
    const isNew = !edit?.recordId && !preview.rows.find(row => row.period === period)?.before;
    return edit ? [{ kind: "save_record" as const, date: input.date, period, ...(isNew && input.timezone !== null ? { timezone: input.timezone } : {}), ...edit }] : [];
  });
}
function emptyPreview(input: ReviewInput, message = "请更新预览。", before: Record<string, unknown> | null = null): OperationPreview {
  return { date: input.date, kind: input.kind === "save_record" ? "save_day" : "estimate_cell", canConfirm: false, rows: [{ period: input.period, state: "invalid", before, after: input.kind === "save_record" ? input : null, message }], message };
}
function operationItems(row: typeof measurementOperation.$inferSelect): ReviewItem[] {
  if (row.preview.items) return structuredClone(row.preview.items);
  return originalItems(row.payload, row.preview).map((originalInput, index) => {
    const single = row.preview.rows[index], { items: _items, ...preview } = row.preview;
    void _items;
    // 默认时区绑定第一次预览；读取、刷新和重试不重新采用当前系统时区。
    const input = originalInput.kind === "save_record" && single?.state === "new" && !Object.hasOwn(originalInput, "timezone")
      ? { ...originalInput, timezone: (single.after?.timezone ?? preview.resolved?.timezone ?? null) as string | null } : originalInput;
    const skipped = single?.state === "duplicate" || (input.kind === "estimate_cell" && !single?.after);
    return { id: String(index), input, originalInput, status: skipped ? "skipped" : row.status === "confirmed" ? "confirmed" : row.status === "cancelled" ? "cancelled" : "pending",
      preview: { ...preview, rows: single ? [single] : [], ...(preview.resolved ? { resolved: { ...preview.resolved, periods: preview.resolved.periods[input.period] ? { [input.period]: preview.resolved.periods[input.period] } : {} } } : {}), canConfirm: !!single && !["duplicate", "conflict", "invalid"].includes(single.state) && !!single.after },
      ...(row.status === "confirmed" && !skipped ? { result: { saved: 1, message: row.result?.message ?? "已保存。", confirmedAt: row.confirmedAt!.toISOString() } } : {}) };
  });
}
export function reviewCounts(items: ReviewItem[]) {
  return { total: items.length, saved: items.filter(item => item.status === "confirmed").length, cancelled: items.filter(item => item.status === "cancelled").length,
    skipped: items.filter(item => item.status === "skipped").length, pending: items.filter(item => item.status === "pending").length,
    issues: items.filter(item => item.status === "pending" && !item.preview.canConfirm).length };
}
function reviewStatus(items: ReviewItem[]): typeof measurementOperation.$inferSelect["status"] {
  const counts = reviewCounts(items);
  if (counts.pending) return counts.saved ? "partially_confirmed" : "pending";
  if (counts.saved && !counts.cancelled) return "confirmed";
  if (!counts.saved && counts.cancelled) return "cancelled";
  return "completed";
}
function combinedPreview(kind: AiMeasurementInput["kind"], items: ReviewItem[]): OperationPreview {
  const dates = [...new Set(items.map(item => item.input.date))].sort(), counts = reviewCounts(items);
  return { kind, date: dates.length > 1 ? `${dates[0]} — ${dates.at(-1)}` : dates[0], items, rows: items.flatMap(item => item.preview.rows), canConfirm: counts.pending > 0 && !counts.issues,
    message: counts.pending ? counts.issues ? `${counts.issues} 条需要修改或取消，其他有效记录可以逐条保存。` : "核对后可逐条确认，也可一次保存剩余记录。" : counts.saved ? "已完成本次审核，请查看每条记录的结果。" : "无需保存，或待处理记录已取消。" };
}
async function rebuildItems(tx: MeasurementTransaction, userId: string, items: ReviewItem[], records: typeof measurement.$inferSelect[]) {
  for (const item of items.filter(item => item.status === "pending")) {
    try {
      item.preview = await previewOperation(tx, userId, singleInput(item.input), records);
      if (item.preview.rows.every(row => row.state === "duplicate") || (item.input.kind === "estimate_cell" && !item.preview.canConfirm && item.preview.rows.every(row => row.after === null))) item.status = "skipped";
    } catch (error) {
      const message = error instanceof Error && !("query" in error || "cause" in error) ? error.message : "预览暂时不可用，请刷新重试。";
      const recordId = item.input.kind === "save_record" ? item.input.recordId : undefined;
      const before = recordId ? records.find(record => record.id === recordId && !record.deletedAt) : null;
      item.preview = emptyPreview(item.input, message, before ? measurementDisplay(before) : null);
    }
  }
  const pending = items.filter(item => item.status === "pending");
  for (let a = 0; a < pending.length; a++) for (let b = a + 1; b < pending.length; b++) {
    const first = pending[a].input, second = pending[b].input;
    if (first.date !== second.date || first.period !== second.period) continue;
    const overlap = first.kind === "save_record" && second.kind === "save_record" ? (!first.recordId || !second.recordId || first.recordId === second.recordId)
      : first.kind === "estimate_cell" && second.kind === "estimate_cell" ? first.metric === second.metric
      : (() => { const real = first.kind === "save_record" ? first : second as Extract<ReviewInput, { kind: "save_record" }>; const estimate = first.kind === "estimate_cell" ? first : second as Extract<ReviewInput, { kind: "estimate_cell" }>; return Object.hasOwn(real, estimate.metric) && real[estimate.metric] !== null; })();
    if (!overlap) continue;
    for (const item of [pending[a], pending[b]]) {
      item.preview.canConfirm = false; item.preview.message = "本批次中有重复目标，请修改日期／时段或取消其中一条。";
      item.preview.rows = item.preview.rows.map(row => ({ ...row, state: "conflict", message: item.preview.message }));
    }
  }
}

/** 网页专用审核入口。原始请求不变，草稿、快照和结果使用审核版本控制。 */
export async function reviewAiMeasurementOperation(db: Database, userId: string, id: string, action: ReviewAction) {
  const raw = object(action, ["kind", "revision", "changes", "itemIds"]);
  if (!Number.isInteger(raw.revision) || Number(raw.revision) < 1 || !["update", "refresh", "confirm", "cancel"].includes(String(raw.kind))) throw new ApiError(400, "invalid_input", "审核操作或版本无效。");
  if ((action.kind === "confirm" || action.kind === "cancel") && action.itemIds !== undefined && (!Array.isArray(action.itemIds) || !action.itemIds.length || action.itemIds.length > 100 || action.itemIds.some(value => typeof value !== "string") || new Set(action.itemIds).size !== action.itemIds.length)) throw new ApiError(400, "invalid_input", "请选择有效且不重复的记录。");
  return db.transaction(async tx => {
    await lockMeasurementOwner(tx, userId);
    const [row] = await tx.select().from(measurementOperation).where(and(eq(measurementOperation.userId, userId), eq(measurementOperation.id, id)));
    if (!row) throw new ApiError(404, "not_found", "操作不存在。");
    const items = operationItems(row);
    const targeted = action.kind === "confirm" || action.kind === "cancel" ? action.itemIds ? items.filter(item => action.itemIds!.includes(item.id)) : items : [];
    if ((action.kind === "confirm" || action.kind === "cancel") && action.itemIds && targeted.length !== action.itemIds.length) throw new ApiError(404, "not_found", "记录不属于本次操作。");
    if ((action.kind === "confirm" || action.kind === "cancel") && targeted.every(item => item.status !== "pending")) return operationDisplay(row);
    if (!items.some(item => item.status === "pending")) throw new ApiError(409, "closed_review", "本次审核已完成，请提交新的操作。");
    if (row.revision !== action.revision) throw new ApiError(409, "review_changed", "审核内容已在另一个页面变化，请加载最新审核；未保存输入仍保留。");
    if (action.kind !== "cancel") await requireActiveAiToken(tx, { userId, tokenId: row.tokenId, permission: "write" }, true);
    const current = await snapshot(tx, userId);
    if (action.kind === "confirm") {
      if (row.expiresAt.getTime() <= Date.now()) throw new ApiError(410, "expired", "预览已过期，请点击刷新预览后重新核对。");
      if (current.digest !== row.snapshotDigest) throw new ApiError(409, "stale_preview", "身体记录已变化，请刷新预览后重新核对。");
      const selected = targeted.filter(item => item.status === "pending");
      if (selected.some(item => !item.preview.canConfirm)) throw new ApiError(409, "no_changes", "选中的记录需要先修改、选择历史记录或取消。");
      const confirmedAt = new Date().toISOString();
      // 估算先保存，保持所展示的实测依据；同批草稿不参与估算。
      selected.sort((a, b) => Number(b.input.kind === "estimate_cell") - Number(a.input.kind === "estimate_cell"));
      for (const item of selected) {
        const actor = { userId, actorId: userId, actorType: "ai" as const, aiContext: { tokenId: row.tokenId, operationId: row.id, confirmedBy: userId, confirmedAt,
          review: { itemId: item.id, revision: row.revision, originalInput: item.originalInput, reviewedInput: item.input, ...(item.editedBy ? { editedBy: item.editedBy } : {}) } } };
        const requestId = `ai-${row.id}-${item.id}`, transactionalDb = tx as unknown as Database;
        if (item.input.kind === "save_record") {
          const result = await saveMeasurementDay(transactionalDb, actor, { ...item.preview.resolved!, operationId: requestId });
          item.result = { saved: result.saved, message: "已保存确认的身体记录。", confirmedAt };
        } else {
          const result = await estimateMeasurementCell(transactionalDb, actor, { ...item.input, operationId: requestId });
          item.result = { saved: 1, message: result.message, confirmedAt };
        }
        item.status = "confirmed";
      }
    } else if (action.kind === "cancel") {
      for (const item of targeted) if (item.status === "pending") item.status = "cancelled";
    } else if (action.kind === "update") {
      if (!Array.isArray(action.changes) || !action.changes.length || action.changes.length > 100 || new Set(action.changes.map(change => change?.itemId)).size !== action.changes.length) throw new ApiError(400, "invalid_input", "修改列表无效。");
      for (const change of action.changes) {
        object(change, ["itemId", "input"]);
        const item = items.find(item => item.id === change.itemId);
        if (!item || item.status !== "pending") throw new ApiError(409, "closed_item", "只能修改本次操作尚未保存的记录。");
        const input = parseReviewInput(change.input);
        if (input.kind !== item.input.kind) throw new ApiError(400, "invalid_input", "不能把实测改成估算或把估算改成实测。");
        if (input.kind === "save_record" && item.input.kind === "save_record" && (input.date !== item.input.date || input.period !== item.input.period) && input.recordId === item.input.recordId) { delete input.recordId; delete input.version; }
        item.input = input; item.editedBy = { userId, at: new Date().toISOString() };
      }
    } else {
      for (const item of items) if (item.status === "pending" && item.input.kind === "save_record" && item.input.recordId) {
        const input = item.input;
        const record = current.records.find(record => record.id === input.recordId && !record.deletedAt && record.recordDate === input.date && record.period === input.period);
        if (record) { input.version = record.updatedAt.toISOString(); item.editedBy = { userId, at: new Date().toISOString() }; }
      }
    }
    const fresh = action.kind === "confirm" ? await snapshot(tx, userId) : current;
    await rebuildItems(tx, userId, items, fresh.records);
    const counts = reviewCounts(items), status = reviewStatus(items), preview = { ...combinedPreview(row.payload.kind, items), ...(row.preview.defaultTimezone ? { defaultTimezone: row.preview.defaultTimezone } : {}) };
    const [updated] = await tx.update(measurementOperation).set({ preview, status, revision: row.revision + 1, snapshotDigest: fresh.digest,
      ...(action.kind === "update" || action.kind === "refresh" ? { expiresAt: new Date(Date.now() + 15 * 60000) } : {}),
      confirmedAt: counts.saved ? new Date(items.filter(item => item.result).map(item => item.result!.confirmedAt).sort().at(-1)!) : null,
      result: counts.saved || !counts.pending ? { saved: counts.saved, message: status === "confirmed" ? "已保存确认的身体记录。" : `已保存 ${counts.saved} 条，已取消 ${counts.cancelled} 条，跳过 ${counts.skipped} 条，待处理 ${counts.pending} 条。` } : null,
    }).where(eq(measurementOperation.id, id)).returning();
    return operationDisplay(updated);
  });
}
