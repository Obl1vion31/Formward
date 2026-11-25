import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const folder = process.env.FORMWARD_FOOD_REFERENCE_ARTIFACTS;
const fixture = JSON.parse(await readFile(process.env.FORMWARD_FOOD_REFERENCE_FIXTURE, "utf8"));
const [storageState] = JSON.parse(await readFile(process.env.FORMWARD_FOOD_REFERENCE_AUTH_STATE, "utf8"));
assert.equal(new URL(fixture.baseURL).hostname, "127.0.0.1");
assert.match(fixture.account.email, /@example\.test$/);
const [engine = "chromium", size = "320", theme = "dark", motion = "no-preference"] = process.argv.slice(2);
const width = Number(size);
assert.ok([320, 390, 1280].includes(width));
const mobile = width < 700;
const height = width === 320 ? 667 : width === 390 ? 812 : 800;
const scenario = [engine, size, theme, motion].join("-");
await mkdir(folder, { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch();
const context = await browser.newContext({
  storageState, viewport: { width, height }, colorScheme: theme, reducedMotion: motion,
  isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, locale: "zh-CN", timezoneId: "Asia/Shanghai",
  ...(process.env.FORMWARD_PANEL_VIDEO === "1" ? { recordVideo: { dir: folder, size: { width, height } } } : {}),
});
await context.addInitScript(value => localStorage.setItem("formward-theme", value), theme);
const page = await context.newPage();
page.setDefaultTimeout(12000);
const failures = [];
page.on("pageerror", error => failures.push(error.message));
const dialog = page.locator("dialog[data-inspector][open]").last();
const header = dialog.locator("[data-inspector-heading]");
const heading = header.getByRole("heading", { level: 2 });
const detail = dialog.getByRole("region", { name: "参考食材详情", exact: true });
const button = (root, name) => root.getByRole("button", { name, exact: true });
const base = path => fixture.baseURL + "/dashboard/" + path;
const journal = {};
const waitFocus = async locator => {
  await locator.waitFor();
  await page.waitForFunction(node => node === document.activeElement, await locator.elementHandle());
};

async function inspect(label, title, { back, shortLabel, multiline = false, screenshot = true } = {}) {
  await header.getByRole("heading", { name: title, exact: typeof title === "string" }).waitFor();
  if (back) await button(header, back).waitFor();
  await page.waitForFunction(() => !document.querySelector("[data-reference-transition], [data-meal-pane-transition]"));
  await dialog.evaluate(async node => {
    await document.fonts.ready;
    await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const geometry = await header.evaluate(node => {
    const sheet = node.closest("dialog");
    const bounds = sheet.getBoundingClientRect();
    const label = node.querySelector("h2");
    const range = new Range();
    range.selectNodeContents(label);
    const area = range.getBoundingClientRect();
    const lines = new Set([...range.getClientRects()].filter(box => box.width > 0).map(box => Math.round(box.top / 8)));
    const row = node.getBoundingClientRect();
    const visible = Array.from(node.querySelectorAll("button")).filter(button => button.checkVisibility());
    return {
      width: bounds.width, offset: (area.left + area.right - bounds.left - bounds.right) / 2,
      overlap: visible.some(button => {
        const slot = button.getBoundingClientRect();
        return slot.left < area.right && slot.right > area.left && slot.top < area.bottom && slot.bottom > area.top;
      }),
      hitAreas: visible.map(button => {
        const slot = button.getBoundingClientRect();
        return { label: button.getAttribute("aria-label"), text: button.innerText.trim(), width: slot.width, height: slot.height };
      }),
      titleVisible: label.contains(document.elementFromPoint((area.left + area.right) / 2, (area.top + area.bottom) / 2)),
      headerHeight: row.height, lines: lines.size, scrollWidth: sheet.scrollWidth, clientWidth: sheet.clientWidth,
      scrollInset: parseFloat(getComputedStyle(sheet).getPropertyValue("--inspector-sticky-offset")),
    };
  });
  const message = label + " " + JSON.stringify(geometry);
  if (mobile) {
    assert.ok(Math.abs(geometry.offset) <= 1, message);
    assert.ok(Math.abs(geometry.scrollInset - geometry.headerHeight) <= 1, message);
    assert.ok(geometry.hitAreas.every(hit => hit.width >= 44 && hit.height >= 44), message);
    if (back && shortLabel) assert.equal(geometry.hitAreas.find(hit => hit.label === back).text.replace(/\s/g, ""), width === 320 ? "←" : "←" + shortLabel, message);
  } else {
    assert.ok(geometry.offset < -20, "桌面沿用靠左的标题布局 " + message);
    assert.ok(!geometry.hitAreas.some(hit => /展开详情|收起到半屏/.test(hit.label ?? "")), message);
  }
  assert.ok(geometry.titleVisible && !geometry.overlap, message);
  assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1, message);
  if (multiline) assert.ok(geometry.lines >= 2 && geometry.headerHeight > 64, message);
  journal[label] = geometry;
  if (screenshot) await page.screenshot({ path: join(folder, scenario + "-" + label + ".png") });
}

try {
  await page.goto(base("meals?entry=1"));
  const open = button(dialog, "从食材库添加");
  await open.waitFor();
  await inspect("meal-entry", "记录一餐");
  await open.click();

  const search = dialog.getByRole("searchbox", { name: "搜索食材", exact: true });
  const tomato = button(dialog, "番茄炖牛腩详情");
  const linked = button(detail, "番茄牛腩盖饭");
  await search.waitFor();
  if (mobile) await inspect("meal-list", "食材库", { back: "返回本餐", shortLabel: "本餐" });
  await search.fill("番茄炖牛腩");
  await tomato.click();
  if (mobile) await inspect("meal-detail", "食材详情", { back: "返回食材列表", shortLabel: "列表" });
  else await inspect("meal-detail", "记录一餐");
  await linked.click();
  if (mobile) {
    await inspect("meal-related", "食材详情", { back: "返回上个食材", shortLabel: "食材" });
    await button(header, "返回上个食材").click();
    await waitFocus(linked);
    await button(header, "返回食材列表").click();
    await waitFocus(tomato);
    assert.equal(await search.inputValue(), "番茄炖牛腩");

    for (let index = 0; index < 3; index++) {
      await tomato.click({ force: true });
      await button(header, "返回食材列表").waitFor();
      await page.keyboard.press("Escape");
      await button(header, "返回本餐").waitFor();
    }
    await button(header, "返回本餐").click();
    await waitFocus(open);
    await inspect("meal-return", "记录一餐");
  }

  await page.goto(base("meals?date=" + fixture.today));
  await dialog.locator("[data-meal-day-list]").waitFor();
  await inspect("meal-day", /饮食记录/);
  await button(header, "关闭详情").click();
  await dialog.waitFor({ state: "hidden" });
  await page.goto(base("meals?date=" + fixture.today + "&intent=edit"));
  await button(dialog, "添加一餐").click();
  await inspect("meal-day-add", "记录一餐", { back: "返回当天编辑" });
  if (mobile) {
    const long = "参考食材用量、来源与保存前的完整说明";
    const normal = await heading.textContent();
    await heading.evaluate((node, text) => { node.textContent = text; }, long);
    await inspect("long-title", long, { multiline: true });
    await heading.evaluate((node, text) => { node.textContent = text; }, normal);
  }
  await button(dialog, "手动填写").click();
  const foodName = dialog.getByLabel("自由填写食物名称", { exact: true });
  await foodName.fill("表头验收草稿");
  await button(header, "返回当天编辑").click();
  const confirm = page.getByRole("dialog", { name: "放弃尚未保存的输入？" });
  await button(confirm, "继续编辑").click();
  assert.equal(await dialog.getByLabel(/食物名称/).first().inputValue(), "表头验收草稿");
  await button(header, "返回当天编辑").click();
  await button(confirm, "放弃修改").click();
  await inspect("meal-day-return", /编辑饮食/);

  await page.goto(base("energy?entry=1"));
  await button(dialog, "手动输入").click();
  await inspect("energy-entry", "每日消耗");
  await button(header, "关闭编辑").click();
  await dialog.waitFor({ state: "hidden" });
  if (mobile) {
    await button(page, "查看记录 →").click();
    await inspect("energy-day", /消耗记录/);
    await button(header, "展开详情").click();
    await inspect("energy-expanded", /消耗记录/);
    await button(header, "收起到半屏").click();
    await inspect("energy-collapsed", /消耗记录/, { screenshot: false });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await button(page, "查看记录 →").click();
    await inspect("energy-reopened", /消耗记录/, { screenshot: false });
    await button(header, "关闭详情").click();
    await dialog.waitFor({ state: "hidden" });
  }

  await page.goto(base("measurements?entry=daytime"));
  await inspect("body-entry", /身体录入/);
  await button(header, "关闭记录详情").click();
  await dialog.waitFor({ state: "hidden" });
  await page.waitForURL(base("measurements"));
  await page.goto(base("measurements?date=" + fixture.observed));
  await dialog.locator("[data-overview-period]").first().waitFor();
  await inspect("body-day", /\d{4}\D\d{1,2}\D\d{1,2}/);

  if (mobile) {
    await page.goto(base("meals"));
    const account = page.locator('summary[aria-label="账号菜单"]');
    await account.click();
    await button(page, "更多信息").click();
    await inspect("more-information", "更多信息");
    await button(header, "关闭更多信息").click();
    await dialog.waitFor({ state: "hidden" });
    await waitFocus(account);
  }

  if (mobile && process.env.FORMWARD_PANEL_TRAINING === "1") {
    await page.goto(base("training"));
    await page.getByRole("button", { name: /^(按计划训练|开始训练|继续训练)$/ }).click();
    await button(dialog, "添加动作").click();
    await inspect("training-exercise", "添加动作", { back: "返回训练" });
    await button(header, "返回训练").click();
    await inspect("training-return", /全身力量|自由训练/);
    await button(header, "保存并收起训练").click();
    await dialog.waitFor({ state: "hidden" });
  }
  assert.deepEqual(failures, []);
  await writeFile(join(folder, scenario + "-headers.json"), JSON.stringify({ passed: true, journal }, null, 2));
} catch (error) {
  await page.screenshot({ path: join(folder, scenario + "-failure.png") });
  throw error;
} finally {
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(join(folder, scenario + "-headers.webm"));
  await browser.close();
}
