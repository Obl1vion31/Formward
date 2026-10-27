import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {submitMealOperation,decideMealOperation,readMealSnapshot} from "../src/features/meals/records.ts";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";
const nutrition=(caloriesKcal,proteinG="0",carbsG=null,fatG="0.1234")=>({caloriesKcal,proteinG,carbsG,fatG});
export async function checkMealEntry({baseURL,context,page,db,userId,token,today,engine="chromium",artifacts=".codex/meal-total-visual"}){
 await mkdir(artifacts,{recursive:true});page.setDefaultTimeout(25000);const errors=[];page.on("pageerror",e=>errors.push(e.message));
 const oldDate=addCalendarDays(today,-2),name="虚构旧按份记录";
 const op=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[
  {kind:"save_food",name:"虚构包装食材",baseQuantity:"90",unit:"g",servingQuantity:"90",servingUnit:"包",sourceKind:"estimated",nutrition:nutrition("180","18","10","5")},
  {kind:"save_food",name:"虚构按克食材",baseQuantity:"100",unit:"g",sourceKind:"estimated",nutrition:nutrition("110","20","0","3")},
  {kind:"save_meal",date:oldDate,mealType:name,items:[{kind:"food",name:"虚构旧自由项",quantity:"1.5",unit:"个",nutritionBasis:"per_portion",perPortionNutrition:nutrition("90"),sourceKind:"estimated"}]}
 ]});assert.ok(op.canConfirm);await decideMealOperation(db,userId,op.id,op.revision,"confirm");
 const modal=()=>page.locator("dialog[open]").last(),form=()=>modal().locator("form");
 async function openNew(){await page.goto(baseURL+"/dashboard/meals");await page.locator('[data-record-date="'+today+'"]').getByRole("button",{name:/^(录入|添加一餐)$/}).click();await modal().getByRole("heading",{name:"记录一餐",exact:true}).waitFor();await page.evaluate(async()=>{await document.fonts.ready;});}
 async function fillFree(){await form().getByLabel("自由填写食物名称",{exact:true}).fill("虚构鸡胸肉本次总量");await form().getByLabel("单位 1",{exact:true}).fill("g");await form().getByLabel("数量 1",{exact:true}).fill("150");for(const [field,value]of[["热量","240"],["蛋白质","30"],["碳水","12"],["脂肪","8"]])await form().getByLabel("本次"+field+" 1",{exact:true}).fill(value);}
 async function total(value){assert.match((await form().getByLabel("本餐合计",{exact:true}).innerText()).replaceAll(",",""),new RegExp(String(value)));}
 async function closeEditor(dirty=false){if(dirty)page.once("dialog",dialog=>dialog.accept());await modal().getByRole("button",{name:"关闭编辑",exact:true}).click();await page.locator("dialog[open]").filter({has:page.getByRole("heading",{name:/^(记录一餐|编辑餐次)$/})}).waitFor({state:"hidden"});}
 const cases=[];
 for(const [width,height]of[[1440,1050],[1100,1000],[430,844],[390,844],[320,740]]){
  await page.setViewportSize({width,height});await openNew();await fillFree();await total(240);
  await form().getByLabel("数量 1",{exact:true}).fill("200");await total(240);await form().getByLabel("数量 1",{exact:true}).fill("150");
  assert.equal(await form().getByText("每份营养",{exact:true}).count(),0);
  const row=form().locator("tbody tr").first();
  const boxes=await row.locator("input").evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {top:r.top,bottom:r.bottom,height:r.height,leftPadding:parseFloat(s.paddingLeft),rightPadding:parseFloat(s.paddingRight)};}));
  assert.ok(boxes.every(b=>b.height>=43.9&&b.leftPadding>=10&&b.rightPadding>=10));
  if(width>960){assert.ok(Math.max(...boxes.map(b=>b.top))-Math.min(...boxes.map(b=>b.top))<1);assert.equal(await form().locator("thead th").count(),8);}
  const labelGap=await form().locator('label').filter({has:page.getByLabel("餐次",{exact:true})}).evaluate(label=>{const input=label.querySelector("input");const range=document.createRange();range.selectNode(label.firstChild);return input.getBoundingClientRect().top-range.getBoundingClientRect().bottom;});assert.ok(labelGap>=8);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await row.scrollIntoViewIfNeeded();await page.screenshot({path:artifacts+"/"+engine+"-entry-"+width+".png"});cases.push({width,height,aligned:width>960,inputHeight:boxes[0].height,labelGap});
  // Packaging and metric-library rows keep automatic calculation and an independent unit column.
  if(width<=960){await form().getByRole("button",{name:"选择食材库",exact:true}).click();}
  await form().getByRole("button",{name:"选择 虚构包装食材",exact:true}).click();await form().getByLabel("数量 2",{exact:true}).fill("0.5");await total(330);
  await form().getByLabel("单位 2",{exact:true}).selectOption("g");assert.equal(Number(await form().getByLabel("数量 2",{exact:true}).inputValue()),45);await total(330);
  if(width<=960)await form().getByRole("button",{name:"选择食材库",exact:true}).click();
  await form().getByRole("button",{name:"选择 虚构按克食材",exact:true}).click();await form().getByLabel("数量 3",{exact:true}).fill("150");await total(495);
  if(width>960){const delta=await form().locator("tbody tr").nth(1).evaluate(row=>{const input=row.querySelector('input[type="number"]'),value=row.querySelector('span[class*="calculated"]');const a=input.getBoundingClientRect(),b=value.getBoundingClientRect();return Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2);});assert.ok(delta<1);}
  await form().getByLabel("餐次备注",{exact:true}).fill("虚构备注，用于检查标签与边框间距");
  const padding=await form().getByLabel("餐次备注",{exact:true}).evaluate(n=>parseFloat(getComputedStyle(n).paddingLeft));assert.ok(padding>=10);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await row.scrollIntoViewIfNeeded();await page.screenshot({path:artifacts+"/"+engine+"-mixed-"+width+".png"});
  await closeEditor(true);
 }
 // Save a real form, then edit quantity without changing its recorded total.
 await page.setViewportSize({width:1440,height:1000});await openNew();await fillFree();await form().getByLabel("餐次",{exact:true}).fill("虚构总量保存");await form().getByRole("button",{name:"保存餐次 · "+today,exact:true}).click();await page.getByRole("heading",{name:"记录一餐",exact:true}).waitFor({state:"hidden"});
 const snapshot=()=>readMealSnapshot(db,userId);let saved=(await snapshot()).meals.find(m=>m.mealType==="虚构总量保存");assert.ok(saved);assert.equal(Number(saved.items[0].nutrition.caloriesKcal),240);assert.equal(saved.items[0].nutritionBasis,"consumed_total");
 async function editSaved(record){await page.goto(baseURL+"/dashboard/meals?date="+record.date);await modal().locator("summary").filter({hasText:record.items[0].name}).click();await modal().getByRole("button",{name:"编辑",exact:true}).click();await modal().getByRole("heading",{name:"编辑餐次",exact:true}).waitFor();}
 await editSaved(saved);await form().getByLabel("数量 1",{exact:true}).fill("200");await total(240);await form().getByRole("button",{name:"保存餐次 · "+today,exact:true}).click();await page.getByRole("heading",{name:"编辑餐次",exact:true}).waitFor({state:"hidden"});saved=(await snapshot()).meals.find(m=>m.id===saved.id);assert.equal(Number(saved.items[0].quantity),200);assert.equal(Number(saved.items[0].nutrition.caloriesKcal),240);
 // Old per-portion values are projected as totals; unmodified save preserves the old wire format.
 let old=(await snapshot()).meals.find(m=>m.mealType===name),before=structuredClone(old.items[0].nutrition);
 await editSaved(old);assert.equal(Number(await form().getByLabel("本次热量 1",{exact:true}).inputValue()),135);assert.equal(await form().getByLabel("本次脂肪 1",{exact:true}).inputValue(),before.fatG);assert.equal(await form().getByLabel("本次碳水 1",{exact:true}).inputValue(),"");assert.equal(Number(await form().getByLabel("本次蛋白质 1",{exact:true}).inputValue()),0);
 await closeEditor();assert.equal((await snapshot()).meals.find(m=>m.id===old.id).version,old.version);
 await editSaved(old);await form().getByRole("button",{name:"保存餐次 · "+oldDate,exact:true}).click();await page.getByRole("heading",{name:"编辑餐次",exact:true}).waitFor({state:"hidden"});old=(await snapshot()).meals.find(m=>m.id===old.id);assert.deepEqual(old.items[0].nutrition,before);assert.equal(old.items[0].nutritionBasis,"per_portion");
 await editSaved(old);await form().getByLabel("数量 1",{exact:true}).fill("2");await total(135);await form().getByRole("button",{name:"保存餐次 · "+oldDate,exact:true}).click();await page.getByRole("heading",{name:"编辑餐次",exact:true}).waitFor({state:"hidden"});old=(await snapshot()).meals.find(m=>m.id===old.id);assert.deepEqual(old.items[0].nutrition,before);assert.equal(old.items[0].nutritionBasis,"consumed_total");
 // The AI preview's authoritative total flows through the same editor; updating is not a formal save.
 const aiDate=addCalendarDays(today,-3),response=await context.request.post(baseURL+"/api/v1/record-operations",{headers:{Authorization:"Bearer "+token},data:{operationId:randomUUID(),items:[{key:"meal",kind:"save_meal",date:aiDate,mealType:"虚构审核总量",items:[{kind:"food",name:"虚构审核按份项",quantity:"1.5",unit:"个",nutritionBasis:"per_portion",perPortionNutrition:nutrition("90"),sourceKind:"estimated"}]}]}});
 assert.equal(response.status(),200);const preview=await response.json();await page.goto(preview.confirmationUrl);await page.getByRole("button",{name:"修改",exact:true}).first().click();await form().getByLabel("本次热量 1",{exact:true}).waitFor();assert.equal(Number(await form().getByLabel("本次热量 1",{exact:true}).inputValue()),135);await form().getByLabel("数量 1",{exact:true}).fill("2");await total(135);await form().getByRole("button",{name:"更新预览",exact:true}).click();await page.getByRole("heading",{name:"修改待保存内容",exact:true}).waitFor({state:"hidden"});assert.equal((await snapshot()).meals.some(m=>m.mealType==="虚构审核总量"),false);await page.getByRole("button",{name:"确认保存",exact:true}).click();await page.getByRole("heading",{name:"已保存",exact:true}).waitFor();const ai=(await snapshot()).meals.find(m=>m.mealType==="虚构审核总量");assert.equal(Number(ai.items[0].nutrition.caloriesKcal),135);assert.equal(ai.items[0].nutritionBasis,"consumed_total");
 assert.deepEqual(errors,[]);await writeFile(artifacts+"/"+engine+"-report.json",JSON.stringify({passed:true,cases,clientErrors:errors,totalMode:true,legacyPreserved:true,libraryScaling:true,aiPreview:true},null,2));console.log(engine+"：输入对齐、总量保存、旧记录精度、包装换算与AI审核通过。");
}
