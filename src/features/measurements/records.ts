import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db/client";
import { measurement, measurementEvent, measurementImport, user } from "../../db/schema";
import { assignMeasurement } from "./assignment";
import { resolveMeasurementTime } from "./time";
import { calendarOrdinal } from "./trend";

export type MeasurementTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type MeasurementActor = { userId: string; actorId: string; actorType?: "user" | "ai" | "development_backend" };
export type EntryChannel = "api" | "manual" | "development_backend";

/** 所有测量写入锁定归属账号，避免实测补录与估计生成并发留下重复时段。 */
export async function lockMeasurementOwner(tx: MeasurementTransaction, userId: string) {
  requireUser(userId);
  const [owner] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
  if (!owner) throw new Error("目标账号不存在。");
}

export async function supersedeEstimates(tx: MeasurementTransaction, actor: MeasurementActor, analysisDate: string, period: "daytime" | "evening", reason = "observed_replaces_estimate") {
  const before = await tx.select().from(measurement).where(and(eq(measurement.userId, actor.userId), eq(measurement.analysisDate, analysisDate), eq(measurement.period, period), eq(measurement.recordKind, "estimated"), isNull(measurement.deletedAt)));
  for (const row of before) {
    const [after] = await tx.update(measurement).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(measurement.userId, actor.userId), eq(measurement.id, row.id))).returning();
    await tx.insert(measurementEvent).values({ id: randomUUID(), userId: actor.userId, measurementId: row.id, action: "delete", actorType: actor.actorType ?? "user", actorId: actor.actorId, snapshot: { before: row, after, reason } });
  }
}

export type ImportedMeasurement = {
  sourceLocalTime: string;
  weightKg: string;
  bmi: string | null;
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
  const weightKg = validateDecimal(input.weightKg, "体重", 0, 99999.99, false);
  const bmi = input.bmi === null ? null : validateDecimal(input.bmi, "BMI", 0, 99999.99, false);
  const bodyFatPercent = input.bodyFatPercent === null ? null : validateDecimal(input.bodyFatPercent, "体脂率", 0, 100, true);
  if (!Number.isInteger(input.sourceRow) || input.sourceRow < 2) throw new Error("来源行号无效。");
  return { ...input, weightKg, bmi, bodyFatPercent, fasting, fastingSource, ...assignment, ...time };
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
}) {
  requireUser(input.userId);
  if (input.actorId !== input.userId) throw new Error("导入操作者与账号不一致。");
  if (!/^[a-f0-9]{64}$/.test(input.fileDigest) || !input.sourceLabel.trim()) throw new Error("导入来源无效。");
  if (input.records.length === 0 || input.records.length > 10000) throw new Error("单次导入须有 1–10000 条记录。");
  const records = input.records.map(validateImportedMeasurement);
  const timestamps = new Map<string, string>();
  for (const record of records) {
    const identity = JSON.stringify([record.sourceLocalTime, record.timezone, record.utcOffsetMinutes]);
    const values = JSON.stringify([record.weightKg, record.bmi, record.bodyFatPercent]);
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
        .update(JSON.stringify(["local-time-export-v1", record.sourceLocalTime, record.timezone, record.utcOffsetMinutes, record.weightKg, record.bmi, record.bodyFatPercent])).digest("hex");
      const prior = await tx.select().from(measurement).where(and(
        eq(measurement.userId, input.userId), eq(measurement.sourceLocalTime, record.sourceLocalTime),
        record.timezone === null ? isNull(measurement.timezone) : eq(measurement.timezone, record.timezone),
        record.utcOffsetMinutes === null ? isNull(measurement.utcOffsetMinutes) : eq(measurement.utcOffsetMinutes, record.utcOffsetMinutes),
      ));
      if (prior.some((row) => row.deduplicationKey !== deduplicationKey)) {
        throw new Error("已有记录在同一测量时间包含不同数值，请先核对冲突。");
      }
      const [row] = await tx.insert(measurement).values({
        id: randomUUID(), userId: input.userId, sourceLocalTime: record.sourceLocalTime,
        localDate: record.localDate, occurredAt: record.occurredAt, timezone: record.timezone, utcOffsetMinutes: record.utcOffsetMinutes,
        analysisDate: record.analysisDate, period: record.period,
        assignmentMethod: record.assignmentMethod, assignmentRuleVersion: record.assignmentRuleVersion,
        fasting: record.fasting, fastingSource: record.fastingSource,
        weightKg: record.weightKg, bmi: record.bmi, bodyFatPercent: record.bodyFatPercent,
        sourceType: "import", sourceSystem: null, importId: batch.id, sourceRow: record.sourceRow,
        recordKind: "observed", entryChannel: input.entryChannel ?? "development_backend",
        originalValues: { sourceLocalTime: record.sourceLocalTime, weightKg: record.weightKg, bmi: record.bmi, bodyFatPercent: record.bodyFatPercent },
        deduplicationKey, createdBy: input.actorId,
      }).onConflictDoNothing({ target: [measurement.userId, measurement.deduplicationKey] }).returning();
      if (row) {
        inserted++;
        await supersedeEstimates(tx, input, row.analysisDate, row.period);
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
  analysisDate: string;
  period: "daytime" | "evening";
  weightKg: string;
  bodyFatPercent: string | null;
  bmi?: string | null;
  fasting: boolean | null;
  timezone?: string | null;
  assumedTime?: string;
};

export function validateReportedMeasurement(input: ReportedMeasurement) {
  calendarOrdinal(input.analysisDate);
  if (input.period !== "daytime" && input.period !== "evening") throw new Error("测量时段无效。");
  if (input.fasting !== null && typeof input.fasting !== "boolean") throw new Error("空腹条件无效。");
  const sourceLocalTime = input.assumedTime ? `${input.analysisDate} ${input.assumedTime}:00` : input.analysisDate;
  const timezone = input.timezone ?? null;
  if (input.assumedTime) {
    if (!/^\d{2}:\d{2}$/.test(input.assumedTime)) throw new Error("占位时间无效。");
    const assignment = assignMeasurement(sourceLocalTime);
    if (assignment.period !== input.period || assignment.analysisDate !== input.analysisDate) throw new Error("占位时间与明确时段不一致。");
    resolveMeasurementTime(sourceLocalTime, timezone);
  } else if (timezone) {
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); } catch { throw new Error("来源时区无效。"); }
  }
  const weightKg = validateDecimal(input.weightKg, "体重", 0, 99999.99, false);
  const bodyFatPercent = input.bodyFatPercent === null ? null : validateDecimal(input.bodyFatPercent, "体脂率", 0, 100, true);
  const bmi = input.bmi == null ? null : validateDecimal(input.bmi, "BMI", 0, 99999.99, false);
  const fasting = input.period === "evening" ? false : input.fasting;
  const deduplicationKey = createHash("sha256").update(JSON.stringify(["reported-period-v1", input.analysisDate, input.period, weightKg, bodyFatPercent, bmi])).digest("hex");
  return { analysisDate: input.analysisDate, localDate: input.analysisDate, period: input.period, sourceLocalTime,
    timezone, occurredAt: null, utcOffsetMinutes: null, timePrecision: input.assumedTime ? "assumed" : "day_period",
    assignmentMethod: "user_period", assignmentRuleVersion: "reported-period-v1", fasting,
    fastingSource: input.period === "evening" ? "evening_rule" : fasting === null ? null : "user_confirmed",
    weightKg, bodyFatPercent, bmi, deduplicationKey,
    originalValues: { analysisDate: input.analysisDate, period: input.period, reportedTime: null, assumedTime: input.assumedTime ?? null, weightKg: input.weightKg, bodyFatPercent: input.bodyFatPercent, bmi: input.bmi ?? null },
  };
}

