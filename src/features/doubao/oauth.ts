import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import { oauthClient, oauthClientResource, oauthConnection, oauthResource } from "../../db/schema";
import type { createAuth } from "../auth/auth";
import { ApiError } from "../auth/ai-identity";
import { lockActiveAccount } from "../auth/account-security";
import { CONNECTION_CLAIM, OAUTH_SCOPES, requireOauthConnection, revokeOauthConnection } from "../auth/oauth-connections";
import { doubaoClientId, openIdDigest, type DoubaoConfig } from "./config";
import { openEnvelope, sealEnvelope, type DoubaoEnvelope } from "./envelope";
import { limitedJson } from "./http";
import { exchangeOpenId } from "./openid";
import { doubaoNavigation } from "./navigation";

type Auth = ReturnType<typeof createAuth>;
export const doubaoScopes = OAUTH_SCOPES.filter(scope => scope !== "email");
const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().positive(), refresh_token: z.string().min(1) });
const claimsSchema = z.object({ sub: z.string().min(1), client_id: z.string().min(1), [CONNECTION_CLAIM]: z.string().min(1) });

export function canonicalResource(auth: Auth) { return new URL("/api/mcp", auth.options.baseURL as string).href; }
export function doubaoCallback(config: DoubaoConfig) { return config.origin + "/doubao/callback"; }

export async function requireDoubaoClient(db: Pick<Database, "select">, config: DoubaoConfig, clientId: string, digest?: string) {
  const [client] = await db.select().from(oauthClient).where(eq(oauthClient.clientId, clientId));
  const metadata = client?.metadata;
  if (!client || client.disabled || metadata?.provider !== "doubao" || metadata.appId !== config.appId ||
      typeof metadata.openIdDigest !== "string" || (digest && metadata.openIdDigest !== digest) ||
      client.clientId !== doubaoClientId(config, metadata.openIdDigest) || !client.requirePKCE ||
      !client.redirectUris.includes(doubaoCallback(config))) {
    throw new ApiError(401, "invalid_doubao_connection", "豆包账号连接无效，请重新连接。");
  }
  return client;
}

export async function startDoubaoLogin(db: Database, auth: Auth, config: DoubaoConfig, loginCode: string, fetcher: typeof fetch = fetch) {
  const openId = await exchangeOpenId(config, loginCode, fetcher);
  const digest = openIdDigest(config, openId), clientId = doubaoClientId(config, digest);
  const resource = canonicalResource(auth), now = new Date();
  await db.transaction(async tx => {
    await tx.insert(oauthClient).values({
      id: randomUUID(), clientId, name: "豆包 · Formward", disabled: false, skipConsent: false,
      scopes: doubaoScopes, redirectUris: [doubaoCallback(config)], tokenEndpointAuthMethod: "none",
      applicationType: "web", grantTypes: ["authorization_code", "refresh_token"], responseTypes: ["code"],
      requirePKCE: true, createdAt: now, updatedAt: now,
      metadata: { provider: "doubao", appId: config.appId, openIdDigest: digest },
    }).onConflictDoNothing({ target: oauthClient.clientId });
    await requireDoubaoClient(tx, config, clientId, digest);
    await tx.insert(oauthResource).values({ id: randomUUID(), identifier: resource, name: "Formward", allowedScopes: OAUTH_SCOPES, createdAt: now }).onConflictDoNothing({ target: oauthResource.identifier });
    await tx.insert(oauthClientResource).values({ id: randomUUID(), clientId, resourceId: resource, createdAt: now }).onConflictDoNothing();
  });
  const envelope: DoubaoEnvelope = {
    appId: config.appId, clientId, openIdDigest: digest, nonce: randomBytes(24).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"), expiresAt: Date.now() + 300000,
  };
  const state = sealEnvelope(config, "authorize", envelope);
  const query = new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: doubaoCallback(config),
    scope: doubaoScopes.join(" "), resource, state,
    code_challenge: createHash("sha256").update(envelope.verifier!).digest("base64url"), code_challenge_method: "S256",
  });
  return { authorizationUrl: config.origin + "/api/doubao/authorize?" + query, requestId: envelope.nonce };
}

export async function authorizeDoubao(db: Database, auth: Auth, config: DoubaoConfig, request: Request) {
  const source = new URL(request.url), state = source.searchParams.get("state") ?? "";
  const envelope = openEnvelope(config, "authorize", state);
  const client = await requireDoubaoClient(db, config, envelope.clientId, envelope.openIdDigest);
  const query = source.searchParams;
  const expectedKeys = ["response_type", "client_id", "redirect_uri", "scope", "resource", "state", "code_challenge", "code_challenge_method"];
  if ([...query.keys()].some(key => !expectedKeys.includes(key)) || expectedKeys.some(key => query.getAll(key).length !== 1) ||
      query.get("client_id") !== client.clientId || query.get("redirect_uri") !== doubaoCallback(config) ||
      query.get("response_type") !== "code" || query.get("resource") !== canonicalResource(auth) ||
      query.get("code_challenge_method") !== "S256" ||
      query.get("code_challenge") !== createHash("sha256").update(envelope.verifier!).digest("base64url") ||
      query.get("scope") !== doubaoScopes.join(" ")) {
    throw new ApiError(400, "invalid_request", "豆包授权请求无效，请重新连接。");
  }
  const target = new URL("/api/auth/oauth2/authorize", auth.options.baseURL as string);
  target.search = source.search;
  const response = await auth.handler(new Request(target, { headers: request.headers, redirect: "manual" }));
  let location = response.headers.get("location");
  if (!location && response.status === 200 && response.headers.get("content-type")?.includes("application/json")) {
    const body = await limitedJson(response.clone());
    if (body && typeof body === "object" && "url" in body && typeof body.url === "string") location = body.url;
  }
  if (!location) return response;
  const headers = new Headers(response.headers);
  headers.set("Location", doubaoNavigation(location, config.origin, auth.options.baseURL as string));
  headers.set("Cache-Control", "private, no-store"); headers.set("Referrer-Policy", "no-referrer");
  headers.delete("Content-Length"); headers.delete("Content-Type");
  return new Response(null, { status: 302, headers });
}

