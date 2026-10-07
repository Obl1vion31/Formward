import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { provisionAccount } from "../src/features/auth/provision";
import { previewMeasurementTsv } from "../src/features/imports/measurements";
import { saveImportedMeasurements, saveReportedMeasurements } from "../src/features/measurements/records";
import { applyHistoricalCompletion, previewHistoricalCompletion, type HistoricalCompletionRequest } from "../src/features/measurements/completion";
import { applyHistoricalInitialization, previewHistoricalInitialization } from "../src/features/measurements/initialization";
import * as schema from "../src/db/schema";
import { localMeasurementDate } from "../src/features/measurements/entry-state";

// 完全隔离的 HTTP 验收；开发模式另用临时源码副本，不影响用户的 3000 服务。
const development = process.env.FORMWARD_MEASUREMENTS_DEV === "1";
const projectRoot = resolve(import.meta.dirname, "..");
const serverDirectory = development ? await mkdtemp(join(tmpdir(), "formward-measurements-dev-")) : projectRoot;
if (development) {
  await Promise.all(["src", "package.json", "pnpm-lock.yaml", "tsconfig.json", "next-env.d.ts", "next.config.ts", "postcss.config.mjs", "AGENTS.md"].map((name) => cp(join(projectRoot, name), join(serverDirectory, name), { recursive: true })));
  await Promise.all(["node_modules", "public"].map((name) => symlink(join(projectRoot, name), join(serverDirectory, name), "dir")));
}
const pg = new PGlite();
const db = drizzle(pg, { schema });
await migrate(db, { migrationsFolder: "./drizzle" });
const first = { email: "measurement-http@example.test", password: "fictional-http-password-first" };
const second = { email: "other-http@example.test", password: "fictional-http-password-second" };
const initializedAccount = { email: "initialized-http@example.test", password: "fictional-initialized-password" };
const initializedOwner = await provisionAccount(db, initializedAccount);
const entryAccount = { email: "entry-http@example.test", password: "fictional-entry-password" };
const entryOwner = await provisionAccount(db, entryAccount);
await db.update(schema.user).set({ createdAt: new Date("2024-02-27T00:00:00Z") }).where(eq(schema.user.id, entryOwner.id));
const today = localMeasurementDate(new Date(), "Asia/Shanghai");
const priorDate = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) - offset * 86_400_000).toISOString().slice(0, 10);
await saveReportedMeasurements(db, { userId: entryOwner.id, actorId: entryOwner.id, requestKey: "8".repeat(64), entryChannel: "api", deviceLabel: "虚构默认秤-应用", records: [3, 2, 1].flatMap(offset => [
  { analysisDate: priorDate(offset), period: "daytime" as const, weightKg: "70.00", bodyFatPercent: "20.00", fasting: true },
  { analysisDate: priorDate(offset), period: "evening" as const, weightKg: "70.50", bodyFatPercent: "20.40", fasting: false },
]) });
await saveReportedMeasurements(db, { userId: entryOwner.id, actorId: entryOwner.id, requestKey: "7".repeat(64), entryChannel: "api", records: [4, 5].map(offset => ({ analysisDate: priorDate(offset), period: "daytime" as const, weightKg: "71.00", bodyFatPercent: null, fasting: offset === 4 ? null : false })) });
const owner = await provisionAccount(db, first);
await provisionAccount(db, second);
const fixtureTsv = [
  "测量时间\t体重(kg)\tBMI\t体脂率(%)",
  "2024-12-01 11:20:00\t80.00\t25.50\t26.20",
  "2025-03-01 20:10:00\t79.20\t25.10\t26.10",
  ...[18, 19, 20].flatMap(day => [`2025-06-${day} 11:20:00\t77.00\t24.50\t25.50`, `2025-06-${day} 20:10:00\t77.50\t24.50\t25.70`]),
  "2025-07-01 11:20:00\t75.30\t24.00\t25.00",
  "2025-07-02 20:10:00\t75.40\t24.00\t25.10",
  ...[3, 4, 5, 6, 7, 9, 12, 13].map((day) => `2025-07-${String(day).padStart(2, "0")} 20:10:00\t76.10\t24.40\t25.90`),
  "2025-07-08 11:20:00\t76.20\t24.20\t25.20",
  "2025-07-08 20:10:00\t75.90\t24.10\t25.10",
  "2025-07-10 11:20:00\t75.23\t24.11\t25.25",
  "2025-07-10 20:10:00\t75.80\t24.29\t25.60",
  "2025-07-11 00:30:00\t75.85\t24.31\t25.65",
  "2025-07-11 11:40:00\t74.80\t23.97\t",
].join("\n");
const preview = previewMeasurementTsv(fixtureTsv, "Asia/Shanghai", true);
await saveImportedMeasurements(db, { userId: owner.id, actorId: owner.id, fileDigest: preview.fileDigest, sourceLabel: "fictional-http.tsv", captureChannel: "file", records: preview.records });
const completionRequest: HistoricalCompletionRequest = {
  operationId: "fictional-browser-completion", range: { start: "2025-07-01", end: "2025-07-13" }, trainingRange: { start: "2025-06-17", end: "2025-07-14" },
  deviceLabel: "虚构蓝牙体重秤-虚构连接应用", records: [
    { analysisDate: "2025-07-14", period: "daytime", weightKg: "74.60", bodyFatPercent: "24.90", fasting: true, timezone: "Asia/Shanghai", assumedTime: "08:00" },
    { analysisDate: "2025-07-14", period: "evening", weightKg: "75.10", bodyFatPercent: "25.20", fasting: false, timezone: "Asia/Shanghai", assumedTime: "20:00" },
  ],
};
const completionPreview = await previewHistoricalCompletion(db, owner.id, completionRequest);
await applyHistoricalCompletion(db, { userId: owner.id, actorId: owner.id, request: completionRequest, digest: completionPreview.digest });
await saveReportedMeasurements(db, { userId: initializedOwner.id, actorId: initializedOwner.id, requestKey: "9".repeat(64), entryChannel: "api", records: [5, 7, 12].flatMap((day, index) => [
  { analysisDate: `2025-08-${String(day).padStart(2, "0")}`, period: "daytime" as const, weightKg: ["80.00", "82.00", "83.00"][index], bodyFatPercent: ["24.00", "25.00", "26.00"][index], fasting: true },
  { analysisDate: `2025-08-${String(day).padStart(2, "0")}`, period: "evening" as const, weightKg: ["81.00", "83.00", "85.00"][index], bodyFatPercent: ["24.40", "25.40", "26.60"][index], fasting: false },
]) });
const initializationRequest = { operationId: "fictional-browser-initialization", range: { start: "2025-08-03", end: "2025-08-13" } };
const initializationPreview = await previewHistoricalInitialization(db, initializedOwner.id, initializationRequest);
if (initializationPreview.alreadyApplied) throw new Error("预期新初始化");
await applyHistoricalInitialization(db, { userId: initializedOwner.id, actorId: initializedOwner.id, request: initializationRequest, digest: initializationPreview.digest });
const socket = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 10 });
await socket.start();
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const address = probe.address();
assert.ok(address && typeof address === "object");
const port = address.port;
await new Promise<void>((resolve) => probe.close(() => resolve()));
const baseURL = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [join(projectRoot, "node_modules/next/dist/bin/next"), development ? "dev" : "start", ...(development ? ["--webpack"] : []), "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: serverDirectory,
  env: { ...process.env, NODE_ENV: development ? "development" : "production", DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, BETTER_AUTH_SECRET: "fictional-http-secret-at-least-32-characters", BETTER_AUTH_URL: baseURL },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout?.on("data", (chunk) => { logs += chunk; });
child.stderr?.on("data", (chunk) => { logs += chunk; });

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(logs);
    try { ready = (await fetch(`${baseURL}/api/auth/get-session`, { signal: AbortSignal.timeout(500) })).ok; } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, `${development ? "development" : "production"} 测试服务启动`);
  const guarded = await fetch(`${baseURL}/dashboard`, { redirect: "manual" });
  assert.equal(guarded.status, 307);
  assert.ok((guarded.headers.get("location") ?? "").endsWith("/"));
  console.log("通过：未登录不能读取身体记录。");

  async function login(credentials: typeof first, ip: string) {
    const response = await fetch(`${baseURL}/api/auth/sign-in/email`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: baseURL, "x-forwarded-for": ip }, body: JSON.stringify(credentials),
    });
    assert.equal(response.status, 200);
    return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
  }
  const firstCookie = await login(first, "192.0.2.71");
  const populated = await fetch(`${baseURL}/dashboard?user_id=someone-else`, { headers: { Cookie: firstCookie } });
  assert.equal(populated.status, 200);
  const html = await populated.text();
  assert.ok(html.includes("身体记录"));
  assert.ok(!html.includes("把一天的变化"));
  assert.ok(html.includes("30D"));
  assert.ok(html.includes("最新空腹摘要"));
  assert.ok(html.includes("最近记录"));
  assert.ok(!html.includes("缺测连接"));
  assert.ok(html.includes("非空腹"));
  assert.ok(html.includes("2025-07-11 00:30:00"));
  assert.ok(html.includes("2025-07-10"));
  assert.ok(html.includes("74.80"));
  assert.ok(html.includes("Asia/Shanghai"));
  assert.ok(html.includes("待选择"));
  assert.ok(html.includes("空腹"));
  assert.ok(html.includes("estimated"));
  assert.ok(html.includes("assumed"));
  assert.ok(!html.includes("fictional-http-password"));
  console.log("通过：有记录账号显示摘要、空腹主趋势、最近记录及归属／来源展示数据。");

  const secondCookie = await login(second, "192.0.2.72");
  const other = await fetch(`${baseURL}/dashboard?user_id=${owner.id}`, { headers: { Cookie: secondCookie } });
  const otherHtml = await other.text();
  assert.equal(other.status, 200);
  assert.ok(otherHtml.includes(second.email));
  assert.ok(!otherHtml.includes("2025-07-11 00:30:00"));
  assert.ok(!otherHtml.includes("74.80"));
  assert.ok(otherHtml.includes("暂无测量记录"));
  console.log("通过：跨账号参数不能读到测量，无记录账号仍显示空状态。");
  if (process.env.FORMWARD_MEASUREMENTS_BROWSER === "1") {
    const { checkMeasurementsBrowser } = await import("./measurements.browser.mjs");
    await checkMeasurementsBrowser({ baseURL, first, second, initializedAccount, entryAccount, today });
  }
} finally {
  if (child.exitCode === null && !child.signalCode) {
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    await once(child, "exit");
    clearTimeout(timer);
  }
  await socket.stop();
  // Socket 包的断连清理由 setImmediate 调度；排空后再关闭 WASM 数据库。
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
  await pg.close();
  if (development) await rm(serverDirectory, { recursive: true, force: true });
}
