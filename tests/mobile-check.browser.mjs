import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
const shift = (date,n) => new Date(Date.parse(date+"T12:00:00Z")+n*86400000).toISOString().slice(0,10);
export async function checkMobile({baseURL,context,page,today,token}) {
  const artifacts="/tmp/formward-mobile-visual"; await mkdir(artifacts,{recursive:true});
  await page.goto(baseURL+"/dashboard/energy");
  const missingDate=shift(today,-9), missing=page.locator(`[data-energy-day="${missingDate}"]`);
  await missing.getByRole("button",{name:"补录",exact:true}).waitFor(); await missing.getByRole("button",{name:"补录",exact:true}).click();
  const dialog=()=>page.locator("dialog[aria-labelledby]");
  assert.equal(await dialog().getByLabel("日期",{exact:true}).inputValue(),missingDate);
  assert.ok((await dialog().getByRole("button",{name:/^保存/}).innerText()).includes(missingDate));
  await page.getByRole("button",{name:"关闭编辑",exact:true}).click();await dialog().waitFor({state:"hidden"});
  await page.getByLabel("消耗记录日期",{exact:true}).fill(shift(today,-60)); await page.locator(`[data-energy-day="${shift(today,-60)}"]`).getByRole("button",{name:"补录",exact:true}).waitFor();
  await page.goto(baseURL+"/dashboard/meals");
  const mealMissing=page.locator(`[data-meal-day="${shift(today,-4)}"]`);
  await mealMissing.getByRole("button",{name:"补录",exact:true}).click();
  assert.equal(await dialog().getByLabel("日期",{exact:true}).inputValue(),shift(today,-4));
  await page.getByRole("button",{name:"关闭编辑",exact:true}).click();await dialog().waitFor({state:"hidden"});
  const payload={operationId:randomUUID(),items:[{key:"mobile-lunch",kind:"save_meal",date:shift(today,-1),mealType:"lunch",items:[
    {kind:"food",name:"虚构烤鸡饭，含蔬菜与米饭的长名称",quantity:"1",unit:"份",nutrition:{caloriesKcal:"620",proteinG:"30",carbsG:"70",fatG:"24"}},
    {kind:"food",name:"虚构酸奶",quantity:"1",unit:"杯",nutrition:{caloriesKcal:"220",proteinG:"10",carbsG:"24",fatG:"9"}},
    {kind:"food",name:"虚构水果",quantity:"1",unit:"份",nutrition:{caloriesKcal:"120",proteinG:"0",carbsG:"16",fatG:"7"}}
  ]}]};
  const response=await context.request.post(baseURL+"/api/v1/record-operations",{headers:{Authorization:`Bearer ${token}`},data:payload});assert.equal(response.status(),200);const operation=await response.json();
  const review=operation.confirmationUrl;
  for (const [width,height] of [[1440,1000],[1100,1000],[430,780],[390,640],[320,560],[844,390]]) {
    await page.setViewportSize({width,height});
    await page.goto(review);
    await page.getByRole("group",{name:"本餐合计",exact:true}).waitFor();
    assert.ok((await page.getByRole("group",{name:"本餐合计",exact:true}).innerText()).includes("960"));
    await page.getByRole("heading",{name:shift(today,-1)+" · 午餐",exact:true}).waitFor();
    assert.equal(await page.getByRole("navigation",{name:"主导航",exact:true}).count(),0);
    if(width<=700) {
      const total=await page.getByRole("group",{name:"本餐合计",exact:true}).boundingBox();
      const save=await page.getByRole("button",{name:"确认并全部保存",exact:true}).boundingBox();
      const second=await page.getByText("虚构酸奶",{exact:true}).boundingBox();
      assert.ok(total.y+total.height < height-60);
      assert.ok(second.y+second.height <= save.y+1);
      assert.ok(save.y>=0 && save.y+save.height<=height+1);
      await page.getByLabel("账号与导航菜单",{exact:true}).click();await page.getByRole("link",{name:"AI 接入",exact:true}).waitFor();await page.keyboard.press("Escape");
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${artifacts}/review-${width}x${height}.png`,fullPage:true});
    await page.screenshot({path:`${artifacts}/review-viewport-${width}x${height}.png`});
    for(const [path,label] of [["/dashboard","总览"],["/dashboard/energy","消耗"],["/dashboard/meals","饮食"],["/dashboard/measurements","身体"]]) {
      await page.goto(baseURL+path);
      const ready = path === "/dashboard" ? page.getByRole("group",{name:"双层日期关联图",exact:true}) : path === "/dashboard/energy" ? page.getByRole("group",{name:"每日消耗柱状图",exact:true}) : path === "/dashboard/meals" ? page.getByRole("group",{name:/热量柱状图，单位/}) : page.getByRole("heading",{name:"身体记录",exact:true});
      await ready.waitFor({state:"visible"});
      await page.waitForTimeout(500);
      if(width<=700) {
        const nav=page.getByRole("navigation",{name:"主导航",exact:true});await nav.getByRole("link",{name:label,exact:true}).waitFor();
        assert.equal(await nav.getByRole("link",{name:label,exact:true}).getAttribute("aria-current"),"page");
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(path==="/dashboard/energy"&&width<=700) {
        const readout=await page.getByRole("group",{name:"选中日消耗",exact:true}).boundingBox();
        const plot=await page.getByRole("group",{name:"每日消耗柱状图",exact:true}).boundingBox();
        assert.ok(readout.y+readout.height<height-56);
        assert.ok(plot.y<height-100);
      }
      await page.screenshot({path:`${artifacts}/${label}-${width}x${height}.png`,fullPage:true});
      await page.screenshot({path:`${artifacts}/${label}-viewport-${width}x${height}.png`});
    }
  }
  // Separate coarse-pointer context verifies actual landscape navigation and preserves draft across midnight.
  const touch=await context.browser().newContext({locale:"zh-CN",timezoneId:"Asia/Shanghai",viewport:{width:390,height:640},hasTouch:true,isMobile:true,storageState:await context.storageState()});
  try {
    const p=await touch.newPage(), touchErrors=[];p.on("pageerror",error=>touchErrors.push(error.message));await p.clock.install({time:new Date(today+"T23:59:30+08:00")});await p.goto(baseURL+"/dashboard/energy");
    await p.locator(`[data-energy-day="${today}"]`).getByRole("button",{name:/^(编辑|录入)$/}).click();
    const d=p.locator("dialog[aria-labelledby]");await d.getByLabel("静息 · kcal",{exact:true}).fill("2345");
    await p.clock.fastForward(90_000);await p.getByText(/已跨零点/).waitFor();assert.equal(await d.getByLabel("日期",{exact:true}).inputValue(),today);assert.equal(await d.getByLabel("静息 · kcal",{exact:true}).inputValue(),"2345");
    await p.setViewportSize({width:390,height:360});await d.getByLabel("静息 · kcal",{exact:true}).scrollIntoViewIfNeeded();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await p.getByRole("button",{name:"关闭编辑",exact:true}).click();await p.clock.runFor(400);
    await p.setViewportSize({width:844,height:390});const nav=p.getByRole("navigation",{name:"主导航",exact:true});await nav.getByRole("link",{name:"身体",exact:true}).tap();await p.waitForURL("**/dashboard/measurements");assert.equal(await nav.getByRole("link",{name:"身体",exact:true}).getAttribute("aria-current"),"page");await p.getByRole("heading",{name:"身体记录",exact:true}).waitFor();await p.screenshot({path:artifacts+"/touch-landscape.png"});assert.deepEqual(touchErrors,[]);
  } finally { await touch.close(); }
  await page.goto(review);await page.getByRole("button",{name:"确认并全部保存",exact:true}).click();await page.waitForURL(baseURL+"/dashboard");
  console.log("手机事实优先验收通过：每日补录、明确保存日期、餐次合计与中文餐次、三种手机和矮视口、四栏导航、审核单保存栏、跨零点草稿与触屏横屏。");
}
