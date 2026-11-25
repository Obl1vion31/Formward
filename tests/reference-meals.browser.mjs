import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const fixture = JSON.parse(await readFile(process.env.FORMWARD_FOOD_REFERENCE_FIXTURE, "utf8"));
const base = new URL(fixture.baseURL);
const folder = process.env.FORMWARD_FOOD_REFERENCE_ARTIFACTS;
const [engine = "chromium", size = "1280"] = process.argv.slice(2);
const width = Number(size), small = width <= 700;
const height = width === 320 ? 667 : width === 390 ? 812 : 800;
const qaName = "市场食材验收" + size + (engine === "webkit" ? "W" : "") + (process.env.FORMWARD_FOOD_REFERENCE_RUN ?? "");
const scenario = engine + "-" + size;
assert.equal(base.hostname, "127.0.0.1");
assert.match(fixture.account.email, /@example\.test$/);
assert.ok(folder && Number.isFinite(width));
await mkdir(folder, { recursive: true });

const storagePath = process.env.FORMWARD_FOOD_REFERENCE_AUTH_STATE;
const [storageState] = storagePath ? JSON.parse(await readFile(storagePath, "utf8")) : [];
const browser = await (engine === "webkit" ? webkit : chromium).launch();
const context = await browser.newContext({
  storageState, viewport: { width, height }, deviceScaleFactor: 1, isMobile: small, hasTouch: small,
  colorScheme: "dark", timezoneId: "Asia/Shanghai", locale: "zh-CN", recordVideo: { dir: folder, size: { width, height } },
});
const page = await context.newPage();
const errors = [];
const sizes = [];
const requests = [];
page.on("pageerror", error => errors.push(error.message));
page.on("requestfailed", req => requests.push({ path: new URL(req.url()).pathname, error: req.failure()?.errorText }));
await page.addInitScript(() => localStorage.setItem("formward-theme", "dark"));
page.setDefaultTimeout(14000);
const dialog = page.locator("dialog[open]").last();
const picker = dialog.getByRole("region", { name: "选择食材库" });
const detail = dialog.getByRole("region", { name: "参考食材详情" });
const meal = "番茄牛腩盖饭";
const side = "熟大白菜（无加油）";
const button = (root, name) => root.getByRole("button", { name, exact: true });
const heading = (root, name) => root.getByRole("heading", { name, exact: true });
const day = page.getByRole("region", { name: "最近记录", exact: true }).locator('[data-record-date="' + fixture.today + '"]').first();
const openPicker = () => button(dialog, "从食材库添加").click();
const search = picker.getByRole("searchbox", { name: "搜索食材" });

async function shown(name) {
  await heading(detail, name).waitFor();
  await page.waitForFunction(() => !document.querySelector("[data-reference-transition], [data-meal-pane-transition]"));
}

async function shot(name) {
  await page.mouse.move(1, 1);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const visible = [...document.querySelectorAll('[data-food-art] img')].filter(img => {
      const bounds = img.parentElement.getBoundingClientRect();
      return img.checkVisibility() && bounds.top < innerHeight && bounds.bottom > 0;
    });
    await Promise.race([Promise.all(visible.map(img => img.decode().catch(() => {}))),
      new Promise(resolve => setTimeout(resolve, 1200))]);
  });
  await page.screenshot({ path: join(folder, scenario + "-" + name + ".png") });
}

async function result(name) {
  await search.fill(name);
  await button(picker, name + "详情").click();
  await shown(name);
}

