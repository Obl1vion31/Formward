import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db/client";
import { measurement, measurementDay, measurementEvent, measurementImport } from "../../db/schema";
import { insertReportedMeasurement, lockMeasurementOwner, validateReportedMeasurement, type MeasurementActor, type MeasurementTransaction } from "./records";
import { calendarOrdinal, type MeasurementMetric } from "./trend";
import { buildHistoricalEstimates } from "./estimation";
import { insertEstimate, supersedeEstimates } from "./estimate-records";
import { getInitializationBatch, isFrozenDate } from "./initialization";
import { entryMetrics, entryPeriods, localMeasurementDate, type EntryPeriod, type MeasurementDisplay } from "./entry-state";

import { rememberMeasurementSource, validateDeviceLabel } from "./sources";

export type PeriodEdit = {
  recordId?: string;
  version?: string;
  weightKg?: string | null;
  bodyFatPercent?: string | null;
  deviceLabel?: string | null;
  fasting?: boolean | null;
};
export type SaveMeasurementDayInput = { date: string; timezone: string | null; periods: Partial<Record<EntryPeriod, PeriodEdit>>; operationId: string };
export type EstimateCellInput = { date: string; period: EntryPeriod; metric: MeasurementMetric; operationId: string };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function measurementDisplay(row: typeof measurement.$inferSelect): MeasurementDisplay {
  return { id: row.id, analysisDate: row.analysisDate, localDate: row.localDate, period: row.period,
    weightKg: row.weightKg, bodyFatPercent: row.bodyFatPercent, fasting: row.fasting,
    sourceLocalTime: row.sourceLocalTime, timezone: row.timezone, sourceType: row.sourceType,
    sourceSystem: row.sourceSystem, sourceRecordId: row.sourceRecordId, recordKind: row.recordKind,
    entryChannel: row.entryChannel, deviceLabel: row.deviceLabel,
    estimation: row.estimation, timePrecision: row.timePrecision, updatedAt: row.updatedAt.toISOString() };
}
function requireActor(actor: MeasurementActor) {
  if (!actor.userId?.trim() || actor.actorId !== actor.userId) throw new Error("操作者与账号不一致。");
}
function validateTimezone(timezone: string | null) {
  if (timezone !== null) try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); } catch { throw new Error("时区无效。"); }
}

async function startOperation(tx: MeasurementTransaction, actor: MeasurementActor, operationId: string, payload: unknown) {
  if (typeof operationId !== "string" || !/^[a-zA-Z0-9-]{8,120}$/.test(operationId)) throw new Error("请求标识无效。");
  const fileDigest = hash(["measurement-entry-v1", actor.userId, operationId]), requestDigest = hash(payload);
  const [prior] = await tx.select().from(measurementImport).where(and(eq(measurementImport.userId, actor.userId), eq(measurementImport.fileDigest, fileDigest)));
  if (prior) {
    if (prior.requestDigest !== requestDigest) throw new Error("同一请求标识不能用于不同内容。");
    return { id: prior.id, repeated: true };
  }
  const [batch] = await tx.insert(measurementImport).values({ id: randomUUID(), userId: actor.userId, fileDigest, requestDigest, sourceLabel: "身体记录操作", captureChannel: "manual", insertedCount: 0, skippedCount: 0, createdBy: actor.actorId }).returning();
  return { id: batch.id, repeated: false };
}

