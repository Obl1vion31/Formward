import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db/client";
import { measurement, measurementEvent, measurementSource } from "../../db/schema";
import { lockMeasurementOwner, type MeasurementActor, type MeasurementTransaction } from "./records";

export function validateDeviceLabel(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 300 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("实测请填写数据来源，最多 300 个字符。");
  return value.trim();
}
export class MeasurementSourceError extends Error {
  readonly field = "deviceLabel";
  constructor(message = "请填写数据来源，或明确确认不填写来源。", readonly code = "source_confirmation_required") { super(message); }
}
/** 新实测和主动清空须确认；旧记录未改来源时保留原快照。 */
export function resolveMeasurementSource(edit: { deviceLabel?: string | null; sourceUnspecifiedConfirmed?: boolean }, before?: { deviceLabel: string | null }) {
  if (edit.sourceUnspecifiedConfirmed !== undefined && typeof edit.sourceUnspecifiedConfirmed !== "boolean") throw new MeasurementSourceError("来源留空确认须为布尔值。", "invalid_source_confirmation");
  const supplied = Object.hasOwn(edit, "deviceLabel"), value = supplied ? edit.deviceLabel : before?.deviceLabel;
  if (typeof value === "string" && value.trim()) {
    if (edit.sourceUnspecifiedConfirmed) throw new MeasurementSourceError("已填写数据来源，请取消不填写来源的选择。", "source_confirmation_conflict");
    return validateDeviceLabel(value);
  }
  if (before && !supplied && !edit.sourceUnspecifiedConfirmed) return before.deviceLabel;
  if (edit.sourceUnspecifiedConfirmed) {
    if (!supplied || value !== null) throw new MeasurementSourceError("确认不填写来源时，请将 deviceLabel 明确设为 null。", "invalid_source_confirmation");
    return null;
  }
  throw new MeasurementSourceError();
}
export async function listMeasurementSources(db: Database, userId: string) {
  if (!userId?.trim()) throw new Error("缺少经过验证的账号。");
  const rows = await db.select({ label: measurementSource.label }).from(measurementSource).where(and(eq(measurementSource.userId, userId), isNull(measurementSource.deletedAt))).orderBy(desc(measurementSource.lastUsedAt), measurementSource.label);
  return rows.map(row => row.label);
}
/** 仅在成功的实测事务里更新使用时间，失败不留下建议名称。 */
export async function rememberMeasurementSource(tx: MeasurementTransaction, userId: string, label: string, restoreDeleted = false) {
  label = validateDeviceLabel(label);
  await tx.insert(measurementSource).values({ userId, label }).onConflictDoUpdate({ target: [measurementSource.userId, measurementSource.label], set: { lastUsedAt: new Date(), ...(restoreDeleted ? { deletedAt: null, deletedBy: null } : {}) } });
}
/** 仅移除账号建议；记录上的名称快照和当前草稿保持。 */
export async function removeMeasurementSource(db: Database, actor: MeasurementActor, value: string) {
  if (!actor.userId?.trim() || actor.actorId !== actor.userId) throw new Error("操作者与账号不一致。");
  const label = validateDeviceLabel(value);
  return db.transaction(async tx => {
    await lockMeasurementOwner(tx, actor.userId);
    await tx.update(measurementSource).set({ deletedAt: new Date(), deletedBy: actor.actorId }).where(and(eq(measurementSource.userId, actor.userId), eq(measurementSource.label, label), isNull(measurementSource.deletedAt)));
    return listMeasurementSources(tx as unknown as Database, actor.userId);
  });
}
/** 已授权的账号来源补齐；不碰数值、时间、录入入口、删除状态或估计。 */
export async function fillMissingMeasurementSources(db: Database, actor: MeasurementActor, value: string) {
  if (!actor.userId?.trim() || actor.actorId !== actor.userId) throw new Error("操作者与账号不一致。");
  const deviceLabel = validateDeviceLabel(value);
  return db.transaction(async tx => {
    await lockMeasurementOwner(tx, actor.userId);
    const rows = await tx.select().from(measurement).where(and(eq(measurement.userId, actor.userId), eq(measurement.recordKind, "observed"), isNull(measurement.deviceLabel)));
    for (const before of rows) {
      const [after] = await tx.update(measurement).set({ deviceLabel, updatedAt: new Date(Math.max(Date.now(), before.updatedAt.getTime() + 1)) }).where(and(eq(measurement.userId, actor.userId), eq(measurement.id, before.id))).returning();
      await tx.insert(measurementEvent).values({ id: randomUUID(), userId: actor.userId, measurementId: before.id, action: "update", actorType: actor.actorType ?? "development_backend", actorId: actor.actorId, snapshot: { before, after, reason: "user_confirmed_missing_source" } });
    }
    if (rows.length) await rememberMeasurementSource(tx, actor.userId, deviceLabel, true);
    return { updated: rows.length };
  });
}
