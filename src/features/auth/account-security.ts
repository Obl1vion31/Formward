import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { accountLink, aiToken, oauthAccessToken, oauthConnection, oauthConsent, oauthRefreshToken, rateLimit, session, user } from "../../db/schema";
import { ApiError } from "./ai-identity";

export type SecurityTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type SessionProof = { userId: string; sessionId: string; accessVersion: number };
export const webSessionContext = new AsyncLocalStorage<SessionProof>();
export const ADMIN_VERIFICATION_MS = 10 * 60_000;
export const hashAccountToken = (value: string) => createHash("sha256").update(value).digest("hex");

export async function requireActiveAccount(db: Pick<Database, "select">, userId: string) {
  const [row] = await db.select().from(user).where(eq(user.id, userId));
  if (!row || row.banned) throw new ApiError(401, "invalid_token", "账号访问已失效，请重新登录或联系邀请人。");
  return row;
}

export async function requireSessionProof(db: Pick<Database, "select">, proof: SessionProof, admin = false) {
  const owner = await requireActiveAccount(db, proof.userId);
  const [row] = await db.select().from(session).where(and(eq(session.id, proof.sessionId), eq(session.userId, proof.userId), gt(session.expiresAt, new Date())));
  if (!row || row.accessVersion !== owner.accessVersion || proof.accessVersion !== owner.accessVersion) throw new ApiError(401, "invalid_session", "登录已失效，请重新登录。");
  if (admin && owner.role !== "owner") throw new ApiError(403, "forbidden", "此账号没有管理权限。");
  if (admin && (!row.adminVerifiedAt || row.adminVerifiedAt.getTime() > Date.now() || Date.now() - row.adminVerifiedAt.getTime() >= ADMIN_VERIFICATION_MS)) throw new ApiError(403, "verification_required", "请再次输入密码以继续管理。");
  return { user: owner, session: row };
}

/** 所有网页写入在既有账号行锁内再次验证本次请求的会话，避免撤销后的在途请求继续保存。 */
export async function lockActiveAccount(tx: SecurityTransaction, userId: string) {
  const [row] = await tx.select().from(user).where(eq(user.id, userId)).for("update");
  if (!row || row.banned) throw new ApiError(401, "invalid_token", "账号访问已失效，请重新登录或联系邀请人。");
  const proof = webSessionContext.getStore();
  if (proof) {
    if (proof.userId !== userId) throw new ApiError(403, "forbidden", "不能操作其他账号。");
    await requireSessionProof(tx, proof);
  }
  return row;
}

// 摘要化限流键，不把邮箱、令牌和来源地址写进 key。计数由数据库原子维护，多实例共享。
export async function limitAccountAttempt(db: Database, category: string, subject: string) {
  const key = `account:${category}:${hashAccountToken(subject)}`, now = Date.now();
  const [row] = await db.insert(rateLimit).values({ id: randomUUID(), key, count: 1, lastRequest: now }).onConflictDoUpdate({
    target: rateLimit.key,
    set: {
      count: sql`CASE WHEN ${rateLimit.lastRequest} <= ${now - 60_000} THEN 1 ELSE LEAST(${rateLimit.count} + 1, 6) END`,
      lastRequest: sql`CASE WHEN ${rateLimit.lastRequest} <= ${now - 60_000} THEN ${now} ELSE ${rateLimit.lastRequest} END`,
    },
  }).returning();
  if (row.count > 5) throw new ApiError(429, "rate_limited", "尝试次数较多，请一分钟后重试。");
}

/** 调用方先锁 users 行；版本使延迟签发的旧会话也无法通过验证。审计由调用方同事务写入。 */
export async function revokeAccountAccess(tx: SecurityTransaction, userId: string) {
  const now = new Date();
  await tx.update(user).set({ accessVersion: sql`${user.accessVersion} + 1`, updatedAt: now }).where(eq(user.id, userId));
  await tx.update(aiToken).set({ revokedAt: now }).where(and(eq(aiToken.userId, userId), isNull(aiToken.revokedAt)));
  await tx.update(oauthConnection).set({ revokedAt: now }).where(and(eq(oauthConnection.userId, userId), isNull(oauthConnection.revokedAt)));
  await tx.update(oauthRefreshToken).set({ revoked: now }).where(and(eq(oauthRefreshToken.userId, userId), isNull(oauthRefreshToken.revoked)));
  await tx.delete(oauthAccessToken).where(eq(oauthAccessToken.userId, userId));
  await tx.delete(oauthConsent).where(eq(oauthConsent.userId, userId));
  await tx.delete(session).where(eq(session.userId, userId));
  await tx.update(accountLink).set({ revokedAt: now }).where(and(eq(accountLink.userId, userId), isNull(accountLink.consumedAt), isNull(accountLink.revokedAt)));
}
