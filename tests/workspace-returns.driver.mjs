import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { authenticateAi, createAiToken } from "../src/features/auth/ai-tokens.ts";
import { addCalendarDays } from "../src/features/measurements/calendar.ts";
import { mealPreviewOperation } from "../src/features/meals/ai-preview.ts";
import { readMealSnapshot } from "../src/features/meals/records.ts";
import { submitRecordOperation } from "../src/features/records/operations.ts";
import { workspacePages } from "../src/components/workspace-pages.ts";

export async function runWorkspaceReturns(db) {
  const config = JSON.parse(await readFile(process.env.FORMWARD_CHAT_BROWSER_CONFIG, "utf8"));
  const { baseURL, today, observed, userId } = config;
  assert.equal(new URL(baseURL).hostname, "127.0.0.1");
  assert.ok(config.isolatedFixture && config.account.email.endsWith("@example.test"));
  const output = resolve(process.env.FORMWARD_CHAT_ARTIFACTS);
  await mkdir(output, { recursive: true });
  const engine = process.env.CHAT_BROWSER ?? "chromium";
  const type = (await import(process.env.PLAYWRIGHT_MODULE))[engine];
  const browser = await type.launch(process.env.FORMWARD_BROWSER_EXECUTABLE ? {
    executablePath: process.env.FORMWARD_BROWSER_EXECUTABLE,
  } : {});
  const version = await (await fetch(baseURL + "/api/app-version")).json();
  const report = { engine, version, browser: browser.version(), runs: [] };
  const picks = (process.env.FORMWARD_RETURN_CASES ?? "").split(",").filter(Boolean);
  const widths = (process.env.FORMWARD_RETURN_WIDTHS ?? "320,390,430,1440").split(",").map(Number);

  const reviewToken = await createAiToken(db, userId, "虚构返回验收", "write");
  const identity = await authenticateAi(db, "Bearer " + reviewToken.rawToken);
  const preview = async (date, name) => {
    const payload = mealPreviewOperation({
      operationId: randomUUID(), date, timezone: "Asia/Shanghai", mealType: "午餐",
      foods: [{ name, quantity: "1", unit: "份", caloriesKcal: "120", proteinG: "8", carbsG: "16", fatG: "2",
        sourceKind: "estimated", basis: "虚构数据，用于本地页面验收。" }],
    });
    return submitRecordOperation(db, identity, { operationId: payload.operationId, items: [{ ...payload.actions[0], key: "meal" }] });
  };
  const reviews = [];
  for (const [index, width] of widths.entries()) {
    if (width === 390 || width === 1440) reviews[index] = await preview(addCalendarDays(today, -20 - index), "虚构回执餐次 " + width);
  }

  try {
    const auth = await browser.newContext({ baseURL });
    const login = await auth.request.post("/api/auth/sign-in/email", { headers: { Origin: baseURL }, data: config.account });
    assert.equal(login.status(), 200);
    const storageState = await auth.storageState();
    await auth.close();

    for (const [index, width] of widths.entries()) {
      const mobile = width < 700;
      const height = width === 320 ? 560 : mobile ? 844 : 900;
      for (const theme of ["light", "dark"]) {
        const full = (width === 390 && theme === "dark") || (width === 1440 && theme === "light");
        const prefix = engine + "-" + width + "-" + theme;
        const near = (a, b, name) => assert.ok(Math.abs(a - b) <= 1, name + " " + a + " / " + b);
        async function record(name, task) {
          if (picks.length && !picks.includes(name)) return;
          const file = prefix + "-" + name;
          const ctx = await browser.newContext({ baseURL, viewport: { width, height }, deviceScaleFactor: 1,
            hasTouch: mobile, isMobile: mobile, colorScheme: theme, timezoneId: "Asia/Shanghai", locale: "zh-CN",
            storageState, recordVideo: { dir: join(output, ".video"), size: { width, height } } });
          await ctx.addInitScript(theme => localStorage.setItem("formward-theme", theme), theme);
          const page = await ctx.newPage();
          page.setDefaultTimeout(9500);
          const errors = [];
          page.on("pageerror", error => errors.push(error.message));
          const go = async path => {
            if (page.url().startsWith(baseURL)) await page.waitForTimeout(300);
            await page.goto(path);
            await page.getByText("隔离测试 · 虚构数据", { exact: true }).waitFor();
            await page.waitForFunction(() => !document.querySelector("[data-workspace-reading]:not([hidden])"));
            await page.evaluate(() => document.fonts.ready);
          };
          const still = async suffix => {
            await page.waitForTimeout(500);
            await page.screenshot({ path: join(output, file + "-" + suffix + ".png"), animations: "disabled" });
          };
          const run = { name, engine, width, height, theme, file: file + ".webm", passed: false };
          try {
            await task({ page, go, still, run });
            await page.waitForTimeout(550);
            assert.deepEqual(errors, []);
            run.passed = true;
          } catch (error) {
            run.error = String(error);
            run.path = new URL(page.url()).pathname + new URL(page.url()).search;
            await still("failure").catch(() => {});
          } finally {
            const video = page.video();
            await ctx.close();
            await video.saveAs(join(output, run.file));
            await video.delete();
            report.runs.push(run);
            await writeFile(join(output, engine + "-returns.json"), JSON.stringify(report, null, 2) + "\n");
            console.log(JSON.stringify({ engine, width, theme, name, passed: run.passed, error: run.error?.slice(0, 210) }));
          }
        }
        const touches = (page, path) => page.locator('[data-workspace-origin-link]:not([inert] *)').filter({ visible: true }).and(page.locator('a[href^="' + path + '"]'));
        const dialog = page => page.locator("dialog[open]").last();
        async function mealName(pane) {
          const manual = pane.getByRole("button", { name: "手动填写", exact: true });
          const blank = pane.getByLabel("自由填写食物名称", { exact: true });
          await manual.or(blank).first().waitFor();
          if (await manual.isVisible()) await manual.click();
          return blank;
        }
        const waitForFocus = locator => locator.and(locator.page().locator(":focus")).waitFor();
        async function manualEnergy(pane) {
          await pane.getByRole("button", { name: "手动输入", exact: true }).click();
          const switchFormat = pane.getByRole("button", { name: "只有总数？", exact: true });
          if (await switchFormat.isVisible()) await switchFormat.click();
          return pane.getByLabel("全天总消耗 千卡", { exact: true });
        }

        await record("nutrition", async ({ page, go, still, run }) => {
          await go("/dashboard/meals");
          const card = page.getByRole("region", { name: "选中日营养" });
          const tag = card.getByRole("button", { name: "食材库", exact: true });
          await card.locator('[data-meal-library-entry="ready"]').waitFor();
          const toggle = card.getByRole("button", { name: "营养详情", exact: true });
          await still("before");
          if (mobile) {
            const before = await tag.boundingBox();
            await toggle.click();
            await page.waitForTimeout(250);
            await card.locator("dl").waitFor();
            const seam = await card.evaluate(cardElement => {
              const macro = cardElement.querySelector("dl"), library = cardElement.querySelector("[data-meal-library-entry]");
              const body = cardElement.getBoundingClientRect(), row = macro.getBoundingClientRect(), rail = library.getBoundingClientRect();
              return { left: row.left - body.left, right: body.right - row.right, gap: row.top - rail.bottom,
                stroke: getComputedStyle(macro).borderTopWidth, columns: macro.childElementCount };
            });
            for (const edge of ["left", "right", "gap"]) near(seam[edge], 0, edge);
            assert.equal(seam.stroke, "1px");
            assert.equal(seam.columns, 3);
            const opened = await tag.boundingBox();
            for (const key of ["x", "y", "height", "width"]) near(opened[key], before[key], key);
            await still("expanded");
            await toggle.click();
            await toggle.click();
            await page.waitForTimeout(220);
            assert.equal(await toggle.getAttribute("aria-expanded"), "true");
            run.seam = seam;
          } else assert.equal(await card.locator("dl").isVisible(), true);
          await page.getByLabel("账号菜单", { exact: true }).click();
          await page.locator(".glass-menu[open]").waitFor();
          assert.equal(await tag.evaluate(node => getComputedStyle(node).visibility), "visible");
          await still("menu");
          await page.keyboard.press("Escape");
          if (mobile) await toggle.click();
        });

        await record("library", async ({ page, go, still }) => {
          await go("/dashboard/meals");
          const tag = page.getByRole("button", { name: "食材库", exact: true });
          const card = page.getByRole("region", { name: "选中日营养" });
          const history = page.locator("[data-history-toggle]:visible");
          await history.click();
          await page.getByLabel("查看日期", { exact: true }).fill(observed);
          if (mobile) await card.getByRole("button", { name: "营养详情" }).click();
          const point = page.locator('[data-chart-date="' + observed + '"]:visible').first();
          await point.click();
          await page.evaluate(() => scrollTo(0, 44));
          const start = await page.evaluate(() => scrollY);
          await tag.click();
          await page.waitForURL(/section=foods/);
          await page.getByRole("heading", { name: "食材库", exact: true }).waitFor();
          await page.getByLabel("搜索食材", { exact: true }).fill("燕麦");
          await still("library");
          if (full) {
            const oats = page.getByRole("row").filter({ hasText: "燕麦片" });
            await oats.getByRole("button", { name: "编辑", exact: true }).click();
            const editor = dialog(page);
            const calories = editor.getByLabel("热量", { exact: true });
            const updated = await calories.inputValue() === "381" ? "380" : "381";
            const savedCalories = oats.getByLabel(`热量 ${updated} 千卡`, { exact: true });
            await calories.fill(updated);
            await editor.getByRole("button", { name: "保存食材", exact: true }).click();
            await editor.waitFor({ state: "hidden" });
            await savedCalories.waitFor();
            await page.reload();
            await savedCalories.waitFor();
          }
          await page.evaluate(() => history.back());
          await waitForFocus(tag);
          await card.and(page.locator('[data-selected-date="' + observed + '"]')).waitFor();
          near(await page.evaluate(() => scrollY), start, "饮食滚动");
          assert.equal(await page.getByLabel("查看日期", { exact: true }).inputValue(), observed);
          assert.equal(await card.getAttribute("data-selected-date"), observed);
          await page.evaluate(() => history.forward());
          await page.waitForURL(/section=foods/);
          await page.reload();
          await page.getByRole("button", { name: "← 饮食", exact: true }).click();
          await waitForFocus(tag);
          await card.and(page.locator('[data-selected-date="' + observed + '"]')).waitFor();
          near(await page.evaluate(() => scrollY), start, "刷新后按按钮返回饮食");
          assert.equal(await page.getByLabel("查看日期", { exact: true }).inputValue(), observed);
          assert.equal(await card.getAttribute("data-selected-date"), observed);
          if (mobile) assert.equal(await card.getByRole("button", { name: "营养详情" }).getAttribute("aria-expanded"), "true");
          if (!full) return;
          await go("/dashboard/meals");
          await page.locator('[data-record-date="' + today + '"] button[data-record-action="edit"]:visible').first().click();
          let pane = dialog(page);
          const newMeal = pane.getByRole("button", { name: /添加.*餐|录入.*餐/ }).first();
          if (await newMeal.isVisible()) await newMeal.click();
          pane = dialog(page);
          const draft = await mealName(pane);
          await draft.fill("本餐草稿 · 虚构");
          const picker = pane.getByRole("button", { name: "从食材库添加", exact: true });
          if (mobile || await picker.isVisible()) await picker.click();
          await pane.getByLabel("搜索食材", { exact: true }).fill("燕麦");
          if (mobile) await pane.getByRole("button", { name: "返回本餐", exact: true }).click();
          assert.ok((await pane.getByLabel("食物名称 1", { exact: true }).inputValue()).includes("本餐草稿"));
          await still("meal-draft");
        });

        if (!full) continue;

        await record("quick", async ({ page, go, still }) => {
          const entries = [
            { path: "/dashboard/meals", label: "记录饮食", field: "自由填写食物名称", value: "虚构快捷餐次" },
            { path: "/dashboard/measurements", label: "记录测量", field: "晨间体重", value: mobile ? "69.52" : "69.53" },
            { path: "/dashboard/energy", label: "记录消耗", field: "全天总消耗 千卡", value: mobile ? "2471" : "2472" },
          ];
          for (const entry of entries) {
            await go("/dashboard");
            if (!mobile) await page.locator('[data-assistant-trigger]:visible').click();
            const link = touches(page, entry.path).filter({ hasText: entry.label }).first();
            await link.click();
            await page.waitForURL(url => url.pathname === entry.path && url.searchParams.has("entry"));
            const pane = dialog(page);
            const field = entry.path.endsWith("energy") ? await manualEnergy(pane)
              : entry.path.endsWith("meals") ? await mealName(pane) : pane.getByLabel(entry.field, { exact: true });
            await field.fill(entry.value);
            await page.evaluate(() => history.back());
            await page.getByRole("button", { name: "继续编辑", exact: true }).click();
            const preserved = entry.path.endsWith("meals") ? pane.getByLabel("食物名称 1", { exact: true }) : field;
            assert.equal(entry.path.includes("meals") ? await preserved.inputValue() : Number(await preserved.inputValue()),
              entry.path.includes("meals") ? entry.value : Number(entry.value));
            await still(entry.path.split("/").at(-1) + "-draft");
            await page.evaluate(() => history.back());
            await page.getByRole("button", { name: "放弃修改", exact: true }).click();
            await page.waitForURL(baseURL + "/dashboard");
            await waitForFocus(link);
            await page.evaluate(() => history.forward());
            await page.waitForURL(baseURL + entry.path);
            await page.waitForTimeout(400);
            assert.equal(await page.locator('dialog[open]:not([data-assistant-surface])').count(), 0);
            await page.reload();
            assert.equal(await page.locator('dialog[open]:not([data-assistant-surface])').count(), 0);
          }
        });

        await record("quick-save", async ({ page, go, still }) => {
          for (const [path, value] of [
            ["/dashboard/meals", "虚构快捷保存 " + width],
            ["/dashboard/measurements", mobile ? "69.56" : "69.57"],
            ["/dashboard/energy", mobile ? "2475" : "2476"],
          ]) {
            await go("/dashboard");
            await page.locator('[data-assistant-trigger]:visible').click();
            if (mobile) await page.getByRole("tab", { name: "待办", exact: true }).click();
            const source = touches(page, path).first();
            await source.click();
            await page.waitForURL(url => url.pathname === path && url.searchParams.has("entry"));
            const pane = dialog(page);
            if (path.endsWith("meals")) {
              await (await mealName(pane)).fill(value);
              await pane.getByLabel("数量 1", { exact: true }).fill("1");
              await pane.getByLabel("本次热量 1", { exact: true }).fill("120");
            } else if (path.endsWith("measurements")) {
              await pane.getByLabel("晨间体重", { exact: true }).fill(value);
            } else {
              await (await manualEnergy(pane)).fill(value);
            }
            await still(path.split("/").at(-1) + "-before-save");
            await pane.locator("[data-entry-primary-action]").click();
            await page.waitForURL(mobile ? /\/dashboard\/assistant/ : baseURL + "/dashboard");
            await waitForFocus(source);
          }
          assert.equal((await readMealSnapshot(db, userId)).meals.filter(meal =>
            meal.items.some(item => item.name === "虚构快捷保存 " + width)).length, 1);
        });

        await record("navigation", async ({ page, go, still, run }) => {
          await go("/dashboard");
          const nav = page.getByRole("navigation", { name: "主导航", exact: true }).filter({ visible: true });
          const header = page.locator("header.dashboard-header");
          const rect = locator => locator.evaluate(node => {
            const { x, y } = node.getBoundingClientRect();
            return { x, y };
          });
          const start = await rect(nav), top = await rect(header);
          await page.evaluate(() => {
            const samples = [];
            window.formwardNavSamples = samples;
            const sample = () => {
              if (window.formwardNavSamples !== samples) return;
              const visibleNav = [...document.querySelectorAll('nav[aria-label="主导航"]')].find(el => el.getClientRects().length);
              const title = document.querySelector(".dashboard-header");
              if (visibleNav && title) {
                const bar = visibleNav.getBoundingClientRect();
                samples.push({ x: bar.x, y: bar.y, top: title.getBoundingClientRect().y });
              }
              requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          });
          const measure = async stage => {
            const bar = await rect(nav), heading = await rect(header);
            run.stage = stage;
            near(bar.x, start.x, "导航 X");
            near(bar.y, start.y, "导航 Y");
            near(heading.y, top.y, "顶栏");
          };
          const settle = () => page.waitForFunction(() =>
            !document.querySelector("[data-workspace-reading],[data-workspace-scene],[data-chart-flight]"));
          for (const [path, label] of [...workspacePages.slice(1), ...workspacePages.slice(0, 4).reverse()]) {
            await nav.getByRole("link", { name: label, exact: true }).click();
            await page.waitForURL(baseURL + path);
            await measure(label + " 首帧");
            await settle();
            await measure(label + " 落地");
          }
          const prefixes = [
            ["intake", "/dashboard/meals"],
            ["morning-weight", "/dashboard/measurements"],
            ["energy", "/dashboard/energy"],
          ];
          for (const [kind, path] of prefixes) {
            const card = page.locator('a[data-metric-card="' + kind + '"]:visible').first();
            await card.evaluate(node => node.scrollIntoView({ block: "nearest", inline: "nearest" }));
            const scroll = await page.evaluate(() => scrollY);
            await card.click();
            await page.waitForURL(url => url.pathname === path && url.searchParams.get("view") === "trend");
            await settle();
            await still(kind + "-trend");
            await nav.getByRole("link", { name: "总览", exact: true }).click();
            await page.waitForURL(baseURL + "/dashboard");
            await settle();
            await waitForFocus(card);
            near(await page.evaluate(() => scrollY), scroll, kind + " 返回滚动");
          }
          if (config.delayControlURL) {
            const setDelay = async delayMs => assert.equal((await fetch(config.delayControlURL,
              { method: "POST", body: JSON.stringify({ delayMs }) })).status, 200);
            await setDelay(650);
            try {
              await nav.getByRole("link", { name: "饮食", exact: true }).click();
              await nav.getByRole("link", { name: "总览", exact: true }).click();
              await page.waitForURL(baseURL + "/dashboard");
              await settle();
            } finally { await setDelay(0); }
          }
          await measure("慢读折返");
          await page.waitForTimeout(220);
          await measure("慢读折返落地");
          const samples = await page.evaluate(() => {
            const result = window.formwardNavSamples;
            window.formwardNavSamples = null;
            return result;
          });
          assert.ok(samples.length >= 12);
          const deviation = Math.max(...samples.flatMap(s => [Math.abs(s.x - start.x), Math.abs(s.y - start.y), Math.abs(s.top - top.y)]));
          run.frames = { samples: samples.length, maxDeviation: deviation };
          assert.ok(deviation <= 1, "导航逐帧偏移 " + deviation + " CSS px");
          run.navigation = "五页双向、三个趋势及慢读取折返";
        });

        await record("assistant-settings", async ({ page, go, still }) => {
          await go("/dashboard/measurements");
          for (const [group, label, path] of [
            ["账号管理", "个人资料", "/dashboard/profile"],
            ["账号管理", "账号与安全", "/dashboard/account"],
            ["外部接入", "设备与数据来源", "/dashboard/sources"],
          ]) {
            const account = page.getByLabel("账号菜单", { exact: true });
            await account.click();
            await page.getByRole("button", { name: group, exact: true }).click();
            await page.getByRole(mobile ? "button" : "link", { name: label, exact: true }).click();
            if (mobile) {
              const sheet = page.getByRole("dialog", { name: label, exact: true });
              await sheet.getByRole("button", { name: /^关闭/ }).first().click();
              await sheet.waitFor({ state: "hidden" });
            } else {
              await page.waitForURL(baseURL + path);
              await page.getByRole("link", { name: /返回身体/ }).click();
              await page.waitForURL(baseURL + "/dashboard/measurements");
            }
            await waitForFocus(account);
          }
          await page.locator("[data-assistant-trigger]:visible").click();
          if (mobile) await page.getByRole("tab", { name: "待办", exact: true }).click();
          const tools = page.locator('[data-assistant-group="tools"]:visible');
          await tools.click();
          for (const label of ["使用说明", "AI 接入", "导出 Excel", "训练计划"]) {
            const link = page.getByRole("link", { name: label, exact: true });
            await link.click();
            const back = page.getByRole(label === "使用说明" ? "button" : "link", { name: /返回待办/ });
            await back.click();
            await waitForFocus(link);
            assert.equal(await tools.getAttribute("aria-expanded"), "true");
          }
          await still("back-to-tasks");
          if (mobile) await page.getByRole("tab", { name: "聊天", exact: true }).click();
          await page.getByRole("button", { name: "历史会话", exact: true }).click();
          await page.getByRole("heading", { name: "历史会话", exact: true }).waitFor();
          await page.keyboard.press("Escape");
          await page.getByLabel("给小助手发消息", { exact: true }).waitFor();
          const model = page.getByRole("button", { name: "千问", exact: true });
          await model.click();
          await page.getByRole("dialog", { name: "模型与用量", exact: true }).waitFor();
          await still("model-menu");
          await page.keyboard.press("Escape");
          await waitForFocus(model);
        });

        await record("review", async ({ page, go, still }) => {
          const operation = reviews[index];
          await go("/dashboard/ai");
          await page.getByRole("button", { name: "AI 提交记录", exact: true }).click();
          await page.locator('a[href="' + operation.confirmationPath + '"]:visible').click();
          const back = page.getByRole("link", { name: /返回\s*AI 接入/ });
          await back.waitFor();
          await page.getByRole("button", { name: "确认保存", exact: true }).click();
          await page.getByRole("heading", { name: "已保存", exact: true }).waitFor();
          await page.waitForTimeout(2350);
          assert.equal(new URL(page.url()).pathname, operation.confirmationPath);
          await still("receipt");
          await page.getByRole("link", { name: /查看记录/ }).click();
          await page.waitForURL(/\/dashboard\/meals\?date=/);
          await page.evaluate(() => history.back());
          await back.click();
          await page.waitForURL(baseURL + "/dashboard/ai");
          await go(operation.confirmationPath);
          await page.getByRole("link", { name: /返回饮食/ }).click();
          await page.waitForURL(baseURL + "/dashboard/meals");
          const saved = (await readMealSnapshot(db, userId)).meals.filter(meal => meal.items.some(item => item.name === "虚构回执餐次 " + width));
          assert.equal(saved.length, 1);
        });

        await record("history", async ({ page, go, still }) => {
          for (const [path] of workspacePages.filter(([href]) => !["/dashboard", "/dashboard/training"].includes(href))) {
            await go(path);
            const history = page.locator("[data-history-toggle]:visible").first();
            await history.click();
            const date = page.getByLabel("查看日期", { exact: true }).filter({ visible: true }).first();
            await date.fill(observed);
            const query = page.getByRole("button", { name: "查询", exact: true }).first();
            const row = await Promise.all([history.boundingBox(), date.boundingBox(), query.boundingBox()]);
            row.forEach(box => near(box.y + box.height / 2, row[0].y + row[0].height / 2, "查询行"));
            await query.click();
            const sheet = dialog(page);
            await sheet.waitFor();
            if (path.endsWith("meals")) {
              if (mobile) await sheet.locator("summary").filter({ hasText: /营养详情/ }).first().click();
              const meal = sheet.locator("details > summary").filter({ hasText: /kcal/ }).first();
              await meal.click();
              await meal.locator("xpath=..").locator("details > summary").first().click();
            }
            await sheet.getByRole("button", { name: /^关闭/ }).first().click();
            await sheet.waitFor({ state: "hidden" });
            assert.equal(await date.inputValue(), observed);
            await still(path.split("/").at(-1));
          }
          await go("/dashboard/measurements");
          await page.locator('[data-record-date="' + today + '"] button[data-record-action="edit"]:visible').first().click();
          let panel = dialog(page);
          if (mobile) await panel.getByRole("button", { name: "晚间", exact: true }).click();
          const more = panel.getByRole("button", { name: "更多设置", exact: true }).last();
          await more.click();
          assert.equal(await more.getAttribute("aria-expanded"), "true");
          await still("body-period");
          await panel.getByRole("button", { name: /^关闭/ }).first().click();
          await panel.waitFor({ state: "hidden" });

          await go("/dashboard/energy");
          await page.locator('[data-record-date="' + today + '"] button[data-record-action="edit"]:visible').first().click();
          panel = dialog(page);
          await manualEnergy(panel);
          const source = panel.getByText("来源与备注", { exact: true });
          await source.click();
          await panel.getByLabel("消耗备注", { exact: true }).waitFor();
          await still("energy-source");
          await panel.getByRole("button", { name: /^关闭/ }).first().click();
          const discard = page.getByRole("button", { name: "放弃修改", exact: true });
          if (await discard.isVisible()) await discard.click();
          await panel.waitFor({ state: "hidden" });

          await go("/dashboard/training");
          const templates = page.getByRole("button", { name: "训练模板", exact: true });
          if (await templates.getAttribute("aria-expanded") === "false") await templates.click();
          await page.locator("[data-training-template] h3 button").first().click();
          const schedule = page.locator("[data-training-template]").getByRole("button", { name: "排期", exact: true }).first();
          await schedule.click();
          await dialog(page).getByRole("button", { name: /^关闭/ }).first().click();
          await waitForFocus(schedule);
        });
      }
    }
  } finally {
    await browser.close();
    await writeFile(join(output, engine + "-returns.json"), JSON.stringify(report, null, 2) + "\n");
  }
  assert.ok(report.runs.length && report.runs.every(run => run.passed), "查看本轮录屏与检查报告");
}
