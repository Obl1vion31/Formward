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
 const flowOnly=process.env.FORMWARD_FRAME_FLOW_ONLY==="1";
 const artifacts=process.env.FORMWARD_FRAME_ARTIFACTS??".codex/unified-frame-visual/"+engine;await mkdir(artifacts,{recursive:true});
 const checks=[],geometry=[],native=[];page.on("dialog",async d=>{native.push(d.message());await d.dismiss();});
 async function visit(path){await page.waitForLoadState("networkidle");await page.goto(baseURL+path);await page.waitForLoadState("networkidle");await page.evaluate(()=>document.fonts.ready);}
 async function shot(name){await page.waitForTimeout(500);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:artifacts+"/"+name+".png",fullPage:false});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+" horizontal overflow");}
 async function energy(actions){await page.waitForLoadState("networkidle");const op=await submitEnergyOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions});assert.equal(op.canConfirm,true,JSON.stringify(op.rows));await decideEnergyOperation(db,userId,op.id,op.revision,"confirm");}
 // 同一组不平滑的虚构波动、两个缺日、晨重与相同日期，全部经业务函数保存。
 const mealActions=[];for(let i=-8;i<=0;i++){if(i===-5||i===-2)continue;mealActions.push({kind:"save_meal",date:addCalendarDays(today,i),mealType:"lunch",items:[{kind:"food",name:"虚构午餐 · 烤鸡与米饭",quantity:"1",unit:"份",sourceKind:"estimated",nutrition:{caloriesKcal:String([2400,4100,1800,2300,1500,2200,800,3100,2456][i+8]),proteinG:"120",carbsG:"260",fatG:"70"}}]});}
 const fixture=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:mealActions});assert.equal(fixture.canConfirm,true,JSON.stringify(fixture.rows));await decideMealOperation(db,userId,fixture.id,fixture.revision,"confirm");
 const savedMeals=(await readMealSnapshot(db,userId)).meals;for(const action of mealActions){const m=savedMeals.find(m=>m.date===action.date);await setMealDayStatus(db,userId,{operationId:randomUUID(),date:m.date,status:"complete",version:m.day.version,contentDigest:m.day.contentDigest});}
 await energy([{kind:"save_energy_day",date:today,entryMode:"components",activityMode:"activities",restingKcal:"2000.1234",notes:"旧四位不回写"},{kind:"save_activity",date:today,name:"虚构已有运动",caloriesKcal:"1357.1234",sourceSystem:"虚构手表"}]);
 if(process.env.FORMWARD_FRAME_TOUCH_ONLY==="1"){
  const touch=await context.browser().newContext({locale:"zh-CN",timezoneId:"Asia/Shanghai",viewport:{width:390,height:640},hasTouch:true,isMobile:true,storageState:await context.storageState()});
  const errors=[],cases=[];const p=await touch.newPage();p.on("pageerror",error=>errors.push(error.message));
  try{
   for(const [width,height] of [[390,640],[844,390]]){
    await p.setViewportSize({width,height});
    for(const [name,path] of [["overview",""],["meals","/meals"],["energy","/energy"],["body","/measurements"]]){
     await p.waitForLoadState("networkidle");await p.goto(baseURL+"/dashboard"+path);await p.waitForLoadState("networkidle");await p.evaluate(()=>document.fonts.ready);
     await p.getByRole("button",{name:"7D",exact:true}).tap();await p.waitForTimeout(550);await p.evaluate(()=>scrollTo(0,0));
     assert.ok(await p.getByRole("navigation",{name:"主导航",exact:true}).isVisible());
     assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
     assert.ok(await p.locator("[data-record-slot=metrics]").evaluate(n=>parseFloat(getComputedStyle(n.querySelector("strong")).fontSize)>=32));
     await p.screenshot({path:artifacts+"/"+name+"-touch-"+width+"x"+height+".png"});
     cases.push({name,width,height,hasTouch:true,passed:true});
    }
   }
   assert.deepEqual(errors,[]);await writeFile(artifacts+"/touch-report.json",JSON.stringify({passed:true,engine,cases,errors,realIOS:"未测",softwareKeyboard:"未测"},null,2));
  }finally{await touch.close();}
  return;
 }
 if(process.env.FORMWARD_FRAME_STRESS_ONLY==="1"){
  const date=addCalendarDays(today,-29);
  const op=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_meal",date,mealType:"虚构边界测试",items:[{kind:"food",name:"仅用于数字宽度的虚构数据",quantity:"1",unit:"份",sourceKind:"estimated",nutrition:{caloriesKcal:"1000000",proteinG:"1000000",carbsG:"1000000",fatG:"1000000"}}]}]});
  assert.equal(op.canConfirm,true);await decideMealOperation(db,userId,op.id,op.revision,"confirm");
  const saved=(await readMealSnapshot(db,userId)).meals.find(row=>row.date===date);
  await setMealDayStatus(db,userId,{operationId:randomUUID(),date,status:"complete",version:saved.day.version,contentDigest:saved.day.contentDigest});
  await energy([{kind:"save_energy_day",date,entryMode:"components",activityMode:"total",restingKcal:"1000000",activeKcal:"1000000"}]);
  const results=[];
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:900});
   for(const [name,path] of [["overview",""],["meals","/meals?date="+date],["energy","/energy?date="+date]]){
    await visit("/dashboard"+path);
    if(name==="overview"){await page.getByRole("button",{name:"30D",exact:true}).click();await page.locator('[data-overview-date="'+date+'"]').focus();await page.keyboard.press("Enter");}
    else if(await page.getByRole("dialog").count()){await page.getByRole("dialog").getByRole("button",{name:"关闭编辑",exact:true}).click();await page.getByRole("dialog").waitFor({state:"hidden"});}
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(200);
    const metric=page.locator("[data-record-slot=metrics]");
    assert.equal(await metric.getAttribute("data-selected-date"),date);
    const crop=await metric.evaluate(node=>[...node.querySelectorAll("strong")].filter(n=>n.getBoundingClientRect().right>n.parentElement.getBoundingClientRect().right+1).map(n=>n.textContent));
    assert.deepEqual(crop,[],name+" whole number must remain complete");
    const clippedTicks=await page.locator("[data-record-slot=plot] svg").evaluateAll(svgs=>svgs.flatMap(svg=>[...svg.querySelectorAll("text[text-anchor=end]")].filter(text=>text.getBoundingClientRect().left<svg.getBoundingClientRect().left-1).map(text=>text.textContent)));
    assert.deepEqual(clippedTicks,[],name+" full axis labels must be visible");await shot("long-"+name+"-"+width);
    results.push({width,name,readings:await metric.innerText()});
   }
  }
  assert.deepEqual(native,[]);await writeFile(artifacts+"/stress-report.json",JSON.stringify({passed:true,engine,results},null,2));return;
 }
 if(process.env.FORMWARD_FRAME_SCREEN_ONLY==="1"){await checkOverviewFirstScreen({baseURL,page,artifacts:artifacts+"/overview-first-screen",engine});return;}
 if(process.env.FORMWARD_FRAME_KEYBOARD_ONLY==="1"){
  await page.setViewportSize({width:390,height:640});await visit("/dashboard/energy");await page.getByRole("button",{name:"查看记录 →",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"编辑",exact:true}).click();
  const form=page.getByRole("dialog",{name:"每日消耗",exact:true}),input=form.getByLabel("静息 · kcal",{exact:true});await input.fill("");await input.pressSequentially("2000");assert.equal(await input.inputValue(),"2000");await input.fill("2000.12");await form.getByText("请输入整数，不填写小数。",{exact:true}).waitFor();assert.equal(await input.evaluate(node=>node.checkValidity()),false);await input.fill("2000");await form.getByRole("heading",{name:"静息与活动",exact:true}).click();assert.equal(await input.inputValue(),"2000");
  assert.deepEqual(native,[]);await writeFile(artifacts+"/keyboard-report.json",JSON.stringify({passed:true,typedInteger:true,rejectsFraction:true,blurStable:true},null,2));return;
 }
 const pages=[["overview",""],["meals","/meals"],["energy","/energy"],["body","/measurements"]];
 for(const [width,height] of (process.env.FORMWARD_FRAME_FLOW_ONLY==="1"?[]:[[320,560],[390,560],[390,640],[430,780],[844,390],[1100,900],[1440,900]])){
  const rows=[];await page.setViewportSize({width,height});
  for(const [name,path] of pages){
   await visit("/dashboard"+path);await page.getByRole("button",{name:"7D",exact:true}).click();await page.waitForTimeout(480);await page.evaluate(()=>scrollTo(0,0));
   assert.equal(await page.locator("[data-record-slot=date] time").getAttribute("datetime"),today,name+" selected date");
   const boxes=await page.locator("[data-record-slot]").evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>{const r=node.getBoundingClientRect();return [node.dataset.recordSlot,{x:r.x,y:r.y,width:r.width,height:r.height}];})));
   rows.push({name,...boxes});await shot(name+"-"+width+"x"+height);
   const typography=await page.locator("[data-record-slot=metrics]").evaluate(node=>({main:parseFloat(getComputedStyle(node.querySelector("strong")).fontSize),filter:parseFloat(getComputedStyle(document.querySelector("[data-record-slot=range] button")).fontSize),units:[...node.querySelectorAll("strong small")].every(unit=>{const number=unit.previousElementSibling.getBoundingClientRect(),u=unit.getBoundingClientRect();return u.left>=number.right&&u.top<number.bottom;})}));
   assert.ok(typography.main>=32&&typography.main>typography.filter*2,name+" data must dominate controls");assert.ok(typography.units,name+" units stay with numbers");
   assert.equal(await page.getByText("显示选项",{exact:true}).count(),0);

   const overflow=await page.locator("[data-record-slot=metrics] strong").evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width+1<n.scrollWidth).map(n=>({text:n.textContent,width:n.getBoundingClientRect().width,scroll:n.scrollWidth,font:getComputedStyle(n).font})));assert.deepEqual(overflow,[],name+" numbers must fit");
   if(width<=430&&height>=560){const plot=await page.locator("[data-record-slot=plot]").boundingBox(),nav=await page.locator(".mobile-bottom-nav").count()?await page.locator(".mobile-bottom-nav").boundingBox():null;assert.ok(plot.y<height-80,name+" primary plot appears");if(nav)assert.ok(plot.y<nav.y,name+" plot above nav");}
  }
  for(const slot of ["date","metrics"]){const ys=rows.map(row=>row[slot].y),xs=rows.map(row=>row[slot].x);assert.ok(Math.max(...ys)-Math.min(...ys)<=2,JSON.stringify({width,slot,rows}));assert.ok(Math.max(...xs)-Math.min(...xs)<=2);}
  geometry.push({width,height,rows});await writeFile(artifacts+"/geometry.json",JSON.stringify(geometry,null,2));
 }
 console.log(engine+" 四页视口、数字和单位通过");
 checks.push("四页7种视口日期和主要读数起点误差≤2px，专用统计可自然增高，真实波动和缺日不填平");
 await page.setViewportSize({width:390,height:640});await visit("/dashboard/energy");await page.getByRole("button",{name:"查看记录 →",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"编辑",exact:true}).click();
 let form=page.getByRole("dialog",{name:"每日消耗",exact:true});
 const integerInput=form.getByLabel("静息 · kcal",{exact:true});await integerInput.fill("2000.12");await form.getByText("请输入整数，不填写小数。",{exact:true}).waitFor();assert.equal(await integerInput.evaluate(node=>node.checkValidity()),false);await form.getByRole("button",{name:"关闭编辑",exact:true}).click();await page.getByRole("dialog",{name:"放弃尚未保存的输入？"}).waitFor();await page.keyboard.press("Escape");assert.equal(await integerInput.inputValue(),"2000.12");await integerInput.fill("2000");
 await form.getByRole("button",{name:"关闭编辑",exact:true}).click();await page.getByRole("dialog",{name:"放弃尚未保存的输入？"}).getByRole("button",{name:"放弃修改",exact:true}).click();await form.waitFor({state:"hidden"});await page.getByRole("dialog").getByRole("button",{name:"编辑",exact:true}).click();form=page.getByRole("dialog",{name:"每日消耗",exact:true});
 assert.equal(await form.getByLabel("活动合计 · kcal",{exact:true}).inputValue(),"1357");assert.equal(await form.getByText(/是否已包含在当天/).count(),0);assert.equal(await form.getByLabel("已完成",{exact:true}).count(),0);await shot("energy-automatic-390");
 await form.getByLabel("活动合计 · kcal",{exact:true}).fill("");await form.getByLabel("活动合计 · kcal",{exact:true}).fill("1357");await form.getByRole("heading",{name:"静息与活动",exact:true}).click();await form.getByText(/这项运动是否已包含在当天活动合计 1357/).waitFor();assert.equal(await form.getByRole("button",{name:"保存 · "+today,exact:true}).isDisabled(),true);await shot("energy-manual-pending-390");
 await form.getByRole("button",{name:"已包含",exact:true}).click();await form.getByLabel("活动合计 · kcal",{exact:true}).fill("0");await form.getByRole("heading",{name:"静息与活动",exact:true}).click();await form.getByText(/这项运动是否已包含在当天活动合计 0/).waitFor();await shot("energy-manual-zero-pending-390");await form.getByRole("button",{name:"额外增加",exact:true}).click();
 await form.getByLabel("活动合计 · kcal",{exact:true}).fill("");await form.getByRole("heading",{name:"静息与活动",exact:true}).click();assert.equal(await form.getByLabel("活动合计 · kcal",{exact:true}).inputValue(),"1357");assert.equal(await form.getByText(/是否已包含在当天/).count(),0);
 // 只改备注，旧四位值和自动累计模式必须原样保留。
 await form.getByText("时间与备注",{exact:true}).click();await form.getByLabel("备注",{exact:true}).fill("只改备注，保留原精度");await form.getByRole("button",{name:"保存 · "+today,exact:true}).click();await form.waitFor({state:"hidden"});await page.waitForLoadState("networkidle");
 let snapshot=await readEnergySnapshot(db,userId);assert.equal(snapshot.days.find(d=>d.date===today).restingKcal,"2000.1234");assert.equal(snapshot.activities.find(a=>a.date===today).caloriesKcal,"1357.1234");assert.equal(snapshot.days.find(d=>d.date===today).activityMode,"activities");
 console.log(engine+" 整数输入与旧精度保留通过");
 checks.push("1357自动累计不询问；手填1357、0后询问并禁止未核对保存；清空恢复；只改备注保留四位旧值");
 // 单独编辑一项，预览仍含同日其他运动。
 await energy([{kind:"save_activity",date:today,name:"虚构另一项运动",caloriesKcal:"100"}]);await visit("/dashboard/energy");await page.getByRole("button",{name:"查看记录 →",exact:true}).click();await page.getByRole("button",{name:"编辑活动",exact:true}).first().click();form=page.getByRole("dialog",{name:"活动记录",exact:true});assert.match(await form.textContent(),/3457/);
 await form.getByLabel("活动名称",{exact:true}).fill("尚未保存的名称");await form.getByRole("button",{name:"关闭编辑",exact:true}).click();let confirm=page.getByRole("dialog",{name:"放弃尚未保存的输入？",exact:true});await confirm.waitFor();assert.equal(await confirm.getByRole("button",{name:"取消",exact:true}).evaluate(node=>node===document.activeElement),true);await shot("discard-confirm-390");await page.keyboard.press("Escape");await confirm.waitFor({state:"hidden"});assert.equal(await form.getByLabel("活动名称",{exact:true}).inputValue(),"尚未保存的名称");await form.getByRole("button",{name:"关闭编辑",exact:true}).click();await page.getByRole("dialog",{name:"放弃尚未保存的输入？"}).getByRole("button",{name:"放弃修改",exact:true}).click();await form.waitFor({state:"hidden"});checks.push("单运动预览含其他运动；应用内放弃确认取消/Escape保住输入");
 await visit("/dashboard/measurements");await page.locator('[data-record-date="'+today+'"]').getByRole("button",{name:"编辑 "+today,exact:true}).click();form=page.getByRole("dialog").last();await form.getByRole("button",{name:"删除晨间体重",exact:true}).click();confirm=page.getByRole("dialog",{name:"删除晨间体重？",exact:true});await confirm.waitFor();const bounds=await confirm.boundingBox();assert.ok(bounds.x>=16&&bounds.x+bounds.width<=390-16);await shot("body-delete-confirm-390");await page.keyboard.press("Escape");await confirm.waitFor({state:"hidden"});assert.equal(await form.isVisible(),true);await form.getByRole("button",{name:"删除晨间体重",exact:true}).click();await page.getByRole("dialog",{name:"删除晨间体重？",exact:true}).getByRole("button",{name:"删除体重",exact:true}).click();await page.waitForLoadState("networkidle");await form.getByRole("button",{name:"删除晨间体重",exact:true}).waitFor({state:"hidden"});const ms=await db.select().from(schema.measurement).where(and(eq(schema.measurement.userId,userId),eq(schema.measurement.recordDate,today)));assert.equal(ms.find(r=>!r.deletedAt).weightKg,null);checks.push("小型应用内删除确认默认取消，Escape不关闭下层，删除只影响体重");
 // 取消自定义区间完全不影响原日期；应用后四页一致。
 for(const [pageName,path] of pages){await visit("/dashboard"+path);await page.getByRole("button",{name:"自定义",exact:true}).click();const previous=await page.locator("[data-record-slot=date]").textContent();const custom=page.getByRole("form",{name:"自定义日期范围",exact:true});await custom.getByLabel(/开始日期/).fill(addCalendarDays(today,-20));assert.equal(await page.locator("[data-record-slot=date]").textContent(),previous,pageName+" editing custom range must retain date");await custom.getByRole("button",{name:"取消",exact:true}).click();assert.equal(await page.locator("[data-record-slot=date]").textContent(),previous,pageName+" cancel must retain date");}
 checks.push("四页自定义填写中不改原图，取消保持原日期");
 // AI确认四位原值只显示整数，无已完成选项/原始四位。
 await page.waitForLoadState("networkidle");const res=await context.request.post(baseURL+"/api/v1/record-operations",{headers:{Authorization:"Bearer "+token},data:{operationId:randomUUID(),items:[{key:"energy",kind:"save_activity",date:today,name:"虚构AI精度",caloriesKcal:"741.1234"}]}});assert.equal(res.status(),200);const op=await res.json();await visit(new URL(op.confirmationUrl).pathname);assert.ok((await page.innerText("body")).includes("741"));assert.equal((await page.innerText("body")).includes("741.1234"),false);assert.equal((await page.innerText("body")).includes("已完成"),false);await shot("ai-energy-integers-390");await page.getByRole("button",{name:"修改",exact:true}).click();const aiForm=page.getByRole("dialog",{name:"修改待保存内容",exact:true});assert.match(await aiForm.innerText(),/4198/);assert.equal(await aiForm.getByLabel("本次运动总消耗 · kcal",{exact:true}).inputValue(),"741");await shot("ai-exercise-edit-integers-390");await aiForm.getByRole("button",{name:"关闭编辑",exact:true}).click();await aiForm.waitFor({state:"hidden"});checks.push("AI显示整数、保留原始精度、不显示已完成；新运动编辑预览只累计一次");
 // 实际网页复现851、已包含与额外增加；只写本次内存数据库。
 await page.waitForLoadState("networkidle");snapshot=await readEnergySnapshot(db,userId);
 const existingDay=snapshot.days.find(d=>d.date===today),activeRows=snapshot.activities.filter(a=>a.date===today&&!a.deletedAt);
 await energy([{kind:"save_energy_day",id:existingDay.id,version:existingDay.version,date:today,entryMode:"components",activityMode:"total",restingKcal:"2058",activeKcal:"1357",restingSourceSystem:"Garmin手表",activeSourceSystem:"Garmin手表"},...activeRows.map(row=>({kind:"delete_activity",id:row.id,version:row.version}))]);
 await energy([{kind:"save_activity",date:today,name:"羽毛球",calorieMode:"components",exerciseActiveKcal:"741",exerciseRestingKcal:"110",durationMinutes:"90",sourceSystem:"Garmin手表",inclusion:"included"}]);
 for(const [width,height] of [[390,740],[1440,900]]){
  await page.setViewportSize({width,height});await visit("/dashboard/energy");await page.getByRole("button",{name:"查看记录 →",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"编辑",exact:true}).click();
  const editor=page.getByRole("dialog",{name:"每日消耗",exact:true}),entry=editor.locator("form"),total=entry.locator('[class*="stickyTotal"] > div > strong');
  assert.equal(await total.textContent(),"3415");await shot("energy-included-top-"+width);
  const item=editor.locator("details").filter({has:page.getByText("羽毛球",{exact:true})}).first();
  if(!await item.evaluate(node=>node.open))await item.locator("summary").click();await item.evaluate(node=>{const d=node.closest("dialog"),head=d.querySelector('[class*="stickyTotal"]');d.scrollTop+=node.getBoundingClientRect().top-d.getBoundingClientRect().top-head.getBoundingClientRect().height-12;});await item.getByText(/本次不再额外增加/).waitFor();
  assert.ok((await item.textContent()).includes("851"));assert.ok((await item.textContent()).includes("741 运动 ＋ 110 期间静息"));await shot("energy-included-middle-"+width);
  const actions=item.locator('[class*="exerciseActions"]'),buttons=actions.getByRole("button");await actions.scrollIntoViewIfNeeded();
  const rects=await buttons.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,height:r.height};}));
  assert.equal(rects.length,2);assert.ok(rects.every(r=>r.height>=44));assert.ok(rects[1].x-rects[0].right>=16||rects[1].y-rects[0].bottom>=8);await editor.evaluate(node=>node.scrollTop=node.scrollHeight);await shot("energy-included-bottom-"+width);
  await item.getByRole("button",{name:"修改包含关系",exact:true}).click();await item.getByRole("button",{name:"额外增加",exact:true}).click();assert.equal(await total.textContent(),"4156");await shot("energy-additional-"+width);
  await editor.getByRole("button",{name:"关闭编辑",exact:true}).click();await page.getByRole("dialog",{name:"放弃尚未保存的输入？"}).getByRole("button",{name:"放弃修改",exact:true}).click();await editor.waitFor({state:"hidden"});
 }
 checks.push("运动本次851=741+110；已包含时3415、额外增加时4156；顶部中段底部截图，操作分开且44px可点击");
 await page.waitForLoadState("networkidle");
 const splitResponse=await context.request.post(baseURL+"/api/v1/record-operations",{headers:{Authorization:"Bearer "+token},data:{operationId:randomUUID(),items:[{key:"split-example",kind:"save_activity",date:today,name:"虚构AI羽毛球",calorieMode:"components",exerciseActiveKcal:"741",exerciseRestingKcal:"110",inclusion:"included",sourceSystem:"Garmin手表"}]}});
 assert.equal(splitResponse.status(),200);const splitPreview=await splitResponse.json();
 for(const [width,height] of [[390,740],[1440,900]]){
  await page.setViewportSize({width,height});await visit(new URL(splitPreview.confirmationUrl).pathname);
  const inclusion=page.getByRole("button",{name:"已包含",exact:true});if(await inclusion.count()){await inclusion.click();await page.waitForLoadState("networkidle");}
  await page.getByText("本次共 851 kcal",{exact:true}).waitFor();await page.locator("[data-exercise-effect]").getByText(/本次不再额外增加/).waitFor();
  await shot("ai-components-included-"+width);
 }
 checks.push("AI确认分项总数851、已包含不再增加，390和1440无溢出");
 console.log(engine+" 消耗包含关系、运动总数与滚动操作通过");
 await checkOverviewFirstScreen({baseURL,page,artifacts:artifacts+"/overview-first-screen",engine});
 assert.deepEqual(native,[]);await writeFile(artifacts+"/report.json",JSON.stringify({passed:true,flowOnly,engine,checks,geometry,realIOS:"未测",softwareKeyboard:"未测"},null,2));
}
