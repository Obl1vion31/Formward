import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

/** 通过真实展开、键盘和图片请求验证已保存记录的阅读层级。 */
export async function checkSavedMealDetails({ browser, storageState, baseURL, fixture, artifacts, engine }) {
  await mkdir(artifacts, { recursive: true });
  const checks = [], errors = [], serverErrors = [];
  const photo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAoAAAAGQCAIAAACxkUZyAAAFAUlEQVR42u3VMQ0AAAgEsfcvBCeIwA0uGEiTKrjlMl0AwLFIAAAGDAAGDAAYMAAYMABgwABgwACAAQOAAQMABgwABgwABgwAGDAAGDAAYMAAYMAAgAEDgAEDAAYMAAYMAAYMABgwABgwAGDAAGDAAIABA4ABAwAGDAAGDAAGDAAYMAAYMABgwABgwACAAQOAAQMABgwABgwABgwAGDAAGDAAYMAAYMAAgAEDgAEDAAYMAAYMAAYMABgwABgwAGDAAGDAAIABA4ABAwAGDAAGDAAGDAAYMAAYMABgwABgwACAAQOAAQMABgwABgwABgwAGDAAGDAAYMAAYMAAgAEDgAEDAAYMAAYMAAYMABgwABgwAGDAAGDAAIABA4ABAwAGDAAGDAAGrAIAGDAAGDAAYMAAYMAAgAEDgAEDAAYMAAYMABgwABgwABgwAGDAAGDAAIABA4ABAwAGDAAGDAAYMAAYMAAYMABgwABgwACAAQOAAQMABgwABgwAGDAAGDAAGDAAYMAAYMAAgAEDgAEDAAYMAAYMABgwABgwABgwAGDAAGDAAIABA4ABAwAGDAAGDAAYMAAYMAAYMABgwABgwACAAQOAAQMABgwABgwAGDAAGDAAGDAAYMAAYMAAgAEDgAEDAAYMAAYMABgwABgwABgwAGDAAGDAAIABA4ABAwAGDAAGDAAYMAAYMAAYMABgwABgwACAAQOAAQMABgwABgwAGDAAGDAAGLAKAGDAAGDAAIABA4ABAwAGDAAGDAAYMAAYMABgwABgwABgwACAAQOAAQMABgwABgwAGDAAGDAAYMAAYMAAYMAAgAEDgAEDAAYMAAYMABgwABgwAGDAAGDAAGDAAIABA4ABAwAGDAAGDAAYMAAYMABgwABgwABgwACAAQOAAQMABgwABgwAGDAAGDAAYMAAYMAAYMAAgAEDgAEDAAYMAAYMABgwABgwAGDAAGDAAGDAAIABA4ABAwAGDAAGDAAYMAAYMABgwABgwABgwACAAQOAAQMABgwABgwAGDAAGDAAYMAAYMAAYMAAgAEDgAEDAAYMAAYMABgwABgwAGDAAGDAAGDAAIABA4ABAwAGDAAGDAAYMAAYMABgwABgwABgwBIAgAEDgAEDAAYMAAYMABgwABgwAGDAAGDAAIABA4ABA4ABAwAGDAAGDAAYMAAYMABgwABgwACAAQOAAQOAAQMABgwABgwAGDAAGDAAYMAAYMAAgAEDgAEDgAEDAAYMAAYMABgwABgwAGDAAGDAAIABA4ABA4ABAwAGDAAGDAAYMAAYMABgwABgwACAAQOAAQOAAQMABgwABgwAGDAAGDAAYMAAYMAAgAEDgAEDgAEDAAYMAAYMABgwABgwAGDAAGDAAIABA4ABA4ABAwAGDAAGDAAYMAAYMABgwABgwACAAQOAAQOAAQMABgwABgwAGDAAGDAAYMAAYMAAgAEDgAEDgAGrAAAGDAAGDAAYMAAYMABgwABgwACAAQOAAQMABgwABgwABgwAGDAAGDAAYMAAYMAAgAEDgAEDAAYMAAYMAAYMABgwABgwAGDAAGDAAIABA4ABAwAGDAAGDAAGDAAYMAAYMABgwABgwACAAQOAAQMABgwABgwABgwAGDAAGDAAYMAAYMAAgAEDgAEDAAYMAAYMAAYMABgwABgwAGDAAGDAAIABA4ABAwAGDAAGDAAGDAAYMAD8tYMMJMfEZBVMAAAAAElFTkSuQmCC", "base64");
  const sizes = [[320, 560], [390, 640], [430, 780], [390, 560], [844, 390], [1100, 900], [1440, 900]];
  for (const theme of ["dark", "light"]) for (const [width, height] of sizes) {
    const context = await browser.newContext({ storageState, viewport: { width, height }, locale: "zh-CN", timezoneId: "Asia/Shanghai", isMobile: width < 1000, hasTouch: width < 1000, reducedMotion: "reduce" });
    await context.addInitScript(value => localStorage.setItem("formward-theme", value), theme);
    const photos = [];
    await context.route("**/api/meal-images/*", route => {
      photos.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 200, contentType: "image/png", body: photo });
    });
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => { if (response.status() >= 500) serverErrors.push({ status: response.status(), path: new URL(response.url()).pathname }); });
    try {
      const samples = [["single", fixture.singleDate], ["multi", fixture.multiDate], ...(width === 320 ? [["unknown", fixture.unknownDate]] : [])];
      for (const surface of ["meals", "overview"]) for (const [sample, date] of samples) {
        if (surface === "meals") await page.goto(baseURL + "/dashboard/meals?date=" + date);
        else {
          await page.goto(baseURL + "/dashboard"); await page.waitForLoadState("networkidle");
          const assistant = page.getByRole("button", { name: "收起小助手", exact: true }); if (await assistant.isVisible()) await assistant.click();
          await page.getByRole("button", { name: "30D", exact: true }).click();
          await page.locator('[data-overview-date="' + date + '"]').focus(); await page.keyboard.press("Enter");
          await page.getByRole("button", { name: "查看记录 →", exact: true }).click();
        }
        await page.waitForLoadState("networkidle"); await page.evaluate(() => document.fonts.ready);
        const drawer = page.locator("dialog[open]:not(.page-loading-dialog)").last(); await drawer.waitFor();
        if (width < 1000) assert.ok(Math.abs((await drawer.boundingBox()).width - width) <= 1, "手机及触屏横屏使用全宽详情");
        const list = drawer.locator("[data-meal-day-list]"), row = list.locator(":scope>details").first(), trigger = row.locator(":scope>summary");
        const summary = drawer.locator("[data-day-nutrition-summary]");
        const summaryBox = () => summary.evaluate(node => {const rect=node.getBoundingClientRect();return {x:rect.x,y:rect.y+node.closest("dialog").scrollTop,width:rect.width,height:rect.height};});
        const initial = await summaryBox(), initialWidth = await drawer.evaluate(node => node.clientWidth), photoCount = photos.length;
        assert.equal(await drawer.locator("[data-nutrition-composition]").count(), 1, "日期详情仅保留当天环图");
        assert.equal(await row.locator("[data-saved-food-list]").count(), 0, "收起餐次不挂载食物明细");
        assert.ok(await row.locator("[data-meal-preview]").isVisible());
        const columns = Number(await summary.locator("[data-nutrition-columns]").getAttribute("data-nutrition-columns")); assert.ok([1, 2, 4].includes(columns));
        await trigger.click(); await row.locator("[data-saved-food-list]").waitFor();
        assert.equal(await row.locator("[data-meal-preview]").isVisible(), false, "展开后不重复摘要");
        assert.equal(await row.locator(":scope>div>[data-saved-macros] strong").count(), 3, "本餐只留三项宏量，不重复热量块");
        assert.ok(!/项记录|食材库\s*\d+\s*项|自由填写\s*\d+\s*项|\d(?:\.\d+)?%/.test(await list.innerText()), "餐次不出现来源数量和百分比行");
        assert.equal(await row.locator("table").count(), 0); assert.equal(await row.locator("[data-saved-food-details]").count(), 0);
        assert.equal(photos.length, photoCount, "展开餐次不提前请求原图");
        const after = await summaryBox(); assert.equal(await drawer.evaluate(node => node.clientWidth), initialWidth);
        for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(initial[key] - after[key]) <= 1, "餐次开关不重排当天合计：" + key);
        assert.ok(await drawer.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
        const foods = row.locator("[data-saved-food-list]>details"); assert.equal(await foods.count(), sample === "multi" ? 4 : 1);
        if (sample === "unknown") {
          assert.match(await trigger.innerText(), /—\s*kcal/);
          assert.ok(!(await row.innerText()).includes("已知部分"), "完全未知的热量不显示已知部分");
          assert.match(await summary.innerText(), /当天合计\s*—\s*kcal/);
        }
        const first = foods.first(), foodTrigger = first.locator(":scope>summary"); assert.ok((await foodTrigger.boundingBox()).height >= 44);
        const shot = `${engine}-${theme}-${surface}-${sample}-${width}x${height}`;
        await page.screenshot({ path: artifacts + "/" + shot + ".png" });
        await foodTrigger.focus(); await page.keyboard.press("Enter"); await first.locator("[data-saved-food-details]").waitFor();
        assert.equal(await first.locator("[data-saved-macros] strong").count(), 3); assert.ok((await first.innerText()).includes("自由填写"));
        if (width === 390 && height === 640) await page.screenshot({ path: artifacts + "/" + shot + "-food-details.png" });
        await page.keyboard.press("Escape"); assert.equal(await first.getAttribute("open"), null); assert.ok(await foodTrigger.evaluate(node => node === document.activeElement));
        if (sample === "multi") {
          const estimated = foods.nth(1); await estimated.locator(":scope>summary").click(); await estimated.locator("[data-saved-food-details]").waitFor();
          assert.ok((await estimated.innerText()).includes("依据实际食用比例估算")); assert.ok((await estimated.innerText()).includes("约 0.675"));
          await page.keyboard.press("Escape");
          assert.ok((await foods.nth(2).innerText()).includes("0"));
          await foods.nth(3).locator(":scope>summary").click(); await foods.nth(3).locator("[data-saved-food-details]").waitFor(); assert.ok((await foods.nth(3).innerText()).includes("—")); await page.keyboard.press("Escape");
          const attachments = row.locator("details").filter({ has: page.locator("[data-saved-attachments]") });
          assert.equal(await row.locator("[data-saved-attachments]").count(), 0);
          const attachmentTrigger = row.locator("summary").filter({ hasText: "备注与照片" });
          await attachmentTrigger.click(); await row.locator("[data-saved-attachments]").waitFor();
          const images = row.locator("[data-saved-attachments] img"); await images.first().scrollIntoViewIfNeeded(); await page.waitForFunction(() => {const images=[...document.querySelectorAll("[data-saved-attachments] img")];return images.length===2&&images.every(image=>image.complete&&image.naturalWidth===640);});
          assert.equal(photos.length - photoCount, 2, "打开附件后才请求两张虚构原图");
          if (width === 390 && height === 640) { await attachmentTrigger.scrollIntoViewIfNeeded(); await page.screenshot({ path: artifacts + "/" + shot + "-attachments.png" }); }
          await attachmentTrigger.focus(); await page.keyboard.press("Escape"); await row.locator("[data-saved-attachments]").waitFor({state:"detached"}); assert.equal(await attachments.count(), 0);
        }
        await trigger.focus(); await page.keyboard.press("Escape"); assert.equal(await row.getAttribute("open"), null); assert.ok(await trigger.evaluate(node => node === document.activeElement));
        if (surface === "overview") {
          const links = drawer.getByRole("link", { name: "查看饮食记录 →", exact: true }); assert.equal(await links.count(), 1); assert.ok((await links.getAttribute("href")).endsWith(date));
          assert.equal(await drawer.getByText("编辑这一日饮食 →", { exact: true }).count(), 0);
        } else {
          const footer = drawer.locator("[data-meal-day-actions]"), add = await footer.getByRole("button", { name: "添加一餐", exact: true }).boundingBox(), control = await footer.getByRole("checkbox").boundingBox();
          assert.ok(add.x < control.x && add.height >= 44 && control.height >= 44, "添加与记全保持左右并列");
        }
        await page.keyboard.press("Escape"); await drawer.waitFor({ state: "hidden" });
        checks.push({ theme, width, height, surface, sample, columns, stableSummary: true, nestedEscape: true, lazyPhotos: true, passed: true });
      }
    } catch (error) { await page.screenshot({ path: artifacts + `/${engine}-${theme}-${width}-failure.png`, fullPage: true }); throw error; }
    finally { await context.close(); }
  }
  assert.deepEqual(errors, []); assert.deepEqual(serverErrors, []);
  const result = { passed: true, checks, errors, serverErrors }; await writeFile(artifacts + "/" + engine + "-saved-meals.json", JSON.stringify(result, null, 2));
  return { passed: true, cases: checks.length };
}
