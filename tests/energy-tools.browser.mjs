import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";
import {submitMealOperation,decideMealOperation,readMealSnapshot} from "../src/features/meals/records.ts";
import {setMealDayStatus} from "../src/features/meals/day-status.ts";
import {submitEnergyOperation,decideEnergyOperation,readEnergySnapshot} from "../src/features/activities/records.ts";

// All writes go through existing rules into energy.browser.mts's isolated PGlite database.
export async function checkEnergyTools({baseURL,page,context,db,userId,today,token,engine}){
 const artifacts=process.env.FORMWARD_ENERGY_TOOLS_ARTIFACTS??".codex/energy-tools-visual/"+engine;
 await mkdir(artifacts,{recursive:true});
 const checks=[],screens=[],native=[],geometry=[];
 page.on("dialog",async dialog=>{native.push(dialog.message());await dialog.dismiss();});
 const date=offset=>addCalendarDays(today,offset);
 const form=()=>page.getByRole("dialog",{name:"每日消耗",exact:true});
 const total=()=>form().locator('[class*="stickyTotal"] > div > strong');
 const input=()=>form().getByLabel("活动合计 · kcal",{exact:true});
 const confirmation=()=>page.getByRole("dialog",{name:"改用运动明细相加？",exact:true});
 async function visit(path){await page.waitForLoadState("networkidle");await page.goto(baseURL+path);await page.waitForLoadState("networkidle");await page.evaluate(()=>document.fonts.ready);}
 async function shot(name){await page.waitForTimeout(400);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:artifacts+"/"+name+".png"});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+" overflow");screens.push(name+".png");}
 async function energy(actions){await page.waitForLoadState("networkidle");const operation=await submitEnergyOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions});assert.ok(operation.canConfirm,JSON.stringify(operation.rows));await decideEnergyOperation(db,userId,operation.id,operation.revision,"confirm");}
 async function day(offset,fields){const existing=(await readEnergySnapshot(db,userId)).days.find(row=>row.date===date(offset)&&!row.deletedAt);await energy([{kind:"save_energy_day",date:date(offset),...(existing?{id:existing.id,version:existing.version}:{}),entryMode:"components",activityMode:"total",restingKcal:"2058",activeKcal:"215",restingSourceSystem:"虚构手表",activeSourceSystem:"虚构手表",...fields}]);}
 async function edit(target=today){await visit("/dashboard/energy?date="+target);await page.getByRole("button",{name:"查看记录 →",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"编辑",exact:true}).click();await form().waitFor();}
 async function closeEditor(){await form().getByRole("button",{name:"关闭编辑",exact:true}).click();const discard=page.getByRole("dialog",{name:"放弃尚未保存的输入？",exact:true});if(await discard.isVisible())await discard.getByRole("button",{name:"放弃修改",exact:true}).click();await form().waitFor({state:"hidden"});const details=page.getByRole("dialog");if(await details.count()){await details.getByRole("button",{name:"关闭编辑",exact:true}).click();await details.waitFor({state:"hidden"});}}
 async function menuSwitch(label="改用运动累计"){await form().getByText("填写方式",{exact:true}).click();if(page.viewportSize()?.width===390&&!screens.includes("activity-method-menu-390.png"))await shot("activity-method-menu-390");await form().getByRole("button",{name:label,exact:true}).click();}
 async function acceptSwitch(){await confirmation().getByRole("button",{name:"确认切换",exact:true}).click();await confirmation().waitFor({state:"hidden"});}
 const bounds=()=>page.locator("[data-record-slot]").evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>{const r=node.getBoundingClientRect();return [node.dataset.recordSlot,{x:r.x,y:r.y,width:r.width,height:r.height}];})));
 await day(0,{restingEstimated:true,activeEstimated:true});
 await day(-1,{activeKcal:"1357"});
 await energy([{kind:"save_activity",date:date(-1),name:"虚构羽毛球",calorieMode:"components",exerciseActiveKcal:"741",exerciseRestingKcal:"110",durationMinutes:"90",sourceSystem:"虚构手表",inclusion:"included"}]);
 await day(-2,{activeKcal:"600"});
 await energy([{kind:"save_activity",date:date(-2),name:"虚构散步",caloriesKcal:"400",inclusion:"included"},{kind:"save_activity",date:date(-2),name:"虚构未知运动",caloriesKcal:null,inclusion:"included"}]);
 await day(-3,{activeKcal:"500"});
 await energy([{kind:"save_activity",date:date(-3),name:"虚构已发生运动",caloriesKcal:"100",inclusion:"included"},{kind:"save_activity",date:date(-3),name:"旧未计入运动",caloriesKcal:"999",completed:false}]);
 const meals=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[0,-1,-2].map(offset=>({kind:"save_meal",date:date(offset),mealType:"lunch",items:[{kind:"food",name:"虚构午餐",quantity:"1",unit:"份",sourceKind:"estimated",nutrition:{caloriesKcal:offset===-1?"4100":"2390",proteinG:"120",carbsG:"260",fatG:"70"}},...(offset===-2?[{kind:"food",name:"虚构热量未知配菜",quantity:"1",unit:"份",sourceKind:"estimated",nutrition:{caloriesKcal:null,proteinG:null,carbsG:null,fatG:null}}]:[])]}))});
 assert.ok(meals.canConfirm);await decideMealOperation(db,userId,meals.id,meals.revision,"confirm");
 for(const row of (await readMealSnapshot(db,userId)).meals){await setMealDayStatus(db,userId,{operationId:randomUUID(),date:row.date,status:row.date===date(-1)?"incomplete":"complete",version:row.day.version,contentDigest:row.day.contentDigest});}
 const pages=[["overview",""],["meals","/meals"],["energy","/energy"],["body","/measurements"]];
 for(const [width,height] of process.env.FORMWARD_ENERGY_TOOLS_FLOW_ONLY==="1"?[]:[[320,560],[390,640],[430,780],[1100,900],[1440,900]]){
  console.log("Checking tools viewport",width,height);await page.setViewportSize({width,height});
  for(const [name,path] of pages){
   await visit("/dashboard"+path);await page.getByRole("button",{name:"7D",exact:true}).click();await page.evaluate(()=>scrollTo(0,0));await shot(name+"-closed-"+width);
   const before=await bounds(),trigger=page.getByRole("button",{name:"工具",exact:true});
   const header=await page.locator(".dashboard-header").boundingBox(),triggerBox=await trigger.boundingBox();assert.ok(triggerBox.height>=44&&triggerBox.width>=44);
   await page.getByLabel("账号菜单",{exact:true}).click();assert.ok(await page.locator(".dashboard-menu").evaluate(node=>node.open));
   await trigger.click();const drawer=page.getByRole("dialog",{name:"工具",exact:true});await drawer.waitFor();await page.waitForTimeout(400);
   assert.equal(await page.locator(".dashboard-menu").evaluate(node=>node.open),false,"opening tools closes account");
   assert.equal(await drawer.getByRole("button",{name:"打卡记录",exact:true}).isDisabled(),true);
   assert.equal(await drawer.getByRole("button",{name:"最近总结",exact:true}).isDisabled(),true);
   assert.equal(await drawer.getByRole("button",{name:"AI 录入",exact:true}).isDisabled(),true);
   assert.ok(await drawer.getByText("站内聊天录入，暂未开放",{exact:true}).isVisible());
   const box=await drawer.boundingBox();assert.ok(box.width<=Math.min(320,width-16)+1&&box.x>=15);assert.ok(box.x+box.width<=width+1);
   const after=await bounds();for(const key of ["date","metrics","range","plot"])for(const dim of ["x","y","width"])assert.ok(Math.abs(before[key][dim]-after[key][dim])<=1,name+" tools shifts "+key+" "+dim);
   if(width<=430)assert.ok(header.height<=50&&triggerBox.y<header.y+header.height,"one-line mobile header");
   await shot(name+"-tools-"+width);geometry.push({name,width,height,header,drawer:box,before,after});
   const focusables=drawer.locator("button:not(:disabled),a[href]");await focusables.last().focus();await page.keyboard.press("Tab");assert.equal(await focusables.first().evaluate(node=>node===document.activeElement),true,"focus trap");
   await page.keyboard.press("Escape");await drawer.waitFor({state:"hidden"});assert.equal(await trigger.evaluate(node=>node===document.activeElement),true,"return trigger focus");
   assert.equal(await page.evaluate(()=>document.body.style.overflow),"","scroll restored");
  }
  await edit();await form().evaluate(node=>node.scrollTop=0);assert.equal(await total().textContent(),"2273");await page.getByRole("button",{name:"工具",exact:true}).evaluate(node=>node.click());assert.equal(await page.getByRole("dialog",{name:"工具",exact:true}).count(),0,"editing blocks tools");
  await shot("activity-manual-"+width);await menuSwitch();await confirmation().waitFor();const copy=await confirmation().innerText();assert.match(copy,/215/);assert.match(copy,/2273.*2058/);assert.match(copy,/没有运动明细/);
  assert.equal(await input().getAttribute("data-calorie-origin"),"manual","no premature mode switch");assert.equal(await total().textContent(),"2273");
  const cb=await confirmation().boundingBox();assert.ok(cb.x>=16&&cb.x+cb.width<=width-16+1);assert.equal(await confirmation().getByRole("button",{name:"取消",exact:true}).evaluate(node=>node===document.activeElement),true);
  await shot("activity-switch-confirm-"+width);await acceptSwitch();assert.equal(await input().inputValue(),"0");assert.equal(await input().getAttribute("data-calorie-origin"),"automatic");assert.equal(await total().textContent(),"2058");assert.equal(await form().getByLabel("活动来源",{exact:true}).count(),0);
  await shot("activity-automatic-"+width);await closeEditor();
 }
 if(process.env.FORMWARD_ENERGY_TOOLS_FLOW_ONLY!=="1")checks.push("Five sizes/four actual pages: tools overlay leaves content geometry unchanged, mobile header one line; disabled future items, keyboard loop, Escape focus/scroll restore; actual closed/open and manual/auto/confirm screenshots");
 // Opening tools and pressing Escape preserves the chart day the user pinned.
 await page.setViewportSize({width:390,height:640});await visit("/dashboard");await page.getByRole("button",{name:"7D",exact:true}).click();const pinnedDate=date(-1),pinned=page.locator('[data-overview-date="'+pinnedDate+'"]');await pinned.focus();await page.keyboard.press("Enter");const trend=page.getByRole("region",{name:"热量与晨重趋势",exact:true});assert.equal(await trend.getAttribute("data-pinned-date"),pinnedDate);await page.getByRole("button",{name:"工具",exact:true}).click();await page.getByRole("dialog",{name:"工具",exact:true}).waitFor();assert.equal(await trend.getAttribute("data-pinned-date"),pinnedDate,"tool open preserves pin");await page.keyboard.press("Escape");await page.getByRole("dialog",{name:"工具",exact:true}).waitFor({state:"hidden"});assert.equal(await trend.getAttribute("data-pinned-date"),pinnedDate);assert.equal(await trend.getAttribute("data-selected-date"),pinnedDate);
 checks.push("Tool open/Escape close preserves the pinned chart date");
 // The account menu has no duplicate navigation. Tools links close before navigating.
 await page.setViewportSize({width:390,height:640});
 await visit("/dashboard");await page.getByLabel("账号菜单",{exact:true}).click();const accountMenu=page.locator(".dashboard-menu");assert.equal(await accountMenu.getByRole("link").count(),0);assert.ok(await accountMenu.getByRole("button",{name:/退出/}).isVisible());await page.getByRole("button",{name:"工具",exact:true}).click();await page.getByRole("dialog",{name:"工具",exact:true}).getByRole("link",{name:"AI 接入",exact:true}).click();await page.waitForURL("**/dashboard/ai");await page.waitForLoadState("networkidle");assert.equal(await page.getByRole("dialog",{name:"工具",exact:true}).count(),0);await page.getByRole("button",{name:"工具",exact:true}).click();await page.getByRole("dialog",{name:"工具",exact:true}).getByRole("link",{name:"导出 Excel",exact:true}).click();await page.waitForURL("**/dashboard/export");await page.waitForLoadState("networkidle");await page.getByRole("button",{name:"工具",exact:true}).click();await page.getByRole("dialog",{name:"工具",exact:true}).getByRole("button",{name:"关闭工具栏",exact:true}).click();await page.getByRole("dialog",{name:"工具",exact:true}).waitFor({state:"hidden"});
 await page.getByRole("button",{name:"工具",exact:true}).click();await page.mouse.click(5,250);await page.getByRole("dialog",{name:"工具",exact:true}).waitFor({state:"hidden"});
 checks.push("Account-only menu; AI/export actual navigation closes drawer; close button/backdrop work");
 console.log("Checking aggregate cancellation and input preservation");
 // Clear and blur is the same protected switch, with no loss of pending source/notes.
 await edit();await form().getByLabel("活动来源",{exact:true}).fill("虚构来源草稿");await form().getByText("时间与备注",{exact:true}).click();await form().getByLabel("备注",{exact:true}).fill("切换期间保留备注");
 await input().fill("");await form().getByRole("heading",{name:"静息与活动",exact:true}).click();await confirmation().waitFor();assert.equal(await total().textContent(),"2273");await page.keyboard.press("Escape");await confirmation().waitFor({state:"hidden"});assert.equal(await input().inputValue(),"215");assert.equal(await form().getByLabel("活动来源",{exact:true}).inputValue(),"虚构来源草稿");assert.equal(await form().getByLabel("备注",{exact:true}).inputValue(),"切换期间保留备注");
 // Blurring onto another control must not mutate the underlying form or eat Escape.
 await input().fill("");await form().getByText("填写方式",{exact:true}).click();await confirmation().waitFor();await page.keyboard.press("Escape");await confirmation().waitFor({state:"hidden"});assert.equal(await input().inputValue(),"215");assert.equal(await form().locator("details").filter({hasText:"填写方式"}).evaluate(node=>node.open),false);
 await input().fill("");await form().getByRole("button",{name:"只记总数",exact:true}).click();await confirmation().waitFor();assert.equal(await form().getByRole("button",{name:"分开记录",exact:true}).getAttribute("aria-pressed"),"true");await page.keyboard.press("Escape");await confirmation().waitFor({state:"hidden"});assert.equal(await input().inputValue(),"215");
 await menuSwitch();await confirmation().getByRole("button",{name:"取消",exact:true}).click();assert.equal(await input().inputValue(),"215");
 await input().fill("");await form().getByRole("heading",{name:"静息与活动",exact:true}).click();await acceptSwitch();assert.equal(await input().inputValue(),"0");await menuSwitch("改为手填活动合计");assert.equal(await input().inputValue(),"215");assert.equal(await form().getByLabel("活动来源",{exact:true}).inputValue(),"虚构来源草稿");
 await input().fill("0");await form().getByRole("heading",{name:"静息与活动",exact:true}).click();await menuSwitch();assert.match(await confirmation().innerText(),/当前活动合计.*0/);await page.keyboard.press("Escape");assert.equal(await input().inputValue(),"0");await closeEditor();
 checks.push("Clear+blur invokes same confirmation; cancel/Escape retains amount/source/notes; confirmed switch stays draft-only; switch back restores manual draft; explicit zero protected");

 console.log("Checking effective exercises, unknowns and failures");
 // Current included exercise: cancelling preserves inclusion; confirm counts pure activity only.
 await edit(date(-1));assert.equal(await total().textContent(),"3415");await shot("activity-with-exercise-390");await form().evaluate(node=>node.scrollTop=node.scrollHeight);await shot("activity-exercise-bottom-390");await menuSwitch();const includedCopy=await confirmation().innerText();assert.match(includedCopy,/虚构羽毛球/);assert.match(includedCopy,/741/);assert.match(includedCopy,/3415.*2799/);await page.keyboard.press("Escape");assert.equal(await total().textContent(),"3415");assert.equal(await form().getByText(/这项运动是否已包含/).count(),0);
 await menuSwitch();await acceptSwitch();assert.equal(await input().inputValue(),"741");assert.equal(await total().textContent(),"2799");assert.equal(await form().getByText(/这项运动是否已包含/).count(),0);await closeEditor();
 // Unknown effective calories stay unknown; incomplete and pending removed exercises do not contribute.
 await edit(date(-2));await menuSwitch();assert.match(await confirmation().innerText(),/虚构未知运动/);await acceptSwitch();assert.equal(await input().inputValue(),"");assert.equal(await total().textContent(),"—");await closeEditor();
 await edit(date(-3));await menuSwitch();let copy=await confirmation().innerText();assert.match(copy,/虚构已发生运动/);assert.doesNotMatch(copy,/999/);await page.keyboard.press("Escape");
 const effective=form().locator("details").filter({has:page.locator("summary").filter({hasText:"虚构已发生运动"})});if(!await effective.evaluate(node=>node.open))await effective.locator("summary").click();await effective.getByRole("button",{name:/移除运动/}).click();await form().getByRole("button",{name:"＋ 添加运动",exact:true}).click();await menuSwitch();copy=await confirmation().innerText();assert.match(copy,/没有运动明细|无有效运动|0 千卡/);assert.doesNotMatch(copy,/999/);await acceptSwitch();assert.equal(await input().inputValue(),"0");await closeEditor();
 checks.push("Included741+rest110 previews activity741 and daily2799; cancellation keeps inclusion; unknown stays unknown; historical incomplete/pending removal/blank new row excluded");
 // Save failure leaves draft values. The request is aborted before touching the database.
 await edit();await input().fill("300");await form().getByLabel("活动来源",{exact:true}).fill("网络失败仍保留");
 const abortSave=route=>route.request().method()==="POST"?route.abort("failed"):route.continue();await page.route("**/dashboard/energy*",abortSave);
 await form().getByRole("button",{name:"保存 · "+today,exact:true}).click();await form().getByRole("alert").waitFor();assert.equal(await input().inputValue(),"300");assert.equal(await form().getByLabel("活动来源",{exact:true}).inputValue(),"网络失败仍保留");await page.unroute("**/dashboard/energy*",abortSave);await closeEditor();
 checks.push("Aborted save retains changed amount and source; saved health record unchanged");
 console.log("Checking AI confirmation shared form");
 // The same shared editor in AI confirmation changes only the draft, not saved health data.
 const old=(await readEnergySnapshot(db,userId)).days.find(row=>row.date===today&&!row.deletedAt);
 const response=await context.request.post(baseURL+"/api/v1/record-operations",{headers:{Authorization:"Bearer "+token},data:{operationId:randomUUID(),items:[{key:"daily-switch",kind:"save_energy_day",id:old.id,version:old.version,date:today,entryMode:"components",activityMode:"total",restingKcal:"2058",activeKcal:"215",activeSourceSystem:"虚构手表"}]}});
 assert.equal(response.status(),200);const operation=await response.json();await visit(new URL(operation.confirmationUrl).pathname);assert.equal(await page.getByRole("button",{name:"工具",exact:true}).count(),0,"AI confirmation stays compact");
 await page.getByRole("button",{name:"修改",exact:true}).click();const ai=page.getByRole("dialog",{name:"修改待保存内容",exact:true});
 await ai.getByText("填写方式",{exact:true}).click();await ai.getByRole("button",{name:"改用运动累计",exact:true}).click();await confirmation().waitFor();assert.match(await confirmation().innerText(),/应用修改返回后.*统一确认保存/);await shot("ai-switch-confirm-390");await page.keyboard.press("Escape");assert.equal(await ai.getByLabel("活动合计 · kcal",{exact:true}).inputValue(),"215");
 await ai.getByLabel("活动合计 · kcal",{exact:true}).fill("");await ai.getByRole("heading",{name:"静息与活动",exact:true}).click();await acceptSwitch();assert.equal(await ai.getByLabel("活动合计 · kcal",{exact:true}).inputValue(),"0");await shot("ai-switch-draft-390");await ai.getByRole("button",{name:"应用修改",exact:true}).click();await ai.waitFor({state:"hidden"});await page.waitForLoadState("networkidle");
 const afterAI=(await readEnergySnapshot(db,userId)).days.find(row=>row.id===old.id);assert.equal(afterAI.activityMode,"total");assert.equal(afterAI.activeKcal,old.activeKcal);assert.equal(afterAI.version,old.version);
 checks.push("AI editor uses protected switch; applying changes leaves existing day/version unchanged until unified confirmation; no tool trigger on review");
 console.log("Checking hover stability");
 // Meaningful diet notes occupy one interval-sized row; legacy energy estimates never surface.
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:width<700?640:900});await visit("/dashboard");await page.getByRole("button",{name:"7D",exact:true}).click();await page.waitForTimeout(500);
  assert.equal(await page.getByText("消耗含估计",{exact:false}).count(),0);assert.equal(await page.locator("[data-record-slot=status]").count(),1);
  let previous=null;const cases=[];
  for(const d of [today,date(-1),date(-2),date(-4),today]){
   const hit=page.locator('[data-overview-date="'+d+'"]');const box=await hit.boundingBox();await page.mouse.move(box.x+Math.max(1,box.width*.5),box.y+30);await page.waitForTimeout(80);assert.equal(await page.getByRole("region",{name:"热量与晨重趋势",exact:true}).getAttribute("data-selected-date"),d);
   const result=await bounds();if(previous)for(const key of ["date","metrics","range","plot"])for(const dim of ["x","y","width","height"])assert.ok(Math.abs(previous[key][dim]-result[key][dim])<=1,"hover changed "+key+" "+dim+" at "+width);
   cases.push({date:d,geometry:result});previous=result;
  }
  await shot("overview-stable-status-"+width);geometry.push({width,statusCases:cases});
  await page.getByRole("button",{name:"自定义",exact:true}).click();const custom=page.getByRole("form",{name:"自定义日期范围",exact:true});await custom.getByLabel(/开始日期/).fill(today);await custom.getByLabel(/结束日期/).fill(today);await custom.getByRole("button",{name:"应用",exact:true}).click();assert.equal(await page.locator("[data-record-slot=status]").count(),0,"no empty status spacer for clean interval");
  await visit("/dashboard/energy");await page.getByRole("button",{name:"7D",exact:true}).click();let eprevious=null;
  for(const d of [today,date(-1),date(-2),date(-4),today]){const hit=page.locator('[data-energy-date="'+d+'"]');const box=await hit.boundingBox();await page.mouse.move(box.x+Math.max(1,box.width*.5),box.y+30);await page.waitForTimeout(80);assert.equal(await page.getByRole("region",{name:"消耗历史趋势",exact:true}).getAttribute("data-selected-date"),d);const result=await bounds();if(eprevious)for(const key of ["date","metrics","range","plot"])for(const dim of ["x","y","width","height"])assert.ok(Math.abs(eprevious[key][dim]-result[key][dim])<=1,"energy hover changed "+key+" "+dim);eprevious=result;}
  assert.equal(await page.locator("[data-record-slot=metrics]").getByText(/估计/).count(),0);await shot("energy-stable-readings-"+width);
 }
 checks.push("320/390/1440 normal/legacy-estimated/diet-incomplete/unknown/missing hover leaves date/readings/range/plot bounds stable; clean range creates no status spacer");
 await page.emulateMedia({reducedMotion:"reduce"});await visit("/dashboard");await page.getByRole("button",{name:"工具",exact:true}).click();await page.getByRole("dialog",{name:"工具",exact:true}).waitFor();await page.keyboard.press("Escape");await page.getByRole("dialog",{name:"工具",exact:true}).waitFor({state:"hidden"});await page.emulateMedia({reducedMotion:"no-preference"});
 assert.deepEqual(native,[]);
 await writeFile(artifacts+"/report.json",JSON.stringify({passed:true,flowOnly:process.env.FORMWARD_ENERGY_TOOLS_FLOW_ONLY==="1",engine,checks,screens,geometry,native,realIOS:"未测",softwareKeyboard:"未测"},null,2));
 console.log(engine+" energy tools checks passed: "+checks.length+" groups, "+screens.length+" screenshots");
}
