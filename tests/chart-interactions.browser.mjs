import assert from "node:assert/strict";
import { join } from "node:path";

/** 由隔离浏览器入口提供虚构账号的页面；本检查只选择和查看，不保存健康记录。 */
export async function checkChartInteractions({ baseURL, page, artifacts }) {
  const cases = [
    { name: "overview", path: "/dashboard", label: "总览图表日期", points: "[data-overview-date]", dateAttribute: "data-overview-date", action: "查看记录 →" },
    { name: "meals", path: "/dashboard/meals", label: "饮食图表日期", points: "[data-bar-date]", dateAttribute: "data-bar-date", action: "查看记录 →" },
    { name: "energy", path: "/dashboard/energy", label: "消耗图表日期", points: "[data-energy-date]", dateAttribute: "data-energy-date", action: /^(编辑|录入)所选日/ },
    { name: "body", path: "/dashboard/measurements", label: "身体图表日期", points: "[data-point-id]", dateAttribute: "data-date", action: "查看体重所选日记录" },
  ];
  const errors = [], writes = [], outcomes = [];
  const onError = error => errors.push(error.message);
  const onRequest = request => { if (request.method() === "POST") writes.push(new URL(request.url()).pathname); };
  page.on("pageerror", onError); page.on("request", onRequest);
  try {
    for (const width of [1440, 1100, 390, 320]) {
      await page.setViewportSize({ width, height: width <= 390 ? 740 : 1000 });
      for (const entry of cases) {
        await page.goto(new URL(entry.path, baseURL).href);
        const input = page.locator('input[type="date"]').and(page.getByLabel(entry.label, { exact: true }));
        if (entry.name !== "overview") await input.waitFor();
        else await page.locator("[data-overview-date]").first().waitFor();
        await page.getByRole("button", { name: "30D", exact: true }).click();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (entry.name === "overview") {
          assert.equal(await input.count(), 0);
          const points = page.locator(entry.points), first = points.first(), last = points.last();
          await first.focus(); await page.keyboard.press("Enter");
          assert.equal(await page.getByLabel("日期对照", {exact:true}).getAttribute("data-selected-date"), await first.getAttribute(entry.dateAttribute));
          await page.keyboard.press("End");
          assert.equal(await last.evaluate(node => node === document.activeElement), true);
          await page.keyboard.press("Enter"); await page.keyboard.press("Escape");
          await page.getByRole("button", {name:entry.action, exact:true}).click();
          await page.locator("dialog[open]").last().waitFor();
          await page.keyboard.press("Escape");
          await page.locator("dialog[open]").waitFor({state:"hidden"});
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          outcomes.push({page:entry.name, width, passed:true});
          console.log("图表通过",entry.name,width);
          continue;
        }
        const min = await input.getAttribute("min"), max = await input.getAttribute("max");
        assert.ok(min && max && min <= max);
        const point = page.locator(entry.points).first();
        if (await point.count()) {
          const date = await point.getAttribute(entry.dateAttribute);
          await point.dispatchEvent("click");
          assert.equal(await input.inputValue(), date, `${entry.name}: 点击图表只选择日期`);
          assert.equal(await page.locator("dialog[open]").count(), 0);
          await point.press("Enter");
          assert.equal(await page.locator("dialog[open]").count(), 0, `${entry.name}: Enter不隐式打开编辑器`);
        }
        await input.fill(min);
        assert.equal(await input.inputValue(), min);
        assert.equal(await page.getByRole("button", { name: entry.label + "前一天", exact: true }).isDisabled(), true);
        if (min !== max) {
          await page.getByRole("button", { name: entry.label + "后一天", exact: true }).click();
          const next = new Date(Date.parse(min + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
          assert.equal(await input.inputValue(), next);
          await page.getByRole("button", { name: entry.label + "前一天", exact: true }).click();
          assert.equal(await input.inputValue(), min);
        }
        await input.fill(max);
        assert.equal(await page.getByRole("button", { name: entry.label + "后一天", exact: true }).isDisabled(), true);
        const before = await input.inputValue(), beyond = new Date(Date.parse(max + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
        await input.fill(beyond); await input.blur();
        assert.equal(await input.inputValue(), before, `${entry.name}: 区间外日期不改变选择`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `${entry.name}/${width}: 横向溢出${overflow}px`);
        const small = await page.locator("svg text").evaluateAll(elements => elements.filter(element => {
          if (!element.textContent?.trim() || !element.getClientRects().length) return false;
          const matrix = element.getScreenCTM();
          return matrix && parseFloat(getComputedStyle(element).fontSize) * Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)) < 11.9;
        }).map(element => element.textContent));
        assert.deepEqual(small, [], `${entry.name}/${width}: 图表文字屏上不足12px`);
        if (entry.name === "meals") {
          const ticks = await page.locator("[data-calorie-tick]").evaluateAll(nodes => nodes.map(node => Number(node.getAttribute("data-calorie-tick"))));
          assert.ok(ticks.length >= 2 && ticks[0] === 0);
          const step = ticks[1] - ticks[0];
          assert.ok(ticks.slice(1).every((tick, index) => Math.abs(tick - ticks[index] - step) < .0001));
          assert.ok(await page.locator("[data-date-tick]").count() >= 3);
        }
        await page.getByRole("button", { name: entry.action, exact: typeof entry.action === "string" }).first().click();
        await page.locator("dialog[open]").last().waitFor();
        const accept=dialog=>dialog.accept();page.once("dialog",accept);
        try { await page.locator("dialog[open]").last().getByRole("button", { name: /^关闭/ }).click();
        await page.locator("dialog[open]").waitFor({ state: "hidden" }); } finally {page.off("dialog",accept);}
        assert.equal(await input.inputValue(), before);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        if (artifacts) await page.screenshot({ path: join(artifacts, `chart-${entry.name}-${width}.png`), fullPage: true });
        console.log("图表通过",entry.name,width);
        outcomes.push({ page: entry.name, width, passed: true });
      }
    }
    assert.deepEqual(errors, []); assert.deepEqual(writes, [], "选择、查看与精确选日不发起写入");
    return { passed: true, outcomes, clientErrors: errors, writes };
  } finally {
    page.off("pageerror", onError); page.off("request", onRequest);
  }
}
