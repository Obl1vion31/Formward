import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "../src/db/client";
import * as schema from "../src/db/schema";
import { seedTrainingFixture } from "./training-fixture";
const pg = new PGlite(), db = drizzle(pg, { schema });
await migrate(db, { migrationsFolder: "./drizzle" });
const fixture = await seedTrainingFixture(db as unknown as Database);
const socket = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 10 }); await socket.start();
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve()));
const baseURL = "http://127.0.0.1:" + port, databaseUrl = "postgresql://postgres:postgres@" + socket.getServerConn() + "/postgres?max=1";
const folder = process.env.FORMWARD_TRAINING_ARTIFACTS ?? ".codex/training-browser";
await mkdir(folder, { recursive: true });
const configPath = folder + "/config.json"; await writeFile(configPath, JSON.stringify({ ...fixture, baseURL, databaseUrl, isolatedFixture: true }), { mode: 0o600 });
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { PATH: process.env.PATH, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: databaseUrl, BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: "fictional-training-secret-longer-than-32-characters", FORMWARD_TIMEZONE: "Asia/Shanghai" }, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; child.stdout.on("data", chunk => { log += chunk; }); child.stderr.on("data", chunk => { log += chunk; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) { assert.equal(child.exitCode, null); try { if ((await fetch(baseURL)).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.ok(ready, "独立训练测试服务启动超时");
  process.env.FORMWARD_TRAINING_CONFIG = configPath;
  if (process.env.FORMWARD_TRAINING_PREVIEW !== "1") await import("./training-check.browser.mjs");
  else { console.log(JSON.stringify({ baseURL, email: fixture.email, password: fixture.password, configPath, fictional: true })); await new Promise(() => {}); }
} catch (error) { await writeFile(folder + "/server-failure.log", log); throw error; }
finally { if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); } await socket.stop(); await pg.close(); }
