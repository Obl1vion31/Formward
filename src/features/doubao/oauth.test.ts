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
import { createAuth } from "../auth/auth";
import { provisionAccount } from "../auth/provision";
import { CONNECTION_CLAIM, revokeOauthConnection } from "../auth/oauth-connections";
import { ApiError } from "../auth/ai-identity";
import { createMcpEndpoint } from "../mcp/server";
import { doubaoConfig, openIdDigest, type DoubaoConfig } from "./config";
import { handleDoubaoRequest } from "./routes";
import { exchangeOpenId } from "./openid";
import { openEnvelope, sealEnvelope } from "./envelope";
import { authorizeDoubao, callbackDoubao, exchangeDoubaoToken, refreshDoubaoToken, startDoubaoLogin } from "./oauth";
import { createDoubaoMcpEndpoint } from "./mcp";

const pg = new PGlite(), db = drizzle(pg, { schema });
let auth: ReturnType<typeof createAuth>, baseURL: string, config: DoubaoConfig;
const first = { email: "doubao-first@example.test", password: "fictional-doubao-password" };
const second = { email: "doubao-second@example.test", password: "fictional-other-password" };
const openId = "fictional-doubao-openid-first";
// Next Route Handler 的请求由框架代理；属性可读，但不能交给原生 Request 构造器复制私有状态。
function frameworkRequest(request: Request) {
  return new Proxy(request, { get(target, property) {
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
const server = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    const request = new Request(baseURL + req.url, { method: req.method, headers, ...(!["GET", "HEAD"].includes(req.method ?? "GET") ? { body: Buffer.concat(chunks) } : {}) });
    const response = req.url === "/api/doubao/mcp" ? await createDoubaoMcpEndpoint(db, auth, config)(request)
      : req.url === "/api/framework/doubao/mcp" ? await createDoubaoMcpEndpoint(db, auth, config)(frameworkRequest(request))
      : req.url === "/api/mcp" ? await createMcpEndpoint(db, auth)(request)
      : req.url?.startsWith("/api/doubao/authorize?") ? await authorizeDoubao(db, auth, config, request) : await auth.handler(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => { if (key !== "set-cookie") res.setHeader(key, value); });
    if (response.headers.getSetCookie().length) res.setHeader("set-cookie", response.headers.getSetCookie());
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.statusCode = error instanceof ApiError ? error.status : 500; res.end("fixture request failed"); }
});

before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config = { appId: "fictional-doubao-app", appSecret: "fictional-doubao-app-secret", secret: "fictional-doubao-auth-secret-at-least-32-characters", origin: baseURL, openApiBase: "https://api.doubao-dev.com" };
  auth = createAuth(db, { baseURL, secret: config.secret, rateLimit: false });
  await auth.$context;
  await provisionAccount(db, first); await provisionAccount(db, second);
});
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pg.close(); });

test("未启用和配置缺失仅阻止豆包入口，拒绝不安全的交换地址", () => {
  assert.throws(() => doubaoConfig({}), /尚未启用/);
  const env = { FORMWARD_DOUBAO_ENABLED: "1", FORMWARD_DOUBAO_APP_ID: config.appId, FORMWARD_DOUBAO_APP_SECRET: config.appSecret, FORMWARD_DOUBAO_ORIGIN: baseURL, BETTER_AUTH_SECRET: config.secret };
  assert.equal(doubaoConfig(env).openApiBase, "https://api.doubao-dev.com");
  assert.throws(() => doubaoConfig({ ...env, FORMWARD_DOUBAO_APP_SECRET: "" }), /尚未完成/);
  for (const address of ["http://example.test", "https://user:password@example.test", "https://example.test/?secret=value"]) {
    assert.throws(() => doubaoConfig({ ...env, DOUBAO_OPENAPI_BASE_DOMAIN: address }), /配置无效/);
  }
});

