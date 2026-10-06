import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { measurement, measurementEvent } from "../../db/schema";
import { lockMeasurementOwner, supersedeEstimates } from "./records";

type MeasurementRow = typeof measurement.$inferSelect;

function requireActor(userId: string, actorId = userId) {
  if (!userId.trim() || actorId !== userId) throw new Error("维护操作者与目标账号不一致。");
}

function previewRows(rows: MeasurementRow[], userId: string) {
  const groups = new Map<string, MeasurementRow[]>();
  for (const row of rows) {
    if (row.recordKind === "estimated") continue;
    const key = `${row.analysisDate}:${row.period}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const duplicates = [...groups.values()].filter((group) => group.length > 1).map((group) => {
    const ordered = [...group].sort((a, b) => {
      if (a.occurredAt && b.occurredAt) return a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id);
      return a.sourceLocalTime.localeCompare(b.sourceLocalTime) || a.id.localeCompare(b.id);
    });
    return { keepId: ordered[0].id, deleteIds: ordered.slice(1).map((row) => row.id) };
  });
  const eveningIds = rows.filter((row) => row.period === "evening" && (row.fasting !== false || row.fastingSource !== "evening_rule")).map((row) => row.id).sort();
  const digest = createHash("sha256").update(JSON.stringify([userId, [...rows].sort((a, b) => a.id.localeCompare(b.id))])).digest("hex");
  return { digest, activeCount: rows.length, eveningIds, duplicates };
}

/** 只读预览；执行绑定整个账号当前快照，避免覆盖预览后的修改。 */
export async function previewMeasurementMaintenance(db: Database, userId: string) {
  requireActor(userId);
  const rows = await db.select().from(measurement).where(and(eq(measurement.userId, userId), isNull(measurement.deletedAt)));
  return previewRows(rows, userId);
}

export async function applyMeasurementMaintenance(db: Database, input: { userId: string; actorId: string; digest: string }) {
  requireActor(input.userId, input.actorId);
  if (!/^[a-f0-9]{64}$/.test(input.digest)) throw new Error("维护预览标识无效。");
  return db.transaction(async (tx) => {
    await lockMeasurementOwner(tx, input.userId);
    const rows = await tx.select().from(measurement).where(and(eq(measurement.userId, input.userId), isNull(measurement.deletedAt))).for("update");
    const [prior] = await tx.select({ id: measurementEvent.id }).from(measurementEvent).where(and(
      eq(measurementEvent.userId, input.userId), sql`${measurementEvent.snapshot}->>'operationDigest' = ${input.digest}`,
    )).limit(1);
    if (prior) return { eveningUpdated: 0, deleted: 0, repeated: true };
    const preview = previewRows(rows, input.userId);
    if (preview.digest !== input.digest) throw new Error("记录已变化，请重新预览；没有写入。");
    const before = new Map(rows.map((row) => [row.id, row]));
    const now = new Date();
    const changed = preview.eveningIds.length ? await tx.update(measurement).set({ fasting: false, fastingSource: "evening_rule", updatedAt: now })
      .where(and(eq(measurement.userId, input.userId), inArray(measurement.id, preview.eveningIds), isNull(measurement.deletedAt))).returning() : [];
    if (changed.length) await tx.insert(measurementEvent).values(changed.map((row) => ({
      id: randomUUID(), userId: input.userId, measurementId: row.id, action: "update", actorType: "user", actorId: input.actorId,
      snapshot: { before: before.get(row.id), after: row, reason: "evening_non_fasting", operationDigest: input.digest },
    })));
    changed.forEach((row) => before.set(row.id, row));
    const deleteIds = preview.duplicates.flatMap((group) => group.deleteIds);
    const deleted = deleteIds.length ? await tx.update(measurement).set({ deletedAt: now, updatedAt: now })
      .where(and(eq(measurement.userId, input.userId), inArray(measurement.id, deleteIds), isNull(measurement.deletedAt))).returning() : [];
    if (deleted.length) await tx.insert(measurementEvent).values(deleted.map((row) => ({
      id: randomUUID(), userId: input.userId, measurementId: row.id, action: "delete", actorType: "user", actorId: input.actorId,
      snapshot: { before: before.get(row.id), after: row, reason: "keep_earliest_in_period", operationDigest: input.digest, retainedId: preview.duplicates.find((group) => group.deleteIds.includes(row.id))!.keepId },
    })));
    return { eveningUpdated: changed.length, deleted: deleted.length, repeated: false };
  });
}

export async function restoreMeasurement(db: Database, input: { userId: string; actorId: string; id: string }) {
  requireActor(input.userId, input.actorId);
  if (!input.id.trim()) throw new Error("记录标识无效。");
  return db.transaction(async (tx) => {
    await lockMeasurementOwner(tx, input.userId);
    const [before] = await tx.select().from(measurement).where(and(eq(measurement.userId, input.userId), eq(measurement.id, input.id))).for("update");
    if (!before) throw new Error("记录不存在或不属于当前账号。");
    if (before.deletedAt === null) return { restored: false };
    if (before.recordKind === "estimated") {
      const active = await tx.select({ id: measurement.id }).from(measurement).where(and(eq(measurement.userId, input.userId), eq(measurement.analysisDate, before.analysisDate), eq(measurement.period, before.period), isNull(measurement.deletedAt)));
      if (active.length) throw new Error("该时段已有有效记录，不能恢复估计值。");
    } else await supersedeEstimates(tx, input, before.analysisDate, before.period);
    const [after] = await tx.update(measurement).set({ deletedAt: null, updatedAt: new Date(), ...(before.period === "evening" ? { fasting: false, fastingSource: "evening_rule" } : {}) })
      .where(and(eq(measurement.userId, input.userId), eq(measurement.id, input.id))).returning();
    await tx.insert(measurementEvent).values({
      id: randomUUID(), userId: input.userId, measurementId: after.id, action: "restore", actorType: "user", actorId: input.actorId,
      snapshot: { before, after, reason: "user_restore" },
    });
    return { restored: true };
  });
}
