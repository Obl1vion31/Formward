import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { consumeSecurityRate } from "./security-usage";
import type { Database } from "../../db/client";
import { accountLink, aiToken, oauthAccessToken, oauthConnection, oauthConsent, oauthRefreshToken, session, user, dataConnection } from "../../db/schema";
import { ApiError } from "./ai-identity";

export type SecurityTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type SessionProof = { userId: string; sessionId: string; accessVersion: number };
export const webSessionContext = new AsyncLocalStorage<SessionProof>();
export const ADMIN_VERIFICATION_MS = 5 * 60_000;
/** 仅服务器运维配置可临时暂停管理员动态码；默认仍强制。 */
export const ownerMfaPaused = () => process.env.FORMWARD_OWNER_MFA_REQUIRED === "0";
export const ownerMfaRequired = () => !ownerMfaPaused() && (process.env.NODE_ENV !== "test" || process.env.FORMWARD_TEST_OWNER_MFA === "1");
export const hashAccountToken = (value: string) => createHash("sha256").update(value).digest("hex");

export async function requireActiveAccount(db: Pick<Database, "select">, userId: string) {
  const [row] = await db.select().from(user).where(eq(user.id, userId));
  if (!row || row.banned) throw new ApiError(401, "invalid_token", "账号访问已失效，请重新登录或联系邀请人。");
  return row;
}

export async function requireSessionProof(db: Pick<Database, "select">, proof: SessionProof, admin = false, options: { allowMfaSetup?: boolean } = {}) {
  const owner = await requireActiveAccount(db, proof.userId);
  const [row] = await db.select().from(session).where(and(eq(session.id, proof.sessionId), eq(session.userId, proof.userId), gt(session.expiresAt, new Date())));
  if (!row || row.accessVersion !== owner.accessVersion || proof.accessVersion !== owner.accessVersion) throw new ApiError(401, "invalid_session", "登录已失效，请重新登录。");
  if (!options.allowMfaSetup) {
    if (owner.role === "owner" && ownerMfaRequired() && !owner.twoFactorEnabled) throw new ApiError(403, "mfa_setup_required", "请先为管理员账号绑定验证器。");
    if (owner.twoFactorEnabled && !row.mfaVerifiedAt) throw new ApiError(403, "mfa_required", "请完成动态码验证后继续。");
    if (row.mfaRecoveryRequired) throw new ApiError(403, "mfa_rebind_required", "已使用恢复码，请重新绑定验证器。");
  }
  if (admin && owner.role !== "owner") throw new ApiError(403, "forbidden", "此账号没有管理权限。");
  if (admin && (!row.adminVerifiedAt || row.adminVerifiedAt.getTime() > Date.now() || Date.now() - row.adminVerifiedAt.getTime() >= ADMIN_VERIFICATION_MS)) throw new ApiError(403, "verification_required", "请再次输入密码以继续管理。");
  return { user: owner, session: row };
}

export async function requireRecentSecurity(db: Pick<Database, "select">, proof: SessionProof) {
  const identity = await requireSessionProof(db, proof), time = identity.session.securityVerifiedAt;
  if (!time || time.getTime() > Date.now() || Date.now() - time.getTime() >= ADMIN_VERIFICATION_MS) throw new ApiError(403, "verification_required", "请再次验证身份后继续。当前输入保留。");
  return identity;
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
  await consumeSecurityRate(db, `account-${category}`, subject, 5);
}

/** 调用方先锁 users 行；版本使延迟签发的旧会话也无法通过验证。审计由调用方同事务写入。 */
export async function revokeAccountAccess(tx: SecurityTransaction, userId: string) {
  const now = new Date();
  await tx.update(user).set({ accessVersion: sql`${user.accessVersion} + 1`, updatedAt: now }).where(eq(user.id, userId));
  await tx.update(dataConnection).set({status:"paused",syncToken:null,syncStartedAt:null,version:sql`${dataConnection.version}+1`,updatedAt:now}).where(eq(dataConnection.userId,userId));
  await tx.update(aiToken).set({ revokedAt: now }).where(and(eq(aiToken.userId, userId), isNull(aiToken.revokedAt)));
  await tx.update(oauthConnection).set({ revokedAt: now }).where(and(eq(oauthConnection.userId, userId), isNull(oauthConnection.revokedAt)));
  await tx.update(oauthRefreshToken).set({ revoked: now }).where(and(eq(oauthRefreshToken.userId, userId), isNull(oauthRefreshToken.revoked)));
  await tx.delete(oauthAccessToken).where(eq(oauthAccessToken.userId, userId));
  await tx.delete(oauthConsent).where(eq(oauthConsent.userId, userId));
  await tx.delete(session).where(eq(session.userId, userId));
  await tx.update(accountLink).set({ revokedAt: now }).where(and(eq(accountLink.userId, userId), isNull(accountLink.consumedAt), isNull(accountLink.revokedAt)));
}
