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
const scenario = engine + "-" + size;
const qaName = "整餐验收 · " + size + (process.env.FORMWARD_FOOD_REFERENCE_RUN ?? "");
const pace = process.env.FORMWARD_RECORD_RECIPE === "1";
assert.equal(base.hostname, "127.0.0.1");
assert.match(fixture.account.email, /@example\.test$/);
assert.ok(folder && Number.isFinite(width));
await mkdir(folder, { recursive: true });

const storagePath = process.env.FORMWARD_FOOD_REFERENCE_AUTH_STATE;
const [storageState, otherState] = storagePath ? JSON.parse(await readFile(storagePath, "utf8")) : [];
const browser = await (engine === "webkit" ? webkit : chromium).launch();
const context = await browser.newContext({
  storageState, viewport: { width, height }, deviceScaleFactor: 1, isMobile: small, hasTouch: small,
  colorScheme: "dark", timezoneId: "Asia/Shanghai", locale: "zh-CN",
  ...(pace ? { recordVideo: { dir: folder, size: { width, height } } } : {}),
});
const page = await context.newPage();
const errors = [];
const geometry = {};
page.on("pageerror", error => errors.push(error.message));
await page.addInitScript(() => localStorage.setItem("formward-theme", "dark"));
page.setDefaultTimeout(12000);
const dialog = page.locator("dialog[open]").last();
const picker = dialog.getByRole("region", { name: "选择食材库" });
const detail = dialog.getByRole("region", { name: "参考食材详情" });
const tomato = "番茄牛腩盖饭";
const wings = "可乐鸡翅";
const button = (root, name) => root.getByRole("button", { name, exact: true });
const heading = (root, name) => root.getByRole("heading", { name, exact: true });
const day = page.getByRole("region", { name: "最近记录", exact: true }).locator('[data-record-date="' + fixture.today + '"]').first();
const search = picker.getByRole("searchbox", { name: "搜索食材" });
const rows = dialog.locator("[data-meal-row]:not([data-blank-row])");
const composition = () => detail.getByRole("region", { name: /^(整餐|菜品)组成$/ });
const overview = () => detail.locator("[data-recipe-overview] > summary");
const part = id => composition().locator('[data-recipe-part="' + id + '"]');
const field = name => composition().getByLabel(name + "可食克数", { exact: true });
const pause = async (ms = 700) => { if (pace) await page.waitForTimeout(ms); };

async function click(locator, hold) {
  await locator.scrollIntoViewIfNeeded();
  if (!small && pace) await locator.hover();
  await pause(250);
  if (small) await locator.tap();
  else await locator.click();
  await pause(hold);
}
async function fill(locator, value) {
  await locator.scrollIntoViewIfNeeded();
  await locator.fill(value);
  await pause();
}
async function waitForDetail(name) {
  await heading(detail, name).waitFor();
  await page.waitForFunction(() => !document.querySelector("[data-reference-transition], [data-meal-pane-transition]"));
  await pause();
}
async function shot(name, anchor) {
  if (anchor) await anchor.scrollIntoViewIfNeeded();
  if (!small) await page.mouse.move(1, 1);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const visible = [...document.querySelectorAll("[data-food-art] img")].filter(img => {
      const bounds = img.parentElement.getBoundingClientRect();
      return img.checkVisibility() && bounds.top < innerHeight && bounds.bottom > 0;
    });
    await Promise.race([Promise.all(visible.map(img => img.decode().catch(() => {}))),
      new Promise(resolve => setTimeout(resolve, 1000))]);
  });
  await page.screenshot({ path: join(folder, scenario + "-" + name + ".png") });
}
async function result(name) {
  await search.fill(name);
  await pause();
  await click(button(picker, name + "详情"));
  await waitForDetail(name);
}
async function chooseRecipe(name) {
  await click(button(dialog, "从食材库添加"));
  await result(name);
}
async function checkGeometry(label) {
  const current = await detail.evaluate(node => ({
    client: node.clientWidth, scroll: node.scrollWidth,
    inputs: [...node.querySelectorAll("input[type=number]")].filter(input => input.checkVisibility()).map(input => ({
      height: input.parentElement.getBoundingClientRect().height, size: getComputedStyle(input).fontSize,
      innerBorder: getComputedStyle(input).borderTopWidth,
    })),
    modeButtons: [...node.querySelectorAll('[aria-label="记录方式"] > button')].map(button => button.getBoundingClientRect().height),
    checkOffsets: [...node.querySelectorAll("[data-recipe-part] input[type=checkbox]")].map(box => {
      const toggle = box.getBoundingClientRect(), caption = box.nextElementSibling.getBoundingClientRect();
      return Math.abs(toggle.y + toggle.height / 2 - caption.y - caption.height / 2);
    }),
  }));
  assert.ok(current.scroll <= current.client + 1, JSON.stringify(current));
  assert.ok(current.inputs.every(input => input.height >= 44 && input.size === "16px"), JSON.stringify(current));
  assert.ok(current.modeButtons.every(height => height >= 44), JSON.stringify(current));
  assert.ok(current.inputs.every(input => input.innerBorder === "0px"), JSON.stringify(current));
  assert.ok(current.checkOffsets.every(offset => offset <= 1), JSON.stringify(current));
  geometry[label] = current;
}
async function showDraftParts(name) {
  const menu = button(dialog, name + "的更多操作");
  await click(menu);
  const details = dialog.getByText(/查看(整餐|菜品)组成/);
  await click(details);
  return menu;
}
async function saveAndRead() {
  await click(dialog.getByRole("button", { name: /^保存餐次 ·/ }));
  await dialog.getByRole("heading", { name: /编辑饮食/ }).waitFor();
  await pause(900);
  await page.reload({ waitUntil: "domcontentloaded" });
  await day.waitFor();
  await pause(850);
  await click(button(day, "查看"));
  const mealRow = dialog.locator("[data-meal-day-list] details").filter({ has: page.getByText(qaName, { exact: true }) }).last();
  await click(mealRow.locator(":scope > summary"));
  await mealRow.locator("[data-saved-food-list] > details").first().waitFor();
  return mealRow;
}
async function savedFood(mealRow, name) {
  const saved = mealRow.locator("[data-saved-food-list] > details").filter({ has: page.getByText(name, { exact: true }) });
  await click(saved.locator(":scope > summary"));
  return saved;
}

