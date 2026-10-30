import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

export async function checkEnergyReview({ baseURL, context, page, token, engine = "chromium", saveEnergy }) {
  let phase = "initial";
  const go = async (current, url) => {
    phase = "before navigation: " + current.url();
    await current.waitForLoadState("networkidle");
    if (current.url() !== "about:blank") { await current.waitForTimeout(800); await current.waitForLoadState("networkidle"); }
    phase = "navigation: " + url;
    await current.goto(url);
    await current.waitForLoadState("networkidle");
  };
  const artifacts = process.env.FORMWARD_ENERGY_REVIEW_ARTIFACTS ?? ".codex/energy-review/" + engine;
  await mkdir(artifacts, { recursive: true });
  const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const request = async (path, items) => {
    const response = await fetch(baseURL + path, { headers, ...(items ? { method: "POST", body: JSON.stringify({ operationId: crypto.randomUUID(), items }) } : {}) });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const post = items => request("/api/v1/record-operations", items);
  const read = () => request("/api/v1/energy?from=2024-10-01&to=2024-10-31");
  const state = id => request("/api/v1/record-operations/" + id);
  const save = () => page.getByRole("button", { name: "确认保存", exact: true });
  const row = key => page.locator('[data-review-key="' + key + '"]');
  const total = group => group.locator("[data-energy-review-total] > strong");
  const group = () => page.getByRole("region", { name: "2024-10-30 消耗确认", exact: true });
  const report = { engine, screenshots: [], geometry: [], checks: [], clientErrors: [], serverErrors: [] };
  const observe = current => {
    current.on("pageerror", error => report.clientErrors.push({ url: current.url(), phase, message: error.message }));
    current.on("response", response => { if (response.status() >= 500) report.serverErrors.push({ status: response.status(), path: new URL(response.url()).pathname }); });
  };
  observe(page); context.on("page", observe);
  const screenshot = async (name, fullPage = false) => {
    await page.waitForFunction(() => document.querySelector('[aria-label="统一记录确认"]')?.getAttribute("aria-busy") !== "true");
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await page.screenshot({ path: artifacts + "/" + name + ".png", fullPage });
    report.screenshots.push(name + ".png");
  };
  await saveEnergy([{ kind: "save_activity", date: "2024-10-30", name: "虚构羽毛球", calorieMode: "components", exerciseActiveKcal: "801", exerciseRestingKcal: "145", durationMinutes: "90", sourceSystem: "虚构运动手表" }]);
  const op = await post([{ key: "day", kind: "save_energy_day", date: "2024-10-30", entryMode: "components", activityMode: "total", restingKcal: "2058", activeKcal: "1027", restingSourceSystem: "虚构运动手表", activeSourceSystem: "虚构运动手表", notes: "虚构验收资料：静息2058，活动1027，总计3085；羽毛球纯运动801已包含在活动合计内。此为长备注和长来源手机折行验收，不是真实健康数据。" }]);
  await go(page, op.confirmationUrl);
  await group().waitFor();
  const initial = await state(op.id);
  const sportKey = initial.rows.find(item => item.inclusionReview).key;
  assert.ok(sportKey);
  assert.equal(await total(group()).innerText(), "待核对");
  assert.equal(await save().isEnabled(), false);
  assert.equal(await page.getByRole("button", { name: /运动全部/ }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "取消本栏", exact: true }).count(), 0);
  await page.setViewportSize({ width: 390, height: 720 });
  await screenshot("mobile-pending");
  await row(sportKey).getByRole("button", { name: "已包含，不再增加", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-energy-review-total] > strong")?.textContent?.includes("3085"));
  assert.equal(await save().isEnabled(), true);
  assert.match(await row(sportKey).innerText(), /运动数值未改/);
  assert.match(await row(sportKey).innerText(), /801 运动 ＋ 145 期间静息/);
  assert.equal(await row(sportKey).locator("del").count(), 0, "包含核对不展示801到801");
  assert.equal(await row(sportKey).getByRole("group", { name: "运动包含关系" }).count(), 0);
  assert.match(await page.locator("footer").innerText(), /新增1条消耗 · 更新1项运动/);
  for (const viewport of [{ width: 320, height: 560 }, { width: 390, height: 560 }, { width: 390, height: 720 }, { width: 430, height: 780 }, { width: 844, height: 390 }, { width: 1100, height: 900 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => scrollTo(0, 0));
    const geometry = await group().evaluate(node => {
      const units = [...node.querySelectorAll('[class*="numberUnit"]')].map(unit => {
        const text = unit.firstChild, small = unit.querySelector("small"), range = document.createRange();
        if (!text || !small) return true;
        range.selectNodeContents(text);
        const a = range.getBoundingClientRect(), b = small.getBoundingClientRect();
        return b.top < a.bottom && b.bottom >= a.top;
      });
      const heading = node.querySelector("h2"), h = heading.getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth, unitsTogether: units.every(Boolean), dateHeadingHeight: h.height, save: (() => { const r = document.querySelector("footer > button").getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; })() };
    });
    assert.equal(geometry.overflow, false);
    assert.equal(geometry.unitsTogether, true);
    assert.ok(geometry.save.top >= 0 && geometry.save.bottom <= viewport.height + 1);
    report.geometry.push({ ...viewport, ...geometry });
    await screenshot("included-" + viewport.width + "x" + viewport.height);
  }
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 560 });
    const actions = row(sportKey).getByRole("button", { name: "取消", exact: true });
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await actions.scrollIntoViewIfNeeded();
    const buttonBox = await actions.boundingBox(), footerBox = await page.locator("footer").boundingBox();
    assert.ok(buttonBox.y + buttonBox.height <= footerBox.y + 1, "滚到底部可完整操作运动，不被保存栏遮挡");
    await screenshot("included-bottom-" + width);
  }
  report.checks.push("seven-viewports", "integer-units", "same-value-diff-hidden", "save-scope");
  await page.setViewportSize({ width: 390, height: 720 });
  await row(sportKey).getByRole("button", { name: "修改包含关系", exact: true }).click();
  await row(sportKey).getByRole("button", { name: "额外增加", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-energy-review-total] > strong")?.textContent?.includes("3886"));
  assert.match(await row(sportKey).innerText(), /额外增加 801/);
  await page.evaluate(() => scrollTo(0, 0));
  await screenshot("mobile-additional");
  await row(sportKey).getByRole("button", { name: "修改包含关系", exact: true }).click();
  await row(sportKey).getByRole("button", { name: "已包含，不再增加", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-energy-review-total] > strong")?.textContent?.includes("3085"));
  assert.equal((await read()).records.length, 0, "选择只改草稿，没有正式保存日消耗");
  report.checks.push("included-3085-additional-3886", "draft-only");
  await row("day").getByText("查看来源与备注", { exact: true }).click();
  await row("day").getByText("虚构验收资料：", { exact: false }).waitFor();
  await screenshot("mobile-evidence", true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await row("day").getByText("查看来源与备注", { exact: true }).click();
  await group().getByText("更多", { exact: true }).click();
  await group().getByRole("button", { name: "取消本组待保存内容", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "取消本组待保存内容？", exact: true });
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /已有记录保留/);
  await screenshot("mobile-cancel-confirmation");
  assert.equal(await dialog.getByRole("button", { name: "取消", exact: true }).evaluate(node => node === document.activeElement), true);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await row("day").getAttribute("data-excluded"), "false");
  await group().getByText("更多", { exact: true }).click();
  await group().getByRole("button", { name: "取消本组待保存内容", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "取消本组待保存内容？", exact: true });
  await dialog.getByRole("button", { name: "取消本组", exact: true }).click();
  await row("day").locator("button", { hasText: "恢复本项" }).waitFor();
  assert.equal((await read()).activities.length, 1, "取消本组不删除已有运动");
  await row("day").getByRole("button", { name: "恢复本项", exact: true }).click();
  await row(sportKey).getByRole("button", { name: "恢复本项", exact: true }).click();
  await save().waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("footer > button")?.disabled);
  report.checks.push("cancel-confirm-escape-restore-preserves-records");
  await row(sportKey).getByRole("button", { name: "修改", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "修改待保存内容", exact: true });
  await dialog.getByLabel("纯运动消耗 · kcal", { exact: true }).fill("820");
  assert.equal(await dialog.getByRole("button", { name: "应用修改", exact: true }).isEnabled(), false, "数值改变先重新核对包含关系");
  await dialog.getByRole("button", { name: "已包含", exact: true }).click();
  await dialog.getByRole("button", { name: "应用修改", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  const changes = row(sportKey).getByLabel("本次修改", { exact: true });
  assert.match(await changes.innerText(), /801.*→.*820/s);
  await page.waitForFunction(() => document.querySelector("[data-energy-review-total] > strong")?.textContent?.includes("3085"));
  await page.evaluate(() => scrollTo(0, 0));
  await screenshot("mobile-real-change");
  // A stale tab cannot silently save a newer draft.
  const stale = await context.newPage(); await go(stale, op.confirmationUrl);
  await row(sportKey).getByRole("button", { name: "修改包含关系", exact: true }).click();
  await row(sportKey).getByRole("button", { name: "额外增加", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-energy-review-total] > strong")?.textContent?.includes("3905"));
  await stale.getByRole("button", { name: "确认保存", exact: true }).click();
  await stale.getByRole("alert").filter({ hasText: /另一个页面|版本|改变/ }).waitFor();
  assert.equal((await read()).records.length, 0);
  await stale.waitForLoadState("networkidle");
  phase = "close stale tab";
  await stale.close();
  await row(sportKey).getByRole("button", { name: "修改包含关系", exact: true }).click();
  await row(sportKey).getByRole("button", { name: "已包含，不再增加", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-energy-review-total] > strong")?.textContent?.includes("3085"));
  phase = "final save";
  await save().dblclick();
  await page.getByRole("heading", { name: "已保存", exact: true }).waitFor();
  await page.getByRole("button", { name: "停留查看", exact: true }).click();
  const saved = await read();
  assert.equal(saved.records.length, 1);
  assert.equal(saved.activities.length, 1);
  assert.equal(Number(saved.activities[0].exerciseActiveKcal), 820);
  assert.equal(Number(saved.days.find(day => day.date === "2024-10-30").totalKcal), 3085);
  report.checks.push("true-numeric-change", "stale-tab-conflict", "single-final-save");
  const auto = await post([
    { key: "auto", kind: "save_energy_day", date: "2024-10-29", activityMode: "activities", restingKcal: "2058" },
    { key: "auto-sport", kind: "save_activity", date: "2024-10-29", name: "虚构自动累计羽毛球", calorieMode: "components", exerciseActiveKcal: "801", exerciseRestingKcal: "145" },
    { key: "zero", kind: "save_energy_day", date: "2024-10-28", restingKcal: "0", activeKcal: "0" },
    { key: "unknown", kind: "save_energy_day", date: "2024-10-27", restingKcal: null, activityMode: "activities" },
    { key: "total-only", kind: "save_energy_day", date: "2024-10-26", entryMode: "total", totalKcal: "3085" },
  ]);
  await go(page, auto.confirmationUrl);
  assert.equal(await page.locator("[data-energy-review-total]").count(), 4);
  assert.match(await total(page.getByRole("region", { name: "2024-10-29 消耗确认", exact: true })).innerText(), /2859/);
  assert.match(await total(page.getByRole("region", { name: "2024-10-28 消耗确认", exact: true })).innerText(), /^0/);
  assert.match(await total(page.getByRole("region", { name: "2024-10-27 消耗确认", exact: true })).innerText(), /—/);
  assert.equal(await page.getByRole("group", { name: "运动包含关系" }).count(), 0);
  await screenshot("mobile-multiple-dates", true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await screenshot("desktop-multiple-dates", true);
  report.checks.push("automatic-2859", "zero-unknown-total-only", "separate-dates", "reduced-motion");
  const precision = await post([{ key: "precision", kind: "save_activity", id: saved.activities[0].id, version: saved.activities[0].version, date: "2024-10-30", name: saved.activities[0].name, calorieMode: "components", exerciseActiveKcal: "820.0001", inclusion: "included" }]);
  await page.setViewportSize({ width: 390, height: 720 });
  await go(page, precision.confirmationUrl);
  assert.equal(await row("precision").locator("del").count(), 0);
  await row("precision").getByText("有1项小数变化，查看原始值", { exact: true }).click();
  assert.match(await row("precision").innerText(), /820\.0000 → 820\.0001/);
  await screenshot("mobile-original-precision");
  report.checks.push("actual-subinteger-change-remains-visible");
  const touch = await context.browser().newContext({ viewport: { width: 390, height: 720 }, locale: "zh-CN", timezoneId: "Asia/Shanghai", hasTouch: true, isMobile: true, storageState: await context.storageState(), reducedMotion: "reduce" });
  try {
    const touchPage = await touch.newPage(), touchErrors = [];
    touchPage.on("pageerror", error => touchErrors.push(error.message));
    await go(touchPage, auto.confirmationUrl);
    for (const viewport of [{ width: 390, height: 640 }, { width: 844, height: 390 }]) {
      await touchPage.setViewportSize(viewport);
      assert.equal(await touchPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const name = "touch-" + viewport.width + "x" + viewport.height + ".png";
      await touchPage.screenshot({ path: artifacts + "/" + name });
      report.screenshots.push(name);
    }
    assert.deepEqual(touchErrors, []);
  } finally { await touch.close(); }
  report.checks.push("touch-portrait-landscape");
  await writeFile(artifacts + "/diagnostics.json", JSON.stringify(report, null, 2));
  assert.deepEqual(report.clientErrors, []);
  assert.deepEqual(report.serverErrors, []);
  await writeFile(artifacts + "/report.json", JSON.stringify({ ...report, passed: true }, null, 2));
  console.log(JSON.stringify({ energyReview: engine, screenshots: report.screenshots.length, checks: report.checks }));
}
