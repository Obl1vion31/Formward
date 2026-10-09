import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db/client";
import { measurement, measurementEvent, measurementImport, user } from "../../db/schema";
import { assignMeasurement } from "./assignment";
import { resolveMeasurementTime } from "./time";
import { validateMeasurementTimezone } from "./timezone";
import { calendarOrdinal } from "./trend";
import { supersedeEstimates } from "./estimate-records";
import { rememberMeasurementSource, validateDeviceLabel } from "./sources";
export { supersedeEstimates } from "./estimate-records";

export type MeasurementTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type MeasurementActor = { userId: string; actorId: string; actorType?: "user" | "ai" | "development_backend"; aiContext?: { tokenId: string; operationId: string; confirmedBy: string; confirmedAt: string; review?: Record<string, unknown> } };
export type EntryChannel = "api" | "manual" | "development_backend";

/** 所有测量写入锁定归属账号，避免实测补录与估计生成并发留下重复时段。 */
export async function lockMeasurementOwner(tx: MeasurementTransaction, userId: string) {
  requireUser(userId);
  const [owner] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
  if (!owner) throw new Error("目标账号不存在。");
}

export type ImportedMeasurement = {
  sourceLocalTime: string;
  weightKg: string | null;
  bodyFatPercent: string | null;
  sourceRow: number;
  timezone?: string | null;
  utcOffsetMinutes?: number | null;
  fasting?: boolean | null;
  fastingSource?: "user_confirmed" | "evening_rule" | null;
};

export function validateImportedMeasurement(input: ImportedMeasurement) {
  const assignment = assignMeasurement(input.sourceLocalTime);
  const time = resolveMeasurementTime(input.sourceLocalTime, input.timezone ?? null, input.utcOffsetMinutes ?? undefined);
  const fasting = assignment.period === "evening" ? false : input.fasting ?? null;
  const fastingSource = assignment.period === "evening" ? "evening_rule" as const : input.fastingSource ?? null;
  if (input.fasting != null && typeof input.fasting !== "boolean") throw new Error("空腹状态无效。");
  if (input.fastingSource != null && input.fastingSource !== "user_confirmed" && input.fastingSource !== "evening_rule") throw new Error("空腹确认来源无效。");
  if ((fasting !== null && typeof fasting !== "boolean") ||
      (assignment.period === "daytime" && fastingSource === "evening_rule") ||
      (fasting !== null && fastingSource === null) || (fasting === null && fastingSource !== null)) {
    throw new Error("空腹状态须有明确确认来源，未知条件不得推断。");
  }
  const weightKg = input.weightKg === null ? null : validateDecimal(input.weightKg, "体重", 0, 99999.99, false);
  if (weightKg === null && input.bodyFatPercent === null) throw new Error("请至少填写体重或体脂率。");
  const bodyFatPercent = input.bodyFatPercent === null ? null : validateDecimal(input.bodyFatPercent, "体脂率", 0, 100, true);
  if (!Number.isInteger(input.sourceRow) || input.sourceRow < 2) throw new Error("来源行号无效。");
  return { ...input, weightKg, bodyFatPercent, fasting, fastingSource, ...assignment, ...time };
}

export function validateDecimal(value: string, label: string, min: number, max: number, allowMin: boolean) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(`${label}须为最多两位小数的非负数。`);
  const number = Number(value);
  if (!Number.isFinite(number) || number > max || (allowMin ? number < min : number <= min)) {
    throw new Error(`${label}超出有效范围。`);
  }
  return number.toFixed(2);
}

export async function listMeasurements(db: Database, userId: string) {
  requireUser(userId);
  return db.select().from(measurement)
    .where(and(eq(measurement.userId, userId), isNull(measurement.deletedAt)))
    .orderBy(desc(measurement.sourceLocalTime));
}

export async function getMeasurement(db: Database, userId: string, id: string) {
  requireUser(userId);
  const [row] = await db.select().from(measurement)
    .where(and(eq(measurement.userId, userId), eq(measurement.id, id), isNull(measurement.deletedAt)));
  return row ?? null;
}

