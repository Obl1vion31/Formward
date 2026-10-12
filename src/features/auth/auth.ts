import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDatabase, type Database } from "../../db/client";
import * as schema from "../../db/schema";
import { jwt } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { getOAuthProviderState } from "@better-auth/oauth-provider";
import { OAUTH_SCOPES, oauthAccessClaims, oauthConnectionReference } from "./oauth-connections";

export function createAuth(db: Database, config: { secret: string; baseURL: string; rateLimit?: boolean }) {
  if (config.secret.length < 32) throw new Error("BETTER_AUTH_SECRET 需要至少 32 个随机字符。");
  const url = new URL(config.baseURL);
  const trustedOrigins = [url.origin];
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    trustedOrigins.push(`http://localhost:${url.port || "80"}`, `http://127.0.0.1:${url.port || "80"}`);
  }
  return betterAuth({
    appName: "Formward",
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins,
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 6, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: {
      enabled: config.rateLimit ?? true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": { window: 60, max: 5 } },
    },
    advanced: { cookiePrefix: "formward", useSecureCookies: url.protocol === "https:" },
    disabledPaths: ["/token"],
    plugins: [
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
