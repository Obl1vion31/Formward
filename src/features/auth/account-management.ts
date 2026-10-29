import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, count, desc, eq, gt, ilike, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../../db/client";
import { account, accountEvent, accountLink, session, user } from "../../db/schema";
import { ApiError } from "./ai-identity";
import { ADMIN_VERIFICATION_MS, hashAccountToken, limitAccountAttempt, requireActiveAccount, requireSessionProof, revokeAccountAccess, type SecurityTransaction, type SessionProof } from "./account-security";

export type AdminFilter = { tab?: "accounts" | "invitations" | "events"; search?: string; status?: "all" | "active" | "banned"; page?: number };
export type AccountCommand = "suspend" | "restore" | "revoke_access" | "reset_password";
export type AccountResult<T> = { ok: true; data: T } | { ok: false; code: string; error: string };
export function accountFailure(error: unknown): { ok: false; code: string; error: string } {
  return error instanceof ApiError ? { ok: false, code: error.code, error: error.message } : { ok: false, code: "unavailable", error: "操作未完成，请稍后重试。" };
}
export async function recordAdminRejection(db: Database, proof: SessionProof, action: string, target: { userId?: string; email?: string }, error: unknown) {
  // 仅已解锁的 owner 能产生涉及目标账号的管理记录；不记录密码、链接或原始数据库错误。
  try {
    await requireSessionProof(db, proof, true);
    const [row] = target.userId ? await db.select({ id: user.id, email: user.email }).from(user).where(eq(user.id, target.userId)) : [];
    const email = row?.email ?? (target.email ? normalizeAccountEmail(target.email) : "目标不存在");
    await db.insert(accountEvent).values({ id: randomUUID(), actorId: proof.userId, userId: row?.id ?? null, email, action, outcome: "rejected", reason: error instanceof ApiError ? error.message : "操作未完成，请稍后重试。", requestId: `rejected:${randomUUID()}` });
  } catch { /* 原事务已回滚；记录不可用时仍返回原失败，不把失败变成成功。 */ }
}
const invalid = (message: string) => new ApiError(400, "invalid_input", message);
export function normalizeAccountEmail(value: string) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || /[\u0000-\u001f\u007f]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid("请输入有效的登录邮箱。");
  return email;
}
export function validateNewPassword(password: string) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw invalid("新密码长度须为 12–128 个字符。");
}
function requestKey(value: string) {
  if (typeof value !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)) throw invalid("请求标识无效，请刷新后重试。");
  return value;
}
function tokenDigest(raw: string) {
  if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(raw)) throw invalid("链接无效，请联系邀请人重新生成。");
  return hashAccountToken(raw);
}
async function lockUser(tx: SecurityTransaction, id: string) {
  const [row] = await tx.select().from(user).where(eq(user.id, id)).for("update");
  if (!row) throw new ApiError(404, "not_found", "账号不存在。");
  return row;
}
async function adminWork<T>(db: Database, proof: SessionProof, work: (tx: SecurityTransaction) => Promise<T>) {
  return db.transaction(async tx => {
    await lockUser(tx, proof.userId);
    await requireSessionProof(tx, proof, true);
    return work(tx);
  });
}
async function event(tx: SecurityTransaction, data: { actorId: string | null; userId?: string | null; email: string; action: string; reason?: string | null; requestId: string }) {
  await tx.insert(accountEvent).values({ id: randomUUID(), ...data });
}
async function repeatedEvent(tx: SecurityTransaction, proof: SessionProof, requestId: string, action: string, email: string) {
  const [previous] = await tx.select().from(accountEvent).where(eq(accountEvent.requestId, `${proof.userId}:${requestKey(requestId)}`));
  if (previous && (previous.action !== action || previous.email !== email)) throw invalid("此请求标识已用于另一项操作，请重新操作。");
  return previous;
}