/** userId 必须来自受验证身份；当前入口是管理员按用户指定邮箱匹配的维护脚本。 */
export async function saveImportedMeasurements(db: Database, input: {
  userId: string;
  actorId: string;
  fileDigest: string;
  sourceLabel: string;
  captureChannel: "chat" | "file";
  records: ImportedMeasurement[];
  entryChannel?: EntryChannel;
  deviceLabel?: string;
}) {
  requireUser(input.userId);
  if (input.actorId !== input.userId) throw new Error("导入操作者与账号不一致。");
  if (!/^[a-f0-9]{64}$/.test(input.fileDigest) || !input.sourceLabel.trim()) throw new Error("导入来源无效。");
  if (input.records.length === 0 || input.records.length > 10000) throw new Error("单次导入须有 1–10000 条记录。");
  const records = input.records.map(validateImportedMeasurement);
  const deviceLabel = input.deviceLabel === undefined ? null : validateDeviceLabel(input.deviceLabel);
  const timestamps = new Map<string, string>();
  for (const record of records) {
    const identity = JSON.stringify([record.sourceLocalTime, record.timezone, record.utcOffsetMinutes]);
    const values = JSON.stringify([record.weightKg, record.bodyFatPercent]);
    if (timestamps.has(identity) && timestamps.get(identity) !== values) {
      throw new Error("同一测量时间存在不同数值，请先核对冲突。");
    }
    timestamps.set(identity, values);
  }

  return db.transaction(async (tx) => {
    await lockMeasurementOwner(tx, input.userId);
    const [batch] = await tx.insert(measurementImport).values({
      id: randomUUID(), userId: input.userId, fileDigest: input.fileDigest,
      sourceLabel: input.sourceLabel, captureChannel: input.captureChannel,
      insertedCount: 0, skippedCount: 0, createdBy: input.actorId,
    }).onConflictDoNothing({ target: [measurementImport.userId, measurementImport.fileDigest] }).returning();
    if (!batch) {
      const [existing] = await tx.select().from(measurementImport)
        .where(and(eq(measurementImport.userId, input.userId), eq(measurementImport.fileDigest, input.fileDigest)));
      return { importId: existing.id, inserted: 0, skipped: records.length, repeated: true };
    }
    let inserted = 0;
    for (const record of records) {
      // 不把归属日放进指纹；以后纠正归属或软删除，重导不会覆盖或复活记录。
      const deduplicationKey = createHash("sha256")
        .update(JSON.stringify(["local-time-export-v2", record.sourceLocalTime, record.timezone, record.utcOffsetMinutes, record.weightKg, record.bodyFatPercent])).digest("hex");
      const prior = await tx.select().from(measurement).where(and(
        eq(measurement.userId, input.userId), eq(measurement.sourceLocalTime, record.sourceLocalTime),
        record.timezone === null ? isNull(measurement.timezone) : eq(measurement.timezone, record.timezone),
        record.utcOffsetMinutes === null ? isNull(measurement.utcOffsetMinutes) : eq(measurement.utcOffsetMinutes, record.utcOffsetMinutes),
      ));
      const matchesOriginal = (row: typeof measurement.$inferSelect) => {
        const value = (metric: "weightKg" | "bodyFatPercent") => Object.hasOwn(row.originalValues, metric) ? row.originalValues[metric] : row[metric];
        const same = (raw: string | null, current: string | null) => raw === null ? current === null : Number(raw) === Number(current);
        return same(value("weightKg"), record.weightKg) && same(value("bodyFatPercent"), record.bodyFatPercent);
      };
      if (prior.some(row => !matchesOriginal(row))) throw new Error("已有记录在同一测量时间包含不同数值，请先核对冲突。");
      if (prior.length) continue;
      const [row] = await tx.insert(measurement).values({
        id: randomUUID(), userId: input.userId, sourceLocalTime: record.sourceLocalTime,
        occurredAt: record.occurredAt, timezone: record.timezone, utcOffsetMinutes: record.utcOffsetMinutes,
        recordDate: record.recordDate, period: record.period,
        assignmentMethod: record.assignmentMethod, assignmentRuleVersion: record.assignmentRuleVersion,
        fasting: record.fasting, fastingSource: record.fastingSource,
        weightKg: record.weightKg, bodyFatPercent: record.bodyFatPercent,
        sourceType: "import", sourceSystem: null, importId: batch.id, sourceRow: record.sourceRow,
        recordKind: "observed", entryChannel: input.entryChannel ?? "development_backend",
        deviceLabel,
        originalValues: { sourceLocalTime: record.sourceLocalTime, weightKg: record.weightKg, bodyFatPercent: record.bodyFatPercent },
        deduplicationKey, createdBy: input.actorId,
      }).onConflictDoNothing({ target: [measurement.userId, measurement.deduplicationKey] }).returning();
      if (row) {
        inserted++;
        if (deviceLabel) await rememberMeasurementSource(tx, input.userId, deviceLabel);
        await supersedeEstimates(tx, input, row.recordDate, row.period);
        await tx.insert(measurementEvent).values({
          id: randomUUID(), userId: input.userId, measurementId: row.id,
          action: "import", actorType: "user", actorId: input.actorId,
          snapshot: { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() },
        });
      }
    }
    const skipped = records.length - inserted;
    await tx.update(measurementImport).set({ insertedCount: inserted, skippedCount: skipped })
      .where(and(eq(measurementImport.id, batch.id), eq(measurementImport.userId, input.userId)));
    return { importId: batch.id, inserted, skipped, repeated: false };
  });
}

