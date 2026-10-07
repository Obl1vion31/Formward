import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// 由 measurements.http.mts 提供独立数据库、虚构账号和开发／production 服务。
export async function checkMeasurementsBrowser({ baseURL, first, second, initializedAccount }) {
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
  async function assertRecentLayout(page) {
    const layout = await recentFor(page).evaluate((section) => {
      const chart = document.querySelector('section[aria-label="身体指标趋势"]');
      const box = node => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width }; };
      return { chart: box(chart), recent: box(section), table: box(section.querySelector("table")),
        headings: [...section.querySelectorAll("thead th")].map(box), rows: [...section.querySelectorAll("tbody tr")].map(row => [...row.cells].map(box)),
        ratios: innerWidth <= 600 ? [.28, .25, .25, .22] : [.25, .25, .25, .25] };
    });
    assert.ok(Math.abs(layout.chart.width - layout.recent.width) < 1, "最近记录与图表区域等宽");
    assert.ok(Math.abs(layout.chart.left - layout.table.left) < 1 && Math.abs(layout.chart.right - layout.table.right) < 1, "表格铺满内容区域");
    for (const row of layout.rows) for (const [index, cell] of row.entries()) {
      assert.ok(Math.abs(cell.left - layout.headings[index].left) < 1 && Math.abs(cell.right - layout.headings[index].right) < 1, "所有表头与数据共用列边界");
      assert.ok(Math.abs(cell.width / layout.table.width - layout.ratios[index]) < .01, "固定列宽不受实测与估计标签影响");
    }
    assert.ok(!(await recentFor(page).innerText()).includes("历史初始化估计"), "最近记录仅使用短估计标识");
  }
  async function assertRecordInspector(page, kind = "observed", metric = "weightKg") {
    const modal = page.getByRole("dialog");
    await modal.waitFor();
    assert.equal(await modal.getByRole("article", { name: "记录详情", exact: true }).count(), 1, "始终只呈现当前记录");
    assert.equal(await modal.locator("[data-inspector-record]").getAttribute("data-kind"), kind);
    assert.equal(await modal.locator("[data-record-value]").getAttribute("data-record-value"), metric);
    assert.match(await modal.locator("header").first().innerText(), /\d{4}\.\d{2}\.\d{2}.*周.*(?:实测|估计)/s);
    assert.equal(await modal.getByRole("heading", { name: "记录信息", exact: true }).count(), 1);
    assert.equal(await modal.getByRole("navigation", { name: "当天时段", exact: true }).count(), 1);
    assert.doesNotMatch(await modal.innerText(), /规则版本|初始化批次|生成时间|historical-initialization|morning-baseline|UUID|历史初始化说明|最小二乘/);
    assert.equal(await modal.getByRole("region", { name: "估计依据", exact: true }).count(), kind === "estimated" ? 1 : 0);
    const primary = await modal.locator('[data-record-value] strong').evaluate(node => ({ size: getComputedStyle(node).fontSize, weight: getComputedStyle(node).fontWeight }));
    assert.equal(primary.size, page.viewportSize().width <= 600 ? "36px" : "40px", "实测与估计共享主读数层级");
    assert.equal(primary.weight, "400");
    return modal;
  }
  async function assertSimpleEstimate(page, metric = "weightKg") {
    const modal = await assertRecordInspector(page, "estimated", metric);
    assert.equal(await modal.locator("[data-estimate-value]").count(), 1, "直接点击仅显示所选指标和记录");
    assert.equal(await modal.locator("[data-estimate-value]").getAttribute("data-estimate-value"), metric);
    const text = await modal.innerText();
    assert.match(text, /估计.*依据/s);
    assert.match(text, /基于 \d+ 个真实/);
    assert.match(text, /用于辅助趋势，并非实际测量/);
    assert.doesNotMatch(text, /规则版本|初始化批次|生成时间|历史参考|historical-initialization|morning-baseline|UUID|历史初始化说明|最小二乘/);
    assert.equal(await modal.locator('details[open]').count(), 0, "参考记录默认折叠");
    const essential = await modal.locator('[class*="estimateDisclaimer"]').boundingBox();
    const box = await modal.boundingBox();
    if (page.viewportSize().height >= 740) assert.ok(essential.y + essential.height <= box.y + box.height, "常规视口核心依据与辅助趋势说明无需滚动即可看到");
    return modal;
  }
  async function assertEstimateRules(page) {
    const button = page.getByRole("button", { name: "估算规则", exact: true });
    const plot = await chartFor(page).locator('svg[role="group"]').elementHandle();
    const width = await plot.evaluate(node => node.viewBox.baseVal.width);
    assert.equal(await button.getAttribute("aria-expanded"), "false");
    await button.click();
    const rules = page.getByRole("region", { name: "估算规则", exact: true });
    await rules.waitFor();
    assert.match(await rules.innerText(), /历史初始化.*前后真实测量.*结果固定.*日常估计.*目标日期之前.*真实测量始终优先.*实测统计/s);
    assert.doesNotMatch(await rules.innerText(), /historical-initialization|morning-baseline|批次|UUID/);
    const summary = await summaryFor(page).textContent();
    await page.getByLabel("估计补全", { exact: true }).uncheck();
    assert.equal(await button.isVisible(), true, "关闭估计后仍可阅读规则");
    assert.equal(await summaryFor(page).textContent(), summary, "实测摘要独立于规则与估计开关");
    await page.getByLabel("估计补全", { exact: true }).check();
    await page.screenshot({ path: `${artifacts}/rules-${page.viewportSize().width}.png`, fullPage: true });
    await button.click();
    await rules.waitFor({ state: "detached" });
    assert.equal(await plot.evaluate(node => node.isConnected && node === document.querySelector('section[aria-label="身体指标趋势"] svg[role="group"]')), true);
    assert.equal(await plot.evaluate(node => node.viewBox.baseVal.width), width, "展开规则保留图表实例与宽度");
    await plot.dispose();
  }
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
  async function assertStableEveningToggle(page, checked, touch = false) {
    const probe = await chartFor(page).locator('svg[role="group"]').evaluateHandle(async (plot) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const panel = plot.closest("section");
      const snapshots = [];
      const capture = () => {
        const current = panel.querySelector('svg[role="group"]');
        snapshots.push({
          samePlot: current === plot,
          width: current.viewBox.baseVal.width,
          left: current.getBoundingClientRect().left,
          points: [...current.querySelectorAll('[data-period="daytime"][data-point-id]')].map((node) => [node.dataset.pointId, Number(node.querySelector("circle").getAttribute("cx"))]),
        });
      };
      capture();
      const observer = new MutationObserver(capture);
      observer.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ["viewBox", "cx"] });
      return { snapshots, capture, observer };
    });
    try {
      const toggle = page.getByLabel("晚间数据", { exact: true });
      if (touch) await toggle.tap();
      else await toggle.setChecked(checked);
      assert.equal(await toggle.isChecked(), checked);
      const snapshots = await probe.evaluate(async ({ snapshots, capture, observer }) => {
        for (let frame = 0; frame < 4; frame++) {
          await new Promise(requestAnimationFrame);
          capture();
        }
        observer.disconnect();
        return snapshots;
      });
      const baseline = snapshots[0];
      const sizes = snapshots.map(({ samePlot, width, left }) => ({ samePlot, width, left }));
      assert.ok(snapshots.every((sample) => sample.samePlot), `晚间切换保留图表实例，避免默认宽度闪帧：${JSON.stringify(sizes)}`);
      for (const sample of snapshots) {
        assert.equal(sample.width, baseline.width, "切换过程 SVG 坐标宽度保持稳定");
        assert.equal(sample.left, baseline.left, "切换过程图表不横移");
        assert.deepEqual(sample.points, baseline.points, "切换过程晨间点横坐标保持稳定");
      }
      assert.equal(await chartFor(page).locator('[data-point-id][data-period="evening"]').count() > 0, checked);
    } finally {
      await probe.evaluate(({ observer }) => observer.disconnect());
      await probe.dispose();
    }
  }
  try {
    const { context, page } = await loggedInPage({ width: 1440, height: 1000 });
    const chart = chartFor(page), recent = recentFor(page), detail = detailFor(page), summary = summaryFor(page);
    await chart.locator('[data-point-id]').first().waitFor();
    await assertRecentLayout(page);
    await assertEstimateRules(page);
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
    for (const checked of [false, true, false, true]) await assertStableEveningToggle(page, checked);
    const measuredPlot = await chart.locator('svg[role="group"]').elementHandle();
    const fullWidth = await measuredPlot.evaluate((plot) => plot.viewBox.baseVal.width);
    for (const width of [1100, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForFunction(() => {
        const plot = document.querySelector('section[aria-label="身体指标趋势"] svg[role="group"]');
        return Math.abs(plot.viewBox.baseVal.width - Math.max(240, plot.parentElement.getBoundingClientRect().width)) < .1;
      });
      assert.equal(await measuredPlot.evaluate((plot) => plot.isConnected), true, "窗口缩放保留图表实例");
      const resizedWidth = await measuredPlot.evaluate((plot) => plot.viewBox.baseVal.width);
      if (width === 1100) assert.ok(resizedWidth < fullWidth, "容器变窄时更新测量宽度");
      else assert.equal(resizedWidth, fullWidth, "恢复窗口后恢复正确宽度");
      await assertRecentLayout(page);
    }
    await measuredPlot.dispose();
    console.log("通过：晚间连续切换保留图表实例、宽度及晨间横坐标，窗口缩放正常更新宽度。");
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
    assert.match(await estimate.getAttribute("aria-label"), /估计.*同日晨间实测/);
    assert.equal(await estimate.locator("path").count(), 1);
    const estimateStyle = await chart.locator('[data-segment="estimated"]').first().evaluate((node) => getComputedStyle(node).strokeDasharray);
    assert.notEqual(estimateStyle, "none");
    await page.screenshot({ path: `${artifacts}/desktop-estimated-trends.png`, fullPage: true });
    await estimate.click();
    const estimationDrawer = await assertSimpleEstimate(page);
    assert.equal(await estimationDrawer.getByRole("heading", { name: "2025.07.11", exact: true }).count(), 1);
    assert.match(await estimationDrawer.innerText(), /当日晨间实测：74.80 kg/);
    assert.match(await estimationDrawer.innerText(), /真实晨晚配对日/);
    await estimationDrawer.getByRole("button", { name: "查看体脂率记录值", exact: true }).click();
    await assertSimpleEstimate(page, "bodyFatPercent");
    assert.match(await estimationDrawer.getByRole("region", { name: "估计依据", exact: true }).innerText(), /个百分点/);
    await estimationDrawer.getByRole("button", { name: "查看体重记录值", exact: true }).click();
    await assertSimpleEstimate(page);
    await page.screenshot({ path: `${artifacts}/desktop-single-estimate.png` });
    await page.keyboard.press("Escape");
    await estimationDrawer.waitFor({ state: "hidden" });
    assert.equal(await estimate.evaluate(node => node === document.activeElement), true, "估计抽屉关闭后焦点返回图表点");
    assert.equal(await detail.count(), 0, "无需日期信息栏中转");
    await recent.getByRole("button", { name: "查看 2025-07-11 晚间估计依据", exact: true }).click();
    await assertSimpleEstimate(page);
    assert.match(await estimationDrawer.innerText(), /日常估计/);
    await page.keyboard.press("Escape");
    await estimationDrawer.waitFor({ state: "hidden" });
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
    await recent.getByRole("button", { name: "查看 2025-07-08 晨间实测记录", exact: true }).click();
    const drawer = await assertRecordInspector(page);
    assert.match(await drawer.locator('[data-record-value]').innerText(), /76.20.*kg/s);
    assert.match(await drawer.innerText(), /虚构蓝牙体重秤.*虚构连接应用/s);
    const recordId = await drawer.locator('[data-inspector-record]').getAttribute('data-inspector-record');
    await drawer.getByRole("button", { name: "查看体脂率记录值", exact: true }).click();
    await assertRecordInspector(page, "observed", "bodyFatPercent");
    assert.equal(await drawer.locator('[data-inspector-record]').getAttribute('data-inspector-record'), recordId, "切换指标保持同条记录");
    assert.match(await drawer.locator('[data-record-value]').innerText(), /25.20.*%/s);
    assert.equal(await page.getByRole("button", { name: "体重", exact: true }).getAttribute("aria-pressed"), "true", "详情内查看另一指标不改变页面趋势指标");
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    const pendingButton = recent.getByRole("button", { name: "查看 2025-07-10 晚间候选记录", exact: true });
    await pendingButton.click();
    await drawer.waitFor();
    assert.equal(await drawer.locator('[data-record-value]').count(), 0, "待选择单元格直接进入对应时段候选");
    assert.equal(await drawer.getByRole("navigation", { name: "当天时段" }).getByRole("button", { name: "晚间", exact: false }).getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    assert.equal(await pendingButton.evaluate(node => node === document.activeElement), true);
    const dateButton = recent.getByRole("button", { name: "查看 2025-07-10", exact: true });
    await dateButton.click();
    await assertRecordInspector(page);
    assert.match(await drawer.locator('[data-record-value]').innerText(), /75.23/);
    await drawer.getByRole("navigation", { name: "当天时段" }).getByRole("button", { name: "晚间", exact: false }).click();
    assert.equal(await drawer.locator('[data-record-value]').count(), 0, "多候选不擅自选择代表");
    await drawer.getByRole("button", { name: /2025-07-11 00:30:00/ }).click();
    await assertRecordInspector(page);
    assert.match(await drawer.innerText(), /2025-07-11 00:30:00/);
    assert.match(await drawer.innerText(), /Asia\/Shanghai/);
    assert.match(await drawer.innerText(), /归属日.*2025.07.10 · 晚间/s);
    assert.match(await drawer.innerText(), /开发后台加入/);
    assert.equal(await chart.locator('[data-point-id][data-date="2025-07-10"][data-period="evening"]').count(), 0, "查看候选不设置代表记录");
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
    await drawer.locator('details[class*="recordNavigation"] > summary').click();
    await drawer.getByLabel("晚间代表记录").selectOption({ label: "2025-07-10 20:10:00 · 75.80 kg" });
    assert.match(await drawer.locator('[data-record-value]').innerText(), /75.80/);
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    assert.match(await recent.locator('tr[data-selected="true"]').textContent(), /75.80.*\+0.57/);
    assert.equal(await chart.locator('[data-point-id][data-date="2025-07-10"][data-period="evening"]').count(), 1);
    assert.equal(await dateButton.evaluate(node => node === document.activeElement), true, "关闭后返回日期入口");
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden");
    await page.getByRole("button", { name: "体脂率", exact: true }).click();
    assert.match(await recent.locator("tbody tr").filter({ has: page.getByRole("button", { name: "查看 2025-07-10", exact: true }) }).innerText(), /\+0.35/);
    assert.match(await summary.locator('[data-summary="current"]').textContent(), /24.90/);
    assert.match(await summary.locator('[data-summary="change"]').textContent(), /-0.30.*百分点/);
    assert.match(await summary.locator('[data-summary="average"]').textContent(), /25.12.*3\/7 天/);
    assert.match(await summary.locator('[data-summary="companion"]').textContent(), /74.60.*kg/);
    assert.equal(await chart.locator('[data-point-id][data-date="2025-07-11"]').count(), 0);
    await page.getByLabel("估计补全", { exact: true }).check();
    const fatEstimate = chart.locator('[data-point-id][data-date="2025-07-11"][data-period="daytime"][data-kind="estimated"]');
    assert.equal(await fatEstimate.count(), 1, "真实体重存在时仍展示独立估计体脂");
    await fatEstimate.click();
    const fatModal = await assertSimpleEstimate(page, "bodyFatPercent");
    assert.match(await fatModal.innerText(), /体脂率.*近期晨间趋势/s);
    assert.ok(!(await fatModal.innerText()).includes("74.80 kg"), "估计体脂不混入同条实测体重的依据");
    await page.keyboard.press("Escape");
    await fatModal.waitFor({ state: "hidden" });
    await chart.locator('[data-point-id][data-date="2025-07-11"][data-period="evening"][data-kind="estimated"]').click();
    await assertSimpleEstimate(page, "bodyFatPercent");
    assert.match(await fatModal.innerText(), /个人典型晨晚差：.*个百分点/);
    await page.keyboard.press("Escape");
    await fatModal.waitFor({ state: "hidden" });
    assert.equal(await detail.count(), 0);
    await page.getByRole("button", { name: "体重", exact: true }).click();
    assert.equal(await chart.locator('[data-point-id][data-date="2025-07-11"][data-period="daytime"][data-kind="observed"]').count(), 1);
    assert.equal(await chart.locator('[data-point-id][data-date="2025-07-11"][data-period="daytime"][data-kind="estimated"]').count(), 0);
    await chart.locator('[data-point-id][data-date="2025-07-11"][data-period="daytime"][data-kind="observed"]').click();
    await assertRecordInspector(page);
    assert.match(await drawer.locator('[data-record-value]').innerText(), /74.80/);
    assert.equal(await drawer.getByRole("button", { name: "查看体脂率记录值", exact: true }).count(), 0, "实测缺失体脂不混入另一条记录的估计体脂");
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "体脂率", exact: true }).click();
    await page.getByLabel("估计补全", { exact: true }).uncheck();
    await assertNormalAxis(page);
    await page.getByLabel("晚间数据", { exact: true }).uncheck();
    assert.equal(await chart.locator('[data-point-id][data-period="evening"]').count(), 0);
    assert.match(await recent.locator("tbody tr").filter({ has: page.getByRole("button", { name: "查看 2025-07-10", exact: true }) }).innerText(), /\+0.35/);
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
    assert.equal(await detail.count(), 0, "页面不再保留日期详情中间层");
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
    await assertRecordInspector(page);
    assert.match(await drawer.innerText(), /2025.07.14.*时间为占位/s);
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    assert.equal(await single.evaluate(node => node === document.activeElement), true, "实测直接查看后返回图表点");
    await page.keyboard.press("Space");
    await assertRecordInspector(page);
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });

    const fullHistoryButton = page.getByRole("button", { name: "查看全部", exact: false });
    await fullHistoryButton.click();
    await drawer.waitFor();
    assert.equal(await drawer.locator("details:has(> summary time[datetime])").count(), 19, "全历史抽屉不受图区间限制");
    await drawer.locator('details:has(> summary time[datetime="2025-07-10"]) > summary').click();
    assert.match(await drawer.innerText(), /2025-07-11 00:30:00/);
    const historyScroll = await drawer.locator('div[class*="drawerContent"]').evaluate(node => node.scrollTop);
    const historicalEntry = drawer.getByRole("button", { name: /2025-07-11 00:30:00/ });
    await historicalEntry.click();
    await assertRecordInspector(page);
    assert.match(await drawer.innerText(), /75.85.*归属日.*2025.07.10/s);
    assert.equal(await page.locator('dialog').count(), 1, "历史与记录在同一个 dialog 中导航");
    await drawer.getByRole("button", { name: "返回完整历史", exact: false }).click();
    assert.equal(await drawer.locator('details:has(> summary time[datetime="2025-07-10"])').getAttribute("open"), "");
    assert.ok(Math.abs(await drawer.locator('div[class*="drawerContent"]').evaluate(node => node.scrollTop) - historyScroll) < 1, "返回历史恢复索引滚动位置");
    assert.equal(await historicalEntry.evaluate(node => node === document.activeElement), true, "返回历史恢复记录入口焦点");
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
    console.log("通过：桌面实测摘要、晨晚折线、估计虚线和依据、来源标注、候选同步与历史抽屉。");

    for (const [width, height] of [[390, 844], [320, 740], [844, 390]]) {
      const mobile = await loggedInPage({ width, height }, first, { isMobile: true, hasTouch: true, reducedMotion: "reduce" });
      await chartFor(mobile.page).locator('[data-point-id]').first().waitFor();
      await assertRecentLayout(mobile.page);
      await assertEstimateRules(mobile.page);
      for (const checked of [false, true, false, true]) await assertStableEveningToggle(mobile.page, checked, true);
      assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px 页面不横向溢出`);
      assert.equal(await recentFor(mobile.page).locator("tbody tr").count(), 10);
      await mobile.page.screenshot({ path: `${artifacts}/mobile-${width}-30-days.png`, fullPage: true });
      if (width === 390) {
        const layout = await mobile.page.evaluate(() => ({ height: document.documentElement.scrollHeight, viewport: innerHeight, sections: [...document.querySelectorAll('main > header, main > section > section')].map((node) => ({ label: node.getAttribute('aria-label'), height: node.getBoundingClientRect().height })) }));
        assert.ok(layout.height <= layout.viewport * 1.5, `手机默认主要阅读内容不超过约 1.5 屏：${JSON.stringify(layout)}`);
      }
      const densePoint = chartFor(mobile.page).locator('[data-point-id][data-date="2025-07-09"][data-period="daytime"][data-kind="estimated"]');
      await densePoint.tap();
      const denseModal = await assertSimpleEstimate(mobile.page);
      assert.match(await denseModal.innerText(), /2025.07.09/, "30D 密集点点击仍命中指定日期");
      assert.equal(await denseModal.getByRole("heading", { name: "2025.07.09", exact: true }).count(), 1);
      await mobile.page.keyboard.press("Escape");
      await denseModal.waitFor({ state: "hidden" });
      await mobile.page.getByRole("button", { name: "7D", exact: true }).click();
      await mobile.page.waitForFunction(() => {
        const plot = document.querySelector('section[aria-label="身体指标趋势"] svg[role="group"]');
        return plot && plot.getBoundingClientRect().width <= plot.parentElement.clientWidth;
      });
      await mobile.page.screenshot({ path: `${artifacts}/mobile-${width}-7-days.png`, fullPage: true });
      await chartFor(mobile.page).locator('[data-point-id][data-date="2025-07-08"][data-period="daytime"]').tap();
      const mobileDrawer = await assertRecordInspector(mobile.page);
      assert.match(await mobileDrawer.locator('[data-record-value]').innerText(), /76.20/);
      assert.match(await mobileDrawer.innerText(), /虚构蓝牙体重秤/);
      assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await mobile.page.screenshot({ path: `${artifacts}/mobile-${width}-details-drawer.png` });
      await mobileDrawer.getByRole("button", { name: "关闭记录详情", exact: true }).tap();
      await mobileDrawer.waitFor({ state: "hidden" });
      await chartFor(mobile.page).locator('[data-point-id][data-date="2025-07-09"][data-period="daytime"][data-kind="estimated"]').tap();
      await assertSimpleEstimate(mobile.page);
      assert.equal(await detailFor(mobile.page).count(), 0);
      assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "估计详情不撑宽手机页面");
      assert.match(await mobileDrawer.innerText(), /日常估计/);
      await mobile.page.screenshot({ path: `${artifacts}/mobile-${width}-single-estimate.png` });
      await mobileDrawer.getByRole("button", { name: "关闭记录详情", exact: true }).tap();
      await mobileDrawer.waitFor({ state: "hidden" });
      await chartFor(mobile.page).locator('[data-point-id][data-date="2025-07-14"][data-period="daytime"]').tap();
      await assertRecordInspector(mobile.page);
      assert.match(await mobileDrawer.innerText(), /时间为占位/);
      assert.match(await mobileDrawer.locator('header').first().innerText(), /实测/);
      await mobileDrawer.getByRole("button", { name: "关闭记录详情", exact: true }).tap();
      await mobileDrawer.waitFor({ state: "hidden" });
      await mobile.page.getByRole("button", { name: "全部", exact: true }).tap();
      assert.equal(await chartFor(mobile.page).locator('[data-point-id][data-date="2024-12-01"]').count(), 1);
      await applyCustom(mobile.page, "2025-07-14", "2025-07-14");
      assert.equal(await chartFor(mobile.page).locator('[data-point-id]').count(), 2, "单日视角同时显示晨晚实测");
      assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await mobile.context.close();
    }
    for (const width of [1440, 390, 320]) {
      const initialized = await loggedInPage({ width, height: width === 1440 ? 1000 : 844 }, initializedAccount);
      const initializedChart = chartFor(initialized.page);
      await assertRecentLayout(initialized.page);
      await initializedChart.locator('[data-date="2025-08-05"][data-period="daytime"][data-kind="observed"]').click();
      const observedModal = await assertRecordInspector(initialized.page);
      assert.match(await observedModal.innerText(), /API 写入.*仅记录日期与时段/s);
      assert.equal(await observedModal.getByText("时区", { exact: true }).count(), 0, "未知时区不编造值");
      assert.equal(await observedModal.getByText("设备", { exact: true }).count(), 0, "未知设备不占空行");
      await initialized.page.screenshot({ path: `${artifacts}/initialization-${width}-observed.png` });
      await initialized.page.keyboard.press("Escape");
      await observedModal.waitFor({ state: "hidden" });
      const point = initializedChart.locator('[data-date="2025-08-06"][data-period="daytime"]');
      assert.match(await point.getAttribute("aria-label"), /估计.*晨间趋势插值/);
      await point.focus(); await initialized.page.keyboard.press("Enter");
      const modal = await assertSimpleEstimate(initialized.page);
      assert.match(await modal.textContent(), /历史补全/);
      assert.match(await modal.textContent(), /80.00.*82.00.*1\/2.*81.00/s);
      assert.match(await modal.innerText(), /基于 2 个真实晨间日/);
      await modal.getByText("查看真实参考记录（2 条）", { exact: true }).first().click();
      assert.match(await modal.textContent(), /2025-08-05 晨间空腹实测：80.00/);
      assert.equal(await initialized.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await initialized.page.screenshot({ path: `${artifacts}/initialization-${width}-calculation.png` });
      await initialized.page.keyboard.press("Escape");
      await initialized.page.locator("dialog").waitFor({ state: "detached" });
      const direct = recentFor(initialized.page).getByRole("button", { name: "查看 2025-08-06 晨间估计依据", exact: true });
      await direct.focus(); await initialized.page.keyboard.press("Enter");
      await assertSimpleEstimate(initialized.page);
      assert.match(await modal.innerText(), /81.00/);
      await initialized.page.keyboard.press("Escape");
      await initialized.page.locator("dialog").waitFor({ state: "detached" });
      assert.equal(await direct.evaluate(node => node === document.activeElement), true, "单值详情焦点返回表格触发按钮");
      await initialized.page.keyboard.press("Space");
      await assertSimpleEstimate(initialized.page);
      await initialized.page.keyboard.press("Escape");
      await initialized.page.locator("dialog").waitFor({ state: "detached" });
      await initializedChart.locator('[data-date="2025-08-04"][data-period="daytime"]').focus();
      await initialized.page.keyboard.press("Enter");
      await assertSimpleEstimate(initialized.page);
      assert.match(await modal.textContent(), /历史边界趋势推算/);
      assert.match(await modal.textContent(), /3 个真实晨间日/);
      await initialized.page.keyboard.press("Escape");
      await initialized.page.locator("dialog").waitFor({ state: "detached" });
      await initialized.context.close();
      console.log(`通过：${width}px 初始化插值／外推详情与键盘访问。`);
    }
    console.log("通过：统一实测／估计 Inspector、直接点击、独立候选与历史返回、历史补全／日常估计来源、插值／趋势依据、真实样本列表、统一规则与宽幅表格。");
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
