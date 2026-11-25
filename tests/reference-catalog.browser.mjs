import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const fixture = JSON.parse(await readFile(process.env.FORMWARD_FOOD_REFERENCE_FIXTURE, "utf8"));
const folder = process.env.FORMWARD_FOOD_REFERENCE_ARTIFACTS;
const base = new URL(fixture.baseURL);
assert.equal(base.hostname, "127.0.0.1");
assert.match(fixture.account.email, /@example\.test$/);
assert.ok(folder);
await mkdir(folder, { recursive: true });

const [engine, widthText, preference = "motion"] = process.argv.slice(2);
const width = Number(widthText);
assert.ok([320, 390, 960, 1280, 1440].includes(width));
const small = width <= 700;
const inline = width >= 1280;
const height = width === 320 ? 667 : width === 390 ? 812 : width === 1440 ? 1000 : 800;
const theme = width === 320 || width === 960 ? "light" : "dark";
const reduced = preference === "reduced";
const scenario = [engine, width, preference].join("-");
const browser = await (engine === "webkit" ? webkit : chromium).launch();
let context, page, video;
const motions = [];
const errors = [];
const cancelled = [];
const button = (root, name) => root.getByRole("button", { name, exact: true });
const heading = (root, name) => root.getByRole("heading", { name, exact: true });

async function shot(name) {
  await page.mouse.move(1, 1);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const visible = [...document.querySelectorAll("[data-food-art] img")].filter(img => {
      const art = img.parentElement;
      const { top, bottom } = art.getBoundingClientRect();
      return art.checkVisibility({ visibilityProperty: true }) && top < window.innerHeight && bottom > 0;
    });
    await Promise.race([Promise.all(visible.map(img => img.decode().catch(() => {}))),
      new Promise(resolve => setTimeout(resolve, 1200))]);
  });
  await page.screenshot({ path: join(folder, scenario + "-" + name + ".png") });
}

async function focused(locator) {
  const element = await locator.elementHandle();
  await page.waitForFunction(target => target === document.activeElement, element);
}

async function compareFold(first) {
  await page.evaluate(() => {
    const fold = document.querySelector("[data-reference-library]:not([data-reference-picker]) [data-reference-fold]");
    const frames = [];
    let frame;
    const measure = () => {
      frames.push({ time: performance.now(), height: fold.getBoundingClientRect().height });
      frame = requestAnimationFrame(measure);
    };
    measure();
    window.finishReferenceFold = () => {
      cancelAnimationFrame(frame);
      frames.push({ time: performance.now(), height: fold.getBoundingClientRect().height });
      return { frames, duration: getComputedStyle(fold).transitionDuration };
    };
  });
  await first.click();
  await page.waitForFunction(() => {
    const fold = document.querySelector("[data-reference-library]:not([data-reference-picker]) [data-reference-fold]");
    return fold.getBoundingClientRect().height > 100 && !fold.getAnimations().length;
  });
  const trace = await page.evaluate(() => window.finishReferenceFold());
  assert.ok(trace.frames.at(-1).height > 100);
  assert.equal(trace.duration.split(",")[0], reduced ? "0s" : "0.16s");
  if (reduced) {
    assert.ok(trace.frames.every(frame => frame.height < 1 || frame.height === trace.frames.at(-1).height));
  }
  motions.push({ name: "category-open", ...trace });
}

async function detailMotion(activate, direction) {
  await page.evaluate(() => {
    const root = document.querySelector("dialog[open] [data-reference-picker]");
    const frames = [];
    const effects = {};
    const update = () => {
      const transition = root.querySelector("[data-reference-transition]");
      if (!transition) return;
      for (const node of transition.querySelectorAll("[data-reference-pane]")) {
        const name = node.dataset.referencePane;
        const animation = node.getAnimations().find(animation => animation.effect.getKeyframes().some(key => key.transform));
        if (!animation || effects[name]) continue;
        effects[name] = {
          duration: animation.effect.getTiming().duration,
          x: animation.effect.getKeyframes().map(key => new DOMMatrixReadOnly(key.transform).m41),
        };
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ["data-reference-transition"] });
    let frame;
    function sample() {
      const transition = root.querySelector("[data-reference-transition]");
      if (transition) {
        update();
        const x = [...transition.querySelectorAll("[data-reference-pane]")].map(node => {
          const transform = getComputedStyle(node).transform;
          return new DOMMatrixReadOnly(transform === "none" ? "" : transform).m41;
        });
        frames.push({ kind: transition.dataset.referenceTransition, time: performance.now(), x });
      }
      frame = requestAnimationFrame(sample);
    }
    sample();
    window.finishReferenceMove = () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      return { effects, frames };
    };
  });
  await activate();
  await page.waitForFunction(direction => {
    const root = document.querySelector("dialog[open] [data-reference-picker]");
    return root.hasAttribute("data-reference-detail") === (direction === "forward") && !root.querySelector("[data-reference-transition]");
  }, direction);
  const trace = await page.evaluate(() => window.finishReferenceMove());
  if (reduced) assert.deepEqual(trace.effects, {});
  else {
    const sign = direction === "forward" ? -1 : 1;
    for (const name of ["list", "detail"]) {
      const effect = trace.effects[name];
      assert.ok(effect, direction + " " + name + " motion");
      assert.equal(effect.duration, 200);
      assert.ok((effect.x.at(-1) - effect.x[0]) * sign > 1);
    }
  }
  motions.push({ name: direction, ...trace });
}

