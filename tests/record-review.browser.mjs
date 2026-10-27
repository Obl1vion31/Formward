import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

export async function checkUnifiedReview({ baseURL, context, page, token, date, images = /** @type {string[]} */ ([]), artifacts = "/tmp/formward-records-visual" }) {
  await mkdir(artifacts, { recursive: true });
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const post = async items => { const response = await fetch(`${baseURL}/api/v1/record-operations`, { method: "POST", headers, body: JSON.stringify({ operationId: crypto.randomUUID(), items }) }); assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
  const readBody = async () => (await (await fetch(`${baseURL}/api/v1/measurements`, { headers })).json()).records;
  const readMeals = async () => (await (await fetch(`${baseURL}/api/v1/meals`, { headers })).json()).meals;
  const existingBody = await readBody(), morning = existingBody.find(row => row.recordDate === date && row.period === "daytime"), evening = existingBody.find(row => row.recordDate === date && row.period === "evening");
  const photoReview = { dateConfirmed: true, mealTypeConfirmed: true, identityConfirmed: true, amountConfirmed: true, cookingConfirmed: true, questions: [] };
  const items = [
    { key: "morning", kind: "save_record", date, period: "daytime", weightKg: "70.30", fasting: true, deviceLabel: "虚构统一审核秤", ...(morning ? { recordId: morning.id, version: morning.updatedAt } : {}) },
    { key: "evening", kind: "save_record", date, period: "evening", weightKg: "70.10", deviceLabel: "虚构统一审核秤", ...(evening ? { recordId: evening.id, version: evening.updatedAt } : {}) },
    { key: "food", kind: "save_food", name: "虚构混合审核食品", baseQuantity: "100", unit: "g", sourceKind: "estimated", basis: "虚构组成与营养，仅用于测试", nutrition: { caloriesKcal: "3500", proteinG: "127", carbsG: "354", fatG: "182" }, ...(images[0] ? { imageIds: [images[0]] } : {}) },
    { key: "meal", kind: "save_meal", date, mealType: "虚构统一晚餐", items: [{ kind: "food", name: "虚构混合审核食品", foodRef: "food", quantity: "100", unit: "g", sourceKind: "estimated" }], ...(images[1] ? { imageIds: [images[1]], expectedImageCount: 2, photoReview } : {}) },
  ];
  items.push({ key: "energy", kind: "save_energy_day", date, restingKcal: "2000", activeKcal: "800" });
  const operation = await post(items), beforeMeals = (await readMeals()).length;
  const row = key => page.locator(`[data-review-key="${key}"]`), save = () => page.getByRole("button", { name: "确认保存", exact: true });
  await page.goto(operation.confirmationUrl); await page.getByRole("heading", { name: "确认记录", exact: true }).waitFor();
  assert.equal(await page.getByRole("region", { name: "身体状况", exact: true }).count(), 1);
  for (const width of [1440, 1100, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.ok(await save().evaluate(button => { const r = button.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; }), "统一保存按钮始终在视口底部可见");
    await page.screenshot({ path: `${artifacts}/review-${width}.png`, fullPage: true });
  }
  const stalePage = await context.newPage(); await stalePage.goto(operation.confirmationUrl);
  await row("morning").getByRole("button", { name: "修改", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "修改待保存内容", exact: true });
  await dialog.getByLabel("体重（kg）", { exact: true }).fill("70.40");
  await dialog.getByRole("button", { name: "应用修改", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
  assert.ok((await row("morning").innerText()).includes("70.40kg"));
  assert.equal((await readBody()).find(record => record.id === morning?.id)?.weightKg, morning?.weightKg, "应用修改不写事实");
  assert.equal(await row("morning").getByRole("button",{name:"标记已核对",exact:true}).count(),0);
  assert.equal((await readMeals()).length, beforeMeals);
  await stalePage.locator('[data-review-key="morning"]').getByRole("button", { name: "修改", exact: true }).click();
  const staleDialog = stalePage.getByRole("dialog", { name: "修改待保存内容", exact: true });
  await staleDialog.getByLabel("测量来源", { exact: true }).fill("保留的并发草稿");
  await staleDialog.getByRole("button", { name: "应用修改", exact: true }).click();
  await staleDialog.getByRole("alert").filter({ hasText: "另一个页面" }).waitFor();
  assert.equal(await staleDialog.getByLabel("测量来源", { exact: true }).inputValue(), "保留的并发草稿");
  await staleDialog.getByRole("button", { name: "加载最新状态，保留输入", exact: true }).click();
  await staleDialog.getByRole("button", { name: "加载最新状态，保留输入", exact: true }).waitFor({ state: "hidden" });
  assert.equal(await staleDialog.getByLabel("测量来源", { exact: true }).inputValue(), "保留的并发草稿");
  await stalePage.close();

  // 餐次编辑保留同批 foodRef，按食材规格只读换算。
  await row("meal").getByRole("button", { name: "修改", exact: true }).click(); dialog = page.getByRole("dialog", { name: "修改待保存内容", exact: true });
  await dialog.getByLabel("餐次备注", { exact: true }).fill("虚构草稿备注");
  await dialog.getByRole("button", { name: "应用修改", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
  await row("food").getByRole("button", { name: "取消", exact: true }).click(); await page.locator('[data-review-key="food"][data-excluded="true"]').waitFor();
  await row("food").getByRole("button", { name: "恢复本项", exact: true }).click(); await page.locator('[data-review-key="food"][data-excluded="false"]').waitFor();
  await row("food").getByRole("button", { name: "取消", exact: true }).click(); await page.locator('[data-review-key="food"][data-excluded="true"]').waitFor();
  if(images.length){assert.equal(await save().isEnabled(),true);assert.equal(await row("meal").getByRole("checkbox").count(),0);}
  await save().click(); await page.getByRole("heading", { name: "已保存", exact: true }).waitFor();
  await page.screenshot({ path: `${artifacts}/saved.png`, fullPage: true });
  await page.waitForURL(`${baseURL}/dashboard`);
  const savedMeal = (await readMeals()).find(meal => meal.mealType === "虚构统一晚餐");
  assert.ok(savedMeal); assert.equal(Number(savedMeal.items[0].nutrition.caloriesKcal), 3500); assert.equal(savedMeal.items[0].foodId, undefined); assert.equal(savedMeal.items[0].foodSnapshot.baseQuantity, "100");
  assert.equal((await (await fetch(`${baseURL}/api/v1/foods`, { headers })).json()).foods.filter(food => food.name === "虚构混合审核食品").length, 0);
  const state = await (await fetch(`${baseURL}/api/v1/record-operations/${operation.id}`, { headers })).json(); assert.equal(state.status, "confirmed");
  await page.goto(operation.confirmationUrl); await page.getByRole("heading", { name: "已保存", exact: true }).waitFor(); assert.equal(await save().count(), 0);
  // 保存一餐不等于当天已记完；人工确认后才验收盈余图形。
  await page.goto(`${baseURL}/dashboard/meals?date=${date}`);
  const dayHistory = page.locator("dialog[open]");
  await dayHistory.locator("[data-meal-day-status]").click();
  await dayHistory.locator('[data-meal-day-status="complete"]').waitFor();await page.waitForFunction(()=>!document.querySelector('dialog[open] [data-meal-day-status]')?.disabled);
  await dayHistory.getByRole("button",{name:"关闭编辑",exact:true}).click();await dayHistory.waitFor({state:"hidden"});
  await page.goto(`${baseURL}/dashboard`);
  for (const width of [1440, 1100, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const days of [7, 30, 90]) {
      await page.getByRole("button", { name: `${days}D`, exact: true }).click();
      const chart = page.getByRole("group", { name: "摄入、消耗、盈余与次晨体重变化", exact: true });
      const values = await chart.evaluate((group, date) => {
        const day = group.querySelector(`[data-overview-date="${date}"]`);
        const n = key => Number(day.querySelector(`[data-series="${key}"]`).getAttribute("data-overview-value"));
        return { intake: n("intake"), expenditure: n("expenditure"), balance: Number(day.getAttribute("data-balance")) };
      }, date);
      assert.equal(values.expenditure,2800); assert.equal(values.balance,values.intake-2800);
      assert.equal(await chart.locator("[data-overview-panel]").count(), 2);

    }
    await page.screenshot({ path: `${artifacts}/overview-${width}.png`, fullPage: true });
  }
  await page.goto(`${baseURL}/dashboard/meals`);
  for (const mode of ["克数占比", "能量占比"]) {
    if(!await page.getByRole("button",{name:mode,exact:true}).isVisible())await page.locator("[data-chart-controls]>summary").click();
    await page.getByRole("button", { name: mode, exact: true }).click();
    for (const days of [7, 30, 90]) {
      await page.getByRole("button", { name: `${days}D`, exact: true }).click();
      if(!await page.getByRole("button",{name:mode,exact:true}).isVisible())await page.locator("[data-chart-controls]>summary").click();
      assert.equal(await page.getByRole("button", { name: mode, exact: true }).getAttribute("aria-pressed"), "true");
      const ratio = Number(await page.locator(`[data-bar-date="${date}"] [data-metric="fatG"]`).getAttribute("data-macro-ratio"));
      const totals = (await readMeals()).filter(meal => meal.date === date).flatMap(meal => meal.items).reduce((total, item) => ({ p: total.p + Number(item.nutrition.proteinG), c: total.c + Number(item.nutrition.carbsG), f: total.f + Number(item.nutrition.fatG) }), { p: 0, c: 0, f: 0 });
      const expected = mode === "克数占比" ? totals.f / (totals.p + totals.c + totals.f) : 9 * totals.f / (4 * totals.p + 4 * totals.c + 9 * totals.f);
      assert.ok(Math.abs(ratio - expected) < 1e-10);
    }
    await page.screenshot({ path: `${artifacts}/macros-${mode === "克数占比" ? "grams" : "energy"}.png`, fullPage: true });
  }
  if (images.length) {
    const updated = await post([{ ...savedMeal, key: "photo", kind: "save_meal", imageIds: [images[0]], expectedImageCount: 1, photoReview, items: savedMeal.items.map(item => ({ kind: "food", name: item.name, quantity: item.quantity, unit: item.unit, originalItemId: item.id, sourceKind: item.sourceKind })) , source: undefined, deletedAt: undefined, totals: undefined }].map(({ source, deletedAt, totals, day, ...rest }) => { void source; void deletedAt; void totals; void day; return rest; }));
    await page.goto(updated.confirmationUrl); await page.getByText('照片变更',{exact:true}).click(); await page.getByText("修改前图片", { exact: true }).waitFor(); await page.getByText("修改后图片", { exact: true }).waitFor();
    await page.screenshot({ path: `${artifacts}/photo-comparison.png`, fullPage: true });
  }
  console.log("通过：混合审核、草稿编辑与核对、取消入库后保留摄入、统一事务保存与自动返回、消耗混合确认、两种比例切换、正负盈余与次晨对齐；1440／1100／390／320px。");
}


export async function checkReviewMaintenance({baseURL,page,token,date,artifacts="/tmp/formward-records-maintenance"}) {
  await mkdir(artifacts,{recursive:true});
  const headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
  const post=async items=>{
    const response=await fetch(baseURL+"/api/v1/record-operations",{method:"POST",headers,body:JSON.stringify({operationId:crypto.randomUUID(),items})});
    assert.equal(response.status,200,await response.clone().text());return response.json();
  };
  const meals=async()=> (await (await fetch(baseURL+"/api/v1/meals",{headers})).json()).meals;
  const item={kind:"food",name:"虚构维护鸡肉",quantity:"1",unit:"份",sourceKind:"estimated",nutrition:{caloriesKcal:"420",proteinG:"30",carbsG:"20",fatG:"24"}};
  const meal={key:"maintenance-meal",kind:"save_meal",date,mealType:"虚构维护午餐",notes:null,items:[item,{...item,name:"虚构维护米饭",nutrition:{caloriesKcal:"180",proteinG:"3",carbsG:"40",fatG:"1"}}]};
  const op=await post([meal]), beforeCount=(await meals()).length;
  await page.setViewportSize({width:390,height:844});await page.goto(op.confirmationUrl);
  const row=()=>page.locator('[data-review-key="maintenance-meal"]');
  await row().getByRole("button",{name:"修改",exact:true}).click();
  const editor=()=>page.getByRole("dialog",{name:"修改待保存内容",exact:true});
  await editor().getByLabel("餐次备注",{exact:true}).fill("虚构维护草稿");
  async function answerClose(action,accept) {
    const native=page.waitForEvent("dialog");
    const clicked=action();const dialog=await native;
    assert.equal(dialog.type(),"confirm");assert.match(dialog.message(),/尚未提交/);
    await (accept?dialog.accept():dialog.dismiss());await clicked;
  }
  await answerClose(()=>editor().getByRole("button",{name:"关闭编辑",exact:true}).click(),false);
  assert.equal(await editor().getByLabel("餐次备注",{exact:true}).inputValue(),"虚构维护草稿");
  await answerClose(()=>editor().press("Escape"),false);
  await editor().getByRole("button",{name:"应用修改",exact:true}).click();await editor().waitFor({state:"hidden"});
  assert.equal((await meals()).length,beforeCount,"关闭保护和应用修改均不写入事实");
  await page.getByRole("button",{name:"确认保存",exact:true}).click();
  await page.getByRole("heading",{name:"已保存",exact:true}).waitFor();
  await page.getByRole("button",{name:"停留查看",exact:true}).click();
  const receipt=page.getByRole("list",{name:"已保存记录"});
  assert.ok((await receipt.innerText()).includes(date));
  assert.equal(await receipt.getByRole("link",{name:"查看记录 →"}).getAttribute("href"),"/dashboard/meals?date="+date);
  await page.waitForTimeout(2200);assert.equal(page.url(),op.confirmationUrl,"明确停留取消默认倒计时");
  await page.screenshot({path:artifacts+"/receipt-390.png",fullPage:true});
  await receipt.getByRole("link",{name:"查看记录 →"}).click();await page.waitForURL(baseURL+"/dashboard/meals?date="+date);
  await page.goto(op.confirmationUrl);await page.getByRole("heading",{name:"已保存",exact:true}).waitFor();
  await page.waitForTimeout(2100);assert.equal(page.url(),op.confirmationUrl,"重开回执不自动跳走");

  const duplicate=await post([{...meal,notes:"虚构维护草稿"}]);await page.goto(duplicate.confirmationUrl);
  const comparison=page.getByRole("region",{name:"已有相同餐次"});
  await comparison.waitFor();assert.ok((await comparison.innerText()).includes(date));
  assert.ok((await comparison.innerText()).includes("虚构维护鸡肉"));assert.ok((await comparison.innerText()).includes("600.00 kcal"));
  for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:artifacts+"/duplicate-"+width+".png",fullPage:true});
  }
  await row().getByRole("button",{name:"修改",exact:true}).click();
  await editor().getByRole("checkbox",{name:"这是另一次进食，仍然新增",exact:true}).waitFor();
  await editor().getByRole("button",{name:"关闭编辑",exact:true}).click();await editor().waitFor({state:"hidden"});
  await comparison.getByRole("checkbox",{name:"这是另一次进食，仍然新增",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-review-key="maintenance-meal"] input[type="checkbox"]')?.checked && !document.querySelector('[aria-label="统一记录确认"]')?.getAttribute("aria-busy")?.includes("true"));
  const save=page.getByRole("button",{name:"确认保存",exact:true});assert.equal(await save.isEnabled(),true);
  assert.equal((await meals()).length,beforeCount+1,"明确允许另一次进食仍只应用修改");
  await row().getByRole("button",{name:"取消本次新增",exact:true}).click();
  await page.locator('[data-review-key="maintenance-meal"][data-excluded="true"]').waitFor();
  assert.equal((await meals()).length,beforeCount+1,"取消新增不删除已有餐次");
  await row().getByRole("button",{name:"恢复本项",exact:true}).click();
  await save.click();await page.getByRole("heading",{name:"已保存",exact:true}).waitFor();await page.waitForURL(baseURL+"/dashboard");
  assert.equal((await meals()).length,beforeCount+2,"未选择停留时保留2秒自动返回");

  await page.goto(baseURL+"/dashboard/meals");
  await page.locator('[data-record-date="'+date+'"]').getByRole("button",{name:"添加一餐",exact:true}).click();
  let daily=page.getByRole("dialog",{name:"记录一餐",exact:true});
  await daily.getByLabel("餐次备注",{exact:true}).fill("虚构待放弃输入");
  await answerClose(()=>daily.press("Escape"),false);assert.equal(await daily.getByLabel("餐次备注",{exact:true}).inputValue(),"虚构待放弃输入");
  await answerClose(()=>daily.getByRole("button",{name:"关闭编辑",exact:true}).click(),true);await daily.waitFor({state:"hidden"});
  await page.goto(baseURL+"/dashboard/energy");
  await page.locator('[data-record-date="'+date+'"]').getByRole("button",{name:"录入",exact:true}).click();
  daily=page.getByRole("dialog",{name:"每日消耗",exact:true});
  await daily.getByLabel("静息 · kcal",{exact:true}).fill("2100");
  await answerClose(()=>daily.getByRole("button",{name:"关闭编辑",exact:true}).click(),false);assert.equal(await daily.getByLabel("静息 · kcal",{exact:true}).inputValue(),"2100");
  await answerClose(()=>daily.press("Escape"),true);await daily.waitFor({state:"hidden"});

  const body=await post([{key:"maintenance-body",kind:"save_record",date,period:"daytime",weightKg:"70",fasting:true,deviceLabel:"虚构关闭保护秤"}]);
  await page.goto(body.confirmationUrl);await page.locator('[data-review-key="maintenance-body"]').getByRole("button",{name:"修改",exact:true}).click();
  await editor().getByLabel("体重（kg）",{exact:true}).fill("71");
  await answerClose(()=>editor().getByRole("button",{name:"放弃本行修改",exact:true}).click(),false);
  assert.equal(await editor().getByLabel("体重（kg）",{exact:true}).inputValue(),"71");
  await answerClose(()=>editor().getByRole("button",{name:"关闭编辑",exact:true}).click(),true);await editor().waitFor({state:"hidden"});
  console.log("通过：重复餐次实际对照与明确新增、取消不删已有餐次、饮食/消耗/审核草稿关闭保护、业务日期回执与停留/默认返回；1440/390/320px。");
}