async function ensureDate(tx: MeasurementTransaction, actor: MeasurementActor, date: string, skip = false) {
  const now = new Date();
  await tx.insert(measurementDay).values({ id: randomUUID(), userId: actor.userId, analysisDate: date, createdBy: actor.actorId, reminderSkippedAt: skip ? now : null })
    .onConflictDoUpdate({ target: [measurementDay.userId, measurementDay.analysisDate], set: { deletedAt: null, updatedAt: now, ...(skip ? { reminderSkippedAt: now } : {}) } });
}
export async function listMeasurementDates(db: Database, userId: string) {
  if (!userId?.trim()) throw new Error("缺少经过验证的账号。");
  const rows = await db.select().from(measurementDay).where(and(eq(measurementDay.userId, userId), isNull(measurementDay.deletedAt)));
  return rows.map(row => ({ date: row.analysisDate, reminderSkipped: row.reminderSkippedAt !== null }));
}
export async function createMeasurementDate(db: Database, actor: MeasurementActor, date: string) {
  requireActor(actor); calendarOrdinal(date);
  await db.transaction(async tx => { await lockMeasurementOwner(tx, actor.userId); await ensureDate(tx, actor, date); });
}
export async function skipMeasurementReminder(db: Database, actor: MeasurementActor, date: string, timezone: string) {
  requireActor(actor); calendarOrdinal(date); validateTimezone(timezone);
  if (date !== localMeasurementDate(new Date(), timezone)) throw new Error("只能关闭今天的录入提醒。");
  await db.transaction(async tx => { await lockMeasurementOwner(tx, actor.userId); await ensureDate(tx, actor, date, true); });
}

/** 同一天的部分字段一次提交；遗漏字段保留，显式 null 才清空。 */
export async function saveMeasurementDay(db: Database, actor: MeasurementActor, input: SaveMeasurementDayInput) {
  requireActor(actor); calendarOrdinal(input.date); validateTimezone(input.timezone);
  if (!input.periods || Object.keys(input.periods).some(key => !entryPeriods.includes(key as EntryPeriod)) || !Object.keys(input.periods).length) throw new Error("请选择要保存的指标。");
  return db.transaction(async tx => {
    await lockMeasurementOwner(tx, actor.userId);
    const batch = await startOperation(tx, actor, input.operationId, ["save", input.date, input.timezone, input.periods]);
    if (batch.repeated) return { repeated: true, saved: 0 };
    let saved = 0;
    for (const period of entryPeriods) {
      const edit = input.periods[period];
      if (!edit) continue;
      if (!entryMetrics.some(metric => Object.hasOwn(edit, metric)) && !Object.hasOwn(edit, "deviceLabel") && !Object.hasOwn(edit, "fasting")) throw new Error("请选择要保存的指标。");
      const [before] = edit.recordId ? await tx.select().from(measurement).where(and(eq(measurement.userId, actor.userId), eq(measurement.id, edit.recordId), isNull(measurement.deletedAt))) : [];
      if (edit.recordId && (!before || before.recordKind !== "observed" || before.analysisDate !== input.date || before.period !== period)) throw new Error("记录不存在或不属于当前日期时段。");
      if (before && before.updatedAt.toISOString() !== edit.version) throw new Error("记录已变化，请刷新后重新编辑。");
      const values = { weightKg: before?.weightKg ?? null, bodyFatPercent: before?.bodyFatPercent ?? null, fasting: before?.fasting ?? null };
      for (const field of ["weightKg", "bodyFatPercent", "fasting"] as const) if (Object.hasOwn(edit, field)) Object.assign(values, { [field]: edit[field] });
      const valid = validateReportedMeasurement({ analysisDate: input.date, period, ...values, timezone: input.timezone });
      // 晨间表单只接收空腹实测，也不能把旧的非空腹／未知记录静默改为空腹。
      if (period === "daytime" && (valid.fasting !== true || (before && before.fasting !== true))) throw new Error("晨间只记录空腹测量；原记录非空腹或条件未确认时保持只读。");
      const deviceLabel = validateDeviceLabel(Object.hasOwn(edit, "deviceLabel") ? edit.deviceLabel : before?.deviceLabel);
      if (before) {
        const [after] = await tx.update(measurement).set({ weightKg: valid.weightKg, bodyFatPercent: valid.bodyFatPercent, deviceLabel, fasting: valid.fasting, fastingSource: valid.fastingSource, updatedAt: new Date(Math.max(Date.now(), before.updatedAt.getTime() + 1)) }).where(and(eq(measurement.userId, actor.userId), eq(measurement.id, before.id))).returning();
        await tx.insert(measurementEvent).values({ id: randomUUID(), userId: actor.userId, measurementId: after.id, action: "update", actorType: actor.actorType ?? "user", actorId: actor.actorId, snapshot: { before, after, reason: "manual_measurement_edit", importId: batch.id } });
        if (before.weightKg !== valid.weightKg || before.bodyFatPercent !== valid.bodyFatPercent) await supersedeEstimates(tx, actor, input.date, period);
      } else {
        const prior = await tx.select().from(measurement).where(and(eq(measurement.userId, actor.userId), eq(measurement.analysisDate, input.date), eq(measurement.period, period), eq(measurement.recordKind, "observed"), isNull(measurement.deletedAt)));
        if (prior.length) throw new Error("该时段已有实测，请刷新并选择要编辑的记录。");
        await insertReportedMeasurement(tx, actor, valid, batch.id, { entryChannel: "manual", deviceLabel });
      }
      await rememberMeasurementSource(tx, actor.userId, deviceLabel);
      saved++;
    }
    await ensureDate(tx, actor, input.date);
    await tx.update(measurementImport).set({ insertedCount: saved }).where(eq(measurementImport.id, batch.id));
    return { repeated: false, saved };
  });
}

