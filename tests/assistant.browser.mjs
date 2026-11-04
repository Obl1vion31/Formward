import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabase } from "../src/db/client.ts";
import { resetAssistantPending } from "./assistant-fixture.mjs";
import { addCalendarDays } from "../src/features/measurements/calendar.ts";
import { checkAssistantEdges } from "./assistant-edge.browser.mjs";

const config = JSON.parse(await readFile(process.env.FORMWARD_ASSISTANT_CONFIG ?? ".codex/assistant/preview.json", "utf8"));
assert.ok(new URL(config.databaseUrl).pathname.startsWith("/formward_browser_") || (config.isolatedFixture === "pglite" && new URL(config.databaseUrl).pathname === "/postgres"));
assert.equal(new URL(config.databaseUrl).hostname, "127.0.0.1");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(config.baseURL).hostname));
const engine = process.env.FORMWARD_ASSISTANT_BROWSER ?? "chromium";
const engines = await import(process.env.PLAYWRIGHT_MODULE ?? "/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
const browser = await engines[engine].launch({ headless: true });
const artifacts = resolve(process.env.FORMWARD_ASSISTANT_ARTIFACTS ?? `.codex/assistant/visual/${engine}`);
await mkdir(artifacts, { recursive: true });
const errors = [], serverErrors = [], checks = [], screenshots = [], connection = createDatabase(config.databaseUrl);
let fault = false;
const authCookies=new Map();
const surface = page => page.locator("[data-assistant-surface][open]");
const trigger = page => page.getByRole("button", { name: /^助手(?:，|$)/ });
async function ready(page) { await page.waitForLoadState("networkidle"); await page.waitForFunction(() => !document.querySelector(".page-loading-dialog[open]")); await page.evaluate(() => document.fonts.ready); }
async function visit(page, path) { await ready(page); await page.goto(config.baseURL + path); await ready(page); }
async function createContext({ width = 1440, height = 900, theme = "dark", empty = false, timezone = "Asia/Shanghai" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: "zh-CN", timezoneId: timezone, isMobile: width < 1000, hasTouch: width < 1000, reducedMotion: "reduce" });
  await context.addInitScript(value => { try { localStorage.setItem("formward-theme", value); } catch {} }, theme);
  const account = empty ? config.other : config.account;
  if(authCookies.has(account.email))await context.addCookies(authCookies.get(account.email));
  else{assert.equal((await context.request.post(config.baseURL + "/api/auth/sign-in/email", { headers: { Origin: config.baseURL }, data: { email: account.email, password: account.password } })).status(), 200);authCookies.set(account.email,await context.cookies());}
  context.on("page", page => {
    page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => { if (response.status() >= 500 && !fault) serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  });
  return context;
}
async function shot(page, name) { const path = `${artifacts}/${name}.png`; await page.screenshot({ path }); screenshots.push(path); }
async function open(page) { if (!await surface(page).isVisible()) await trigger(page).click(); await surface(page).waitFor(); await surface(page).getByRole("heading", { name: "小助手", exact: true }).waitFor(); }
async function close(page) { await surface(page).getByRole("button", { name: "收起小助手", exact: true }).click(); await surface(page).waitFor({ state: "hidden" }); }
try {
  await resetAssistantPending(connection.db, config.userId, config.today);
  const unauthenticated = await browser.newContext();
  assert.equal((await unauthenticated.request.get(config.baseURL + "/api/assistant-context?timezone=Asia%2FShanghai")).status(), 401);
  await unauthenticated.close();
  const auth = await createContext(), first = await auth.newPage();
  const response = await auth.request.get(config.baseURL + "/api/assistant-context?timezone=Asia%2FShanghai");
  assert.equal(response.status(), 200); assert.equal(response.headers()["cache-control"], "private, no-store");
  const payload = await response.json(); assert.equal(payload.pending.length, 1); assert.equal(payload.pending[0].date, addCalendarDays(config.today, -1));
  assert.deepEqual(Object.keys(payload).sort(), ["generatedAt", "localDate", "pending", "suggestions", "timezone"]);
  for (const query of ["", "?timezone=Mars%2FTest", "?timezone=Asia%2FShanghai&userId=other"]) assert.equal((await auth.request.get(config.baseURL + "/api/assistant-context" + query)).status(), 400);
  await first.goto(config.baseURL + "/dashboard"); await ready(first); await surface(first).waitFor(); await close(first); await first.reload(); await ready(first); await first.waitForTimeout(400); assert.equal(await surface(first).count(), 0, "刷新不重复自动出现");
  await visit(first, "/dashboard/energy"); await visit(first, "/dashboard"); await first.waitForTimeout(400); assert.equal(await surface(first).count(), 0, "返回总览不重复自动出现");
  await open(first); await first.getByRole("button", { name: "7D", exact: true }).click(); assert.equal(await surface(first).isVisible(), true, "电脑可同时操作总览"); assert.equal(await first.evaluate(() => document.documentElement.style.overflow), "");
  await first.getByLabel("账号菜单", { exact: true }).click(); await surface(first).waitFor({ state: "hidden" });
  assert.equal(await first.getByLabel("账号菜单", { exact: true }).evaluate(node => node === document.activeElement), true, "电脑收起助手后保留背景操作焦点");
  await first.getByLabel("账号菜单", { exact: true }).click(); await open(first);
  await close(first); await open(first); await surface(first).getByRole("checkbox").uncheck(); await close(first); await first.reload(); await ready(first); await first.waitForTimeout(400); assert.equal(await surface(first).count(), 0);
  await open(first); await surface(first).getByText("常用功能", { exact: true }).click();
  for (const name of ["查看教程", "AI 接入", "导出 Excel"]) assert.equal(await surface(first).getByRole("link", { name, exact: true }).count(), 1);
  await surface(first).getByRole("link", { name: "AI 接入", exact: true }).click(); await first.waitForURL("**/dashboard/ai"); await ready(first); assert.equal(await surface(first).count(), 0);
  await open(first); await surface(first).getByText("常用功能", { exact: true }).click(); await surface(first).getByRole("link", { name: "导出 Excel", exact: true }).click(); await first.waitForURL("**/dashboard/export"); await ready(first);
  const download = first.waitForEvent("download"); await first.getByRole("button", { name: /下载 Excel/ }).click(); assert.ok((await download).suggestedFilename().endsWith(".xlsx"));
  checks.push("session-only bounded API / invalid parameters / daily once / manual reopen / desktop interaction / AI and Excel");
  if (process.env.FORMWARD_ASSISTANT_CENTERING === "1") { const { checkLayoutCentering } = await import("./layout-centering.browser.mjs"); await checkLayoutCentering({ baseURL: config.baseURL, page: first, engine }); }
  await auth.close();

  const empty = await createContext({ empty: true }), emptyPage = await empty.newPage(); await emptyPage.goto(config.baseURL + "/dashboard"); await ready(emptyPage); await emptyPage.waitForTimeout(400); assert.equal(await surface(emptyPage).count(), 0, "空账号不自动催记录");
  assert.equal((await (await empty.request.get(config.baseURL + "/api/assistant-context?timezone=Asia%2FShanghai")).json()).pending.length, 0, "账号隔离");
  await open(emptyPage); await surface(emptyPage).getByText("当前没有需要核对的记录", { exact: true }).waitFor(); await shot(emptyPage, "empty-desktop"); await empty.close(); checks.push("empty account / no false completion / ownership");

  for (const [width, height] of [[320, 560], [390, 640], [390, 720], [430, 780], [390, 560], [844, 390], [1100, 900], [1440, 900]]) for (const theme of ["dark", "light"]) {
    const context = await createContext({ width, height, theme }), page = await context.newPage();
    try {
      await page.goto(config.baseURL + "/dashboard"); await ready(page); await open(page);
      const geometry = await surface(page).evaluate(node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height, overflow: node.scrollWidth > node.clientWidth + 1, modal: node.matches(":modal"), bodyOverflow: document.documentElement.style.overflow }; });
      assert.ok(geometry.x >= -1 && geometry.y >= -1 && geometry.right <= width + 1 && geometry.bottom <= height + 1); assert.equal(geometry.overflow, false);
      const mobile = width <= 700 || width === 844; assert.equal(geometry.modal, mobile); assert.equal(geometry.bodyOverflow === "hidden", mobile);
      await shot(page, `${theme}-assistant-${width}x${height}`);
      if (mobile) { for (let i = 0; i < 14; i++) { await page.keyboard.press("Tab"); assert.equal(await surface(page).evaluate(node => node.contains(document.activeElement)), true, "手机焦点循环"); } }
      await page.keyboard.press("Escape"); await surface(page).waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "");
      await open(page); await surface(page).getByRole("link", { name: "记录一餐", exact: true }).click(); await page.waitForURL("**/dashboard/meals?**"); await ready(page);
      await page.locator('form[data-entry-form="meal"]').waitFor(); assert.equal(await surface(page).count(), 0, "编辑与助手互斥");
      await trigger(page).click({ force: true }); assert.equal(await surface(page).count(), 0, "编辑时不能打开助手");
      await page.keyboard.press("Escape"); await page.locator('form[data-entry-form="meal"]').waitFor({ state: "hidden" });
      await shot(page, `${theme}-meals-${width}x${height}`); checks.push({ width, height, theme, geometry, passed: true });
    } finally { await context.close(); }
  }

  await checkAssistantEdges({ createContext, config, payload, ready, open, close, surface, shot, checks });
  const ctx = await createContext(), page = await ctx.newPage(); await page.goto(config.baseURL + "/dashboard/energy"); await ready(page);
  fault = true; await page.route("**/api/assistant-context?**", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "虚构故障" }) }));
  await open(page); await surface(page).getByText("暂时无法核对记录，请重试。", { exact: true }).waitFor(); assert.equal(await surface(page).getByText("当前没有需要核对的记录", { exact: true }).count(), 0);
  await shot(page, "read-failure"); await page.unroute("**/api/assistant-context?**"); fault = false;
  await surface(page).getByRole("button", { name: "重新核对", exact: true }).click(); await surface(page).getByText("有 1 条记录需要核对", { exact: true }).waitFor();
  await surface(page).getByRole("link", { name: "查看并补充", exact: true }).click(); await page.waitForURL("**/dashboard/meals?date=**"); await ready(page);
  const complete = page.locator("[data-meal-day-actions]").getByRole("checkbox", { name: /已记全$/ });
  fault = true;
  await page.route("**/dashboard/meals?**", route => route.request().method() === "POST" ? route.fulfill({ status: 500, body: "fictional save failure" }) : route.continue());
  await complete.click(); await page.locator("dialog[open]").getByText("当天记录状态未保存，请重试。", { exact: true }).waitFor();
  assert.equal(await complete.getAttribute("aria-checked"), "false");
  assert.equal((await (await ctx.request.get(config.baseURL + "/api/assistant-context?timezone=Asia%2FShanghai")).json()).pending.length, 1, "保存失败保留事项");
  await page.unroute("**/dashboard/meals?**"); fault = false;
  await page.keyboard.press("Escape"); await visit(page, "/dashboard"); await open(page); await surface(page).getByText("有 1 条记录需要核对", { exact: true }).waitFor();
  await surface(page).getByRole("link", { name: "查看并补充", exact: true }).click(); await page.waitForURL("**/dashboard/meals?date=**"); await ready(page);
  await complete.click(); await page.waitForFunction(() => document.querySelector("[data-meal-day-actions] [role=checkbox]")?.getAttribute("aria-checked") === "true"); await ready(page);
  await page.waitForFunction(() => [...document.querySelectorAll('button[aria-label^="助手"]')].every(node => node.getAttribute("aria-label") === "助手"));
  await page.keyboard.press("Escape"); await page.locator('dialog[open]:not(.page-loading-dialog)').waitFor({ state: "hidden" }); await visit(page, "/dashboard"); await open(page);
  await surface(page).getByText("当前没有需要核对的记录", { exact: true }).waitFor(); await close(page);
  await page.getByText("查看缺口", { exact: true }).click(); const text = await page.locator("[data-overview-range-summary]").innerText(); assert.match(text, /资料不足/); assert.ok(await page.locator("[data-overview-range-summary] a").count() > 0);
  await page.getByRole("button", { name: "90D", exact: true }).click(); await page.getByText("查看缺口", { exact: true }).click();
  assert.equal(await page.locator("[data-overview-range-summary] li").count(), 50);
  await page.getByRole("button", { name: "加载更早日期", exact: true }).click(); assert.ok(await page.locator("[data-overview-range-summary] li").count() > 50);
  checks.push("read failure and retry / actual confirmation / saved facts update assistant / range gaps");
  await ctx.close();

  const stability = await createContext(), stablePage = await stability.newPage();
  const geometry = (target = stablePage) => target.locator("[data-record-trend]").evaluate(root => { const slots = ["metrics", "range", "title", "plot"]; return { scroll: scrollY, values: slots.flatMap(slot => { const r = root.querySelector(`[data-record-slot="${slot}"]`).getBoundingClientRect(); return [r.top, r.height]; }) }; });
  for (const width of [1100, 1440, 390]) for (const route of ["/dashboard/measurements", "/dashboard"]) {
    await stablePage.setViewportSize({ width, height: width === 390 ? 720 : 900 }); await visit(stablePage, route);
    if (await surface(stablePage).isVisible()) await close(stablePage);
    const point = date => route === "/dashboard" ? stablePage.locator(`[data-overview-date="${date}"] > rect`).first() : stablePage.locator(`[data-chart-metric="weightKg"] [data-chart-date="${date}"][data-period="daytime"] circle`).first();
    if (route.endsWith("measurements") && !await point(config.estimated).count()) { await stablePage.getByRole("button", { name: "图表设置", exact: true }).click(); await stablePage.getByLabel("估计补全", { exact: true }).check(); await stablePage.keyboard.press("Escape"); }
    await point(config.observed).scrollIntoViewIfNeeded(); const observedBox = await point(config.observed).boundingBox(); await stablePage.mouse.move(observedBox.x + observedBox.width / 2, observedBox.y + observedBox.height / 2); await stablePage.waitForTimeout(150); const baseline = await geometry();
    for (const date of [config.estimated, config.observed, config.partialWeight, config.partialFat, config.estimated].filter(Boolean)) {
      const box = await point(date).boundingBox(); await stablePage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const samples = []; for (let i = 0; i < 12; i++) { samples.push(await geometry()); await stablePage.waitForTimeout(20); }
      for (const sample of samples) { assert.ok(Math.abs(sample.scroll - baseline.scroll) <= 1, "scroll position stable"); assert.ok(sample.values.every((n, i) => Math.abs(n - baseline.values[i]) <= 1), `estimate geometry stable ${JSON.stringify({ width, route, date, baseline, sample })}`); }
      assert.equal(await stablePage.locator("[data-chart-selection]").getAttribute("data-selected-date"), date, "鼠标静止不切回其他日期");
    }
    await point(config.observed).locator("..").focus(); await stablePage.keyboard.press("ArrowRight");
    const keyboard = await geometry(); assert.ok(keyboard.values.every((n, i) => Math.abs(n - baseline.values[i]) <= 1), "键盘选日布局稳定");
    await stablePage.mouse.move(0, 0); await stablePage.waitForTimeout(150); const left = await geometry(); assert.ok(left.values.every((n, i) => Math.abs(n - baseline.values[i]) <= 1), "移出后布局稳定");
    await shot(stablePage, `estimate-stable-${route === "/dashboard" ? "overview" : "body"}-${width}`); checks.push({ stability: route, width, passed: true });
  }
  await stability.close();
  const touch = await createContext({ width: 390, height: 1000 }), touchPage = await touch.newPage();
  try {
    for (const route of ["/dashboard/measurements", "/dashboard"]) {
      await visit(touchPage, route); if (await surface(touchPage).isVisible()) await close(touchPage);
      await touchPage.getByRole("button", { name: "7D", exact: true }).click();
      if (route.endsWith("measurements")) { await touchPage.getByText("统计与选项", { exact: true }).click(); await touchPage.getByLabel("估计补全", { exact: true }).check(); await touchPage.keyboard.press("Escape"); }
      const point = date => route === "/dashboard" ? touchPage.locator(`[data-overview-date="${date}"] > rect`).first() : touchPage.locator(`[data-chart-metric="weightKg"] [data-chart-date="${date}"][data-period="daytime"] circle`).first();
      await point(config.observed).tap(); const baseline = await geometry(touchPage); await point(config.estimated).tap();
      const next = await geometry(touchPage); assert.ok(next.values.every((n, i) => Math.abs(n - baseline.values[i]) <= 1), "触屏选日稳定");
      assert.equal(await touchPage.locator("[data-chart-selection]").getAttribute("data-selected-date"), config.estimated);
      if (route.endsWith("measurements")) {
        await touchPage.addStyleTag({ content: '[data-metric-label]{font-size:26px!important;line-height:40px!important}[data-metric-label] small{font-size:24px!important}[data-metric-number]{font-size:64px!important;line-height:80px!important}[data-metric-number] span{font-size:inherit!important}[data-metric-note] em{font-size:24px!important;line-height:36px!important}' });
        await point(config.observed).scrollIntoViewIfNeeded(); await point(config.observed).tap(); const enlarged = await geometry(touchPage);
        await point(config.estimated).tap(); const enlargedEstimate = await geometry(touchPage);
        assert.ok(enlargedEstimate.values.every((n, i) => Math.abs(n - enlarged.values[i]) <= 1), "200%读数字体实测与估计布局稳定");
        await shot(touchPage, "body-text-200");
      } else await shot(touchPage, "overview-touch-7d");
    }
    checks.push("real touch selection / 7D range / 200% reading text");
  } finally { await touch.close(); }
  assert.deepEqual(errors, []); assert.deepEqual(serverErrors, []);
  await writeFile(`${artifacts}/report.json`, JSON.stringify({ engine, checks, screenshots, errors, serverErrors, passed: true }, null, 2));
  console.log(JSON.stringify({ engine, checks: checks.length, screenshots: screenshots.length, errors, serverErrors, passed: true }));
} catch (error) { await writeFile(`${artifacts}/failure.json`, JSON.stringify({ error: String(error), stack: error.stack, checks, errors, serverErrors }, null, 2)); throw error; }
finally { await browser.close(); await connection.close(); }
