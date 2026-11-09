import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { regionalFixture } from "./regional-fixture.mjs";
import { oauthConnection, meal } from "../src/db/schema";
import { eq } from "drizzle-orm";

const fixture = await regionalFixture({ singleWeb: true });
const engine = process.env.FORMWARD_SINGLE_WEB_ENGINE ?? "chromium";
const artifacts = resolve(".codex/single-web", engine);
await mkdir(artifacts, { recursive: true });
const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "/tmp/formward-account-tooling/node_modules/playwright/index.mjs");
const browser = await playwright[engine].launch({ headless: true });
const errors: string[] = [], checks: string[] = [], screenshots: string[] = [];
let page: Awaited<ReturnType<Awaited<ReturnType<typeof browser.newContext>>["newPage"]>> | undefined;
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, timezoneId: "Asia/Shanghai", viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  page = await context.newPage();
  page.on("pageerror", (error: Error) => errors.push(error.message));
  async function shot(name: string) {
    await page!.evaluate(() => document.fonts.ready);
    const path = resolve(artifacts, name + ".png");
    await page!.screenshot({ path }); screenshots.push(path);
  }
  async function login(origin: string, credentials = fixture.person, target = context) {
    const response = await target.request.post(origin + "/api/auth/sign-in/email", { headers: { Origin: origin }, data: credentials });
    assert.equal(response.status(), 200, await response.text());
  }
  const rpcHeaders = { Authorization: "Bearer " + fixture.oldTokens.access_token, Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-03-26" };
  async function rpc(name: string, args: object) {
    const response = await context.request.post(fixture.global + "/api/mcp", { headers: rpcHeaders, data: { jsonrpc: "2.0", id: randomUUID(), method: "tools/call", params: { name, arguments: args } } });
    assert.equal(response.status(), 200);
    const text = await response.text(), raw = text.startsWith("{") ? text : text.split("\n").filter((line: string) => line.startsWith("data: ")).at(-1)!.slice(6);
    const value = JSON.parse(raw);
    assert.equal(value.result?.isError, undefined, text);
    return value.result.structuredContent;
  }

  for (const path of ["/", "/dashboard", "/dashboard/training?date=2026-11-09", "/account/claim", "/region"]) {
    const response = await context.request.get(fixture.global + path, { maxRedirects: 0 });
    assert.equal(response.status(), 307, path);
    const target = new URL(response.headers().location);
    assert.equal(target.origin, fixture.cn);
    assert.equal(target.pathname, path === "/region" ? "/" : new URL(path, fixture.global).pathname);
  }
  for (const path of ["/api/mcp", "/.well-known/oauth-protected-resource/api/mcp", "/.well-known/oauth-authorization-server/api/auth", "/oauth/login?invalid=1", "/oauth/consent?invalid=1"]) {
    const response = await context.request.get(fixture.global + path, { maxRedirects: 0 });
    assert.notEqual(response.status(), 307, path);
    assert.ok(!response.headers().location?.startsWith(fixture.cn), path);
  }
  checks.push("旧首页、深链接、账号与地区页跳转国服；MCP、OAuth及发现地址保留");

  const connections = (await fixture.db.select().from(oauthConnection)).map(row => row.id).sort();
  const profile = await rpc("get_profile", {});
  assert.equal(profile.userId ?? profile.id, fixture.personId);
  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const preview = await rpc("submit_record_operation", { operationId: randomUUID(), items: [{
    key: "meal", kind: "save_meal", date, mealType: "lunch", timezone: "+08:00", expectedImageCount: 0,
    items: [{ kind: "food", name: "虚构入口午餐", quantity: "1", unit: "份", nutritionBasis: "consumed_total", nutrition: { caloriesKcal: "115", proteinG: "10", carbsG: "12", fatG: "3" }, sourceKind: "estimated" }],
  }] });
  assert.equal(new URL(preview.confirmationUrl).origin, fixture.cn);
  assert.equal(preview.status, "pending");
  await page.goto(preview.confirmationUrl);
  await page.waitForURL((url: URL) => url.origin === fixture.cn && url.pathname === "/" && url.searchParams.get("next") === new URL(preview.confirmationUrl).pathname);
  await shot("login-return");
  await page.getByRole("link", { name: "进入登录" }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Email", { exact: true }).fill(fixture.person.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.person.password);
  await page.getByRole("button", { name: "ENTER", exact: true }).click();
  await page.waitForURL(preview.confirmationUrl, { timeout: 30000 });
  await page.getByRole("button", { name: /确认保存/ }).waitFor();
  checks.push("原OAuth连接生成国服审核链接；未登录后真实登录自动回原确认页");

  for (const [width, height] of [[1440, 900], [1100, 850], [320, 560], [390, 640], [430, 780], [844, 390]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await shot("review-" + width + "x" + height);
  }
  await page.getByRole("button", { name: /确认保存/ }).click();
  await page.getByText(/已保存|保存成功|已确认/).first().waitFor();
  const result = await rpc("get_record_operation", { id: preview.id });
  assert.equal(result.status, "confirmed");
  assert.equal(new URL(result.confirmationUrl).origin, fixture.cn);
  const meals = await fixture.db.select().from(meal).where(eq(meal.userId, fixture.personId));
  assert.ok(meals.some(row => row.localDate === date));
  checks.push("国服真实确认Server Action成功，原MCP查询返回同一已保存批次");

  const other = await browser.newContext({ ignoreHTTPSErrors: true });
  await login(fixture.cn, fixture.owner, other);
  const denied = await other.request.get(preview.confirmationUrl);
  assert.equal(denied.status(), 404);
  await other.close();
  assert.deepEqual((await fixture.db.select().from(oauthConnection)).map(row => row.id).sort(), connections);
  checks.push("不同账号不能查看同一确认链接，原OAuth连接编号保持");

  await login(fixture.global);
  process.env.FORMWARD_SINGLE_WEB = "0";
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto(fixture.global + "/dashboard/meals");
  await page.getByRole("button", { name: "录入", exact: true }).first().click();
  const dialog = page.locator("dialog:not(.page-loading-dialog)");
  await dialog.getByRole("button", { name: /自己填写/ }).click();
  const food = dialog.getByLabel(/食物名称|食物/).first();
  await food.fill("虚构切换前草稿");
  process.env.FORMWARD_SINGLE_WEB = "1";
  assert.equal(await food.inputValue(), "虚构切换前草稿");
  const direct = await context.request.get(fixture.global + "/dashboard/meals", { maxRedirects: 0 });
  assert.equal(direct.status(), 307);
  assert.equal(await food.inputValue(), "虚构切换前草稿");
  await shot("existing-draft-kept");
  checks.push("切换不会刷新已有旧页或丢掉草稿，新打开的旧地址立即转国服");

  assert.deepEqual(errors, []);
  await writeFile(resolve(artifacts, "report.json"), JSON.stringify({ engine, checks, screenshots, errors, physicalDevice: false, at: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ engine, checks, screenshotCount: screenshots.length }));
  await context.close();
} catch (error) {
  if (page) await page.screenshot({ path: resolve(artifacts, "failure.png") }).catch(() => {});
  await writeFile(resolve(artifacts, "failure.json"), JSON.stringify({ error: error instanceof Error ? error.stack : String(error), checks, errors }, null, 2));
  await writeFile(resolve(artifacts, "server.log"), fixture.serverLog());
  throw error;
} finally { await browser.close(); await fixture.close(); }
