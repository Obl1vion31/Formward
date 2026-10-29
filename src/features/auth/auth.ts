import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDatabase, type Database } from "../../db/client";
import * as schema from "../../db/schema";
import { admin, jwt } from "better-auth/plugins";
import { defaultAc, userAc } from "better-auth/plugins/admin/access";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { getOAuthProviderState } from "@better-auth/oauth-provider";
import { OAUTH_SCOPES, oauthAccessClaims, oauthConnectionReference } from "./oauth-connections";
import { limitAccountAttempt, requireSessionProof } from "./account-security";

type LoginSnapshot = { id: string; accessVersion: number };
type SecurityContext = { formwardLogin?: LoginSnapshot };
const blockedAccountPaths = ["/token", "/change-password", "/set-password", "/request-password-reset", "/reset-password", "/change-email", "/delete-user", "/delete-user/callback", "/send-verification-email", "/verify-email", "/update-user", "/verify-password", "/revoke-session", "/revoke-sessions", "/revoke-other-sessions", "/update-session", "/link-social", "/unlink-account"];

export function createAuth(db: Database, config: { secret: string; baseURL: string; rateLimit?: boolean }) {
  if (config.secret.length < 32) throw new Error("BETTER_AUTH_SECRET 需要至少 32 个随机字符。");
  const url = new URL(config.baseURL);
  const trustedOrigins = [url.origin];
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    trustedOrigins.push(`http://localhost:${url.port || "80"}`, `http://127.0.0.1:${url.port || "80"}`);
  }
  const adminPlugin = admin({ defaultRole: "user", adminRoles: ["owner"],
    roles: { user: userAc, owner: defaultAc.newRole({ user: ["list", "get", "ban"], session: ["list", "revoke"] }) },
    bannedUserMessage: "账号已停用，请联系邀请人。" });
  const disabledPaths = [...blockedAccountPaths, ...Object.values(adminPlugin.endpoints).map(endpoint => endpoint.path)];
  return betterAuth({
    appName: "Formward",
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins,
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 6, maxPasswordLength: 128 },
    user: { additionalFields: { accessVersion: { type: "number", defaultValue: 0, input: false }, lastLoginAt: { type: "date", required: false, input: false } } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false }, additionalFields: {
      accessVersion: { type: "number", defaultValue: 0, input: false }, adminVerifiedAt: { type: "date", required: false, input: false, returned: false },
    } },
    rateLimit: {
      enabled: config.rateLimit ?? true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": { window: 60, max: 5 } },
    },
    advanced: { cookiePrefix: "formward", useSecureCookies: url.protocol === "https:" },
    disabledPaths,
    hooks: {
      before: createAuthMiddleware(async ctx => {
        // disabledPaths 仅保护 HTTP；这里同时拦截服务端 auth.api 的旁路。
        if (disabledPaths.includes(ctx.path)) throw new APIError("NOT_FOUND", { message: "此入口未开放。" });
        if (ctx.path === "/sign-in/email") {
          const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
          if (config.rateLimit !== false) {
            try { await limitAccountAttempt(db, "signin-account", email); }
            catch { throw new APIError("TOO_MANY_REQUESTS", { message: "尝试次数较多，请一分钟后重试。" }); }
          }
          const [owner] = await db.select({ id: schema.user.id, accessVersion: schema.user.accessVersion }).from(schema.user).where(eq(schema.user.email, email));
          (ctx.context as typeof ctx.context & SecurityContext).formwardLogin = owner;
        } else if (ctx.path !== "/get-session" && ctx.path !== "/sign-out" && ctx.headers?.get("cookie")) {
          const identity = await getSessionFromCtx(ctx);
          if (identity) {
            try { await requireSessionProof(db, { userId: identity.user.id, sessionId: identity.session.id, accessVersion: Number((identity.session as { accessVersion?: number }).accessVersion ?? 0) }); }
            catch { throw new APIError("UNAUTHORIZED", { message: "登录已失效，请重新登录。" }); }
          }
        }
      }),
      after: createAuthMiddleware(async ctx => {
        if (ctx.path === "/get-session") {
          const identity = ctx.context.returned as { user?: { id: string }; session?: { id: string; accessVersion?: number } } | null;
          if (identity?.user && identity.session) {
            try { await requireSessionProof(db, { userId: identity.user.id, sessionId: identity.session.id, accessVersion: identity.session.accessVersion ?? 0 }); }
            catch { return ctx.json(null); }
          }
        }
        if (ctx.path === "/sign-in/email" && ctx.context.newSession) {
          const snapshot = (ctx.context as typeof ctx.context & SecurityContext).formwardLogin;
          if (snapshot) {
            const changed = await db.update(schema.user).set({ lastLoginAt: new Date() }).where(and(eq(schema.user.id, snapshot.id), eq(schema.user.accessVersion, snapshot.accessVersion), eq(schema.user.banned, false))).returning({ id: schema.user.id });
            if (!changed.length) throw new APIError("UNAUTHORIZED", { message: "账号访问已变化，请重新登录。" });
          }
        }
      }),
    },
    databaseHooks: { session: { create: { before: async (data, ctx) => {
      const snapshot = (ctx?.context as (SecurityContext | undefined))?.formwardLogin;
      if (!snapshot || snapshot.id !== data.userId) throw new APIError("UNAUTHORIZED", { message: "请通过密码登录。" });
      return { data: { ...data, accessVersion: snapshot.accessVersion, adminVerifiedAt: null } };
    } } } },
    plugins: [
      adminPlugin,
      jwt(),
      mcp({
        resource: new URL("/api/mcp", url).href,
        loginPage: "/oauth/login",
        consentPage: "/oauth/consent",
        scopes: OAUTH_SCOPES,
        grantTypes: ["authorization_code", "refresh_token"],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationRequirePKCE: true,
        clientRegistrationDefaultScopes: OAUTH_SCOPES,
        accessTokenExpiresIn: 3600,
        refreshTokenExpiresIn: 30 * 86400,
        refreshTokenReuseInterval: 0,
        codeExpiresIn: 300,
        storeTokens: "hashed",
        postLogin: {
          page: "/oauth/consent",
          shouldRedirect: async () => false,
          consentReferenceId: async ({ user }) => {
            const state = await getOAuthProviderState();
            const clientId = new URLSearchParams(state?.query).get("client_id");
            if (!clientId || !user) throw new APIError("BAD_REQUEST", { error: "invalid_request" });
            return oauthConnectionReference(db, user.id, clientId);
          },
        },
        extensions: [{ claims: { accessToken: async ({ user, client, referenceId, scopes }) => {
          if (!user) throw new APIError("BAD_REQUEST", { error: "invalid_grant" });
          try { return await oauthAccessClaims(db, user.id, client.clientId, referenceId, scopes); }
          catch { throw new APIError("BAD_REQUEST", { error: "invalid_grant", error_description: "账号授权已失效，请重新连接。" }); }
        } } }],
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
const shared = globalThis as typeof globalThis & { formwardAuth?: Auth };

export function getAuth() {
  if (!shared.formwardAuth) {
    const secret = process.env.BETTER_AUTH_SECRET;
    const baseURL = process.env.BETTER_AUTH_URL;
    if (!secret || !baseURL) throw new Error("请在 .env.local 配置 BETTER_AUTH_SECRET 与 BETTER_AUTH_URL。");
    shared.formwardAuth = createAuth(getDatabase(), { secret, baseURL });
  }
  return shared.formwardAuth;
}

// 身份只来自经过验证的 cookie，不接受客户端传来的 user_id。
export async function currentUser(headers: Headers, auth = getAuth()) {
  const result = await auth.api.getSession({ headers });
  return result?.user ?? null;
}
