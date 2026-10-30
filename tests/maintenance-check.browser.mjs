import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import * as schema from "../src/db/schema.ts";
import {submitMealOperation,decideMealOperation,readMealSnapshot} from "../src/features/meals/records.ts";
import {submitEnergyOperation,decideEnergyOperation,readEnergySnapshot} from "../src/features/activities/records.ts";
import {setMealDayStatus} from "../src/features/meals/day-status.ts";
import {dailyTotals} from "../src/features/meals/model.ts";
import {saveMeasurementDay} from "../src/features/measurements/editing.ts";
const shift=(date,n)=>new Date(Date.parse(date+"T12:00:00Z")+n*86400000).toISOString().slice(0,10);
const n=(k="800")=>({caloriesKcal:k,proteinG:"40",carbsG:"70",fatG:"25"});
export async function checkMaintenance({baseURL,context,page,token,today,db,userId}){
 const artifacts=".codex/maintenance-visual";await mkdir(artifacts,{recursive:true});
 const headers={Authorization:"Bearer "+token},date=shift(today,-1),errors=[],requests=[];
 page.on("pageerror",error=>errors.push(error.message));
 const foodName="虚构包装食品",imageId=randomUUID();
 await db.insert(schema.mealImage).values({id:imageId,userId,pathname:"fictional/maintenance.png",sha256:randomUUID(),mimeType:"image/png",byteSize:68,fileName:"虚构图片.png",source:"manual",createdBy:userId});
 const saveMeals=async actions=>{const op=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions});assert.equal(op.canConfirm,true,JSON.stringify(op.rows));await decideMealOperation(db,userId,op.id,op.revision,"confirm");};
 const saveEnergy=async actions=>{const op=await submitEnergyOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions});assert.equal(op.canConfirm,true,JSON.stringify(op.rows));await decideEnergyOperation(db,userId,op.id,op.revision,"confirm");};
 await saveMeals([{kind:"save_food",name:foodName,baseQuantity:"100",unit:"g",servingQuantity:"50",servingUnit:"包",nutrition:n("200"),sourceKind:"reference"}]);
 const meals=[];
 const sharp=[2390,2670,3690,3360,3820,3170,4280,2780,3100,2180,2510,2340,2520,2290,1850,1770,2360,2560,2790,1810,2240,2190,2380,2910,2230,3260,2160,2710,1940];
 for(let i=1;i<=55;i++){
  if([8,9,18].includes(i))continue;
  meals.push({kind:"save_meal",date:shift(today,-i),mealType:i===1?"午餐":"虚构历史餐",...(i===1?{imageIds:[imageId]}:{}),items:[{kind:"food",name:i===1?"虚构牛腩煲":"虚构历史食物",quantity:"1",unit:"份",nutrition:n(i===1?"800":String(sharp[(i-1)%sharp.length])),sourceKind:"estimated"}]});
 }
 meals.push({kind:"save_meal",date,mealType:"晚餐",items:[{kind:"food",name:"虚构晚餐",quantity:"1",unit:"份",nutrition:n("1250"),sourceKind:"estimated"}]});
 await saveMeals(meals);
 const currentEnergy=await readEnergySnapshot(db,userId),energies=[];
 for(let i=1;i<30;i++){if([5,6,21].includes(i))continue;const d=shift(today,-i),prior=currentEnergy.days.find(row=>row.date===d&&!row.deletedAt);energies.push({kind:"save_energy_day",...(prior?{id:prior.id,version:prior.version}:{}),date:d,entryMode:"total",totalKcal:i===1?"2200":String(i===12?4100:2300+Math.round(Math.sin(i)*350))});}
 await saveEnergy(energies);
 for(let i=-29;i<-8;i++){if(i===-19)continue;await saveMeasurementDay(db,{userId,actorId:userId},{operationId:randomUUID(),date:shift(today,i),timezone:"Asia/Shanghai",periods:{daytime:{weightKg:String(Math.round((70+Math.sin(i*.6)*.5)*100)/100),bodyFatPercent:null,fasting:true,deviceLabel:"虚构秤"}}});}
 const mark=async d=>{const group=dailyTotals((await readMealSnapshot(db,userId)).meals).find(group=>group.date===d);const {source,...day}=group.day;void source;await setMealDayStatus(db,userId,{...day,operationId:randomUUID(),status:"complete"});};
 for(const group of dailyTotals((await readMealSnapshot(db,userId)).meals).filter(group=>group.date>=shift(today,-30)))await mark(group.date);
 await context.route("**/api/meal-images/**",async route=>{requests.push(new URL(route.request().url()).pathname);await route.fulfill({status:200,contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==","base64")});});
 if(process.env.FORMWARD_OVERVIEW_ONLY==="1")return;
 const dialog=()=>page.locator("dialog[open]:not(.page-loading-dialog)").last();
 const close=async()=>{const accept=prompt=>prompt.accept();page.once("dialog",accept);try{await dialog().getByRole("button",{name:/^关闭/}).click();await page.locator("dialog[open]:not(.page-loading-dialog)").waitFor({state:"hidden"});}finally{page.off("dialog",accept);}};
 const screenshot=async name=>{await page.waitForTimeout(550);await page.screenshot({path:artifacts+"/"+name+".png"});};
 // Actual mouse selection, fixed dates and leaving the plot.
 await page.setViewportSize({width:1440,height:900});await page.goto(baseURL+"/dashboard");
 const plot=page.getByRole("group",{name:"双层日期关联图",exact:true}),readout=page.getByLabel("日期对照",{exact:true});
 await plot.waitFor();await page.waitForFunction(()=>document.querySelector('[data-overview-date]')?.closest("svg")?.style.visibility!=="hidden");
 await page.getByRole("button",{name:"30D",exact:true}).click();
 const base=await readout.getAttribute("data-selected-date"),a=shift(today,-4),b=shift(today,-2);
 const mouseAt=async d=>{const rect=page.locator('[data-overview-date="'+d+'"]>rect').first(),box=await rect.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+30);};
 await mouseAt(a);assert.equal(await readout.getAttribute("data-selected-date"),a);
 await page.mouse.move(10,10);assert.equal(await readout.getAttribute("data-selected-date"),base);
 
 // Click the real date hit rectangle at its energy row rather than a label's broad SVG bounds.
 const clickDate=async d=>{const box=await page.locator('[data-overview-date="'+d+'"]>rect').first().boundingBox();await page.mouse.click(box.x+box.width/2,box.y+30);};
 await clickDate(a);await mouseAt(b);assert.equal(await readout.getAttribute("data-selected-date"),a);assert.equal(await page.locator("[data-pinned-date]").getAttribute("data-pinned-date"),a);
 await clickDate(b);await page.mouse.move(10,10);assert.equal(await readout.getAttribute("data-selected-date"),b);
 await page.locator('[data-overview-date="'+b+'"]').focus();await page.keyboard.press("Escape");assert.equal(await page.locator("[data-pinned-date]").count(),0);
 await clickDate(date);await page.getByRole("button",{name:"查看记录 →",exact:true}).click();await dialog().waitFor();
 assert.equal(await dialog().evaluate(node=>node.scrollHeight<=node.clientHeight+1),true,"两餐默认详情无纵向滚动");
 assert.equal(requests.length,0,"关闭的餐次详情不请求原图");assert.equal(await dialog().locator("table").count(),0);
 assert.match(await dialog().innerText(),/2 餐/);await screenshot("overview-details-1440");
 const loaded=page.waitForResponse(response=>response.url().includes("/api/meal-images/"+imageId));await dialog().locator("summary").filter({hasText:"午餐"}).click();await dialog().locator("img").first().scrollIntoViewIfNeeded();await loaded;assert.ok(requests.length>0);
 await close();
 for(const width of [1440,1100,430,390,320]){await page.setViewportSize({width,height:width<700?700:900});await page.goto(baseURL+"/dashboard");await plot.waitFor();await screenshot("overview-"+width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 // Latest intake, recent days and the recorded-date history pagination.
 await page.setViewportSize({width:1440,height:900});await page.goto(baseURL+"/dashboard/meals");
 await page.getByRole("button",{name:"记录一餐",exact:false}).waitFor();
 assert.equal(await page.locator("time[datetime='"+date+"']").count()>0,true);
 await page.getByRole("button",{name:"查看全部 →",exact:true}).click();await dialog().waitFor();assert.match(await dialog().innerText(),/第 1 页/);
 await dialog().getByRole("button",{name:"下一页",exact:true}).click();assert.match(await dialog().innerText(),/第 2 页/);await close();
 await page.getByRole("button",{name:"记录一餐",exact:false}).click();await dialog().waitFor();
 await dialog().getByLabel("自由填写食物名称",{exact:true}).fill("虚构一个半鸡蛋");
 await dialog().getByLabel("数量 1",{exact:true}).fill("1.5");await dialog().getByLabel("本次热量 1",{exact:true}).fill("135");
 await dialog().getByLabel("本次蛋白质 1",{exact:true}).fill("8");await dialog().getByLabel("本次碳水 1",{exact:true}).fill("0");await dialog().getByLabel("本次脂肪 1",{exact:true}).fill("6");
 assert.match(await dialog().getByLabel("本餐合计",{exact:true}).innerText(),/135/);
 const border=await dialog().getByLabel("餐次备注",{exact:true}).evaluate(node=>getComputedStyle(node).borderTopColor);assert.notEqual(border,"rgba(0, 0, 0, 0)");
 await screenshot("meal-editor-1440");
 await dialog().getByRole("button",{name:"保存餐次 · "+today,exact:true}).click();await page.locator("dialog[open]:not(.page-loading-dialog)").waitFor({state:"hidden"});
 let latest=(await readMealSnapshot(db,userId)).meals.find(row=>row.date===today);assert.equal(Number(latest.totals.values.caloriesKcal),135);
 // Packaging defaults to a count, not a guessed weight.
 await page.getByRole("button",{name:"记录一餐",exact:false}).click();await dialog().getByRole("button",{name:"选择 "+foodName,exact:true}).click();
 assert.equal(await dialog().getByLabel("数量 1",{exact:true}).inputValue(),"1");await dialog().getByLabel("数量 1",{exact:true}).fill("0.5");
 assert.match(await dialog().getByLabel("本餐合计",{exact:true}).innerText(),/50/);
 for(const width of [390,320]){await page.setViewportSize({width,height:700});await screenshot("meal-editor-"+width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await dialog().getByRole("button",{name:"保存餐次 · "+today,exact:true}).click();await page.locator("dialog[open]:not(.page-loading-dialog)").waitFor({state:"hidden"});
 assert.ok((await readMealSnapshot(db,userId)).meals.some(row=>row.date===today&&Number(row.totals.values.caloriesKcal)===50));
 // Total and details coexist; changing the adopted total requires another explicit relation.
 await page.setViewportSize({width:1440,height:900});await page.goto(baseURL+"/dashboard/energy");
 assert.equal(await page.getByText("静息公式与资料",{exact:true}).count(),0);
 const editEnergy=async d=>{await page.locator('[data-energy-day="'+d+'"]').getByRole("button",{name:/^(录入|补录|编辑)$/}).click();await dialog().waitFor();};
 await editEnergy(date);await dialog().getByRole("button",{name:"＋ 添加运动",exact:true}).click();await dialog().getByLabel("运动名称 1",{exact:true}).fill("虚构跑步");await dialog().getByLabel("运动热量 · kcal 1",{exact:true}).fill("300");
 assert.equal(await dialog().getByRole("button",{name:"保存 · "+date,exact:true}).isDisabled(),true);
 await dialog().getByRole("group",{name:"运动 1 包含关系",exact:true}).getByRole("button",{name:"已包含",exact:true}).click();
 await dialog().getByRole("button",{name:"保存 · "+date,exact:true}).click();await page.locator("dialog[open]:not(.page-loading-dialog)").waitFor({state:"hidden"});
 let energy=(await readEnergySnapshot(db,userId));assert.equal(energy.activities.find(row=>row.date===date).inclusion,"included");
 await editEnergy(date);await dialog().getByRole("button",{name:"分开记录",exact:true}).click();await dialog().getByRole("button",{name:"记合计",exact:true}).click();await dialog().getByLabel("静息 · kcal",{exact:true}).fill("1800");await dialog().getByLabel("活动合计 · kcal",{exact:true}).fill("400");
 assert.equal(await dialog().getByRole("button",{name:"保存 · "+date,exact:true}).isDisabled(),true);
 await dialog().getByRole("group",{name:"运动 1 包含关系",exact:true}).getByRole("button",{name:"额外增加",exact:true}).click();
 assert.match(await dialog().locator('div[aria-live="polite"]').innerText(),/2,500/);await screenshot("energy-relations-1440");
 await dialog().getByRole("button",{name:"保存 · "+date,exact:true}).click();await page.locator("dialog[open]:not(.page-loading-dialog)").waitFor({state:"hidden"});
 await editEnergy(date);await dialog().getByLabel("活动合计 · kcal",{exact:true}).fill("500");assert.equal(await dialog().getByRole("button",{name:"保存 · "+date,exact:true}).isDisabled(),true);
 await dialog().getByRole("group",{name:"运动 1 包含关系",exact:true}).getByRole("button",{name:"已包含",exact:true}).click();await dialog().getByRole("button",{name:"保存 · "+date,exact:true}).click();await page.locator("dialog[open]:not(.page-loading-dialog)").waitFor({state:"hidden"});
 const post=async items=>{const response=await context.request.post(baseURL+"/api/v1/record-operations",{headers,data:{operationId:randomUUID(),items}});assert.equal(response.status(),200);return response.json();};
 // A normal two-item photo meal has one save action and no acknowledgement checklist.
 const aiDate=shift(today,-60),photoMeal=await post([{key:"meal",kind:"save_meal",date:aiDate,mealType:"lunch",expectedImageCount:2,photoReview:{dateConfirmed:false,mealTypeConfirmed:false,identityConfirmed:false,amountConfirmed:false,cookingConfirmed:false,questions:[]},items:[{kind:"food",name:"虚构长名称食物甲，包含足够文字验证手机换行",quantity:"1",unit:"份",nutrition:n("650"),sourceKind:"estimated"},{kind:"food",name:"虚构食物乙",quantity:"1",unit:"份",nutrition:n("230"),sourceKind:"estimated"}]}]);
 for(const width of [1440,430,390,320]){await page.setViewportSize({width,height:width<700?640:900});await page.goto(photoMeal.confirmationUrl);await page.getByRole("button",{name:"确认保存",exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"标记已核对",exact:true}).count(),0);assert.equal(await page.getByRole("checkbox").count(),0);assert.equal(await page.getByRole("button",{name:"确认保存",exact:true}).isEnabled(),true);assert.match(await page.getByLabel("本餐合计",{exact:true}).innerText(),/880/);for(const locator of [page.getByLabel("本餐合计",{exact:true}),page.getByText("虚构长名称食物甲，包含足够文字验证手机换行",{exact:true}),page.getByText("虚构食物乙",{exact:true}),page.getByRole("button",{name:"确认保存",exact:true})]){const box=await locator.boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=(width<700?640:900),"首屏包含合计、前两项及保存");}
 await screenshot("review-"+width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.setViewportSize({width:320,height:560});await page.goto(photoMeal.confirmationUrl);await page.getByRole("button",{name:"确认保存",exact:true}).waitFor();
 const saveBox=await page.getByRole("button",{name:"确认保存",exact:true}).boundingBox();assert.ok(saveBox&&saveBox.y+saveBox.height<=560);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await screenshot("review-short-320");
 await page.getByRole("button",{name:"确认保存",exact:true}).click();await page.waitForURL(baseURL+"/dashboard");
 // Opposite entry order uses independent review rows and a choice beside the affected exercise.
 const activityDate=shift(today,-61),first=await post([{key:"run",kind:"save_activity",date:activityDate,name:"虚构先录运动",caloriesKcal:"300"}]);await page.goto(first.confirmationUrl);await page.getByRole("button",{name:"确认保存",exact:true}).click();await page.waitForURL(baseURL+"/dashboard");
 const combined=await post([{key:"total",kind:"save_energy_day",date:activityDate,entryMode:"total",totalKcal:"600"}]);await page.goto(combined.confirmationUrl);
 assert.equal(await page.getByRole("button",{name:"确认保存",exact:true}).isDisabled(),true);await page.getByRole("button",{name:"已包含，不再增加",exact:true}).click();
 await page.getByRole("button",{name:"确认保存",exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('button[class*="save"]')?.disabled);
 await screenshot("review-inclusion-320");await page.getByRole("button",{name:"确认保存",exact:true}).click();await page.waitForURL(baseURL+"/dashboard");
 const denied=await context.request.post(baseURL+"/api/v1/record-operations",{headers,data:{operationId:randomUUID(),items:[{key:"delete",kind:"delete_meal",id:randomUUID(),version:1}]}});assert.equal(denied.status(),403);
 await page.emulateMedia({reducedMotion:"reduce"});await page.goto(baseURL+"/dashboard");await plot.waitFor();await page.waitForTimeout(100);assert.equal(await plot.evaluate(node=>node.getAnimations({subtree:true}).filter(animation=>animation.playState==="running").length),0);
 assert.deepEqual(errors,[]);await writeFile(artifacts+"/report.json",JSON.stringify({passed:true,viewports:[1440,1100,430,390,320],clientErrors:errors,mousePinning:true,compactDetails:true,lazyImages:true,portions:true,packageConversion:true,energyInclusion:true,oneSaveReview:true},null,2));
 console.log("维护调整实际网页通过：固定/解除选日、折叠详情、延后原图、最新摄入、分页、每份营养/包装、消耗包含关系、一次审核、五种宽度及减少动态效果。");
}