export type ReportedMeasurement = {
  recordDate: string;
  period: "daytime" | "evening";
  weightKg: string | null;
  bodyFatPercent: string | null;
  fasting: boolean | null;
  timezone?: string | null;
  assumedTime?: string;
  measuredAt?: string;
};

/** 私有旧请求只在读取入口兼容；写入与业务模型统一使用 recordDate。 */
export function parseReportedMeasurement(input: unknown): ReportedMeasurement {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("实测记录无效。");
  const row = input as Record<string, unknown>;
  if (row.recordDate !== undefined && row.analysisDate !== undefined && row.recordDate !== row.analysisDate) throw new Error("记录日期与旧日期字段不一致。");
  const recordDate = row.recordDate ?? row.analysisDate;
  if (typeof recordDate !== "string") throw new Error("缺少记录日期。");
  calendarOrdinal(recordDate);
  return { recordDate, period: row.period as ReportedMeasurement["period"],
    weightKg: row.weightKg as string | null, bodyFatPercent: row.bodyFatPercent as string | null,
    fasting: row.fasting as boolean | null, timezone: row.timezone as string | null | undefined,
    assumedTime: row.assumedTime as string | undefined, measuredAt: row.measuredAt as string | undefined };
}

export function validateReportedMeasurement(input: ReportedMeasurement) {
  calendarOrdinal(input.recordDate);
  if (input.period !== "daytime" && input.period !== "evening") throw new Error("测量时段无效。");
  if (input.fasting !== null && typeof input.fasting !== "boolean") throw new Error("空腹条件无效。");
  if (input.measuredAt && input.assumedTime) throw new Error("真实测量时间不能同时使用占位时间。");
  const sourceLocalTime = input.measuredAt ?? (input.assumedTime ? `${input.recordDate} ${input.assumedTime}:00` : input.recordDate);
  const timezone = input.timezone ?? null;
  let actualTime: ReturnType<typeof resolveMeasurementTime> | null = null;
  if (input.measuredAt) {
    const assignment = assignMeasurement(input.measuredAt);
    if (assignment.period !== input.period || assignment.recordDate !== input.recordDate) throw new Error("真实时间与记录日期或时段不一致。");
    actualTime = resolveMeasurementTime(input.measuredAt, timezone);
  } else if (input.assumedTime) {
    if (!/^\d{2}:\d{2}$/.test(input.assumedTime)) throw new Error("占位时间无效。");
    const assignment = assignMeasurement(sourceLocalTime);
    if (assignment.period !== input.period || assignment.recordDate !== input.recordDate) throw new Error("占位时间与明确时段不一致。");
    resolveMeasurementTime(sourceLocalTime, timezone);
  } else if (timezone) {
    validateMeasurementTimezone(timezone);
  }
  const weightKg = input.weightKg === null ? null : validateDecimal(input.weightKg, "体重", 0, 99999.99, false);
  const bodyFatPercent = input.bodyFatPercent === null ? null : validateDecimal(input.bodyFatPercent, "体脂率", 0, 100, true);
  if (weightKg === null && bodyFatPercent === null) throw new Error("请至少填写体重或体脂率。");
  const fasting = input.period === "evening" ? false : input.fasting;
  const deduplicationKey = createHash("sha256").update(JSON.stringify(["reported-period-v2", input.recordDate, input.period, weightKg, bodyFatPercent])).digest("hex");
  return { recordDate: input.recordDate, period: input.period, sourceLocalTime,
    timezone, occurredAt: actualTime?.occurredAt ?? null, utcOffsetMinutes: actualTime?.utcOffsetMinutes ?? null, timePrecision: actualTime ? "second" : input.assumedTime ? "assumed" : "day_period",
    assignmentMethod: "user_period", assignmentRuleVersion: "reported-period-v1", fasting,
    fastingSource: input.period === "evening" ? "evening_rule" : fasting === null ? null : "user_confirmed",
    weightKg, bodyFatPercent, deduplicationKey,
    originalValues: { recordDate: input.recordDate, period: input.period, reportedTime: input.measuredAt ?? null, assumedTime: input.assumedTime ?? null, weightKg: input.weightKg, bodyFatPercent: input.bodyFatPercent },
  };
}

