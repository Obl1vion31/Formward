import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { mfaLoginChallenge, session, twoFactor as factorTable, user } from "../../db/schema";
import { limitAccountAttempt, ownerMfaRequired, ownerMfaPaused, requireRecentSecurity, requireSessionProof } from "./account-security";
import { recordSecurityEvent } from "./security-usage";
import { ApiError } from "./ai-identity";

type Context = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
export type MfaContextState = { formwardLogin?: { id: string; accessVersion: number }; formwardMfaVerified?: boolean; formwardRecovery?: boolean; formwardMfaEnrollment?: boolean };
const verificationPaths = ["/two-factor/verify-totp", "/two-factor/verify-backup-code"];

export async function prepareMfaVerification(db: Database, ctx: Context) {
  const state = ctx.context as typeof ctx.context & MfaContextState;
  if (!ctx.path?.startsWith("/two-factor/")) return;
  if (["/two-factor/view-backup-codes", "/two-factor/get-totp-uri", "/two-factor/send-otp", "/two-factor/verify-otp"].includes(ctx.path)) throw new APIError("NOT_FOUND", { message: "此入口未开放。" });
  if (ctx.body?.trustDevice === true || ctx.body?.method === "otp") throw new APIError("BAD_REQUEST", { message: "请使用验证器动态码，不跳过双重验证。" });
  const identity = await getSessionFromCtx(ctx);
  if (identity) {
    const proof = { userId: identity.user.id, sessionId: identity.session.id, accessVersion: Number(identity.session.accessVersion ?? 0) };
    const current = await requireSessionProof(db, proof, false, { allowMfaSetup: true });
    if (current.user.role === "owner" && ownerMfaPaused() && ["/two-factor/enable", "/two-factor/verify-totp", "/two-factor/generate-backup-codes"].includes(ctx.path)) throw new APIError("FORBIDDEN", { message: "管理员动态码已暂时关闭，请刷新页面后使用账号密码继续。" });
    if (ctx.path === "/two-factor/disable" && current.user.role === "owner" && ownerMfaRequired()) throw new APIError("FORBIDDEN", { message: "管理员必须保留双重验证；更换设备请重新绑定。" });
    if (["/two-factor/disable", "/two-factor/generate-backup-codes"].includes(ctx.path) || ctx.path === "/two-factor/enable" && current.user.twoFactorEnabled && !current.session.mfaRecoveryRequired) await requireRecentSecurity(db, proof);
    if (ctx.path === "/two-factor/verify-backup-code") throw new APIError("BAD_REQUEST", { message: "恢复码仅用于登录恢复，请退出后使用恢复码登录。" });
    state.formwardLogin = { id: current.user.id, accessVersion: current.user.accessVersion };
    const [factor] = await db.select({ verified: factorTable.verified }).from(factorTable).where(eq(factorTable.userId, current.user.id));
    state.formwardMfaEnrollment = verificationPaths.includes(ctx.path) && (!factor?.verified || !current.user.twoFactorEnabled || current.session.mfaRecoveryRequired);
  } else if (verificationPaths.includes(ctx.path)) {
    const cookie = ctx.context.createAuthCookie("two_factor");
    const identifier = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
    const [challenge] = identifier ? await db.select().from(mfaLoginChallenge).where(eq(mfaLoginChallenge.id, identifier)) : [];
    const [owner] = challenge ? await db.select().from(user).where(eq(user.id, challenge.userId)) : [];
    if (!challenge || !owner || owner.banned || owner.accessVersion !== challenge.accessVersion || challenge.expiresAt.getTime() <= Date.now()) throw new APIError("UNAUTHORIZED", { message: "验证流程已过期或被撤销，请重新输入账号密码。" });
    state.formwardLogin = { id: owner.id, accessVersion: owner.accessVersion };
  }
  if (verificationPaths.includes(ctx.path)) {
    if (!state.formwardLogin) throw new APIError("UNAUTHORIZED", { message: "请重新登录。" });
    try { await limitAccountAttempt(db, "mfa-account", state.formwardLogin.id); await limitAccountAttempt(db, "mfa-source", ctx.headers?.get("x-forwarded-for") ?? "unknown"); }
    catch(error){if(error instanceof ApiError && error.status===429)throw new APIError("TOO_MANY_REQUESTS",{message:error.message},{"Retry-After":String(error.details?.retryAfter??60)});throw error;}
    state.formwardMfaVerified = true;
    state.formwardRecovery = ctx.path === "/two-factor/verify-backup-code";
  }
}

