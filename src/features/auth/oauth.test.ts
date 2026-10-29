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
import { CONNECTION_CLAIM, READ_SCOPE, WRITE_SCOPE, MEALS_READ_SCOPE, MEALS_WRITE_SCOPE, ENERGY_READ_SCOPE, ENERGY_WRITE_SCOPE, listOauthConnections, revokeOauthConnection } from "./oauth-connections";
import { decideMealOperation, readMealSnapshot } from "../meals/records";
import { oauthPageRequest } from "./oauth-pages";
import { createMcpEndpoint } from "../mcp/server";
import { listMeasurements } from "../measurements/records";
import { reviewRecordOperation } from "../records/operations";
import { reviewAiMeasurementOperation } from "../measurements/ai-operations";
import { initializeAccountOwner, manageAccount, unlockAccountAdmin } from "./account-management";

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

test("后台停用与 OAuth 刷新竞争后旧 JWT／刷新／审核全部失效，恢复重新连接不复活旧审核", async () => {
  const operator = { email: "operator@example.test", password: "fictional-operator-password" };
  const operatorId = (await provisionAccount(db, operator)).id;
  await initializeAccountOwner(db, operatorId);
  const logged = await login(operator), identity = await auth.api.getSession({ headers: new Headers({ cookie: logged.cookie }) });
  assert.ok(identity);
  const proof = { userId: operatorId, sessionId: identity.session.id, accessVersion: identity.session.accessVersion };
  await unlockAccountAdmin(db, proof, operator.password, "oauth-account-test");
  const subject = { email: "suspended@example.test", password: "fictional-subject-password" };
  await provisionAccount(db, subject);
  const connected = await connect(subject), client = await mcpClient(connected.tokens.access_token);
  try {
    const result = await client.callTool({ name: "submit_measurement_operation", arguments: { operationId: randomUUID(), items: [{ kind: "save_record", date: "2024-06-29", period: "evening", weightKg: "71.00", deviceLabel: "虚构秤" }] } });
    assert.ok(!result.isError);
    const preview = result.structuredContent as { id: string; revision: number };
    const [refresh] = await Promise.all([
      token({ grant_type: "refresh_token", client_id: connected.clientId, refresh_token: connected.tokens.refresh_token, resource: `${baseURL}/api/mcp` }),
      manageAccount(db, proof, connected.userId, "suspend", "虚构账号停用", randomUUID()),
    ]);
    assert.ok([200, 400].includes(refresh.status));
    const refreshed = await refresh.json();
    for (const access of [connected.tokens.access_token, refreshed.access_token].filter(Boolean)) {
      const denied = await fetch(`${baseURL}/api/mcp`, { method: "POST", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
      assert.equal(denied.status, 401);
    }
    await assert.rejects(reviewAiMeasurementOperation(db, connected.userId, preview.id, { kind: "confirm", revision: preview.revision }));
    await manageAccount(db, proof, connected.userId, "restore", "", randomUUID());
    assert.equal((await token({ grant_type: "refresh_token", client_id: connected.clientId, refresh_token: connected.tokens.refresh_token, resource: `${baseURL}/api/mcp` })).status, 400);
    await connect(subject);
    await assert.rejects(reviewAiMeasurementOperation(db, connected.userId, preview.id, { kind: "confirm", revision: preview.revision }));
    assert.equal((await listMeasurements(db, connected.userId)).length, 0);
  } finally { await client.close(); }
});

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
      const tools = await client.listTools(); assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ["authorize_formward", "get_meal_operation", "get_measurement_operation", "get_profile", "get_record_operation", "import_meal_images", "query_energy", "query_meals", "query_measurements", "search_foods", "submit_meal_operation", "submit_measurement_operation", "submit_record_operation"]);
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

test("MCP 来源缺失提示补填，明确留空可网页确认；工具说明要求先询问真实来源", async () => {
  const connected = await connect(), client = await mcpClient(connected.tokens.access_token);
  const before = await listMeasurements(db, connected.userId);
  try {
    const tools = await client.listTools(), submit = tools.tools.find(tool => tool.name === "submit_measurement_operation")!;
    assert.match(submit.description!, /用户未回答则先询问/);
    assert.match(JSON.stringify(submit.inputSchema), /sourceUnspecifiedConfirmed/);
    const missing = await client.callTool({ name: "submit_measurement_operation", arguments: { operationId: randomUUID(), items: [{ kind: "save_record", date: "2024-06-03", period: "evening", weightKg: "70.20" }] } });
    assert.ok(!missing.isError);
    const pending = missing.structuredContent as { id: string; needsUserInput: { field: string; code: string }[]; preview: { canConfirm: boolean } };
    assert.equal(pending.preview.canConfirm, false); assert.equal(pending.needsUserInput[0].field, "deviceLabel");
    assert.equal(pending.needsUserInput[0].code, "source_confirmation_required");
    assert.deepEqual(await listMeasurements(db, connected.userId), before);
    const empty = await client.callTool({ name: "submit_measurement_operation", arguments: { operationId: randomUUID(), items: [{ kind: "save_record", date: "2024-06-03", period: "evening", weightKg: "70.20", deviceLabel: null, sourceUnspecifiedConfirmed: true }] } });
    assert.ok(!empty.isError);
    const ready = empty.structuredContent as { id: string; revision: number; needsUserInput: unknown[] };
    assert.deepEqual(ready.needsUserInput, []);
    await reviewAiMeasurementOperation(db, connected.userId, ready.id, { kind: "confirm", revision: ready.revision });
    assert.equal((await listMeasurements(db, connected.userId)).find(record => record.recordDate === "2024-06-03")!.deviceLabel, null);
    const result = await client.callTool({ name: "get_measurement_operation", arguments: { id: ready.id } });
    assert.equal((result.structuredContent as Record<string, unknown>).status, "confirmed");
  } finally { await client.close(); }
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

test("饮食独立OAuth权限通过真实MCP预览确认，身体旧授权须重新同意，撤销阻止旧预览", async () => {
  const scopes = ["openid", "profile", "offline_access", MEALS_READ_SCOPE, MEALS_WRITE_SCOPE];
  const connected = await connect(credentials, scopes), client = await mcpClient(connected.tokens.access_token);
  const payload = () => ({ operationId: randomUUID(), actions: [{ kind: "save_meal", date: "2024-10-01", mealType: "午餐", notes: randomUUID(), items: [{ kind: "misc", name: "杂", sourceKind: "estimated", nutrition: { caloriesKcal: "400", proteinG: "20", carbsG: "50", fatG: "12" } }] }] });
  try {
    const search = await client.callTool({ name: "search_foods", arguments: {} }); assert.ok(!search.isError);
    assert.match((search.structuredContent as {foodLibraryRules:string}).foodLibraryRules,/组成与分量/);
    const definitions=await client.listTools();assert.match(definitions.tools.find(tool=>tool.name==="submit_meal_operation")!.description!,/不倒推或编造精确克数/);
    const bad=await client.callTool({name:"submit_meal_operation",arguments:{operationId:randomUUID(),actions:[{kind:"save_food",name:"虚构说明食材",baseQuantity:"100",unit:"g",nutrition:{caloriesKcal:"100",proteinG:"10",carbsG:"5",fatG:"4"},sourceKind:"estimated",basis:"用户今天吃过，熟重不可直接套用"}]}});
    assert.equal(bad.isError,true);assert.equal((bad.structuredContent as {error:{code:string}}).error.code,"food_description");
    const deniedBody = await client.callTool({ name: "query_measurements", arguments: {} }); assert.equal(deniedBody.isError, true);
    const result = await client.callTool({ name: "submit_meal_operation", arguments: payload() }); assert.ok(!result.isError, JSON.stringify(result.structuredContent));
    const op = result.structuredContent as { id: string; revision: number; status: string; confirmationUrl: string }; assert.equal(op.status, "pending"); assert.match(op.confirmationUrl, /\/dashboard\/meals\/review\//);
    const beforeCount = (await readMealSnapshot(db, connected.userId)).meals.length;
    await decideMealOperation(db, connected.userId, op.id, op.revision, "confirm"); assert.equal((await readMealSnapshot(db, connected.userId)).meals.length, beforeCount + 1);
    const query = await client.callTool({ name: "query_meals", arguments: { from: "2024-10-01", to: "2024-10-01" } }); assert.ok(!query.isError); assert.ok(Array.isArray((query.structuredContent as Record<string, unknown>)?.meals));
    const pending = await client.callTool({ name: "submit_meal_operation", arguments: payload() }), next = pending.structuredContent as { id: string; revision: number };
    const connections = await listOauthConnections(db, connected.userId), claim = JSON.parse(Buffer.from(connected.tokens.access_token.split(".")[1], "base64url").toString());
    const connection = connections.find(c => c.id === claim[CONNECTION_CLAIM])!; await revokeOauthConnection(db, connected.userId, connection.id);
    await assert.rejects(decideMealOperation(db, connected.userId, next.id, next.revision, "confirm"));
  } finally { await client.close(); }
  const old = await connect(), oldClient = await mcpClient(old.tokens.access_token);
  try { assert.equal((await oldClient.callTool({ name: "query_meals", arguments: {} })).isError, true); } finally { await oldClient.close(); }
  const readonly = await connect(credentials, ["openid", "profile", "offline_access", MEALS_READ_SCOPE]), readClient = await mcpClient(readonly.tokens.access_token);
  try { assert.equal((await readClient.callTool({ name: "submit_meal_operation", arguments: payload() })).isError, true); } finally { await readClient.close(); }
});


test("统一MCP使用真实OAuth混合提交，单类旧授权不能跨域写入，确认后幂等查询", async () => {
  const items = [{key:"body",kind:"save_record",date:"2025-01-04",period:"evening",weightKg:"72.10",deviceLabel:"虚构混合秤"},{key:"meal",kind:"save_meal",date:"2025-01-04",mealType:"虚构混合午餐",items:[{kind:"food",name:"虚构食品",sourceKind:"estimated",nutrition:{caloriesKcal:"150",proteinG:"10",carbsG:"20",fatG:"3"}}]}];
  const old = await connect(), oldClient = await mcpClient(old.tokens.access_token);
  try { assert.equal((await oldClient.callTool({name:"submit_record_operation",arguments:{operationId:randomUUID(),items}})).isError,true); } finally { await oldClient.close(); }
  const connected = await connect(credentials,[...fullScopes,MEALS_READ_SCOPE,MEALS_WRITE_SCOPE]), client = await mcpClient(connected.tokens.access_token);
  try {
    const raw = {operationId:randomUUID(),items}, response=await client.callTool({name:"submit_record_operation",arguments:raw});
    assert.ok(!response.isError,JSON.stringify(response.structuredContent));
    const operation=response.structuredContent as {id:string;revision:number;status:string;canConfirm:boolean;confirmationUrl:string};
    assert.equal(operation.status,"pending");assert.equal(operation.canConfirm,true);assert.match(operation.confirmationUrl,/dashboard\/ai\/operations/);
    assert.equal(((await client.callTool({name:"submit_record_operation",arguments:raw})).structuredContent as Record<string,unknown>)?.id,operation.id);
    await reviewRecordOperation(db,connected.userId,operation.id,{kind:"confirm",revision:operation.revision});
    assert.equal(((await client.callTool({name:"get_record_operation",arguments:{id:operation.id}})).structuredContent as Record<string,unknown>)?.status,"confirmed");
  } finally { await client.close(); }
});


test("消耗 OAuth 权限独立，旧连接与只读连接不能写；确认后查询且撤销立即阻止旧预览", async () => {
  const old = await connect(), oldClient = await mcpClient(old.tokens.access_token);
  try { assert.equal((await oldClient.callTool({ name: "query_energy", arguments: {} })).isError, true); }
  finally { await oldClient.close(); }
  const connected = await connect(credentials, ["openid", "profile", "offline_access", ENERGY_READ_SCOPE, ENERGY_WRITE_SCOPE]);
  const client = await mcpClient(connected.tokens.access_token);
  try {
    const queried = await client.callTool({ name: "query_energy", arguments: { from: "2024-09-15", to: "2024-09-15" } }); assert.ok(!queried.isError);
    const submitted = await client.callTool({ name: "submit_record_operation", arguments: { operationId: randomUUID(), items: [{ key: "energy", kind: "save_energy_day", date: "2024-09-15", restingKcal: "2000", activeKcal: "800" }] } }); assert.ok(!submitted.isError, JSON.stringify(submitted.structuredContent));
    const operation = submitted.structuredContent as { id: string; revision: number };
    assert.ok(!(await client.callTool({ name: "get_record_operation", arguments: { id: operation.id } })).isError);
    await reviewRecordOperation(db, connected.userId, operation.id, { kind: "confirm", revision: operation.revision });
    const saved = await client.callTool({ name: "query_energy", arguments: { from: "2024-09-15", to: "2024-09-15" } });
    assert.equal(Number((saved.structuredContent as { days: { totalKcal: string }[] }).days[0].totalKcal), 2800);
    const pending = await client.callTool({ name: "submit_record_operation", arguments: { operationId: randomUUID(), items: [{ key: "activity", kind: "save_activity", date: "2024-09-16", name: "虚构跑步", caloriesKcal: "800" }] } });
    const next = pending.structuredContent as { id: string; revision: number };
    await revokeOauthConnection(db, connected.userId, connected.claims[CONNECTION_CLAIM]);
    await assert.rejects(reviewRecordOperation(db, connected.userId, next.id, { kind: "confirm", revision: next.revision }));
  } finally { await client.close(); }
  const readonly = await connect(credentials, ["openid", "profile", "offline_access", ENERGY_READ_SCOPE]), readClient = await mcpClient(readonly.tokens.access_token);
  try { assert.ok(!(await readClient.callTool({ name: "query_energy", arguments: {} })).isError); assert.equal((await readClient.callTool({ name: "submit_record_operation", arguments: { operationId: randomUUID(), items: [{ key: "activity", kind: "save_activity", date: "2024-09-17", name: "虚构", caloriesKcal: "800" }] } })).isError, true); }
  finally { await readClient.close(); }
});

async function recordState(userId: string) {
  const result: Record<string, unknown> = {};
  for (const table of ["measurements", "measurement_sources", "measurement_operations", "measurement_events", "foods", "meals", "meal_items", "meal_operations", "meal_events", "energy_days", "activities", "energy_profiles", "energy_sources", "energy_operations", "energy_events", "record_operations"]) {
    result[table] = (await pg.query(`SELECT * FROM ${table} WHERE user_id=$1`, [userId])).rows;
  }
  return result;
}
function requestedScopes(result: { _meta?: Record<string, unknown> }) {
  const challenges = result._meta?.["mcp/www_authenticate"] as string[] | undefined;
  assert.ok(challenges?.length);
  return challenges[0].match(/scope="([^"]*)"/)![1].split(" ");
}
const allRecordScopes = [READ_SCOPE, MEALS_READ_SCOPE, ENERGY_READ_SCOPE, WRITE_SCOPE, MEALS_WRITE_SCOPE, ENERGY_WRITE_SCOPE];

test("已有提交权限的连接缺新类别权限时一次申请全部记录读写，不改变授权或生成预览", async () => {
  const connected = await connect(), client = await mcpClient(connected.tokens.access_token), before = await recordState(connected.userId);
  const consent = (await listOauthConnections(db, connected.userId)).find(row => row.id === connected.claims[CONNECTION_CLAIM])!;
  try {
    const denied = await client.callTool({ name: "query_energy", arguments: {} });
    assert.equal(denied.isError, true);
    for (const scope of [...allRecordScopes, "profile", "offline_access"]) assert.ok(requestedScopes(denied).includes(scope), scope);
    const authorization = await client.callTool({ name: "authorize_formward", arguments: {} });
    assert.equal(authorization.isError, true);
    for (const scope of allRecordScopes) assert.ok(requestedScopes(authorization).includes(scope));
    assert.deepEqual(await recordState(connected.userId), before);
    assert.deepEqual((await listOauthConnections(db, connected.userId)).find(row => row.id === consent.id)?.scopes, consent.scopes);
  } finally { await client.close(); }
});

test("只读查询补齐全部读取而不请求提交；用户明确完整接入才申请全部读写", async () => {
  const connected = await connect(credentials, ["openid", "profile", "offline_access", READ_SCOPE]), client = await mcpClient(connected.tokens.access_token);
  try {
    const denied = await client.callTool({ name: "query_energy", arguments: {} }), requested = requestedScopes(denied);
    for (const scope of [READ_SCOPE, MEALS_READ_SCOPE, ENERGY_READ_SCOPE]) assert.ok(requested.includes(scope));
    for (const scope of [WRITE_SCOPE, MEALS_WRITE_SCOPE, ENERGY_WRITE_SCOPE]) assert.ok(!requested.includes(scope));
    const full = await client.callTool({ name: "authorize_formward", arguments: {} });
    for (const scope of allRecordScopes) assert.ok(requestedScopes(full).includes(scope));
  } finally { await client.close(); }
});

test("完整授权的连接检查可重复且不读写健康事实或预览，声明准确且撤销后失效", async () => {
  const connected = await connect(second, ["openid", "profile", "offline_access", ...allRecordScopes]);
  const before = await recordState(connected.userId), client = await mcpClient(connected.tokens.access_token);
  try {
    const definitions = await client.listTools(), tool = definitions.tools.find(tool => tool.name === "authorize_formward")!;
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.deepEqual((tool._meta?.securitySchemes as { scopes: string[] }[])[0].scopes, allRecordScopes);
    for (let i = 0; i < 2; i++) {
      const status = await client.callTool({ name: "authorize_formward", arguments: {} });
      assert.ok(!status.isError);
      assert.deepEqual(status.structuredContent, { connected: true, access: "read_and_submit_previews", domains: ["measurements", "meals", "energy"], requiresWebConfirmation: true });
    }
    assert.equal((await client.callTool({ name: "authorize_formward", arguments: { userId: randomUUID() } })).isError, true);
    assert.deepEqual(await recordState(connected.userId), before);
    await revokeOauthConnection(db, connected.userId, connected.claims[CONNECTION_CLAIM]);
    await assert.rejects(client.callTool({ name: "authorize_formward", arguments: {} }));
  } finally { await client.close(); }
});

test("同一客户端在一次网页同意后从部分授权升级完整读写，旧访问令牌不自动扩权", async () => {
  const connected = await connect(), before = await recordState(connected.userId);
  const request = await authorize(connected.clientId, connected.cookie, ["openid", "profile", "offline_access", ...allRecordScopes]);
  assert.match(request.redirectUrl!, /\/oauth\/consent\?/);
  const info = await oauthPageRequest(db, auth, request.query);
  assert.ok(info); for (const scope of allRecordScopes) assert.ok(info.scopes.some(item => item.scope === scope));
  const accepted = await json("oauth2/consent", { accept: true, oauth_query: request.query }, connected.cookie);
  assert.equal(accepted.status, 200);
  const code = new URL((await accepted.json()).url).searchParams.get("code")!;
  const exchanged = await token({ grant_type: "authorization_code", client_id: connected.clientId, code, code_verifier: request.verifier, redirect_uri: callback, resource: `${baseURL}/api/mcp` });
  assert.equal(exchanged.status, 200);
  const upgraded = await mcpClient((await exchanged.json()).access_token), old = await mcpClient(connected.tokens.access_token);
  try {
    assert.ok(!(await upgraded.callTool({ name: "authorize_formward", arguments: {} })).isError);
    assert.equal((await old.callTool({ name: "authorize_formward", arguments: {} })).isError, true);
    assert.deepEqual(await recordState(connected.userId), before);
  } finally { await upgraded.close(); await old.close(); }
});
