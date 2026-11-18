import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const baseURL = new URL(process.env.BETTER_AUTH_URL);
const database = new URL(process.env.DATABASE_URL);
assert.equal(baseURL.hostname, "127.0.0.1");
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/formward_security_qa");
const email = "admin-security@example.test";
const password = "fictional-security-password";
const engine = process.env.ADMIN_BROWSER ?? "chromium";
const width = Number(process.env.ADMIN_WIDTH ?? 390);
const output = join(process.env.ADMIN_ARTIFACTS ?? ".codex/admin-loading/after", engine, String(width));
await mkdir(output, { recursive: true });
// WebKit 的字体就绪会等整份流式文档完成，慢读取帧需要先截图。
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
const browser = await playwright[engine].launch();
const db = postgres(database.href, { max: 3 });
const checks = [], errors = [];
const viewport = { width, height: width < 700 ? 844 : 900 };
const options = { viewport, locale: "zh-CN", timezoneId: "Asia/Shanghai", isMobile: width < 700, hasTouch: width < 700 };

async function login(context, address) {
  const response = await context.request.post(new URL("/api/auth/sign-in/email", baseURL).href, {
    headers: { Origin: baseURL.origin }, data: { email: address, password }
  });
  assert.equal(response.status(), 200);
}

async function whileReadIsPaused(table, check) {
  const locked = Promise.withResolvers(), release = Promise.withResolvers();
  const transaction = db.begin(async tx => {
    await tx`lock table ${tx(table)} in access exclusive mode`;
    locked.resolve();
    await release.promise;
  });
  await Promise.race([locked.promise, transaction]);
  try { await check(); }
  finally { release.resolve(); await transaction; }
}