/** 放在官方twoFactor插件之后：只承接插件已经校验成功的结果。 */
export function formwardMfaPlugin(db: Database): BetterAuthPlugin {
  return { id: "formward-mfa-proof", hooks: { after: [{
    matcher: ctx => ctx.path === "/sign-in/email" || verificationPaths.includes(ctx.path ?? "") || ctx.path === "/two-factor/disable",
    handler: createAuthMiddleware(async ctx => {
      const state = ctx.context as typeof ctx.context & MfaContextState, snapshot = state.formwardLogin;
      if (!snapshot) return;
      if (ctx.path === "/sign-in/email") {
        const cookieName = ctx.context.createAuthCookie("two_factor").name;
        const raw = ctx.context.responseHeaders?.getSetCookie().find(value => value.startsWith(cookieName + "="));
        if (raw) {
          const signed = decodeURIComponent(raw.slice(cookieName.length + 1).split(";")[0]);
          const identifier = signed.slice(0, signed.lastIndexOf("."));
          if (identifier.startsWith("2fa-")) await db.insert(mfaLoginChallenge).values({ id: identifier, userId: snapshot.id, accessVersion: snapshot.accessVersion, expiresAt: new Date(Date.now() + 300000) }).onConflictDoNothing();
        }
        if (ctx.context.newSession) await db.update(user).set({ lastLoginAt: new Date() }).where(and(eq(user.id, snapshot.id), eq(user.accessVersion, snapshot.accessVersion), eq(user.banned, false)));
        return;
      }
      const returned = ctx.context.returned as { token?: unknown; user?: { id?: unknown }; status?: unknown } | null;
      if (verificationPaths.includes(ctx.path ?? "") && (typeof returned?.token !== "string" || returned.user?.id !== snapshot.id)) {await recordSecurityEvent(db,"verification_failed",snapshot.id,{stage:"dynamic_code"},ctx.headers?.get("x-forwarded-for")??"unknown");return;}
      if (ctx.path === "/two-factor/disable" && returned?.status !== true) return;
      const identity = ctx.context.newSession ?? ctx.context.session;
      if (!identity || !state.formwardMfaVerified && ctx.path !== "/two-factor/disable") return;
      await db.transaction(async tx => {
        const [owner] = await tx.select().from(user).where(eq(user.id, snapshot.id)).for("update");
        if (!owner || owner.banned || owner.accessVersion !== snapshot.accessVersion) throw new APIError("UNAUTHORIZED", { message: "账号访问已变化，请重新登录。" });
        const now = new Date();
        await tx.update(session).set({ mfaVerifiedAt: now, securityVerifiedAt: now, adminVerifiedAt: owner.role === "owner" ? now : null, mfaRecoveryRequired: !!state.formwardRecovery }).where(and(eq(session.id, identity.session.id), eq(session.userId, owner.id)));
        if (state.formwardMfaEnrollment || ctx.path === "/two-factor/disable") {
          await tx.delete(session).where(and(eq(session.userId, owner.id), sqlNotEqual(session.id, identity.session.id)));
          await tx.delete(mfaLoginChallenge).where(eq(mfaLoginChallenge.userId, owner.id));
        }
        await tx.update(user).set({ lastLoginAt: now }).where(eq(user.id, owner.id));
      });
      await recordSecurityEvent(db, state.formwardRecovery ? "mfa_recovery" : state.formwardMfaEnrollment ? "mfa_bound" : "mfa_verified", snapshot.id);
    }),
  }] } };
}

// 保持Drizzle表达式类型，不接受客户端提供SQL。
import { ne as sqlNotEqual } from "drizzle-orm";
