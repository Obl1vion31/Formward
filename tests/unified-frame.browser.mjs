import {checkOverviewFirstScreen} from "./overview-first-screen.browser.mjs";
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {and,eq} from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";
import {submitMealOperation,decideMealOperation,readMealSnapshot} from "../src/features/meals/records.ts";
import {setMealDayStatus} from "../src/features/meals/day-status.ts";
import {submitEnergyOperation,decideEnergyOperation,readEnergySnapshot} from "../src/features/activities/records.ts";
export async function checkUnifiedFrame({baseURL,page,context,db,userId,today,token,engine}){
 const artifacts=process.env.FORMWARD_FRAME_ARTIFACTS??".codex/unified-frame-visual/"+engine;await mkdir(artifacts,{recursive:true});
 const checks=[],geometry=[],native=[];page.on("dialog",async d=>{native.push(d.message());await d.dismiss();});
 async function visit(path){await page.waitForLoadState("networkidle");await page.goto(baseURL+path);await page.waitForLoadState("networkidle");await page.evaluate(()=>document.fonts.ready);}
 async function shot(name){await page.waitForTimeout(500);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:artifacts+"/"+name+".png",fullPage:false});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+" horizontal overflow");}
 async function energy(actions){await page.waitForLoadState("networkidle");const op=await submitEnergyOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions});assert.equal(op.canConfirm,true,JSON.stringify(op.rows));await decideEnergyOperation(db,userId,op.id,op.revision,"confirm");}
 // 同一组不平滑的虚构波动、两个缺日、晨重与相同日期，全部经业务函数保存。
 for(let i=-8;i<=0;i++){if(i===-5||i===-2)continue;const date=addCalendarDays(today,i),op=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_meal",date,mealType:"lunch",items:[{kind:"food",name:"虚构午餐 · 烤鸡与米饭",quantity:"1",unit:"份",sourceKind:"estimated",nutrition:{caloriesKcal:String([2400,4100,1800,2300,1500,2200,800,3100,2456][i+8]),proteinG:"120",carbsG:"260",fatG:"70"}}]}]});assert.equal(op.canConfirm,true,JSON.stringify(op.rows));await decideMealOperation(db,userId,op.id,op.revision,"confirm");const m=(await readMealSnapshot(db,userId)).meals.find(m=>m.date===date);await setMealDayStatus(db,userId,{operationId:randomUUID(),date,status:"complete",version:m.day.version,contentDigest:m.day.contentDigest});}
 await energy([{kind:"save_energy_day",date:today,entryMode:"components",activityMode:"activities",restingKcal:"2000.1234",notes:"旧四位不回写"},{kind:"save_activity",date:today,name:"虚构已有运动",caloriesKcal:"1357.1234",sourceSystem:"虚构手表"}]);
 if(process.env.FORMWARD_FRAME_SCREEN_ONLY==="1"){await checkOverviewFirstScreen({baseURL,page,artifacts:artifacts+"/overview-first-screen",engine});return;}
 const pages=[["overview",""],["meals","/meals"],["energy","/energy"],["body","/measurements"]];
 for(const [width,height] of [[320,560],[390,560],[390,640],[430,780],[844,390],[1100,900],[1440,900]]){
  const rows=[];await page.setViewportSize({width,height});
  for(const [name,path] of pages){
   await visit("/dashboard"+path);await page.getByRole("button",{name:"7D",exact:true}).click();await page.waitForTimeout(480);await page.evaluate(()=>scrollTo(0,0));
   assert.equal(await page.locator("[data-record-slot=date] time").getAttribute("datetime"),today,name+" selected date");
   const boxes=await page.locator("[data-record-slot]").evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>{const r=node.getBoundingClientRect();return [node.dataset.recordSlot,{x:r.x,y:r.y,width:r.width,height:r.height}];})));
   rows.push({name,...boxes});await shot(name+"-"+width+"x"+height);
   const overflow=await page.locator("[data-record-slot=metrics] strong").evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width+1<n.scrollWidth).map(n=>({text:n.textContent,width:n.getBoundingClientRect().width,scroll:n.scrollWidth,font:getComputedStyle(n).font})));assert.deepEqual(overflow,[],name+" numbers must fit");
   if(width<=430&&height>=560){const plot=await page.locator("[data-record-slot=plot]").boundingBox(),nav=await page.locator(".mobile-bottom-nav").count()?await page.locator(".mobile-bottom-nav").boundingBox():null;assert.ok(plot.y<height-80,name+" primary plot appears");if(nav)assert.ok(plot.y<nav.y,name+" plot above nav");}
  }
  for(const slot of ["range","date","metrics","title","legend","plot"]){const ys=rows.map(row=>row[slot].y),xs=rows.map(row=>row[slot].x);assert.ok(Math.max(...ys)-Math.min(...ys)<=2,JSON.stringify({width,slot,rows}));assert.ok(Math.max(...xs)-Math.min(...xs)<=2);}
  geometry.push({width,height,rows});await writeFile(artifacts+"/geometry.json",JSON.stringify(geometry,null,2));
 }
 checks.push("四页7种视口公共区域坐标误差≤2px，真实波动和缺日不填平");
 await page.setViewportSize({width:390,height:640});await visit("/dashboard/energy");await page.getByRole("button",{name:"查看记录 →",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"编辑",exact:true}).click();
 let form=page.getByRole("dialog",{name:"每日消耗",exact:true});
 assert.equal(await form.getByLabel("活动合计 · kcal",{exact:true}).inputValue(),"1357.12");assert.equal(await form.getByText(/是否已包含在当天/).count(),0);assert.equal(await form.getByLabel("已完成",{exact:true}).count(),0);await shot("energy-automatic-390");
 await form.getByLabel("活动合计 · kcal",{exact:true}).fill("1357");await form.getByRole("heading",{name:"总消耗",exact:true}).click();await form.getByText(/是否已包含在当天活动合计 1357.00/).waitFor();assert.equal(await form.getByRole("button",{name:"保存 · "+today,exact:true}).isDisabled(),true);await shot("energy-manual-pending-390");
 await form.getByRole("button",{name:"已包含",exact:true}).click();await form.getByLabel("活动合计 · kcal",{exact:true}).fill("0");await form.getByRole("heading",{name:"总消耗",exact:true}).click();await form.getByText(/是否已包含在当天活动合计 0.00/).waitFor();await form.getByRole("button",{name:"额外增加",exact:true}).click();
 await form.getByLabel("活动合计 · kcal",{exact:true}).fill("");await form.getByRole("heading",{name:"总消耗",exact:true}).click();assert.equal(await form.getByLabel("活动合计 · kcal",{exact:true}).inputValue(),"1357.12");assert.equal(await form.getByText(/是否已包含在当天/).count(),0);
 // 只改备注，旧四位值和自动累计模式必须原样保留。
 await form.getByText("时间与备注",{exact:true}).click();await form.getByLabel("备注",{exact:true}).fill("只改备注，保留原精度");await form.getByRole("button",{name:"保存 · "+today,exact:true}).click();await form.waitFor({state:"hidden"});await page.waitForLoadState("networkidle");
 let snapshot=await readEnergySnapshot(db,userId);assert.equal(snapshot.days.find(d=>d.date===today).restingKcal,"2000.1234");assert.equal(snapshot.activities.find(a=>a.date===today).caloriesKcal,"1357.1234");assert.equal(snapshot.days.find(d=>d.date===today).activityMode,"activities");
 checks.push("1357.12自动累计不询问；手填1357、0后询问并禁止未核对保存；清空恢复；只改备注保留四位旧值");
 // 单独编辑一项，预览仍含同日其他运动。
 await energy([{kind:"save_activity",date:today,name:"虚构另一项运动",caloriesKcal:"100"}]);await visit("/dashboard/energy");await page.getByRole("button",{name:"查看记录 →",exact:true}).click();await page.getByRole("button",{name:"编辑活动",exact:true}).first().click();form=page.getByRole("dialog",{name:"活动记录",exact:true});assert.match(await form.textContent(),/3457.25/);
 await form.getByLabel("活动名称",{exact:true}).fill("尚未保存的名称");await form.getByRole("button",{name:"关闭编辑",exact:true}).click();let confirm=page.getByRole("dialog",{name:"放弃尚未保存的输入？",exact:true});await confirm.waitFor();assert.equal(await confirm.getByRole("button",{name:"取消",exact:true}).evaluate(node=>node===document.activeElement),true);await shot("discard-confirm-390");await page.keyboard.press("Escape");await confirm.waitFor({state:"hidden"});assert.equal(await form.getByLabel("活动名称",{exact:true}).inputValue(),"尚未保存的名称");await form.getByRole("button",{name:"关闭编辑",exact:true}).click();await page.getByRole("dialog",{name:"放弃尚未保存的输入？"}).getByRole("button",{name:"放弃修改",exact:true}).click();await form.waitFor({state:"hidden"});checks.push("单运动预览含其他运动；应用内放弃确认取消/Escape保住输入");
 await visit("/dashboard/measurements");await page.locator('[data-record-date="'+today+'"]').getByRole("button",{name:"编辑 "+today,exact:true}).click();form=page.getByRole("dialog").last();await form.getByRole("button",{name:"删除晨间体重",exact:true}).click();confirm=page.getByRole("dialog",{name:"删除晨间体重？",exact:true});await confirm.waitFor();const bounds=await confirm.boundingBox();assert.ok(bounds.x>=16&&bounds.x+bounds.width<=390-16);await shot("body-delete-confirm-390");await page.keyboard.press("Escape");await confirm.waitFor({state:"hidden"});assert.equal(await form.isVisible(),true);await form.getByRole("button",{name:"删除晨间体重",exact:true}).click();await page.getByRole("dialog",{name:"删除晨间体重？",exact:true}).getByRole("button",{name:"删除体重",exact:true}).click();await page.waitForLoadState("networkidle");await form.getByRole("button",{name:"删除晨间体重",exact:true}).waitFor({state:"hidden"});const ms=await db.select().from(schema.measurement).where(and(eq(schema.measurement.userId,userId),eq(schema.measurement.recordDate,today)));assert.equal(ms.find(r=>!r.deletedAt).weightKg,null);checks.push("小型应用内删除确认默认取消，Escape不关闭下层，删除只影响体重");
 // 取消自定义区间完全不影响原日期；应用后四页一致。
 for(const [,path] of pages){await visit("/dashboard"+path);await page.getByRole("button",{name:"自定义",exact:true}).click();const previous=await page.locator("[data-record-slot=date]").textContent();const custom=page.getByRole("form",{name:"自定义日期范围",exact:true});await custom.getByLabel(/开始日期/).fill(addCalendarDays(today,-20));assert.equal(await page.locator("[data-record-slot=date]").textContent(),previous);await custom.getByRole("button",{name:"取消",exact:true}).click();assert.equal(await page.locator("[data-record-slot=date]").textContent(),previous);}
 checks.push("四页自定义填写中不改原图，取消保持原日期");
 // AI确认四位原值只显示两位，无已完成选项/原始四位。
 await page.waitForLoadState("networkidle");const res=await context.request.post(baseURL+"/api/v1/record-operations",{headers:{Authorization:"Bearer "+token},data:{operationId:randomUUID(),items:[{key:"energy",kind:"save_activity",date:today,name:"虚构AI精度",caloriesKcal:"741.1234"}]}});assert.equal(res.status(),200);const op=await res.json();await visit(new URL(op.confirmationUrl).pathname);assert.ok((await page.innerText("body")).includes("741.12"));assert.equal((await page.innerText("body")).includes("741.1234"),false);assert.equal((await page.innerText("body")).includes("已完成"),false);await shot("ai-energy-two-decimals-390");await page.getByRole("button",{name:"修改",exact:true}).click();const aiForm=page.getByRole("dialog",{name:"修改待保存内容",exact:true});assert.match(await aiForm.innerText(),/4198.37/);assert.equal(await aiForm.getByLabel("本次运动总消耗 · kcal",{exact:true}).inputValue(),"741.12");await shot("ai-exercise-edit-two-decimals-390");await aiForm.getByRole("button",{name:"关闭编辑",exact:true}).click();await aiForm.waitFor({state:"hidden"});checks.push("AI显示两位、保留原始精度、不显示已完成；新运动编辑预览只累计一次");
 await checkOverviewFirstScreen({baseURL,page,artifacts:artifacts+"/overview-first-screen",engine});
 assert.deepEqual(native,[]);await writeFile(artifacts+"/report.json",JSON.stringify({passed:true,engine,checks,geometry,realIOS:"未测",softwareKeyboard:"未测"},null,2));
}
