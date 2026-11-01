import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {and,eq} from "drizzle-orm";
import {measurement} from "../src/db/schema.ts";
import {submitEnergyOperation,decideEnergyOperation,readEnergySnapshot} from "../src/features/activities/records.ts";
import {saveMeasurementDay} from "../src/features/measurements/editing.ts";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";

const energyA="虚构来源A · Garmin手表",energyB="虚构来源B · 手工记录";
const bodyA="虚构蓝牙秤",bodyB="虚构健身房秤";
export async function checkSourceInput({baseURL,context,page,db,userId,token,today,engine="chromium",artifacts=process.env.FORMWARD_SOURCE_INPUT_ARTIFACTS??".codex/source-input",includeFailure=true}){
 await mkdir(artifacts,{recursive:true});
 const actions=Array.from({length:14},(_,i)=>({kind:"save_energy_day",date:addCalendarDays(today,-i-1),entryMode:"components",activityMode:"total",restingKcal:"1900",activeKcal:"300",restingSourceSystem:i===0?energyA:i===1?energyB:"虚构历史设备"+String(i).padStart(2,"0"),activeSourceSystem:i===0?energyA:i===1?energyB:"虚构历史设备"+String(i).padStart(2,"0")}));
 const op=await submitEnergyOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions});assert.ok(op.canConfirm);await decideEnergyOperation(db,userId,op.id,op.revision,"confirm");
 for(const [i,label]of[bodyA,bodyB].entries())await saveMeasurementDay(db,{userId,actorId:userId},{operationId:randomUUID(),date:addCalendarDays(today,-i-1),timezone:"Asia/Shanghai",periods:{daytime:{weightKg:"70",bodyFatPercent:"18",fasting:true,deviceLabel:label}}});
 const errors=[],serverErrors=[],checks=[],expectedNavigationAborts=[];let navigating=false;
 function watch(p){p.setDefaultTimeout(18000);p.on("pageerror",e=>{if(navigating&&e.message.includes("?_rsc=")&&e.message.includes("due to access control checks.")&&e.stack?.includes("Fetch API cannot load "+baseURL+"/dashboard"))expectedNavigationAborts.push(e.message);else errors.push(e.message);});p.on("response",r=>{if(r.status()>=500)serverErrors.push(r.status()+" "+new URL(r.url()).pathname);});}
 watch(page);
 const modal=p=>p.locator('dialog[open]:not([aria-label="加载中"])').last();
 async function go(p,path){await p.waitForLoadState("networkidle");navigating=true;try{await p.goto(baseURL+path);}finally{navigating=false;}await p.waitForLoadState("networkidle");}
 async function open(p,kind){
  await go(p,kind==="energy"?"/dashboard/energy":"/dashboard/measurements");
  const row=p.locator('[data-record-date="'+today+'"]');
  await row.getByRole("button",{name:kind==="energy"?/^(录入|补录|编辑)$/:new RegExp("^(录入|补录|编辑) "+today+"$")}).click();
  await modal(p).locator("form").waitFor();await p.waitForTimeout(360);
 }
 async function close(p){
  await modal(p).getByRole("button",{name:/^关闭(编辑|记录详情)$/}).first().click();
  const discard=p.getByRole("dialog",{name:"放弃尚未保存的输入？",exact:true});
  if(await discard.isVisible())await discard.getByRole("button",{name:"放弃修改",exact:true}).click();
  await p.waitForFunction(()=>!document.querySelector("dialog[open]"));
 }
 async function pick(p,label,value,{touch=false,blur=false}={}){
  const source=modal(p).getByRole("combobox",{name:label,exact:true});await source.fill("");
  if(touch)await source.tap();else await source.click();
  const option=modal(p).getByRole("gridcell",{name:value,exact:true});
  if(blur)await option.evaluate(n=>n.addEventListener("pointerdown",()=>n.closest('[class*="sourceInput"]').querySelector("input").blur(),{once:true}));
  if(touch)await option.tap();else await option.click();
  assert.equal(await source.inputValue(),value,"历史选择必须真正写入草稿");
  assert.equal(await source.getAttribute("aria-expanded"),"false");
  return source;
 }
 async function caseFor(p,kind,touch,suffix){
  await open(p,kind);const label=kind==="energy"?"静息来源":"晨间数据来源",value=kind==="energy"?energyA:bodyA;
  const source=await pick(p,label,value,{touch});
  await pick(p,label,value,{touch,blur:true});
  for(let i=0;i<3;i++)await pick(p,label,value,{touch});
  if(touch&&suffix==="390x720"){
   await source.fill("");await source.tap();
   const grid=modal(p).getByRole("grid",{name:label+"历史建议",exact:true});
   if(kind==="energy"){
    await grid.scrollIntoViewIfNeeded();const box=await grid.boundingBox();assert.ok(box);
    if(engine==="chromium"){
     const session=await p.context().newCDPSession(p),x=box.x+box.width/2,y=box.y+box.height-20;
     await session.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
     for(let i=1;i<=8;i++){await session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:y-i*12}]});await p.waitForTimeout(18);}
     await session.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await session.detach();await p.waitForTimeout(200);
    }else await grid.evaluate(n=>n.scrollTop=100);
    assert.equal(await source.inputValue(),"");assert.ok(await grid.evaluate(n=>n.scrollTop)>0,"滚动历史不会误选");
    await grid.evaluate(n=>n.scrollTop=0);
   }
   await p.screenshot({path:artifacts+"/"+engine+"-"+kind+"-history-open.png"});
   await pick(p,label,value,{touch});
   await source.fill("");await source.tap();await p.setViewportSize({width:390,height:480});
   await modal(p).getByRole("gridcell",{name:value,exact:true}).tap();assert.equal(await source.inputValue(),value);
   await p.setViewportSize({width:390,height:720});
   checks.push({kind,historyScroll:kind==="energy"?(engine==="chromium"?"native-touch":"programmatic"):"not-applicable",visibleHeightChanged:true});
  }
  await source.fill("虚构");await source.press("ArrowDown");const active=await source.getAttribute("aria-activedescendant");
  await source.dispatchEvent("keydown",{key:"Enter",code:"Enter",isComposing:true,keyCode:229,bubbles:true});
  assert.equal(await source.inputValue(),"虚构");assert.equal(await source.getAttribute("aria-activedescendant"),active);
  await source.press("Escape");assert.equal(await modal(p).count(),1);assert.equal(await source.getAttribute("aria-expanded"),"false");
  await source.fill("保留自由输入");if(touch)await source.tap();else await source.click();
  await modal(p).locator("h2").first().click();assert.equal(await source.getAttribute("aria-expanded"),"false");assert.equal(await source.inputValue(),"保留自由输入");
  await source.focus();await source.press("Shift+Tab");await p.waitForTimeout(40);assert.equal(await source.getAttribute("aria-expanded"),"false");
  await source.fill(value);await source.press("ArrowDown");await source.press("Enter");assert.equal(await source.inputValue(),value);
  await source.evaluate(n=>n.scrollIntoView({block:"end"}));await p.waitForTimeout(60);
  const inputBox=await source.boundingBox(),view=p.viewportSize();assert.ok(inputBox&&view&&inputBox.y>=0&&inputBox.y+inputBox.height<=view.height+1,"已选择的来源可完整滚动查看");
  await p.screenshot({path:artifacts+"/"+engine+"-"+kind+"-"+suffix+".png"});
  checks.push({kind,suffix,touch,naturalTap:true,nullBlurBeforeClick:true,repeatedSelection:true,ime:true,escape:true,outside:true,keyboard:true});
  await close(p);
 }
 try{
  for(const width of[1100,1440]){await page.setViewportSize({width,height:900});for(const kind of["energy","body"])await caseFor(page,kind,false,String(width));}
  for(const [width,height]of[[320,560],[390,720],[430,780],[844,390]]){
   const mobile=await context.browser().newContext({storageState:await context.storageState(),locale:"zh-CN",timezoneId:"Asia/Shanghai",viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:"reduce"});
   try{const p=await mobile.newPage();watch(p);for(const kind of["energy","body"])await caseFor(p,kind,true,width+"x"+height);}finally{await mobile.close();}
  }
  // A chosen value must reach the actual save, not only the visible input.
  await page.setViewportSize({width:390,height:720});await open(page,"energy");
  await modal(page).getByRole("spinbutton",{name:"静息 · kcal",exact:true}).fill("1900");
  await modal(page).getByRole("spinbutton",{name:"活动合计 · kcal",exact:true}).fill("300");
  await pick(page,"静息来源",energyA);await pick(page,"活动来源",energyB);
  await modal(page).getByRole("button",{name:"保存 · "+today,exact:true}).click();await page.waitForFunction(()=>!document.querySelector("dialog[open]"));
  const savedEnergy=(await readEnergySnapshot(db,userId)).days.find(d=>d.date===today&&!d.deletedAt);
  assert.equal(savedEnergy.restingSourceSystem,energyA);assert.equal(savedEnergy.activeSourceSystem,energyB);checks.push({energySaved:true});
  await open(page,"body");await modal(page).getByRole("spinbutton",{name:"晨间体重",exact:true}).fill("70");
  await pick(page,"晨间数据来源",bodyA);
  await modal(page).getByRole("button",{name:"保存录入",exact:true}).click();await modal(page).getByRole("status").waitFor();
  const bodyRows=()=>db.select().from(measurement).where(and(eq(measurement.userId,userId),eq(measurement.recordDate,today)));
  assert.ok((await bodyRows()).some(r=>!r.deletedAt&&r.deviceLabel===bodyA));checks.push({bodySaved:true});await close(page);
  // The same component in both AI edit dialogs still needs final web confirmation.
  const aiDate=addCalendarDays(today,-35),response=await context.request.post(baseURL+"/api/v1/record-operations",{headers:{Authorization:"Bearer "+token},data:{operationId:randomUUID(),items:[{key:"body-source",kind:"save_record",date:aiDate,period:"daytime",weightKg:"70",fasting:true,deviceLabel:"虚构AI原来源"},{key:"energy-source",kind:"save_energy_day",date:aiDate,entryMode:"total",totalKcal:"2400",sourceSystem:"虚构AI原来源"}]}});
  assert.equal(response.status(),200);const preview=await response.json();await go(page,new URL(preview.confirmationUrl).pathname);
  for(const [key,label,value]of[["body-source","测量来源",bodyA],["energy-source","总消耗来源",energyA]]){
   await page.locator('[data-review-key="'+key+'"]').getByRole("button",{name:"修改",exact:true}).click();
   await pick(page,label,value,{blur:true});await modal(page).getByRole("button",{name:"应用修改",exact:true}).click();await page.waitForFunction(()=>!document.querySelector("dialog[open]"));
  }
  assert.equal((await readEnergySnapshot(db,userId)).days.some(d=>d.date===aiDate),false);
  await page.getByRole("button",{name:"确认保存",exact:true}).click();await page.getByRole("heading",{name:"已保存",exact:true}).waitFor();
  assert.equal((await readEnergySnapshot(db,userId)).days.find(d=>d.date===aiDate).sourceSystem,energyA);
  const aiBody=await db.select().from(measurement).where(and(eq(measurement.userId,userId),eq(measurement.recordDate,aiDate)));assert.ok(aiBody.some(r=>!r.deletedAt&&r.deviceLabel===bodyA));checks.push({aiBodyAndEnergySaved:true});
  // Failed removal preserves both the suggestion and the current input; a successful removal does not edit a saved record.
  await open(page,"energy");const source=modal(page).getByRole("combobox",{name:"静息来源",exact:true});await source.click();
  if(includeFailure){
   const route="**/dashboard/energy*";await page.route(route,r=>r.request().method()==="POST"?r.abort("failed"):r.continue());
   await modal(page).getByRole("button",{name:"移除来源建议 "+energyB,exact:true}).click();
   await modal(page).getByRole("alert").filter({hasText:/移除未完成|移除.*失败|未能|重试/}).waitFor();await page.unroute(route);
   assert.equal(await source.inputValue(),energyA);await source.click();assert.equal(await modal(page).getByRole("button",{name:"移除来源建议 "+energyB,exact:true}).count(),1);
   checks.push({failedRemovalPreserved:true});
  }
  await source.click();await modal(page).getByRole("button",{name:"移除来源建议 "+energyB,exact:true}).click();
  await page.waitForFunction(label=>![...document.querySelectorAll('[aria-label^="移除来源建议"]')].some(n=>n.getAttribute("aria-label")==="移除来源建议 "+label),energyB);
  assert.equal(await source.inputValue(),energyA);assert.equal((await readEnergySnapshot(db,userId)).days.find(d=>d.date===today).activeSourceSystem,energyB);
  checks.push({removedSuggestionOnly:true});await close(page);
  assert.deepEqual(errors,[]);assert.deepEqual(serverErrors,[]);
  await writeFile(artifacts+"/"+engine+"-report.json",JSON.stringify({passed:true,checks,errors,serverErrors,expectedNavigationAborts},null,2));
  console.log(engine+"：来源触屏、失焦顺序、键盘、身体／消耗保存及AI确认通过。");return expectedNavigationAborts;
 }catch(e){await page.screenshot({path:artifacts+"/"+engine+"-failure.png"}).catch(()=>{});await writeFile(artifacts+"/"+engine+"-failure.json",JSON.stringify({error:String(e),stack:e.stack,checks,errors,serverErrors},null,2));throw e;}
}
