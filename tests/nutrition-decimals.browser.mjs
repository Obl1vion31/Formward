import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {readMealSnapshot} from "../src/features/meals/records.ts";

/** 共用于隔离与正式虚构账号；不改变公开请求精度或历史数据。 */
export async function checkNutritionDecimals({baseURL,context,page,db,userId,token,engine="chromium",artifacts=".codex/nutrition-decimal-check"}){
 await mkdir(artifacts,{recursive:true});const checks=[],errors=[],serverErrors=[];
 page.on("pageerror",e=>errors.push(e.message));page.on("response",r=>{if(r.status()>=500)serverErrors.push(r.status()+" "+new URL(r.url()).pathname)});
 const dialog=()=>page.locator("dialog[open]").last();
 async function library(){await page.waitForLoadState("networkidle");await page.goto(baseURL+"/dashboard/meals");await page.waitForLoadState("networkidle");await page.getByRole("button",{name:"食材库",exact:true}).click();}
 const foodName="虚构小数食材 · "+engine;
 await library();await page.getByRole("button",{name:"添加食材 ＋",exact:true}).click();
 await dialog().getByLabel("食材／产品名称",{exact:true}).fill(foodName);
 await dialog().getByLabel("蛋白质",{exact:true}).fill(".5");await dialog().getByLabel("蛋白质",{exact:true}).blur();assert.equal(await dialog().getByLabel("蛋白质",{exact:true}).inputValue(),"0.5");
 for(const [label,value]of[["热量","111"],["蛋白质","12.3456"],["碳水","0"],["脂肪","0.0001"]])await dialog().getByLabel(label,{exact:true}).fill(value);
 await dialog().getByLabel("脂肪",{exact:true}).blur();
 assert.equal(await dialog().getByLabel("蛋白质",{exact:true}).inputValue(),"12.3456");
 assert.equal(await dialog().getByLabel("脂肪",{exact:true}).inputValue(),"0.0001");
 await page.screenshot({path:artifacts+"/"+engine+"-food-decimal-editor.png"});
 await dialog().getByRole("button",{name:"保存食材",exact:true}).click();await page.getByRole("dialog",{name:"食材规格",exact:true}).waitFor({state:"hidden"});
 let snapshot=await readMealSnapshot(db,userId),food=snapshot.foods.find(f=>f.name===foodName);assert.ok(food);
 for(const [key,value]of[["proteinG",12.3456],["carbsG",0],["fatG",0.0001]])assert.equal(Number(food.nutrition[key]),value);
 checks.push("library-fields-four-decimals-zero-and-full-save");
 // Existing values must not be rounded back merely by focus or a metadata edit.
 await page.getByRole("button",{name:foodName+"详情",exact:true}).click();await dialog().getByRole("button",{name:"编辑",exact:true}).click();
 const before=structuredClone(food.nutrition);
 for(const label of ["蛋白质","脂肪","热量"]){await dialog().getByLabel(label,{exact:true}).focus();await dialog().getByLabel(label,{exact:true}).blur();}
 await dialog().locator("summary").filter({hasText:"补充说明"}).click();await dialog().getByLabel("依据／备注",{exact:true}).fill("虚构备注：只修改说明，不改原有小数");
 await dialog().getByRole("button",{name:"保存食材",exact:true}).click();await page.getByRole("dialog",{name:"食材规格",exact:true}).waitFor({state:"hidden"});
 food=(await readMealSnapshot(db,userId)).foods.find(f=>f.id===food.id);assert.deepEqual(food.nutrition,before);checks.push("library-focus-blur-and-note-preserve-original-four-decimals");
 const aiName="虚构AI小数食材 · "+engine;
 const response=await context.request.post(baseURL+"/api/v1/record-operations",{headers:{Authorization:"Bearer "+token},data:{operationId:randomUUID(),items:[{key:"decimal-food",kind:"save_food",name:aiName,baseQuantity:"100",unit:"g",sourceKind:"reference",basis:"虚构测试",nutrition:{caloriesKcal:"101.1234",proteinG:"1.0001",carbsG:"2.2222",fatG:"3.3333"}}]}});
 assert.equal(response.status(),200);const preview=await response.json();
 await page.waitForLoadState("networkidle");await page.goto(preview.confirmationUrl);await page.waitForLoadState("networkidle");
 await page.locator('[data-review-key="decimal-food"]').getByRole("button",{name:"修改",exact:true}).click();
 for(const [label,value]of[["蛋白质","17.5"],["碳水","4.25"],["脂肪","1.1"]])await dialog().getByLabel(label,{exact:true}).fill(value);
 await dialog().getByLabel("热量",{exact:true}).focus();await dialog().getByLabel("热量",{exact:true}).blur();
 await dialog().getByRole("button",{name:"应用修改",exact:true}).click();await page.getByRole("heading",{name:"修改待保存内容",exact:true}).waitFor({state:"hidden"});
 await page.waitForLoadState("networkidle");assert.equal((await readMealSnapshot(db,userId)).foods.some(f=>f.name===aiName),false);
 const item=page.locator('[data-review-key="decimal-food"]');await item.getByText(/17\.5/).first().waitFor();assert.match(await item.innerText(),/17\.5/);assert.match(await item.innerText(),/4\.25/);assert.match(await item.innerText(),/1\.1/);
 await page.screenshot({path:artifacts+"/"+engine+"-ai-decimal-summary.png"});
 await page.getByRole("button",{name:"确认保存",exact:true}).click();await page.getByRole("heading",{name:"已保存",exact:true}).waitFor();
 const ai=(await readMealSnapshot(db,userId)).foods.find(f=>f.name===aiName);assert.ok(ai);assert.equal(Number(ai.nutrition.caloriesKcal),101.1234);
 for(const [key,value]of[["proteinG",17.5],["carbsG",4.25],["fatG",1.1]])assert.equal(Number(ai.nutrition[key]),value);
 checks.push("ai-food-apply-decimals-then-confirm-retains-calorie-precision");
 assert.deepEqual(errors,[]);assert.deepEqual(serverErrors,[]);
 const report={passed:true,engine,checks,errors,serverErrors};await writeFile(artifacts+"/"+engine+"-decimals-report.json",JSON.stringify(report,null,2));return report;
}