export function resolveReportedMeasurement(prior: (typeof measurement.$inferSelect)[], record: ReturnType<typeof validateReportedMeasurement>) {
  const active = prior.filter((row) => row.deletedAt === null);
  const sameValues = active.find((row) => (record.weightKg === null || row.weightKg === record.weightKg) && (record.bodyFatPercent === null || row.bodyFatPercent === record.bodyFatPercent));
  if (active.length === 1 && sameValues && record.timePrecision === "second" && sameValues.timePrecision !== "second") return { kind: "supplement" as const, row: sameValues };
  if (sameValues || prior.some((row) => row.deduplicationKey === record.deduplicationKey ||
      ((Object.hasOwn(row.originalValues, "recordDate") || Object.hasOwn(row.originalValues, "analysisDate")) &&
       (record.weightKg === null || Number(row.originalValues.weightKg) === Number(record.weightKg)) &&
       (record.bodyFatPercent === null || Number(row.originalValues.bodyFatPercent) === Number(record.bodyFatPercent))))) return { kind: "duplicate" as const, row: null };
  const row = active.length === 1 ? active[0] : null;
  if (row && (row.weightKg === null || record.weightKg === null || row.weightKg === record.weightKg) && (row.bodyFatPercent === null || record.bodyFatPercent === null || row.bodyFatPercent === record.bodyFatPercent)) return { kind: "supplement" as const, row };
  if (active.length) throw new Error("该日期时段已有不同实测值，请先核对。");
  return { kind: "insert" as const, row: null };
}

