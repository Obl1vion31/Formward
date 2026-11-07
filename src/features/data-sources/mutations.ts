import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import { dataConnection, dataSourceEvent, dataSourcePolicy } from "../../db/schema";
import { ApiError } from "../auth/ai-identity";
import { lockOwner, type Transaction } from "../auth/owner-lock";
import { requireActiveAccount } from "../auth/account-security";
import { sevenDays } from "../garmin/client";
import { encryptCredential } from "./credentials";
import { connectionInputSchema, emptySources, policyInputSchema, sourceMetrics, sourcePilotEnabled } from "./model";

export function requireSourcePilot(userId: string) {
  if (!sourcePilotEnabled(userId)) throw new ApiError(403, "source_unavailable", "设备与数据来源暂未向此账号开放。");
}
export async function sourceEvent(tx: Transaction, userId: string, connectionId: string | null, action: string, actor: string, snapshot: Record<string, unknown>) {
  await tx.insert(dataSourceEvent).values({ id: randomUUID(), userId, connectionId, action, actor, snapshot });
}
const bindSchema = z.object({ apiKey: z.string().trim().min(10).max(4096).regex(/^[\x21-\x7e]+$/), timezone: z.literal("Asia/Shanghai").default("Asia/Shanghai"), version: z.number().int().nonnegative() }).strict();
export async function bindPersonalSource(db: Database, userId: string, raw: unknown) {
  requireSourcePilot(userId);
  const input = bindSchema.safeParse(raw); if (!input.success) throw new ApiError(400, "invalid_input", "请检查 Personal API 密钥和连接版本。");
  await db.transaction(async tx => {
    await lockOwner(tx, userId); requireSourcePilot(userId);
    const owner = await requireActiveAccount(tx, userId);
    const [existing] = await tx.select().from(dataConnection).where(and(eq(dataConnection.userId, userId), eq(dataConnection.provider, "garmin-personal")));
    if ((existing?.version ?? 0) !== input.data.version) throw new ApiError(409, "version_conflict", "连接已经改变，请重新读取后重试。");
    const id = existing?.id ?? randomUUID(), credential = encryptCredential(input.data.apiKey, userId, id), now = new Date();
    if (existing) await tx.update(dataConnection).set({ credential, accessVersion: owner.accessVersion, adoptedAt: null, lastSuccessAt:null, lastAttemptAt:null, status: "active", syncToken: null, syncStartedAt: null, lastError: null, version: existing.version + 1, updatedAt: now }).where(and(eq(dataConnection.userId, userId), eq(dataConnection.id, id)));
    else {
      await tx.insert(dataConnection).values({ id, userId, provider: "garmin-personal", label: "Garmin Personal", credential, metrics: [...sourceMetrics], timezone: input.data.timezone, accessVersion: owner.accessVersion });
      await tx.insert(dataSourcePolicy).values({ userId, strategy: "total", sources: Object.fromEntries(sourceMetrics.map(m => [m, id])) as ReturnType<typeof emptySources>, effectiveFrom: sevenDays(now, input.data.timezone).to }).onConflictDoNothing();
    }
    await sourceEvent(tx, userId, id, existing ? "rebind" : "bind", userId, { provider: "garmin-personal", version: (existing?.version ?? 0) + 1 });
  });
}

export async function configureConnection(db: Database, userId: string, id: string, raw: unknown) {
  requireSourcePilot(userId); const input = connectionInputSchema.safeParse(raw);
  if (!input.success) throw new ApiError(400, "invalid_input", "同步内容或连接版本无效。");
  await db.transaction(async tx => {
    await lockOwner(tx, userId); requireSourcePilot(userId);
    const [connection] = await tx.select().from(dataConnection).where(and(eq(dataConnection.userId, userId), eq(dataConnection.id, id)));
    if (!connection) throw new ApiError(404, "not_found", "连接不存在。");
    if (connection.version !== input.data.version) throw new ApiError(409, "version_conflict", "连接已在其他设备改变，请重新读取。");
    const owner = await requireActiveAccount(tx, userId);
    if (connection.accessVersion !== owner.accessVersion && input.data.active) throw new ApiError(409, "rebind_required", "访问已撤销，请重新绑定密钥。");
    await tx.update(dataConnection).set({ metrics: input.data.metrics, lastAttemptAt:null, status: input.data.active ? "active" : "paused", syncToken: null, syncStartedAt: null, version: connection.version + 1, updatedAt: new Date() }).where(and(eq(dataConnection.userId, userId), eq(dataConnection.id, id)));
    const [policy] = await tx.select().from(dataSourcePolicy).where(eq(dataSourcePolicy.userId, userId));
    if (policy) {
      const sources = Object.fromEntries(sourceMetrics.map(metric => [metric, input.data.metrics.includes(metric) ? id : null])) as ReturnType<typeof emptySources>;
      const strategy = input.data.metrics.includes("total") ? "total" : "components";
      if (strategy !== policy.strategy || JSON.stringify(sources) !== JSON.stringify(policy.sources)) await tx.update(dataSourcePolicy).set({ strategy, sources, version: policy.version + 1, effectiveFrom: sevenDays(new Date(), connection.timezone).to, updatedAt: new Date() }).where(eq(dataSourcePolicy.userId, userId));
    }
    await sourceEvent(tx, userId, id, "configure", userId, { metrics: input.data.metrics, active: input.data.active });
  });
}

export async function configurePolicy(db: Database, userId: string, raw: unknown) {
  requireSourcePilot(userId); const input = policyInputSchema.safeParse(raw);
  if (!input.success) throw new ApiError(400, "invalid_input", "采用来源或规则版本无效。");
  await db.transaction(async tx => {
    await lockOwner(tx, userId); requireSourcePilot(userId);
    const connections = await tx.select().from(dataConnection).where(eq(dataConnection.userId, userId));
    const [policy] = await tx.select().from(dataSourcePolicy).where(eq(dataSourcePolicy.userId, userId));
    if ((policy?.version ?? 0) !== input.data.version) throw new ApiError(409, "version_conflict", "采用规则已改变，请重新读取后核对。");
    for (const metric of sourceMetrics) if (input.data.sources[metric]) {
      const connection = connections.find(c => c.id === input.data.sources[metric]);
      if (!connection || connection.status !== "active" || !connection.metrics.includes(metric)) throw new ApiError(400, "source_scope", "采用来源必须是本账号已开启对应同步内容的连接。");
    }
    const sources = input.data.sources, zones = new Set(connections.filter(c => c.id === sources.resting || c.id === sources.active).map(c => c.timezone));
    if (input.data.strategy === "components" && zones.size > 1) throw new ApiError(400, "source_timezone", "静息与活动须采用相同日期边界。");
    const values = { strategy: input.data.strategy, sources, effectiveFrom: sevenDays(new Date(), connections[0]?.timezone).to, version: (policy?.version ?? 0) + 1, updatedAt: new Date() };
    await tx.insert(dataSourcePolicy).values({ userId, ...values }).onConflictDoUpdate({ target: dataSourcePolicy.userId, set: values });
    await sourceEvent(tx, userId, null, "policy", userId, { before: policy ? { strategy: policy.strategy, sources: policy.sources } : null, after: values });
  });
}

