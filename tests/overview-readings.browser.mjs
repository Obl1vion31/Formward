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
 for(let i=-20;i<=0;i++){
  const date=addCalendarDays(today,i);
  if(i!==-5)await saveMeasurementDay(db,{userId:owner.id,actorId:owner.id},{operationId:randomUUID(),date,timezone:"Asia/Shanghai",periods:{daytime:{weightKg:(70.2+i*.03+Math.sin(i)*.15).toFixed(2),bodyFatPercent:"18.20",fasting:true,deviceLabel:"虚构体重秤"}}});
  if(i===0)continue;
  const energy=await submitEnergyOperation(db,{userId:owner.id,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_energy_day",date,entryMode:"components",activityMode:"total",restingKcal:"1950",activeKcal:i===-4?"0":String(Math.round(300+Math.cos(i)*250))}]});await decideEnergyOperation(db,owner.id,energy.id,energy.revision,"confirm");
  if(i===-5||i===-9)continue;
  const op=await submitMealOperation(db,{userId:owner.id,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_meal",date,mealType:"午餐",items:[{kind:"food",name:"鸡肉饭（虚构）",quantity:"1",unit:"份",nutritionBasis:"consumed_total",sourceKind:"reference",nutrition:{caloriesKcal:i===-4?"1950":String(Math.round(2300+Math.sin(i)*400)),proteinG:"120",carbsG:"260",fatG:i===-2?null:"70"}}]}]});await decideMealOperation(db,owner.id,op.id,op.revision,"confirm");
  if(i!==-2){const snapshot=await readMealSnapshot(db,owner.id),day=snapshot.meals.find(m=>m.date===date).day;await setMealDayStatus(db,owner.id,{operationId:randomUUID(),date,status:"complete",version:day.version,contentDigest:day.contentDigest});}
 }
 const net=createServer();net.listen(0,"127.0.0.1");await once(net,"listening");const port=net.address().port;await new Promise(r=>net.close(r));const base="http://127.0.0.1:"+port;
 child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{env:{PATH:process.env.PATH,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH,FONTCONFIG_FILE:process.env.FONTCONFIG_FILE,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",DATABASE_URL:databaseUrl,BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:"fictional-overview-browser-secret-123456789",FORMWARD_TIMEZONE:"Asia/Shanghai"},stdio:["ignore","pipe","pipe"]});child.stdout.on("data",b=>log+=b);child.stderr.on("data",b=>log+=b);
 for(let i=0;i<150;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===149)throw Error("startup timeout");await new Promise(r=>setTimeout(r,200));}
 const engines=await import(process.env.PLAYWRIGHT_MODULE||"/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");browser=await engines[engine].launch({headless:true});const context=await browser.newContext({locale:"zh-CN",timezoneId:"Asia/Shanghai",reducedMotion:"reduce",viewport:{width:1440,height:900}});assert.equal((await context.request.post(base+"/api/auth/sign-in/email",{headers:{Origin:base},data:account})).status(),200);
 const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));page.on("response",r=>{if(r.status()>=500)networkErrors.push(r.status()+" "+new URL(r.url()).pathname)});
 const ready=async()=>{await page.waitForLoadState("networkidle");await page.waitForFunction(()=>!document.querySelector(".page-loading-dialog[open]"));await page.evaluate(()=>document.fonts.ready);};
 const go=async path=>{await page.goto(base+path);await ready();};
 const shot=async name=>{await page.waitForTimeout(80);const path=resolve(art,name+".png");await page.screenshot({path});screenshots.push(path);};
 const choose=async date=>{await page.locator('[data-overview-date="'+date+'"]').evaluate(el=>el.focus({preventScroll:true}));await page.waitForTimeout(60);assert.equal(await page.locator('[data-chart-selection]').getAttribute("data-selected-date"),date);};
 const geometry=()=>page.locator('[data-record-trend]').evaluate(root=>{const slots=["date","metrics","range","title","plot"];return slots.map(slot=>Math.round(root.querySelector('[data-record-slot="'+slot+'"]').getBoundingClientRect().top*10)/10);});
 for(const [w,h]of[[320,560],[390,720],[430,780],[390,560],[844,390],[1100,900],[1440,900],[1920,1080]]){
  await page.setViewportSize({width:w,height:h});
  for(const theme of["dark","light"]){
   await go("/dashboard");await page.evaluate(value=>{localStorage.setItem("formward-theme",value);document.documentElement.dataset.theme=value;window.dispatchEvent(new Event("formward-theme-change"));},theme);await choose(yesterday);const mobile=w<=700;
   assert.equal(await page.locator('[data-record-slot="metrics"]>div').count(),mobile?3:6);assert.equal(await page.locator('[data-overview-week] button').count(),0,"No nested weekly disclosures");assert.equal(await page.locator('[data-record-slot="status"]').count(),0,"No standalone hidden status space");
   if(mobile){assert.equal(await page.locator('[data-overview-secondary]>div').count(),3);const ys=await page.locator('[data-overview-secondary]>div').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().top));assert.ok(Math.max(...ys)-Math.min(...ys)<=1,"secondary metrics share one row");assert.match(await page.locator('[data-overview-next] p').innerText(),/→/);}
   else if(w>=1100){const ys=await page.locator('[data-record-slot="metrics"]>div').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().top));assert.ok(Math.max(...ys)-Math.min(...ys)<=1,"desktop six unchanged");assert.ok(await page.locator('[class*=weekBasis]').isVisible(),"desktop basis directly visible");}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,"no page overflow");
   const initial=await geometry();await shot(theme+"-overview-"+w+"x"+h);
   for(const offset of[-2,-4,-6]){await choose(addCalendarDays(today,offset));const next=await geometry();assert.ok(next.every((n,i)=>Math.abs(n-initial[i])<=1),"selection geometry stable "+JSON.stringify({w,theme,initial,next}));if(offset===-2)assert.match(await page.locator('[data-record-slot="date"]').innerText(),/饮食/);if(offset===-4)assert.match(await page.locator('[data-metric-number]').nth(2).innerText(),/^0/);}
   if(w===390){await shot(theme+"-missing-morning-390");await choose(addCalendarDays(today,-2));await shot(theme+"-pending-meal-390");}
   checks.push(theme+"-overview-"+w+"x"+h);
  }
 }
 await page.setViewportSize({width:390,height:720});await go("/dashboard");await choose(yesterday);await page.getByRole("button",{name:"查看记录 →",exact:true}).click();await page.getByRole("dialog").waitFor();assert.match(await page.getByRole("dialog").innerText(),/晨间体重/);await page.keyboard.press("Escape");checks.push("day-details-kept");
 for(const path of["/dashboard/meals","/dashboard/energy","/dashboard/measurements"]){await go(path);assert.equal(await page.locator('[data-record-slot="date"] [role="status"]').count(),0);await shot("unchanged-"+path.split("/").at(-1)+"-390");}checks.push("other-pages-status-placement-kept");
 const stressDate=addCalendarDays(today,-17),oldMeal=(await readMealSnapshot(db,owner.id)).meals.find(m=>m.date===stressDate);
 const stress=await submitMealOperation(db,{userId:owner.id,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_meal",id:oldMeal.id,version:oldMeal.version,date:stressDate,mealType:"午餐",items:[{kind:"food",name:"长数字压力样本（虚构）",quantity:"1",unit:"份",nutritionBasis:"consumed_total",sourceKind:"reference",nutrition:{caloriesKcal:"99999",proteinG:"120",carbsG:"260",fatG:"70"}}]}]});await decideMealOperation(db,owner.id,stress.id,stress.revision,"confirm");
 const stressDay=(await readMealSnapshot(db,owner.id)).meals.find(m=>m.id===oldMeal.id).day;await setMealDayStatus(db,owner.id,{operationId:randomUUID(),date:stressDate,status:"complete",version:stressDay.version,contentDigest:stressDay.contentDigest});
 await page.setViewportSize({width:320,height:560});await go("/dashboard");await page.getByRole("button",{name:"30D",exact:true}).click();await choose(yesterday);const longGeometry=await geometry();await choose(addCalendarDays(today,-17));assert.deepEqual(await geometry(),longGeometry,"long secondary readouts reserve width for the whole interval");assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await shot("long-readings-320");checks.push("long-interval-readings-stable");
 const touch=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,locale:"zh-CN",timezoneId:"Asia/Shanghai",reducedMotion:"reduce"});await touch.addCookies(await context.cookies());const tp=await touch.newPage();tp.on("pageerror",e=>errors.push(e.message));await tp.goto(base+"/dashboard");await tp.waitForLoadState("networkidle");assert.equal(await tp.locator('[data-overview-secondary]>div').count(),3);await tp.screenshot({path:resolve(art,"touch-landscape.png")});await touch.close();checks.push("real-coarse-pointer-landscape");
 await go("/dashboard");await page.getByRole("button",{name:"自定义",exact:true}).click();await page.getByLabel("总览开始日期").fill(addCalendarDays(today,-6));await page.getByLabel("总览结束日期").fill(yesterday);await page.getByRole("button",{name:"应用",exact:true}).click();await choose(yesterday);checks.push("custom-range-and-keyboard");
 const plain=await page.locator('[data-overview-week]').innerText();assert.equal(await page.getByLabel("显示体重估计",{exact:true}).count(),0);assert.equal(await page.locator('[data-overview-week]').innerText(),plain);checks.push("no-body-estimation-control");
 assert.deepEqual(errors,[]);assert.deepEqual(networkErrors,[]);
}catch(e){failure=e;console.error(e);}finally{await browser?.close();if(child){child.kill("SIGTERM");await once(child,"exit");}await sql.end();await writeFile(resolve(art,"server.log"),log);await writeFile(resolve(art,"report.json"),JSON.stringify({passed:!failure,engine,checks,screenshots,errors,networkErrors,failure:failure?.message},null,2));}
if(failure)process.exitCode=1;else console.log(JSON.stringify({engine,passed:true,checks:checks.length,screenshots:screenshots.length}));
