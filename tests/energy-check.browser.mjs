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
  await edit({ "静息 · kcal": "2000", "活动合计 · kcal": "800" }); assert.match((await summary.innerText()).replaceAll(",", ""), /2800/);
  await page.getByRole("button", { name: "添加活动", exact: true }).first().click(); await dialog().getByLabel("活动名称", { exact: true }).fill("虚构跑步"); await dialog().getByLabel("活动热量 · kcal", { exact: true }).fill("800"); await dialog().getByLabel("时长 · 分钟", { exact: true }).fill("60"); await save(); assert.match((await summary.innerText()).replaceAll(",", ""), /2800/);
  await edit({ "活动合计 · kcal": "", "全天总消耗 · kcal": "3100" }); assert.match((await summary.innerText()).replaceAll(",", ""), /3100/);
  await edit({ "全天总消耗 · kcal": "" }); assert.match((await summary.innerText()).replaceAll(",", ""), /2800/);
  const todayRow = page.locator(`[data-energy-day="${today}"]`); await todayRow.locator("summary").click(); await todayRow.getByRole("button", { name: "编辑活动", exact: true }).click(); await dialog().getByLabel("活动热量 · kcal", { exact: true }).fill("850"); await save(); assert.match((await summary.innerText()).replaceAll(",", ""), /2850/);
  await todayRow.getByRole("button", { name: "删除活动", exact: true }).click(); await page.getByText("最近删除 · 1", { exact: true }).waitFor(); assert.match((await summary.innerText()).replaceAll(",", ""), /总消耗\s*—/);
  await page.getByText("最近删除 · 1", { exact: true }).click(); await page.getByRole("button", { name: "恢复", exact: true }).click(); await page.getByText("最近删除 · 1", { exact: true }).waitFor({ state: "hidden" }); assert.match((await summary.innerText()).replaceAll(",", ""), /2850/);
  await edit({ "静息 · kcal": "", "活动合计 · kcal": "0" }); assert.match((await summary.innerText()).replaceAll(",", ""), /总消耗\s*—/);
  await page.getByRole("button", { name: "公式资料", exact: true }).click(); await dialog().getByLabel("身高", { exact: true }).fill("175"); await dialog().getByLabel("出生日期", { exact: true }).fill("1994-08-01"); await dialog().getByLabel("公式性别参数", { exact: true }).selectOption("male"); await save(); assert.match((await summary.innerText()).replaceAll(",", ""), /估计/); assert.doesNotMatch((await summary.innerText()).replaceAll(",", ""), /总消耗\s*—/);
  await page.getByText("公式资料与历史", { exact: true }).click(); await page.getByRole("button", { name: "编辑资料", exact: true }).click(); await dialog().getByLabel("生效日期", { exact: true }).fill(previous(today, -1));
  let historicalConfirmation = false; page.once("dialog", async prompt => { historicalConfirmation = true; assert.match(prompt.message(), /生效/); await prompt.accept(); }); await save(); assert.ok(historicalConfirmation);
  await edit({ "静息 · kcal": "2000", "活动合计 · kcal": "800" });
  const result = await api(); assert.equal(Number(result.days[0].totalKcal), 2800);
  // 默认值按账号保存；不用为每天建立虚构的零活动明细。
  await page.getByRole("button", { name: "日常默认值", exact: true }).click();
  await dialog().getByLabel("平均静息生效日期", { exact: true }).fill(previous(today, -60)); await dialog().getByLabel("平均静息 · kcal", { exact: true }).fill("2100");
  page.once("dialog", prompt => prompt.accept()); await save();
  await edit({ "静息 · kcal": "", "活动合计 · kcal": "" });
  await todayRow.locator("summary").click(); await todayRow.getByRole("button", { name: "删除活动", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "已保存" }).waitFor(); assert.match((await summary.innerText()).replaceAll(",", ""), /总消耗\s*2100/); assert.match((await summary.innerText()).replaceAll(",", ""), /活动\s*0/);
  await page.getByText("静息公式对照", { exact: true }).click(); assert.match(await page.getByText(/公式估算.*kcal／天/).innerText(), /175 cm/);
  await page.getByRole("button", { name: "记录当天", exact: true }).click(); await dialog().getByLabel("活动合计 · kcal", { exact: true }).fill("200"); await dialog().getByLabel("活动合计为估算", { exact: true }).check(); await dialog().getByLabel("备注", { exact: true }).fill("虚构初始化估算"); await save();
  assert.match(await todayRow.innerText(), /活动估计/);
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
  assert.deepEqual(await positive.locator("[data-series]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-series"))), ["intake", "expenditure", "balance", "weight-change"]);
  assert.equal(await positive.locator('[data-series="balance"]').getAttribute("data-overview-value"), "200"); assert.equal(await negative.locator('[data-series="balance"]').getAttribute("data-overview-value"), "-1000");
  assert.equal(await positive.locator('[data-series="weight-change"]').getAttribute("data-overview-value"), "-0.25"); assert.equal(await negative.locator('[data-series="weight-change"]').count(), 0);
  const baseline = Number(await chart.locator("[data-overview-zero]").getAttribute("y1")); assert.ok(Number(await positive.locator('[data-series="balance"]').getAttribute("y")) < baseline); assert.equal(Number(await negative.locator('[data-series="balance"]').getAttribute("y")), baseline);
  await positive.focus(); await page.keyboard.press("ArrowRight"); assert.equal(await negative.evaluate(node => node === document.activeElement), true); await page.keyboard.press("Enter"); await dialog().getByText("总消耗 2,800 kcal", { exact: true }).waitFor(); await page.keyboard.press("Escape");
  for (const width of [1440, 1100, 390, 320]) { await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 }); await page.getByRole("button", { name: "7D", exact: true }).click(); await page.waitForTimeout(300); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); assert.doesNotMatch(await page.locator("main").innerText(), /共用零点|以.*为基准|当天已记录摄入|预算未设置/); await page.screenshot({ path: `/tmp/formward-energy-visual/overview-${width}.png`, fullPage: true });
    await page.getByRole("link", { name: "消耗记录", exact: true }).first().click(); await summary.waitFor(); await page.getByRole("group", { name: "每日消耗柱状图", exact: true }).scrollIntoViewIfNeeded(); await page.waitForTimeout(550); assert.equal(await summary.locator("strong").evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().right <= node.parentElement.getBoundingClientRect().right + 1)), true); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.screenshot({ path: `/tmp/formward-energy-visual/energy-${width}.png`, fullPage: true }); await page.getByRole("link", { name: "← 总览", exact: true }).first().click(); await chart.waitFor(); }
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.getByRole("button", { name: "90D", exact: true }).click(); await page.waitForTimeout(100); assert.equal(await chart.evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.playState === "running").length), 0);
  console.log("消耗录入、优先级、明细编辑、删除恢复、公式历史确认、混合AI审核、正负盈余、相邻晨重、键盘、四种宽度与减少动态效果通过");
}
