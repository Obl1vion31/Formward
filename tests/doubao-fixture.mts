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
  await socket.stop(); await pg.close();
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
    for (const mode of ["auto", "legacy"] as const) {
      const client = new Client({ name: "fictional-production-http", version: "1" }, { versionNegotiation: { mode } });
      await client.connect(new StreamableHTTPClientTransport(new URL(baseURL + "/api/doubao/mcp"), { requestInit: { headers: { "x-db-openid": externalId, "x-db-access-token": tokens.data.access_token } } }));
      try {
        assert.equal((await client.listTools()).tools.length, 18);
        const profile = await client.callTool({ name: "get_profile", arguments: {} });
        assert.notEqual(profile.isError, true);
        const entities = (profile.structuredContent as { entities: Array<{ result_json: string }> }).entities;
        assert.equal(JSON.parse(entities[0].result_json).id, account.id);
        const records = await client.callTool({ name: "query_measurements", arguments: { from: "2026-11-01", to: "2026-11-02", timezone: "Asia/Shanghai" } });
        assert.notEqual(records.isError, true);
        assert.ok((records.structuredContent as { entities: unknown[] }).entities.length > 0);
      } finally { await client.close(); }
    }
    assert.equal((await db.select({ id: schema.measurement.id }).from(schema.measurement)).length, 0);
    console.info(JSON.stringify({ check: "doubao-production-http", passed: true, toolCount: 18, protocols: ["auto", "legacy"], invalidCredentialsRejected: true, profileOwnerMatched: true, measurementQueryPassed: true, healthRecordsWritten: 0 }));
  } finally { await close(); }
}
