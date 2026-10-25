import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import { provisionAccount } from "../src/features/auth/provision";
import { createAiToken } from "../src/features/auth/ai-tokens";
import { submitEnergyOperation, decideEnergyOperation } from "../src/features/activities/records";
import { saveMeasurementDay } from "../src/features/measurements/editing";
import { addCalendarDays } from "../src/features/measurements/calendar";
import { checkMaintenance } from "./maintenance-check.browser.mjs";
import { checkMobile } from "./mobile-check.browser.mjs";
import { checkMealDayCompletion } from "./meal-day-check.browser.mjs";
import { checkChartInteractions } from "./chart-interactions.browser.mjs";
import { checkEnergy } from "./energy-check.browser.mjs";
import { checkLatestRecords } from "./latest-records-check.browser.mjs";
async function freePort() { const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening"); const port = (server.address() as { port: number }).port; await new Promise<void>(resolve => server.close(() => resolve())); return port; }
const pg = new PGlite(), db = drizzle(pg, { schema }), port = await freePort(), dbPort = await freePort(), baseURL = `http://127.0.0.1:${port}`;
await migrate(db, { migrationsFolder: "./drizzle" });
const account = { email: "energy-browser@example.test", password: "fictional-energy-browser-password" };
const owner = await provisionAccount(db, { ...account, name: "虚构消耗验收" }), token = await createAiToken(db, owner.id, "虚构消耗HTTP", "write");
const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
for (let i = -8; i <= 0; i++) await saveMeasurementDay(db, { userId: owner.id, actorId: owner.id }, { operationId: randomUUID(), date: addCalendarDays(today, i), timezone: "Asia/Shanghai", periods: { daytime: { weightKg: String(70 - i * .05), bodyFatPercent: null, fasting: true, deviceLabel: "虚构秤" } } });
for (let i = -8; i < 0; i++) { const op = await submitEnergyOperation(db, { userId: owner.id, origin: "manual" }, { operationId: randomUUID(), actions: [{ kind: "save_energy_day", date: addCalendarDays(today, i), ...(i === -1 ? { totalKcal: "2600" } : { restingKcal: "2000", activeKcal: "800" }) }] }); await decideEnergyOperation(db, owner.id, op.id, op.revision, "confirm"); }
const socket = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: dbPort }); await socket.start();
const child = spawn("pnpm", ["start", "--hostname", "127.0.0.1", "--port", String(port)], { env: { ...process.env, TZ: "UTC", DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres?max=1`, BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: "fictional-energy-browser-secret-more-than-32-characters", FORMWARD_TIMEZONE: "Asia/Shanghai", NODE_ENV: "production" }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
let logs = ""; child.stdout.on("data", data => { logs += data; }); child.stderr.on("data", data => { logs += data; });
let browser: { close(): Promise<void> } | undefined;
await mkdir("/tmp/formward-energy-visual", { recursive: true });
try {
  for (let i = 0; i < 100; i++) { if (child.exitCode !== null) throw new Error("隔离服务退出"); try { if ((await fetch(baseURL)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "/tmp/formward-browser-check/node_modules/playwright/index.mjs");
  browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--no-sandbox", "--use-angle=swiftshader"] });
  const context = await (browser as Awaited<ReturnType<typeof chromium.launch>>).newContext({ locale: "zh-CN", timezoneId: "Asia/Shanghai", viewport: { width: 1440, height: 1000 } });
  assert.equal((await context.request.post(`${baseURL}/api/auth/sign-in/email`, { headers: { Origin: baseURL }, data: account })).status(), 200);
  const page = await context.newPage(), errors: string[] = []; page.on("pageerror", (error: Error) => errors.push(error.message));
  try { if(process.env.FORMWARD_MAINTENANCE_ONLY==="1"){await checkMaintenance({baseURL,context,page,token:token.rawToken,today,db,userId:owner.id});} else if (process.env.FORMWARD_MEAL_DAY_ONLY === "1") { await checkMealDayCompletion({ baseURL, context, page, token: token.rawToken, today }); } else { await checkLatestRecords({ baseURL, context, page, token: token.rawToken, today }); if (process.env.FORMWARD_CHART_INTERACTIONS_ONLY === "1") { await checkChartInteractions({ baseURL, page, artifacts: "/tmp/formward-energy-visual" }); } else if (process.env.FORMWARD_LATEST_RECORDS_ONLY !== "1") { await checkEnergy({ baseURL, context, page, token: token.rawToken, today });
    const touch = await (browser as Awaited<ReturnType<typeof chromium.launch>>).newContext({ locale: "zh-CN", timezoneId: "Asia/Shanghai", viewport: { width: 390, height: 640 }, hasTouch: true, isMobile: true, storageState: await context.storageState() });
    try { const touchPage = await touch.newPage(); touchPage.on("pageerror", (error: Error) => errors.push(error.message)); await touchPage.goto(`${baseURL}/dashboard`); await touchPage.locator(`[data-overview-date="${today}"]`).tap(); assert.equal(await touchPage.locator("dialog[aria-labelledby]").count(), 0); await touchPage.getByRole("button", { name: "查看记录 →", exact: true }).tap(); await touchPage.locator("dialog[aria-labelledby]").waitFor(); await touchPage.getByRole("button", { name: "关闭编辑", exact: true }).click(); await touchPage.locator("dialog[aria-labelledby]").waitFor({ state: "hidden" }); assert.equal(await touchPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const svg = touchPage.getByRole("group", { name: "双层日期关联图", exact: true });
      await svg.scrollIntoViewIfNeeded(); const box = await svg.boundingBox(); const client = await touch.newCDPSession(touchPage);
      const send = (type: string, x: number, y: number) => client.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
      const sx = box!.x + box!.width * .4, sy = Math.min(600, box!.y + 90);
      await send("touchStart", sx, sy); for (let i = 1; i <= 5; i++) await send("touchMove", sx + i * 15, sy); await send("touchEnd", sx + 75, sy);
      assert.equal(await touchPage.locator("dialog[aria-labelledby]").count(), 0);
      await touchPage.evaluate(() => scrollTo(0,0)); const verticalBox = await svg.boundingBox(); const vy = Math.min(540, verticalBox!.y + 60); const beforeScroll = await touchPage.evaluate(() => scrollY);
      await send("touchStart", sx, vy); for (let i = 1; i <= 6; i++) await send("touchMove", sx, vy - i * 18); await send("touchEnd", sx, vy - 108);
      await touchPage.waitForTimeout(200); assert.ok(await touchPage.evaluate(() => scrollY) > beforeScroll);
      await client.detach(); } finally { await touch.close(); }
    await checkMobile({ baseURL, context, page, today, token: token.rawToken }); }
    } assert.deepEqual(errors, []); }
  catch (error) { await page.screenshot({ path: "/tmp/formward-energy-visual/failure.png", fullPage: true }); await writeFile("/tmp/formward-energy-visual/failure.html", await page.content()); throw error; }
  await context.close();
} catch (error) { await writeFile("/tmp/formward-energy-visual/server.log", logs); throw error; }
finally { await browser?.close(); if (child.exitCode === null) { process.kill(-child.pid!, "SIGTERM"); await once(child, "exit"); } await socket.stop(); await new Promise(resolve => setImmediate(resolve)); await pg.close(); }
