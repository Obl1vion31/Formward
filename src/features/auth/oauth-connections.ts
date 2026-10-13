import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import type { Database } from "../../db/client";
import { oauthClient, oauthConnection, oauthConsent, oauthRefreshToken, oauthAccessToken } from "../../db/schema";
import { lockMeasurementOwner } from "../measurements/records";
import { ApiError } from "./ai-identity";

export const READ_SCOPE = "measurements:read";
export const WRITE_SCOPE = "measurements:write";
export const MEALS_READ_SCOPE = "meals:read";
export const MEALS_WRITE_SCOPE = "meals:write";
export const CONNECTION_CLAIM = "https://formward.app/oauth_connection";
export const OAUTH_SCOPES = ["openid", "profile", "email", "offline_access", READ_SCOPE, WRITE_SCOPE, MEALS_READ_SCOPE, MEALS_WRITE_SCOPE];

// 此函数在经过 OAuth Provider 校验的授权上下文中调用，不接受 AI 提交的账号标识。
export async function oauthConnectionReference(db: Database, userId: string, clientId: string) {
  return db.transaction(async tx => {
    await lockMeasurementOwner(tx, userId);
    const [existing] = await tx.select().from(oauthConnection).where(and(eq(oauthConnection.userId, userId), eq(oauthConnection.clientId, clientId), isNull(oauthConnection.revokedAt), gt(oauthConnection.expiresAt, new Date()))).orderBy(desc(oauthConnection.createdAt)).limit(1);
    if (existing) return existing.id;
    const id = randomUUID();
    await tx.insert(oauthConnection).values({ id, userId, clientId, expiresAt: new Date(Date.now() + 30 * 86400000) });
    return id;
  });
}

export async function requireOauthConnection(tx: Pick<Database, "select">, userId: string, id: string, write: boolean | null = false, domain: "measurements" | "meals" = "measurements") {
  const [row] = await tx.select().from(oauthConnection).where(and(eq(oauthConnection.id, id), eq(oauthConnection.userId, userId)));
  if (!row || !row.authorizedAt || row.revokedAt || row.expiresAt.getTime() <= Date.now()) throw new ApiError(401, "invalid_token", "账号连接无效、已过期或已撤销，请重新授权。");
  const [client] = await tx.select().from(oauthClient).where(eq(oauthClient.clientId, row.clientId));
  if (!client || client.disabled) throw new ApiError(401, "invalid_token", "客户端连接已停用。");
  const [consent] = await tx.select().from(oauthConsent).where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, row.clientId), eq(oauthConsent.referenceId, row.id)));
  if (!consent) throw new ApiError(401, "invalid_token", "账号授权已撤销，请重新连接。");
  const scopes = row.scopes.filter(scope => consent.scopes.includes(scope));
  if (write !== null && !scopes.includes(domain === "meals" ? (write ? MEALS_WRITE_SCOPE : MEALS_READ_SCOPE) : (write ? WRITE_SCOPE : READ_SCOPE))) throw new ApiError(403, "read_only", "当前授权不包含这项操作，请重新授权。");
  return { ...row, scopes };
}

export async function oauthAccessClaims(db: Database, userId: string, clientId: string, referenceId: string | undefined, scopes: string[]) {
  if (!referenceId) throw new ApiError(401, "invalid_token", "缺少账号授权连接。");
  return db.transaction(async tx => {
    await lockMeasurementOwner(tx, userId);
    const [row] = await tx.select().from(oauthConnection).where(and(eq(oauthConnection.id, referenceId), eq(oauthConnection.userId, userId), eq(oauthConnection.clientId, clientId)));
    const [consent] = await tx.select().from(oauthConsent).where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId), eq(oauthConsent.referenceId, referenceId)));
    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now() || !consent || scopes.some(scope => !consent.scopes.includes(scope))) throw new ApiError(401, "invalid_token", "授权已撤销或权限已变化，请重新授权。");
    await tx.update(oauthConnection).set({ authorizedAt: row.authorizedAt ?? new Date(), scopes: consent.scopes }).where(eq(oauthConnection.id, row.id));
    return { [CONNECTION_CLAIM]: row.id };
  });
}

export async function listOauthConnections(db: Database, userId: string) {
  const connections = await db.select({ id: oauthConnection.id, name: oauthClient.name, clientId: oauthConnection.clientId, scopes: oauthConnection.scopes, authorizedAt: oauthConnection.authorizedAt, expiresAt: oauthConnection.expiresAt, revokedAt: oauthConnection.revokedAt, lastUsedAt: oauthConnection.lastUsedAt }).from(oauthConnection).innerJoin(oauthClient, eq(oauthClient.clientId, oauthConnection.clientId)).where(and(eq(oauthConnection.userId, userId), isNotNull(oauthConnection.authorizedAt))).orderBy(desc(oauthConnection.createdAt));
  return connections.map(row => ({ ...row, expired: row.expiresAt.getTime() <= Date.now() }));
}

export async function revokeOauthConnection(db: Database, userId: string, id: string) {
  return db.transaction(async tx => {
    await lockMeasurementOwner(tx, userId);
    const [row] = await tx.select().from(oauthConnection).where(and(eq(oauthConnection.userId, userId), eq(oauthConnection.id, id)));
    if (!row) throw new ApiError(404, "not_found", "账号连接不存在。");
    if (row.revokedAt) return;
    await tx.update(oauthConnection).set({ revokedAt: new Date() }).where(eq(oauthConnection.id, row.id));
    // 保留连接和审计，删除同一 grant 的刷新凭据与同意记录，阻止客户端继续续期。
    const filter = and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, row.clientId), eq(oauthRefreshToken.referenceId, row.id));
    await tx.update(oauthRefreshToken).set({ revoked: new Date() }).where(filter);
    await tx.delete(oauthAccessToken).where(and(eq(oauthAccessToken.userId, userId), eq(oauthAccessToken.referenceId, row.id)));
    await tx.delete(oauthConsent).where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.referenceId, row.id)));
  });
}
