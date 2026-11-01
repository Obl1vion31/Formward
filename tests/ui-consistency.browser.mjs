import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {createServer} from "node:net";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {PGLiteSocketServer} from "@electric-sql/pglite-socket";
import {drizzle} from "drizzle-orm/pglite";
import {migrate} from "drizzle-orm/pglite/migrator";
import {eq} from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import {provisionAccount} from "../src/features/auth/provision.ts";
import {initializeAccountOwner} from "../src/features/auth/account-management.ts";
import {submitEnergyOperation,decideEnergyOperation} from "../src/features/activities/records.ts";
import {submitMealOperation,decideMealOperation,readMealSnapshot} from "../src/features/meals/records.ts";
import {setMealDayStatus} from "../src/features/meals/day-status.ts";
import {saveMeasurementDay} from "../src/features/measurements/editing.ts";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";

const engine=process.env.VISUAL_BROWSER||"chromium",artifacts=resolve(process.env.VISUAL_ARTIFACTS||".codex/ui-consistency/"+engine);
await mkdir(artifacts,{recursive:true});
const pg=new PGlite(),db=drizzle(pg,{schema});await migrate(db,{migrationsFolder:"./drizzle"});
const account={email:"visual-owner@example.test",password:"fictional-visual-password-only"};
const owner=await provisionAccount(db,{...account,name:"虚构验收"});await initializeAccountOwner(db,owner.id);
await db.delete(schema.personalProfile).where(eq(schema.personalProfile.userId,owner.id));
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),yesterday=addCalendarDays(today,-1);
const expectedBalances=[];
for(let i=-35;i<=0;i++){
 const date=addCalendarDays(today,i);
 if(i!==-11)await saveMeasurementDay(db,{userId:owner.id,actorId:owner.id},{operationId:randomUUID(),date,timezone:"Asia/Shanghai",periods:{daytime:{weightKg:(69.8+i*.026+Math.sin(i*.7)*.25).toFixed(2),bodyFatPercent:i===-3?null:(18.4+Math.sin(i*.3)*.6).toFixed(2),fasting:true,deviceLabel:"虚构秤"},evening:{weightKg:(70.3+i*.026).toFixed(2),bodyFatPercent:"18.90",fasting:false,deviceLabel:"虚构秤"}}});
 if(i===0)continue;
 const calories=i===-18?4500:i===-14?1050:Math.round(2350+Math.sin(i*.9)*460);
 const active=i===-9?1151:i===-5?0:Math.round(420+Math.cos(i*.6)*350),total=1950+active;
 const energy=await submitEnergyOperation(db,{userId:owner.id,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_energy_day",date,entryMode:"components",activityMode:"total",restingKcal:"1950",activeKcal:String(active),restingSourceSystem:"虚构手表",activeSourceSystem:"虚构手表"}]});
 await decideEnergyOperation(db,owner.id,energy.id,energy.revision,"confirm");
 if(i===-7||i===-4)continue;
 const op=await submitMealOperation(db,{userId:owner.id,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_meal",date,mealType:"午餐",items:[{kind:"food",name:i===-3?"蔬菜鸡肉饭与一份长名称的无糖酸奶（虚构）":"鸡肉饭 · 虚构餐次",quantity:"1",unit:"份",nutritionBasis:"consumed_total",sourceKind:"reference",nutrition:{caloriesKcal:String(calories),proteinG:"120",carbsG:"260",fatG:i===-3?null:"70"}}]}]});
 await decideMealOperation(db,owner.id,op.id,op.revision,"confirm");
 const snapshot=await readMealSnapshot(db,owner.id),day=snapshot.meals.find(m=>m.date===date).day;
 await setMealDayStatus(db,owner.id,{operationId:randomUUID(),date,status:"complete",version:day.version,contentDigest:day.contentDigest});
 if(i>=-7)expectedBalances.push(calories-total);
}
const expectedWeek=expectedBalances.reduce((sum,n)=>sum+n,0);
const socket=new PGLiteSocketServer({db:pg,host:"127.0.0.1",port:0,maxConnections:10});await socket.start();
const net=createServer();net.listen(0,"127.0.0.1");await once(net,"listening");const port=net.address().port;await new Promise(r=>net.close(r));
const base="http://127.0.0.1:"+port,child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{env:{PATH:process.env.PATH,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH,FONTCONFIG_FILE:process.env.FONTCONFIG_FILE,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",DATABASE_URL:"postgresql://postgres:postgres@"+socket.getServerConn()+"/postgres?max=1",BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:"fictional-visual-browser-secret-more-than-thirty-two",FORMWARD_TIMEZONE:"Asia/Shanghai"},stdio:["ignore","pipe","pipe"]});
let log="",browser,failure=null;const checks=[],shots=[],errors=[],networkErrors=[];
child.stdout.on("data",b=>{log+=b});child.stderr.on("data",b=>{log+=b});
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||"/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
function watch(p){p.on("pageerror",e=>errors.push(e.message));p.on("response",r=>{if(r.status()>=500)networkErrors.push(r.status()+" "+new URL(r.url()).pathname)});}
async function go(p,path){await p.goto(base+path);await p.waitForLoadState("networkidle");await p.waitForFunction(()=>!document.querySelector(".page-loading-dialog[open]"));await p.evaluate(()=>document.fonts.ready);}
async function shot(p,name,fullPage=false){await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+" overflow");const path=resolve(artifacts,name+".png");await p.screenshot({path,fullPage});shots.push(path);}
async function theme(p,value){if(!p.url().startsWith(base))await go(p,"/dashboard");await p.evaluate(v=>{localStorage.setItem("formward-theme",v);document.documentElement.setAttribute("data-theme",v);window.dispatchEvent(new Event("formward-theme-change"));},value);}
try{
 for(let i=0;i<150;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===149)throw Error("app startup");await new Promise(r=>setTimeout(r,200));}
 browser=await({chromium,webkit}[engine]).launch({headless:true,ignoreDefaultArgs:["--hide-scrollbars"]});
 const context=await browser.newContext({viewport:{width:1440,height:900},locale:"zh-CN",timezoneId:"Asia/Shanghai",reducedMotion:"reduce"});
 assert.equal((await context.request.post(base+"/api/auth/sign-in/email",{headers:{Origin:base},data:account})).status(),200);
 const p=await context.newPage();watch(p);p.setDefaultTimeout(15000);
 const contrast=async selector=>p.locator(selector).evaluateAll(nodes=>{
  const l=color=>{const v=color.match(/[0-9.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return .2126*v[0]+.7152*v[1]+.0722*v[2]};
  const bg=getComputedStyle(document.documentElement).getPropertyValue("--graphite").trim();
  const probe=document.createElement("span");probe.style.color=bg;document.body.append(probe);const b=getComputedStyle(probe).color;probe.remove();
  return nodes.filter(n=>n.getBoundingClientRect().width>0).map(n=>{const c=getComputedStyle(n).fill;return(Math.max(l(c),l(b))+.05)/(Math.min(l(c),l(b))+.05)});
 });
 const paths=[["overview","/dashboard"],["meals","/dashboard/meals"],["energy","/dashboard/energy"],["body","/dashboard/measurements"]];
 for(const[w,h]of[[320,560],[390,720],[430,780],[390,560],[844,390],[1100,900],[1440,900],[1920,1080]]){
  await p.setViewportSize({width:w,height:h});
  for(const mode of["dark","light"]){
   await theme(p,mode);const signatures={};
   for(const[name,path]of paths){
    await go(p,path);await p.evaluate(()=>scrollTo(0,0));
    if(name==="overview"){
     assert.equal(await p.locator('[data-record-slot="metrics"]>div').count(),6);
     if(w>=1100){
      const ys=await p.locator('[data-record-slot="metrics"]>div>span:first-child').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().y));assert.ok(Math.max(...ys)-Math.min(...ys)<2,"six desktop metrics in one row");const baselines=await p.locator('[data-metric-number]>span').evaluateAll(ns=>ns.map(n=>{const marker=document.createElement("i");Object.assign(marker.style,{display:"inline-block",width:"0",height:"0",padding:"0",margin:"0",verticalAlign:"baseline"});n.append(marker);const y=marker.getBoundingClientRect().y;marker.remove();return y;}));assert.ok(Math.max(...baselines)-Math.min(...baselines)<=2,"six numbers share a baseline: "+JSON.stringify(baselines));
      assert.ok((await p.locator("[data-overview-week]").boundingBox()).height<=58,"weekly summary compact");
      const week=await p.locator("[data-overview-week] strong").allTextContents();assert.equal(Number(week[0].replace(/[^0-9.-]/g,"")),expectedWeek);
     }
    }else{
     const recent=p.getByRole("region",{name:"最近记录",exact:true});const buttons=recent.locator('[data-record-date="'+today+'"] [data-record-actions] button');
     const first=buttons.first();await first.waitFor();if(w>=1100){const offset=await first.evaluate(n=>{const row=n.closest("[data-record-date]");return n.getBoundingClientRect().y-row.getBoundingClientRect().y-parseFloat(getComputedStyle(row).paddingTop);});assert.ok(Math.abs(offset)<=2,"record controls align to row top");}signatures[name]=await first.evaluate(n=>{const s=getComputedStyle(n);if(matchMedia("(prefers-reduced-motion:reduce)").matches&&s.transitionDuration!=="0s")throw Error("record controls must respect reduced motion");return[s.fontFamily,s.fontSize,s.lineHeight,s.color,s.borderTopWidth,s.borderTopColor,s.borderRadius,s.padding,s.minHeight].join("|")});
     const axes=await contrast(name==="body"?'[data-chart-metric="weightKg"] svg text:not([class*="empty"])':'[data-record-slot="plot"] svg text[class*="axis"]');assert.ok(axes.every(n=>n>=4.5),name+" readable axes");
    }
    await shot(p,mode+"-"+name+"-"+w+"x"+h);
   }
   assert.equal(signatures.meals,signatures.energy,"same meal and energy record controls");assert.equal(signatures.energy,signatures.body,"same body record controls");
  }
  checks.push("four-pages-two-themes-"+w+"x"+h);
 }
 await p.setViewportSize({width:1440,height:900});await theme(p,"dark");const hoverStyles={};
 for(const[name,path]of paths.slice(1)){
  await go(p,path);const recent=p.getByRole("region",{name:"最近记录",exact:true});
  const b=recent.locator('[data-record-actions] button').first();await b.hover();await p.waitForTimeout(190);hoverStyles[name]=await b.evaluate(n=>{const s=getComputedStyle(n);return[s.color,s.backgroundColor,s.borderTopColor,s.fontSize].join("|")});await shot(p,name+"-recent-hover");
  await b.focus();await p.keyboard.press("Tab");await shot(p,name+"-recent-focus");
  await recent.getByRole("button",{name:"查看全部 ↓",exact:true}).click();await shot(p,name+"-history-open",true);
  assert.equal(await recent.locator("[data-record-history]").isVisible(),true);await recent.getByRole("button",{name:"收起历史 ↑",exact:true}).click();assert.equal(await recent.locator("[data-record-history]").isVisible(),false);
 }
 assert.equal(hoverStyles.meals,hoverStyles.energy);assert.equal(hoverStyles.energy,hoverStyles.body);checks.push("shared-record-controls-normal-hover-focus-and-history");
 await p.setViewportSize({width:390,height:720});await go(p,"/dashboard");
 const toggle=p.locator("[data-overview-week]>button");assert.equal(await toggle.getAttribute("aria-expanded"),"false");await toggle.click();await shot(p,"phone-week-expanded");await toggle.click();checks.push("mobile-week-collapsed-and-expanded");
 for(const[w,h]of[[1440,900],[390,720],[320,560]]){
  await p.setViewportSize({width:w,height:h});
  for(const mode of["dark","light"]){
   await theme(p,mode);await go(p,"/dashboard/meals");
   const recent=p.getByRole("region",{name:"最近记录",exact:true});assert.equal(await recent.getByRole("button",{name:"食材库",exact:true}).count(),1);
   await recent.locator('[data-record-date="'+today+'"] [data-record-actions] button').first().click();
   const dialog=p.getByRole("dialog",{name:"记录一餐",exact:true});await dialog.waitFor();
   const save=dialog.getByRole("button",{name:/^保存餐次/});assert.equal(await save.isDisabled(),true);
   await shot(p,mode+"-meal-empty-"+w);
   await dialog.getByLabel("自由填写食物名称",{exact:true}).fill("虚构热量测试食物");
   await dialog.getByLabel("本次热量 1",{exact:true}).fill("0");assert.equal(await save.isDisabled(),true);
   const countBefore=(await readMealSnapshot(db,owner.id)).meals.length;await dialog.getByLabel("本次热量 1",{exact:true}).press("Enter");await p.waitForTimeout(80);assert.equal((await readMealSnapshot(db,owner.id)).meals.length,countBefore);
   await dialog.getByLabel("本次蛋白质 1",{exact:true}).fill("20");assert.equal(await save.isEnabled(),true);
   const bounds=await dialog.locator('input:not([type="file"]),textarea,select').evaluateAll(ns=>ns.filter(n=>n.getBoundingClientRect().width>0&&!n.readOnly).map(n=>{const s=getComputedStyle(n);return [s.borderTopStyle,parseFloat(s.borderTopWidth),parseFloat(s.fontSize),n.getBoundingClientRect().height]}));assert.ok(bounds.every(v=>v[0]==="solid"&&v[1]>=1&&v[2]>=16&&v[3]>=44),"visible editable controls");
   await shot(p,mode+"-meal-filled-top-"+w);
   await dialog.getByLabel("餐次备注",{exact:true}).fill("仅为虚构测试");await dialog.getByLabel("餐次备注",{exact:true}).scrollIntoViewIfNeeded();await shot(p,mode+"-meal-bottom-"+w);
   assert.equal(await dialog.getByRole("button",{name:"＋ 添加照片",exact:true}).count(),1);
   const sb=await save.boundingBox(),dbox=await dialog.boundingBox();assert.ok(sb.y>=dbox.y&&sb.y+sb.height<=dbox.y+dbox.height,"save remains visible");
   if(w===1440&&mode==="dark"){
    let release;await p.route("**/api/meal-images/upload",async route=>{await new Promise(r=>{release=r;});await route.fulfill({status:400,contentType:"application/json",body:JSON.stringify({error:"虚构测试：照片上传失败"})});});
    const chooser=p.waitForEvent("filechooser");await dialog.getByRole("button",{name:"＋ 添加照片",exact:true}).click();await(await chooser).setFiles({name:"虚构验收.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6WQAAAAASUVORK5CYII=","base64")});
    await p.waitForFunction(()=>document.querySelector('button[type="submit"]:disabled')!==null);assert.equal(await save.isDisabled(),true);while(!release)await p.waitForTimeout(10);release();await dialog.getByRole("button",{name:"重试未完成照片",exact:true}).waitFor();assert.equal(await dialog.getByLabel("食物名称 1",{exact:true}).inputValue(),"虚构热量测试食物");assert.equal(await save.isEnabled(),true);await shot(p,"photo-failure-keeps-input");await p.unroute("**/api/meal-images/upload");checks.push("photo-button-opens-picker-upload-blocks-save-and-failure-keeps-input");
   }

   await dialog.getByRole("button",{name:"关闭编辑",exact:true}).click();await p.getByRole("button",{name:"放弃修改",exact:true}).click();await dialog.waitFor({state:"hidden"});
  }
 }
 checks.push("meal-blank-zero-partial-and-visible-fields-phone-desktop","meal-sticky-save-and-photo-button");
 await p.setViewportSize({width:1440,height:900});await theme(p,"light");await go(p,"/dashboard/meals");
 await p.getByRole("region",{name:"最近记录",exact:true}).locator('[data-record-date="'+today+'"] [data-record-actions] button').first().click();
 let dialog=p.getByRole("dialog",{name:"记录一餐",exact:true});await dialog.getByLabel("自由填写食物名称",{exact:true}).fill("虚构部分营养餐");await dialog.getByLabel("本次蛋白质 1",{exact:true}).fill("20");
 await dialog.getByRole("button",{name:/^保存餐次/}).click();await dialog.waitFor({state:"hidden"});await p.waitForLoadState("networkidle");
 const saved=(await readMealSnapshot(db,owner.id)).meals.find(m=>m.date===today);assert.equal(saved.totals.values.proteinG,"20.0000");assert.equal(saved.totals.values.caloriesKcal,null);checks.push("actual-server-saves-partial-meal");
 for(const[w,h]of[[1440,900],[390,720],[320,560]]){
  await p.setViewportSize({width:w,height:h});await go(p,"/dashboard/energy");
  await p.getByRole("region",{name:"最近记录",exact:true}).locator('[data-record-date="'+today+'"] [data-record-actions] button').first().click();
  const d=p.getByRole("dialog",{name:"每日消耗",exact:true});const save=d.getByRole("button",{name:/^保存 ·/});assert.equal(await save.isDisabled(),true);
  await d.getByLabel("静息 · kcal",{exact:true}).fill("2058");assert.equal(await save.isEnabled(),true);await shot(p,"energy-partial-"+w);
  await d.getByRole("button",{name:"只记总数",exact:true}).click();assert.equal(await save.isDisabled(),true);
  await d.getByLabel("全天总消耗 · kcal",{exact:true}).fill("0");assert.equal(await save.isDisabled(),true);
  await d.getByLabel("全天总消耗 · kcal",{exact:true}).fill("2200");assert.equal(await save.isEnabled(),true);await shot(p,"energy-total-"+w);
  await d.getByRole("button",{name:"关闭编辑",exact:true}).click();await p.getByRole("button",{name:"放弃修改",exact:true}).click();await d.waitFor({state:"hidden"});
 }
 checks.push("energy-active-mode-only-positive-partial-zero");

 await p.setViewportSize({width:1440,height:900});await go(p,"/dashboard");
 const positions=()=>p.locator('[data-record-slot="metrics"],[data-record-slot="range"],[data-record-slot="title"],[data-record-slot="plot"]').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().y));
 await p.evaluate(()=>scrollTo(0,0));const beforeSelection=await positions();for(const target of[p.locator("[data-overview-date]").first(),p.locator("[data-overview-date]").last()]){const box=await target.boundingBox();await p.mouse.move(box.x+box.width/2,Math.max(box.y,0)+50);}assert.deepEqual(await positions(),beforeSelection);await p.locator("[data-overview-date]").last().focus();await p.keyboard.press("ArrowLeft");await p.keyboard.press("Escape");checks.push("hover-and-keyboard-do-not-shift-layout");
 const long=await submitMealOperation(db,{userId:owner.id,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_meal",date:yesterday,mealType:"虚构长数字",items:Array.from({length:20},(_,i)=>({kind:"food",name:"虚构大数值"+i,quantity:"1",unit:"份",sourceKind:"reference",nutritionBasis:"consumed_total",nutrition:{caloriesKcal:"1000000",proteinG:null,carbsG:null,fatG:null}}))}]});await decideMealOperation(db,owner.id,long.id,long.revision,"confirm");
 const longDay=(await readMealSnapshot(db,owner.id)).meals.find(m=>m.date===yesterday).day;await setMealDayStatus(db,owner.id,{operationId:randomUUID(),date:yesterday,status:"complete",version:longDay.version,contentDigest:longDay.contentDigest});
 for(const[w,h]of[[1100,900],[320,560]]){await p.setViewportSize({width:w,height:h});await go(p,"/dashboard");const cols=Number(await p.locator('[data-record-slot="metrics"]').getAttribute("data-record-columns"));assert.ok(cols<6);assert.equal(await p.locator("[data-metric-number]").evaluateAll(ns=>ns.some(n=>n.scrollWidth>n.clientWidth+1)),false);await shot(p,"long-values-"+w);const columnsBefore=await p.locator('[data-record-slot="metrics"]').getAttribute("data-record-columns");for(const target of[p.locator("[data-overview-date]").first(),p.locator("[data-overview-date]").last()]){await target.focus();await p.waitForTimeout(40);assert.equal(await p.locator('[data-record-slot="metrics"]').getAttribute("data-record-columns"),columnsBefore);}}
 checks.push("large-numbers-wrap-metrics-without-shrinking-or-clipping");
 const touch=await browser.newContext({storageState:await context.storageState(),viewport:{width:390,height:720},locale:"zh-CN",timezoneId:"Asia/Shanghai",isMobile:true,hasTouch:true,reducedMotion:"reduce"});const tp=await touch.newPage();watch(tp);await go(tp,"/dashboard/meals");const bar=tp.locator("[data-bar-date]").nth(2);await bar.tap();const chosen=await bar.getAttribute("data-bar-date");assert.equal(await tp.locator('[data-record-slot="metrics"]').getAttribute("data-selected-date"),chosen);await shot(tp,"touch-selected-day");await touch.close();checks.push("touch-selects-date");
 await context.close();assert.deepEqual(errors,[]);assert.deepEqual(networkErrors,[]);
}catch(error){failure=String(error);if(browser)for(const c of browser.contexts())for(const p of c.pages())if(!p.isClosed()){await p.screenshot({path:resolve(artifacts,"failure.png"),fullPage:true}).catch(()=>{});await writeFile(resolve(artifacts,"failure.html"),await p.content());break;}}
finally{
 await browser?.close();if(child.exitCode===null){child.kill("SIGTERM");await once(child,"exit");}await socket.stop();await new Promise(r=>setTimeout(r,100));await pg.close();
 await writeFile(resolve(artifacts,"server.log"),log);await writeFile(resolve(artifacts,"report.json"),JSON.stringify({passed:!failure,failure,engine,checks,shots,errors,networkErrors,fixture:"isolated in-memory database; fictional accounts only",notTested:["physical iPhone","system soft keyboard","native system fullscreen"]},null,2)+"\n");
 console.log(JSON.stringify({passed:!failure,failure,engine,checks:checks.length,screenshots:shots.length,errors,networkErrors}));if(failure)process.exitCode=1;
}