test("HTTP 边界拒绝错误应用、畸形和超限正文、过期凭证及其他来源", async () => {
  const post = (operation: string, body: string, origin = baseURL) => handleDoubaoRequest(db, auth, config, operation, new Request(origin + "/api/doubao/" + operation, { method: "POST", body, headers: { "content-type": "application/json" } }));
  for (const operation of ["login", "fetch-token", "refresh-token"]) {
    const input = { app_id: "another-app", ...(operation === "login" ? { login_code: "fictional" } : operation === "fetch-token" ? { code: "fictional" } : { refresh_token: "fictional" }) };
    assert.equal((await post(operation, JSON.stringify(input))).status, 401);
    assert.equal((await post(operation, "{")).status, 400);
    assert.equal((await post(operation, JSON.stringify({ huge: "x".repeat(30000) }))).status, 413);
  }
  assert.equal((await post("login", "{}", "https://other.example.test")).status, 404);
  assert.equal((await post("refresh-token", JSON.stringify({ app_id: config.appId, refresh_token: "invalid" }))).status, 401);
  const request = { request_id: "fictional-delete-request", open_id: "fictional-host-user", event_time: 1, fields: [{ field_name: "PHONE", hard_delete: true }] };
  for (let i = 0; i < 2; i++) {
    const response = await post("delete-userinfo", JSON.stringify(request));
    assert.equal(response.status, 200); assert.equal((await response.json()).success, true);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal((await post("delete-userinfo", JSON.stringify({ ...request, fields: [{ field_name: "HEALTH", hard_delete: true }] }))).status, 400);
});

test("宿主身份交换失败不建立绑定，不把上游错误内容传给客户端", async () => {
  const beforeCount = (await db.select().from(schema.oauthClient)).length;
  for (const response of [Response.json({ code: 1234, msg: "private upstream detail" }), Response.json({ code: 0, data: {} }), new Response("unavailable", { status: 503 })]) {
    await assert.rejects(exchangeOpenId(config, "fictional-code", (async () => response) as typeof fetch), error => error instanceof ApiError && error.status === 401 && !error.message.includes("private"));
  }
  assert.equal((await db.select().from(schema.oauthClient)).length, beforeCount);
});

function platformFetch(expectedOpenId = openId): typeof fetch {
  return (async (url, init) => {
    assert.equal(String(url), "https://api.doubao-dev.com/api/login/v1/developer/get_openid");
    assert.deepEqual(JSON.parse(String(init?.body)), { app_id: config.appId, app_secret: config.appSecret, grant_type: "authorization_code", login_code: "fictional-host-code" });
    return Response.json({ code: 0, log_id: "fictional-log-id", data: { open_id: expectedOpenId } });
  }) as typeof fetch;
}

async function signIn(credentials = first) {
  const response = await fetch(baseURL + "/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: baseURL }, body: JSON.stringify(credentials), redirect: "manual" });
  assert.equal(response.status, 200);
  const [account] = await db.select().from(schema.user).where(eq(schema.user.email, credentials.email));
  return { cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "), userId: account.id };
}

async function grant(credentials = first, externalId = openId, accept = true) {
  const start = await startDoubaoLogin(db, auth, config, "fictional-host-code", platformFetch(externalId));
  const logged = await signIn(credentials);
  const response = await fetch(start.authorizationUrl, { headers: { cookie: logged.cookie, accept: "text/html" }, redirect: "manual" });
  assert.ok([200, 302].includes(response.status), `authorize returned ${response.status}`);
  const location = response.headers.get("location") ?? (await response.json()).url;
  assert.match(location, /\/doubao\/consent\?/);
  const query = new URL(location).search.slice(1);
  const consent = await fetch(baseURL + "/api/auth/oauth2/consent", { method: "POST", headers: { cookie: logged.cookie, origin: baseURL, "content-type": "application/json" }, body: JSON.stringify({ accept, oauth_query: query }) });
  assert.equal(consent.status, 200);
  const callback = new URL((await consent.json()).url);
  const result = await callbackDoubao(db, auth, config, callback.searchParams);
  assert.equal(result.requestId, start.requestId);
  return { ...logged, start, callback, result };
}

test("豆包封装凭证隔离用途、应用、篡改及到期，不暴露 PKCE verifier", () => {
  const payload = { appId: config.appId, clientId: "fictional-client", openIdDigest: openIdDigest(config, openId), nonce: randomBytes(24).toString("base64url"), verifier: randomBytes(32).toString("base64url"), expiresAt: Date.now() + 120000 };
  const sealed = sealEnvelope(config, "authorize", payload);
  assert.ok(!sealed.includes(payload.verifier));
  assert.deepEqual(openEnvelope(config, "authorize", sealed), payload);
  assert.throws(() => openEnvelope(config, "exchange", sealed), ApiError);
  assert.throws(() => openEnvelope({ ...config, appId: "another-app" }, "authorize", sealed), ApiError);
  const modified = sealed.slice(0, 40) + (sealed[40] === "A" ? "B" : "A") + sealed.slice(41);
  assert.throws(() => openEnvelope(config, "authorize", modified), ApiError);
  assert.throws(() => openEnvelope(config, "authorize", sealed, payload.expiresAt + 1), ApiError);
});

test("豆包以真实 OAuth code 一次性换令牌、持久化摘要绑定并保持原 issuer", async () => {
  const flow = await grant();
  assert.equal(flow.result.refused, false);
  if (flow.result.refused) throw new Error("Unexpected refusal");
  const tokens = await exchangeDoubaoToken(db, auth, config, flow.result.developerLoginCode);
  const claims = JSON.parse(Buffer.from(tokens.data.access_token.split(".")[1], "base64url").toString());
  assert.equal(claims.iss, baseURL + "/api/auth"); assert.equal(claims.sub, flow.userId);
  const [client] = await db.select().from(schema.oauthClient).where(eq(schema.oauthClient.clientId, claims.client_id));
  assert.equal(client.userId, flow.userId); assert.equal(client.metadata?.openIdDigest, openIdDigest(config, openId));
  assert.ok(!JSON.stringify(client).includes(openId));
  const restarted = createAuth(db, { baseURL, secret: config.secret, rateLimit: false });
  await restarted.$context;
  const refreshed = await refreshDoubaoToken(db, restarted, config, tokens.data.refresh_token);
  assert.notEqual(refreshed.data.access_token, tokens.data.access_token);
  assert.notEqual(refreshed.data.refresh_token, tokens.data.refresh_token);
  await assert.rejects(() => exchangeDoubaoToken(db, auth, config, flow.result.developerLoginCode!), ApiError);
  await assert.rejects(() => refreshDoubaoToken(db, auth, config, tokens.data.refresh_token), ApiError);
});

test("豆包拒绝授权不产生可兑换成功码", async () => {
  const flow = await grant(first, "fictional-refused-openid", false);
  assert.equal(flow.result.refused, true);
  assert.equal("developerLoginCode" in flow.result, false);
});

test("豆包绑定不能覆盖仍有效的其他账号，撤销原连接后才允许重新绑定", async () => {
  const externalId = "fictional-shared-openid";
  const firstFlow = await grant(first, externalId);
  if (firstFlow.result.refused) throw new Error();
  const token = await exchangeDoubaoToken(db, auth, config, firstFlow.result.developerLoginCode);
  const firstClaims = JSON.parse(Buffer.from(token.data.access_token.split(".")[1], "base64url").toString());
  const secondFlow = await grant(second, externalId);
  if (secondFlow.result.refused) throw new Error();
  const secondCode = secondFlow.result.developerLoginCode;
  await assert.rejects(() => exchangeDoubaoToken(db, auth, config, secondCode), (error: unknown) => error instanceof ApiError && error.code === "doubao_already_bound");
  await revokeOauthConnection(db, firstFlow.userId, firstClaims[CONNECTION_CLAIM]);
  const nextFlow = await grant(second, externalId);
  if (nextFlow.result.refused) throw new Error();
  const nextTokens = await exchangeDoubaoToken(db, auth, config, nextFlow.result.developerLoginCode);
  const nextClaims = JSON.parse(Buffer.from(nextTokens.data.access_token.split(".")[1], "base64url").toString());
  assert.equal(nextClaims.sub, nextFlow.userId);
});

async function mcpClient(path: string, headers: Record<string, string> = {}, legacy = false) {
  const client = new Client({ name: "fictional-doubao-test", version: "1" }, { versionNegotiation: { mode: legacy ? "legacy" : "auto" } });
  await client.connect(new StreamableHTTPClientTransport(new URL(baseURL + path), { requestInit: { headers } }));
  return client;
}

test("豆包工具发现可匿名读取定义，健康调用必须有真实账号凭据", async () => {
  const client = await mcpClient("/api/doubao/mcp");
  try {
    const tools = await client.listTools();
    for (const name of ["get_profile", "query_measurements", "query_meals", "query_energy", "query_training", "submit_record_operation"]) assert.ok(tools.tools.some(tool => tool.name === name));
    assert.equal(tools.tools.find(tool => tool.name === "get_profile")?._meta?.securitySchemes, undefined);
    await assert.rejects(() => client.callTool({ name: "get_profile", arguments: {} }));
  } finally { await client.close(); }
});

test("框架代理请求通过真实OAuth查询，新旧协议和无效凭据保持正确结果", async () => {
  const externalId = "fictional-framework-openid", flow = await grant(first, externalId);
  if (flow.result.refused) throw new Error();
  const tokens = await exchangeDoubaoToken(db, auth, config, flow.result.developerLoginCode);
  const endpoint = "/api/framework/doubao/mcp";
  const rejected = await fetch(baseURL + endpoint, { method: "POST", headers: {
    "content-type": "application/json", accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-03-26", "x-db-openid": externalId, "x-db-access-token": "fictional-invalid-token",
  }, body: JSON.stringify({ jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "get_profile", arguments: {} } }, null, 2) });
  assert.equal(rejected.status, 401);
  for (const legacy of [false, true]) {
    const client = await mcpClient(endpoint, { "x-db-openid": externalId, "x-db-access-token": tokens.data.access_token }, legacy);
    try {
      const profile = await client.callTool({ name: "get_profile", arguments: {} });
      assert.notEqual(profile.isError, true);
      const result = profile.structuredContent as { entities: Array<{ result_json: string }> };
      assert.equal(JSON.parse(result.entities[0].result_json).id, flow.userId);
      const measurements = await client.callTool({ name: "query_measurements", arguments: { from: "2026-11-01", to: "2026-11-02", timezone: "Asia/Shanghai" } });
      assert.notEqual(measurements.isError, true);
      assert.ok((measurements.structuredContent as { entities: unknown[] }).entities.length > 0);
    } finally { await client.close(); }
  }
});

test("豆包保留上下文不进入业务参数，连接检查及查询成功且原鉴权和未知字段校验保持", async () => {
  const externalId = "fictional-platform-context-openid", flow = await grant(first, externalId);
  if (flow.result.refused) throw new Error();
  const tokens = await exchangeDoubaoToken(db, auth, config, flow.result.developerLoginCode);
  const context = { from_mcp_call: true, _miniapp_permitted_data: { unused: "fictional-private-context" } };
  async function call(name: string, args: Record<string, unknown>, authenticated = true) {
    const response = await fetch(baseURL + "/api/framework/doubao/mcp", { method: "POST", headers: {
      "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25",
      ...(authenticated ? { "x-db-openid": externalId, "x-db-access-token": tokens.data.access_token } : {}),
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 24, method: "tools/call", params: { name, arguments: args } }) });
    return { status: response.status, body: await response.json() };
  }
  assert.equal((await call("authorize_formward", context, false)).status, 401);
  const authorized = await call("authorize_formward", context);
  assert.equal(authorized.status, 200); assert.notEqual(authorized.body.result.isError, true);
  assert.equal(authorized.body.result.structuredContent.connected, true);
  const profile = await call("get_profile", context);
  assert.notEqual(profile.body.result.isError, true);
  assert.equal(JSON.parse(profile.body.result.structuredContent.entities[0].result_json).id, flow.userId);
  const query = await call("query_measurements", { ...context, from: "2026-11-01", to: "2026-11-02", timezone: "Asia/Shanghai" });
  assert.notEqual(query.body.result.isError, true);
  assert.ok(query.body.result.structuredContent.entities.length > 0);
  assert.ok(!JSON.stringify(query.body).includes("fictional-private-context"));
  const invalid = await call("query_measurements", { ...context, from: null });
  assert.equal(invalid.body.result.isError, true);
  const unknown = await call("query_measurements", { ...context, unexpected_business_field: true });
  assert.equal(unknown.body.result.isError, true);
});

test("豆包 MCP 双协议查询、OpenID 不匹配、伪造令牌与撤销均按真实 OAuth 校验", async () => {
  const externalId = "fictional-mcp-openid", flow = await grant(first, externalId);
  if (flow.result.refused) throw new Error();
  const tokens = await exchangeDoubaoToken(db, auth, config, flow.result.developerLoginCode);
  for (const legacy of [false, true]) {
    const client = await mcpClient("/api/doubao/mcp", { "X-DB-OPENID": externalId, "X-DB-ACCESS-TOKEN": tokens.data.access_token }, legacy);
    try {
      const result = await client.callTool({ name: "get_profile", arguments: {} });
      assert.equal(result.isError, undefined);
      const structured = result.structuredContent as { entities: { entity_type: string; result_json: string }[] };
      assert.equal(structured.entities[0].entity_type, "formward_query_result");
      assert.equal(JSON.parse(structured.entities[0].result_json).id, flow.userId);
      const invalid = await client.callTool({ name: "query_measurements", arguments: { from: "invalid-date" } });
      assert.equal(invalid.isError, true);
      assert.equal(typeof (invalid.structuredContent as Record<string, unknown>)?.code, "number");
    } finally { await client.close(); }
  }
  for (const headers of [
    { "X-DB-OPENID": "fictional-different-openid", "X-DB-ACCESS-TOKEN": tokens.data.access_token },
    { "X-DB-OPENID": externalId, "X-DB-ACCESS-TOKEN": "fictional-invalid-access-token" },
  ]) {
    const client = await mcpClient("/api/doubao/mcp", headers);
    try { await assert.rejects(() => client.callTool({ name: "get_profile", arguments: {} })); }
    finally { await client.close(); }
  }
  const claims = JSON.parse(Buffer.from(tokens.data.access_token.split(".")[1], "base64url").toString());
  await revokeOauthConnection(db, flow.userId, claims[CONNECTION_CLAIM]);
  await assert.rejects(() => refreshDoubaoToken(db, auth, config, tokens.data.refresh_token), ApiError);
  const revoked = await mcpClient("/api/doubao/mcp", { "X-DB-OPENID": externalId, "X-DB-ACCESS-TOKEN": tokens.data.access_token });
  try { await assert.rejects(() => revoked.callTool({ name: "get_profile", arguments: {} })); }
  finally { await revoked.close(); }
});

test("原 GPT OAuth 和 MCP 保持独立，撤销豆包后原连接仍可查询账号", async () => {
  const callback = "https://fictional-existing-gpt.example.test/callback";
  const registration = await fetch(baseURL + "/api/auth/oauth2/register", { method: "POST", headers: { "content-type": "application/json", origin: baseURL }, body: JSON.stringify({ client_name: "fictional-existing-gpt", redirect_uris: [callback], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: "openid profile offline_access" }) });
  assert.equal(registration.status, 201);
  const clientId = (await registration.json()).client_id;
  const logged = await signIn(first), verifier = randomBytes(32).toString("base64url");
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: "code", scope: "openid profile offline_access", state: randomUUID(), code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", resource: baseURL + "/api/mcp" });
  const authorize = await fetch(baseURL + "/api/auth/oauth2/authorize?" + query, { headers: { cookie: logged.cookie }, redirect: "manual" });
  const consentUrl = authorize.headers.get("location") ?? (await authorize.json()).url;
  assert.equal(new URL(consentUrl, baseURL).pathname, "/oauth/consent");
  const consent = await fetch(baseURL + "/api/auth/oauth2/consent", { method: "POST", headers: { cookie: logged.cookie, origin: baseURL, "content-type": "application/json" }, body: JSON.stringify({ accept: true, oauth_query: new URL(consentUrl, baseURL).search.slice(1) }) });
  const code = new URL((await consent.json()).url).searchParams.get("code")!;
  const tokenResponse = await fetch(baseURL + "/api/auth/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: callback, resource: baseURL + "/api/mcp" }) });
  assert.equal(tokenResponse.status, 200);
  const gptToken = (await tokenResponse.json()).access_token;
  const flow = await grant(first, "fictional-independent-doubao");
  if (flow.result.refused) throw new Error();
  const doubaoTokens = await exchangeDoubaoToken(db, auth, config, flow.result.developerLoginCode);
  const claims = JSON.parse(Buffer.from(doubaoTokens.data.access_token.split(".")[1], "base64url").toString());
  await revokeOauthConnection(db, flow.userId, claims[CONNECTION_CLAIM]);
  const gpt = await mcpClient("/api/mcp", { Authorization: "Bearer " + gptToken });
  try {
    const result = await gpt.callTool({ name: "get_profile", arguments: {} });
    assert.equal((result.structuredContent as Record<string, unknown>)?.id, logged.userId);
    assert.equal("entities" in (result.structuredContent as Record<string, unknown>), false);
  } finally { await gpt.close(); }
});

test("豆包提交只生成可重复查询的预览，不直接写入身体记录", async () => {
  const externalId = "fictional-preview-openid", flow = await grant(first, externalId);
  if (flow.result.refused) throw new Error();
  const tokens = await exchangeDoubaoToken(db, auth, config, flow.result.developerLoginCode);
  const client = await mcpClient("/api/doubao/mcp", { "X-DB-OPENID": externalId, "X-DB-ACCESS-TOKEN": tokens.data.access_token });
  const previousCount = (await db.select().from(schema.measurement)).length;
  try {
    const args = { operationId: randomUUID(), items: [{ kind: "save_record", date: "2024-07-01", period: "daytime", fasting: true, weightKg: "74.20", bodyFatPercent: null, deviceLabel: "虚构验收秤" }] };
    const result = await client.callTool({ name: "submit_measurement_operation", arguments: args });
    assert.ok(!result.isError, JSON.stringify(result.structuredContent));
    const operation = result.structuredContent as Record<string, unknown>;
    assert.equal(typeof operation.confirmationUrl, "string");
    assert.ok(String(operation.confirmationUrl).startsWith(baseURL));
    const repeated = await client.callTool({ name: "submit_measurement_operation", arguments: args });
    assert.equal((repeated.structuredContent as Record<string, unknown>).id, operation.id);
    const status = await client.callTool({ name: "get_measurement_operation", arguments: { id: operation.id } });
    assert.ok(!status.isError);
    assert.equal((await db.select().from(schema.measurement)).length, previousCount);
  } finally { await client.close(); }
});
