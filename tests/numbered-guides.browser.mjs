import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
const { chromium, webkit } = await import(process.env.FORMWARD_PLAYWRIGHT_MODULE ?? "/home/obl1vion/.local/formward-webkit-165/node_modules/playwright/index.mjs");

const [config, engine = "chromium", theme = "dark", size = "390", scenario = "tours"] = process.argv.slice(2);
const fixture = JSON.parse(await readFile(config, "utf8")), base = fixture.baseURL, width = Number(size), mobile = width < 700;
assert.equal(new URL(base).hostname, "127.0.0.1");
assert.equal(fixture.isolatedFixture, "native-postgres");
const viewport = { width, height: mobile ? 844 : 900 };
const folder = resolve(process.env.FORMWARD_GUIDE_ARTIFACTS ?? ".codex/numbered-guides-20261127/browser", engine + "-" + theme + "-" + size + "-" + scenario);
await mkdir(folder, { recursive: true });
const browser = await ({ chromium, webkit }[engine]).launch(engine === "chromium" ? { executablePath: "/home/obl1vion/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell" } : {});
const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "zh-CN", timezoneId: "Asia/Shanghai", recordVideo: { dir: folder, size: viewport } });
await context.addInitScript(value => localStorage.setItem("formward-theme", value), theme);
const page = await context.newPage(), findings = [], errors = [], expectedErrors = [], warnings = [];
page.setDefaultTimeout(18000);
if (config.includes("/dev/")) page.setDefaultNavigationTimeout(90000);
let expectingFailure = false;
page.on("pageerror", error => {
  if (/^ResizeObserver loop/.test(error.message)) warnings.push(error.message);
  else if (expectingFailure && /Server Components|CONNECTION_CLOSED|Failed query|An error occurred/i.test(error.message)) expectedErrors.push(error.message);
  else errors.push(error.message);
});
const visible = selector => page.locator(selector).filter({ visible: true });
const layer = () => page.locator("[data-guide-layer]:popover-open");
const button = (name, scope = layer()) => scope.getByRole("button", { name, exact: typeof name === "string" });
async function login(account = fixture.account) {
  await context.clearCookies();
  const key = createHash("sha256").update(account.email).digest("hex").slice(0, 12);
  await context.addCookies(JSON.parse(await readFile(config + "-session-" + key + ".json", "utf8")).cookies);
}
async function visit(path, commit = false) {
  await page.goto(base + path, { waitUntil: commit ? "commit" : "domcontentloaded" });
  await page.getByText("隔离测试 · 虚构数据", { exact: true }).waitFor();
}
async function shot(name) { await page.screenshot({ path: join(folder, name + ".png") }); console.log(name); }
async function open(task) {
  // 等待真实DOM事件绑定，不等待健康数据、网络空闲或任意固定时长。
  await page.waitForFunction(name => [...document.querySelectorAll('[data-task-guide]')].some(node => node.dataset.taskGuide === name && node.getClientRects().length && typeof node.querySelector('button')?.onclick === 'function'), task);
  await visible('[data-task-guide="' + task + '"]').getByRole("button", { name: "使用指引" }).click(); await layer().waitFor();
}
async function counter(index, total) { await layer().getByText(index + " / " + total, { exact: true }).waitFor(); }
async function ready(target) {
  await page.waitForFunction(name => document.querySelector('[data-guide-layer]:popover-open')?.dataset.guidePhase === "ready" &&
    [...document.querySelectorAll('[data-guide-highlight="tour"]')].some(node => node.dataset.guideTarget === name), target);
  await page.waitForTimeout(120);
  const measured = await page.evaluate(name => {
    const target = [...document.querySelectorAll('[data-guide-highlight="tour"]')].find(node => node.dataset.guideTarget === name);
    const frame = document.querySelector('[data-guide-layer]:popover-open [data-guide-frame]');
    if (!target || !frame) return null;
    const a = target.getBoundingClientRect(), b = frame.getBoundingClientRect(), rail = target.closest('[data-metric-layout="rail"]')?.getBoundingClientRect();
    const header = document.querySelector(".dashboard-header")?.getBoundingClientRect(), dock = document.querySelector("[data-workspace-dock]")?.getBoundingClientRect();
    const expected = { left: Math.max(a.left - 2, 3, rail?.left ?? 0), right: Math.min(a.right + 2, innerWidth - 3, rail?.right ?? innerWidth),
      top: Math.max(a.top - 2, 3, header?.height ? header.bottom + 3 : 3, rail?.top ?? 0),
      bottom: Math.min(a.bottom + 2, innerHeight - 3, dock?.height ? dock.top - 3 : innerHeight, rail?.bottom ?? innerHeight) };
    const actual = { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    return { expected, actual, delta: Math.max(...Object.keys(actual).map(key => Math.abs(actual[key] - expected[key]))),
      hiddenCache: !!target.closest('[inert],[hidden],[data-return-prepared]'), railLeft: target.closest('[data-metric-rail]')?.scrollLeft ?? null };
  }, target);
  assert.ok(measured && !measured.hiddenCache && measured.delta <= 1, JSON.stringify({ target, measured }));
  findings.push({ target, ...measured });
}
async function closed() {
  await layer().waitFor({ state: "hidden" });
  await page.waitForTimeout(220);
  assert.equal(await page.locator("[data-guide-highlight],html[data-guide-tour]").count(), 0);
}
async function next(target) { await button("下一步").click(); if (target) await ready(target); }
const overview = ["overview-today", "overview-intake", "overview-morning-weight", "overview-energy", "overview-trend", "overview-record"];

async function tours() {
  await visit("/dashboard"); await open("overview");
  for (let index = 0; index < overview.length; index++) {
    await counter(index + 1, 6); await ready(overview[index]); await shot("overview-" + (index + 1));
    if (index < 5) await next(); else { await button("完成").click(); await closed(); }
  }
  for (const [path, kind] of [["meals", "nutrition"], ["energy", "energy"], ["measurements", "body"]]) {
    await visit("/dashboard/" + path); await open(kind + "-page");
    for (const [index, target] of ["trend-" + kind + "-metrics", "trend-range", "trend-chart", "selected-day-details"].entries()) {
      await counter(index + 1, 4); await ready(target); await shot(kind + "-" + (index + 1));
      if (index < 3) await next(); else { await button("完成").click(); await closed(); }
    }
  }
  await visit("/dashboard"); await open("overview"); await ready(overview[0]);
  await button("下一步").dblclick({ delay: 1 }); await ready(overview[1]); await counter(2, 6);
  await next(overview[2]); await shot("morning-after-rapid-next");
  await page.setViewportSize({ width: width + 12, height: viewport.height }); await ready(overview[2]);
  await page.setViewportSize(viewport); await ready(overview[2]);
  await button("上一步").click(); await ready(overview[1]); await next(overview[2]);
  const card = visible('[data-guide-target="overview-morning-weight"][data-guide-highlight]');
  await card.click({ position: { x: 25, y: 20 } }); await closed(); await page.waitForURL(url => url.pathname === "/dashboard/measurements");
  await page.goBack(); await visible('[data-task-guide="overview"]').waitFor(); await closed();
  await open("overview"); await ready(overview[0]); await button("下一步").click(); await button("跳过全部").click(); await closed();
  await open("overview"); await ready(overview[0]); await button("下一步").click(); await button("关闭使用指引").click(); await closed();
  await open("overview"); await ready(overview[0]); await page.keyboard.press("Tab"); await page.keyboard.press("Escape"); await closed();
  await page.keyboard.press("Tab"); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[data-guide-layer]')), false);
  await open("overview"); await ready(overview[0]);
  await visible('nav[aria-label="主导航"] a[href="/dashboard/energy"]').first().click(); await closed(); await page.waitForURL(url => url.pathname === "/dashboard/energy");
  await open("energy-page"); await ready("trend-energy-metrics"); await visible(".dashboard-logo").click(); await closed(); await page.waitForURL(url => url.pathname === "/dashboard");
  await open("overview"); await ready(overview[0]); await page.goBack(); await closed();
  findings.push({ interactions: ["全部编号与真实目标", "晨重横向吸附", "快速前进防重", "前后步骤", "尺寸接管", "卡片跳转与缓存返回", "切步时跳过及关闭", "主导航", "Logo", "浏览器返回"] });
}
async function database(delayMs, failQueries = false) {
  assert.ok(fixture.delayControlURL?.startsWith("http://127.0.0.1:"));
  const response = await fetch(fixture.delayControlURL, { method: "POST", body: JSON.stringify({ delayMs, failQueries }) });
  assert.equal(response.status, 200);
}
async function loading() {
  for (const [path, task, target, index, total] of [["", "overview", overview[2], 3, 6], ["/energy", "energy-page", "trend-energy-metrics", 1, 4], ["/meals", "nutrition-page", "trend-nutrition-metrics", 1, 4], ["/measurements", "body-page", "trend-body-metrics", 1, 4]]) {
    await database(1800); await visit("/dashboard" + path, true);
    const entry = visible('[data-task-guide="' + task + '"]'); await entry.waitFor();
    assert.ok(await visible("[data-workspace-reading=true]").count(), "真实数据返回前入口可见");
    const before = await entry.boundingBox(); await open(task);
    for (let n = 1; n < index; n++) { await button("下一步").click(); await counter(n + 1, total); }
    await counter(index, total); await shot(task + "-pending");
    assert.equal(await page.locator('[data-guide-layer][data-guide-phase=ready]:popover-open').count(), 0);
    await database(0); await ready(target); await counter(index, total);
    const after = await visible('[data-task-guide="' + task + '"]').boundingBox();
    assert.ok(before && after && Math.abs(before.x - after.x) <= 1 && Math.abs(before.y - after.y) <= 1, JSON.stringify({ task, before, after }));
    await shot(task + "-same-step-ready"); await button("关闭使用指引").click(); await closed();
  }
  expectingFailure = true; await database(0, true); await visit("/dashboard", true); await open("overview");
  for (let n = 1; n < 3; n++) { await button("下一步").click(); await counter(n + 1, 6); }
  await layer().getByText("此区域读取失败，可以重试或返回页面。", { exact: true }).waitFor();
  await counter(3, 6); await shot("failure-step-three");
  await database(0); await button("重试").click(); await ready(overview[2]); await counter(3, 6); await shot("retry-keeps-step-three");
  expectingFailure = false; await button("返回页面").count(); await button("跳过全部").click(); await closed();
  expectingFailure = true; await database(0, true); await visit("/dashboard/energy", true); await open("energy-page");
  await layer().getByText("此区域读取失败，可以重试或返回页面。", { exact: true }).waitFor();
  await button("返回页面").click(); await closed(); await database(0);
  await page.getByRole("button", { name: "重新读取", exact: true }).filter({ visible: true }).first().click();
  await visible('[data-workspace-reading=true]').waitFor({ state: "hidden" }); await closed(); expectingFailure = false;
  findings.push({ loading: ["四个入口首帧可见", "数据未就绪可打开", "同一步接管", "固定入口槽位≤1px", "真实读取失败", "失败原位重试保留编号"] });
}
async function energy() {
  await login(fixture.devices.find(account => account.name === "cumulative")); await visit("/dashboard/energy");
  await visible('[data-panel-presentation="energy"]:not([data-trend-pending])').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(node => node.textContent === '查看今日累计' && typeof node.onclick === 'function'));
  await visible('[data-panel-presentation="energy"] svg[aria-label="每日消耗柱状图"]').waitFor();
  const card = visible('[data-guide-target="trend-energy-metrics"]').first();
  const geometry = await card.evaluate(node => {
    const figure = node.querySelector(".energy-composition"), track = figure?.querySelector(".energy-share-track"), rows = figure?.querySelectorAll("figcaption>span");
    const box = element => { if (!element) return null; const b = element.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
    return { card: box(node), track: box(track), rows: rows ? [...rows].map(box) : [], overflow: node.scrollWidth > node.clientWidth + 1,
      actions: [...node.querySelectorAll("button,a")].filter(b => b.textContent.includes("查看今日累计")).map(box), text: node.textContent,
      viewportOverflow: document.documentElement.scrollWidth > innerWidth + 1, radius: getComputedStyle(node).borderRadius };
  });
  assert.ok(!geometry.overflow && !geometry.viewportOverflow);
  if (mobile) {
    assert.equal(geometry.rows.length, 2); assert.ok(geometry.track.bottom <= geometry.rows[0].top + 1 && geometry.rows[0].bottom <= geometry.rows[1].top + 1);
    assert.ok(Math.abs(geometry.track.left - geometry.rows[0].left) <= 1 && Math.abs(geometry.rows[0].left - geometry.rows[1].left) <= 1);
    assert.equal(geometry.actions.length, 1); const action = geometry.actions[0];
    assert.ok(action.height >= 44 && action.width >= geometry.card.width - 34 && Math.abs(action.left + action.right - geometry.card.left - geometry.card.right) <= 1);
  }
  await shot("energy-composition"); findings.push({ geometry });
  const action = visible('[data-panel-presentation="energy"]').getByRole("button", { name: "查看今日累计", exact: true }).first();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(node => node.textContent === '查看今日累计' && typeof node.onclick === 'function'));
  await action.click();
  await visible("dialog[open]").last().waitFor(); await shot("energy-actual-detail");
  assert.equal(await visible("dialog[open]").getByRole("button", { name: "使用指引" }).count(), 0);
  for (const name of ["unknown", "zero", "only-total"]) {
    await login(fixture.devices.find(account => account.name === name)); await visit("/dashboard/energy");
    await open("energy-page"); await ready("trend-energy-metrics"); await button("关闭使用指引").click(); await closed();
    const values = await visible('[data-guide-target="trend-energy-metrics"]').first().evaluate(node => ({
      main: node.querySelector('[data-metric-number]')?.textContent?.replace(/\s/g, ''),
      parts: [...node.querySelectorAll('.energy-share-value')].map(part => part.textContent),
      composition: node.querySelector('.energy-composition')?.textContent,
      shares: node.querySelectorAll('.energy-share-track>span').length,
      overflow: node.scrollWidth > node.clientWidth + 1,
    }));
    assert.ok(!values.overflow); assert.equal(values.shares, 0); assert.ok(!values.composition?.includes('%'));
    if (name === "zero") { assert.match(values.main, /^0/); if (mobile) assert.deepEqual(values.parts, ["0", "0"]); }
    else if (name === "only-total") { assert.match(values.main, /^1234/); if (mobile) assert.deepEqual(values.parts, ["—", "—"]); }
    else assert.ok(!values.main || values.main.startsWith("—"));
    await shot("energy-" + name); findings.push({ name, values });
  }
}
let failure;
try {
  await login();
  if (scenario === "loading") await loading(); else if (scenario === "energy") await energy(); else await tours();
  assert.deepEqual(errors, []);
} catch (error) { failure = String(error.stack || error); await shot("failure").catch(() => {}); console.error(failure); }
finally { if (scenario === "loading") await database(0).catch(() => {}); await context.close(); await browser.close(); }
await writeFile(join(folder, "result.json"), JSON.stringify({ passed: !failure, engine, theme, width, scenario, findings, errors, expectedErrors, warnings, failure }, null, 2));
if (failure) process.exitCode = 1;