export async function insertReportedMeasurement(tx: MeasurementTransaction, actor: MeasurementActor, record: ReturnType<typeof validateReportedMeasurement>, importId: string, provenance: { entryChannel: EntryChannel; deviceLabel?: string | null }) {
  const prior = await tx.select().from(measurement).where(and(eq(measurement.userId, actor.userId), eq(measurement.recordKind, "observed"), eq(measurement.recordDate, record.recordDate), eq(measurement.period, record.period)));
  const resolution = resolveReportedMeasurement(prior, record);
  if (resolution.kind === "duplicate") return null;
  if (resolution.kind === "supplement") {
    const before = resolution.row;
    const confirmedTime = record.timePrecision === "second" && before.timePrecision !== "second";
    const [after] = await tx.update(measurement).set({ weightKg: before.weightKg ?? record.weightKg, bodyFatPercent: before.bodyFatPercent ?? record.bodyFatPercent, updatedAt: new Date(),
      ...(confirmedTime ? { sourceLocalTime: record.sourceLocalTime, occurredAt: record.occurredAt, timezone: record.timezone, utcOffsetMinutes: record.utcOffsetMinutes, timePrecision: "second" } : {}),
    }).where(and(eq(measurement.userId, actor.userId), eq(measurement.id, before.id))).returning();
    await supersedeEstimates(tx, actor, after.recordDate, after.period);
    await tx.insert(measurementEvent).values({ id: randomUUID(), userId: actor.userId, measurementId: after.id, action: "update", actorType: actor.actorType ?? "user", actorId: actor.actorId, snapshot: { ai: actor.aiContext, before, after, reportedValues: record.originalValues, provenance, importId, reason: confirmedTime ? "reported_exact_time" : "reported_missing_metrics" } });
    if (after.deviceLabel) await rememberMeasurementSource(tx, actor.userId, after.deviceLabel);
    return { ...after, writeKind: "updated" as const };
  }
  const [row] = await tx.insert(measurement).values({ id: randomUUID(), userId: actor.userId, ...record, ...provenance, recordKind: "observed", sourceType: "manual", sourceSystem: null, importId, createdBy: actor.actorId }).returning();
  await supersedeEstimates(tx, actor, row.recordDate, row.period);
  await tx.insert(measurementEvent).values({ id: randomUUID(), userId: actor.userId, measurementId: row.id, action: "create", actorType: actor.actorType ?? "user", actorId: actor.actorId, snapshot: { ai: actor.aiContext, after: row, reason: "user_reported_measurement" } });
  if (row.deviceLabel) await rememberMeasurementSource(tx, actor.userId, row.deviceLabel);
  return { ...row, writeKind: "inserted" as const };
}

/** 日期时段实测入口，可补缺失指标或确认准确时间；调用方须使用验证后的账号。 */
export async function saveReportedMeasurements(db: Database, input: MeasurementActor & { requestKey: string; entryChannel: EntryChannel; deviceLabel?: string; records: ReportedMeasurement[] }) {
  requireUser(input.userId);
  if (input.actorId !== input.userId || !/^[a-f0-9]{64}$/.test(input.requestKey) || !["api", "manual", "development_backend"].includes(input.entryChannel) || !input.records.length || input.records.length > 10000) throw new Error("实测写入请求无效。");
  const records = input.records.map(validateReportedMeasurement);
  const deviceLabel = input.deviceLabel === undefined ? null : validateDeviceLabel(input.deviceLabel);
  return db.transaction(async (tx) => {
    await lockMeasurementOwner(tx, input.userId);
    const [prior] = await tx.select().from(measurementImport).where(and(eq(measurementImport.userId, input.userId), eq(measurementImport.fileDigest, input.requestKey)));
    if (prior) return { inserted: 0, updated: 0, skipped: records.length, repeated: true };
    const [batch] = await tx.insert(measurementImport).values({ id: randomUUID(), userId: input.userId, fileDigest: input.requestKey, sourceLabel: "用户提供的实测值", captureChannel: input.entryChannel, insertedCount: 0, skippedCount: 0, createdBy: input.actorId }).returning();
    let inserted = 0, updated = 0;
    for (const record of records) {
      const row = await insertReportedMeasurement(tx, input, record, batch.id, { entryChannel: input.entryChannel, deviceLabel });
      if (row) { if (row.writeKind === "inserted") inserted++; else updated++; }
    }
    await tx.update(measurementImport).set({ insertedCount: inserted, skippedCount: records.length - inserted - updated }).where(and(eq(measurementImport.userId, input.userId), eq(measurementImport.id, batch.id)));
    return { inserted, updated, skipped: records.length - inserted - updated, repeated: false };
  });
}

function requireUser(userId: string) {
  if (!userId.trim()) throw new Error("缺少经过验证的账号。");
}