export async function unlockAccountAdmin(db: Database, proof: SessionProof, password: string, source: string) {
  await limitAccountAttempt(db, "unlock-account", proof.userId);
  await limitAccountAttempt(db, "unlock-source", source);
  if (typeof password !== "string" || password.length > 128) throw invalid("密码不正确，请重试。");
  const identity = await requireSessionProof(db, proof);
  if (identity.user.role !== "owner") throw new ApiError(403, "forbidden", "此账号没有管理权限。");
  const [credential] = await db.select().from(account).where(and(eq(account.userId, proof.userId), eq(account.providerId, "credential")));
  if (!credential?.password || !await verifyPassword({ password, hash: credential.password })) throw invalid("密码不正确，请重试。");
  return db.transaction(async tx => {
    await lockUser(tx, proof.userId);
    const current = await requireSessionProof(tx, proof);
    const [latest] = await tx.select().from(account).where(eq(account.id, credential.id));
    if (current.user.role !== "owner" || latest?.password !== credential.password) throw new ApiError(401, "invalid_session", "身份已变化，请重新登录。");
    const now = new Date();
    await tx.update(session).set({ adminVerifiedAt: now }).where(eq(session.id, proof.sessionId));
    await event(tx, { actorId: proof.userId, userId: proof.userId, email: current.user.email, action: "admin_unlock", requestId: randomUUID() });
    return { verifiedUntil: new Date(now.getTime() + ADMIN_VERIFICATION_MS).toISOString() };
  });
}

