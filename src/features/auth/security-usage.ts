import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { apiDailyUsage, rateLimit, securityEvent, imageQuotaLease, mealImage, mfaLoginChallenge } from "../../db/schema";
import { ApiError } from "./ai-identity";

export const businessChannel = new AsyncLocalStorage<"http" | "mcp" | "doubao" | "internal">();
export const securityDay = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
export const sourceDigest = (value: string) => process.env.BETTER_AUTH_SECRET ? createHmac("sha256",process.env.BETTER_AUTH_SECRET).update(value).digest("hex") : createHash("sha256").update(value).digest("hex");
export async function recordSecurityEvent(db: Database, category: string, userId?: string, details: Record<string, string | number | boolean | null> = {}, source?: string) {
  await db.insert(securityEvent).values({ id: randomUUID(), category, userId, sourceHash: source ? sourceDigest(source) : null, details });
}

/** 失败计数必须在业务事务之外提交，不能因后续校验失败而回滚。 */
export async function consumeSecurityRate(db: Database, category: string, subject: string, maximum: number, now = Date.now()) {
  const key = `security:${category}:${sourceDigest(subject)}`;
  const [row] = await db.insert(rateLimit).values({ id: randomUUID(), key, count: 1, lastRequest: now }).onConflictDoUpdate({ target: rateLimit.key, set: {
    count: sql`CASE WHEN ${rateLimit.lastRequest} <= ${now - 60000} THEN 1 ELSE LEAST(${rateLimit.count} + 1, ${maximum + 1}) END`,
    lastRequest: sql`CASE WHEN ${rateLimit.lastRequest} <= ${now - 60000} THEN ${now} ELSE ${rateLimit.lastRequest} END`,
  } }).returning();
  if (row.count > maximum) {
    if (row.count === maximum + 1) {
      // 固定窗口内告警去重；不记录凭据或请求正文。
      const eventId = sourceDigest(`${key}:${row.lastRequest}`);
      await db.insert(securityEvent).values({ id: eventId, category: "rate_limited", details: { category }, sourceHash: sourceDigest(subject) }).onConflictDoNothing();
    }
    throw new ApiError(429, "rate_limited", "尝试次数较多，请一分钟后重试。当前输入保留。", { retryAfter: Math.max(1, Math.ceil((row.lastRequest + 60000 - now) / 1000)) });
  }
}

export async function businessRequest<T>(db: Database, input: { userId: string; tokenId?: string; channel: "http" | "mcp" | "doubao"; operation: string; write: boolean }, work: () => Promise<T>) {
  if (businessChannel.getStore() === "internal") return work();
  const category = input.write ? "write" : "read", maximum = input.write ? 30 : 120;
  let failed = false;
  try {
    await consumeSecurityRate(db, category, input.userId, maximum);
    if (input.tokenId) await consumeSecurityRate(db, `${category}-token`, input.tokenId, maximum);
    return await work();
  } catch (error) { failed = true; throw error; }
  finally {
    const date = securityDay(), id = sourceDigest([input.userId, date, input.channel, input.operation].join(":"));
    await db.insert(apiDailyUsage).values({ id, userId: input.userId, date, channel: input.channel, operation: input.operation.slice(0, 100), requests: 1, failures: failed ? 1 : 0 }).onConflictDoUpdate({ target: apiDailyUsage.id, set: { requests: sql`${apiDailyUsage.requests} + 1`, failures: sql`${apiDailyUsage.failures} + ${failed ? 1 : 0}` } });
  }
}

/** 调用方已持有用户行锁；复用同一上传ID，不重复预占。 */
export async function reserveImageQuota(db: Database, userId: string, id: string, bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 20971520) throw new ApiError(413, "image_size", "照片最大20 MiB。");
  const now = new Date(), date = securityDay(now);
  const [previous] = await db.select().from(imageQuotaLease).where(eq(imageQuotaLease.id, id));
  if (previous && previous.userId !== userId) throw new ApiError(403, "forbidden", "上传凭据归属无效。");
  if (previous && (previous.state === "complete" || previous.state === "reserved" && previous.expiresAt > now && previous.date===date)) return;
  await db.update(imageQuotaLease).set({ state: "released" }).where(and(eq(imageQuotaLease.userId, userId), eq(imageQuotaLease.state, "reserved"), lt(imageQuotaLease.expiresAt, now)));
  const [active] = await db.select({ count: sql<number>`count(*)::int` }).from(imageQuotaLease).where(and(eq(imageQuotaLease.userId, userId),sql`${imageQuotaLease.id}<>${id}`, eq(imageQuotaLease.state, "reserved"), gt(imageQuotaLease.expiresAt, now)));
  if (active.count >= 4) throw new ApiError(429, "image_concurrency", "同时最多处理4张照片，请等待当前上传完成。", { retryAfter: 10 });
  // 已签发凭据可能已经上传；过期只释放并发槽，未确认容量继续计入当天，不能靠不登记绕过日限额。
  const [usage] = await db.select({ bytes: sql<string>`coalesce(sum(${imageQuotaLease.bytes}),0)::text` }).from(imageQuotaLease).where(and(eq(imageQuotaLease.userId, userId), eq(imageQuotaLease.date, date)));
  const [legacy] = await db.select({ bytes: sql<string>`coalesce(sum(${mealImage.byteSize}),0)::text` }).from(mealImage).where(and(eq(mealImage.userId, userId), sql`(${mealImage.createdAt} AT TIME ZONE 'Asia/Shanghai')::date = ${date}::date`, sql`NOT EXISTS (SELECT 1 FROM image_quota_leases q WHERE q.id = ${mealImage.id})`));
  if (Number(usage.bytes) + Number(legacy.bytes) + bytes > 200 * 1024 * 1024) throw new ApiError(429, "image_daily_quota", "今日新增照片和未确认上传已占满200 MiB额度，明日重置；文字仍可保存。");
  await db.insert(imageQuotaLease).values({ id, userId, date, bytes, expiresAt: new Date(now.getTime() + 960000) }).onConflictDoUpdate({ target: imageQuotaLease.id, set: { date, bytes, state: "reserved", expiresAt: new Date(now.getTime() + 960000) } });
}
export async function completeImageQuota(db: Database, userId: string, id: string, bytes: number) {
  await db.update(imageQuotaLease).set({ state: "complete", bytes }).where(and(eq(imageQuotaLease.id, id), eq(imageQuotaLease.userId, userId)));
}
export async function releaseImageQuota(db: Database, userId: string, id: string, provenNoUpload=false) {
  if(provenNoUpload){await db.delete(imageQuotaLease).where(and(eq(imageQuotaLease.id,id),eq(imageQuotaLease.userId,userId),eq(imageQuotaLease.state,"reserved")));return;}
  await db.update(imageQuotaLease).set({ state: "released" }).where(and(eq(imageQuotaLease.id,id),eq(imageQuotaLease.userId,userId),eq(imageQuotaLease.state,"reserved")));
}
export async function maintainSecurity(db: Database) {
  const cutoff = new Date(Date.now() - 30 * 86400000);
  await db.delete(securityEvent).where(lt(securityEvent.createdAt, cutoff));
  await db.delete(rateLimit).where(lt(rateLimit.lastRequest, Date.now() - 2 * 86400000));
  await db.delete(mfaLoginChallenge).where(lt(mfaLoginChallenge.expiresAt, new Date()));
  await db.delete(imageQuotaLease).where(lt(imageQuotaLease.createdAt, cutoff));
}
