import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve, sep } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import * as schema from "../src/db/schema";
import { createAuth } from "../src/features/auth/auth";
import { provisionAccount } from "../src/features/auth/provision";
import { callbackDoubao, exchangeDoubaoToken, startDoubaoLogin } from "../src/features/doubao/oauth";

// 仅本机虚构账号。平台身份替身只存在于此隔离 fixture，正式入口始终调用官方 OpenAPI。
const baseURL = "http://127.0.0.1:3419";
const config = { origin: baseURL, appId: "fictional-doubao-app", appSecret: "fictional-app-secret", secret: "fictional-doubao-fixture-secret-at-least-32-characters", openApiBase: "https://api.doubao-dev.com" };
const pg = new PGlite(), db = drizzle(pg, { schema });
await migrate(db, { migrationsFolder: "./drizzle" });
await provisionAccount(db, { email: "doubao-preview@example.test", password: "fictional-doubao-password" });
const socket = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 10 });
await socket.start();
const auth = createAuth(db, { baseURL, secret: config.secret, rateLimit: false });
const release = process.env.FORMWARD_TEST_RELEASE ? resolve(process.env.FORMWARD_TEST_RELEASE) : undefined;
if (release) assert.ok(release.startsWith(resolve(".codex/regional-releases") + sep) && release.endsWith(sep + "standalone"), "只使用本工作区的已构建产物");
const child = spawn(process.execPath, release ? [resolve(release, "server.js")] : ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3419"], {
  ...(release ? { cwd: release } : {}),
  env: { ...process.env, PORT: "3419", HOSTNAME: "127.0.0.1", DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?max=1`, BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: config.secret, FORMWARD_REGIONAL: "0", FORMWARD_SINGLE_WEB: "0", FORMWARD_DOUBAO_ENABLED: "1", FORMWARD_DOUBAO_APP_ID: config.appId, FORMWARD_DOUBAO_APP_SECRET: config.appSecret, FORMWARD_DOUBAO_ORIGIN: baseURL },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", chunk => process.stdout.write(chunk));
child.stderr.on("data", chunk => process.stderr.write(chunk));
let ready = false;
for (let attempt = 0; attempt < 100; attempt++) {
  assert.equal(child.exitCode, null, "隔离 Next 服务保持运行");
  try { ready = (await fetch(baseURL + "/api/auth/get-session", { signal: AbortSignal.timeout(1000) })).ok; } catch {}
  if (ready) break;
  await new Promise(resolve => setTimeout(resolve, 100));
}
assert.ok(ready, "隔离生产构建已就绪");
const controller = createServer(async (req, res) => {
  if (req.url === "/start") {
    const start = await startDoubaoLogin(db, auth, config, "fictional-code", (async () => Response.json({ code: 0, data: { open_id: "fictional-fixture-" + randomUUID() } })) as typeof fetch);
    res.writeHead(302, { location: start.authorizationUrl }); res.end(); return;
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end('<!doctype html><html lang="zh-CN"><title>Formward 隔离验收</title><h1>豆包登录隔离验收</h1><p>仅虚构账号，不连接正式数据库或真实豆包账号。</p><a href="/start">开始登录验收</a></html>');
});
controller.listen(3420, "127.0.0.1");
await once(controller, "listening");
console.info("隔离验收入口：http://127.0.0.1:3420；虚构账号 doubao-preview@example.test / fictional-doubao-password");
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  controller.close();
  if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
  await socket.stop();
  // Socket的close回调经setImmediate排队，先排空事务清理，再关闭WASM数据库。
  await new Promise<void>(resolve => setImmediate(() => setImmediate(resolve)));
  await pg.close();
}
process.once("SIGTERM", () => void close()); process.once("SIGINT", () => void close());

if (process.env.FORMWARD_DOUBAO_HTTP_CHECK === "1") {
  try {
    const externalId = "fictional-production-http-openid";
    const start = await startDoubaoLogin(db, auth, config, "fictional-code", (async () => Response.json({ code: 0, data: { open_id: externalId } })) as typeof fetch);
    const login = await fetch(baseURL + "/api/auth/sign-in/email", { method: "POST", headers: { origin: baseURL, "content-type": "application/json" }, body: JSON.stringify({ email: "doubao-preview@example.test", password: "fictional-doubao-password" }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const authorize = await fetch(start.authorizationUrl, { headers: { cookie }, redirect: "manual" });
    assert.ok([200, 302].includes(authorize.status));
    const target = authorize.headers.get("location") ?? (await authorize.json()).url;
    assert.match(target, /\/doubao\/consent\?/);
    const consent = await fetch(baseURL + "/api/auth/oauth2/consent", { method: "POST", headers: { cookie, origin: baseURL, "content-type": "application/json" }, body: JSON.stringify({ accept: true, oauth_query: new URL(target).search.slice(1) }) });
    assert.equal(consent.status, 200);
    const callback = await callbackDoubao(db, auth, config, new URL((await consent.json()).url).searchParams);
    assert.equal(callback.refused, false);
    if (callback.refused) throw new Error("虚构授权未通过");
    const tokens = await exchangeDoubaoToken(db, auth, config, callback.developerLoginCode);
    const [account] = await db.select({ id: schema.user.id }).from(schema.user);
    const invalid = await fetch(baseURL + "/api/doubao/mcp", { method: "POST", headers: {
      "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26",
      "x-db-openid": externalId, "x-db-access-token": "fictional-invalid-token",
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_profile", arguments: {} } }, null, 2) });
    assert.equal(invalid.status, 401, "实际Next入口拒绝无效凭据，不能返回请求复制异常503");
    const platformContext = { from_mcp_call: true, _miniapp_permitted_data: { unused: "fictional-private-context" } };
    for (const mode of ["auto", "legacy"] as const) {
      const client = new Client({ name: "fictional-production-http", version: "1" }, { versionNegotiation: { mode } });
      await client.connect(new StreamableHTTPClientTransport(new URL(baseURL + "/api/doubao/mcp"), { requestInit: { headers: { "x-db-openid": externalId, "x-db-access-token": tokens.data.access_token } } }));
      try {
        const tools = await client.listTools();
        assert.equal(tools.tools.length, 21);
        assert.ok(tools.tools.some(tool => tool.name === "preview_meal"));
        assert.ok(!JSON.stringify(tools.tools).includes('"exclusiveMinimum":'));
        const profile = await client.callTool({ name: "get_profile", arguments: {} });
        assert.notEqual(profile.isError, true);
        const entities = (profile.structuredContent as { entities: Array<{ result_json: string }> }).entities;
        assert.equal(JSON.parse(entities[0].result_json).id, account.id);
        const records = await client.callTool({ name: "query_measurements", arguments: { from: "2026-11-01", to: "2026-11-02", timezone: "Asia/Shanghai" } });
        assert.notEqual(records.isError, true);
        assert.ok((records.structuredContent as { entities: unknown[] }).entities.length > 0);
        const connected = await client.callTool({ name: "authorize_formward", arguments: platformContext });
        assert.notEqual(connected.isError, true);
        assert.equal((connected.structuredContent as { connected: boolean }).connected, true);
        const contextualRecords = await client.callTool({ name: "query_measurements", arguments: { ...platformContext, from: "2026-11-01", to: "2026-11-02", timezone: "Asia/Shanghai" } });
        assert.notEqual(contextualRecords.isError, true);
        assert.ok((contextualRecords.structuredContent as { entities: unknown[] }).entities.length > 0);
        assert.ok(!JSON.stringify(contextualRecords).includes("fictional-private-context"));
        const invalidDate = await client.callTool({ name: "query_measurements", arguments: { ...platformContext, from: null } });
        assert.equal(invalidDate.isError, true, "平台上下文兼容不能放过非法业务参数");
        const unknownField = await client.callTool({ name: "query_measurements", arguments: { ...platformContext, unexpected_business_field: true } });
        assert.equal(unknownField.isError, true, "其他未知字段继续拒绝");
        const meal = await client.callTool({ name: "preview_meal", arguments: {
          ...platformContext, operationId: "fictional-production-lunch-" + mode,
          date: "2026-11-10", mealType: "午餐", foods: [{ name: "虚构测试午餐", quantity: "2", unit: "份", caloriesKcal: "600", proteinG: "0", sourceKind: "estimated", basis: "两份合计估计600 kcal，油量不确定。" }, { name: "虚构茶", quantity: "250", unit: "ml" }],
        } });
        assert.notEqual(meal.isError, true);
        const preview = meal.structuredContent as { id: string; status: string; canConfirm: boolean; confirmationUrl: string; rows: Array<{ meal: { items: Array<{ nutrition: { caloriesKcal: string; proteinG: string; carbsG: string | null } }> } }> };
        assert.equal(preview.status, "pending"); assert.equal(preview.canConfirm, true);
        assert.equal(preview.rows[0].meal.items[0].nutrition.caloriesKcal, "600");
        assert.equal(preview.rows[0].meal.items[0].nutrition.proteinG, "0");
        assert.equal(preview.rows[0].meal.items[0].nutrition.carbsG, null);
        assert.equal(preview.rows[0].meal.items.length, 2);
        assert.equal(new URL(preview.confirmationUrl).origin, baseURL);
        const page = await fetch(preview.confirmationUrl, { headers: { cookie } });
        assert.equal(page.status, 200);
        const html = await page.text();
        assert.ok(html.includes("虚构测试午餐") && html.includes("确认"));
        if (process.env.FORMWARD_DOUBAO_PREVIEW === "1") console.info("虚构饮食预览：" + preview.confirmationUrl);
        const changes = await client.callTool({ name: "preview_meal_changes", arguments: { ...platformContext, operationId: "fictional-production-patch-" + mode, previewId: preview.id, revision: 1, notes: "虚构局部修改，保留食物和营养。" } });
        assert.notEqual(changes.isError, true);
        const edited = changes.structuredContent as { id: string; revision: number; confirmationUrl: string; operationType: string };
        assert.equal(edited.operationType, "record");
        const changedPage = await fetch(edited.confirmationUrl, { headers: { cookie } });
        assert.equal(changedPage.status, 200);
        assert.ok((await changedPage.text()).includes("虚构局部修改"));
        const state = await client.callTool({ name: "get_record_operation", arguments: { id: edited.id, view: "status" } });
        assert.notEqual(state.isError, true);
        assert.equal("rows" in (state.structuredContent as Record<string, unknown>), false);
        const energy = await client.callTool({ name: "preview_energy", arguments: { ...platformContext, operationId: "fictional-production-energy-" + mode, date: "2026-11-10", restingKcal: "1800", activeKcal: "0", activityMode: "total" } });
        assert.notEqual(energy.isError, true);
        assert.equal("energySnapshot" in (energy.structuredContent as Record<string, unknown>), false);
        for (const tool of ["query_measurements", "query_meals", "query_energy", "query_training"]) {
          const summary = await client.callTool({ name: tool, arguments: { ...platformContext, range: "last7", view: "summary", timezone: "Asia/Shanghai" } });
          assert.notEqual(summary.isError, true, tool);
          const entities = (summary.structuredContent as { entities: Array<{ result_json: string }> }).entities;
          assert.equal(JSON.parse(entities[0].result_json).page.hasMore, false);
        }
      } finally { await client.close(); }
    }
    assert.equal((await db.select({ id: schema.measurement.id }).from(schema.measurement)).length, 0);
    assert.equal((await db.select({ id: schema.meal.id }).from(schema.meal)).length, 0);
    assert.equal((await db.select({ id: schema.energyDay.id }).from(schema.energyDay)).length, 0);
    console.info(JSON.stringify({ check: "doubao-production-http", passed: true, toolCount: 21, protocols: ["auto", "legacy"], invalidCredentialsRejected: true, profileOwnerMatched: true, measurementQueryPassed: true, platformContextCompatible: true, simpleMealPreviewPassed: true, mealChangesPassed: true, energyPreviewPassed: true, boundedQueriesPassed: true, previewPagePassed: true, businessValidationPreserved: true, healthRecordsWritten: 0 }));
  } finally { if (process.env.FORMWARD_DOUBAO_PREVIEW !== "1") await close(); }
}
