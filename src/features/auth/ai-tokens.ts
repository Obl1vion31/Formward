import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db/client";
import { aiToken } from "../../db/schema";
import { lockMeasurementOwner, type MeasurementTransaction } from "../measurements/records";
import { ApiError, type AiIdentity, type ManualAiIdentity } from "./ai-identity";
import { requireOauthConnection } from "./oauth-connections";
import { requireActiveAccount, requireRecentSecurity, webSessionContext } from "./account-security";
export const tokenDomains = ["measurements", "meals", "energy", "training"] as const;
export type TokenOptions = { domains?: (typeof tokenDomains[number])[]; days?: 1 | 7 | 30 };
export { ApiError, type AiIdentity } from "./ai-identity";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");
function publicToken(row: typeof aiToken.$inferSelect) {
  return { id: row.id, name: row.name, prefix: row.prefix, permission: row.permission, domains: row.domains,
    createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null, revokedAt: row.revokedAt?.toISOString() ?? null };
}
export async function createAiToken(db: Database, userId: string, name: string, permission: "read" | "write"="read", options: TokenOptions = {}) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100 || /[\u0000-\u001f\u007f]/.test(name) || !["read", "write"].includes(permission)) throw new ApiError(400, "invalid_token", "请填写令牌名称并选择权限。");
  const rawToken = `fw_ai_${randomBytes(32).toString("base64url")}`;
  const days = options.days ?? 7;
  if (![1,7,30].includes(days) || options.domains && (!options.domains.length || options.domains.length > 4 || new Set(options.domains).size !== options.domains.length || options.domains.some(domain => !tokenDomains.includes(domain)))) throw new ApiError(400,"invalid_token","请选择有效业务范围和1／7／30天期限。");
  return db.transaction(async tx => {
    await lockMeasurementOwner(tx, userId);
    const proof = webSessionContext.getStore();
    if (proof) await requireRecentSecurity(tx, proof);
    else if (process.env.NODE_ENV === "production") throw new ApiError(401,"invalid_session","请通过有效网页会话创建令牌。");
    const [row] = await tx.insert(aiToken).values({ id: randomUUID(), userId, name: name.trim(), tokenHash: digest(rawToken), prefix: rawToken.slice(0, 14), permission, domains: options.domains ?? [...tokenDomains], expiresAt: new Date(Date.now() + days * 86400000) }).returning();
    return { token: publicToken(row), rawToken };
  });
}
export async function listAiTokens(db: Database, userId: string) {
  return (await db.select().from(aiToken).where(eq(aiToken.userId, userId)).orderBy(desc(aiToken.createdAt))).map(publicToken);
}
export async function revokeAiToken(db: Database, userId: string, id: string) {
  return db.transaction(async tx => {
    await lockMeasurementOwner(tx, userId);
    const [row] = await tx.update(aiToken).set({ revokedAt: new Date() }).where(and(eq(aiToken.userId, userId), eq(aiToken.id, id), isNull(aiToken.revokedAt))).returning();
    if (!row && !(await tx.select({ id: aiToken.id }).from(aiToken).where(and(eq(aiToken.userId, userId), eq(aiToken.id, id)))).length) throw new ApiError(404, "not_found", "令牌不存在。");
  });
}
export async function requireActiveAiToken(tx: MeasurementTransaction, identity: AiIdentity, write = false, domain: "measurements" | "meals" | "energy" | "training" | null = "measurements") {
  await requireActiveAccount(tx, identity.userId);
  if (identity.oauthConnectionId) {
    if (write && identity.permission !== "write") throw new ApiError(403, "read_only", "只读授权不能提交操作。");
    return requireOauthConnection(tx, identity.userId, identity.oauthConnectionId, write, domain ?? "measurements");
  }
  if (!identity.tokenId) throw new ApiError(401, "invalid_token", "令牌无效。");
  const [row] = await tx.select().from(aiToken).where(and(eq(aiToken.id, identity.tokenId), eq(aiToken.userId, identity.userId)));
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) throw new ApiError(401, "invalid_token", "令牌无效、已过期或已撤销。");
  if (domain && row.domains && !row.domains.includes(domain)) throw new ApiError(403,"missing_scope","此令牌没有该业务范围的权限。");
  if (row.prefix === "fw_internal_meal" && domain !== "meals") throw new ApiError(403, "missing_scope", "此站内授权仅用于饮食识图。");
  if (write && row.permission !== "write") throw new ApiError(403, "read_only", "只读令牌不能提交操作。");
  return row;
}
export async function authenticateAi(db: Database, authorization: string | null, write = false): Promise<ManualAiIdentity> {
  const match = /^Bearer (fw_ai_[A-Za-z0-9_-]{43})$/.exec(authorization ?? "");
  if (!match) throw new ApiError(401, "invalid_token", "请提供有效的 Bearer 令牌。");
  return db.transaction(async tx => {
    const [row] = await tx.select().from(aiToken).where(eq(aiToken.tokenHash, digest(match[1])));
    if (!row) throw new ApiError(401, "invalid_token", "令牌无效、已过期或已撤销。");
    await lockMeasurementOwner(tx, row.userId);
    const identity = { userId: row.userId, tokenId: row.id, permission: row.permission };
    await requireActiveAiToken(tx, identity, write, null);
    await tx.update(aiToken).set({ lastUsedAt: new Date() }).where(eq(aiToken.id, row.id));
    return identity;
  });
}