function positions({ dialog }) {
  return dialog.evaluate(root => {
    const boxes = [
      root.querySelector('input[aria-label="餐次"]'),
      root.querySelector('[aria-labelledby$="-foods"]'),
      root.querySelector('[data-meal-footer]'),
    ];
    return boxes.map(node => {
      const { x, y, width } = node.getBoundingClientRect();
      return [x, y, width];
    });
  });
}

try {
  const sessionPath = process.env.FORMWARD_FOOD_REFERENCE_AUTH_STATE;
  let storageState;
  if (sessionPath) {
    [storageState] = JSON.parse(await readFile(sessionPath, "utf8"));
  } else {
    const auth = await browser.newContext();
    const signed = await auth.request.post(new URL("/api/auth/sign-in/email", base).href, {
      headers: { Origin: base.origin }, data: { email: fixture.account.email, password: fixture.account.password },
    });
    assert.equal(signed.status(), 200);
    storageState = await auth.storageState();
    await auth.close();
  }
  context = await browser.newContext({
    storageState, viewport: { width, height }, deviceScaleFactor: 1,
    isMobile: small, hasTouch: small, colorScheme: theme, reducedMotion: reduced ? "reduce" : "no-preference",
    recordVideo: { dir: folder, size: { width, height } }, locale: "zh-CN", timezoneId: "Asia/Shanghai",
  });
  page = await context.newPage();
  video = page.video();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push({ message: error.message, stack: error.stack, at: Date.now() }));
  page.on("requestfailed", request => cancelled.push({ path: new URL(request.url()).pathname, reason: request.failure()?.errorText, at: Date.now() }));
  await page.addInitScript(theme => localStorage.setItem("formward-theme", theme), theme);
  const dialog = page.locator("dialog[open]").last();
  const picker = dialog.getByRole("region", { name: "选择食材库" });
  const detail = dialog.getByRole("region", { name: "参考食材详情" });
  const search = picker.getByRole("searchbox", { name: "搜索食材" });
  const add = button(dialog, "从食材库添加");
  const mealRegion = dialog.getByRole("region", { name: "本餐食物" });
  const leg = "去皮炖鸡小腿";
  const row = button(picker, leg + "详情");
  const caseName = "食材验收" + width + (reduced ? "减动效" : "") + (engine === "webkit" ? "W" : "") + (process.env.FORMWARD_FOOD_REFERENCE_RUN ?? "");
  const summary = await (await context.request.get(new URL("/api/meal-reference-foods?view=summary", base).href)).json();
  assert.ok(summary.total > 17);
  const totalName = "按分类浏览 · " + summary.total + " 个参考规格";
  const day = page.getByRole("region", { name: "最近记录", exact: true }).locator('[data-record-date="' + fixture.today + '"]').first();
  const models = ["肉禽", "水产", "米面主食", "蛋奶豆", "蔬菜菌菇", "水果", "坚果种子", "油脂调味", "饮品", "零食甜点", "家常菜与外食"];

  await page.goto(new URL("/dashboard/meals", base).href);
  await page.getByText("隔离测试 · 虚构数据", { exact: true }).waitFor();
  await button(page, "食材库").click();
  const independent = page.locator('[data-reference-library]:not([data-reference-picker]):visible');
  const indepSearch = independent.getByRole("searchbox", { name: "搜索食材" });
  await heading(independent, totalName).waitFor();
  const catalogUrl = page.url();
  for (const name of models) assert.ok(await button(independent, name).isVisible());
  const categorySum = await independent.locator(":scope button[aria-describedby][aria-label]").evaluateAll(buttons =>
    buttons.filter(button => !button.closest("[inert]")).reduce((sum, button) =>
      sum + Number(document.getElementById(button.getAttribute("aria-describedby"))?.textContent.match(/^\d+/)?.[0] ?? 0), 0));
  assert.equal(categorySum, summary.total);
  await shot("01-catalog");
  await compareFold(button(independent, "肉禽"));
  await button(independent, "鸡腿").click();
  await button(independent, leg + "详情").waitFor();
  assert.equal(page.url(), catalogUrl);
  await shot("02-browse");
  await button(independent, leg + "详情").click();
  await heading(independent, leg).waitFor();
  const independentSplit = await independent.locator("[data-detail-open]").evaluate(element =>
    element.hasAttribute("data-reference-split"));
  assert.equal(independentSplit, !small && (await independent.boundingBox()).width >= 760);
  await button(independent, "← 返回食材列表").click();
  await focused(button(independent, leg + "详情"));
  await indepSearch.fill("熟");
  await button(independent, "加载更多食材").waitFor();
  const getRows = () => independent.locator("[data-reference-result]").count();
  assert.equal(await getRows(), 40);
  await button(independent, "加载更多食材").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-reference-result]").length > 40);
  assert.ok(await getRows() > 40);
  await indepSearch.fill("生菜");
  await button(independent, "生菜详情").waitFor();
  await indepSearch.fill("生鸡小腿");
  await button(independent, "生鸡腿肉（去皮去骨）详情").waitFor();
  assert.equal(await getRows(), 1);
  await indepSearch.fill("茉莉花茶");
  await button(independent, "无糖茉莉花茶（茶汤）详情").click();
  assert.match(await independent.getByRole("region", { name: "参考食材详情" }).innerText(), /O0702401/);
  await shot("03-expanded-food");
  await button(page, "← 饮食").click();
  await day.waitFor();

  await button(day, "编辑").click();
  await button(dialog, "添加一餐").click();
  await heading(dialog, "记录一餐").waitFor();
  await dialog.getByLabel("餐次", { exact: true }).fill(caseName);
  await page.waitForFunction(() => !document.querySelector("dialog[open]").getAnimations().length);
  const before = await positions({ dialog });
  await add.click();
  await heading(picker, totalName).waitFor();
  let failureRequest = false;
  let finishFailure;
  if (width === 1280 && !reduced) {
    await page.route(/\/api\/meal-reference-foods\?/, async route => {
      const query = new URL(route.request().url()).searchParams.get("q");
      if (query !== "鸡腿" || failureRequest) return route.continue();
      failureRequest = true;
      await new Promise(resolve => {
        finishFailure = resolve;
        setTimeout(resolve, 7000).unref();
      });
      await route.fulfill({ status: 503, body: "{}" });
    });
  }
  await search.fill("鸡腿");
  if (width === 1280 && !reduced) {
    await picker.getByText("正在查找食材…", { exact: true }).waitFor();
    await shot("04a-waiting");
    finishFailure();
    await picker.getByRole("alert").filter({ hasText: "食材未加载" }).waitFor();
    await shot("04b-retry");
    await button(picker, "重试").click();
  }
  await heading(picker, "5 个参考规格").waitFor();
  await row.waitFor();
  await shot("04-picker");
  await detailMotion(() => row.click(), "forward");
  await heading(detail, leg).waitFor();
  assert.equal(await mealRegion.isVisible(), inline);
  assert.equal(await search.isVisible(), false);
  assert.equal(await button(picker, "肉禽").isVisible(), false);
  if (inline) {
    const during = await positions({ dialog });
    assert.ok(during.every((box, i) => box.every((value, j) => Math.abs(value - before[i][j]) <= 1)),
      JSON.stringify({ before, during }));
    assert.ok((await detail.boundingBox()).width >= (await picker.boundingBox()).width - 45);
  }
  await button(detail, "半只").click();
  await detail.getByText("可食部约 28 g", { exact: true }).waitFor();
  await detail.getByText("约 41 千卡", { exact: true }).waitFor();
  await shot("05-detail");
  const detailBack = small || !inline ? button(dialog, "返回食材列表") : button(detail, "← 返回食材列表");
  await detailMotion(() => detailBack.click(), "back");
  assert.equal(await search.inputValue(), "鸡腿");
  await focused(row);

  if (!reduced) {
    await row.press("Enter");
    await page.keyboard.press("Escape");
    await search.waitFor();
    await row.press("Enter");
    await heading(detail, leg).waitFor();
    await page.keyboard.press("Escape");
    await focused(row);
  }
  await row.click();
  await button(detail, "半只").click();
  await button(detail, "加入本餐").click();
  await mealRegion.waitFor();
  await focused(add);
  const menu = button(dialog, leg + "的更多操作");
  await menu.waitFor();
  assert.equal(await dialog.locator("[data-meal-row]").count(), 1);
  await page.waitForFunction(() => !document.querySelector("dialog[open] [data-reference-detail], dialog[open] [data-meal-pane-transition]"));
  await menu.click();
  await button(dialog, "更换食材").click();
  await search.waitFor();
  const cancel = small ? button(dialog, "返回本餐") : button(picker, "取消更换");
  await cancel.click();
  await focused(menu);
  assert.equal(await dialog.locator("[data-meal-row]").count(), 1);
  await menu.click();
  await button(dialog, "更换食材").click();
  await search.fill("烤鸡胸");
  const replacementName = "去皮烤鸡胸肉";
  await button(picker, replacementName + "详情").click();
  await button(detail, "克").click();
  await detail.getByLabel("可食克数", { exact: true }).fill("42");
  await button(detail, "加入本餐").click();
  const updated = button(dialog, replacementName + "的更多操作");
  await updated.waitFor();
  await focused(updated);
  assert.equal(await dialog.locator("[data-meal-row]").count(), 1);

  await updated.click();
  await button(dialog, "更换食材").click();
  await search.fill("鸡腿");
  await row.click();
  await button(detail, "半只").click();
  await button(detail, "加入本餐").click();
  await menu.waitFor();
  await add.click();
  await search.fill("虚构无匹配菜");
  await button(picker, "手动填写「虚构无匹配菜」").click();
  const manual = dialog.locator("[data-meal-name]").last();
  await focused(manual);
  assert.equal(await manual.inputValue(), "虚构无匹配菜");
  await button(dialog, "移除 虚构无匹配菜").click();
  await menu.waitFor();

  await add.click();
  await button(picker, "我的食材").click();
  await picker.getByRole("searchbox").fill("原味鸡胸肉");
  await button(picker, "原味鸡胸肉规格与营养").waitFor();
  if (inline) {
    await button(picker, "添加 原味鸡胸肉").click();
  } else {
    await picker.getByRole("checkbox", { name: "选择 原味鸡胸肉", exact: true }).check();
    await button(dialog, "加入本餐").click();
  }
  await mealRegion.waitFor();
  await button(dialog, "原味鸡胸肉的更多操作").waitFor();
  await focused(add);
  await dialog.getByLabel("数量 2", { exact: true }).fill(String(width % 97 + (reduced ? 51 : 42)));
  await shot("06-draft");
  const save = dialog.getByRole("button", { name: /^保存餐次 ·/ });
  await save.click();
  await heading(dialog, "记录一餐").waitFor({ state: "hidden" });

  await page.reload({ waitUntil: "domcontentloaded" });
  await day.waitFor();
  await button(day, "查看").click();
  const saved = dialog.locator("[data-meal-day-list] > details").filter({ has: page.getByText(caseName, { exact: true }) });
  await saved.locator(":scope > summary").click();
  const item = saved.locator("[data-saved-food-list] > details").filter({ hasText: leg });
  assert.match(await item.locator("summary").innerText(), /半只\s+约\s*41/);
  await item.locator("summary").click();
  const evidence = item.locator("[data-reference-evidence]");
  await evidence.getByText("可食部约 28 g", { exact: true }).waitFor();
  assert.match(await evidence.innerText(), /24143220/);
  await evidence.getByRole("link", { name: "查看来源" }).scrollIntoViewIfNeeded();
  await shot("07-saved");
  const unexpected = errors.filter(error => engine !== "webkit" || error.message !== "Load failed" || !error.stack?.includes("reportError") ||
    !cancelled.some(request => request.path === "/dashboard/meals" && request.reason === "Load request cancelled" &&
      Math.abs(request.at - error.at) < 250));
  assert.deepEqual(unexpected, []);
  await writeFile(join(folder, scenario + "-metrics.json"), JSON.stringify({ width, height, theme, total: summary.total, motions, errors }, null, 2));
  console.log(scenario + " PASS");
} catch (error) {
  if (page) await page.screenshot({ path: join(folder, scenario + "-failure.png") }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await context?.close();
  if (video) {
    await video.saveAs(join(folder, scenario + ".webm"));
    await video.delete();
  }
  await browser.close();
}
