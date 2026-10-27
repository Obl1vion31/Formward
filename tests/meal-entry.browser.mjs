import {formatRecordNumber} from "../src/components/number-format.ts";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {submitMealOperation,decideMealOperation,readMealSnapshot} from "../src/features/meals/records.ts";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";
const nutrition=(caloriesKcal,proteinG="0",carbsG=null,fatG="0.1234")=>({caloriesKcal,proteinG,carbsG,fatG});
export async function checkMealEntry({baseURL,context,page,db,userId,token,today,engine="chromium",artifacts=".codex/meal-total-visual"}){
 await mkdir(artifacts,{recursive:true});
 if(process.env.FORMWARD_POPOVER_DEBUG)await page.addInitScript(()=>{const original=HTMLElement.prototype.hidePopover;HTMLElement.prototype.hidePopover=function(...args){const b=[...document.querySelectorAll("[popovertarget]")].find(n=>n.getAttribute("popovertarget")===this.id),r=b?.getBoundingClientRect();this.dataset.hideTrace=JSON.stringify({stack:new Error().stack,button:r?{x:r.x,y:r.y,right:r.right,bottom:r.bottom}:null,width:innerWidth,height:innerHeight});return original.apply(this,args);};});page.setDefaultTimeout(25000);const errors=[],errorDetails=[],failedRequests=[];page.on("requestfailed",r=>failedRequests.push({url:r.url(),error:r.failure()?.errorText}));page.on("pageerror",e=>{errors.push(e.message);errorDetails.push({url:page.url(),message:e.message,stack:e.stack});});
 try{
 const oldDate=addCalendarDays(today,-2),name="虚构旧按份记录";
 const op=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[
  {kind:"save_food",name:"Chicken Breast Herbs 香草鸡胸肉 · 虚构包装食材",baseQuantity:"90",unit:"g",servingQuantity:"90",servingUnit:"包",basis:"虚构包装标签；1包90g。"+("用于检查长营养依据在气泡内部滚动，避免撑高记录行。".repeat(14)),sourceKind:"estimated",nutrition:nutrition("180","18","10","5")},
  {kind:"save_food",name:"虚构按克食材",baseQuantity:"100",unit:"g",sourceKind:"estimated",nutrition:nutrition("110","20","0","3")},
  {kind:"save_meal",date:oldDate,mealType:name,items:[{kind:"food",name:"虚构旧自由项",quantity:"1.5",unit:"个",nutritionBasis:"per_portion",perPortionNutrition:nutrition("90"),sourceKind:"estimated"}]}
 ]});assert.ok(op.canConfirm);await decideMealOperation(db,userId,op.id,op.revision,"confirm");
 const modal=()=>page.locator("dialog[open]").last(),form=()=>modal().locator("form");
 async function openNew(){await page.waitForLoadState("networkidle");await page.goto(baseURL+"/dashboard/meals");await page.waitForLoadState("networkidle");await page.locator('[data-record-date="'+today+'"]').getByRole("button",{name:/^(录入|添加一餐)$/}).click();await modal().getByRole("heading",{name:"记录一餐",exact:true}).waitFor();await page.evaluate(async()=>{await document.fonts.ready;});}
 async function fillFree(){await form().getByLabel("自由填写食物名称",{exact:true}).fill("虚构鸡胸肉本次总量");await form().getByLabel("单位 1",{exact:true}).fill("g");await form().getByLabel("数量 1",{exact:true}).fill("150");for(const [field,value]of[["热量","240"],["蛋白质","30"],["碳水","12"],["脂肪","8"]])await form().getByLabel("本次"+field+" 1",{exact:true}).fill(value);}
 async function total(value){assert.match((await form().getByLabel("本餐合计",{exact:true}).innerText()).replaceAll(",",""),new RegExp(String(value)));}
 async function closeEditor(dirty=false){await modal().getByRole("button",{name:"关闭编辑",exact:true}).click();if(dirty)await page.getByRole("dialog",{name:"放弃尚未保存的输入？",exact:true}).getByRole("button",{name:"放弃修改",exact:true}).click();await page.locator("dialog[open]").filter({has:page.getByRole("heading",{name:/^(记录一餐|编辑餐次)$/})}).waitFor({state:"hidden"});}
 const cases=[],details=[];
 async function geometry(){
  const result=await form().locator("table").evaluate(table=>{
   const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d"),heads=[...table.querySelectorAll("th")],rows=[...table.querySelectorAll("tbody tr")];
   const values=rows.flatMap((row,rowIndex)=>[...row.querySelectorAll("td")].slice(0,7).flatMap((cell,col)=>{
    const field=cell.querySelector("input,select,span[class*=\"calculated\"]"),name=cell.querySelector("strong");
    const node=field??name;if(!node)return[];const b=node.getBoundingClientRect(),s=getComputedStyle(node);ctx.font=s.font;
    const text=node.tagName==="SELECT"?node.selectedOptions[0]?.textContent:node.tagName==="INPUT"?node.value:node.textContent;
    const reserve=node.tagName==="SELECT"?22:col===1&&node.tagName==="INPUT"?0:0;
    const available=b.width-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)-parseFloat(s.borderLeftWidth)-parseFloat(s.borderRightWidth)-reserve;
    let axis=null;
    if(table.dataset.layout==="table"){
     const h=heads[col],hb=h.getBoundingClientRect(),hs=getComputedStyle(h);
     if(col===1)axis=Math.abs((b.left+parseFloat(s.paddingLeft)+parseFloat(s.borderLeftWidth))-(hb.left+parseFloat(hs.paddingLeft)));
     else if(col>=2)axis=Math.abs((b.right-parseFloat(s.paddingRight)-parseFloat(s.borderRightWidth))-(hb.right-parseFloat(hs.paddingRight)));
    }
    return[{row:rowIndex,col,font:parseFloat(s.fontSize),height:b.height,available,textWidth:ctx.measureText(text??"").width,axis,control:!!field,fullText:col===1||col>=2}];
   }));
   return{layout:table.dataset.layout,values,rows:rows.map(r=>r.getBoundingClientRect().height),overflow:table.getBoundingClientRect().right>innerWidth};
  });
  assert.equal(result.overflow,false);
  for(const v of result.values){assert.equal(v.font,16);if(v.control)assert.ok(v.height>=44);if(v.fullText)assert.ok(v.textWidth<=v.available+1,"text clipped "+JSON.stringify(v));if(v.axis!==null)assert.ok(v.axis<=1.1,"value/header axis "+JSON.stringify(v));}
  assert.equal(await form().locator('tbody tr').nth(1).locator("small").count(),0);
  if(result.layout==="table"){assert.ok(result.rows[1]<=result.rows[0]+24,"packaged row adds empty height");}
  return result;
 }
 async function inspectDetails(rowIndex,width,suffix){
  const trigger=form().locator("tbody tr").nth(rowIndex).getByRole("button",{name:/详情$/});
  await trigger.scrollIntoViewIfNeeded();await trigger.click();
  const popup=page.locator("[popover]:popover-open");await popup.waitFor();await page.waitForTimeout(80);
  const rect=await popup.evaluate(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight};});
  const a=await trigger.boundingBox(),dialog=await modal().boundingBox();const gap=Math.min(Math.abs(rect.y-(a.y+a.height)),Math.abs(rect.bottom-a.y));
  assert.ok(rect.x>=dialog.x+7&&rect.right<=Math.min(width,dialog.x+dialog.width)-7);
  assert.ok(rect.y>=dialog.y+7&&rect.bottom<=page.viewportSize().height-7);assert.ok(gap<=9,"popup not adjacent");
  await page.screenshot({path:artifacts+"/"+engine+"-detail-"+width+"-"+suffix+".png"});
  if(width===1440){
   const viewport=page.viewportSize();await page.setViewportSize({width:1100,height:viewport.height});await page.waitForTimeout(120);
   assert.equal(await popup.count(),1,await trigger.evaluate(b=>{const n=document.getElementById(b.getAttribute("popovertarget"));return JSON.stringify({trace:n?.dataset.hideTrace,connected:n?.isConnected,style:n?.getAttribute("style")});}));
   await page.waitForFunction(({id,height})=>{const node=document.getElementById(id);if(!node?.matches(":popover-open"))return false;const b=node.getBoundingClientRect();return b.left>=7&&b.right<=1093&&b.top>=7&&b.bottom<=height-7;},{id:await trigger.getAttribute("popovertarget"),height:viewport.height},{timeout:2500});
   await page.setViewportSize(viewport);await page.waitForTimeout(100);
  }
  await page.keyboard.press("Escape");assert.equal(await popup.count(),0);assert.equal(await trigger.evaluate(n=>n===document.activeElement),true);await form().waitFor();
  await trigger.click();await popup.waitFor();await form().getByLabel("餐次", {exact:true}).click();assert.equal(await popup.count(),0);
  await trigger.scrollIntoViewIfNeeded();await trigger.click();await popup.waitFor();
  await modal().evaluate(n=>{n.scrollTop=n.scrollHeight;});await page.waitForTimeout(120);
  const anchorRect=await trigger.boundingBox();if(anchorRect&&anchorRect.y+anchorRect.height<=8)await page.waitForFunction(()=>document.querySelectorAll("[popover]:popover-open").length===0,{},{timeout:2500});
  if(await popup.count())await page.keyboard.press("Escape");
  details.push({width,suffix,rect,gap,status:"PASS"});
 }

 for(const [width,height]of[[1440,1050],[1100,1000],[430,844],[390,844],[320,740]]){
  await page.setViewportSize({width,height});await openNew();await fillFree();await total(240);
  await form().getByLabel("数量 1",{exact:true}).fill("200");await total(240);await form().getByLabel("数量 1",{exact:true}).fill("150");
  assert.equal(await form().getByText("每份营养",{exact:true}).count(),0);
  const row=form().locator("tbody tr").first();
  const boxes=await row.locator("input").evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {top:r.top,bottom:r.bottom,height:r.height,leftPadding:parseFloat(s.paddingLeft),rightPadding:parseFloat(s.paddingRight)};}));
  assert.ok(boxes.every(b=>b.height>=43.9&&b.leftPadding>=10&&b.rightPadding>=10));
  if(await form().locator("table").getAttribute("data-layout")==="table"){assert.ok(Math.max(...boxes.map(b=>b.top))-Math.min(...boxes.map(b=>b.top))<1);assert.equal(await form().locator("thead th").count(),8);}
  const labelGap=await form().locator('label').filter({has:page.getByLabel("餐次",{exact:true})}).evaluate(label=>{const input=label.querySelector("input");const range=document.createRange();range.selectNode(label.firstChild);return input.getBoundingClientRect().top-range.getBoundingClientRect().bottom;});assert.ok(labelGap>=8);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await row.scrollIntoViewIfNeeded();await page.screenshot({path:artifacts+"/"+engine+"-entry-"+width+".png"});cases.push({width,height,status:"PASS",inputHeight:boxes[0].height,labelGap});
  // Packaging and metric-library rows keep automatic calculation and an independent unit column.
  if(await form().getByRole("button",{name:"选择食材库",exact:true}).isVisible())await form().getByRole("button",{name:"选择食材库",exact:true}).click();
  await form().getByRole("button",{name:"选择 Chicken Breast Herbs 香草鸡胸肉 · 虚构包装食材",exact:true}).click();await form().getByLabel("数量 2",{exact:true}).fill("0.5");await total(330);
  await geometry();await inspectDetails(1,width,"package");await form().getByLabel("单位 2",{exact:true}).selectOption("g");assert.equal(Number(await form().getByLabel("数量 2",{exact:true}).inputValue()),45);await total(330);
  if(await form().getByRole("button",{name:"选择食材库",exact:true}).isVisible())await form().getByRole("button",{name:"选择食材库",exact:true}).click();
  await form().getByRole("button",{name:"选择 虚构按克食材",exact:true}).click();await form().getByLabel("数量 3",{exact:true}).fill("150");await total(495);
  const measured=await geometry();cases.at(-1).geometry=measured;await inspectDetails(0,width,"free");
  await form().getByLabel("餐次备注",{exact:true}).fill("虚构备注，用于检查标签与边框间距");
  const padding=await form().getByLabel("餐次备注",{exact:true}).evaluate(n=>parseFloat(getComputedStyle(n).paddingLeft));assert.ok(padding>=10);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await row.scrollIntoViewIfNeeded();await page.screenshot({path:artifacts+"/"+engine+"-mixed-"+width+".png"});
  for(let index=0;index<3;index++){await form().locator("tbody tr").nth(index).scrollIntoViewIfNeeded();await page.screenshot({path:artifacts+"/"+engine+"-row-"+width+"-"+index+".png"});}
  // The complete unit glyph must fit before any focus/selection, including native datalist controls.
  for(const unit of ["份","包","g","mL"]){await form().getByLabel("单位 1",{exact:true}).fill(unit);await geometry();}
  await form().getByLabel("单位 1",{exact:true}).fill("g");
  await form().getByLabel("本次脂肪 1",{exact:true}).fill("12345.67");await geometry();
  await form().getByLabel("本次脂肪 1",{exact:true}).fill("8");
  await closeEditor(true);
 }
 // Boundary widths, short visual viewport, landscape and text scaling.
 for(const [width,height]of[[960,780],[961,780],[390,560],[844,390]]){
  await page.setViewportSize({width,height});await openNew();await fillFree();
  const measurement=await geometry();await inspectDetails(0,width,"edge");
  cases.push({width,height,status:"PASS",geometry:measurement});await closeEditor(true);
 }
 await page.setViewportSize({width:1100,height:900});await openNew();await fillFree();
 await page.addStyleTag({content:"table[aria-label='本餐食物表']{zoom:1.25}"});
 await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const zoomFits=await form().locator("table").evaluate(n=>n.getBoundingClientRect().right<=n.parentElement.getBoundingClientRect().right+1);assert.equal(zoomFits,true);await inspectDetails(0,1100,"zoom");await closeEditor(true);
 // Save a real form, then edit quantity without changing its recorded total.
 await page.setViewportSize({width:1440,height:1000});await openNew();await fillFree();await form().getByLabel("餐次",{exact:true}).fill("虚构总量保存");await form().getByRole("button",{name:"保存餐次 · "+today,exact:true}).click();await page.getByRole("heading",{name:"记录一餐",exact:true}).waitFor({state:"hidden"});
 const snapshot=async()=>{await page.waitForLoadState("networkidle");return readMealSnapshot(db,userId);};let saved=(await snapshot()).meals.find(m=>m.mealType==="虚构总量保存");assert.ok(saved);assert.equal(Number(saved.items[0].nutrition.caloriesKcal),240);assert.equal(saved.items[0].nutritionBasis,"consumed_total");
 async function editSaved(record){await page.waitForLoadState("networkidle");await page.goto(baseURL+"/dashboard/meals?date="+record.date);await page.waitForLoadState("networkidle");await modal().locator("summary").filter({hasText:record.items[0].name}).click();await modal().getByRole("button",{name:"编辑",exact:true}).click();await modal().getByRole("heading",{name:"编辑餐次",exact:true}).waitFor();}
 await editSaved(saved);await form().getByLabel("数量 1",{exact:true}).fill("200");await total(240);await form().getByRole("button",{name:"保存餐次 · "+today,exact:true}).click();await page.getByRole("heading",{name:"编辑餐次",exact:true}).waitFor({state:"hidden"});saved=(await snapshot()).meals.find(m=>m.id===saved.id);assert.equal(Number(saved.items[0].quantity),200);assert.equal(Number(saved.items[0].nutrition.caloriesKcal),240);
 // Old per-portion values are projected as totals; unmodified save preserves the old wire format.
 let old=(await snapshot()).meals.find(m=>m.mealType===name),before=structuredClone(old.items[0].nutrition);
 await editSaved(old);assert.equal(Number(await form().getByLabel("本次热量 1",{exact:true}).inputValue()),135);assert.equal(await form().getByLabel("本次脂肪 1",{exact:true}).inputValue(),formatRecordNumber(before.fatG));assert.equal(await form().getByLabel("本次碳水 1",{exact:true}).inputValue(),"");assert.equal(Number(await form().getByLabel("本次蛋白质 1",{exact:true}).inputValue()),0);
 await closeEditor();assert.equal((await snapshot()).meals.find(m=>m.id===old.id).version,old.version);
 await editSaved(old);await form().getByRole("button",{name:"保存餐次 · "+oldDate,exact:true}).click();await page.getByRole("heading",{name:"编辑餐次",exact:true}).waitFor({state:"hidden"});old=(await snapshot()).meals.find(m=>m.id===old.id);assert.deepEqual(old.items[0].nutrition,before);assert.equal(old.items[0].nutritionBasis,"per_portion");
 await editSaved(old);await form().getByLabel("数量 1",{exact:true}).fill("2");await total(135);await form().getByRole("button",{name:"保存餐次 · "+oldDate,exact:true}).click();await page.getByRole("heading",{name:"编辑餐次",exact:true}).waitFor({state:"hidden"});old=(await snapshot()).meals.find(m=>m.id===old.id);assert.deepEqual(old.items[0].nutrition,before);assert.equal(old.items[0].nutritionBasis,"consumed_total");
 // The AI preview's authoritative total flows through the same editor; updating is not a formal save.
 const aiDate=addCalendarDays(today,-3),response=await context.request.post(baseURL+"/api/v1/record-operations",{headers:{Authorization:"Bearer "+token},data:{operationId:randomUUID(),items:[{key:"meal",kind:"save_meal",date:aiDate,mealType:"虚构审核总量",items:[{kind:"food",name:"虚构审核按份项",quantity:"1.5",unit:"个",nutritionBasis:"per_portion",perPortionNutrition:nutrition("90"),sourceKind:"estimated"}]}]}});
 assert.equal(response.status(),200);const preview=await response.json();await page.waitForLoadState("networkidle");await page.goto(preview.confirmationUrl);await page.waitForLoadState("networkidle");await page.getByRole("button",{name:"修改",exact:true}).first().click();await form().getByLabel("本次热量 1",{exact:true}).waitFor();assert.equal(Number(await form().getByLabel("本次热量 1",{exact:true}).inputValue()),135);await form().getByLabel("数量 1",{exact:true}).fill("2");await total(135);await form().getByRole("button",{name:"应用修改",exact:true}).click();await page.getByRole("heading",{name:"修改待保存内容",exact:true}).waitFor({state:"hidden"});assert.equal((await snapshot()).meals.some(m=>m.mealType==="虚构审核总量"),false);await page.getByRole("button",{name:"确认保存",exact:true}).click();await page.getByRole("heading",{name:"已保存",exact:true}).waitFor();const ai=(await snapshot()).meals.find(m=>m.mealType==="虚构审核总量");assert.equal(Number(ai.items[0].nutrition.caloriesKcal),135);assert.equal(ai.items[0].nutritionBasis,"consumed_total");
 assert.deepEqual(errors,[]);await writeFile(artifacts+"/"+engine+"-report.json",JSON.stringify({passed:true,cases,details,clientErrors:errors,totalMode:true,legacyPreserved:true,libraryScaling:true,aiPreview:true},null,2));console.log(engine+"：输入对齐、总量保存、旧记录精度、包装换算与AI审核通过。");
 }catch(error){await writeFile(artifacts+"/"+engine+"-errors.json",JSON.stringify({errors:errorDetails,failedRequests},null,2));await page.screenshot({path:artifacts+"/"+engine+"-failure.png"});await writeFile(artifacts+"/"+engine+"-failure.html",await page.content());throw error;}
}
