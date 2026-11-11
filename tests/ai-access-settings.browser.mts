import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "../src/db/client";
import * as schema from "../src/db/schema";
import { createAuth } from "../src/features/auth/auth";
import { authenticateAi } from "../src/features/auth/ai-tokens";
import { requireOauthConnection } from "../src/features/auth/oauth-connections";
import { seedAiAccessFixture, fixtureAiConnection } from "./ai-access-fixture";
import { delayedTrainingDatabase } from "./training-delayed-db";

const artifacts = resolve(process.env.FORMWARD_AI_ACCESS_ARTIFACTS ?? ".codex/ai-access/browser");
await mkdir(artifacts, { recursive: true });
const pg = new PGlite(), local = drizzle(pg, { schema }), db = local as unknown as Database;
await migrate(local, { migrationsFolder: "./drizzle" });
const fixture = await seedAiAccessFixture(db);
const socket = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 10 }); await socket.start();
const delayed = await delayedTrainingDatabase(socket.getServerConn(), /\b(ai_tokens|oauth_connections|measurement_operations|meal_operations|record_operations)\b/i);
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening"); const port = (probe.address() as { port: number }).port;
await new Promise<void>(done => probe.close(() => done()));
const baseURL = `http://127.0.0.1:${port}`, secret = "fictional-ai-access-browser-secret-more-than-32";
const auth = createAuth(db, { baseURL, secret, rateLimit: false });
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: `postgresql://postgres:postgres@${delayed.connection}/postgres?max=1`, BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: secret, FORMWARD_REGIONAL: "0", FORMWARD_SINGLE_WEB: "0", FORMWARD_TIMEZONE: "Asia/Shanghai" }, stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = ""; child.stdout?.on("data", value => serverLog += value); child.stderr?.on("data", value => serverLog += value);
const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
const engine = process.env.FORMWARD_AI_ACCESS_BROWSER ?? "chromium";
const browser = await playwright[engine].launch({ headless: true });
const errors: string[] = [], failures: string[] = [], checks: string[] = [], screenshots: string[] = [], layout: unknown[] = [];
type Context = Awaited<ReturnType<typeof browser.newContext>>;
type Page = Awaited<ReturnType<Context["newPage"]>>;
async function login(account: { email: string; password: string }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Shanghai", reducedMotion: "reduce" });
  // tsx 的 keepNames 辅助函数只服务于测试回调序列化，不进入应用。
  await context.addInitScript({ content: "window.__name = (target) => target;" });
  const response = await auth.handler(new Request(baseURL + "/api/auth/sign-in/email", { method: "POST", headers: { Origin: baseURL, "Content-Type": "application/json" }, body: JSON.stringify(account) }));
  assert.equal(response.status, 200);
  await context.addCookies(response.headers.getSetCookie().map(value => { const [name, ...rest] = value.split(";")[0].split("="); return { name, value: rest.join("="), url: baseURL, httpOnly: true, sameSite: "Lax" as const }; }));
  const page = await context.newPage(); page.on("pageerror", (error: Error) => errors.push(error.message));
  page.on("response", (response: { status(): number; url(): string }) => { if (response.status() >= 500) failures.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  return { context, page };
}
async function open(page: Page) { await page.goto(baseURL + "/dashboard/ai"); await page.locator("[data-ai-access-ready]:visible").waitFor(); await page.waitForLoadState("networkidle"); }
async function shot(page: Page, name: string) { const file = `${engine}-${name}.png`; await page.screenshot({ path: join(artifacts, file) }); screenshots.push(file); }
async function fit(page: Page) {
  const result = await page.evaluate(() => {
    const root = document.querySelector("[data-ai-access-ready]")!;
    const visible = (node: Element) => node.checkVisibility();
    const controls = [...root.querySelectorAll("summary,button,input,select")].filter(visible).map(node => ({ label: node.textContent?.trim() || node.getAttribute("aria-label"), height: node.getBoundingClientRect().height, font: parseFloat(getComputedStyle(node).fontSize), tag: node.tagName }));
    const tables = [...root.querySelectorAll("table")].filter(visible).map(node => ({ width: node.getBoundingClientRect().width, columnGap: getComputedStyle(node.querySelector("td")!).paddingRight, rowBottom: getComputedStyle(node.querySelector("td")!).paddingBottom, rows: [...node.querySelectorAll("tbody tr")].map(row => [...row.children].map(cell => ({ x: cell.getBoundingClientRect().x, y: cell.getBoundingClientRect().y, height: cell.getBoundingClientRect().height, text: cell.textContent }))) }));
    return { overflow: document.documentElement.scrollWidth > innerWidth, controls, tables };
  });
  assert.equal(result.overflow, false, "页面不得横向溢出");
  assert.ok(result.controls.every((control: { height: number }) => control.height >= 43.9), "所有可见操作至少44px");
  assert.ok(result.controls.filter((control: { tag: string }) => ["INPUT", "SELECT"].includes(control.tag)).every((control: { font: number }) => control.font >= 16));
  layout.push({ viewport: page.viewportSize(), result });
}
try {
  for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(baseURL)).status === 200) break; } catch {} if (attempt === 99) throw Error("隔离服务未启动"); await new Promise(done => setTimeout(done, 200)); }
  const { context, page } = await login(fixture.account);
  const empty = await login(fixture.empty), typical = await login(fixture.typical);
  if (process.env.FORMWARD_AI_ACCESS_LOADING_ONLY !== "1") {
  await open(page);
  assert.equal(await page.locator("[data-ai-submissions]").getAttribute("open"), null);
  assert.equal(await page.getByLabel("令牌名称", { exact: true }).isVisible(), false);
  assert.equal(await page.getByRole("heading", { name: "接入操作", exact: true }).count(), 0);
  const partial = page.locator(`[data-connection-id="${fixture.gpt.id}"]`).first();
  assert.deepEqual(await partial.locator("tbody tr").nth(1).locator("td").allTextContents(), ["查询未授权", "提交预览未授权"]);
  assert.equal(await page.locator(`[data-connection-id="${fixture.readonly.id}"]`).first().getByText("只读", { exact: true }).isVisible(), true);
  await page.locator("[data-ai-submissions]>summary").click();
  const history = page.locator("[data-ai-submissions]");
  assert.equal(await history.locator("li").count(), 7); assert.ok(!(await history.textContent())!.includes("初始化"));
  await page.getByLabel("筛选发起来源").selectOption("doubao"); assert.equal(await history.locator("li").count(), 2);
  await page.getByLabel("筛选发起来源").selectOption("chatgpt"); await page.getByLabel("筛选审核状态").selectOption("confirmed");
  assert.equal(await history.getByText("没有符合筛选条件的提交。", { exact: true }).isVisible(), true);
  await page.getByLabel("筛选发起来源").selectOption("all"); assert.equal(await history.locator("li").count(), 1);
  await page.getByLabel("筛选审核状态").selectOption("pending"); await page.getByLabel("筛选发起来源").selectOption("chatgpt");
  const pendingLink = history.locator("li a").first(); await pendingLink.click(); await page.waitForURL(new RegExp("/dashboard/ai/operations/")); await page.waitForLoadState("networkidle");
  await page.goBack(); await page.locator("[data-ai-access-ready]:visible").waitFor(); await page.waitForLoadState("networkidle");
  checks.push("默认折叠、双筛选、空结果、来源署名、原审核入口与浏览器返回");
  if (await history.getAttribute("open") === null) await page.locator("[data-ai-submissions]>summary").click();
  await page.setViewportSize({ width: 390, height: 640 }); await history.evaluate((node: Element) => node.scrollIntoView({ block: "start" })); await shot(page, "submissions-mobile");
  await page.setViewportSize({ width: 1440, height: 900 }); await history.scrollIntoViewIfNeeded(); await shot(page, "submissions-desktop");
  await open(page);
  const doubao = page.locator(`[data-connection-id="${fixture.doubao.id}"]`).first();
  await doubao.locator(":scope>details>summary").click();
  await doubao.getByRole("button", { name: "撤销连接", exact: true }).click(); await page.getByRole("button", { name: "取消", exact: true }).click();
  await requireOauthConnection(db, fixture.userId, fixture.doubao.id);
  const failOnce = async (route: { request(): { method(): string }; abort(): Promise<void>; continue(): Promise<void> }) => { if (route.request().method() === "POST") await route.abort(); else await route.continue(); };
  await page.route("**/dashboard/ai", failOnce);
  await doubao.getByRole("button", { name: "撤销连接", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "撤销连接", exact: true }).click();
  await page.getByText("操作未完成，请稍后重试。", { exact: true }).waitFor(); await requireOauthConnection(db, fixture.userId, fixture.doubao.id); await page.unroute("**/dashboard/ai", failOnce);
  await doubao.getByRole("button", { name: "撤销连接", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "撤销连接", exact: true }).click();
  await page.getByText("连接已撤销。", { exact: true }).waitFor(); await assert.rejects(requireOauthConnection(db, fixture.userId, fixture.doubao.id), /撤销/);
  await page.reload(); await page.locator("[data-ai-access-ready]:visible").waitFor(); await page.waitForLoadState("networkidle");
  const doubaoProvider = page.locator('[data-ai-provider="doubao"]'); assert.equal(await doubaoProvider.getByText("已撤销", { exact: true }).first().isVisible(), true);
  assert.equal(await doubaoProvider.getByLabel("豆包可申请权限", { exact: true }).isVisible(), true);
  checks.push("撤销取消、网络失败留在原处并重试、实际Server Action、即时拒绝、刷新后历史连接");
  await page.getByText("高级接入 · 手动令牌与 HTTP", { exact: true }).click();
  await page.getByLabel("令牌名称", { exact: true }).fill("虚构新建令牌"); await page.getByRole("button", { name: "创建令牌", exact: true }).click();
  const raw = page.getByLabel("新令牌原文", { exact: true }); await raw.waitFor(); const token = await raw.inputValue();
  assert.match(token, /^fw_ai_/); await authenticateAi(db, "Bearer " + token, true);
  assert.equal(await page.getByLabel("新建令牌，仅显示一次").evaluate((node: Element) => node === document.activeElement), true);
  await page.getByText("高级接入 · 手动令牌与 HTTP", { exact: true }).click();
  await page.getByText("高级接入 · 手动令牌与 HTTP", { exact: true }).click(); assert.equal(await page.getByLabel("新令牌原文").count(), 0);
  assert.ok(!(await page.content()).includes(token)); checks.push("手动令牌创建与实际鉴权、一次性原文聚焦与关闭清除");
  await fixtureAiConnection(db, fixture.userId, "虚构的特别长的客户端名称用于验证手机与电脑完整自然换行 Long client name for layout verification");
  for (const theme of ["light", "dark"]) for (const [width, height] of [[320, 560], [390, 560], [390, 640], [430, 780], [844, 390], [1100, 780], [1440, 900]]) {
    await typical.page.setViewportSize({ width, height }); await open(typical.page); await typical.page.evaluate((value: string) => { document.documentElement.dataset.theme = value; }, theme);
    await typical.page.evaluate(() => window.scrollTo(0, 0)); await fit(typical.page); await shot(typical.page, `${theme}-${width}x${height}`);
    const table = typical.page.locator("table").first(); const columns = await table.locator("tbody tr").first().locator("th,td").evaluateAll((nodes: Element[]) => nodes.map(node => node.getBoundingClientRect().y));
    assert.ok(Math.max(...columns) - Math.min(...columns) <= 1, "正常字号保持三列同排");
  }
  for (const [target, name] of [[empty, "empty"], [{ page, context }, "multiple-long"]] as const) for (const width of [320, 390, 1440]) {
    await target.page.setViewportSize({ width, height: 780 }); await open(target.page); await fit(target.page); await shot(target.page, `${name}-${width}`);
  }
  for (const width of [320, 390, 1440]) {
    await typical.page.setViewportSize({ width, height: 780 }); await open(typical.page);
    await typical.page.evaluate(() => { const root = document.querySelector("[data-ai-access-ready]")!; const nodes = [root, ...root.querySelectorAll("*")]; const sizes = nodes.map(node => parseFloat(getComputedStyle(node).fontSize)); nodes.forEach((node, index) => (node as HTMLElement).style.fontSize = sizes[index] * 2 + "px"); });
    await fit(typical.page); await shot(typical.page, `text-200-${width}`);
  }
  await open(empty.page); const chatgpt = empty.page.locator('[data-ai-provider="chatgpt"]');
  await chatgpt.locator("summary").click(); await chatgpt.getByRole("button", { name: "复制 MCP 地址", exact: true }).click();
  await chatgpt.locator('[role="status"],[role="alert"]').first().waitFor();
  await chatgpt.getByRole("button", { name: "复制授权指令", exact: true }).focus(); await empty.page.keyboard.press("Escape");
  assert.equal(await chatgpt.locator("details").getAttribute("open"), null); assert.equal(await chatgpt.locator("summary").evaluate((node: Element) => node === document.activeElement), true);
  checks.push("双主题七种视口、正常三列、空账号、多连接、长名称、200%文字、复制反馈与Escape焦点恢复");
  }
  // 实际数据库代理延迟；记录首帧至数据接管的全部稳定锚点，不向生产代码加入等待。
  const frames: { time: number; ready: boolean; anchors: { key: string; x: number; y: number }[] }[] = [];
  await typical.page.setViewportSize({ width: 390, height: 640 });
  await typical.page.addInitScript(() => {
    (window as unknown as { aiFrames: unknown[] }).aiFrames = [];
    const start = performance.now(); function record() {
      const root = [...document.querySelectorAll(".ai-page")].find(node => node.checkVisibility());
      if (root) (window as unknown as { aiFrames: unknown[] }).aiFrames.push({ time: performance.now() - start, ready: root.hasAttribute("data-ai-access-ready"), anchors: [...root.querySelectorAll("h1,h2,[data-ai-provider] h3,table thead th,table tbody th,summary")].filter(node => node.checkVisibility()).map((node, index) => { const box = node.getBoundingClientRect(); return { key: node.textContent?.trim() + ":" + index, x: box.x, y: box.y }; }) });
      if (performance.now() - start < 12000) requestAnimationFrame(record);
    } requestAnimationFrame(record);
  });
  for (const wait of [0, 220]) {
    await fetch(delayed.controlURL, { method: "POST", body: JSON.stringify({ delayMs: wait }) });
    await typical.page.goto(baseURL + "/dashboard/ai", { waitUntil: "commit" });
    await typical.page.locator(".ai-page").waitFor(); await shot(typical.page, `loading-${wait}-first`);
    await typical.page.locator("[data-ai-access-ready]:visible").waitFor(); await typical.page.waitForTimeout(100);
    const sequence: typeof frames = await typical.page.evaluate(() => (window as unknown as { aiFrames: typeof frames }).aiFrames); frames.push(...sequence);
    await writeFile(join(artifacts, `${engine}-loading-${wait}-raw.json`), JSON.stringify(sequence, null, 2)); await shot(typical.page, `loading-${wait}-ready`);
    const final = sequence.at(-1)!;
    const headerKeys = ["AI 接入:0", "AI 连接:1"];
    const metadataFrames = sequence.filter((frame: typeof frames[number]) => frame.anchors.some(anchor => anchor.key.startsWith("豆包")));
    assert.ok(metadataFrames.length, "必须观察到真实连接结构");
    let maxDelta = 0;
    for (const frame of sequence) for (const key of headerKeys) {
      const start = frame.anchors.find(anchor => anchor.key === key), end = final.anchors.find(anchor => anchor.key === key);
      assert.ok(start && end, "首帧必需标题存在且可见"); maxDelta = Math.max(maxDelta, Math.abs(start.x - end.x), Math.abs(start.y - end.y));
    }
    for (const frame of metadataFrames) for (const anchor of frame.anchors) {
      const end = final.anchors.find(item => item.key === anchor.key); if (end) maxDelta = Math.max(maxDelta, Math.abs(anchor.x - end.x), Math.abs(anchor.y - end.y));
    }
    assert.ok(maxDelta <= 1, `稳定布局锚点偏移 ${maxDelta}px`);
    checks.push(`数据库延迟${wait}ms：${sequence.length}帧，标题及连接接管最大偏移${maxDelta}px`);
    await writeFile(join(artifacts, `${engine}-loading-${wait}.json`), JSON.stringify({ maxDelta, sequence }, null, 2)); await shot(typical.page, `loading-${wait}-ready`);
  }
  await fetch(delayed.controlURL, { method: "POST", body: JSON.stringify({ delayMs: 0 }) });
  await writeFile(join(artifacts, `${engine}-frames.json`), JSON.stringify(frames, null, 2));
  await fetch(delayed.controlURL, { method: "POST", body: JSON.stringify({ delayMs: 220 }) });
  await typical.page.goto(baseURL + "/dashboard/ai", { waitUntil: "commit" });
  const duringRead = typical.page.locator('[data-ai-provider="doubao"]'); await duringRead.waitFor();
  await duringRead.getByText("连接详情", { exact: true }).click(); await typical.page.locator("[data-ai-submissions]>summary").click();
  await typical.page.locator("[data-ai-access-ready]:visible").waitFor();
  assert.notEqual(await duringRead.locator("details").first().getAttribute("open"), null);
  assert.notEqual(await typical.page.locator("[data-ai-submissions]").getAttribute("open"), null);
  assert.equal(await typical.page.getByLabel("筛选发起来源").isEnabled(), true);
  await fetch(delayed.controlURL, { method: "POST", body: JSON.stringify({ delayMs: 0 }) });
  checks.push("历史读取中可展开连接与记录，数据接管保留开合状态");
  await typical.context.close(); await empty.context.close(); await context.close();
  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  await writeFile(join(artifacts, `${engine}-report.json`), JSON.stringify({ engine, checks, screenshots, layout, errors, failures }, null, 2));
  console.log(JSON.stringify({ engine, checks, screenshots: screenshots.length, errors, failures }));
} catch (error) { await writeFile(join(artifacts, `${engine}-failure-${Date.now()}.txt`), String(error) + "\n" + serverLog); throw error; }
finally { await browser.close(); child.kill("SIGTERM"); await once(child, "exit"); await delayed.close(); await socket.stop(); await pg.close(); }