export async function insertReportedMeasurement(tx: MeasurementTransaction, actor: MeasurementActor, record: ReturnType<typeof validateReportedMeasurement>, importId: string, provenance: { entryChannel: EntryChannel; deviceName?: string | null; companionApp?: string | null }) {
  const prior = await tx.select().from(measurement).where(and(eq(measurement.userId, actor.userId), eq(measurement.recordKind, "observed"), eq(measurement.analysisDate, record.analysisDate), eq(measurement.period, record.period)));
  if (prior.some((row) => row.deletedAt === null && row.weightKg === record.weightKg && (record.bodyFatPercent === null || row.bodyFatPercent === record.bodyFatPercent) && (record.bmi === null || row.bmi === record.bmi))) return null;
  if (prior.some((row) => row.deduplicationKey === record.deduplicationKey)) return null;
  if (prior.some((row) => row.deletedAt === null)) throw new Error("该日期时段已有不同实测值，请先核对。");
  const [row] = await tx.insert(measurement).values({ id: randomUUID(), userId: actor.userId, ...record, ...provenance, recordKind: "observed", sourceType: "manual", sourceSystem: null, importId, createdBy: actor.actorId }).returning();
  await supersedeEstimates(tx, actor, row.analysisDate, row.period);
  await tx.insert(measurementEvent).values({ id: randomUUID(), userId: actor.userId, measurementId: row.id, action: "create", actorType: actor.actorType ?? "user", actorId: actor.actorId, snapshot: { after: row, reason: "user_reported_measurement" } });
  return row;
}

/** 日期与时段明确、精确时间未知的实测入口；调用方须使用验证后的账号。 */
export async function saveReportedMeasurements(db: Database, input: MeasurementActor & { requestKey: string; entryChannel: EntryChannel; records: ReportedMeasurement[] }) {
  requireUser(input.userId);
  if (input.actorId !== input.userId || !/^[a-f0-9]{64}$/.test(input.requestKey) || !["api", "manual", "development_backend"].includes(input.entryChannel) || !input.records.length || input.records.length > 10000) throw new Error("实测写入请求无效。");
  const records = input.records.map(validateReportedMeasurement);
  return db.transaction(async (tx) => {
    await lockMeasurementOwner(tx, input.userId);
    const [prior] = await tx.select().from(measurementImport).where(and(eq(measurementImport.userId, input.userId), eq(measurementImport.fileDigest, input.requestKey)));
    if (prior) return { inserted: 0, skipped: records.length, repeated: true };
    const [batch] = await tx.insert(measurementImport).values({ id: randomUUID(), userId: input.userId, fileDigest: input.requestKey, sourceLabel: "用户提供的实测值", captureChannel: input.entryChannel, insertedCount: 0, skippedCount: 0, createdBy: input.actorId }).returning();
    let inserted = 0;
    for (const record of records) if (await insertReportedMeasurement(tx, input, record, batch.id, { entryChannel: input.entryChannel })) inserted++;
    await tx.update(measurementImport).set({ insertedCount: inserted, skippedCount: records.length - inserted }).where(and(eq(measurementImport.userId, input.userId), eq(measurementImport.id, batch.id)));
    return { inserted, skipped: records.length - inserted, repeated: false };
  });
}

function requireUser(userId: string) {
  if (!userId.trim()) throw new Error("缺少经过验证的账号。");
}
