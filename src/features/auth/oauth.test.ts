import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import * as schema from "../../db/schema";
import { createAuth } from "./auth";
import { provisionAccount } from "./provision";
import { CONNECTION_CLAIM, READ_SCOPE, WRITE_SCOPE, listOauthConnections, revokeOauthConnection } from "./oauth-connections";
import { oauthPageRequest } from "./oauth-pages";
import { createMcpEndpoint } from "../mcp/server";
import { listMeasurements } from "../measurements/records";
import { reviewAiMeasurementOperation } from "../measurements/ai-operations";

const pg = new PGlite(), db = drizzle(pg, { schema });
let auth: ReturnType<typeof createAuth>, baseURL: string;
const credentials = { email: "oauth-first@example.test", password: "fictional-oauth-password" };
const second = { email: "oauth-second@example.test", password: "fictional-other-password" };
const callback = "https://fictional-client.example.test/callback";
const fullScopes = ["openid", "profile", "offline_access", READ_SCOPE, WRITE_SCOPE];
const server = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    const request = new Request(`${baseURL}${req.url}`, { method: req.method, headers, ...(!["GET", "HEAD"].includes(req.method ?? "GET") ? { body: Buffer.concat(chunks) } : {}) });
    const response = req.url === "/api/mcp" ? await createMcpEndpoint(db, auth)(request) : await auth.handler(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => { if (key !== "set-cookie") res.setHeader(key, value); });
    if (response.headers.getSetCookie().length) res.setHeader("set-cookie", response.headers.getSetCookie());
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.statusCode = 500; res.end("fixture request failed"); }
});
before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  auth = createAuth(db, { baseURL, secret: "fictional-oauth-secret-at-least-32-characters", rateLimit: false });
  await auth.$context;
  await provisionAccount(db, credentials); await provisionAccount(db, second);
});
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pg.close(); });
async function json(path: string, body: object, cookie?: string) {
  return fetch(`${baseURL}/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: baseURL, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body), redirect: "manual" });
}
async function register(scopes = fullScopes) {
  const response = await json("oauth2/register", { client_name: "虚构 MCP 客户端", redirect_uris: [callback], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: scopes.join(" ") });
  assert.equal(response.status, 201);
  return (await response.json()).client_id as string;
}
async function login(input = credentials) {
  const response = await json("sign-in/email", input); assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie().map(item => item.split(";")[0]).join("; ");
  const [owner] = await db.select().from(schema.user).where(eq(schema.user.email, input.email));
  return { cookie, userId: owner.id };
}
async function authorize(clientId: string, cookie?: string, scopes = fullScopes, overrides: Record<string, string> = {}) {
  const verifier = randomBytes(32).toString("base64url"), state = randomUUID();
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: "code", scope: scopes.join(" "), state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", resource: `${baseURL}/api/mcp`, ...overrides });
  const response = await fetch(`${baseURL}/api/auth/oauth2/authorize?${query}`, { headers: { Accept: "text/html", ...(cookie ? { Cookie: cookie } : {}) }, redirect: "manual" });
  const redirectUrl = response.headers.get("location") ?? (response.status === 200 ? (await response.clone().json()).url : undefined);
  return { response, verifier, state, redirectUrl, query: redirectUrl ? new URL(redirectUrl, baseURL).search.slice(1) : "" };
}
async function token(params: Record<string, string>) {
  return fetch(`${baseURL}/api/auth/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
}
async function connect(input = credentials, scopes = fullScopes) {
  const clientId = await register(scopes), { cookie, userId } = await login(input), request = await authorize(clientId, cookie, scopes);
  assert.ok([200, 302].includes(request.response.status)); assert.match(request.redirectUrl!, /\/oauth\/consent\?/);
  assert.ok(await oauthPageRequest(db, auth, request.query));
  const consent = await json("oauth2/consent", { accept: true, oauth_query: request.query }, cookie);
  assert.equal(consent.status, 200);
  const url = new URL((await consent.json()).url);
  assert.equal(url.searchParams.get("state"), request.state); assert.equal(url.searchParams.get("iss"), `${baseURL}/api/auth`);
  const code = url.searchParams.get("code")!;
  const response = await token({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: request.verifier, redirect_uri: callback, resource: `${baseURL}/api/mcp` });
  assert.equal(response.status, 200);
  const tokens = await response.json();
  assert.ok(typeof tokens.access_token === "string" && typeof tokens.refresh_token === "string");
  const claims = JSON.parse(Buffer.from(tokens.access_token.split(".")[1], "base64url").toString());
  return { userId, cookie, clientId, tokens, claims, code, verifier: request.verifier };
}
async function mcpClient(accessToken: string, mode: "legacy" | "auto" = "auto") {
  const client = new Client({ name: "fictional-client", version: "1.0.0" }, { versionNegotiation: { mode } });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${accessToken}` } } }));
  return client;
}

test("MCP/OAuth 公开发现绑定固定资源、PKCE 和客户端注册；无凭据不返回工具或健康数据", async () => {
  const resource = await fetch(`${baseURL}/.well-known/oauth-protected-resource/api/mcp`); assert.equal(resource.status, 200);
  const info = await resource.json(); assert.equal(info.resource, `${baseURL}/api/mcp`); assert.deepEqual(info.authorization_servers, [`${baseURL}/api/auth`]);
  const metadata = await fetch(`${baseURL}/.well-known/oauth-authorization-server/api/auth`); assert.equal(metadata.status, 200);
  const config = await metadata.json(); assert.ok(config.code_challenge_methods_supported.includes("S256")); assert.equal(config.client_id_metadata_document_supported, true); assert.ok(config.registration_endpoint);
  for (const authorization of [undefined, "Bearer invalid", "Bearer fw_ai_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]) {
    const denied = await fetch(`${baseURL}/api/mcp`, { method: "POST", headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    assert.equal(denied.status, 401); assert.match(denied.headers.get("www-authenticate")!, /resource_metadata=/);
    assert.match(denied.headers.get("www-authenticate")!, /profile offline_access measurements:read measurements:write/, "初次连接同时请求身份识别和续期，避免一小时后无法刷新");
  }
});

test("OAuth 登录恢复签名请求，拒绝不签发令牌；无效签名、回调与 PKCE 被拒绝", async () => {
  const clientId = await register(), pending = await authorize(clientId);
  assert.ok([200, 302].includes(pending.response.status)); assert.match(pending.redirectUrl!, /\/oauth\/login\?/);
  assert.equal(await oauthPageRequest(db, auth, pending.query.replace("S256", "plain")), null);
  const signed = await json("sign-in/email", { ...credentials, oauth_query: pending.query }); assert.equal(signed.status, 200);
  const cookie = signed.headers.getSetCookie().map(item => item.split(";")[0]).join("; ");
  const continuation = await signed.json(); assert.equal(continuation.redirect, true);
  const denied = await json("oauth2/consent", { accept: false, oauth_query: new URL(continuation.url, baseURL).search.slice(1) }, cookie);
  assert.equal(denied.status, 200); assert.equal(new URL((await denied.json()).url).searchParams.get("error"), "access_denied");
  const wrongCallback = await authorize(clientId, cookie, fullScopes, { redirect_uri: "https://different.example.test/callback" });
  assert.ok(wrongCallback.response.status >= 400 || wrongCallback.redirectUrl?.includes("error="));
  if (wrongCallback.redirectUrl) assert.notEqual(new URL(wrongCallback.redirectUrl, baseURL).origin, "https://different.example.test");
  const wrongPkce = await authorize(clientId, cookie, fullScopes, { code_challenge_method: "plain" });
  assert.ok(wrongPkce.response.status >= 400 || wrongPkce.redirectUrl?.includes("error="));
  const invalid = await json("oauth2/consent", { accept: true, oauth_query: "client_id=forged&sig=invalid" }, cookie); assert.equal(invalid.status, 400);
  const nativeRegistration = await json("oauth2/register", { client_name: "虚构本机 MCP", application_type: "native", redirect_uris: ["http://127.0.0.1/callback"], token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"], scope: fullScopes.join(" ") });
  assert.equal(nativeRegistration.status, 201);
  const native = await authorize((await nativeRegistration.json()).client_id, cookie, fullScopes, { redirect_uri: "http://127.0.0.1:34567/callback" });
  assert.match(native.redirectUrl!, /\/oauth\/consent\?/);
  assert.ok(await oauthPageRequest(db, auth, native.query), "官方 native 回环可变端口校验通过后，网页保留签名授权请求");
});

test("现代与旧 MCP 客户端发现工具、查询、提交预览、网页确认后查询结果；重复提交幂等", async () => {
  const connected = await connect();
  for (const mode of ["legacy", "auto"] as const) {
    const client = await mcpClient(connected.tokens.access_token, mode);
    try {
      const tools = await client.listTools(); assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ["get_measurement_operation", "get_profile", "query_measurements", "submit_measurement_operation"]);
      const profile = await client.callTool({ name: "get_profile", arguments: {} }); assert.equal((profile.structuredContent as Record<string, unknown>)?.id, connected.userId);
      const input = { operationId: randomUUID(), items: [{ kind: "save_record", date: mode === "legacy" ? "2024-06-01" : "2024-06-02", period: "evening", weightKg: "70.20", deviceLabel: "虚构 MCP 秤" }] };
      const result = await client.callTool({ name: "submit_measurement_operation", arguments: input }); assert.ok(!result.isError);
      const data = result.structuredContent! as { id: string; revision: number; confirmationUrl: string };
      assert.match(data.confirmationUrl, /\/dashboard\/ai\/operations\//);
      const repeated = await client.callTool({ name: "submit_measurement_operation", arguments: input }); assert.equal((repeated.structuredContent as Record<string, unknown>)?.id, data.id);
      const beforeCount = (await listMeasurements(db, connected.userId)).length;
      await reviewAiMeasurementOperation(db, connected.userId, data.id, { kind: "confirm", revision: data.revision });
      assert.equal((await listMeasurements(db, connected.userId)).length, beforeCount + 1);
      const operation = await client.callTool({ name: "get_measurement_operation", arguments: { id: data.id } }); assert.equal((operation.structuredContent as Record<string, unknown>)?.status, "confirmed");
      const records = await client.callTool({ name: "query_measurements", arguments: {} }); assert.ok(Array.isArray((records.structuredContent as Record<string, unknown>)?.records));
    } finally { await client.close(); }
  }
  const events = await db.select().from(schema.measurementEvent).where(eq(schema.measurementEvent.userId, connected.userId));
  assert.ok(events.every(event => (event.snapshot.ai as { oauthConnectionId: string }).oauthConnectionId === connected.claims[CONNECTION_CLAIM]));
});

test("刷新轮换保持连接与审核归属；授权码重复、错误 verifier、资源和刷新重放被拒绝", async () => {
  const connected = await connect(), client = await mcpClient(connected.tokens.access_token);
  try {
    const preview = await client.callTool({ name: "submit_measurement_operation", arguments: { operationId: randomUUID(), items: [{ kind: "save_record", date: "2024-06-10", period: "evening", weightKg: "71.00", deviceLabel: "虚构 MCP 秤" }] } });
    const data = preview.structuredContent! as { id: string; revision: number };
    const refreshed = await token({ grant_type: "refresh_token", client_id: connected.clientId, refresh_token: connected.tokens.refresh_token, resource: `${baseURL}/api/mcp` }); assert.equal(refreshed.status, 200);
    const next = await refreshed.json(), claims = JSON.parse(Buffer.from(next.access_token.split(".")[1], "base64url").toString()); assert.equal(claims[CONNECTION_CLAIM], connected.claims[CONNECTION_CLAIM]);
    await reviewAiMeasurementOperation(db, connected.userId, data.id, { kind: "confirm", revision: data.revision });
    assert.ok((await listOauthConnections(db, connected.userId)).some(row => row.id === claims[CONNECTION_CLAIM]));
    const replayCode = await token({ grant_type: "authorization_code", client_id: connected.clientId, code: connected.code, code_verifier: connected.verifier, redirect_uri: callback, resource: `${baseURL}/api/mcp` }); assert.equal(replayCode.status, 400);
    const replayRefresh = await token({ grant_type: "refresh_token", client_id: connected.clientId, refresh_token: connected.tokens.refresh_token, resource: `${baseURL}/api/mcp` }); assert.equal(replayRefresh.status, 400);
    const replayFamily = await token({ grant_type: "refresh_token", client_id: connected.clientId, refresh_token: next.refresh_token, resource: `${baseURL}/api/mcp` }); assert.equal(replayFamily.status, 400);
  } finally { await client.close(); }
});

test("只读授权不能提交，跨账号不能读审核或撤销；撤销后旧访问与预览立即失效", async () => {
  const first = await connect(), other = await connect(second), readonly = await connect(credentials, ["openid", "profile", "offline_access", READ_SCOPE]);
  const one = await mcpClient(first.tokens.access_token), two = await mcpClient(other.tokens.access_token), read = await mcpClient(readonly.tokens.access_token);
  try {
    const input = { operationId: randomUUID(), items: [{ kind: "save_record", date: "2024-06-20", period: "evening", weightKg: "72.00", deviceLabel: "虚构秤" }] };
    assert.equal((await read.callTool({ name: "submit_measurement_operation", arguments: input })).isError, true);
    const result = await one.callTool({ name: "submit_measurement_operation", arguments: input }); const data = result.structuredContent! as { id: string; revision: number };
    assert.equal((await two.callTool({ name: "get_measurement_operation", arguments: { id: data.id } })).isError, true);
    await assert.rejects(revokeOauthConnection(db, other.userId, first.claims[CONNECTION_CLAIM]));
    await revokeOauthConnection(db, first.userId, first.claims[CONNECTION_CLAIM]);
    const denied = await fetch(`${baseURL}/api/mcp`, { method: "POST", headers: { Authorization: `Bearer ${first.tokens.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }); assert.equal(denied.status, 401);
    await assert.rejects(reviewAiMeasurementOperation(db, first.userId, data.id, { kind: "confirm", revision: data.revision }));
    assert.equal((await token({ grant_type: "refresh_token", client_id: first.clientId, refresh_token: first.tokens.refresh_token, resource: `${baseURL}/api/mcp` })).status, 400);
  } finally { await Promise.all([one.close(), two.close(), read.close()]); }
});

