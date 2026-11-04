import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";
export async function checkChartInteractions({page,context=page.context(),baseURL,today=new Date(Date.now()+8*3600_000).toISOString().slice(0,10),engine="chromium",artifacts}){
 await mkdir(artifacts,{recursive:true});const checks=[],errors=[];page.on("pageerror",e=>errors.push(e.message));
 async function visit(path){await page.goto(baseURL+path);await page.waitForLoadState("networkidle");await page.waitForTimeout(260);}
 const root=()=>page.locator("[data-chart-selection]");
 const close=async()=>{await page.keyboard.press("Escape");await page.locator('dialog[open]:not(.page-loading-dialog)').waitFor({state:"hidden"});};
 for(const [route,selector] of [["/dashboard","[data-overview-date]"],["/dashboard/meals","[data-bar-date]"],["/dashboard/energy","[data-energy-date]"],["/dashboard/measurements","[data-point-id]"]]){
  await page.setViewportSize({width:1440,height:900});await visit(route);
  const initial=await root().getAttribute("data-selected-date"),a=addCalendarDays(today,-3),b=addCalendarDays(today,-4);
  const point=date=>page.locator(selector+'[data-chart-date="'+date+'"]').first();
  async function at(date,click=false){
   const target=point(date),hit=target.locator(selector==="[data-point-id]"?":scope > circle":":scope > rect").first();await hit.scrollIntoViewIfNeeded();
   const box=await hit.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);if(click)await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
   await page.waitForTimeout(40);
  }
  await at(a);assert.equal(await root().getAttribute("data-selected-date"),a);
  await at(a,true);await at(b);assert.equal(await root().getAttribute("data-selected-date"),b,"鼠标点击不能固定");
  await page.mouse.move(2,75);assert.equal(await root().getAttribute("data-selected-date"),initial,"完整面板外恢复默认");
  await at(a);const view=page.getByRole("button",{name:"查看记录 →",exact:true});await view.hover();
  assert.equal(await root().getAttribute("data-selected-date"),a,"移至查看入口仍保留目标日期");
  await view.click();await page.locator('dialog[open]:not(.page-loading-dialog)').waitFor();assert.ok((await page.locator('dialog[open]:not(.page-loading-dialog)').last().innerText()).replaceAll(".","-").includes(a));
  await close();await page.mouse.move(2,75);assert.equal(await root().getAttribute("data-selected-date"),initial);
  await page.keyboard.press("Tab");await point(a).focus();await page.keyboard.press("Enter");await page.mouse.move(2,75);
  assert.equal(await root().getAttribute("data-selected-date"),a,"鼠标离开不打断键盘选日");
  await view.focus();await page.keyboard.press("Enter");await page.locator('dialog[open]:not(.page-loading-dialog)').waitFor();
  assert.ok((await page.locator('dialog[open]:not(.page-loading-dialog)').last().innerText()).replaceAll(".","-").includes(a));await close();
  checks.push(route+" desktop hover/click/region/view/keyboard");
 }
 await visit("/dashboard/measurements");const a=addCalendarDays(today,-3),evening=page.locator('[data-chart-metric="weightKg"] [data-point-id][data-chart-date="'+a+'"][data-period="evening"]');
 const eb=await evening.locator("circle").first().boundingBox();await page.mouse.move(eb.x+eb.width/2,eb.y+eb.height/2);
 await page.getByRole("button",{name:"查看记录 →",exact:true}).click();await page.waitForTimeout(350);
 const expanded=await page.locator("dialog[open] details[open]").allTextContents();assert.ok(expanded.join(" ").includes("晚间"),"晚间点的查看应展开晚间");await close();checks.push("body evening target captured");
 // Observe intermediate transforms; the curve moves selection only.
 await visit("/dashboard");await page.getByRole("button",{name:"7D",exact:true}).click();await page.mouse.move(2,75);
 const marker=page.locator("[data-chart-selection-marker]").first();
 const value=()=>marker.evaluate(n=>getComputedStyle(n).transform);
 const p=page.locator('[data-overview-date="'+addCalendarDays(today,-4)+'"] > rect').first(),pb=await p.boundingBox();
 const before=await value();await page.mouse.move(pb.x+pb.width/2,pb.y+pb.height/2);
 await page.waitForTimeout(70);const middle=await value();await page.waitForTimeout(220);const end=await value();
 assert.notEqual(before,end);assert.notEqual(middle,before);assert.notEqual(middle,end);
 await page.emulateMedia({reducedMotion:"reduce"});await page.mouse.move(2,75);await page.waitForTimeout(30);
 assert.equal(await marker.evaluate(n=>n.getAnimations().length),0);await page.emulateMedia({reducedMotion:"no-preference"});checks.push("220ms intermediate motion and reduced motion");
 const touch=await context.browser().newContext({storageState:await context.storageState(),locale:"zh-CN",timezoneId:"Asia/Shanghai",viewport:{width:390,height:720},isMobile:true,hasTouch:true});
 const t=await touch.newPage();try{
  await t.goto(baseURL+"/dashboard");await t.waitForLoadState("networkidle");
  const hit=t.locator('[data-overview-date="'+addCalendarDays(today,-3)+'"] > rect').first();await hit.tap();await t.waitForTimeout(40);
  assert.equal(await t.locator("[data-chart-selection]").getAttribute("data-selected-date"),addCalendarDays(today,-3));
  assert.equal(await t.locator("[data-chart-selection-marker]").first().evaluate(n=>n.getAnimations().length),0,"触屏跟手，不排队动画");
  await t.getByRole("button",{name:"查看记录 →",exact:true}).tap();await t.waitForTimeout(350);
  assert.ok((await t.locator("dialog[open]").last().innerText()).includes(addCalendarDays(today,-3)));checks.push("touch selection persists and view target matches");
 }finally{await touch.close();}
 assert.deepEqual(errors,[]);await writeFile(artifacts+"/"+engine+"-interactions.json",JSON.stringify({checks,errors,before,middle,end},null,2));return checks;
}
