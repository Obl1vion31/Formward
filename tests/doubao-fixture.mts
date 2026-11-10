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
import * as schema from "../src/db/schema";
import { createAuth } from "../src/features/auth/auth";
import { provisionAccount } from "../src/features/auth/provision";
import { startDoubaoLogin } from "../src/features/doubao/oauth";

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