export async function loadAccountAdmin(db: Database, proof: SessionProof, input: AdminFilter = {}) {
  return adminWork(db, proof, async tx => {
    const tab = ["accounts", "invitations", "events"].includes(input.tab ?? "") ? input.tab! : "accounts";
    const search = (input.search ?? "").trim().slice(0, 254), page = Math.max(1, Math.min(100000, Math.floor(Number(input.page) || 1)));
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`, offset = (page - 1) * 50;
    const current = await requireSessionProof(tx, proof, true);
    if (tab === "accounts") {
      const where = and(search ? ilike(user.email, pattern) : undefined, input.status === "banned" ? eq(user.banned, true) : input.status === "active" ? eq(user.banned, false) : undefined);
      const [{ total }] = await tx.select({ total: count() }).from(user).where(where);
      const rows = await tx.select({ id: user.id, email: user.email, role: user.role, banned: user.banned, banReason: user.banReason, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt }).from(user).where(where).orderBy(desc(user.createdAt), user.id).limit(50).offset(offset);
      return { tab, total, page, rows, verifiedUntil: new Date(current.session.adminVerifiedAt!.getTime() + ADMIN_VERIFICATION_MS).toISOString() };
    }
    if (tab === "invitations") {
      const where = and(eq(accountLink.purpose, "invite"), search ? ilike(accountLink.email, pattern) : undefined);
      const [{ total }] = await tx.select({ total: count() }).from(accountLink).where(where);
      const rows = await tx.select({ id: accountLink.id, email: accountLink.email, createdAt: accountLink.createdAt, expiresAt: accountLink.expiresAt, consumedAt: accountLink.consumedAt, revokedAt: accountLink.revokedAt }).from(accountLink).where(where).orderBy(desc(accountLink.createdAt), accountLink.id).limit(50).offset(offset);
      return { tab, total, page, rows, verifiedUntil: new Date(current.session.adminVerifiedAt!.getTime() + ADMIN_VERIFICATION_MS).toISOString() };
    }
    const actor = alias(user, "event_actor"), where = search ? ilike(accountEvent.email, pattern) : undefined;
    const [{ total }] = await tx.select({ total: count() }).from(accountEvent).where(where);
    const rows = await tx.select({ id: accountEvent.id, email: accountEvent.email, action: accountEvent.action, outcome: accountEvent.outcome, reason: accountEvent.reason, createdAt: accountEvent.createdAt, actorEmail: actor.email }).from(accountEvent).leftJoin(actor, eq(actor.id, accountEvent.actorId)).where(where).orderBy(desc(accountEvent.createdAt), accountEvent.id).limit(50).offset(offset);
    return { tab, total, page, rows, verifiedUntil: new Date(current.session.adminVerifiedAt!.getTime() + ADMIN_VERIFICATION_MS).toISOString() };
  });
}
export type AdminData = Awaited<ReturnType<typeof loadAccountAdmin>>;

async function issueLink(tx: SecurityTransaction, proof: SessionProof, purpose: "invite" | "reset_password", email: string, userId: string | null, requestId: string) {
  const [existing] = await tx.select().from(accountLink).where(and(eq(accountLink.createdBy, proof.userId), eq(accountLink.requestId, requestKey(requestId))));
  if (existing) {
    if (existing.purpose !== purpose || existing.email !== email) throw invalid("此请求标识已用于另一项操作。");
    return { rawToken: null, expiresAt: existing.expiresAt.toISOString(), repeated: true };
  }
  const now = new Date(), rawToken = randomBytes(32).toString("base64url"), expiresAt = new Date(now.getTime() + (purpose === "invite" ? 72 * 3600_000 : 15 * 60_000));
  await tx.update(accountLink).set({ revokedAt: now }).where(and(eq(accountLink.email, email), eq(accountLink.purpose, purpose), isNull(accountLink.consumedAt), isNull(accountLink.revokedAt)));
  await tx.insert(accountLink).values({ id: randomUUID(), purpose, email, userId, createdBy: proof.userId, requestId, tokenHash: hashAccountToken(rawToken), expiresAt });
  await event(tx, { actorId: proof.userId, userId, email, action: purpose === "invite" ? "invite_created" : "reset_created", requestId: `${proof.userId}:${requestId}` });
  return { rawToken, expiresAt: expiresAt.toISOString(), repeated: false };
}

export async function createAccountInvitation(db: Database, proof: SessionProof, emailInput: string, requestId: string) {
  const email = normalizeAccountEmail(emailInput);
  return adminWork(db, proof, async tx => {
    if ((await tx.select({ id: user.id }).from(user).where(eq(user.email, email))).length) throw invalid("此账号已存在，请在账号页管理或生成密码重设链接。");
    return issueLink(tx, proof, "invite", email, null, requestId);
  });
}

export async function revokeAccountInvitation(db: Database, proof: SessionProof, id: string, requestId: string) {
  return adminWork(db, proof, async tx => {
    const [link] = await tx.select().from(accountLink).where(and(eq(accountLink.id, id), eq(accountLink.purpose, "invite"))).for("update");
    if (!link) throw new ApiError(404, "not_found", "邀请不存在。");
    if (await repeatedEvent(tx, proof, requestId, "invite_revoked", link.email)) return;
    if (link.consumedAt) throw invalid("邀请已激活，请在账号页管理。");
    await tx.update(accountLink).set({ revokedAt: link.revokedAt ?? new Date() }).where(eq(accountLink.id, id));
    await event(tx, { actorId: proof.userId, userId: link.userId, email: link.email, action: "invite_revoked", requestId: `${proof.userId}:${requestId}` });
  });
}

export async function manageAccount(db: Database, proof: SessionProof, targetId: string, command: AccountCommand, reasonInput: string, requestId: string) {
  if (!["suspend", "restore", "revoke_access", "reset_password"].includes(command)) throw invalid("操作无效。");
  const reason = typeof reasonInput === "string" ? reasonInput.trim() : "";
  if (reason.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(reason)) throw invalid("原因最多 500 个字符。");
  if (command === "suspend" && !reason) throw invalid("请填写停用原因。");
  requestKey(requestId);
  return adminWork(db, proof, async tx => {
    const target = await lockUser(tx, targetId);
    if (target.role !== "user" || targetId === proof.userId) throw new ApiError(403, "forbidden", "此入口只能管理普通用户。");
    if (command === "reset_password") {
      if (target.banned) throw invalid("请先恢复账号，再生成重设链接。");
      return issueLink(tx, proof, "reset_password", target.email, target.id, requestId);
    }
    if (await repeatedEvent(tx, proof, requestId, command, target.email)) return null;
    if (command === "restore") await tx.update(user).set({ banned: false, banReason: null, banExpires: null, updatedAt: new Date() }).where(eq(user.id, target.id));
    else {
      await revokeAccountAccess(tx, target.id);
      if (command === "suspend") await tx.update(user).set({ banned: true, banReason: reason, banExpires: null }).where(eq(user.id, target.id));
    }
    await event(tx, { actorId: proof.userId, userId: target.id, email: target.email, action: command, reason: reason || null, requestId: `${proof.userId}:${requestId}` });
    return null;
  });
}

async function usableLink(db: Pick<Database, "select">, raw: string) {
  const [link] = await db.select().from(accountLink).where(eq(accountLink.tokenHash, tokenDigest(raw)));
  if (!link || link.consumedAt || link.revokedAt || link.expiresAt.getTime() <= Date.now()) throw invalid("链接已失效或已使用，请联系邀请人重新生成。");
  const issuer = await requireActiveAccount(db, link.createdBy);
  if (issuer.role !== "owner") throw invalid("链接已失效，请联系邀请人。");
  if (link.userId) await requireActiveAccount(db, link.userId);
  return link;
}
export async function inspectAccountLink(db: Database, raw: string) {
  const link = await usableLink(db, raw);
  return { email: link.email, purpose: link.purpose, expiresAt: link.expiresAt.toISOString() };
}

export async function claimAccountLink(db: Database, raw: string, password: string, source: string) {
  const tokenHash = tokenDigest(raw);
  await limitAccountAttempt(db, "claim-source", source);
  await limitAccountAttempt(db, "claim-token", tokenHash);
  validateNewPassword(password);
  const first = await usableLink(db, raw), passwordHash = await hashPassword(password);
  return db.transaction(async tx => {
    // 与后台生成／撤销使用相同锁顺序：签发者 → 目标账号 → 链接。
    const issuer = await lockUser(tx, first.createdBy);
    if (issuer.banned || issuer.role !== "owner") throw invalid("链接已失效，请联系邀请人。");
    if (first.userId) await lockUser(tx, first.userId);
    await tx.select({ id: accountLink.id }).from(accountLink).where(eq(accountLink.id, first.id)).for("update");
    const link = await usableLink(tx, raw), now = new Date();
    let userId = link.userId;
    if (link.purpose === "invite") {
      if ((await tx.select({ id: user.id }).from(user).where(eq(user.email, link.email))).length) throw invalid("此账号已存在，邀请不能覆盖已有账号。");
      userId = randomUUID();
      await tx.insert(user).values({ id: userId, email: link.email, name: link.email.split("@")[0], role: "user", emailVerified: false });
      await tx.insert(account).values({ id: randomUUID(), userId, accountId: userId, providerId: "credential", password: passwordHash });
    } else {
      const target = await requireActiveAccount(tx, userId!);
      if (target.role !== "user" || target.email !== link.email) throw invalid("链接目标已变化，请联系邀请人。");
      const changed = await tx.update(account).set({ password: passwordHash, updatedAt: now }).where(and(eq(account.userId, target.id), eq(account.providerId, "credential"), eq(account.accountId, target.id))).returning({ id: account.id });
      if (changed.length !== 1) throw invalid("账号凭据异常，请联系邀请人。");
    }
    await tx.update(accountLink).set({ consumedAt: now, userId }).where(eq(accountLink.id, link.id));
    if (link.purpose === "reset_password") await revokeAccountAccess(tx, userId!);
    await event(tx, { actorId: userId, userId, email: link.email, action: link.purpose === "invite" ? "invite_claimed" : "password_reset", requestId: `claim:${link.id}` });
    return { email: link.email };
  });
}

export async function loadPersonalAccount(db: Database, proof: SessionProof) {
  const current = await requireSessionProof(db, proof);
  const devices = await db.select({ id: session.id, userAgent: session.userAgent, createdAt: session.createdAt, updatedAt: session.updatedAt }).from(session).where(and(eq(session.userId, proof.userId), eq(session.accessVersion, current.user.accessVersion), gt(session.expiresAt, new Date()))).orderBy(desc(session.createdAt));
  return { email: current.user.email, emailVerified: current.user.emailVerified, role: current.user.role, currentSessionId: proof.sessionId, devices };
}
export type PersonalAccountData = Awaited<ReturnType<typeof loadPersonalAccount>>;

export async function changePersonalPassword(db: Database, proof: SessionProof, oldPassword: string, newPassword: string, source: string) {
  validateNewPassword(newPassword);
  await limitAccountAttempt(db, "password-account", proof.userId);
  await limitAccountAttempt(db, "password-source", source);
  await requireSessionProof(db, proof);
  const [credential] = await db.select().from(account).where(and(eq(account.userId, proof.userId), eq(account.providerId, "credential")));
  if (typeof oldPassword !== "string" || oldPassword.length > 128 || !credential?.password || !await verifyPassword({ hash: credential.password, password: oldPassword })) throw invalid("当前密码不正确。");
  const password = await hashPassword(newPassword);
  await db.transaction(async tx => {
    await lockUser(tx, proof.userId);
    const current = await requireSessionProof(tx, proof);
    const [latest] = await tx.select().from(account).where(eq(account.id, credential.id));
    if (latest?.password !== credential.password) throw invalid("账号密码已变化，请重新登录。");
    await tx.update(account).set({ password, updatedAt: new Date() }).where(eq(account.id, credential.id));
    await revokeAccountAccess(tx, proof.userId);
    await event(tx, { actorId: proof.userId, userId: proof.userId, email: current.user.email, action: "password_changed", requestId: randomUUID() });
  });
}

export async function revokePersonalSession(db: Database, proof: SessionProof, id: string) {
  await db.transaction(async tx => {
    await lockUser(tx, proof.userId);
    const current = await requireSessionProof(tx, proof);
    const [device] = await tx.select().from(session).where(and(eq(session.userId, proof.userId), eq(session.id, id)));
    if (!device) throw new ApiError(404, "not_found", "登录设备不存在或已退出。");
    await tx.delete(session).where(eq(session.id, device.id));
    await event(tx, { actorId: proof.userId, userId: proof.userId, email: current.user.email, action: "session_revoked", requestId: randomUUID() });
  });
}

export async function revokePersonalAccess(db: Database, proof: SessionProof, password: string, source: string) {
  await limitAccountAttempt(db, "revoke-account", proof.userId);
  await limitAccountAttempt(db, "revoke-source", source);
  const [credential] = await db.select().from(account).where(and(eq(account.userId, proof.userId), eq(account.providerId, "credential")));
  if (typeof password !== "string" || password.length > 128 || !credential?.password || !await verifyPassword({ hash: credential.password, password })) throw invalid("当前密码不正确。");
  await db.transaction(async tx => {
    await lockUser(tx, proof.userId);
    const current = await requireSessionProof(tx, proof);
    const [latest] = await tx.select().from(account).where(eq(account.id, credential.id));
    if (latest?.password !== credential.password) throw invalid("账号密码已变化，请重新登录。");
    await revokeAccountAccess(tx, proof.userId);
    await event(tx, { actorId: proof.userId, userId: proof.userId, email: current.user.email, action: "revoke_access", requestId: randomUUID() });
  });
}

export async function previewAccountMaintenance(db: Database, emailInput: string) {
  const email = normalizeAccountEmail(emailInput);
  const [target] = await db.select({ id: user.id, email: user.email, role: user.role, banned: user.banned }).from(user).where(eq(user.email, email));
  if (!target) throw invalid("请指定已存在账号的邮箱。");
  return target;
}
export async function initializeAccountOwner(db: Database, id: string) {
  return db.transaction(async tx => {
    // 仅维护初始化使用表锁，避免两个进程同时创建首个 owner。
    await tx.execute(sql`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`);
    const target = await lockUser(tx, id);
    if (target.banned) throw invalid("停用账号不能成为 owner。");
    const owners = await tx.select({ id: user.id }).from(user).where(eq(user.role, "owner"));
    if (owners.some(row => row.id !== id)) throw invalid("已经存在 owner，首版不支持增加其他管理账号。");
    if (target.role === "owner") return;
    await tx.update(user).set({ role: "owner", updatedAt: new Date() }).where(eq(user.id, id));
    await event(tx, { actorId: null, userId: id, email: target.email, action: "owner_initialized", requestId: randomUUID() });
  });
}
export async function recoverAccountOwner(db: Database, id: string, password: string) {
  validateNewPassword(password);
  const encoded = await hashPassword(password);
  await db.transaction(async tx => {
    const target = await lockUser(tx, id);
    if (target.role !== "owner" || target.banned) throw invalid("只能恢复有效 owner 的密码。");
    const changed = await tx.update(account).set({ password: encoded, updatedAt: new Date() }).where(and(eq(account.userId, id), eq(account.providerId, "credential"), eq(account.accountId, id))).returning();
    if (changed.length !== 1) throw invalid("账号凭据异常。");
    await revokeAccountAccess(tx, id);
    await event(tx, { actorId: null, userId: id, email: target.email, action: "owner_recovered", requestId: randomUUID() });
  });
}
