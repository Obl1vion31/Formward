import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { dataConnection, dataSourceEvent, energyDayAdoption } from "../../db/schema";
import type { Transaction } from "../auth/owner-lock";
import type { EnergyPreview, EnergyRecord } from "../activities/model";
import { sourceAccessEnabled } from "./model";

export function energyFactsChanged(before?: EnergyRecord, after?: EnergyRecord) {
  if (!before || !after || !!before.deletedAt !== !!after.deletedAt) return true;
  const fields = "name" in after ? ["date", "name", "durationMinutes", "calorieMode", "exerciseActiveKcal", "exerciseRestingKcal", "caloriesKcal", "completed", "inclusion"] : ["date", "entryMode", "activityMode", "restingKcal", "activeKcal", "totalKcal", "steps", "restingEstimated", "activeEstimated", "timezone"];
  const b = before as unknown as Record<string, unknown>, a = after as unknown as Record<string, unknown>;
  return [...fields,"sourceSystem","sourceRecordId","sourceOccurredAt","restingSourceSystem","activeSourceSystem","timezone"].some(key => { const left = b[key] ?? null, right = a[key] ?? null; return /Kcal$/.test(key) || key === "durationMinutes" ? (left === null) !== (right === null) || left !== null && Number(left) !== Number(right) : left !== right; });
}

/** 调用方已经持有账号锁。用户确认的 AI 修改也按人工维护保护。 */
export async function protectManualEnergyDays(tx: Transaction, userId: string, rows: EnergyPreview[]) {
  if (!sourceAccessEnabled(userId)) return;
  const [connection] = await tx.select({ id: dataConnection.id }).from(dataConnection).where(eq(dataConnection.userId, userId)).limit(1);
  if (!connection) return;
  const dates = new Set<string>();
  for (const row of rows) if (energyFactsChanged(row.before, row.after)) for (const record of [row.before, row.after]) if (record && "date" in record) dates.add(record.date);
  for (const date of dates) {
    const [before] = await tx.select().from(energyDayAdoption).where(and(eq(energyDayAdoption.userId, userId), eq(energyDayAdoption.date, date)));
    await tx.insert(energyDayAdoption).values({ userId, date, mode: "manual", protectedAt: new Date() }).onConflictDoUpdate({ target: [energyDayAdoption.userId, energyDayAdoption.date], set: { mode: "manual", protectedAt: new Date(), version: sql`${energyDayAdoption.version}+1`, updatedAt: new Date() } });
    await tx.insert(dataSourceEvent).values({ id: randomUUID(), userId, connectionId: connection.id, action: "manual_protection", actor: userId, snapshot: { date, beforeMode: before?.mode ?? null } });
  }
}