/** 明确点击单项估算才调用；预测其他项只作内部计算，不保存它们。 */
export async function estimateMeasurementCell(db: Database, actor: MeasurementActor, input: EstimateCellInput) {
  requireActor(actor); calendarOrdinal(input.date);
  if (!entryPeriods.includes(input.period) || !entryMetrics.includes(input.metric)) throw new Error("估算指标无效。");
  return db.transaction(async tx => {
    await lockMeasurementOwner(tx, actor.userId);
    const batch = await startOperation(tx, actor, input.operationId, ["estimate", input.date, input.period, input.metric]);
    if (batch.repeated) return { message: "此估算请求已处理。", repeated: true };
    const initialization = await getInitializationBatch(tx, actor.userId);
    if (isFrozenDate(initialization, input.date)) throw new Error("历史补全已固定，可补录实测，不再新增估计。");
    const records = await tx.select().from(measurement).where(and(eq(measurement.userId, actor.userId), isNull(measurement.deletedAt)));
    const samePeriod = records.filter(row => row.analysisDate === input.date && row.period === input.period);
    if (samePeriod.some(row => row[input.metric] !== null)) throw new Error("该指标已有数值，请刷新查看；没有覆盖。");
    const calculated = buildHistoricalEstimates(records, { start: input.date, end: input.date }, { preserveExisting: false });
    const prediction = calculated.estimates.find(row => row.period === input.period);
    const evidence = prediction?.estimation[input.metric];
    if (!prediction || !evidence) {
      const reason = calculated.outcomes.find(row => row.period === input.period && row.metric === input.metric)?.reason;
      return { message: `${reason ?? "真实依据不足"}，此项保持空白。`, repeated: false };
    }
    const existing = samePeriod.find(row => row.recordKind === "estimated");
    if (existing) {
      if (existing.estimation?.method !== "morning-baseline-v3" || prediction.estimation.method !== "morning-baseline-v3") throw new Error("旧估计不支持增补，请保留原值并补录实测。");
      const [after] = await tx.update(measurement).set({ [input.metric]: prediction[input.metric], estimation: { ...existing.estimation, [input.metric]: evidence }, updatedAt: new Date() }).where(and(eq(measurement.userId, actor.userId), eq(measurement.id, existing.id))).returning();
      await tx.insert(measurementEvent).values({ id: randomUUID(), userId: actor.userId, measurementId: after.id, action: "estimate", actorType: actor.actorType ?? "user", actorId: actor.actorId, snapshot: { before: existing, after, metric: input.metric, reason: "explicit_single_metric_estimate", importId: batch.id } });
    } else {
      const otherMetric = input.metric === "weightKg" ? "bodyFatPercent" : "weightKg";
      await insertEstimate(tx, actor, { ...prediction, [otherMetric]: null, estimation: { ...prediction.estimation, [otherMetric]: null } }, { operationKey: batch.id, importId: batch.id, reason: "explicit_single_metric_estimate", entryChannel: "manual" });
    }
    await ensureDate(tx, actor, input.date);
    await tx.update(measurementImport).set({ insertedCount: 1 }).where(eq(measurementImport.id, batch.id));
    return { message: "已估算此项，仅用于辅助趋势。", repeated: false };
  });
}
