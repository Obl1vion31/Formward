import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// 由 measurements.http.mts 提供独立数据库、虚构账号和开发／production 服务。
export async function checkMeasurementsBrowser({ baseURL, first, second }) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
  const browser = await chromium.launch({ headless: true });
  const artifacts = process.env.FORMWARD_MEASUREMENTS_ARTIFACTS ?? "/tmp/formward-measurements-visual";
  await mkdir(artifacts, { recursive: true });
  const errors = [];
  let ip = 100;
  async function loggedInPage(viewport, credentials = first, options = {}) {
    const context = await browser.newContext({ viewport, ...options });
    const response = await context.request.post(`${baseURL}/api/auth/sign-in/email`, { headers: { Origin: baseURL, "x-forwarded-for": `192.0.2.${ip++}` }, data: credentials });
    assert.equal(response.status(), 200);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseURL}/dashboard`);
    await page.getByRole("heading", { name: "身体记录", exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    return { context, page };
  }
  const chartFor = (page) => page.locator('section[aria-label="身体指标趋势"]');
  const recentFor = (page) => page.locator('section[aria-label="最近记录"]');
  const detailFor = (page) => page.locator('section[aria-label="所选日期测量详情"]');
  const summaryFor = (page) => page.locator('section[aria-label="最新空腹摘要"]');
  async function applyCustom(page, start, end) {
    await page.getByRole("button", { name: "自定义日期", exact: true }).click();
    await page.getByLabel("起始日期", { exact: true }).fill(start);
    await page.getByLabel("结束日期", { exact: true }).fill(end);
    await page.getByRole("button", { name: "应用", exact: true }).click();
  }
  async function assertNormalAxis(page) {
    const points = await chartFor(page).locator('[data-point-id]').evaluateAll((nodes) => nodes.map((node) => ({ value: Number(node.dataset.value), y: Number(node.querySelector("circle").getAttribute("cy")) })));
    points.sort((a, b) => a.value - b.value);
    assert.ok(points.at(-1).y < points[0].y, "较高数值在上");
    const ticks = await chartFor(page).locator("text").evaluateAll((nodes) => nodes.filter((node) => node.getAttribute("text-anchor") === "end").map((node) => Number(node.textContent)));
    assert.ok(ticks[0] - ticks.at(-1) >= 3, "避免夸大微小波动");
  }
  try {
    const { context, page } = await loggedInPage({ width: 1440, height: 1000 });
    const chart = chartFor(page), recent = recentFor(page), detail = detailFor(page), summary = summaryFor(page);
    await chart.locator('[data-point-id]').first().waitFor();
    // 首次挂载和再次打开都必须保持可见，覆盖开发 Strict Mode 的 effect 重放。
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.getByRole("button", { name: "查看全部", exact: false }).click();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const modal = page.getByRole("dialog", { name: "完整历史", exact: true });
      assert.equal(await modal.count(), 1, "点击查看全部后，抽屉在生命周期重放结束后仍然打开");
      assert.equal(await modal.evaluate((node) => node.open && node.matches(":modal")), true);
      await page.keyboard.press("Escape");
      await modal.waitFor({ state: "hidden" });
    }
    assert.equal(await page.getByRole("button", { name: "30D", exact: true }).getAttribute("aria-pressed"), "true");
    assert.equal(await recent.locator("tbody tr").count(), 10);
    assert.equal(await detail.count(), 0);
    assert.equal(await page.locator('input[type="date"]').count(), 0);
    assert.equal(await page.getByLabel("晚间数据", { exact: true }).isChecked(), true);
    assert.equal(await page.getByLabel("估计补全", { exact: true }).isChecked(), true);
    assert.ok(await chart.locator('[data-point-id][data-period="evening"]').count() > 0);
    const body = await page.textContent("body");
    assert.ok(!body.includes("把一天的变化") && !body.includes("正在开发中") && !body.includes("缺测连接") && !body.includes("每天的晨晚对比"));
    assert.match(await summary.locator('[data-summary="current"]').textContent(), /74.60.*2025.07.14/);
    assert.match(await summary.locator('[data-summary="change"]').textContent(), /-1.60/);
    assert.match(await summary.locator('[data-summary="average"]').textContent(), /75.21.*4\/7 天/);
    await assertNormalAxis(page);
    assert.ok(await chart.locator('[data-segment="continuous"]').count() > 0);
    assert.ok(await chart.locator('[data-segment="estimated"]').count() > 0);
    const estimate = chart.locator('[data-kind="estimated"][data-date="2025-07-11"][data-period="evening"]');
    assert.match(await estimate.getAttribute("aria-label"), /估计.*95% 预测区间/);
    assert.equal(await estimate.locator("path").count(), 1);
    const estimateStyle = await chart.locator('[data-segment="estimated"]').first().evaluate((node) => getComputedStyle(node).strokeDasharray);
    assert.notEqual(estimateStyle, "none");
    await page.screenshot({ path: `${artifacts}/desktop-estimated-trends.png`, fullPage: true });
    await estimate.click();
    assert.match(await detail.textContent(), /估计.*95% 预测区间/s);
    await detail.getByRole("button", { name: "详情", exact: true }).click();
    const estimationDrawer = page.getByRole("dialog");
    assert.match(await estimationDrawer.textContent(), /开发阶段录入/);
    assert.match(await estimationDrawer.textContent(), /实测样本/);
    await page.keyboard.press("Escape");
    await estimationDrawer.waitFor({ state: "hidden" });
    await detail.getByRole("button", { name: "关闭日期详情", exact: true }).click();
    const measuredSummary = await summary.textContent();
    await page.getByLabel("估计补全", { exact: true }).uncheck();
    assert.equal(await chart.locator('[data-kind="estimated"]').count(), 0);
    assert.equal(await summary.textContent(), measuredSummary);
    const gap = chart.locator('[data-segment="gap"]').first();
    assert.ok(await chart.locator('[data-segment="gap"]').count() > 0);
    const bridge = await gap.evaluate((node) => ({ dash: getComputedStyle(node).strokeDasharray, opacity: Number(getComputedStyle(node).opacity), stroke: getComputedStyle(node).stroke }));
    assert.notEqual(bridge.dash, "none");
    assert.ok(bridge.opacity <= .3);
    assert.equal(bridge.stroke, await chart.locator('[data-segment="continuous"]').first().evaluate((node) => getComputedStyle(node).stroke));
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight * 1.5), "默认桌面主要阅读内容不超过约 1.5 屏");
    await page.screenshot({ path: `${artifacts}/desktop-30-days.png`, fullPage: true });

    await page.getByLabel("晚间数据", { exact: true }).check();
    assert.ok(await chart.locator('[data-point-id][data-period="evening"]').count() > 0);
    assert.ok(await chart.locator('[data-segment][data-period="evening"]').count() > 0);
    assert.ok(await chart.locator('[data-pair]').count() > 0);
    await recent.getByRole("button", { name: "查看 2025-07-08", exact: true }).click();
    assert.match(await detail.textContent(), /-0.30 kg/);
    assert.ok(!(await detail.textContent()).includes("Asia/Shanghai"));
    assert.ok((await detail.boundingBox()).height < 100, "桌面日期详情为一条紧凑信息栏");
    await recent.getByRole("button", { name: "查看 2025-07-10", exact: true }).click();
    await detail.getByRole("button", { name: "详情 · 待选择", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await drawer.waitFor();
    assert.match(await drawer.textContent(), /2025-07-11 00:30:00/);
    assert.match(await drawer.textContent(), /Asia\/Shanghai/);
    assert.match(await drawer.textContent(), /开发后台加入/);
    assert.match(await drawer.textContent(), /虚构蓝牙体重秤/);
    assert.ok(!(await drawer.textContent()).includes("未知"));
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
    await drawer.getByLabel("晚间代表记录").selectOption({ label: "2025-07-10 20:10:00 · 75.80 kg" });
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    assert.match(await detail.textContent(), /\+0.57 kg/);
    assert.match(await recent.locator('tr[data-selected="true"]').textContent(), /75.80.*\+0.57/);
    assert.equal(await chart.locator('[data-point-id][data-date="2025-07-10"][data-period="evening"]').count(), 1);
    assert.equal(await detail.getByRole("button", { name: "详情", exact: true }).evaluate((node) => node === document.activeElement), true, "关闭抽屉后返回触发按钮");
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden");
    await page.getByRole("button", { name: "体脂率", exact: true }).click();
    assert.match(await detail.textContent(), /\+0.35 百分点/);
    assert.match(await summary.locator('[data-summary="current"]').textContent(), /24.90/);
    assert.match(await summary.locator('[data-summary="change"]').textContent(), /-0.30.*百分点/);
    assert.match(await summary.locator('[data-summary="average"]').textContent(), /25.12.*3\/7 天/);
    assert.match(await summary.locator('[data-summary="companion"]').textContent(), /74.60.*kg/);
    assert.equal(await chart.locator('[data-point-id][data-date="2025-07-11"]').count(), 0);
    await assertNormalAxis(page);
    await page.getByLabel("晚间数据", { exact: true }).uncheck();
    assert.equal(await chart.locator('[data-point-id][data-period="evening"]').count(), 0);
    assert.match(await detail.textContent(), /\+0.35 百分点/);
    await page.getByRole("button", { name: "体重", exact: true }).click();
    await page.getByRole("button", { name: "7D", exact: true }).click();
    assert.equal(await recent.locator("tbody tr").count(), 7);
    await page.screenshot({ path: `${artifacts}/desktop-7-days.png`, fullPage: true });
    await page.getByRole("button", { name: "90D", exact: true }).click();
    assert.match(await chart.textContent(), /2025.04.16.*2025.07.14/s);
    assert.equal(await recent.locator("tbody tr").count(), 10);
    await page.getByRole("button", { name: "全部", exact: true }).click();
    assert.equal(await chart.locator('[data-point-id][data-date="2024-12-01"]').count(), 1);
    assert.equal(await recent.locator("tbody tr").count(), 10);
    assert.ok(await chart.locator("text").count() <= 16, "全部历史不逐日堆积刻度");

    const originalSummary = await summary.textContent();
    await applyCustom(page, "2025-07-01", "2025-07-02");
    assert.equal(await recent.locator("tbody tr").count(), 2);
    assert.equal(await detail.count(), 0, "所选日期离开区间后隐藏详情");
    assert.equal(await summary.textContent(), originalSummary, "摘要始终反映最新状态");
    await applyCustom(page, "2025-07-15", "2025-07-14");
    assert.match(await chart.getByRole("alert").textContent(), /起始日期不能晚于结束日期/);
    assert.equal(await recent.locator("tbody tr").count(), 2, "错误区间不应用");
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await applyCustom(page, "2025-08-01", "2025-08-10");
    assert.equal(await chart.locator('[data-point-id]').count(), 0);
    assert.match(await chart.textContent(), /暂无空腹体重记录/);
    assert.equal(await recent.locator("tbody tr").count(), 0);
    assert.equal(await summary.textContent(), originalSummary);
    await applyCustom(page, "2025-07-14", "2025-07-14");
    const single = chart.locator('[data-point-id]');
    assert.equal(await single.count(), 1);
    assert.ok(Number.isFinite(Number(await single.locator("circle").first().getAttribute("cx"))), "单日图区间没有无效坐标");
    await single.focus();
    await page.keyboard.press("Enter");
    assert.match(await detail.textContent(), /2025.07.14/);
    await detail.getByRole("button", { name: "关闭日期详情", exact: true }).click();
    assert.equal(await detail.count(), 0);

    const fullHistoryButton = page.getByRole("button", { name: "查看全部", exact: false });
    await fullHistoryButton.click();
    await drawer.waitFor();
    assert.equal(await drawer.locator("details").count(), 16, "全历史抽屉不受图区间限制");
    await drawer.locator("details").filter({ hasText: "2025.07.10" }).locator("summary").click();
    assert.match(await drawer.textContent(), /2025-07-11 00:30:00/);
    for (let step = 0; step < 20; step++) {
      await page.keyboard.press("Tab");
      assert.equal(await drawer.evaluate((node) => node.contains(document.activeElement)), true, "焦点留在抽屉内");
    }
    for (let step = 0; step < 20; step++) {
      await page.keyboard.press("Shift+Tab");
      assert.equal(await drawer.evaluate((node) => node.contains(document.activeElement)), true, "反向 Tab 也留在抽屉内");
    }
    await page.screenshot({ path: `${artifacts}/desktop-history-drawer.png`, fullPage: true });
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    assert.equal(await fullHistoryButton.evaluate((node) => node === document.activeElement), true);
    await fullHistoryButton.click();
    await drawer.waitFor();
    await page.mouse.click(20, 200);
    await drawer.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await context.close();
    console.log("通过：桌面实测摘要、晨晚折线、估计虚线和预测区间、来源标注、候选同步与历史抽屉。");

    for (const [width, height] of [[390, 844], [320, 740], [844, 390]]) {
      const mobile = await loggedInPage({ width, height }, first, { isMobile: true, hasTouch: true, reducedMotion: "reduce" });
      await chartFor(mobile.page).locator('[data-point-id]').first().waitFor();
      assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px 页面不横向溢出`);
      assert.equal(await recentFor(mobile.page).locator("tbody tr").count(), 10);
      await mobile.page.screenshot({ path: `${artifacts}/mobile-${width}-30-days.png`, fullPage: true });
      if (width === 390) {
        const layout = await mobile.page.evaluate(() => ({ height: document.documentElement.scrollHeight, viewport: innerHeight, sections: [...document.querySelectorAll('main > header, main > section > section')].map((node) => ({ label: node.getAttribute('aria-label'), height: node.getBoundingClientRect().height })) }));
        assert.ok(layout.height <= layout.viewport * 1.5, `手机默认主要阅读内容不超过约 1.5 屏：${JSON.stringify(layout)}`);
      }
      await mobile.page.getByRole("button", { name: "7D", exact: true }).click();
      await mobile.page.waitForFunction(() => {
        const plot = document.querySelector('section[aria-label="身体指标趋势"] svg[role="group"]');
        return plot && plot.getBoundingClientRect().width <= plot.parentElement.clientWidth;
      });
      await chartFor(mobile.page).locator('[data-point-id][data-date="2025-07-08"][data-period="daytime"]').tap();
      assert.match(await detailFor(mobile.page).textContent(), /2025.07.08/);
      await mobile.page.screenshot({ path: `${artifacts}/mobile-${width}-7-days.png`, fullPage: true });
      await detailFor(mobile.page).getByRole("button", { name: "详情", exact: true }).tap();
      const mobileDrawer = mobile.page.getByRole("dialog");
      await mobileDrawer.waitFor();
      assert.match(await mobileDrawer.textContent(), /非空腹/);
      assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await mobile.page.screenshot({ path: `${artifacts}/mobile-${width}-details-drawer.png` });
      await mobileDrawer.getByRole("button", { name: "关闭历史抽屉", exact: true }).tap();
      await mobileDrawer.waitFor({ state: "hidden" });
      await chartFor(mobile.page).locator('[data-point-id][data-date="2025-07-09"][data-period="daytime"][data-kind="estimated"]').tap();
      assert.match(await detailFor(mobile.page).textContent(), /95% 预测区间/);
      assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "估计区间详情不撑宽手机页面");
      await detailFor(mobile.page).getByRole("button", { name: "详情", exact: true }).tap();
      await mobileDrawer.waitFor();
      assert.match(await mobileDrawer.textContent(), /开发阶段录入/);
      await mobileDrawer.getByRole("button", { name: "关闭历史抽屉", exact: true }).tap();
      await mobileDrawer.waitFor({ state: "hidden" });
      await chartFor(mobile.page).locator('[data-point-id][data-date="2025-07-14"][data-period="daytime"]').tap();
      await detailFor(mobile.page).getByRole("button", { name: "详情", exact: true }).tap();
      await mobileDrawer.waitFor();
      assert.match(await mobileDrawer.textContent(), /时间为占位/);
      assert.match(await mobileDrawer.textContent(), /真实测量/);
      await mobileDrawer.getByRole("button", { name: "关闭历史抽屉", exact: true }).tap();
      await mobileDrawer.waitFor({ state: "hidden" });
      await mobile.page.getByRole("button", { name: "全部", exact: true }).tap();
      assert.equal(await chartFor(mobile.page).locator('[data-point-id][data-date="2024-12-01"]').count(), 1);
      await applyCustom(mobile.page, "2025-07-14", "2025-07-14");
      assert.equal(await chartFor(mobile.page).locator('[data-point-id]').count(), 2, "单日视角同时显示晨晚实测");
      assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await mobile.context.close();
    }
    const empty = await loggedInPage({ width: 390, height: 844 }, second);
    assert.match(await empty.page.textContent("body"), /暂无测量记录/);
    assert.equal(await chartFor(empty.page).count(), 0);
    await empty.context.close();
    assert.deepEqual(errors, [], "无客户端异常");
    console.log(`通过：390px、320px、横屏、reduced motion、触控与空状态；虚构数据截图位于 ${artifacts}。`);
  } finally {
    await browser.close();
  }
}
