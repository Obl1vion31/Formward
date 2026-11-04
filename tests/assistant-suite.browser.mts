import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import { seedAssistantFixture } from "./assistant-fixture.mjs";
import { localMeasurementDate } from "../src/features/measurements/entry-state";

// 不读取 .env.local。每次建立隔离数据库、虚构账号和临时应用端口。
const pg = new PGlite(), db = drizzle(pg, { schema });
await migrate(db, { migrationsFolder: "./drizzle" });
const fixture = await seedAssistantFixture(db, localMeasurementDate(new Date(), "Asia/Shanghai"));
const socket = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 10 });
await socket.start();
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve()));
const baseURL = `http://127.0.0.1:${port}`, databaseUrl = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?max=1`;
const folder = await mkdtemp(join(tmpdir(), "formward-assistant-")), configPath = join(folder, "fixture.json");
await writeFile(configPath, JSON.stringify({ ...fixture, baseURL, databaseUrl, isolatedFixture: "pglite" }), { mode: 0o600 });
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { PATH: process.env.PATH, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH, FONTCONFIG_FILE: process.env.FONTCONFIG_FILE, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: databaseUrl, BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: "fictional-assistant-browser-secret-more-than-32-characters", FORMWARD_TIMEZONE: "Asia/Shanghai", BLOB_READ_WRITE_TOKEN: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; child.stdout.on("data", chunk => { log += chunk; }); child.stderr.on("data", chunk => { log += chunk; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert.equal(child.exitCode, null, "隔离应用应持续运行");
    try { if ((await fetch(baseURL)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, "隔离应用启动超时");
  process.env.FORMWARD_ASSISTANT_CONFIG = configPath;
  await import("./assistant.browser.mjs");
} catch (failure) {
  const artifacts = process.env.FORMWARD_ASSISTANT_ARTIFACTS ?? ".codex/assistant/visual";
  await mkdir(artifacts, { recursive: true }); await writeFile(join(artifacts, "server-failure.log"), log); throw failure;
} finally {
  if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
  await socket.stop(); await new Promise(resolve => setImmediate(resolve)); await pg.close(); await unlink(configPath);
}
