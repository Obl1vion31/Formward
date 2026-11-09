import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const config = JSON.parse(await readFile(process.env.FORMWARD_SOURCES_CONFIG, "utf8"));
assert.ok(config.isolatedFixture && config.fictional && new URL(config.baseURL).hostname === "127.0.0.1");
const engines = await import("/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
const engine = process.env.FORMWARD_SOURCES_ENGINE ?? "chromium", browser = await engines[engine].launch({ headless: true });
const folder = resolve(process.env.FORMWARD_SOURCES_ARTIFACTS ?? ".codex/data-sources-browser") + "/" + engine;
await mkdir(folder, { recursive: true });
const checks = [], screenshots = [], contexts = [], errors = [];
async function login(index, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, locale: "zh-CN", timezoneId: "Asia/Shanghai", reducedMotion: "reduce" }); contexts.push(context);
  const result = await context.request.post(config.baseURL + "/api/auth/sign-in/email", { headers: { Origin: config.baseURL }, data: { email: config.users[index].email, password: config.users[index].password } }); assert.equal(result.status(), 200);
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message)); page.setDefaultTimeout(15000);
  await page.goto(config.baseURL + "/dashboard/sources"); await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready); return { page, context };
}
async function shot(page, name) { const path = folder + "/" + name + ".png"; await page.screenshot({ path }); screenshots.push(path); }
try {
  const { page, context } = await login(0);
  const panel = page.locator("[data-source-access='available']");
  assert.equal(await page.getByText("输入个人密钥", { exact: true }).isVisible(), true);
  assert.equal(await page.getByText("更换个人密钥", { exact: true }).count(), 0);
  await context.addInitScript(() => {
    window.__sourceLoadingFrames = [];
    const started = performance.now();
    function sample() {
      const panel = document.querySelector("[data-source-access]"), section = panel?.querySelector("section[aria-label='Garmin Personal 连接']");
      if (section && document.fonts.status === "loaded") {
        const nodes = [section.querySelector("h2"), section.querySelector("[role='status']"), section.querySelector("details > summary"), section.querySelector("legend"), [...section.querySelectorAll("details > summary")].at(-1)];
        if (nodes.every(Boolean)) window.__sourceLoadingFrames.push({ pending: panel.getAttribute("aria-busy") === "true", anchors: nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
      }
      if (performance.now() - started < 7000) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await context.request.post(config.delayControlURL, { data: { delayMs: 1400 } });
  await page.reload(); await page.waitForLoadState("networkidle"); await page.waitForFunction(() => document.querySelector("[data-source-access]")?.getAttribute("aria-busy") === "false");
  await context.request.post(config.delayControlURL, { data: { delayMs: 0 } });
  const frames = await page.evaluate(() => window.__sourceLoadingFrames);
  const loading = frames.filter(frame => frame.pending), settled = frames.filter(frame => !frame.pending);
  assert.ok(loading.length >= 2 && settled.length >= 2, "必须记录加载及接管后的真实过程");
  const final = settled.at(-1); let maxDelta = 0;
  for (const frame of frames) for (let i = 0; i < frame.anchors.length; i++) for (const key of ["x", "y", "width", "height"]) maxDelta = Math.max(maxDelta, Math.abs(frame.anchors[i][key] - final.anchors[i][key]));
  await writeFile(folder + "/loading-frames.json", JSON.stringify({ maxDelta, frames }, null, 2));
  assert.ok(maxDelta <= 1, "连接页加载锚点不得位移超过1px：" + maxDelta); checks.push("慢速数据库读取全过程锚点偏差≤1px");
  await page.getByText("输入个人密钥", { exact: true }).click();
  const key = page.getByLabel("Personal API 密钥", { exact: true });
  const station = page.getByLabel("Garmin 站点");
  assert.equal(await station.inputValue(), "global");
  await station.selectOption("china");
  assert.equal(await key.getAttribute("type"), "password");
  assert.equal(await page.getByRole("button", { name: "连接并同步", exact: true }).isDisabled(), true);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; localStorage.setItem("formward-theme", value); }, theme);
    for (const [width, height] of [[320, 560], [390, 640], [430, 780], [844, 390], [1100, 850], [1440, 1000]]) {
      await page.setViewportSize({ width, height }); await page.evaluate(() => window.scrollTo(0, 0));
      const dimensions = await key.evaluate(node => ({ font: parseFloat(getComputedStyle(node).fontSize), height: node.getBoundingClientRect().height, width: node.getBoundingClientRect().width, parent: node.parentElement.getBoundingClientRect().width, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
      assert.ok(dimensions.font >= 16 && dimensions.height >= 44 && dimensions.width <= dimensions.parent + 1 && dimensions.overflow <= 1, JSON.stringify(dimensions));
      await shot(page, "first-key-" + theme + "-" + width);
    }
  }
  checks.push("首次输入、密码字段、两主题六种尺寸及触控尺寸");
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto(config.baseURL + "/dashboard/energy"); await page.waitForLoadState("networkidle");
  await page.locator("summary[aria-label='账号菜单']").click();
  await page.getByRole("button", { name: "外部接入", exact: true }).click();
  await page.getByRole("button", { name: "设备与数据来源", exact: true }).click();
  const sheet = page.getByRole("dialog"); await sheet.getByText("输入个人密钥", { exact: true }).waitFor();
  await sheet.getByText("输入个人密钥", { exact: true }).click();
  await sheet.getByLabel("Personal API 密钥", { exact: true }).waitFor({ state: "visible" });
  await shot(page, "first-key-mobile-sheet");
  const sheetSave = sheet.getByRole("button", { name: "保存并同步", exact: true });
  await sheetSave.evaluate(node => node.scrollIntoView({ block: "center" }));
  assert.equal(await sheetSave.evaluate(node => { const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.height >= 44 && (hit === node || node.contains(hit)); }), true);
  await shot(page, "first-key-mobile-sheet-bottom");
  await page.keyboard.press("Escape"); await sheet.waitFor({ state: "hidden" }); checks.push("手机账号菜单实际进入底部面板并可返回");
  await page.goto(config.baseURL + "/dashboard/sources"); await page.waitForLoadState("networkidle");
  await page.getByText("输入个人密钥", { exact: true }).click(); await station.selectOption("china"); await key.fill("fictional-garmin-cn");
  await page.route("**/dashboard/sources", async route => { if (route.request().method() === "POST") await route.abort("failed"); else await route.continue(); });
  await page.getByRole("button", { name: "连接并同步", exact: true }).click();
  await page.getByText("连接未完成，当前输入已保留，请重试。", { exact: true }).waitFor();
  assert.equal(await key.inputValue(), "fictional-garmin-cn");
  await page.unroute("**/dashboard/sources"); await shot(page, "network-failure-kept-input");
  checks.push("提交失败保留输入，可以原位重试");
  await key.fill("fictional-garmin-cn-slow");
  let posts = 0; page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/dashboard/sources") posts++; });
  const button = page.getByRole("button", { name: "连接并同步", exact: true });
  await button.scrollIntoViewIfNeeded(); const bounds = await button.boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  const busyButton = page.getByRole("button", { name: "正在连接并同步…", exact: true }); await busyButton.waitFor();
  assert.equal(await busyButton.isDisabled(), true); assert.equal(await panel.getAttribute("aria-busy"), "true");
  await shot(page, "connecting-local-feedback");
  await page.getByText("设置已保存。同步完成。", { exact: true }).waitFor();
  assert.equal(posts, 1); assert.equal(await key.inputValue(), "");
  assert.equal(await page.getByText("更换个人密钥", { exact: true }).isVisible(), true);
  await shot(page, "connected-mobile");
  checks.push("连接后立即同步、连续点击只提交一次、成功清空密钥");
  await page.reload(); await page.waitForLoadState("networkidle");
  assert.equal(await page.getByText("更换个人密钥", { exact: true }).isVisible(), true);
  assert.equal(await page.getByRole("button", { name: "立即同步", exact: true }).isEnabled(), true);
  assert.equal(await station.inputValue(), "china");
  const other = await login(1);
  assert.equal(await other.page.getByLabel("Garmin 站点").inputValue(), "global");
  await other.page.getByRole("button", { name: "立即同步", exact: true }).click();
  await other.page.getByText("同步完成。", { exact: true }).waitFor();
  const state = await (await context.request.get(config.controlURL + "/state")).json();
  assert.ok(state[0].totals.length && state[0].totals.every(value => Number(value) === 2650));
  assert.ok(state[1].totals.length && state[1].totals.every(value => Number(value) === 2750));
  assert.ok(state.every(owner => owner.connections.length === 1 && owner.connections[0].encrypted));
  assert.notEqual(state[0].connections[0].id, state[1].connections[0].id);
  assert.equal(state[1].connections[0].legacyUnchanged, true);
  await shot(other.page, "connected-desktop"); checks.push("两个真实登录账号分别同步自己的数据，刷新持久化且凭据加密");
  await page.getByText("更换个人密钥", { exact: true }).click();
  await key.fill("fictional-garmin-cn");
  assert.equal((await context.request.post(config.controlURL + "/version-conflict")).status(), 204);
  await page.getByRole("button", { name: "更换并同步", exact: true }).click();
  await page.getByText("连接已经改变，请重新读取后重试。", { exact: true }).waitFor();
  assert.equal(await key.inputValue(), "fictional-garmin-cn"); await shot(page, "version-conflict-kept-input");
  checks.push("并发版本冲突阻止覆盖并保留输入");
  assert.equal((await context.request.get(config.baseURL + "/api/internal/source-sync")).status(), 401);
  assert.equal((await context.request.get(config.baseURL + "/api/internal/source-sync?userId=" + config.users[0].id, { headers: { Authorization: "Bearer fictional-garmin-cron-secret" } })).status(), 400);
  const scheduled = await context.request.get(config.baseURL + "/api/internal/source-sync", { headers: { Authorization: "Bearer fictional-garmin-cron-secret" } });
  assert.equal(scheduled.status(), 200); const report = await scheduled.json(); assert.equal(report.processed, 2); assert.equal(report.failed, 0);
  assert.ok(!JSON.stringify(report).includes(config.users[0].id)); checks.push("后台任务鉴权、拒绝外传账号参数并分别调度本人连接");
  assert.deepEqual(errors, []);
  await writeFile(folder + "/report.json", JSON.stringify({ passed: true, engine, checks, screenshots, errors, realDevice: "未测试" }, null, 2));
  console.log(engine + " data sources passed: " + checks.length + " checks, " + screenshots.length + " screenshots");
} catch (error) {
  for (const [index, context] of contexts.entries()) { const page = context.pages()[0]; if (page) await shot(page, "failure-" + index); }
  await writeFile(folder + "/failure.json", JSON.stringify({ error: String(error), checks, errors }, null, 2)); throw error;
} finally { for (const context of contexts) await context.close(); await browser.close(); }
