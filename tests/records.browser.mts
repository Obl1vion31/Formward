import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import { provisionAccount } from "../src/features/auth/provision";
import { createAiToken } from "../src/features/auth/ai-tokens";
import { saveMealImage } from "../src/features/meals/images";
import { checkUnifiedReview, checkReviewMaintenance } from "./record-review.browser.mjs";
async function freePort() { const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening"); const port = (server.address() as { port: number }).port; await new Promise<void>(resolve => server.close(() => resolve())); return port; }
const pg = new PGlite(), db = drizzle(pg, { schema }), port = await freePort(), dbPort = await freePort(), baseURL = `http://127.0.0.1:${port}`;
await migrate(db, { migrationsFolder: "./drizzle" });
const account = { email: "record-review@example.test", password: "fictional-record-review-password" };
const owner = await provisionAccount(db, { ...account, name: "虚构统一审核" }), token = await createAiToken(db, owner.id, "虚构HTTP", "write");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6WQAAAAASUVORK5CYII=", "base64"), images: string[] = [];
for (let i = 0; i < 2; i++) images.push((await saveMealImage(db, owner.id, Buffer.concat([png, Buffer.from(String(i))]), { fileName: `虚构图片${i}.png`, source: "manual", actorId: owner.id }, async () => {})).id);
const socket = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: dbPort }); await socket.start();
const child = spawn("pnpm", ["start", "--hostname", "127.0.0.1", "--port", String(port)], { env: { ...process.env, TZ: "UTC", DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres?max=1`, BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: "fictional-record-review-secret-of-more-than-32-characters", FORMWARD_TIMEZONE: "Asia/Shanghai", NODE_ENV: "production" }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
let logs = ""; child.stdout.on("data", data => { logs += data; }); child.stderr.on("data", data => { logs += data; });
let browser: { close(): Promise<void> } | undefined;
try {
  for (let i = 0; i < 100; i++) { if (child.exitCode !== null) throw new Error("隔离服务退出"); try { if ((await fetch(baseURL)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "/tmp/formward-browser-check/node_modules/playwright/index.mjs");
  browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--no-sandbox", "--use-angle=swiftshader"] });
  const context = await (browser as Awaited<ReturnType<typeof chromium.launch>>).newContext({ locale: "zh-CN", timezoneId: "Asia/Shanghai", viewport: { width: 1440, height: 844 } });
  assert.equal((await context.request.post(`${baseURL}/api/auth/sign-in/email`, { headers: { Origin: baseURL }, data: account })).status(), 200);
  const page = await context.newPage(), errors: string[] = []; page.on("pageerror", (error: Error) => errors.push(error.message));
  for (const id of images) await page.route(`**/api/meal-images/${id}`, async (route: { fulfill(options: unknown): Promise<void> }) => route.fulfill({ status: 200, contentType: "image/png", body: png }));
  try {
    const check = process.env.FORMWARD_REVIEW_MAINTENANCE_ONLY === "1" ? checkReviewMaintenance : checkUnifiedReview;
    await check({ baseURL, context, page, token: token.rawToken, images, date: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10) });
    assert.deepEqual(errors, []);
  }
  catch (error) { await page.screenshot({ path: "/tmp/formward-records-failure.png", fullPage: true }); await writeFile("/tmp/formward-records-failure.html", await page.content()); throw error; }
  await context.close();
} catch (error) { await writeFile("/tmp/formward-records-server.log", logs); throw error; }
finally { await browser?.close(); if (child.exitCode === null) { process.kill(-child.pid!, "SIGTERM"); await once(child, "exit"); } await socket.stop(); await new Promise(resolve => setImmediate(resolve)); await pg.close(); }
