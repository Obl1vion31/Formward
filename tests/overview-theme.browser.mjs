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
import {createAiToken} from "../src/features/auth/ai-tokens.ts";
import {submitEnergyOperation,decideEnergyOperation} from "../src/features/activities/records.ts";
import {submitMealOperation,decideMealOperation,readMealSnapshot} from "../src/features/meals/records.ts";
import {setMealDayStatus} from "../src/features/meals/day-status.ts";
import {saveMeasurementDay} from "../src/features/measurements/editing.ts";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";

const engine=process.env.VISUAL_BROWSER||"chromium",artifacts=resolve(process.env.VISUAL_ARTIFACTS||".codex/overview-theme/"+engine);
await mkdir(artifacts,{recursive:true});
const pg=new PGlite(),db=drizzle(pg,{schema});await migrate(db,{migrationsFolder:"./drizzle"});
const account={email:"visual-owner@example.test",password:"fictional-visual-password-only"};
const owner=await provisionAccount(db,{...account,name:"虚构验收"});await initializeAccountOwner(db,owner.id);
await db.delete(schema.personalProfile).where(eq(schema.personalProfile.userId,owner.id));
const token=await createAiToken(db,owner.id,"虚构验收","write"),today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),yesterday=addCalendarDays(today,-1);
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
async function theme(p,value){await p.evaluate(v=>{localStorage.setItem("formward-theme",v);document.documentElement.setAttribute("data-theme",v);window.dispatchEvent(new Event("formward-theme-change"));},value);}
try{
 for(let i=0;i<150;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===149)throw Error("app startup");await new Promise(r=>setTimeout(r,200));}
 browser=await({chromium,webkit}[engine]).launch({headless:true,ignoreDefaultArgs:["--hide-scrollbars"]});
 const context=await browser.newContext({viewport:{width:1440,height:900},locale:"zh-CN",timezoneId:"Asia/Shanghai",reducedMotion:"reduce"});
 assert.equal((await context.request.post(base+"/api/auth/sign-in/email",{headers:{Origin:base},data:account})).status(),200);
 const p=await context.newPage();watch(p);await p.clock.install();p.setDefaultTimeout(15000);
 await go(p,"/dashboard");await p.locator('[data-overview-date="'+yesterday+'"]').focus();
 assert.equal(await p.locator("[data-overview-week] header").innerText(),"近7天 "+addCalendarDays(yesterday,-6).slice(5).replace("-",".")+"—"+yesterday.slice(5).replace("-",".")+"\n已计5/7天");
 const values=await p.locator("[data-overview-week] strong").allTextContents();
 assert.equal(Number(values[0].replace(/[^\d.-]/g,"")),expectedWeek);
 checks.push("actual-server-seven-day-sum-and-coverage","selected-morning-and-next-morning");
 await p.getByLabel("账号菜单",{exact:true}).click();await p.getByRole("radio",{name:"浅色",exact:true}).click();assert.equal(await p.locator("html").getAttribute("data-theme"),"light");
 await p.keyboard.press("Escape");await go(p,"/dashboard");assert.equal(await p.locator("html").getAttribute("data-theme"),"light");
 checks.push("menu-theme-switch","theme-persists-before-page-load");
 const sizes=[[320,560],[390,720],[430,780],[390,560],[844,390],[1100,900],[1366,768],[1440,900]];
 for(const [w,h]of sizes){
  await p.setViewportSize({width:w,height:h});
  for(const mode of ["dark","light"]){
   await theme(p,mode);
   for(const [name,path]of [["overview","/dashboard"],["meals","/dashboard/meals"],["energy","/dashboard/energy"],["body","/dashboard/measurements"]]){
    await go(p,path);await shot(p,mode+"-"+name+"-"+w+"x"+h);
    const dark=await p.locator("html").evaluate(el=>getComputedStyle(el).getPropertyValue("--graphite").trim());
    assert.equal(dark,mode==="dark"?"#10100f":"#fafaf8");
    const badUnits=await p.locator("[data-metric-number]").evaluateAll(nodes=>nodes.some(n=>n.scrollWidth>n.clientWidth+1));
    assert.equal(badUnits,false,name+" clipped metrics");
   }
  }
  checks.push("four-pages-both-themes-"+w+"x"+h);
 }
 await p.setViewportSize({width:390,height:720});await go(p,"/dashboard");
 assert.equal(await p.locator("[data-overview-week] button").getAttribute("aria-expanded"),"false");
 await p.locator("[data-overview-week] button").click();await shot(p,"phone-week-expanded");assert.equal(await p.locator("[data-overview-week] button").getAttribute("aria-expanded"),"true");
 await p.locator("[data-overview-week] button").click();checks.push("phone-week-collapsed-until-requested");
 await p.setViewportSize({width:1440,height:900});await theme(p,"light");await go(p,"/dashboard/energy");
 await p.locator('[data-record-date="'+today+'"]').getByRole("button",{name:"录入",exact:true}).click();
 const dialog=p.getByRole("dialog",{name:"每日消耗",exact:true});await dialog.waitFor();await shot(p,"light-energy-editor-top");await dialog.getByLabel("静息 · kcal",{exact:true}).fill("1950");await dialog.getByLabel("活动合计 · kcal",{exact:true}).fill("215");
 await dialog.locator("summary").filter({hasText:"填写方式"}).click();await dialog.getByRole("button",{name:/改用运动/}).click();await p.getByRole("dialog").filter({has:p.getByRole("heading",{name:"改用运动明细相加？",exact:true})}).waitFor();
 await shot(p,"light-switch-confirm");await p.getByRole("button",{name:"取消",exact:true}).click();await dialog.getByRole("button",{name:"关闭编辑",exact:true}).click();await p.getByRole("button",{name:"放弃修改",exact:true}).click();await dialog.waitFor({state:"hidden"});
 checks.push("light-editor-and-destructive-confirmation");
 const aiResponse=await context.request.post(base+"/api/v1/record-operations",{headers:{Authorization:"Bearer "+token.rawToken},data:{operationId:randomUUID(),items:[{key:"visual-tutorial-meal",kind:"save_meal",date:yesterday,mealType:"午餐",timezone:"Asia/Shanghai",items:[{kind:"food",name:"蔬菜鸡蛋三明治（虚构验收用的长名称）",quantity:"1",unit:"份",nutritionBasis:"consumed_total",nutrition:{caloriesKcal:"312",proteinG:"20",carbsG:"40",fatG:"8"},sourceKind:"reference",basis:"虚构数据，仅作视觉检查"}]}]}});
 assert.equal(aiResponse.status(),200);const ai=await aiResponse.json();
 for(const [w,h]of [[390,720],[1440,900]]){await p.setViewportSize({width:w,height:h});for(const mode of ["dark","light"]){await theme(p,mode);await go(p,new URL(ai.confirmationUrl).pathname);await shot(p,mode+"-ai-confirm-"+w);}}
 checks.push("ai-confirmation-both-themes-phone-desktop");
 await p.setViewportSize({width:1440,height:900});await theme(p,"light");
 await go(p,"/onboarding?mode=test");assert.equal(await p.getByText("这些资料可以以后再补。",{exact:true}).count(),0);assert.equal(await p.getByText("不知道可以留空",{exact:true}).count(),0);
 await shot(p,"light-first-use-profile");await p.getByRole("button",{name:"暂时跳过",exact:true}).click();await p.locator("[data-tutorial-guide]").waitFor();
 assert.equal(await p.locator(".guide-intro").count(),0);await shot(p,"light-tutorial-directory",true);
 await p.emulateMedia({reducedMotion:"no-preference"});await go(p,"/dashboard/tutorial");await p.locator('[data-directory-topic="body"]').click();
 await p.waitForFunction(()=>{const v=document.querySelector("[data-directory-preview]");return v&&!v.paused&&v.currentTime>.1;});
 const before=await p.locator("[data-directory-preview]").evaluate(v=>v.currentTime);await p.waitForTimeout(500);const after=await p.locator("[data-directory-preview]").evaluate(v=>v.currentTime);assert.ok(after!==before);assert.equal(await p.locator("[data-preview-toggle]").textContent(),"暂停预览");
 await p.locator("[data-open-preview]").click();await p.locator(".tutorial-modal[open]").waitFor();await shot(p,"light-tutorial-full");await p.getByRole("button",{name:"文字版",exact:true}).filter({visible:true}).click();await shot(p,"light-tutorial-text");await p.keyboard.press("Escape");checks.push("body-preview-progress-and-honest-label","full-tutorial-explicit-watch","text-mode");
 await p.setViewportSize({width:390,height:720});await go(p,"/dashboard/tutorial");await p.getByRole("tab",{name:"身体",exact:true}).click();await shot(p,"light-phone-tutorial-before");await p.locator(".mobile-guide .lesson-play").click();await p.waitForFunction(()=>{const v=document.querySelector(".mobile-guide video");return v&&!v.paused&&v.currentTime>.1});const phoneFrame=await p.locator(".mobile-guide .lesson-frame").boundingBox();assert.ok(phoneFrame.y>=0&&phoneFrame.y+phoneFrame.height<=720,"normal phone shows the entire recording after first play");const fullscreen=p.getByRole("button",{name:"全屏观看",exact:true});assert.equal(await fullscreen.count(),1);const fullBox=await fullscreen.boundingBox();assert.ok(fullBox.y>=0&&fullBox.y+fullBox.height<=720,"fullscreen stays in sight");await shot(p,"light-phone-tutorial-playing");
 await theme(p,"dark");await shot(p,"dark-phone-tutorial-playing");checks.push("phone-original-aspect-and-playing");
 // 模拟新版本响应，覆盖失败恢复、草稿保护及同版本不重复提示；真实双构建另测。
 await p.setViewportSize({width:390,height:720});await p.emulateMedia({reducedMotion:"reduce"});await go(p,"/dashboard/profile");await p.getByRole("button",{name:"修改资料",exact:true}).click();await p.getByLabel("身高",{exact:true}).fill("172");
 const current=(await(await context.request.get(base+"/api/app-version")).json()).version;
 assert.notEqual(current,"development");
 let served=current;
 await p.route("**/api/app-version",route=>route.fulfill({json:{version:served},headers:{"Cache-Control":"no-store"}}));
 await p.clock.fastForward(90001);await p.waitForTimeout(50);assert.equal(await p.getByLabel("应用版本更新",{exact:true}).count(),0);
 served="next-fictional-build";await p.clock.fastForward(90001);await p.getByLabel("应用版本更新",{exact:true}).waitFor();await shot(p,"phone-app-update");
 await p.getByRole("button",{name:"刷新",exact:true}).click();await p.getByRole("heading",{name:"刷新到新版本？",exact:true}).waitFor();await shot(p,"phone-refresh-draft-confirm");await p.getByRole("dialog",{name:"刷新到新版本？",exact:true}).getByRole("button",{name:"取消",exact:true}).click();assert.equal(await p.getByLabel("身高",{exact:true}).inputValue(),"172");
 await p.getByRole("button",{name:"稍后",exact:true}).click();await p.clock.fastForward(90001);assert.equal(await p.getByLabel("应用版本更新",{exact:true}).count(),0);checks.push("same-version-no-prompt","new-version-refresh-prompt","cancel-keeps-profile-draft","later-not-repeated");
 await p.clock.resume();
 await context.close();assert.deepEqual(errors,[]);assert.deepEqual(networkErrors,[]);
}catch(error){failure=String(error);if(browser){for(const c of browser.contexts())for(const p of c.pages())if(!p.isClosed())await writeFile(resolve(artifacts,"playback-state.json"),JSON.stringify(await p.evaluate(()=>({hidden:document.hidden,toggle:document.querySelector("[data-preview-toggle]")?.textContent,videos:[...document.querySelectorAll("video")].map(v=>({src:v.currentSrc,time:v.currentTime,paused:v.paused,ready:v.readyState,error:v.error?.message}))})),null,2));for(const c of browser.contexts())for(const p of c.pages())if(!p.isClosed()){await p.screenshot({path:resolve(artifacts,"failure.png"),fullPage:true}).catch(()=>{});await writeFile(resolve(artifacts,"failure.html"),await p.content());break;}}}
finally{
 await browser?.close();if(child.exitCode===null){child.kill("SIGTERM");await once(child,"exit");}await socket.stop();await new Promise(r=>setTimeout(r,100));await pg.close();
 await writeFile(resolve(artifacts,"server.log"),log);await writeFile(resolve(artifacts,"report.json"),JSON.stringify({passed:!failure,failure,engine,checks,shots,errors,networkErrors,fixture:"isolated in-memory database; fictional accounts only",notTested:["physical iPhone","system soft keyboard","native system fullscreen"]},null,2)+"\n");
 console.log(JSON.stringify({passed:!failure,failure,engine,checks:checks.length,screenshots:shots.length,errors,networkErrors}));if(failure)process.exitCode=1;
}