test("签名正确但过期、错误 issuer／audience 的访问令牌被拒绝，JWT 签发不暴露为 HTTP API", async () => {
  const connected = await connect();
  for (const patch of [{ exp: 1 }, { aud: "https://different.example.test/mcp" }, { iss: "https://different.example.test/auth" }]) {
    const signed = await auth.api.signJWT({ body: { payload: { ...connected.claims, ...patch } } });
    const response = await fetch(`${baseURL}/api/mcp`, { method: "POST", headers: { Authorization: `Bearer ${signed.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    assert.equal(response.status, 401);
  }
  assert.equal((await json("sign-jwt", { payload: connected.claims }, connected.cookie)).status, 404);
});

test("撤销后未兑换的授权码失效，同一客户端重新授权产生新连接而不恢复旧预览", async () => {
  const connected = await connect(), client = await mcpClient(connected.tokens.access_token);
  try {
    const preview = await client.callTool({ name: "submit_measurement_operation", arguments: { operationId: randomUUID(), items: [{ kind: "save_record", date: "2024-07-20", period: "evening", weightKg: "71.00", deviceLabel: "虚构秤" }] } });
    const operation = preview.structuredContent! as { id: string; revision: number };
    const pending = await authorize(connected.clientId, connected.cookie);
    const pendingCode = new URL(pending.redirectUrl, baseURL).searchParams.get("code")!;
    assert.ok(pendingCode);
    await revokeOauthConnection(db, connected.userId, connected.claims[CONNECTION_CLAIM]);
    const denied = await token({ grant_type: "authorization_code", client_id: connected.clientId, code: pendingCode, code_verifier: pending.verifier, redirect_uri: callback, resource: `${baseURL}/api/mcp` });
    assert.equal(denied.status, 400);
    const reauthorize = await authorize(connected.clientId, connected.cookie);
    assert.match(reauthorize.redirectUrl!, /\/oauth\/consent\?/);
    const consent = await json("oauth2/consent", { accept: true, oauth_query: reauthorize.query }, connected.cookie);
    const code = new URL((await consent.json()).url).searchParams.get("code")!;
    const invalidVerifier = await token({ grant_type: "authorization_code", client_id: connected.clientId, code, code_verifier: randomBytes(32).toString("base64url"), redirect_uri: callback, resource: `${baseURL}/api/mcp` });
    assert.equal(invalidVerifier.status, 401);
    assert.equal((await invalidVerifier.json()).error, "invalid_request");
    const freshRequest = await authorize(connected.clientId, connected.cookie), freshCode = new URL(freshRequest.redirectUrl, baseURL).searchParams.get("code")!;
    const fresh = await token({ grant_type: "authorization_code", client_id: connected.clientId, code: freshCode, code_verifier: freshRequest.verifier, redirect_uri: callback, resource: `${baseURL}/api/mcp` });
    assert.equal(fresh.status, 200);
    const result = await fresh.json(), claims = JSON.parse(Buffer.from(result.access_token.split(".")[1], "base64url").toString());
    assert.notEqual(claims[CONNECTION_CLAIM], connected.claims[CONNECTION_CLAIM]);
    await assert.rejects(reviewAiMeasurementOperation(db, connected.userId, operation.id, { kind: "confirm", revision: operation.revision }));
  } finally { await client.close(); }
});
