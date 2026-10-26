import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir} from "node:fs/promises";
export async function checkMealDayCompletion({baseURL,context,page,token,today}){
 const date=new Date(Date.parse(today+"T12:00:00Z")-3*86400000).toISOString().slice(0,10),headers={Authorization:"Bearer "+token};
 const post=async(items)=>{const response=await context.request.post(baseURL+"/api/v1/record-operations",{headers,data:{operationId:randomUUID(),items}});assert.equal(response.status(),200);return response.json();};
 const save=async(op)=>{await page.goto(op.confirmationUrl);await page.getByRole("button",{name:"确认保存",exact:true}).click();await page.waitForURL(baseURL+"/dashboard");};
 const meal=(key,kcal)=>({key,kind:"save_meal",date,mealType:"虚构完整性验收"+key,items:[{kind:"food",name:"虚构完整性食物"+key,nutrition:{caloriesKcal:kcal,proteinG:"20",carbsG:"0",fatG:null}}]});
 const energyResponse=await context.request.get(baseURL+"/api/v1/energy?from="+date+"&to="+date,{headers});assert.equal(energyResponse.status(),200);const current=(await energyResponse.json()).records.find(row=>row.date===date&&!row.deletedAt);
 await save(await post([{key:"day-energy",kind:"save_energy_day",...(current?{id:current.id,version:current.version}:{}),date,entryMode:"total",totalKcal:"2400"},meal("day-first","800")]));
 const read=async()=>{const response=await context.request.get(baseURL+"/api/v1/meals?from="+date+"&to="+date,{headers});assert.equal(response.status(),200);return (await response.json()).days.find(day=>day.date===date);};
 assert.equal((await read()).day.status,"unconfirmed");
 await page.getByRole("button",{name:"7D",exact:true}).click();
 const graphDay=()=>page.locator('[data-overview-date="'+date+'"]');
 assert.equal(await graphDay().getAttribute("data-balance"),null);
 assert.equal(Number(await graphDay().locator('[data-series="intake"]').getAttribute("data-overview-value")),800);
 const mark=async(status)=>{
  await page.goto(baseURL+"/dashboard/meals?date="+date);const row=page.locator("dialog[open]");
  await row.getByRole("checkbox",{name:date+" 已记全",exact:true}).click();
  await row.locator('[data-meal-day-status="'+status+'"]').waitFor();
  assert.equal((await read()).day.status,status);
 };
 await mark("complete");await page.goto(baseURL+"/dashboard");await page.getByRole("button",{name:"7D",exact:true}).click();assert.equal(await graphDay().getAttribute("data-balance"),"-1600");
 await mark("incomplete");await page.goto(baseURL+"/dashboard");await page.getByRole("button",{name:"7D",exact:true}).click();assert.equal(await graphDay().getAttribute("data-balance"),null);
 assert.equal(Number(await graphDay().locator('[data-series="intake"]').getAttribute("data-overview-value")),800);
 await page.goto(baseURL+"/dashboard/meals");await page.getByRole("button",{name:"7D",exact:true}).click();
 const bar=page.locator('[data-bar-date="'+date+'"]');assert.equal(await bar.getAttribute("data-day-status"),"incomplete");assert.equal(await bar.locator('[data-day-incomplete="true"]').count(),1);
 await save(await post([meal("day-second","300")]));
 assert.equal((await read()).day.status,"unconfirmed");await mark("complete");
 await page.goto(baseURL+"/dashboard");await page.getByRole("button",{name:"7D",exact:true}).click();assert.equal(await graphDay().getAttribute("data-balance"),"-1300");
 await mkdir("/tmp/formward-day-visual",{recursive:true});
 for(const width of[1440,390,320]){
  await page.setViewportSize({width,height:width<500?740:1000});await page.goto(baseURL+"/dashboard/meals");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator("[data-history-toggle]").click();await page.locator('[data-record-date="'+date+'"]').scrollIntoViewIfNeeded();await page.waitForTimeout(500);await page.screenshot({path:"/tmp/formward-day-visual/day-"+width+".png",fullPage:true});
 }
 console.log("饮食日完整性实际网页通过：新日待确认/已记完/未记全、摄入保留/盈余排除、追加餐后重新确认，1440/390/320px。");
}
