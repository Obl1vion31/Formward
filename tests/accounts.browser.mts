import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { provisionAccount } from "../src/features/auth/provision";
import { createAuth } from "../src/features/auth/auth";
import { initializeAccountOwner } from "../src/features/auth/account-management";
import { createAiToken, authenticateAi } from "../src/features/auth/ai-tokens";

const artifacts = resolve(process.env.FORMWARD_ACCOUNT_ARTIFACTS ?? ".codex/accounts-visual");
await mkdir(artifacts, { recursive: true });
const pg = new PGlite(), db = drizzle(pg, { schema });
await migrate(db, { migrationsFolder: "./drizzle" });
const owner = { email: "owner@example.test", password: "fictional-owner-password" }, person = { email: "lin@example.test", password: "fictional-person-password" };
const ownerId = (await provisionAccount(db, owner)).id, personId = (await provisionAccount(db, person)).id;
await initializeAccountOwner(db, ownerId);
const credential = (await db.select().from(schema.account).where(eq(schema.account.userId, personId)))[0];
for (let index = 0; index < 53; index++) {
  const id = randomUUID(), email = index === 0 ? "avery.long.personal.account.for.mobile.layout.verification@example.test" : `member-${String(index).padStart(2, "0")}@example.test`;
  await db.insert(schema.user).values({ id, email, name: "虚构用户", createdAt: new Date(Date.now() - (index + 1) * 86400_000) });
  await db.insert(schema.account).values({ id: randomUUID(), userId: id, accountId: id, providerId: "credential", password: credential.password });
}
const socket = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 10 }); await socket.start();
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
const address = probe.address(); assert.ok(address && typeof address === "object"); const port = address.port;
await new Promise<void>(resolve => probe.close(() => resolve()));
const baseURL = `http://127.0.0.1:${port}`, secret = "fictional-account-browser-secret-more-than-32";
const auth = createAuth(db, { secret, baseURL, rateLimit: false });
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env: { ...process.env, DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?max=1`, BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: secret, BLOB_STORE_ID: "", BLOB_READ_WRITE_TOKEN: "" }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = ""; child.stdout?.on("data", chunk => { serverLog += chunk; }); child.stderr?.on("data", chunk => { serverLog += chunk; });
const errors: string[] = [], requestErrors: string[] = [], checks: string[] = [], screenshots: string[] = [];
const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "/tmp/formward-account-tooling/node_modules/playwright/index.mjs");
let browser: { close(): Promise<void> } | undefined;
let captureFailure: (() => Promise<void>) | undefined;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(baseURL)).status === 200) break; } catch {}
    if (attempt === 99) throw new Error("独立测试服务没有启动。");
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const engine = process.env.FORMWARD_ACCOUNT_BROWSER ?? "chromium";
  const launched = await playwright[engine].launch({ headless: true }); browser = launched;
  const context = await launched.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  type TestPage = Awaited<ReturnType<typeof context.newPage>>;
  function watch(page: TestPage) {
    page.on("pageerror", (error: Error) => errors.push(error.message));
    page.on("response", (response: { status(): number; url(): string }) => { if (response.status() >= 500) requestErrors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  }
  async function login(target: typeof context, credentials: { email: string; password: string }) {
    const response = await auth.handler(new Request(`${baseURL}/api/auth/sign-in/email`, { method: "POST", headers: { Origin: baseURL, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0.0.0" }, body: JSON.stringify(credentials) }));
    assert.equal(response.status, 200);
    await target.addCookies(response.headers.getSetCookie().map(value => { const [name, ...parts] = value.split(";")[0].split("="); return { name, value: parts.join("="), url: baseURL, httpOnly: true, sameSite: "Lax" }; }));
    const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const identity = await auth.api.getSession({ headers: new Headers({ cookie }) }); assert.ok(identity); return identity;
  }
  async function capture(page: TestPage, name: string, fullPage = false) {
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !document.querySelector(".page-loading-dialog[open], .page-loading-fallback:not([hidden])"));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(120);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(overflow, false, `${name} 不得横向溢出`);
    const path = resolve(artifacts, `${name}.png`); await page.screenshot({ path, fullPage }); screenshots.push(path);
  }
  const anon = await launched.newContext(), anonPage = await anon.newPage(); watch(anonPage);
  await anonPage.goto(`${baseURL}/admin`); assert.equal(new URL(anonPage.url()).pathname, "/");
  assert.equal((await anon.request.post(`${baseURL}/api/auth/admin/set-role`, { data: {} })).status(), 404);
  const ordinaryContext = await launched.newContext(); await login(ordinaryContext, person);
  const ordinaryPage = await ordinaryContext.newPage(); watch(ordinaryPage);
  assert.equal((await ordinaryPage.goto(`${baseURL}/admin`))?.status(), 404);
  const identity = await login(context, owner), page = await context.newPage(); watch(page);
  captureFailure = async () => { await page.screenshot({ path: resolve(artifacts, "failure.png"), fullPage: true }); await writeFile(resolve(artifacts, "failure.html"), await page.content()); };
  await page.goto(`${baseURL}/admin`); await page.getByRole("heading", { name: "输入密码以继续管理" }).waitFor();
  await capture(page, "admin-locked-desktop");
  await page.getByLabel("当前密码", { exact: true }).fill("wrong-password"); await page.getByRole("button", { name: "验证并进入" }).click();
  await page.getByRole("alert").filter({ hasText: "密码不正确" }).waitFor();
  await page.getByLabel("当前密码", { exact: true }).fill(owner.password); await page.getByRole("button", { name: "验证并进入" }).click();
  await page.getByRole("navigation", { name: "账号管理栏目" }).waitFor();
  checks.push("匿名／普通账号拒绝管理，owner 错误密码重试和验证成功");
  await page.getByRole("button", { name: "下一页", exact: true }).click(); await page.getByText("第 2 页", { exact: true }).waitFor();
  await page.getByRole("button", { name: "上一页", exact: true }).click(); await page.getByText("第 1 页", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "搜索登录邮箱" }).fill("avery.long"); await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.getByText("共 1 条", { exact: true }).waitFor();
  const actionRequest = page.waitForRequest((request: { headers(): Record<string, string> }) => Boolean(request.headers()["next-action"]));
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  const actionId = (await actionRequest).headers()["next-action"];
  for (const attacker of [anon, ordinaryContext]) {
    const denied = await attacker.request.post(baseURL + "/admin", { headers: { Origin: baseURL, "Next-Action": actionId, Accept: "text/x-component", "Content-Type": "text/plain;charset=UTF-8" }, data: JSON.stringify([{ tab: "accounts" }]) });
    const body = await denied.text();
    assert.ok(!body.includes("avery.long.personal.account"));
    assert.ok(body.includes("invalid_session") || body.includes("forbidden"));
  }
  checks.push("复用真实 Server Action ID 的匿名／普通账号请求被拒绝且不泄漏账号列表");
  for (const [width, height] of [[1440, 900], [1100, 850], [430, 780], [390, 640], [320, 560], [844, 390]]) {
    await page.setViewportSize({ width, height }); await page.evaluate(() => scrollTo(0, 0)); await capture(page, `admin-accounts-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "邀请", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("邀请账号", { exact: true }).fill(person.email); await page.getByRole("button", { name: "生成邀请链接" }).click();
  await page.getByRole("alert").filter({ hasText: "此账号已存在" }).waitFor();
  await page.getByLabel("邀请账号", { exact: true }).fill("new.person@example.test"); await page.getByRole("button", { name: "生成邀请链接" }).click();
  let linkDialog = page.getByRole("dialog", { name: "链接已生成", exact: true }); await linkDialog.waitFor();
  const inviteURL = await linkDialog.getByRole("textbox", { name: "一次性链接" }).inputValue();
  assert.equal(new URL(inviteURL).search, ""); assert.ok(new URL(inviteURL).hash.startsWith("#token="));
  await linkDialog.getByRole("button", { name: "复制链接", exact: true }).click();
  await Promise.race([linkDialog.getByRole("button", { name: "已复制", exact: true }).waitFor(), linkDialog.getByRole("alert").waitFor()]);
  await capture(page, "invite-link-desktop"); await page.setViewportSize({ width: 390, height: 640 }); await capture(page, "invite-link-mobile");
  await linkDialog.getByRole("button", { name: "关闭链接" }).click();
  assert.ok(!await page.locator("body").innerText().then((text: string) => text.includes(new URL(inviteURL).hash.slice(7))));
  await page.getByRole("textbox", { name: "搜索登录邮箱" }).fill(""); await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.getByText("new.person@example.test", { exact: true }).waitFor(); await capture(page, "admin-invitations-mobile");
  checks.push("分页、长邮箱窄屏、手动邀请一次展示与关闭后隐藏原文");

  const signedClaimContext = await launched.newContext({ viewport: { width: 390, height: 640 } });
  await login(signedClaimContext, person);
  const signedClaimPage = await signedClaimContext.newPage(); watch(signedClaimPage);
  await signedClaimPage.goto(inviteURL); await signedClaimPage.getByRole("heading", { name: "请先退出当前账号" }).waitFor();
  await capture(signedClaimPage, "claim-signed-in-mobile");
  await signedClaimPage.getByRole("button", { name: "退出并继续" }).click();
  await signedClaimPage.getByLabel("设置密码", { exact: true }).waitFor(); await signedClaimContext.close();
  checks.push("打开链接时已有其他账号必须显式退出，不能静默切换");

  const claimContext = await launched.newContext({ viewport: { width: 390, height: 640 } }), claimPage = await claimContext.newPage(); watch(claimPage);
  await claimPage.goto(inviteURL); await claimPage.getByLabel("设置密码", { exact: true }).waitFor(); await capture(claimPage, "claim-mobile");
  await claimPage.setViewportSize({ width: 1440, height: 900 }); await capture(claimPage, "claim-desktop");
  await claimPage.getByLabel("设置密码", { exact: true }).fill("fictional-invited-password"); await claimPage.getByLabel("确认密码", { exact: true }).fill("fictional-invited-password");
  await claimPage.getByRole("button", { name: "激活账号", exact: true }).click(); await claimPage.getByRole("heading", { name: "密码已设置" }).waitFor();
  assert.equal(new URL(claimPage.url()).hash, ""); assert.equal((await claimContext.request.get(`${baseURL}/api/auth/get-session`)).status(), 200);
  assert.equal(await (await claimContext.request.get(`${baseURL}/api/auth/get-session`)).json(), null);
  checks.push("fragment 激活、提交后清除令牌、成功不自动登录");
  const usedPage = await anon.newPage(); watch(usedPage); await usedPage.setViewportSize({ width: 390, height: 640 });
  await usedPage.goto(inviteURL); await usedPage.getByRole("alert").filter({ hasText: "链接已失效或已使用" }).waitFor(); await capture(usedPage, "claim-used-mobile"); await usedPage.close();

  await page.setViewportSize({ width: 1440, height: 900 }); await page.getByRole("button", { name: "账号", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索登录邮箱" }).fill(person.email); await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.getByRole("article").filter({ hasText: person.email }).getByRole("button", { name: "管理", exact: true }).click();
  let manageDialog = page.getByRole("dialog", { name: "管理账号", exact: true }); await manageDialog.waitFor();
  await capture(page, "manage-account-desktop"); await page.setViewportSize({ width: 390, height: 640 }); await capture(page, "manage-account-mobile");
  await manageDialog.getByRole("button", { name: "停用账号", exact: true }).scrollIntoViewIfNeeded(); await capture(page, "manage-account-bottom-mobile");
  await page.keyboard.press("Tab"); assert.ok(await manageDialog.evaluate((dialog: HTMLElement) => dialog.contains(document.activeElement)));
  await page.keyboard.press("Escape"); await manageDialog.waitFor({ state: "hidden" });
  await page.getByRole("article").filter({ hasText: person.email }).getByRole("button", { name: "管理", exact: true }).click();
  manageDialog = page.getByRole("dialog", { name: "管理账号", exact: true });
  await manageDialog.getByRole("button", { name: "生成密码重设链接", exact: true }).click();
  await page.getByRole("dialog", { name: "生成密码重设链接", exact: true }).getByRole("button", { name: "确认", exact: true }).click();
  linkDialog = page.getByRole("dialog", { name: "链接已生成", exact: true }); await linkDialog.waitFor();
  const resetURL = await linkDialog.getByRole("textbox", { name: "一次性链接" }).inputValue(); await linkDialog.getByRole("button", { name: "关闭链接" }).click();
  assert.ok(await (await ordinaryContext.request.get(`${baseURL}/api/auth/get-session`)).json());
  const ai = await createAiToken(db, personId, "浏览器测试", "write");
  await claimPage.goto(resetURL); await claimPage.getByRole("heading", { name: "重新设置密码" }).waitFor(); await capture(claimPage, "reset-password-desktop");
  await claimPage.getByLabel("设置密码", { exact: true }).fill("fictional-reset-password"); await claimPage.getByLabel("确认密码", { exact: true }).fill("fictional-reset-password"); await claimPage.getByRole("button", { name: "保存新密码" }).click();
  await claimPage.getByRole("heading", { name: "密码已设置" }).waitFor();
  assert.equal(await (await ordinaryContext.request.get(`${baseURL}/api/auth/get-session`)).json(), null);
  assert.equal((await ordinaryContext.request.get(`${baseURL}/api/meal-images/fictional-private-image`)).status(), 401);
  assert.equal((await ordinaryContext.request.get(`${baseURL}/dashboard/export/file`)).status(), 401);
  assert.equal((await ordinaryContext.request.get(`${baseURL}/api/v1/measurements`, { headers: { Authorization: `Bearer ${ai.rawToken}` } })).status(), 401);
  await assert.rejects(authenticateAi(db, `Bearer ${ai.rawToken}`));
  checks.push("弹窗底部、键盘／Escape；重设后旧会话、私有图片、导出与 AI 令牌失效");

  await login(ordinaryContext, { email: person.email, password: "fictional-reset-password" }); await ordinaryPage.goto(`${baseURL}/dashboard/account`);
  for (const [width, height] of [[1440, 900], [1100, 850], [430, 780], [390, 640], [320, 560], [844, 390]]) { await ordinaryPage.setViewportSize({ width, height }); await ordinaryPage.evaluate(() => scrollTo(0, 0)); await capture(ordinaryPage, `account-settings-${width}`); }
  await ordinaryPage.setViewportSize({ width: 390, height: 640 }); await ordinaryPage.getByRole("heading", { name: "撤销全部访问" }).scrollIntoViewIfNeeded(); await capture(ordinaryPage, "account-access-mobile");
  await ordinaryPage.getByLabel("当前密码", { exact: true }).fill("fictional-reset-password"); await ordinaryPage.getByLabel("新密码", { exact: true }).fill("fictional-final-password"); await ordinaryPage.getByLabel("确认新密码", { exact: true }).fill("fictional-final-password");
  await ordinaryPage.getByRole("button", { name: "修改密码", exact: true }).click(); await ordinaryPage.getByRole("dialog", { name: "修改密码", exact: true }).getByRole("button", { name: "修改并退出" }).click(); await ordinaryPage.waitForURL(baseURL + "/");
  checks.push("个人账号设置全视口、访问控制底部和修改密码后完整退出");

  await page.getByRole("article").filter({ hasText: person.email }).getByRole("button", { name: "管理", exact: true }).click(); manageDialog = page.getByRole("dialog", { name: "管理账号", exact: true });
  await manageDialog.getByLabel("停用原因").fill("保留中的停用草稿");
  await db.update(schema.session).set({ adminVerifiedAt: new Date(0) }).where(eq(schema.session.id, identity.session.id));
  await manageDialog.getByRole("button", { name: "生成密码重设链接", exact: true }).click(); await page.getByRole("dialog", { name: "生成密码重设链接", exact: true }).getByRole("button", { name: "确认", exact: true }).click();
  await page.getByRole("heading", { name: "输入密码以继续管理" }).waitFor();
  await page.getByLabel("当前密码", { exact: true }).fill(owner.password); await page.getByRole("button", { name: "验证并进入" }).click();
  manageDialog = page.getByRole("dialog", { name: "管理账号", exact: true }); await manageDialog.waitFor(); assert.equal(await manageDialog.getByLabel("停用原因").inputValue(), "保留中的停用草稿");
  await manageDialog.getByRole("button", { name: "停用账号", exact: true }).click(); await page.getByRole("dialog", { name: "停用账号", exact: true }).getByRole("button", { name: "确认", exact: true }).click(); await page.getByText("已停用", { exact: true }).waitFor(); await capture(page, "admin-suspended-mobile");
  const suspendedContext = await launched.newContext({ viewport: { width: 390, height: 640 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const suspendedPage = await suspendedContext.newPage(); watch(suspendedPage); await suspendedPage.goto(baseURL);
  await suspendedPage.waitForSelector('main[data-images-ready="true"]');
  await suspendedPage.locator(".home-stage").tap({ position: { x: 12, y: 110 } }); await suspendedPage.waitForSelector('main[data-phase="LOGIN_READY"]');
  await suspendedPage.locator("#email").fill(person.email); await suspendedPage.locator("#password").fill("fictional-final-password"); await suspendedPage.locator("button[type=submit]").click();
  await suspendedPage.getByRole("alert").filter({ hasText: "账号已停用" }).waitFor(); await suspendedPage.getByText("忘记密码？", { exact: true }).click(); await capture(suspendedPage, "login-suspended-mobile"); await suspendedContext.close();
  await page.getByRole("article").filter({ hasText: person.email }).getByRole("button", { name: "管理", exact: true }).click(); await page.getByRole("dialog", { name: "管理账号", exact: true }).getByRole("button", { name: "恢复账号", exact: true }).click(); await page.getByRole("dialog", { name: "恢复账号", exact: true }).getByRole("button", { name: "确认", exact: true }).click();
  await page.getByRole("article").getByText("正常", { exact: true }).waitFor(); await page.getByRole("button", { name: "操作记录", exact: true }).click(); await capture(page, "admin-events-mobile");
  checks.push("管理验证过期后保留筛选与草稿，重新验证后停用／恢复并可查审计");

  await page.setViewportSize({ width: 1440, height: 900 }); await capture(page, "admin-events-desktop");
  for (const [width, height] of [[1440, 900], [390, 640]]) {
    await page.setViewportSize({ width, height });
    for (const path of ["/dashboard", "/dashboard/meals", "/dashboard/energy", "/dashboard/measurements"]) { await page.goto(baseURL + path); await capture(page, `existing-${path.split("/").at(-1) || "dashboard"}-${width}`); }
  }
  await page.goto(baseURL + "/dashboard/energy"); await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "录入", exact: true }).first().click();
  const energyDialog = page.getByRole("dialog", { name: "每日消耗", exact: true });
  await energyDialog.getByLabel("静息 · kcal", { exact: true }).fill("2000");
  await energyDialog.getByRole("button", { name: "＋ 添加运动", exact: true }).click();
  await energyDialog.getByLabel("运动名称 1", { exact: true }).fill("虚构账号验收跑步");
  await energyDialog.getByRole("button", { name: "分开填写", exact: true }).click();
  await energyDialog.getByLabel("纯运动消耗 · kcal 1", { exact: true }).fill("400");
  await energyDialog.getByLabel("运动期间静息 · kcal 1", { exact: true }).fill("50");
  await energyDialog.evaluate((node: HTMLElement) => { node.scrollTop = 0; }); await capture(page, "existing-energy-entry-top-mobile");
  await energyDialog.getByLabel("运动名称 1", { exact: true }).scrollIntoViewIfNeeded(); await capture(page, "existing-energy-entry-middle-mobile");
  const saveEnergy = energyDialog.getByRole("button", { name: /^保存 · / });
  const energyFooter = energyDialog.locator("summary").filter({ hasText: "时间与备注" });
  await energyFooter.scrollIntoViewIfNeeded();
  assert.equal(await energyFooter.isVisible(), true); assert.equal(await saveEnergy.isVisible(), true);
  await capture(page, "existing-energy-entry-bottom-mobile");
  await saveEnergy.click(); await energyDialog.waitFor({ state: "hidden" });
  const { readEnergySnapshot } = await import("../src/features/activities/records");
  const energy = await readEnergySnapshot(db, ownerId);
  assert.equal(Number(energy.days[0].restingKcal), 2000); assert.equal(Number(energy.activities[0].exerciseActiveKcal), 400);
  checks.push("原消耗录入顶部／中段／底部与实际保存，验证网页会话上下文兼容");
  await page.locator("summary[aria-label='账号菜单']").click(); await page.getByRole("link", { name: "账号管理", exact: true }).waitFor(); await capture(page, "owner-menu-mobile");
  checks.push("原四页桌面／手机与 owner 菜单入口回归");
  assert.deepEqual(errors, []); assert.deepEqual(requestErrors, []);
  await writeFile(resolve(artifacts, "report.json"), JSON.stringify({ engine, passed: checks, screenshots, pageErrors: errors, server5xx: requestErrors, realIOS: "未测", productionAccess: false }, null, 2));
  console.log(JSON.stringify({ engine, passed: checks.length, screenshots: screenshots.length, pageErrors: errors.length, server5xx: requestErrors.length }));
} catch (error) {
  await captureFailure?.();
  await writeFile(resolve(artifacts, "failure.json"), JSON.stringify({ message: String(error), pageErrors: errors, requestErrors }, null, 2));
  throw error;
} finally {
  await writeFile(resolve(artifacts, "server.log"), serverLog);
  await browser?.close(); child.kill("SIGTERM");
  if (child.exitCode === null) await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 5000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await socket.stop();
  // socket handler 的 close 清理经 setImmediate 排队，先让其解除 PGlite 事务再关闭 WASM。
  await new Promise<void>(resolve => setImmediate(() => setImmediate(resolve)));
  await pg.close();
}
