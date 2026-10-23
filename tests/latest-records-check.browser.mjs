import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);

export async function checkLatestRecords({ baseURL, context, page, token, today }) {
  const folder = ".codex/latest-record-visual"; await mkdir(folder, { recursive: true });
  const headers = { Authorization: `Bearer ${token}` }, intakeDate = shift(today, -2), energyDate = shift(today, -1);
  const response = await context.request.post(`${baseURL}/api/v1/record-operations`, { headers, data: { operationId: randomUUID(), items: ["早餐", "午餐", "晚餐"].map((mealType, index) => ({ key: `latest-${index}`, kind: "save_meal", date: intakeDate, mealType, items: [{ kind: "food", name: "虚构摘要食物", nutrition: { caloriesKcal: "200", proteinG: null, carbsG: null, fatG: null } }] })) } });
  assert.equal(response.status(), 200); const operation = await response.json();
  await page.goto(operation.confirmationUrl); await page.getByRole("button", { name: /确认并全部保存/ }).click(); await page.waitForURL(`${baseURL}/dashboard`);
  for (const width of [320, 390, 430, 1100, 1440]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    const intake = page.getByRole("link", { name: "饮食记录", exact: true }), energy = page.getByRole("link", { name: "消耗记录", exact: true }), body = page.getByRole("link", { name: "身体记录", exact: true });
    await intake.waitFor({ state: "visible" }); await body.waitFor({ state: "visible" });
    assert.match(await intake.innerText(), new RegExp(intakeDate)); assert.match(await intake.innerText(), /3 餐/); assert.match(await intake.innerText(), /600/);
    assert.equal(await energy.locator("time").getAttribute("datetime"), energyDate);
    assert.match(await body.innerText(), new RegExp(today));
    if (width < 700) {
      const boxes = await Promise.all([body.boundingBox(), intake.boundingBox(), energy.boundingBox()]);
      assert.ok(boxes[0].y < boxes[1].y && boxes[1].y < boxes[2].y);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${folder}/overview-${width}.png`, fullPage: true });
    await energy.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${folder}/cards-${width}.png` });
  }
  await page.goto(`${baseURL}/dashboard/energy`);
  const dialog = () => page.locator("dialog[aria-labelledby]");
  const open = async date => { await page.locator(`[data-energy-day="${date}"]`).getByRole("button", { name: /^(录入|补录|编辑)$/ }).click(); await dialog().waitFor(); };
  const save = async () => { await dialog().getByRole("button", { name: /^保存/ }).click(); await dialog().waitFor({ state: "hidden" }); };
  const close = async () => { await page.getByRole("button", { name: "关闭编辑", exact: true }).click(); await dialog().waitFor({ state: "hidden" }); };
  await open(shift(today, -3));
  await dialog().getByRole("combobox", { name: "静息来源", exact: true }).fill("虚构 Garmin");
  await dialog().getByRole("combobox", { name: "活动来源", exact: true }).fill("虚构 Garmin"); await save();
  for (const width of [320, 390, 430, 1100, 1440]) {
    await page.setViewportSize({ width, height: 844 }); await open(today);
    const source = dialog().getByRole("combobox", { name: "静息来源", exact: true });
    assert.equal(await source.inputValue(), ""); await source.click();
    const options = dialog().getByRole("grid", { name: "静息来源历史建议", exact: true });
    await options.getByRole("gridcell", { name: "虚构 Garmin", exact: true }).waitFor();
    assert.equal(await options.getByText("虚构秤", { exact: true }).count(), 0);
    await source.press("ArrowDown"); await source.press("Enter"); assert.equal(await source.inputValue(), "虚构 Garmin");
    await source.click(); await options.waitFor({ state: "visible" });
    const remove = options.getByRole("button", { name: "移除来源建议 虚构 Garmin", exact: true }), box = await remove.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${folder}/source-${width}.png` });
    await close();
  }
  await open(today);
  const source = dialog().getByRole("combobox", { name: "静息来源", exact: true });
  await source.click(); await source.press("ArrowDown"); await source.press("Enter"); await source.click();
  await dialog().getByRole("button", { name: "移除来源建议 虚构 Garmin", exact: true }).click();
  await source.click(); await dialog().getByRole("grid", { name: "静息来源历史建议", exact: true }).getByText("暂无历史来源。", { exact: true }).waitFor(); assert.equal(await source.inputValue(), "虚构 Garmin");
  await close(); await page.reload(); await open(today); await dialog().getByRole("combobox", { name: "静息来源", exact: true }).click(); await dialog().getByRole("grid", { name: "静息来源历史建议", exact: true }).getByText("暂无历史来源。", { exact: true }).waitFor(); await close();
  await open(shift(today, -4)); await dialog().getByRole("combobox", { name: "静息来源", exact: true }).fill("虚构 Garmin"); await save();
  const preview = await context.request.post(`${baseURL}/api/v1/record-operations`, { headers, data: { operationId: randomUUID(), items: [{ key: "source-review", kind: "save_energy_day", date: shift(today, -70), entryMode: "total", totalKcal: "2500" }] } });
  assert.equal(preview.status(), 200); const review = await preview.json();
  await page.goto(review.confirmationUrl); await page.getByRole("button", { name: "修改", exact: true }).click();
  await dialog().getByRole("combobox", { name: "总消耗来源", exact: true }).click(); await dialog().getByRole("gridcell", { name: "虚构 Garmin", exact: true }).click();
  await dialog().getByRole("button", { name: "更新预览", exact: true }).click(); await dialog().waitFor({ state: "hidden" });
  const untouched = await context.request.get(`${baseURL}/api/v1/energy?from=${shift(today, -70)}&to=${shift(today, -70)}`, { headers });
  assert.equal((await untouched.json()).records.length, 0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log("最新日期摘要、五种宽度来源选择、持久移除与AI审核检查通过");
}
