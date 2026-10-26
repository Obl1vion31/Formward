import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {submitMealOperation,decideMealOperation,readMealSnapshot} from "../src/features/meals/records.ts";
import {submitEnergyOperation,decideEnergyOperation} from "../src/features/activities/records.ts";
import {saveMeasurementDay} from "../src/features/measurements/editing.ts";
import {dailyTotals} from "../src/features/meals/model.ts";
import {setMealDayStatus} from "../src/features/meals/day-status.ts";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";
import {checkOverviewFirstScreen} from "./overview-first-screen.browser.mjs";
export async function checkUnifiedRecords({baseURL,page,db,userId,today,engine="chromium",artifacts=process.env.FORMWARD_UNIFIED_ARTIFACTS??".codex/inline-history-visual"}){
 await mkdir(artifacts,{recursive:true});const errors=[];page.on("pageerror",e=>errors.push(e.message));page.setDefaultTimeout(20000);
 const detailDate=addCalendarDays(today,-1),detailOp=await submitEnergyOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_activity",date:detailDate,name:"虚构未完成活动",caloriesKcal:"300",completed:false,inclusion:"included"}]});assert.ok(detailOp.canConfirm);await decideEnergyOperation(db,userId,detailOp.id,detailOp.revision,"confirm");
 await page.goto(baseURL+"/dashboard/energy?date="+detailDate);await page.getByRole("button",{name:"查看记录 →",exact:true}).click();const detailPanel=page.locator("dialog[open]");await detailPanel.getByText("虚构未完成活动",{exact:true}).waitFor();assert.match(await detailPanel.innerText(),/未完成/);assert.match((await detailPanel.innerText()).replaceAll(",",""),/2600/);await detailPanel.getByRole("button",{name:"关闭编辑",exact:true}).click();await detailPanel.waitFor({state:"hidden"});
 if(process.env.FORMWARD_ENERGY_DETAILS_ONLY==="1"){assert.deepEqual(errors,[]);await writeFile(artifacts+"/"+engine+"-energy-details.json",JSON.stringify({passed:true,unfinishedVisible:true,totalUnchanged:2600,clientErrors:errors},null,2));return [];}
 await saveMeasurementDay(db,{userId,actorId:userId},{operationId:randomUUID(),date:addCalendarDays(today,-65),timezone:"Asia/Shanghai",periods:{daytime:{weightKg:"72",bodyFatPercent:"20",fasting:true,deviceLabel:"虚构历史秤"}}});
 const older=await submitEnergyOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:Array.from({length:53},(_,i)=>({kind:"save_energy_day",date:addCalendarDays(today,-i-13),totalKcal:"2500"}))});assert.ok(older.canConfirm);await decideEnergyOperation(db,userId,older.id,older.revision,"confirm");
 const actions=[];const amounts=[2950,1940,2770,2050,0,2335,4280,1200,3650,2180,2600,2400];
 for(let i=1;i<=65;i++){if(i===5||i===8)continue;actions.push({kind:"save_meal",date:addCalendarDays(today,-i),mealType:"lunch",items:[{kind:"food",name:"虚构午餐与很长的配菜名称",quantity:"1",unit:"份",nutrition:{caloriesKcal:String(amounts[i-1]??2200),proteinG:"40",carbsG:"80",fatG:"25"},sourceKind:"estimated"}]});}
 const op=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions});assert.ok(op.canConfirm);await decideMealOperation(db,userId,op.id,op.revision,"confirm");
 for(const g of dailyTotals((await readMealSnapshot(db,userId)).meals)){if(g.date===addCalendarDays(today,-1))continue;await setMealDayStatus(db,userId,{operationId:randomUUID(),date:g.date,version:g.day.version,contentDigest:g.day.contentDigest,status:"complete"});}
 const cases=[],failures=[];
 for(const [width,height] of [[320,560],[390,560],[390,640],[430,780],[844,390],[1100,900],[1440,900]]){
  await page.setViewportSize({width,height});
  for(const path of ["","/measurements","/meals","/energy"]){
   await page.goto(baseURL+"/dashboard"+path);await page.evaluate(async()=>{await document.fonts.ready;});await page.waitForTimeout(650);await page.mouse.move(0,0);
   if(width<700)await page.addStyleTag({content:".mobile-bottom-nav{padding-bottom:34px;}"});
   await page.evaluate(()=>scrollTo(0,0));
   assert.equal(await page.getByRole("button",{name:"前一天",exact:true}).count(),0);assert.equal(await page.getByRole("button",{name:"后一天",exact:true}).count(),0);assert.equal(await page.getByText("最近删除",{exact:true}).count(),0);
   assert.equal(await page.getByText("连线",{exact:true}).count(),0);
   const plot=path==="/measurements"?page.locator('[data-chart-metric="weightKg"] svg'):path==="/meals"?page.getByRole("group",{name:"热量柱状图，单位kcal",exact:true}):path==="/energy"?page.getByRole("group",{name:"每日消耗柱状图",exact:true}):page.getByRole("group",{name:"双层日期关联图",exact:true});
   const geometry=await plot.evaluate(svg=>{const b=svg.getBoundingClientRect(),nav=document.querySelector(".mobile-bottom-nav")?.getBoundingClientRect();return {top:b.top,bottom:b.bottom,nav:nav?.top,overflow:document.documentElement.scrollWidth>innerWidth,tiny:[...svg.querySelectorAll("text")].filter(n=>{const m=n.getScreenCTM();return m&&parseFloat(getComputedStyle(n).fontSize)*Math.hypot(m.a,m.b)<11.9;}).map(n=>n.textContent)};});
   assert.equal(geometry.overflow,false);assert.deepEqual(geometry.tiny,[]);if(width<700&&geometry.bottom>geometry.nav)failures.push({path,width,height,geometry});
   if(path){const rows=await page.locator("main [data-record-date]").evaluateAll(nodes=>nodes.map(n=>n.dataset.recordDate));assert.ok(rows.includes(today));assert.ok(rows.every(d=>d>=new Date(Date.parse(today+"T12:00:00Z")-6*86400000).toISOString().slice(0,10)));if(path==="/meals"){assert.ok(!rows.includes(addCalendarDays(today,-2)));assert.ok(rows.includes(addCalendarDays(today,-1)));}}
   await page.screenshot({path:artifacts+"/"+engine+"-"+(path.slice(1)||"overview")+"-"+width+"x"+height+".png"});cases.push({path,width,height,geometry});
  }
 }
 await writeFile(artifacts+"/"+engine+"-geometry.json",JSON.stringify({cases,failures},null,2));assert.deepEqual(failures,[],"首屏不得被导航遮挡");
 await page.setViewportSize({width:1440,height:900});
 for(const path of ["/measurements","/meals","/energy"]){
  await page.goto(baseURL+"/dashboard"+path);await page.waitForTimeout(500);const root=page.locator("[data-chart-selection]"),points=root.locator("[data-chart-date]"),count=await points.count();assert.ok(count>=2);
  const a=points.nth(Math.max(0,count-4)),b=points.nth(Math.max(0,count-2)),date=await a.getAttribute("data-chart-date");await a.focus();await page.keyboard.press("Enter");await b.dispatchEvent("mouseenter");assert.equal(await root.getAttribute("data-selected-date"),date);await page.mouse.click(2,2);assert.equal(await root.getAttribute("data-pinned-date"),null);
  await a.focus();await page.keyboard.press("Enter");await page.keyboard.press("Escape");assert.equal(await root.getAttribute("data-pinned-date"),null);
  await root.getByRole("button",{name:/查看.*记录/}).first().click();await page.locator("dialog[open]").waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.keyboard.press("Escape");await page.locator("dialog[open]").waitFor({state:"hidden"});
  const toggle=page.locator("[data-history-toggle]"),history=page.locator("[data-record-history]");
  await toggle.click();assert.equal(await toggle.getAttribute("aria-expanded"),"true");assert.equal(await page.locator("dialog[open]").count(),0);assert.equal(await history.locator("[data-record-date]").count(),50);
  const allDates=await page.locator("main [data-record-date]").evaluateAll(nodes=>nodes.map(n=>n.dataset.recordDate));assert.equal(new Set(allDates).size,allDates.length);
  await history.getByRole("button",{name:"加载更早日期",exact:true}).click();assert.ok(await history.locator("[data-record-date]").count()>50);
  const targetRow=history.locator("[data-record-date]").nth(12),trigger=targetRow.getByRole("button",{name:/^查看(?: |$)/}).first();
  await trigger.scrollIntoViewIfNeeded();const y=await page.evaluate(()=>scrollY);await trigger.click();const panel=page.locator("dialog[open]");await panel.waitFor();assert.equal(await page.locator("dialog[open]").count(),1);
  await panel.getByRole("button",{name:/^关闭/}).click();await panel.waitFor({state:"hidden"});assert.equal(await toggle.getAttribute("aria-expanded"),"true");assert.ok(Math.abs((await page.evaluate(()=>scrollY))-y)<3);assert.equal(await trigger.evaluate(n=>n===document.activeElement),true);assert.ok(await history.locator("[data-record-date]").count()>50);
  if(path==="/measurements"){const lines=await history.locator("[data-record-date]").first().evaluate(row=>[...row.querySelectorAll('span[class*="periodLabel"]')].map(n=>{const r=document.createRange();r.selectNodeContents(n);return r.getClientRects().length;}));assert.deepEqual(lines,[1,1]);}
  await toggle.click();assert.equal(await history.isVisible(),false);assert.equal(await toggle.evaluate(n=>n===document.activeElement),true);await toggle.click();assert.ok(await history.locator("[data-record-date]").count()>50);
  await history.locator("[data-record-date]").first().scrollIntoViewIfNeeded();await page.screenshot({path:artifacts+"/"+engine+"-"+path.slice(1)+"-history.png"});
  const edit=history.locator("[data-record-date]").first().getByRole("button",{name:/^(编辑|录入|补录|添加一餐)(?: |$)/}).first();await edit.click();await panel.waitFor();assert.equal(await page.locator("dialog[open]").count(),1);await panel.getByRole("button",{name:/^关闭/}).click();await panel.waitFor({state:"hidden"});assert.equal(await edit.evaluate(n=>n===document.activeElement),true);
  await toggle.click();
  if(path!=="/measurements"){
   // Actual pointer click is distinct from focus(); the old Chromium UA ring only appeared here.
   for(const target of [points.first(),points.nth(Math.floor(count/2)),points.last()]){
    const hit=target.locator("rect").first(),box=await hit.boundingBox();await hit.scrollIntoViewIfNeeded();const visible=await hit.boundingBox();await page.mouse.click(visible.x+visible.width/2,visible.y+Math.min(30,visible.height/2));void box;
    assert.equal(await target.evaluate(n=>getComputedStyle(n).outlineStyle),"none");assert.equal(await root.getAttribute("data-selected-date"),await target.getAttribute("data-chart-date"));
   }
   assert.equal(await root.getAttribute("data-selected-date"),today);await page.screenshot({path:artifacts+"/"+engine+"-"+path.slice(1)+"-pointer-final.png"});
   await root.getByRole("button",{name:/查看.*记录/}).first().click();await page.locator("dialog[open]").waitFor();assert.match(await page.locator("dialog[open]").innerText(),new RegExp(today.replaceAll("-","\\.")));await page.locator("dialog[open]").getByRole("button",{name:/^关闭/}).click();await page.locator("dialog[open]").waitFor({state:"hidden"});
   await points.last().focus();await page.keyboard.press("ArrowLeft");const focused=root.locator("[data-chart-date]:focus");assert.equal(await focused.evaluate(n=>n.matches(":focus-visible")),true);const stroke=await focused.locator("rect").first().evaluate(n=>getComputedStyle(n).stroke);assert.notEqual(stroke,"none");
  }
 }
 // The wording is fixed; only check state and muted colour change. A failed save changes neither.
 await page.goto(baseURL+"/dashboard/meals");const date=addCalendarDays(today,-1),row=page.locator('[data-record-date="'+date+'"]'),control=row.getByRole("checkbox",{name:date+" 已记全",exact:true});
 assert.equal(await control.innerText(),"已记全");assert.equal(await control.getAttribute("aria-checked"),"false");
 const fail=async route=>{if(route.request().method()==="POST")await route.fulfill({status:500,headers:{"x-formward-test-failure":"1"},body:"Fictional save failure"});else await route.continue();};
 await page.route("**/dashboard/meals",fail);await control.click();await page.getByRole("alert").filter({hasText:"当天记录状态未保存"}).waitFor();assert.equal(await control.getAttribute("aria-checked"),"false");assert.equal(await control.innerText(),"已记全");await page.unroute("**/dashboard/meals",fail);
 await control.click();await row.waitFor({state:"hidden"});
 await page.locator("[data-history-toggle]").click();const history=page.locator("[data-record-history]"),saved=history.locator('[data-record-date="'+date+'"]'),checked=saved.getByRole("checkbox",{name:date+" 已记全",exact:true});
 assert.equal(await checked.getAttribute("aria-checked"),"true");assert.equal((await checked.innerText()).replace("✓","").trim(),"已记全");assert.equal(await checked.evaluate(n=>getComputedStyle(n).color),"rgb(156, 155, 146)");
 await saved.getByRole("button",{name:"查看",exact:true}).click();const panel=page.locator("dialog[open]"),check=panel.getByRole("checkbox",{name:date+" 已记全",exact:true});await check.click();await page.waitForFunction(()=>{const b=document.querySelector("dialog[open] [data-meal-day-status]");return b?.getAttribute("aria-checked")==="false"&&!b.disabled;});assert.equal(await check.innerText(),"已记全");await panel.getByRole("button",{name:"关闭编辑",exact:true}).click();await panel.waitFor({state:"hidden"});await page.locator('[data-record-date="'+date+'"]').waitFor();
 for(const width of [320,390,430]){await page.setViewportSize({width,height:640});for(const path of ["/measurements","/meals","/energy"]){await page.goto(baseURL+"/dashboard"+path);await page.locator("[data-history-toggle]").click();assert.equal(await page.locator("dialog[open]").count(),0);const list=page.locator("[data-record-history]");await list.locator("[data-record-date]").first().scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);if(path==="/measurements"){const lines=await list.locator("[data-record-date]").first().evaluate(row=>[...row.querySelectorAll('span[class*="periodLabel"]')].map(n=>{const range=document.createRange();range.selectNodeContents(n);return range.getClientRects().length;}));assert.deepEqual(lines,[1,1]);}await page.screenshot({path:artifacts+"/"+engine+"-"+path.slice(1)+"-history-"+width+".png"});}}
 const touch=await page.context().browser().newContext({locale:"zh-CN",timezoneId:"Asia/Shanghai",viewport:{width:390,height:640},hasTouch:true,isMobile:true,storageState:await page.context().storageState()});
 try{const touchPage=await touch.newPage();touchPage.on("pageerror",e=>errors.push(e.message));for(const path of ["/measurements","/meals","/energy"]){await touchPage.goto(baseURL+"/dashboard"+path);await touchPage.waitForTimeout(500);const root=touchPage.locator("[data-chart-selection]"),point=root.locator("[data-chart-date]").last();const target=await point.getAttribute("data-chart-date");if(path==="/measurements")await point.locator("circle").last().tap();else await point.locator("rect").first().tap();assert.equal(await root.getAttribute("data-selected-date"),target);assert.equal(await touchPage.locator("dialog[open]").count(),0);await root.getByRole("button",{name:/查看.*记录/}).first().tap();const panel=touchPage.locator("dialog[open]");await panel.waitFor();await panel.getByRole("button",{name:/^关闭/}).tap();await panel.waitFor({state:"hidden"});assert.equal(await touchPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}}finally{await touch.close();}
 await page.emulateMedia({reducedMotion:"reduce"});for(const path of ["/measurements","/meals","/energy"]){await page.goto(baseURL+"/dashboard"+path);await page.waitForTimeout(600);assert.equal(await page.locator("svg").first().evaluate(svg=>svg.getAnimations({subtree:true}).filter(a=>a.playState==="running").length),0);}
 assert.deepEqual(errors,[]);await writeFile(artifacts+"/"+engine+"-unified-report.json",JSON.stringify({passed:true,cases,errors},null,2));
 await checkOverviewFirstScreen({baseURL,page,artifacts,engine});
 return cases;
}
