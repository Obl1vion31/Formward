import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {once} from "node:events";
import {randomUUID} from "node:crypto";
import postgres from "postgres";
import {drizzle} from "drizzle-orm/postgres-js";
import {migrate} from "drizzle-orm/postgres-js/migrator";
import {eq} from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import {provisionAccount} from "../src/features/auth/provision.ts";
import {submitEnergyOperation,decideEnergyOperation} from "../src/features/activities/records.ts";
import {submitMealOperation,decideMealOperation,readMealSnapshot} from "../src/features/meals/records.ts";
import {setMealDayStatus} from "../src/features/meals/day-status.ts";
import {saveMeasurementDay} from "../src/features/measurements/editing.ts";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";
import {checkChartRangeMotion} from "./chart-range-motion-check.browser.mjs";
const databaseUrl=process.env.FORMWARD_BROWSER_DATABASE_URL;
assert.ok(databaseUrl,"Supply a fresh isolated local PostgreSQL database; .env.local is never loaded");
const parsed=new URL(databaseUrl);assert.ok(["127.0.0.1","localhost"].includes(parsed.hostname)&&/^\/formward_browser_/.test(parsed.pathname),"Only a temporary local test database is allowed");
const sql=postgres(databaseUrl,{max:3}),db=drizzle(sql,{schema});
const engine=process.env.FORMWARD_OVERVIEW_BROWSER||"chromium",art=resolve(process.env.FORMWARD_OVERVIEW_ARTIFACTS||".codex/overview-readings",engine);await mkdir(art,{recursive:true});
let child,browser,log="",failure;const errors=[],networkErrors=[],checks=[],screenshots=[];
try{
 await migrate(db,{migrationsFolder:"./drizzle"});assert.equal((await db.select().from(schema.user)).length,0,"Database must be fresh");
 const account={email:"overview-reference@example.test",password:"fictional-overview-local-only"},owner=await provisionAccount(db,{...account,name:"虚构验收"});
 await db.delete(schema.personalProfile).where(eq(schema.personalProfile.userId,owner.id));
 const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),yesterday=addCalendarDays(today,-1);
 const recentOffsets = Array.from({length:21}, (_,i)=>i-20);
 for(const i of [-56,-55,-54,-52,...recentOffsets]){
  const date=addCalendarDays(today,i);
  if(i!==-5)await saveMeasurementDay(db,{userId:owner.id,actorId:owner.id},{operationId:randomUUID(),date,timezone:"Asia/Shanghai",periods:{daytime:{weightKg:(70.2+i*.03+Math.sin(i)*.15).toFixed(2),bodyFatPercent:"18.20",fasting:true,deviceLabel:"虚构体重秤"}}});
  if(i===0)continue;
  const energy=await submitEnergyOperation(db,{userId:owner.id,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_energy_day",date,entryMode:"components",activityMode:"total",restingKcal:"1950",activeKcal:i===-4?"0":String(Math.round(300+Math.cos(i)*250))}]});await decideEnergyOperation(db,owner.id,energy.id,energy.revision,"confirm");
  if(i===-5||i===-9)continue;
  const op=await submitMealOperation(db,{userId:owner.id,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_meal",date,mealType:"午餐",items:[{kind:"food",name:"鸡肉饭（虚构）",quantity:"1",unit:"份",nutritionBasis:"consumed_total",sourceKind:"reference",nutrition:{caloriesKcal:i===-4?"1950":String(Math.round(2300+Math.sin(i)*400)),proteinG:"120",carbsG:"260",fatG:i===-2?null:"70"}}]}]});await decideMealOperation(db,owner.id,op.id,op.revision,"confirm");
  if(i!==-2&&i!==-55){const snapshot=await readMealSnapshot(db,owner.id),day=snapshot.meals.find(m=>m.date===date).day;await setMealDayStatus(db,owner.id,{operationId:randomUUID(),date,status:"complete",version:day.version,contentDigest:day.contentDigest});}
 }
 const net=createServer();net.listen(0,"127.0.0.1");await once(net,"listening");const port=net.address().port;await new Promise(r=>net.close(r));const base="http://127.0.0.1:"+port;
 const runtime=process.env.FORMWARD_OVERVIEW_RUNTIME;
 const applicationArgs=runtime?["start-standalone.mjs","server.js"]:["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)];
 child=spawn(process.execPath,applicationArgs,{cwd:runtime,env:{PATH:process.env.PATH,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH,FONTCONFIG_FILE:process.env.FONTCONFIG_FILE,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",PORT:String(port),HOSTNAME:"127.0.0.1",DATABASE_URL:databaseUrl,BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:"fictional-overview-browser-secret-123456789",FORMWARD_TIMEZONE:"Asia/Shanghai",FORMWARD_LOCAL_PREVIEW:"1"},stdio:["ignore","pipe","pipe"]});
 child.stdout.on("data",b=>log+=b);child.stderr.on("data",b=>log+=b);
 for(let i=0;i<150;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===149)throw Error("startup timeout");await new Promise(r=>setTimeout(r,200));}
 const engines=await import(process.env.PLAYWRIGHT_MODULE||"/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");browser=await engines[engine].launch({headless:true});const context=await browser.newContext({locale:"zh-CN",timezoneId:"Asia/Shanghai",reducedMotion:"reduce",viewport:{width:1440,height:900}});assert.equal((await context.request.post(base+"/api/auth/sign-in/email",{headers:{Origin:base},data:account})).status(),200);
 const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));page.on("response",r=>{if(r.status()>=500)networkErrors.push(r.status()+" "+new URL(r.url()).pathname)});
 const ready=async()=>{await page.waitForLoadState("networkidle");await page.waitForFunction(()=>!document.querySelector(".page-loading-dialog[open]"));await page.evaluate(()=>document.fonts.ready);};
 const go=async path=>{await page.goto(base+path);await ready();};
 const shot=async name=>{await page.waitForTimeout(80);const path=resolve(art,name+".png");await page.screenshot({path});screenshots.push(path);};
 const choose=async date=>{
  const point=page.locator('[data-overview-date="'+date+'"]');
  await point.evaluate(el=>el.focus({preventScroll:true}));
  await page.keyboard.press("Enter");
  await page.waitForFunction(expected=>document.querySelector("[data-chart-selection]")?.getAttribute("data-selected-date")===expected,date);
 };
 const statisticsButton=page.getByRole("button",{name:"统计",exact:true});
 const statistics=page.locator("[data-overview-statistics]");
 const geometry=()=>page.locator('section[aria-label="热量与晨重趋势"]').evaluate(root=>["range","toolbar","plot"].map(slot=>root.querySelector("[data-overview-"+slot+"]").getBoundingClientRect().top+scrollY));
 const closeStatistics=async()=>{
  if(!await statisticsButton.isVisible())return;
  await page.keyboard.press("Escape");
  await statistics.waitFor({state:"hidden"});
  await page.waitForFunction(()=>document.querySelector("[data-overview-statistics-trigger]")?.getAttribute("aria-expanded")==="false");
 };
 const openStatistics=async()=>{
  if(!await statisticsButton.isVisible())return;
  assert.equal(await statistics.isVisible(),false,"手机统计默认收起");
  await statisticsButton.click();
  await statistics.waitFor();
  await page.waitForFunction(()=>document.querySelector("[data-overview-statistics-trigger]")?.getAttribute("aria-expanded")==="true");
 };

 for(const [w,h]of[[320,560],[390,720],[430,780],[390,560],[844,390],[1100,900],[1440,900],[1920,1080]]){
  await page.setViewportSize({width:w,height:h});
  for(const theme of["dark","light"]){
   await go("/dashboard");await page.evaluate(value=>{localStorage.setItem("formward-theme",value);document.documentElement.dataset.theme=value;window.dispatchEvent(new Event("formward-theme-change"));},theme);await choose(yesterday);
   await page.locator(".local-preview-label").waitFor();
   const mobile=await statisticsButton.isVisible();
   await page.keyboard.press("Escape");
   const initial=await geometry();
   await shot(theme+"-overview-"+w+"x"+h);
   await openStatistics();
   if(mobile){
    const control=await statisticsButton.boundingBox(),preset=await page.getByRole("button",{name:"自定义",exact:true}).boundingBox();
    assert.ok(control.width>=44&&control.height>=44&&Math.abs(control.y-preset.y)<=1,"统计和区间同排，触控不缩水");
    const panel=await statistics.boundingBox();
    assert.ok(panel.x>=0&&panel.y>=0&&panel.x+panel.width<=w&&panel.y+panel.height<=h,"统计浮层完整显示");
    assert.deepEqual(await geometry(),initial,"浮层打开不推动图表");
    await shot(theme+"-statistics-"+w+"x"+h);
   }
   assert.equal(await page.locator("[data-overview-comparison] > div").count(),2);
   assert.equal(await page.locator("[data-overview-week-basis]:visible").count(),0);
   for(const metric of ["energy","weight"]){
    const day=await page.locator("[data-overview-day-"+metric+"]").boundingBox();
    const week=await page.locator("[data-overview-week-"+metric+"]").boundingBox();
    assert.ok(Math.abs(day.x-week.x)<=1,"当日和近7天同列对齐");
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,"no page overflow");
   await closeStatistics();
   for(const offset of[-2,-4,-6]){
    await choose(addCalendarDays(today,offset));
    const next=await geometry();
    assert.ok(next.every((n,i)=>Math.abs(n-initial[i])<=1),"selection geometry stable "+JSON.stringify({w,theme,initial,next}));
    if(offset===-2||offset===-4){
     await openStatistics();
     assert.match(await page.locator("[data-overview-day-energy]").innerText(),offset===-2?/未计算/:/持平/);
     if(w===390&&offset===-2)await shot(theme+"-pending-meal-390");
     await closeStatistics();
    }
   }
   if(w===390){await openStatistics();await shot(theme+"-missing-morning-390");await closeStatistics();}
   checks.push(theme+"-overview-"+w+"x"+h);
  }
 }
 for(const viewport of [{width:390,height:780},{width:1440,height:900}]){
  await page.setViewportSize(viewport);
  await go("/dashboard");
  const graph=page.getByRole("group",{name:"双层日期关联图",exact:true});
  await graph.waitFor();
  const mobile=viewport.width===390;
  for(const [mode,days,guides] of [["7D",7,7],["30D",30,7],["90D",90,5]]){
   await page.getByRole("button",{name:mode,exact:true}).click();
   const result=await graph.evaluate(svg=>{
    const left=Number(svg.querySelector("[data-balance-zero]").getAttribute("x1"));
    const right=Number(svg.querySelector("[data-balance-zero]").getAttribute("x2"));
    const width=svg.viewBox.baseVal.width;
    const dateGuides=[...svg.querySelectorAll("[data-overview-guide-date]")].map(day=>[...day.querySelectorAll("line")].map(line=>Number(line.getAttribute("x1"))));
    const references=[...svg.querySelectorAll("[data-reference-tick]")];
    const axisLabels=[...svg.querySelectorAll("[data-axis-tick] text")];
    const plotDates=[...svg.querySelectorAll("[data-overview-date]")].map(day=>day.getAttribute("data-overview-date"));
    const guideDates=[...svg.querySelectorAll("[data-overview-guide-date]")].map(day=>day.getAttribute("data-overview-guide-date"));
    const gap=Number(svg.querySelector('[data-overview-guide-date] [data-range-mark^="date-guide:weight"]').getAttribute("y1"))
      - Number(svg.querySelector('[data-overview-guide-date] [data-range-mark^="date-guide:energy"]').getAttribute("y2"));
    return {days:plotDates.length,guideIndices:guideDates.map(date=>plotDates.indexOf(date)),aligned:dateGuides.every(xs=>xs.length===2&&xs[0]===xs[1]),
     symmetric:left===width-right,
     labelsFit:axisLabels.every(label=>{const box=label.getBBox();return box.x>=-.5&&box.y>=-.5&&box.x+box.width<=width+.5;}),
     references:references.map(text=>{
       const tick=Number(text.parentElement.getAttribute("data-axis-tick"));
       const panel=text.closest("[data-overview-panel]");
       const y=Number(text.parentElement.querySelector("line").getAttribute("y1"));
       return {panel:panel.dataset.overviewPanel,tick,y,aligned:Number(text.getAttribute("y"))===y-4,text:text.textContent};
     }),
     labelCount:axisLabels.length,gap,
     bars:[...svg.querySelectorAll('[data-series="balance"]')].map(bar=>Number(bar.getAttribute("width"))),
     zeroCount:svg.querySelectorAll("[data-balance-zero],[data-overview-zero]").length};
   });
   assert.equal(result.days,days);
   assert.equal(result.guideIndices.length,guides);
   assert.equal(result.guideIndices[0],0);
   assert.equal(result.guideIndices.at(-1),days-1);
   assert.ok(result.aligned&&result.labelsFit);
   assert.equal(result.zeroCount,2);
   if(mode==="30D")assert.deepEqual(result.guideIndices,[0,5,10,15,20,25,29]);
   if(mode==="90D")assert.deepEqual(result.guideIndices,[0,22,45,67,89]);
   assert.equal(result.references.length,mobile?2:0);
   assert.equal(result.gap,mobile?24:26);
   if(mobile){
    assert.ok(result.symmetric);
    assert.equal(result.labelCount,4);
    assert.ok(result.references.every(reference=>reference.tick!==0&&reference.aligned));
    assert.match(result.references.find(reference=>reference.panel==="weight").text,/ kg$/);
    if(mode==="7D")assert.ok(result.bars.length>0&&result.bars.every(width=>Math.abs(width-14)<.01));
    else assert.ok(result.bars.every(width=>width<=6.4));
   }
   await graph.scrollIntoViewIfNeeded();
   await shot((mobile?"phone":"desktop")+"-"+mode);
   checks.push((mobile?"mobile":"desktop")+"-axes-and-guides-"+mode);
  }
 }
 await page.setViewportSize({width:390,height:780});await go("/dashboard");await choose(yesterday);
 await openStatistics();
 const firstSelection=await statistics.locator("[data-overview-comparison]").getAttribute("data-selected-date");
 await statisticsButton.click();await statistics.waitFor({state:"hidden"});
 const other=page.locator('[data-overview-date="'+addCalendarDays(today,-4)+'"] rect');
 await other.click();
 await openStatistics();
 assert.notEqual(await statistics.locator("[data-overview-comparison]").getAttribute("data-selected-date"),firstSelection);
 await page.getByRole("button",{name:"30D",exact:true}).click();
 await statistics.waitFor({state:"hidden"});
 checks.push("statistics-toggle-selected-date-outside");
 await page.emulateMedia({reducedMotion:"no-preference"});
 for(const range of ["7D","30D","90D"])await page.getByRole("button",{name:range,exact:true}).click();
 await page.locator("[data-overview-guide-date]").last().waitFor({state:"attached"});
 await page.waitForFunction(()=>!document.querySelector("[data-chart-range-motion]"));
 assert.equal(await page.locator("[data-overview-guide-date]").count(),5);
 await page.emulateMedia({reducedMotion:"reduce"});
 checks.push("rapid-range-motion");
 await page.setViewportSize({width:390,height:720});await go("/dashboard");await choose(yesterday);await page.getByRole("button",{name:"查看记录 →",exact:true}).click();await page.getByRole("dialog").waitFor();assert.match(await page.getByRole("dialog").innerText(),/晨间体重/);await page.keyboard.press("Escape");checks.push("day-details-kept");
 for(const path of["/dashboard/meals","/dashboard/energy","/dashboard/measurements"]){await go(path);assert.equal(await page.locator('[data-record-slot="date"] [role="status"]').count(),0);await shot("unchanged-"+path.split("/").at(-1)+"-390");}checks.push("other-pages-status-placement-kept");
 const stressDate=addCalendarDays(today,-17),oldMeal=(await readMealSnapshot(db,owner.id)).meals.find(m=>m.date===stressDate);
 const stress=await submitMealOperation(db,{userId:owner.id,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_meal",id:oldMeal.id,version:oldMeal.version,date:stressDate,mealType:"午餐",items:[{kind:"food",name:"长数字压力样本（虚构）",quantity:"1",unit:"份",nutritionBasis:"consumed_total",sourceKind:"reference",nutrition:{caloriesKcal:"99999",proteinG:"120",carbsG:"260",fatG:"70"}}]}]});await decideMealOperation(db,owner.id,stress.id,stress.revision,"confirm");
 const stressDay=(await readMealSnapshot(db,owner.id)).meals.find(m=>m.id===oldMeal.id).day;await setMealDayStatus(db,owner.id,{operationId:randomUUID(),date:stressDate,status:"complete",version:stressDay.version,contentDigest:stressDay.contentDigest});
 await page.setViewportSize({width:320,height:560});
 await go("/dashboard");
 await page.getByRole("button",{name:"30D",exact:true}).click();
 await choose(yesterday);
 const longGeometry=await geometry();
 await page.keyboard.press("Escape");
 await page.locator('[data-overview-date="'+stressDate+'"] rect').click();
 assert.equal(await page.locator("[data-chart-selection]").getAttribute("data-selected-date"),stressDate);
 assert.deepEqual(await geometry(),longGeometry,"long secondary readouts reserve width for the whole interval");
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await openStatistics();
 await shot("long-readings-320");
 await closeStatistics();
 checks.push("long-interval-readings-stable");
 const touch=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,locale:"zh-CN",timezoneId:"Asia/Shanghai",reducedMotion:"reduce"});await touch.addCookies(await context.cookies());const tp=await touch.newPage();tp.on("pageerror",e=>errors.push(e.message));await tp.goto(base+"/dashboard");await tp.waitForLoadState("networkidle");const touchStatistics=tp.locator("[data-overview-statistics]");assert.equal(await touchStatistics.isVisible(),false);await tp.getByRole("button",{name:"统计",exact:true}).tap();await touchStatistics.waitFor();assert.equal(await tp.locator("[data-overview-comparison] > div").count(),2);await tp.screenshot({path:resolve(art,"touch-landscape.png")});await touch.close();checks.push("real-coarse-pointer-landscape");
 await go("/dashboard");await page.getByRole("button",{name:"自定义",exact:true}).click();await page.getByLabel("总览开始日期").fill(addCalendarDays(today,-6));await page.getByLabel("总览结束日期").fill(yesterday);await page.getByRole("button",{name:"应用",exact:true}).click();await choose(yesterday);checks.push("custom-range-and-keyboard");
 const plain=await page.locator('[data-overview-week]').innerText();assert.equal(await page.getByLabel("显示体重估计",{exact:true}).count(),0);assert.equal(await page.locator('[data-overview-week]').innerText(),plain);checks.push("no-body-estimation-control");
 await checkChartRangeMotion({browser,base,today,art,context,checks,errors,account:owner.id});
 assert.deepEqual(errors,[]);assert.deepEqual(networkErrors,[]);
}catch(e){failure=e;console.error(e);}finally{await browser?.close();if(child){child.kill("SIGTERM");await once(child,"exit");}await sql.end();await writeFile(resolve(art,"server.log"),log);await writeFile(resolve(art,"report.json"),JSON.stringify({passed:!failure,engine,checks,screenshots,errors,networkErrors,failure:failure?.message},null,2));}
if(failure)process.exitCode=1;else console.log(JSON.stringify({engine,passed:true,checks:checks.length,screenshots:screenshots.length}));
