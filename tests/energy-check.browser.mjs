import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const previous = (date, offset) => new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
export async function checkEnergy({ baseURL, context, page, token, today }) {
  const api = async () => { const response = await context.request.get(`${baseURL}/api/v1/energy?from=${today}&to=${today}`, { headers: { Authorization: `Bearer ${token}` } }); assert.equal(response.status(), 200); return response.json(); };
  await page.goto(`${baseURL}/dashboard/energy`);
  const summary = page.getByRole("group", { name: "今日消耗", exact: true });
  await summary.waitFor(); assert.match((await summary.innerText()).replaceAll(",", ""), /总消耗\s*—/);
  const dialog = () => page.locator("dialog[aria-labelledby]");
  const save = async () => { await dialog().getByRole("button", { name: "保存", exact: true }).click(); await dialog().waitFor({ state: "hidden" }); };
  const edit = async fields => { await page.getByRole("button", { name: "记录当天", exact: true }).click(); for (const [label, value] of Object.entries(fields)) await dialog().getByRole("spinbutton", { name: label, exact: true }).fill(value); await save(); };
  assert.equal(await page.getByRole("button", { name: "日常默认值", exact: true }).count(), 0);
  await edit({ "静息 · kcal": "2000", "活动合计 · kcal": "800" }); assert.match((await summary.innerText()).replaceAll(",", ""), /2800/);
  await page.getByRole("button", { name: "记录当天", exact: true }).click();
  assert.equal(await dialog().getByLabel("来源记录编号", { exact: true }).count(), 0);
  await dialog().getByLabel("静息来源", { exact: true }).fill("虚构静息设备"); await dialog().getByLabel("活动来源", { exact: true }).fill("虚构活动设备");
  await dialog().getByRole("button", { name: "只记总数", exact: true }).click();
  assert.equal(await dialog().getByLabel("静息 · kcal", { exact: true }).isVisible(), false);
  await dialog().getByLabel("全天总消耗 · kcal", { exact: true }).fill("3100"); await save(); assert.match((await summary.innerText()).replaceAll(",", ""), /3100/);
  await page.getByRole("button", { name: "记录当天", exact: true }).click(); await dialog().getByRole("button", { name: "分开记录", exact: true }).click();
  assert.equal(await dialog().getByLabel("全天总消耗 · kcal", { exact: true }).isVisible(), false);
  await dialog().getByRole("button", { name: "按运动累计", exact: true }).click(); await dialog().getByRole("button", { name: "＋ 添加运动", exact: true }).click();
  await dialog().getByLabel("运动名称 1", { exact: true }).fill("虚构跑步"); await dialog().getByLabel("运动热量 · kcal 1", { exact: true }).fill("800"); await dialog().getByLabel("运动时长 · 分钟 1", { exact: true }).fill("60"); await dialog().getByLabel("运动来源 1", { exact: true }).fill("虚构运动设备"); await save(); assert.match((await summary.innerText()).replaceAll(",", ""), /2800/);
  // 隐藏模式中的无效草稿不应阻止当前模式保存，草稿也不进入请求。
  await page.getByRole("button", { name: "记录当天", exact: true }).click(); await dialog().getByRole("button", { name: "只记总数", exact: true }).click(); await dialog().getByLabel("全天总消耗 · kcal", { exact: true }).fill("-1"); await dialog().getByRole("button", { name: "分开记录", exact: true }).click(); await save(); assert.match((await summary.innerText()).replaceAll(",", ""), /2800/);
  const todayRow = page.locator(`[data-energy-day="${today}"]`); await todayRow.locator("summary").click(); await todayRow.getByRole("button", { name: "编辑活动", exact: true }).click(); await dialog().getByLabel("活动热量 · kcal", { exact: true }).fill("850"); await save(); assert.match((await summary.innerText()).replaceAll(",", ""), /2850/);
  await todayRow.getByRole("button", { name: "删除活动", exact: true }).click(); await page.getByText("最近删除 · 1", { exact: true }).waitFor(); assert.match((await summary.innerText()).replaceAll(",", ""), /2000/);
  await page.getByText("最近删除 · 1", { exact: true }).click(); await page.getByRole("button", { name: "恢复", exact: true }).click(); await page.getByText("最近删除 · 1", { exact: true }).waitFor({ state: "hidden" }); assert.match((await summary.innerText()).replaceAll(",", ""), /2850/);
  await page.getByRole("button", { name: "记录当天", exact: true }).click(); await dialog().getByRole("button", { name: "记合计", exact: true }).click(); await dialog().getByLabel("静息 · kcal", { exact: true }).fill(""); await dialog().getByLabel("活动合计 · kcal", { exact: true }).fill("0"); await save(); assert.match((await summary.innerText()).replaceAll(",", ""), /总消耗\s*—/);
  await page.getByRole("button", { name: "公式资料", exact: true }).click(); await dialog().getByLabel("身高", { exact: true }).fill("175"); await dialog().getByLabel("出生日期", { exact: true }).fill("1994-08-01"); await dialog().getByLabel("公式性别参数", { exact: true }).selectOption("male"); await save(); assert.match((await summary.innerText()).replaceAll(",", ""), /总消耗\s*—/);
  await page.getByText("静息公式对照", { exact: true }).click(); assert.match(await page.getByText(/公式估算.*kcal／天/).innerText(), /175 cm/);
  assert.doesNotMatch(await page.locator("main").innerText(), /当前采用|来源与依据|活动合计为估算/);
  await page.getByText("公式资料与历史", { exact: true }).click(); await page.getByRole("button", { name: "编辑资料", exact: true }).click(); await dialog().getByLabel("生效日期", { exact: true }).fill(previous(today, -1));
  let historicalConfirmation = false; page.once("dialog", async prompt => { historicalConfirmation = true; assert.match(prompt.message(), /生效/); await prompt.accept(); }); await save(); assert.ok(historicalConfirmation);
  await edit({ "静息 · kcal": "2000", "活动合计 · kcal": "800" });
  const result = await api(); assert.equal(Number(result.days[0].totalKcal), 2800); assert.equal(result.defaults, undefined); assert.equal(result.records[0].restingSourceSystem, "虚构静息设备"); assert.equal(result.records[0].activeSourceSystem, "虚构活动设备");
  // 同一份请求同时预览身体、饮食和消耗，确认之前不改变事实。
  const old = previous(today, -40), next = previous(today, -39);
  const payload = { operationId: randomUUID(), items: [
    { key: "energy", kind: "save_energy_day", date: old, restingKcal: "2000", activeKcal: "800" },
    { key: "weight", kind: "save_record", date: old, period: "daytime", weightKg: "72", fasting: true, deviceLabel: "虚构秤" },
    { key: "next", kind: "save_record", date: next, period: "daytime", weightKg: "71.75", fasting: true, deviceLabel: "虚构秤" },
    { key: "food", kind: "save_meal", date: old, mealType: "虚构午餐", items: [{ kind: "food", name: "虚构食物", nutrition: { caloriesKcal: "3000", proteinG: null, carbsG: null, fatG: null } }] },
    { key: "next-energy", kind: "save_energy_day", date: next, totalKcal: "2800" },
    { key: "next-food", kind: "save_meal", date: next, mealType: "虚构午餐", items: [{ kind: "food", name: "虚构食物", nutrition: { caloriesKcal: "1800", proteinG: null, carbsG: null, fatG: null } }] }
  ] };
  const response = await context.request.post(`${baseURL}/api/v1/record-operations`, { headers: { Authorization: `Bearer ${token}` }, data: payload }); assert.equal(response.status(), 200); const operation = await response.json();
  await page.goto(operation.confirmationUrl ?? `${baseURL}/dashboard/ai/operations/${operation.id}`); await page.getByRole("button", { name: /保存/ }).last().click(); await page.waitForURL(`${baseURL}/dashboard`);
  const chart = page.getByRole("group", { name: "摄入、消耗、盈余与次晨体重变化", exact: true }); await chart.waitFor();
  await page.getByRole("button", { name: "全部", exact: true }).click();
  const positive = chart.locator(`[data-overview-date="${old}"]`), negative = chart.locator(`[data-overview-date="${next}"]`);
  assert.equal(await chart.locator("[data-overview-panel]").count(), 2);
  assert.equal(await positive.getAttribute("data-balance"), "200"); assert.equal(await negative.getAttribute("data-balance"), "-1000");
  assert.equal(await positive.locator('[data-series="weight-change"]').getAttribute("data-overview-value"), "-0.25");
  assert.equal(await negative.locator('[data-series="weight-change"]').count(), 0);
  assert.equal(await chart.locator('[data-energy-band="surplus"]').first().getAttribute("fill"), "#D8B38A");
  assert.equal(await chart.locator('[data-energy-band="deficit"]').first().getAttribute("fill"), "#92B2C2");
  await positive.click(); assert.equal(await dialog().count(), 0);
  await positive.focus(); await page.keyboard.press("ArrowRight"); assert.equal(await negative.evaluate(node => node === document.activeElement), true); await page.keyboard.press("Enter"); await dialog().getByText("总消耗 2,800 kcal", { exact: true }).waitFor(); await page.keyboard.press("Escape");
  // 连续虚构资料包含正负交叉、单项缺测与连续缺日，用于真实页面的视觉验收。
  const fixtures = [];
  for (let i = -29; i < 0; i++) {
    const date = previous(today, i);
    if (![-17, -16, -4].includes(i)) fixtures.push({ key: `meal-${i}`, kind: "save_meal", date, mealType: "虚构午餐", items: [{ kind: "food", name: "虚构验收食物", nutrition: { caloriesKcal: String(2500 + Math.round(Math.sin(i * .7) * 440)), proteinG: null, carbsG: null, fatG: null } }] });
    if (i < -8 && ![-10, -9].includes(i)) fixtures.push({ key: `energy-${i}`, kind: "save_energy_day", date, totalKcal: String(2650 + Math.round(Math.cos(i * .55) * 260)) });
    if (i < -8 && i !== -20) fixtures.push({ key: `weight-${i}`, kind: "save_record", date, period: "daytime", fasting: true, weightKg: String(Math.round((70 + Math.sin(i * .6) * .3) * 100) / 100), deviceLabel: "虚构秤" });
  }
  for (let i = 0; i < fixtures.length; i += 30) {
    const response = await context.request.post(`${baseURL}/api/v1/record-operations`, { headers: { Authorization: `Bearer ${token}` }, data: { operationId: randomUUID(), items: fixtures.slice(i, i + 30) } });
    assert.equal(response.status(), 200); const operation = await response.json();
    await page.goto(operation.confirmationUrl); await page.getByRole("button", { name: /保存/ }).last().click(); await page.waitForURL(`${baseURL}/dashboard`);
  }
  for (const width of [1440, 1100, 390, 320]) { await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 }); await page.getByRole("button", { name: width < 500 ? "7D" : "30D", exact: true }).click(); await chart.locator(`[data-overview-date="${previous(today, -3)}"]`).focus(); await page.waitForTimeout(550); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); assert.doesNotMatch(await page.locator("main").innerText(), /共用零点|以.*为基准|当天已记录摄入|预算未设置|当前采用|来源与依据|活动合计为估算|日常默认值/); assert.equal(await page.getByLabel("日期对照", { exact: true }).locator("strong").evaluateAll(nodes => nodes.every(node => { const range = document.createRange(); range.selectNodeContents(node); const ink = range.getBoundingClientRect(), cell = node.parentElement.getBoundingClientRect(); return ink.left >= cell.left - 1 && ink.right <= cell.right + 1; })), true);
    assert.equal(await chart.evaluate(group => {
      const panels = [...group.querySelectorAll("[data-overview-panel]")];
      const boxes = nodes => [...nodes].map(n => n.getBoundingClientRect());
      const collides = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const sets = [...panels.map(panel => boxes(panel.querySelectorAll("[data-axis-tick] text"))), boxes(group.querySelectorAll("[data-overview-date] > text"))];
      return sets.every(set => set.every((a,i) => set.every((b,j) => i === j || !collides(a,b))));
    }), true);
    const topBefore = await chart.locator("svg").evaluate(node => node.getBoundingClientRect().top + scrollY);
    await chart.locator(`[data-overview-date="${previous(today, -4)}"]`).focus();
    assert.equal(await chart.locator("svg").evaluate(node => node.getBoundingClientRect().top + scrollY), topBefore);
    await chart.locator(`[data-overview-date="${previous(today, -3)}"]`).focus();
    const centers = await chart.locator(`[data-overview-date="${previous(today, -3)}"] [data-series]`).evaluateAll(nodes => nodes.map(n => n.getAttribute("cx"))); assert.equal(new Set(centers).size, 1);
    await page.screenshot({ path: `/tmp/formward-energy-visual/overview-${width}.png`, fullPage: true });
    await page.getByRole("link", { name: "消耗记录", exact: true }).first().click(); await summary.waitFor(); await page.getByRole("group", { name: "每日消耗柱状图", exact: true }).scrollIntoViewIfNeeded(); await page.waitForTimeout(550); assert.equal(await summary.locator("strong").evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().right <= node.parentElement.getBoundingClientRect().right + 1)), true); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.screenshot({ path: `/tmp/formward-energy-visual/energy-${width}.png`, fullPage: true }); await page.getByRole("link", { name: "← 总览", exact: true }).first().click(); await chart.waitFor(); }
  for (const range of ["30D", "90D", "全部", "自定义"]) {
    await page.getByRole("button", { name: range, exact: true }).click();
    if (range === "自定义") { await page.getByLabel("总览开始日期", { exact: true }).fill(old); await page.getByLabel("总览结束日期", { exact: true }).fill(next); }
    assert.equal(await chart.locator("[data-overview-panel]").count(), 2);
    for (const panel of await chart.locator("[data-overview-panel]").all()) {
      const ticks = await panel.locator("[data-axis-tick]").evaluateAll(nodes => nodes.map(node => Number(node.getAttribute("data-axis-tick"))));
      if (await panel.getAttribute("data-overview-panel") === "weight") assert.ok(ticks.includes(0)); if (ticks.length > 2) { const step = ticks[1] - ticks[0]; assert.ok(ticks.slice(1).every((value, index) => Math.abs(value - ticks[index] - step) < 1e-8)); }
    }
  }
  await page.getByRole("button", { name: "30D", exact: true }).click();
  assert.ok(await chart.locator("mask").count() > 0);
  assert.ok(await chart.locator('[data-missing-run="energy"]').count() > 0);
  assert.equal(await chart.locator("mask").evaluateAll(nodes => new Set(nodes.map(n => n.id)).size === nodes.length && nodes.every(n => n.getAttribute("maskUnits") === "userSpaceOnUse")), true);
  const plot = chart.locator("svg"); const box = await plot.boundingBox();
  await page.mouse.move(box.x + box.width * .8, box.y + 80); const before = await page.getByLabel("日期对照", { exact: true }).getAttribute("data-selected-date");
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .4, box.y + 85, { steps: 6 }); await page.mouse.up();
  assert.notEqual(await page.getByLabel("日期对照", { exact: true }).getAttribute("data-selected-date"), before);
  assert.equal(await dialog().count(), 0); await page.getByRole("button", { name: "查看记录 →", exact: true }).click(); await dialog().waitFor(); await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.getByRole("button", { name: "90D", exact: true }).click(); await page.waitForTimeout(100); assert.equal(await chart.evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.playState === "running").length), 0);
  console.log("消耗录入、优先级、明细编辑、删除恢复、公式历史确认、混合AI审核、双层交叉填色、缺测遮罩、相邻晨重、键盘与拖动、四种宽度与减少动态效果通过");
}