try {
  const context = await browser.newContext({
    ...options, colorScheme: width < 700 ? "dark" : "light",
    recordVideo: { dir: output }
  });
  await context.addInitScript(theme => localStorage.setItem("formward-theme", theme), width < 700 ? "dark" : "light");
  const page = await context.newPage();
  try {
    await login(context, email);
    page.setDefaultTimeout(12000);
    page.on("pageerror", error => errors.push(error.message));
    const nav = page.getByRole("navigation", { name: "管理后台栏目" });
    const heading = page.locator("[data-admin-heading]");
    const hint = heading.locator("[data-reading-status][data-visible=true] [role=status], [data-admin-cold-reading]:visible");
    const usage = page.locator("[data-usage-panel]");
    const readyUsage = usage.getByText("最近读取：", { exact: false });
    const url = path => new URL(path, baseURL).href;
    const h1 = name => page.getByRole("heading", { name, exact: true, level: 1 });
    const shot = name => page.screenshot({ path: join(output, name + ".png") });
    const geometry = async locator => {
      const box = await locator.boundingBox();
      assert.ok(box);
      return box;
    };
    const stable = async (before, locator) => {
      const after = await geometry(locator);
      for (const key of ["x", "y", "width", "height"]) {
        assert.ok(Math.abs(before[key] - after[key]) <= 1, key + " layout drift");
      }
    };

    await page.goto(url("/admin"), { waitUntil: "networkidle" });
    await page.getByLabel("当前密码").fill(password);
    await page.getByRole("button", { name: "验证并进入" }).click();
    const user = page.getByRole("link", { name: "查看用户", exact: true }).first();
    await user.waitFor();
    await page.evaluate(() => {
      window.adminHeader = document.querySelector("[data-admin-workspace] > header");
      window.adminNavigation = document.querySelector('nav[aria-label="管理后台栏目"]');
    });
    const headingBefore = await geometry(heading);
    await whileReadIsPaused("assistant_usage_requests", async () => {
      await nav.getByRole("link", { name: "用量分析", exact: true }).click();
      await hint.filter({ hasText: "正在读取…" }).waitFor();
      assert.equal(await page.locator("[data-admin-initial-loading]").count(), 0);
      assert.equal(await user.isVisible(), true);
      await stable(headingBefore, heading);
      await shot("switch-wait");
    });
    await readyUsage.waitFor();
    await hint.waitFor({ state: "hidden" });
    assert.ok(await page.evaluate(() => window.adminHeader === document.querySelector("[data-admin-workspace] > header")
      && window.adminNavigation === document.querySelector('nav[aria-label="管理后台栏目"]')));
    checks.push("慢速切栏目保留原正文和同一套导航，提示只出现一次");
    await shot("usage-ready");

    await whileReadIsPaused("assistant_usage_requests", async () => {
      await nav.getByRole("link", { name: "规则设置", exact: true }).click();
      await page.getByRole("button", { name: "新增档位", exact: true }).waitFor({ timeout: 3500 });
      await page.getByRole("link", { name: "安全与操作记录", exact: true }).click();
      await h1("安全与操作记录").waitFor({ timeout: 3500 });
      await nav.getByRole("link", { name: "用户管理", exact: true }).click();
      await user.waitFor({ timeout: 3500 });
      await page.getByRole("link", { name: "邀请", exact: true }).click();
      await page.getByRole("button", { name: "生成邀请链接", exact: true }).waitFor({ timeout: 3500 });
    });
    checks.push("规则、安全、账号和邀请切换独立于用量账本");

    await page.getByRole("link", { name: "账号", exact: true }).click();
    await user.waitFor();
    const search = page.getByRole("textbox", { name: "搜索登录邮箱" });
    await search.fill("person-02@example.test");
    const searchBefore = await geometry(search), rowBefore = await geometry(user);
    await whileReadIsPaused("users", async () => {
      await page.getByRole("button", { name: "搜索", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "正在读取账号…" }).waitFor();
      await stable(searchBefore, search);
      await stable(rowBefore, user);
      await shot("search-wait");
    });
    await page.waitForURL(u => u.searchParams.get("search") === "person-02@example.test");
    assert.equal(await search.inputValue(), "person-02@example.test");
    await user.click();
    await h1("用户概况").waitFor();
    const summary = page.getByRole("navigation", { name: "用户详情去向" });
    await summary.getByRole("link", { name: /账号设置/ }).click();
    await h1("账号设置").waitFor();
    await page.getByRole("link", { name: /返回用户概况/ }).click();
    await h1("用户概况").waitFor();
    await summary.getByRole("link", { name: /个人额度/ }).click();
    await h1("个人额度").waitFor();
    await page.getByRole("link", { name: /返回用户概况/ }).click();
    await h1("用户概况").waitFor();
    await page.getByRole("link", { name: /返回用户列表/ }).click();
    await page.waitForURL(u => u.searchParams.get("search") === "person-02@example.test");
    assert.equal(await search.inputValue(), "person-02@example.test");
    checks.push("账号搜索原位反馈，详情与两个设置往返保留筛选");

    await whileReadIsPaused("assistant_usage_requests", async () => {
      await page.goto(url("/admin?tab=usage"), { waitUntil: "commit" });
      await hint.filter({ hasText: "正在读取…" }).waitFor();
      assert.equal(await page.locator("[data-admin-initial-loading]").count(), 1);
      assert.equal(await usage.getByLabel("开始日期").count(), 1);
      await shot("direct-wait");
    });
    await readyUsage.waitFor();
    const chart = usage.locator("svg").first();
    await chart.evaluate(node => { window.adminChart = node; });
    const chartBefore = await geometry(chart);
    await whileReadIsPaused("assistant_usage_requests", async () => {
      await heading.getByRole("button", { name: "刷新数据", exact: true }).click();
      await hint.filter({ hasText: "正在读取…" }).waitFor();
      await stable(chartBefore, chart);
    });
    await hint.waitFor({ state: "hidden" });
    assert.ok(await chart.evaluate(node => node === window.adminChart));
    checks.push("直达显示已知筛选和图框，原区间刷新保留已绘制图表");

    await db`update sessions set admin_verified_at = null where user_id = 'qa-admin'`;
    await nav.getByRole("link", { name: "规则设置", exact: true }).click();
    await page.getByLabel("当前密码").waitFor();
    assert.equal(await page.getByRole("button", { name: "新增档位", exact: true }).count(), 0);
    checks.push("过期验证不会继续展示后台新内容");
    assert.deepEqual(errors, []);
    const version = await (await context.request.get(url("/api/app-version"))).json();
    const report = { passed: true, version: version.version, engine, viewport, checks };
    await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } catch (error) {
    await page.screenshot({ path: join(output, "failure.png") }).catch(() => {});
    console.error(JSON.stringify({ url: page.url(), alerts: await page.getByRole("alert").allTextContents(), errors }));
    throw error;
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
  await db.end();
}
