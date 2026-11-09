import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { createServer as createProbe } from "node:net";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "../src/db/client";
import * as schema from "../src/db/schema";
import { provisionAccount } from "../src/features/auth/provision";
import { bindPersonalSource } from "../src/features/data-sources/mutations";
import { randomUUID } from "node:crypto";
import { delayedTrainingDatabase } from "./training-delayed-db";
import { encryptCredential } from "../src/features/data-sources/credentials";

const pg = new PGlite(), db = drizzle(pg, { schema });
await migrate(db, { migrationsFolder: "./drizzle" });
const password = "fictional-garmin-" + randomUUID(), suffix = randomUUID().slice(0, 8), users: { id: string; email: string; password: string }[] = [];
process.env.FORMWARD_DATA_SOURCE_ACCESS = "personal";
process.env.FORMWARD_DATA_SOURCE_ENCRYPTION_KEY = "c".repeat(64);
for (const name of ["a", "b"]) {
  const email = "garmin-" + name + "-" + suffix + "@example.test", user = await provisionAccount(db as unknown as Database, { email, password, name: "虚构 Garmin 用户 " + name });
  await db.update(schema.personalProfile).set({ onboardingStep: "complete" }).where(eq(schema.personalProfile.userId, user.id));
  users.push({ id: user.id, email, password });
}
await bindPersonalSource(db as unknown as Database, users[1].id, { apiKey: "fictional-garmin-b", version: 0 });
const [legacyConnection] = await db.select().from(schema.dataConnection).where(eq(schema.dataConnection.userId, users[1].id));
const legacyCredential = encryptCredential("fictional-garmin-b", users[1].id, legacyConnection.id);
await db.update(schema.dataConnection).set({ credential: legacyCredential }).where(eq(schema.dataConnection.id, legacyConnection.id));
const socket = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 10 }); await socket.start();
const delayed = await delayedTrainingDatabase(socket.getServerConn(), /\bdata_connections\b/i);
const control = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/state") {
      const state = [];
      for (const owner of users) {
        const connections = await db.select().from(schema.dataConnection).where(eq(schema.dataConnection.userId, owner.id));
        const days = await db.select().from(schema.energyDay).where(eq(schema.energyDay.userId, owner.id));
        state.push({ id: owner.id, connections: connections.map(row => ({ id: row.id, version: row.version, encrypted: /^(v1|v2)\./.test(row.credential) && !row.credential.includes("fictional"), legacyUnchanged: owner.id === users[1].id ? row.credential === legacyCredential : undefined, lastSuccessAt: row.lastSuccessAt })), totals: days.map(row => row.totalKcal) });
      }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(state)); return;
    }
    if (request.method === "POST" && request.url === "/version-conflict") {
      const [connection] = await db.select().from(schema.dataConnection).where(eq(schema.dataConnection.userId, users[0].id));
      await db.update(schema.dataConnection).set({ version: connection.version + 1 }).where(eq(schema.dataConnection.id, connection.id));
      response.writeHead(204).end(); return;
    }
    response.writeHead(404).end();
  } catch { response.writeHead(500).end("Isolated fixture control failed"); }
});
await new Promise<void>(done => control.listen(0, "127.0.0.1", done));
const controlURL = "http://127.0.0.1:" + (control.address() as { port: number }).port;
const probe = createProbe(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
const port = (probe.address() as { port: number }).port; await new Promise<void>(done => probe.close(() => done()));
const baseURL = "http://127.0.0.1:" + port, folder = resolve(process.env.FORMWARD_SOURCES_ARTIFACTS ?? ".codex/data-sources-browser");
await mkdir(folder, { recursive: true });
const fixture = { baseURL, controlURL, delayControlURL: delayed.controlURL, users, pid: process.pid, isolatedFixture: true, fictional: true };
const configPath = folder + "/config.json"; await writeFile(configPath, JSON.stringify(fixture), { mode: 0o600 });
const release = process.env.FORMWARD_TEST_RELEASE ? resolve(process.env.FORMWARD_TEST_RELEASE) : null;
const entry = release ? [release + "/server.js"] : ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)];
const child = spawn(process.execPath, ["--import", resolve("tests/garmin-personal-fixture.mjs"), ...entry], {
  env: { PATH: process.env.PATH, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", HOSTNAME: "127.0.0.1", PORT: String(port), DATABASE_URL: "postgresql://postgres:postgres@" + delayed.connection + "/postgres?max=1", BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: "fictional-source-secret-longer-than-32-characters", FORMWARD_TIMEZONE: "Asia/Shanghai", FORMWARD_DATA_SOURCE_ACCESS: "personal", FORMWARD_DATA_SOURCE_ENCRYPTION_KEY: "c".repeat(64), FORMWARD_GARMIN_FIXTURE: "1", CRON_SECRET: "fictional-garmin-cron-secret" }, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; child.stdout.on("data", chunk => { log += chunk; }); child.stderr.on("data", chunk => { log += chunk; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) { assert.equal(child.exitCode, null, log); try { if ((await fetch(baseURL)).ok) { ready = true; break; } } catch {} await new Promise(done => setTimeout(done, 250)); }
  assert.ok(ready, "Isolated source app did not start");
  process.env.FORMWARD_SOURCES_CONFIG = configPath;
  if (process.env.FORMWARD_SOURCES_PREVIEW !== "1") await import("./data-sources-check.browser.mjs");
  else { console.log(JSON.stringify({ baseURL, users, fictional: true })); await new Promise<void>(done => { process.once("SIGINT", done); process.once("SIGTERM", done); }); }
} catch (error) { await writeFile(folder + "/server-failure.log", log, { mode: 0o600 }); throw error; }
finally {
  if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
  await new Promise<void>(done => control.close(() => done())); await delayed.close(); await socket.stop(); await new Promise(done => setImmediate(done)); await pg.close();
}
