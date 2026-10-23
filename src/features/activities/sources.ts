import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db/client";
import { energySource } from "../../db/schema";
import { lockOwner, type Transaction } from "../auth/owner-lock";
import { energyModes, type EnergyPreview } from "./model";

function sourceLabel(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("来源须为 1–200 个字符。");
  return value.trim();
}
export async function listEnergySources(db: Pick<Database, "select">, userId: string) {
  if (!userId?.trim()) throw new Error("缺少经过验证的账号。");
  const rows = await db.select({ label: energySource.label }).from(energySource).where(and(eq(energySource.userId, userId), isNull(energySource.deletedAt))).orderBy(desc(energySource.lastUsedAt), energySource.label);
  return rows.map(row => row.label);
}
/** 只记成功保存所采用的来源；保留旧快照不会恢复已移除的建议。 */
export async function rememberEnergySources(tx: Transaction, userId: string, entry: EnergyPreview) {
  const { action, before, after } = entry;
  if (!after || after.deletedAt || action.kind !== "save_energy_day" && action.kind !== "save_activity") return;
  const modes = energyModes("totalKcal" in after ? after : null);
  const fields: ("sourceSystem" | "restingSourceSystem" | "activeSourceSystem")[] = action.kind === "save_activity" || modes.entryMode === "total" ? ["sourceSystem"] : modes.activityMode === "total" ? ["restingSourceSystem", "activeSourceSystem"] : ["restingSourceSystem"];
  for (const field of fields) {
    const saved = after as unknown as Record<string, unknown>;
    const value = field === "sourceSystem" ? saved[field] : saved[field] ?? saved.sourceSystem;
    if (typeof value !== "string" || !value.trim()) continue;
    const previous = before as unknown as Record<string, unknown> | undefined;
    const label = sourceLabel(value), prior = field === "sourceSystem" ? previous?.[field] : previous?.[field] ?? previous?.sourceSystem;
    const restore = !before || Object.hasOwn(action, field) && value !== prior;
    await tx.insert(energySource).values({ userId, label }).onConflictDoUpdate({ target: [energySource.userId, energySource.label], set: { lastUsedAt: new Date(), ...(restore ? { deletedAt: null, deletedBy: null } : {}) } });
  }
}
export async function removeEnergySource(db: Database, actor: { userId: string; actorId: string }, value: string) {
  if (!actor.userId?.trim() || actor.actorId !== actor.userId) throw new Error("操作者与账号不一致。");
  const label = sourceLabel(value);
  return db.transaction(async tx => {
    await lockOwner(tx, actor.userId);
    await tx.update(energySource).set({ deletedAt: new Date(), deletedBy: actor.actorId }).where(and(eq(energySource.userId, actor.userId), eq(energySource.label, label), isNull(energySource.deletedAt)));
    return listEnergySources(tx, actor.userId);
  });
}