try {
  if (!storageState) {
    const login = await context.request.post(base.origin + "/api/auth/sign-in/email", { headers: { Origin: base.origin }, data: fixture.account });
    assert.equal(login.status(), 200);
  }
  await page.goto(base.origin + "/dashboard/meals");
  await page.getByText("隔离测试 · 虚构数据", { exact: true }).waitFor();
  await button(day, "编辑").click();
  await button(dialog, "添加一餐").click();
  await dialog.getByLabel("餐次", { exact: true }).fill(qaName);
  await openPicker();
  await result("番茄炖牛腩");
  const related = button(detail.getByRole("region", { name: "相关整餐" }), meal);
  await related.waitFor();
  if (width === 1280) {
    let finishRequest;
    const held = new Promise(resolve => { finishRequest = resolve; });
    await page.route(url => url.pathname === "/api/meal-reference-foods" && url.searchParams.get("id") === "tomato-brisket-rice", async route => {
      await held;
      await route.fulfill({ status: 503, body: "{}" });
    }, { times: 1 });
    await related.click();
    try {
      await detail.getByText("正在查找食材…", { exact: true }).waitFor({ timeout: 5000 });
    } finally {
      finishRequest();
    }
    await button(detail, "重试").click();
  } else {
    await related.click();
  }
  await shown(meal);
  await detail.getByRole("region", { name: "整餐组成" }).getByText(side).waitFor();
  await button(detail, "按整份记").scrollIntoViewIfNeeded();
  await shot("01-whole");
  await page.keyboard.press("Escape");
  await shown("番茄炖牛腩");
  await page.waitForFunction(() => document.activeElement?.textContent?.includes("番茄牛腩盖饭"));
  await related.click();
  await shown(meal);
  await button(detail, "加入本餐").click();
  const existing = button(dialog, meal + "的更多操作");
  await existing.waitFor();
  assert.equal(await dialog.locator("[data-meal-row]").count(), 1);
  await existing.click();
  await button(dialog, "更换食材").click();
  await result(meal);
  await button(detail, "半份").click();
  await button(detail, "拆开记").click();
  const components = detail.getByRole("region", { name: "整餐组成" });
  const beef = components.getByLabel("番茄炖牛腩可食克数", { exact: true });
  assert.equal(Number(await beef.inputValue()), 80);
  await button(detail, "按整份记").click();
  await button(detail, "一份").click();
  await button(detail, "拆开记").click();
  assert.equal(Number(await beef.inputValue()), 160);
  await beef.fill("125");
  await components.getByRole("checkbox", { name: new RegExp(side.replace(/[（）]/g, ".")) }).uncheck();
  await beef.scrollIntoViewIfNeeded();
  assert.equal(await beef.evaluate(node => getComputedStyle(node).fontSize), "16px");
  const field = await beef.boundingBox();
  assert.ok(field.height >= 44);
  const checkbox = await components.getByRole("checkbox", { name: /番茄炖牛腩/ }).boundingBox();
  assert.ok(Math.abs(field.y + field.height / 2 - checkbox.y - checkbox.height / 2) <= 1);
  assert.ok(checkbox.x < field.x);
  await components.getByText(/分项合计 · 275 g/).waitFor();
  sizes.push(await components.evaluate(node => ({ client: node.clientWidth, scroll: node.scrollWidth })));
  assert.ok(sizes.every(reading => reading.scroll <= reading.client + 1), JSON.stringify(sizes));
  await shot("02-split");
  await button(detail, "加入本餐").click();
  const rows = dialog.locator("[data-meal-row]");
  await button(dialog, "番茄炖牛腩的更多操作").waitFor();
  assert.equal(await rows.count(), 2);
  assert.equal(await existing.count(), 0);
  assert.equal(Number(await rows.getByLabel("数量 1", { exact: true }).inputValue()), 125);
  await openPicker();
  await result("无糖可乐");
  await detail.getByText("每 100 mL", { exact: true }).waitFor();
  await detail.getByLabel("饮用毫升数", { exact: true }).fill("330");
  const amount = detail.getByRole("region", { name: "本次食用量" });
  await amount.getByText("330 mL", { exact: true }).waitFor();
  await amount.getByText("0 千卡", { exact: true }).waitFor();
  await shot("03-zero");
  await button(detail, "加入本餐").click();
  await button(dialog, "无糖可乐的更多操作").waitFor();
  assert.equal(await rows.count(), 3);
  await shot("04-draft");
  await dialog.getByRole("button", { name: /^保存餐次 ·/ }).click();
  await dialog.getByRole("heading", { name: /编辑饮食/ }).waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await day.waitFor();
  await button(day, "查看").click();
  const saved = dialog.locator("[data-meal-day-list] details").filter({ has: page.getByText(qaName, { exact: true }) });
  const mealRow = saved.last();
  await mealRow.locator(":scope > summary").click();
  const beverage = mealRow.locator("[data-saved-food-list] > details").filter({ hasText: "无糖可乐" });
  assert.match(await beverage.locator("summary").innerText(), /330 mL[\s\S]*0\s*kcal/);
  await beverage.locator("summary").click();
  await beverage.locator("[data-reference-evidence]").getByText("饮用量 330 mL", { exact: true }).waitFor();
  assert.match(await beverage.innerText(), /11788366/);
  assert.match(await mealRow.innerText(), /番茄炖牛腩[\s\S]*白米饭/);
  assert.ok(!(await mealRow.innerText()).includes(meal));
  await shot("05-saved");
  await page.goto(base.origin + "/dashboard/meals?section=foods");
  const library = page.locator('[data-reference-library]:not([data-reference-picker]):visible');
  await library.getByRole("searchbox", {name: "搜索食材"}).fill("大白菜");
  await button(library, side + "详情").click();
  const independent = library.getByRole("region", {name:"参考食材详情"});
  await button(independent.getByRole("region", {name:"相关整餐"}), meal).click();
  await heading(independent, meal).waitFor();
  await button(independent, "← 返回上个食材").click();
  await heading(independent, side).waitFor();
  await shot("06-side-link");
  const unexpected = errors.filter(error => engine !== "webkit" || error !== "Load failed" ||
    !requests.some(request => request.path === "/dashboard/meals" && request.error === "Load request cancelled"));
  assert.deepEqual(unexpected, []);
  await writeFile(join(folder, scenario + "-measurements.json"), JSON.stringify({ width, height, componentWidths: sizes, pageErrors: errors }, null, 2));
  console.log(scenario + " 整份、拆分替换、零糖可乐保存读回和配菜返回通过");
} catch (error) {
  await shot("failure").catch(() => {});
  console.error(JSON.stringify({ errors, requests }));
  throw error;
} finally {
  await context.close();
  const video = await page.video()?.path();
  if (video) await page.video()?.saveAs(join(folder, scenario + "-market-flow.webm"));
  await browser.close();
}
