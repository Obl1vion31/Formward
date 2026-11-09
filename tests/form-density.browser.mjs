import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {saveMeasurementDay} from "../src/features/measurements/editing.ts";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";
import {submitMealOperation,decideMealOperation} from "../src/features/meals/records.ts";

export async function checkFormDensity({page,context,db,userId,baseURL,today,engine,artifacts}){
 await mkdir(artifacts,{recursive:true});const checks=[],shots=[],errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 page.on("response",r=>{if(r.status()>=500)errors.push(r.status()+" "+new URL(r.url()).pathname);});
 page.setDefaultTimeout(16000);
 for(let i=5;i>=1;i--)await saveMeasurementDay(db,{userId,actorId:userId},{operationId:randomUUID(),date:addCalendarDays(today,-i),timezone:"Asia/Shanghai",periods:{daytime:{weightKg:(70+i*.1).toFixed(2),bodyFatPercent:"20.50",fasting:true,deviceLabel:"虚构密度秤"},evening:{weightKg:(70.5+i*.1).toFixed(2),bodyFatPercent:"21.00",fasting:false,deviceLabel:"虚构密度秤"}}});
 const op=await submitMealOperation(db,{userId,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_food",name:"FarmFresh Chicken Breast · 虚构密度食材",baseQuantity:"100",unit:"g",servingQuantity:"90",servingUnit:"包",sourceKind:"reference",nutrition:{caloriesKcal:"104",proteinG:"18.9",carbsG:"4.4",fatG:"1.1"}}]});await decideMealOperation(db,userId,op.id,op.revision,"confirm");
 async function settle(){await page.waitForLoadState("networkidle");await page.waitForFunction(()=>!document.querySelector("dialog.page-loading-dialog[open]"));await page.evaluate(async()=>{await document.fonts.ready;for(const n of document.querySelectorAll("dialog[open]"))for(const a of n.getAnimations({subtree:true}))if(a.playState==="running"&&a.effect?.getTiming().iterations!==Infinity)await a.finished.catch(()=>{});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
 async function go(path){await page.waitForLoadState("networkidle");await page.goto(baseURL+path);await settle();}
 async function shot(name){await settle();await page.screenshot({path:artifacts+"/"+engine+"-"+name+".png"});shots.push(name);}
 async function close(){await page.getByRole("button",{name:/^关闭(编辑|记录详情)$/}).last().click();await page.locator("dialog[open]:not(.page-loading-dialog)").waitFor({state:"hidden"});}
 async function body(){await go("/dashboard/measurements?date="+today+"&entry=daytime");await page.locator('form[data-entry-form=body]').waitFor();await settle();return page.locator('form[data-entry-form=body]');}
 async function food(){await go("/dashboard/meals");await page.getByRole("button",{name:"食材库",exact:true}).click();await page.getByRole("row").filter({hasText:"虚构密度食材"}).getByRole("button",{name:/详情$/}).click();await page.locator("dialog[open]").last().getByRole("button",{name:"编辑",exact:true}).click();await settle();return page.locator('form[data-entry-form=food]');}
 const sizes=[[320,560],[390,720],[430,780],[390,560],[844,390],[1100,900],[1366,768],[1440,900],[1920,1080]];
 for(const theme of ["dark","light"]){
  await go("/dashboard");await page.evaluate(t=>localStorage.setItem("formward-theme",t),theme);
  for(const [width,height]of sizes){
   await page.setViewportSize({width,height});const bf=await body();
   const gap=await bf.evaluate(n=>{const p=n.querySelector('[data-period=daytime]'),inputs=[...p.querySelectorAll('[data-entry-cell] input')];const bottom=Math.max(...inputs.map(i=>i.getBoundingClientRect().bottom)),source=p.querySelector('[role=combobox]').parentElement.querySelector("label");return source.getBoundingClientRect().top-bottom;});
   assert.ok(gap>=8&&gap<=20,"body source gap: "+gap);
   if(width>=1100){const legend=await bf.locator("[data-period=daytime] legend").boundingBox();assert.ok(legend.height<=48,"period heading must not stack padding and margin");}
   const source=bf.getByRole("combobox",{name:"晨间数据来源",exact:true});
   if(width===390&&height===720)assert.ok((await source.boundingBox()).y+(await source.boundingBox()).height<400);
   await shot(theme+"-body-"+width+"x"+height);await close();
   const ff=await food(),grid=ff.locator("[data-nutrition-columns]");
   await page.waitForFunction(()=>document.querySelector("[data-nutrition-columns]")?.dataset.nutritionColumns==="4");
   const bounds=await grid.locator("input").evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,right:r.right,left:r.left,h:r.height,font:parseFloat(getComputedStyle(n).fontSize)};}));
   assert.ok(Math.max(...bounds.map(r=>r.top))-Math.min(...bounds.map(r=>r.top))<=1);
   assert.ok(bounds.every(r=>r.h>=44&&r.font>=16));const brand=await ff.getByLabel("品牌（可选）",{exact:true}).boundingBox(),preparation=await ff.getByLabel("规格／做法（可选）",{exact:true}).boundingBox();assert.ok(Math.abs(brand.y-preparation.y)<=1,"paired captions must not push one input onto another line");
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   if(width===390&&height===720){assert.ok(bounds[3].top+bounds[3].h<580);await ff.getByText("补充说明",{exact:true}).click();assert.equal(await ff.getByLabel("依据／备注",{exact:true}).isVisible(),true);await ff.getByText("补充说明",{exact:true}).click();}
   await shot(theme+"-food-"+width+"x"+height);
   if(width===320&&theme==="dark"){
    await ff.getByLabel("蛋白质",{exact:true}).fill("123456.7");await page.waitForFunction(()=>document.querySelector("[data-nutrition-columns]")?.dataset.nutritionColumns==="2");
    const fits=await ff.getByLabel("蛋白质",{exact:true}).evaluate(n=>{const s=getComputedStyle(n),c=document.createElement("canvas").getContext("2d");c.font=s.fontSize+" "+s.fontFamily;return c.measureText(n.value).width<=n.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight);});assert.ok(fits);await shot("long-nutrients-320");
    await ff.getByLabel("蛋白质",{exact:true}).fill("18.9");await page.waitForFunction(()=>document.querySelector("[data-nutrition-columns]")?.dataset.nutritionColumns==="4");checks.push("four-nutrients-same-row-long-values-reflow-without-shrinking");
   }
   await close();
  }
 }
 await page.setViewportSize({width:390,height:720});await go("/dashboard");await page.evaluate(()=>localStorage.setItem("formward-theme","dark"));
 const bf=await body(),before=(await bf.getByRole("combobox",{name:"晨间数据来源",exact:true}).boundingBox()).y;
 assert.equal(await bf.getByRole("button",{name:/估算/}).count(),0);
 await bf.getByLabel("晨间体重",{exact:true}).fill("71.2");await bf.getByLabel("晨间体重",{exact:true}).fill("");
 const after=(await bf.getByRole("combobox",{name:"晨间数据来源",exact:true}).boundingBox()).y;assert.ok(Math.abs(before-after)<=1);
 await shot("actual-entry-390");await close();checks.push("actual-entry-and-source-position-stable");
 await food();await page.addStyleTag({content:"body{zoom:2}"});await shot("food-text-200");
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await close();checks.push("200-percent-text-natural-reflow");
 const tc=await context.browser().newContext({storageState:await context.storageState(),viewport:{width:390,height:720},isMobile:true,hasTouch:true,locale:"zh-CN",timezoneId:"Asia/Shanghai",reducedMotion:"reduce"});
 try{const p=await tc.newPage();p.on("pageerror",e=>errors.push(e.message));await p.goto(baseURL+"/dashboard/measurements?date="+today+"&entry=daytime");await p.getByRole("button",{name:"晚间",exact:true}).tap();assert.equal(await p.getByLabel("晚间体重",{exact:true}).isVisible(),true);await p.getByRole("button",{name:"更多设置",exact:true}).first().tap();assert.equal(await p.getByLabel("晚间时区",{exact:true}).isVisible(),true);}finally{await tc.close();}
 checks.push("touch-period-and-more-settings");
 assert.deepEqual(errors,[]);
 await writeFile(artifacts+"/"+engine+"-density-report.json",JSON.stringify({engine,passed:true,checks,shots,errors},null,2));
 console.log(engine+": form density passed; "+shots.length+" screenshots.");
}