try {
  if (!storageState) {
    const login = await context.request.post(base.origin + "/api/auth/sign-in/email", { headers: { Origin: base.origin }, data: fixture.account });
    assert.equal(login.status(), 200);
  }
  await page.goto(base.origin + "/dashboard/meals", { waitUntil: "domcontentloaded" });
  await page.getByText("隔离测试 · 虚构数据", { exact: true }).waitFor();
  await day.waitFor();
  await pause(1000);
  await click(button(day, "编辑"));
  await click(button(dialog, "添加一餐"));
  await dialog.getByLabel("餐次", { exact: true }).fill(qaName);
  await pause();

  if (!small) {
    await click(button(dialog, "从食材库添加"));
    await result("番茄炖牛腩");
    const related = button(detail.getByRole("region", { name: "相关整餐" }), tomato);
    if (!pace && width === 1280) {
      let release;
      const held = new Promise(resolve => { release = resolve; });
      await page.route(url => url.pathname === "/api/meal-reference-foods" && url.searchParams.get("id") === "tomato-brisket-rice", async route => {
        await held;
        await route.fulfill({ status: 503, body: "{}" });
      }, { times: 1 });
      try {
        await click(related);
        await detail.getByText("正在查找食材…", { exact: true }).waitFor();
      } finally { release(); }
      await click(button(detail, "重试"));
      await waitForDetail(tomato);
      await page.keyboard.press("Escape");
      await waitForDetail("番茄炖牛腩");
      await page.waitForFunction(() => document.activeElement?.textContent?.includes("番茄牛腩盖饭"));
    }
    await click(related);
    await waitForDetail(tomato);
    assert.match(await overview().innerText(), /330 g/);
    await shot("00-default", heading(detail, tomato));
    await click(overview());
    await shot("01-whole", heading(detail, tomato));
    await click(button(detail, "半份"));
    assert.match(await overview().innerText(), /165 g/);
    assert.match(await part("white-rice-cooked").innerText(), /75 g/);
    await shot("02-half", heading(detail, tomato));
    await click(button(detail, "按克"));
    await fill(detail.getByLabel("整份可食克数", { exact: true }), "277.35");
    assert.match(await overview().innerText(), /277\.35 g/);
    assert.equal(await composition().getByText(/大白菜/).count(), 0);
    await checkGeometry("whole-input");
    await shot("03-grams", heading(detail, tomato));
    await click(button(detail, "多人份"));
    const party = detail.getByLabel("食用人数", { exact: true });
    await fill(party, "1");
    assert.equal(await button(detail, "加入本餐").isDisabled(), true);
    await fill(party, "3");
    assert.match(await overview().innerText(), /990 g/);
    assert.match(await part("white-rice-cooked").innerText(), /450 g/);
    await checkGeometry("people");
    await shot("03b-people", heading(detail, tomato));
    await click(button(detail, "一份"));
    await click(button(detail, "拆开记"));
    const oldOverview = await overview().innerText();
    await fill(field("牛腩"), "115");
    await fill(field("白米饭"), "125");
    assert.match(await overview().innerText(), /330 g/);
    assert.notEqual(await overview().innerText(), oldOverview);
    await click(button(detail, "＋ 加土豆"));
    await field("土豆").fill("42");
    await pause();
    await click(button(detail, "＋ 加食材或调料"));
    await fill(detail.getByRole("searchbox", { name: "查找食材或调料" }), "食用油");
    await click(detail.getByRole("button", { name: "食用油 改量", exact: true }));
    await field("食用油").fill("8");
    await pause();
    await click(button(detail, "＋ 加食材或调料"));
    await click(detail.getByRole("button", { name: "西兰花 加入 ＋", exact: true }));
    await field("西兰花").fill("35");
    await pause();
    assert.equal(await part("vegetable-oil").count(), 1);
    assert.match(await overview().innerText(), /410 g/);
    await checkGeometry("split");
    await shot("04-split", heading(detail, tomato));
    await click(detail.getByText("配方与来源", { exact: true }));
    await detail.getByText("原菜谱投料", { exact: true }).waitFor();
    await shot("05-sources", detail.getByText("原菜谱投料", { exact: true }));
    await click(button(detail, "加入本餐"));
    await button(dialog, tomato + "的更多操作").waitFor();
    assert.equal(await rows.count(), 1);
    await shot("06-draft");
    await showDraftParts(tomato);
    await dialog.getByRole("link", { name: "土豆的来源", exact: true }).waitFor();
    await click(button(dialog, "调整整餐"));
    await waitForDetail(tomato);
    assert.equal(Number(await field("土豆").inputValue()), 42);
    assert.equal(Number(await field("食用油").inputValue()), 8);
    await fill(field("食用油"), "7");
    await click(button(detail, "更新本餐"));
    assert.equal(await rows.count(), 1);
    await chooseRecipe(wings);
    await click(button(detail, "多人份"));
    await fill(detail.getByLabel("食用人数", { exact: true }), "3");
    assert.match(await overview().innerText(), /369 g/);
    assert.equal(await part("white-rice-cooked").count(), 0);
    await click(button(detail, "加入本餐"));
    await button(dialog, wings + "的更多操作").waitFor();
    const mealRow = await saveAndRead();
    assert.equal(await mealRow.locator("[data-saved-food-list] > details").count(), 2);
    const partyFood = mealRow.locator("[data-saved-food-list] > details").filter({ hasText: wings });
    assert.match(await partyFood.locator(":scope > summary").innerText(), /3\s*人份/);
    const saved = await savedFood(mealRow, tomato);
    assert.match(await saved.locator("summary").first().innerText(), /409 g/);
    await click(saved.getByText(/查看(整餐|菜品)组成/));
    await saved.getByRole("link", { name: "番茄沙司的来源", exact: true }).waitFor();
    assert.match(await saved.innerText(), /食用油[\s\S]*7 g/);
    assert.doesNotMatch(await saved.innerText(), /大白菜/);
    await shot("07-saved", saved.getByText(/查看(整餐|菜品)组成/));
  } else {
    await chooseRecipe(wings);
    assert.match(await overview().innerText(), /123 g/);
    await shot("00-default", heading(detail, wings));
    await click(overview());
    await shot("01-whole", heading(detail, wings));
    await click(button(detail, "半份"));
    assert.match(await overview().innerText(), /61\.5 g/);
    assert.match(await part("cola-glaze").innerText(), /6 g/);
    assert.equal(await part("white-rice-cooked").count(), 0);
    await click(button(detail, "多人份"));
    await fill(detail.getByLabel("食用人数", { exact: true }), "2");
    assert.match(await overview().innerText(), /246 g/);
    await checkGeometry("people");
    await shot("02b-people", heading(detail, wings));
    await shot("02-half", heading(detail, wings));
    await click(button(detail, "按克"));
    await fill(detail.getByLabel("整份可食克数", { exact: true }), "200");
    assert.match(await overview().innerText(), /200 g/);
    await checkGeometry("whole-input");
    await click(button(detail, "一份"));
    await click(button(detail, "拆开记"));
    assert.equal(await composition().getByText(/大白菜/).count(), 0);
    await fill(field("鸡翅"), "125");
    await fill(field("普通可乐收汁"), "8");
    await fill(field("食用油"), "6");
    assert.match(await overview().innerText(), /146 g/);
    assert.equal(await part("white-rice-cooked").count(), 0);
    await click(button(detail, "＋ 加白米饭"));
    await fill(field("白米饭"), "150");
    assert.match(await overview().innerText(), /296 g/);
    await checkGeometry("split");
    await shot("04-split", heading(detail, wings));
    await click(detail.getByText("配方与来源", { exact: true }));
    await detail.getByText(/40 g 普通可乐收汁后约 12 g/).waitFor();
    await shot("05-sources", detail.getByText("原菜谱投料", { exact: true }));
    await click(button(detail, "加入本餐"));
    await button(dialog, wings + "的更多操作").waitFor();
    assert.equal(await rows.count(), 1);
    await showDraftParts(wings);
    await dialog.getByRole("link", { name: "普通可乐收汁的来源", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await click(button(dialog, "从食材库添加"));
    await result("无糖可乐");
    await fill(detail.getByLabel("饮用毫升数", { exact: true }), "330");
    const amount = detail.getByRole("region", { name: "本次食用量" });
    assert.match(await amount.locator("strong").innerText(), /0\s*千卡/);
    await shot("06-zero");
    await click(button(detail, "加入本餐"));
    await button(dialog, "无糖可乐的更多操作").waitFor();
    assert.equal(await rows.count(), 2);
    await shot("07-draft");
    const mealRow = await saveAndRead();
    assert.equal(await mealRow.locator("[data-saved-food-list] > details").count(), 2);
    const beverage = await savedFood(mealRow, "无糖可乐");
    assert.match(await beverage.locator("summary").first().innerText(), /330 mL[\s\S]*0\s*kcal/);
    assert.match(await beverage.innerText(), /饮用量 330 mL/);
    const saved = await savedFood(mealRow, wings);
    await click(saved.getByText(/查看(整餐|菜品)组成/));
    await saved.getByRole("link", { name: "普通可乐收汁的来源", exact: true }).waitFor();
    assert.match(await saved.innerText(), /普通可乐收汁[\s\S]*8 g/);
    assert.doesNotMatch(await saved.innerText(), /大白菜/);
    await shot("08-saved", saved.getByText(/查看(整餐|菜品)组成/));
  }
  await pause(1800);
  if (!pace) {
    await page.goto(base.origin + "/dashboard/meals?section=foods");
    const library = page.locator('[data-reference-library]:not([data-reference-picker]):visible');
      await library.getByRole("searchbox", { name: "搜索食材" }).fill(tomato);
    await button(library, tomato + "详情").click();
    const independent = library.getByRole("region", { name: "参考食材详情" });
    await heading(independent, tomato).waitFor();
    assert.equal(await button(independent, "拆开记").count(), 0);
    await independent.getByText("配方与来源", { exact: true }).click();
    await independent.getByText("原菜谱投料", { exact: true }).waitFor();
    await button(independent, "← 返回食材列表").click();
    assert.equal(await library.getByRole("searchbox", { name: "搜索食材" }).inputValue(), tomato);

    if (otherState) {
      const other = await browser.newContext({ storageState: otherState, viewport: { width, height } });
      try {
        const otherPage = await other.newPage();
        await otherPage.goto(base.origin + "/dashboard/meals");
        await otherPage.getByText("隔离测试 · 虚构数据", { exact: true }).waitFor();
        for (const view of await otherPage.getByRole("button", { name: "查看", exact: true }).all()) {
          if (!await view.isVisible()) continue;
          await view.click();
          await otherPage.locator("dialog[open]").waitFor();
          assert.equal(await otherPage.getByText(qaName, { exact: true }).count(), 0);
          break;
        }
      } finally { await other.close(); }
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(join(folder, scenario + "-result.json"), JSON.stringify({ width, height, engine, geometry, passed: true }, null, 2));
  console.log(scenario, "整餐实页通过", JSON.stringify(geometry));
} catch (error) {
  await page.screenshot({ path: join(folder, scenario + "-failure.png") }).catch(() => {});
  console.error(scenario, "整餐实页失败", page.url(), errors);
  throw error;
} finally {
  const video = page.video();
  await context.close();
  if (video) {
    await video.saveAs(join(folder, scenario + ".webm"));
    await video.delete();
  }
  await browser.close();
}