export async function callbackDoubao(db: Database, auth: Auth, config: DoubaoConfig, search: URLSearchParams) {
  const envelope = openEnvelope(config, "authorize", search.get("state") ?? "");
  await requireDoubaoClient(db, config, envelope.clientId, envelope.openIdDigest);
  if (search.get("error")) return { requestId: envelope.nonce, refused: true as const };
  const code = search.get("code");
  if (!code || code.length > 4096 || search.get("iss") !== new URL("/api/auth", auth.options.baseURL as string).href) {
    throw new ApiError(401, "invalid_doubao_credential", "授权返回无效，请重新连接。");
  }
  return { requestId: envelope.nonce, refused: false as const, developerLoginCode: sealEnvelope(config, "exchange", { ...envelope, code }) };
}

async function providerToken(auth: Auth, parameters: Record<string, string>) {
  const response = await auth.handler(new Request(new URL("/api/auth/oauth2/token", auth.options.baseURL as string), {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(parameters),
  }));
  if (!response.ok) {
    if (response.status >= 500 || response.status === 429) throw new ApiError(503, "doubao_token_unavailable", "登录续期服务暂时不可用，请稍后重试。");
    throw new ApiError(401, "invalid_doubao_credential", "连接已失效，请在豆包重新登录授权。");
  }
  let body: unknown;
  try { body = await limitedJson(response, 32768); }
  catch { throw new ApiError(503, "doubao_token_unavailable", "登录续期服务暂时不可用，请稍后重试。"); }
  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(503, "doubao_token_unavailable", "登录续期服务暂时不可用，请稍后重试。");
  return parsed.data;
}

async function bindToken(db: Database, config: DoubaoConfig, token: string, envelope: DoubaoEnvelope) {
  const claims = claimsSchema.parse(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()));
  if (claims.client_id !== envelope.clientId) throw new ApiError(401, "invalid_doubao_connection", "账号连接不匹配。");
  try {
    await db.transaction(async tx => {
      await lockActiveAccount(tx, claims.sub);
      await requireOauthConnection(tx, claims.sub, claims[CONNECTION_CLAIM], null);
      const [client] = await tx.select().from(oauthClient).where(eq(oauthClient.clientId, envelope.clientId)).for("update");
      await requireDoubaoClient(tx, config, envelope.clientId, envelope.openIdDigest);
      if (client.userId && client.userId !== claims.sub) {
        const [active] = await tx.select({ id: oauthConnection.id }).from(oauthConnection).where(and(
          eq(oauthConnection.clientId, envelope.clientId), ne(oauthConnection.userId, claims.sub),
          isNotNull(oauthConnection.authorizedAt), isNull(oauthConnection.revokedAt), gt(oauthConnection.expiresAt, new Date()),
        )).limit(1);
        if (active) throw new ApiError(409, "doubao_already_bound", "该豆包账号已有有效连接，请先在原账号撤销连接后再换绑。");
      }
      await tx.update(oauthClient).set({ userId: claims.sub, updatedAt: new Date() }).where(eq(oauthClient.clientId, envelope.clientId));
    });
  } catch (error) {
    await revokeOauthConnection(db, claims.sub, claims[CONNECTION_CLAIM]);
    throw error;
  }
  return claims;
}

export async function exchangeDoubaoToken(db: Database, auth: Auth, config: DoubaoConfig, code: string) {
  const envelope = openEnvelope(config, "exchange", code);
  await requireDoubaoClient(db, config, envelope.clientId, envelope.openIdDigest);
  const tokens = await providerToken(auth, {
    grant_type: "authorization_code", client_id: envelope.clientId, code: envelope.code!, code_verifier: envelope.verifier!,
    redirect_uri: doubaoCallback(config), resource: canonicalResource(auth),
  });
  await bindToken(db, config, tokens.access_token, envelope);
  return tokenResult(config, tokens, envelope);
}

export async function refreshDoubaoToken(db: Database, auth: Auth, config: DoubaoConfig, refreshToken: string) {
  const envelope = openEnvelope(config, "refresh", refreshToken);
  await requireDoubaoClient(db, config, envelope.clientId, envelope.openIdDigest);
  const tokens = await providerToken(auth, { grant_type: "refresh_token", client_id: envelope.clientId, refresh_token: envelope.refreshToken!, resource: canonicalResource(auth) });
  await bindToken(db, config, tokens.access_token, envelope);
  return tokenResult(config, tokens, envelope);
}

function tokenResult(config: DoubaoConfig, tokens: z.infer<typeof tokenSchema>, source: DoubaoEnvelope) {
  const expiry = source.refreshToken ? source.expiresAt : Date.now() + 30 * 86400000;
  const refresh = sealEnvelope(config, "refresh", {
    appId: config.appId, clientId: source.clientId, nonce: source.nonce, openIdDigest: source.openIdDigest,
    refreshToken: tokens.refresh_token, expiresAt: expiry,
  });
  return { code: 0, msg: "success", data: { access_token: tokens.access_token, expires_in: tokens.expires_in, refresh_token: refresh, refresh_token_expires_in: Math.max(0, Math.floor((expiry - Date.now()) / 1000)) } };
}
