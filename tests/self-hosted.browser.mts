import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { createDatabase } from "../src/db/client";
import * as schema from "../src/db/schema";
import { provisionAccount } from "../src/features/auth/provision";
import { initializeAccountOwner } from "../src/features/auth/account-management";
import { createAiToken, revokeAiToken } from "../src/features/auth/ai-tokens";
import { saveMeasurementDay } from "../src/features/measurements/editing";
import { addCalendarDays } from "../src/features/measurements/calendar";
import { localMeasurementDate } from "../src/features/measurements/entry-state";
import { submitEnergyOperation, decideEnergyOperation } from "../src/features/activities/records";
import { submitMealOperation, decideMealOperation } from "../src/features/meals/records";
import { mealDayDigest, setMealDayStatus } from "../src/features/meals/day-status";

// 只接受经过 SSH 转发的隔离预览。不得通过修改这些断言对生产环境运行。
const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
const site = new URL(process.env.FORMWARD_PREVIEW_URL ?? "http://127.0.0.1:3300");
assert.ok(loopback.has(site.hostname) && ["http:", "https:"].includes(site.protocol), "预览 URL 必须是回环 HTTP 地址，禁止生产域名");
assert.ok(site.pathname === "/" && !site.search && !site.hash && !site.username && !site.password, "预览 URL 只包含来源地址");
const baseURL = site.origin;
assert.ok(process.env.DATABASE_URL, "请提供隔离预览数据库连接");
const databaseURL = new URL(process.env.DATABASE_URL);
assert.ok(loopback.has(databaseURL.hostname) && ["postgres:", "postgresql:"].includes(databaseURL.protocol) && databaseURL.pathname === "/formward_preview", "只允许回环 PostgreSQL 的 formward_preview 数据库");
assert.ok([...databaseURL.searchParams.keys()].every(key => ["max", "sslmode"].includes(key)), "不允许覆盖隔离数据库的连接地址");
const credentialPath = process.env.FORMWARD_PREVIEW_CREDENTIALS;
assert.ok(credentialPath, "请设置 FORMWARD_PREVIEW_CREDENTIALS，密码不得放入命令行");
assert.equal((await stat(credentialPath)).mode & 0o777, 0o600, "虚构凭据文件权限必须为 0600");
const credentialSchema = z.object({ email: z.email().refine(value => value.endsWith(".test")), password: z.string().min(12).max(128) }).strict();
let credentialInput: unknown;
try { credentialInput = JSON.parse(await readFile(credentialPath, "utf8")); } catch { throw new Error("无法读取虚构凭据 JSON；不输出文件内容"); }
const credentials = z.object({ owner: credentialSchema, person: credentialSchema }).strict().safeParse(credentialInput);
assert.ok(credentials.success, "凭据必须包含 owner/person 的 .test 虚构邮箱及 12–128 字符密码");
const { owner, person } = credentials.data;
assert.notEqual(owner.email.toLowerCase(), person.email.toLowerCase(), "两个验收账号必须不同");
const engine = process.env.FORMWARD_PREVIEW_BROWSER ?? "chromium";
assert.ok(["chromium", "webkit"].includes(engine), "浏览器只能为 chromium 或 webkit");
const artifacts = resolve(process.env.FORMWARD_PREVIEW_ARTIFACTS ?? `.codex/self-hosted/${engine}`);
await mkdir(artifacts, { recursive: true });
const { db, close } = createDatabase(databaseURL.toString());
const checks: string[] = [], screenshots: string[] = [], pageErrors: string[] = [];
const serverErrors: { status: number; path: string; phase: string }[] = [];
const secrets = [owner.password, person.password];
const redact = (value: string) => secrets.reduce((text, secret) => text.replaceAll(secret, "[redacted]"), value).replace(/#token=[A-Za-z0-9_-]+/g, "#token=[redacted]");
let phase = "setup", browser: { close(): Promise<void> } | undefined;
let ownerId = "", tokenId = "", pendingImage: { id: string; revision: number } | undefined;
let expectedImageFailure: { status: number; code: string } | undefined;
let captureFailure: (() => Promise<void>) | undefined, failed = false;
function enterPhase(next: string) { phase = next; console.log(`[${engine}] ${phase}`); }
async function bounded<T>(label: string, work: Promise<T>, milliseconds = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} 超过 ${milliseconds / 1000} 秒`)), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}
const today = localMeasurementDate(new Date(), "Asia/Shanghai");
function mealAction(name: string, date = today, calories = "500") {
  return { kind: "save_meal", date, timezone: "Asia/Shanghai", mealType: "加餐", notes: "仅供自建服务器隔离验收的虚构记录", items: [{ kind: "food", name, quantity: "1", unit: "份", nutritionBasis: "consumed_total", sourceKind: "estimated", nutrition: { caloriesKcal: calories, proteinG: "30", carbsG: "60", fatG: "16" } }] };
}
try {
  const existing = await db.select({ email: schema.user.email }).from(schema.user);
  assert.ok(existing.every(row => row.email.endsWith(".test")), "隔离库包含非虚构账号，拒绝写入或截图");
  ownerId = (await provisionAccount(db, { ...owner, name: "虚构预览管理员" })).id;
  await provisionAccount(db, { ...person, name: "虚构预览用户" });
  await initializeAccountOwner(db, ownerId);
  // 同一预览库再次运行保留已有样本，不覆盖用户验收时修改的记录。
  if (!(await db.select({ id: schema.measurement.id }).from(schema.measurement).where(eq(schema.measurement.userId, ownerId)).limit(1)).length) {
    for (const [index, offset] of [-4, -3, -1, 0].entries()) {
      await saveMeasurementDay(db, { userId: ownerId, actorId: ownerId }, { operationId: randomUUID(), date: addCalendarDays(today, offset), timezone: "Asia/Shanghai", periods: { daytime: { weightKg: ["70.2", "71.1", "69.8", "70.1"][index], bodyFatPercent: index === 1 ? null : "20.5", fasting: true, deviceLabel: "虚构体脂秤" } } });
    }
  }
  if (!(await db.select({ id: schema.energyDay.id }).from(schema.energyDay).where(eq(schema.energyDay.userId, ownerId)).limit(1)).length) {
    for (const [index, offset] of [-4, -3, -1, 0].entries()) {
      const operation = await submitEnergyOperation(db, { userId: ownerId, origin: "manual" }, { operationId: randomUUID(), actions: [{ kind: "save_energy_day", date: addCalendarDays(today, offset), totalKcal: ["2300", "0", "2600", "2400"][index] }] });
      await decideEnergyOperation(db, ownerId, operation.id, operation.revision, "confirm");
    }
  }
  if (!(await db.select({ id: schema.meal.id }).from(schema.meal).where(eq(schema.meal.userId, ownerId)).limit(1)).length) {
    for (const [index, offset] of [-4, -3, -1, 0].entries()) {
      const date = addCalendarDays(today, offset);
      const operation = await submitMealOperation(db, { userId: ownerId, origin: "manual" }, { operationId: randomUUID(), actions: [mealAction(`虚构餐食样本 ${index + 1}`, date, ["1800", "2200", "2700", "2100"][index])] });
      await decideMealOperation(db, ownerId, operation.id, operation.revision, "confirm");
      const meals = await db.select({ id: schema.meal.id, version: schema.meal.version }).from(schema.meal).where(and(eq(schema.meal.userId, ownerId), eq(schema.meal.localDate, date), isNull(schema.meal.deletedAt)));
      const [state] = await db.select().from(schema.mealDay).where(and(eq(schema.mealDay.userId, ownerId), eq(schema.mealDay.date, date)));
      await setMealDayStatus(db, ownerId, { operationId: randomUUID(), date, status: index === 1 ? "incomplete" : "complete", version: state?.version ?? 0, contentDigest: mealDayDigest(meals) });
    }
  }
  checks.push("仅隔离 PostgreSQL：虚构账号、唯一 owner 与代表性样本，已有样本不覆盖");
  const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "/tmp/formward-account-tooling/node_modules/playwright/index.mjs");
  const active = await playwright[engine].launch({ headless: true, ...(engine === "chromium" ? { ignoreDefaultArgs: ["--hide-scrollbars"] } : {}) }); browser = active;
  const context = await active.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  type TestPage = Awaited<ReturnType<typeof context.newPage>>;
  type ResponseLike = { status(): number; url(): string };
  function watch(target: typeof context) {
    target.setDefaultTimeout(20_000); target.setDefaultNavigationTimeout(30_000);
    target.on("page", (page: TestPage) => page.on("pageerror", (error: Error) => pageErrors.push(redact(error.message))));
    target.on("response", (response: ResponseLike) => { if (response.status() >= 500) serverErrors.push({ status: response.status(), path: new URL(response.url()).pathname, phase }); });
  }
  function assertStatus(response: ResponseLike, expected: number, label: string) {
    if (response.status() >= 500) serverErrors.push({ status: response.status(), path: new URL(response.url()).pathname, phase });
    assert.equal(response.status(), expected, label);
  }
  async function login(target: typeof context, input: { email: string; password: string }) {
    const response = await target.request.post(`${baseURL}/api/auth/sign-in/email`, { headers: { Origin: baseURL }, data: input });
    assertStatus(response, 200, "通过远端 HTTP 登录失败");
    const session = await target.request.get(`${baseURL}/api/auth/get-session`);
    assertStatus(session, 200, "无法读取远端会话");
    const identity = await session.json();
    assert.equal(identity.user.email, input.email.toLowerCase());
    const [storedSession] = await db.select({ userId: schema.session.userId }).from(schema.session).where(eq(schema.session.id, identity.session.id));
    assert.equal(storedSession?.userId, identity.user.id, "远端应用必须连接本脚本使用的同一个隔离数据库");
  }
  async function capture(page: TestPage, name: string, waitForNetwork = true) {
    if (waitForNetwork) await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !document.querySelector(".page-loading-dialog[open], .page-loading-fallback:not([hidden])"));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name} 横向溢出`);
    const path = resolve(artifacts, `${name}.png`);
    await page.screenshot({ path, mask: [page.getByRole("textbox", { name: "一次性链接" }), page.locator('input[type="password"]')] }); screenshots.push(path);
  }
  watch(context);
  enterPhase("authorization");
  const anonymous = await active.newContext({ reducedMotion: "reduce" }); watch(anonymous);
  const anonPage = await anonymous.newPage();
  for (const path of ["/admin", "/dashboard"]) { await anonPage.goto(baseURL + path); assert.equal(new URL(anonPage.url()).pathname, "/"); }
  assertStatus(await anonymous.request.get(`${baseURL}/dashboard/export/file`), 401, "匿名导出必须拒绝");
  assertStatus(await anonymous.request.post(`${baseURL}/api/mcp`, { headers: { Accept: "application/json, text/event-stream" }, data: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "fictional-preview", version: "1" } } } }), 401, "MCP 匿名调用必须拒绝");
  assertStatus(await anonymous.request.post(`${baseURL}/api/auth/admin/set-role`, { headers: { Origin: baseURL }, data: {} }), 404, "原生管理旁路必须关闭");
  const ordinary = await active.newContext({ reducedMotion: "reduce" }); watch(ordinary); await login(ordinary, person);
  const ordinaryPage = await ordinary.newPage();
  assertStatus(await ordinaryPage.goto(`${baseURL}/admin`), 404, "普通用户不得进入后台");
  await ordinaryPage.goto(`${baseURL}/dashboard/account`); await ordinaryPage.getByRole("heading", { name: "账号设置", exact: true }).waitFor();
  await capture(ordinaryPage, "ordinary-account");
  await login(context, owner);
  const page = await context.newPage();
  captureFailure = async () => { await page.screenshot({ path: resolve(artifacts, "failure.png"), timeout: 10_000, mask: [page.getByRole("textbox", { name: "一次性链接" }), page.locator('input[type="password"]')] }); };
  await page.goto(`${baseURL}/admin`); await page.getByRole("heading", { name: "输入密码以继续管理" }).waitFor(); await capture(page, "admin-locked");
  await page.getByLabel("当前密码", { exact: true }).fill(owner.password); await page.getByRole("button", { name: "验证并进入" }).click();
  await page.getByRole("navigation", { name: "账号管理栏目" }).waitFor(); await capture(page, "admin-unlocked");
  checks.push("真实 HTTP 登录、匿名保护、普通账号拒绝管理、owner 再次验密、账号设置、匿名导出/MCP/原生管理旁路拒绝");
  enterPhase("invitation");
  await page.getByRole("button", { name: "邀请", exact: true }).click();
  const inviteEmail = `preview-${engine}-${randomUUID().slice(0, 8)}@example.test`;
  await page.getByLabel("邀请账号", { exact: true }).fill(inviteEmail); await page.getByRole("button", { name: "生成邀请链接", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "链接已生成", exact: true }); await dialog.waitFor();
  const claimURL = new URL(await dialog.getByRole("textbox", { name: "一次性链接" }).inputValue());
  assert.equal(claimURL.origin, baseURL); assert.equal(claimURL.search, ""); assert.ok(claimURL.hash.startsWith("#token=")); secrets.push(claimURL.hash.slice(7));
  await dialog.getByRole("button", { name: "关闭链接" }).click(); await capture(page, "invitation-list");
  const claimContext = await active.newContext({ viewport: { width: 390, height: 640 }, reducedMotion: "reduce", isMobile: true, hasTouch: true }); watch(claimContext);
  const claimPage = await claimContext.newPage(); await claimPage.goto(claimURL.toString());
  await claimPage.getByLabel("设置密码", { exact: true }).waitFor(); await capture(claimPage, "claim-ready-mobile");
  const claimPassword = `fictional-${randomUUID()}`; secrets.push(claimPassword);
  await claimPage.getByLabel("设置密码", { exact: true }).fill(claimPassword); await claimPage.getByLabel("确认密码", { exact: true }).fill(claimPassword);
  await claimPage.getByRole("button", { name: "激活账号", exact: true }).click(); await claimPage.getByRole("heading", { name: "密码已设置" }).waitFor();
  assert.equal(new URL(claimPage.url()).hash, ""); await capture(claimPage, "claim-complete-mobile");
  const sessionAfterClaim = await claimContext.request.get(`${baseURL}/api/auth/get-session`); assertStatus(sessionAfterClaim, 200, "兑换后会话读取失败"); assert.equal(await sessionAfterClaim.json(), null);
  checks.push("通过网页生成邀请并在独立浏览器激活，令牌只在 fragment，兑换不静默登录");
  enterPhase("responsive-pages");
  const paths = [["overview", "/dashboard"], ["measurements", "/dashboard/measurements"], ["meals", "/dashboard/meals"], ["energy", "/dashboard/energy"]];
  const mobile = await active.newContext({ storageState: await context.storageState(), viewport: { width: 390, height: 640 }, reducedMotion: "reduce", isMobile: true, hasTouch: true }); watch(mobile);
  const mobilePage = await mobile.newPage();
  for (const [width, height] of [[1440, 900], [1100, 800], [320, 560], [390, 640], [430, 780], [390, 560], [844, 390]]) {
    const target = width >= 1100 ? page : mobilePage; await target.setViewportSize({ width, height });
    for (const [name, path] of paths) {
      assertStatus(await target.goto(baseURL + path), 200, `${name} 页面失败`); await target.locator("[data-record-workspace]").waitFor();
      await capture(target, `${name}-${width}x${height}`);
      if (width >= 1100) {
        const alignment = await target.evaluate(() => {
          const frame = document.querySelector(".dashboard-page")!.getBoundingClientRect(), content = document.querySelector("[data-record-workspace]")!.getBoundingClientRect();
          const tool = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="工具"]')].find(node => node.getClientRects().length)!.getBoundingClientRect();
          return { content: content.x + content.width / 2 - frame.x - frame.width / 2, tool: tool.y + tool.height / 2 - innerHeight / 2 };
        });
        assert.ok(Math.abs(alignment.content) <= 1 && Math.abs(alignment.tool) <= 1, `${name} 桌面正文或工具未居中`);
      }
    }
  }
  await mobilePage.setViewportSize({ width: 390, height: 640 }); await mobilePage.goto(`${baseURL}/dashboard/account`); await capture(mobilePage, "account-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  checks.push("四主页面：1440/1100 桌面居中，320/390/430 手机、矮屏、触屏横屏；虚构数据截图且无横向溢出");
  enterPhase("text-save");
  const token = await createAiToken(db, ownerId, `虚构自建验收 ${engine}`, "write"); tokenId = token.token.id; secrets.push(token.rawToken);
  async function submitText(name: string) {
    const response = await context.request.post(`${baseURL}/api/v1/meal-operations`, { headers: { Authorization: `Bearer ${token.rawToken}` }, data: { operationId: randomUUID(), actions: [mealAction(name)] } });
    assertStatus(response, 200, "远端 AI 文字预览失败"); const result = await response.json();
    assert.equal(new URL(result.confirmationUrl).origin, baseURL); assert.equal(result.status, "pending"); return result;
  }
  const savedName = `虚构文字保存 ${engine} ${randomUUID().slice(0, 8)}`;
  const operation = await submitText(savedName); await page.goto(operation.confirmationUrl);
  await page.getByRole("button", { name: "确认保存", exact: true }).click(); await page.getByRole("heading", { name: "已保存", exact: true }).waitFor();
  await page.getByRole("button", { name: "停留查看", exact: true }).click(); await capture(page, "text-saved");
  enterPhase("text-reload");
  await page.reload(); await page.getByRole("heading", { name: "已保存", exact: true }).waitFor();
  const query = await context.request.get(`${baseURL}/api/v1/meals`, { headers: { Authorization: `Bearer ${token.rawToken}` } }); assertStatus(query, 200, "保存后查询失败"); assert.ok((await query.text()).includes(savedName));
  assertStatus(await ordinaryPage.goto(operation.confirmationUrl), 404, "另一账号不能读取审核");
  enterPhase("export");
  const exported = await context.request.get(`${baseURL}/dashboard/export/file`); assertStatus(exported, 200, "导出失败");
  assert.match(exported.headers()["content-type"], /spreadsheetml/); assert.match(exported.headers()["cache-control"], /private/); assert.match(exported.headers()["cache-control"], /no-store/); assert.equal((await exported.body()).subarray(0, 2).toString(), "PK");
  checks.push("远端 API 文字预览→网页确认→重载→查询已保存；跨账号审核拒绝；实际私有 Excel 导出");
  enterPhase("forged-origin");
  assertStatus(await context.request.post(`${baseURL}/api/meal-images/upload`, { headers: { Origin: "https://attacker.example.test", "X-Forwarded-Host": site.host, "X-Forwarded-Proto": site.protocol.slice(0, -1) }, data: { type: "prepare" } }), 403, "伪造 Origin 必须拒绝");
  checks.push("真实上传入口拒绝伪造 Origin 和转发头");
  const imageRowsBefore = await db.select({ id: schema.mealImage.id }).from(schema.mealImage);
  const imageOperation = await submitText(`虚构图片失败 ${engine} ${randomUUID().slice(0, 8)}`); pendingImage = { id: imageOperation.id, revision: imageOperation.revision };
  await page.goto(imageOperation.confirmationUrl); await page.getByRole("button", { name: "修改", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "修改待保存内容", exact: true }); await editor.waitFor();
  enterPhase("unconfigured-image");
  const failureResponse = page.waitForResponse((response: ResponseLike) => new URL(response.url()).pathname === "/api/meal-images/upload" && response.status() >= 400);
  await editor.locator('input[type="file"]').setInputFiles({ name: "fictional.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2SuoAAAAASUVORK5CYII=", "base64") });
  const imageFailure = await failureResponse; assert.ok([400, 500, 503].includes(imageFailure.status()));
  await editor.getByRole("button", { name: "重试未完成照片", exact: true }).waitFor(); await editor.getByRole("alert").filter({ hasText: "fictional.png" }).first().waitFor();
  // Blob SDK 看见失败状态后不读取响应体；Chromium 的 Response.body() 可一直等待。
  // 保留真实选图失败的断言，再用同一隔离凭据和内存中的签名请求验证远端错误体，不输出 ticket。
  const signatureRequest = imageFailure.request().postDataJSON();
  assert.equal(signatureRequest.type, "blob.generate-presigned-url");
  const replayed = await context.request.post(`${baseURL}/api/meal-images/upload`, { timeout: 15_000, headers: { Origin: baseURL }, data: signatureRequest });
  assertStatus(replayed, imageFailure.status(), "独立读取上传配置错误必须与网页失败一致");
  const failureBody = z.object({ error: z.string(), code: z.string() }).parse(await bounded("读取图片错误", replayed.json()));
  if (imageFailure.status() === 400) {
    // 当前 Blob SDK 的缺配置 Error 被 safeAiError 作为 invalid_input 返回；不能把其他 400 当作成功验收。
    assert.equal(failureBody.code, "invalid_input"); assert.match(failureBody.error, /No blob credentials found|No token found|Missing webhook public key|OIDC/i);
  } else assert.ok(["unavailable", "image_unavailable", "image_configuration"].includes(failureBody.code));
  // 已断言失败提示和重试按钮；SDK 放弃响应体后该连接可能一直不进入 networkidle。
  expectedImageFailure = { status: imageFailure.status(), code: failureBody.code }; await capture(page, "image-unconfigured-explicit-failure", false);
  assert.deepEqual(await db.select({ id: schema.mealImage.id }).from(schema.mealImage), imageRowsBefore, "上传失败不得新增图片记录");
  const expectedStatus = expectedImageFailure.status;
  const expectedServerErrors = expectedStatus >= 500 ? Array.from({ length: 2 }, () => ({ status: expectedStatus, path: "/api/meal-images/upload", phase: "unconfigured-image" })) : [];
  assert.deepEqual(serverErrors, expectedServerErrors, "只能出现经过明确断言的图片未配置失败，其他 5xx 均失败");
  assert.deepEqual(pageErrors, []);
  checks.push("真实网页选图明确失败并保留重试入口，同请求独立核对配置错误，图片表未增加；所有 pageerror/5xx 均记录，仅明确断言的图片失败为预期");
} catch (error) {
  failed = true;
  await captureFailure?.().catch(() => {});
  console.error(`[${engine}] ${phase}: ${redact(error instanceof Error ? error.message : String(error))}`);
} finally {
  // 保留虚构账号与已确认样本供人工验收，只撤销本轮测试 Token/未确认图片预览。
  try {
    if (pendingImage) await bounded("撤销未确认图片预览", decideMealOperation(db, ownerId, pendingImage.id, pendingImage.revision, "cancel"));
    if (tokenId) await bounded("撤销虚构 AI Token", revokeAiToken(db, ownerId, tokenId));
  } catch (error) { failed = true; console.error(redact(error instanceof Error ? error.message : String(error))); }
  try { if (browser) await bounded("关闭验收浏览器", browser.close()); await bounded("关闭预览数据库连接", close()); }
  catch (error) { failed = true; console.error(redact(error instanceof Error ? error.message : String(error))); }
  await writeFile(resolve(artifacts, "report.json"), JSON.stringify({ engine, baseURL, phase, status: failed ? "failed" : "passed", checks, screenshots, pageErrors, serverErrors, expectedImageFailure, untested: ["真实 iPhone/微信浏览器与系统软键盘", "未接入的对象存储成功上传", "公网 DNS/TLS/备案与跨境连接"] }, null, 2));
}
console.log(JSON.stringify({ engine, status: failed ? "failed" : "passed", checks: checks.length, screenshots: screenshots.length, pageErrors: pageErrors.length, serverErrors, expectedImageFailure, report: resolve(artifacts, "report.json") }));
if (failed) process.exitCode = 1;
