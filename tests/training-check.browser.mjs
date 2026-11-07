import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const config = JSON.parse(await readFile(process.env.FORMWARD_TRAINING_CONFIG, "utf8"));
assert.ok(config.isolatedFixture || (config.productionFixture && new URL(config.baseURL).hostname === "formward-ten.vercel.app"));
const engines = await import("/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
const engine = process.env.FORMWARD_TRAINING_BROWSER ?? "chromium", browser = await engines[engine].launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
const folder = resolve(process.env.FORMWARD_TRAINING_ARTIFACTS ?? ".codex/training-browser") + "/" + engine; await mkdir(folder, { recursive: true });
const errors = [], failures = [], checks = [], screenshots = [];
const context = await browser.newContext({ viewport: { width: 390, height: 640 }, timezoneId: "Asia/Shanghai", locale: "zh-CN", reducedMotion: "reduce" });
context.on("page", page => { page.on("pageerror", e => errors.push(e.message)); page.on("response", r => { if (r.status() >= 500) failures.push(r.status() + " " + new URL(r.url()).pathname); }); });
const auth = await context.request.post(config.baseURL + "/api/auth/sign-in/email", { headers: { Origin: config.baseURL }, data: { email: config.email, password: config.password } }); assert.equal(auth.status(), 200);
await context.addInitScript(() => { try { localStorage.setItem("formward-assistant-seen-v1", "true"); } catch {} });
const page = await context.newPage(); page.setDefaultTimeout(20000);
async function ready() { await page.waitForLoadState("networkidle"); await page.evaluate(() => document.fonts.ready); }
async function saved() { await page.getByText("进度已保存 · 重量可留空", { exact: true }).waitFor(); await ready(); }
async function shot(name) { await ready(); const path = folder + "/" + name + ".png"; await page.screenshot({ path }); screenshots.push(path); }
try {
  await page.goto(config.baseURL + "/dashboard/training"); await ready();
  assert.equal(await page.locator("[data-training-view] svg[data-chart]").count(), 0);
  assert.equal(await page.getByRole("heading", { name: "消耗趋势", exact: true }).count(), 0);
  // 训练主操作后直接是月历；训练中不用健康数据占位。
  assert.ok(await page.getByRole("heading", { name: "训练日历", exact: true }).isVisible()); checks.push("训练首页移除消耗摘要");
  for (const theme of ["dark", "light"]) {
    await page.evaluate(value => { localStorage.setItem("formward-theme", value); document.documentElement.dataset.theme = value; }, theme);
    for (const [width, height] of [[320,560],[390,560],[390,640],[430,780],[640,390],[1100,800],[1440,900]]) {
      await page.setViewportSize({ width, height }); await page.evaluate(() => window.scrollTo(0, 0)); await shot("home-" + theme + "-" + width + "x" + height);
      const layout = await page.evaluate(() => { const m = document.querySelector("[data-training-view]").getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, center: m.left + m.width / 2, viewport: document.documentElement.clientWidth / 2 }; });
      assert.ok(layout.overflow <= 1, "不应横向溢出"); if (width >= 1100) assert.ok(Math.abs(layout.center - layout.viewport) <= 1, "正文应居中");
    }
  } checks.push("两主题七种尺寸");
  await page.setViewportSize({ width: 390, height: 640 }); await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  await page.getByRole("button", { name: "开始训练", exact: true }).click(); await page.locator("[data-training-editor]").waitFor();
  await page.getByLabel("杠铃卧推第1组重量公斤", { exact: true }).fill("40.5"); await page.getByLabel("杠铃卧推第1组次数", { exact: true }).fill("10");
  await page.getByLabel("杠铃卧推第1组完成", { exact: true }).click(); await saved(); await shot("session-top");
  await page.getByRole("button", { name: "添加动作", exact: true }).click(); await page.getByPlaceholder("搜索或输入自己的动作").fill("自定义长名称哑铃推举与训练动作");
  await page.getByRole("button", { name: "添加这个动作", exact: true }).click(); await page.getByLabel("自定义长名称哑铃推举与训练动作第1组次数", { exact: true }).fill("12"); await page.getByLabel("自定义长名称哑铃推举与训练动作第1组完成", { exact: true }).click(); await saved(); await shot("session-bottom");
  await page.getByRole("button", { name: "暂停", exact: true }).click(); await page.getByRole("button", { name: "继续计时", exact: true }).waitFor(); await ready();
  await page.getByRole("button", { name: "稍后继续", exact: true }).click(); await page.locator("[data-training-editor]").waitFor({ state: "detached" }); await ready();
  await page.reload(); await ready(); await page.getByRole("button", { name: "继续训练", exact: true }).click();
  assert.equal(await page.getByLabel("杠铃卧推第1组重量公斤", { exact: true }).inputValue(), "40.5"); assert.equal(await page.getByLabel("杠铃卧推第1组完成", { exact: true }).getAttribute("aria-pressed"), "true");
  assert.ok(await page.getByRole("button", { name: "继续计时", exact: true }).isVisible()); checks.push("真实保存、暂停与刷新恢复");
  await page.getByRole("button", { name: "结束训练", exact: true }).click(); await page.getByRole("button", { name: "结束并保存", exact: true }).click(); await page.getByText("训练已完成并保存。", { exact: true }).waitFor(); await ready(); await shot("finished");
  assert.ok(await page.getByText("重量未记 · 12次", { exact: false }).isVisible()); checks.push("结束与未知重量回看");
  await page.getByRole("button", { name: "存为模板", exact: true }).click(); await page.getByLabel("模板名称", { exact: true }).fill("完成后保存的模板"); await page.getByRole("button", { name: "保存模板", exact: true }).click(); await page.getByText("训练模板已保存。", { exact: true }).waitFor(); await ready();
  await page.getByRole("button", { name: "安排训练", exact: true }).click(); await page.getByRole("combobox", { name: "训练模板", exact: true }).selectOption({ label: "完成后保存的模板" }); await page.getByRole("button", { name: "加入日历", exact: true }).click(); await page.getByText("已安排到", { exact: false }).waitFor(); await ready(); checks.push("模板与排期真实保存");
  await page.getByRole("button", { name: "自由训练", exact: true }).click(); await page.locator("[data-training-editor]").waitFor(); await page.getByRole("button", { name: "结束训练", exact: true }).click(); await page.getByRole("button", { name: "放弃训练", exact: true }).click(); await page.locator("[data-training-editor]").waitFor({ state: "detached" }); checks.push("误触开始可单独放弃");
  await page.getByRole("navigation", { name: "训练与消耗", exact: true }).getByRole("link", { name: "消耗", exact: true }).click(); await ready();
  await page.waitForURL("**/dashboard/energy"); assert.ok(await page.getByRole("region", { name: "消耗历史趋势", exact: true }).isVisible()); assert.ok(await page.locator("svg").count() > 0); await shot("energy-preserved"); checks.push("原消耗图表保留");
  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  await writeFile(folder + "/report.json", JSON.stringify({ passed: true, engine, checks, screenshots, errors, failures }, null, 2)); console.log(engine + " training browser passed: " + checks.length + " checks, " + screenshots.length + " screenshots");
} catch (error) { await page.screenshot({ path: folder + "/failure.png" }); await writeFile(folder + "/failure.json", JSON.stringify({ error: String(error), errors, failures, checks }, null, 2)); throw error; }
finally { await context.close(); await browser.close(); }
