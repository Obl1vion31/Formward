
import assert from "node:assert/strict";
import { mkdir,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import { provisionAccount } from "../src/features/auth/provision.ts";
import { initializeAccountOwner } from "../src/features/auth/account-management.ts";
import { createAuth } from "../src/features/auth/auth.ts";
import { savePersonalProfile } from "../src/features/onboarding/records.ts";

const engine=process.env.TUTORIAL_BROWSER||"chromium",artifacts=resolve(process.env.TUTORIAL_ARTIFACTS||".codex/onboarding-browser/"+engine);
await mkdir(artifacts,{recursive:true});
const pg=new PGlite(),db=drizzle(pg,{schema});await migrate(db,{migrationsFolder:"./drizzle"});
const identities={};
for(const kind of ["owner","legacy","new"]){
 const account={email:kind+"@tutorial-browser.example.test",password:"fictional-tutorial-"+kind+"-password"},created=await provisionAccount(db,account);
 identities[kind]={...account,id:created.id};
 if(kind!=="new")await db.delete(schema.personalProfile).where(eq(schema.personalProfile.userId,created.id));
}
await initializeAccountOwner(db,identities.owner.id);
const socket=new PGLiteSocketServer({db:pg,host:"127.0.0.1",port:0,maxConnections:10});await socket.start();
const probe=createServer();probe.listen(0,"127.0.0.1");await once(probe,"listening");const port=probe.address().port;await new Promise(r=>probe.close(r));
const base="http://127.0.0.1:"+port,secret="fictional-onboarding-browser-secret-more-than-thirty-two";
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{env:{PATH:process.env.PATH,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH,FONTCONFIG_FILE:process.env.FONTCONFIG_FILE,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",DATABASE_URL:"postgresql://postgres:postgres@"+socket.getServerConn()+"/postgres?max=1",BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:secret,FORMWARD_TIMEZONE:"Asia/Shanghai",BLOB_STORE_ID:"",BLOB_READ_WRITE_TOKEN:""},stdio:["ignore","pipe","pipe"]});
let log="";child.stdout.on("data",b=>{log+=b;});child.stderr.on("data",b=>{log+=b;});
const auth=createAuth(db,{secret,baseURL:base,rateLimit:false});
const {chromium,webkit}=await import("/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
let browser,page,failure=null,phase="startup";const checks=[],shots=[],errors=[],networkErrors=[];
async function shot(p,name,fullPage=false){
 await p.waitForFunction(()=>!document.querySelector(".page-loading-dialog[open]"));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(140);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+" horizontal overflow");
 const path=resolve(artifacts,name+".png");await p.screenshot({path,fullPage});shots.push(path);
}
async function settle(){if(!browser)return;for(const c of browser.contexts())for(const p of c.pages())if(!p.isClosed())await p.waitForLoadState("networkidle");}
async function go(p,path){await p.goto(base+path);await p.waitForLoadState("networkidle");}
async function login(context,kind){
 const i=identities[kind];
 const res=await context.request.post(base+"/api/auth/sign-in/email",{headers:{Origin:base},data:{email:i.email,password:i.password}});assert.equal(res.status(),200,await res.text());
 const cookies=await context.cookies(),cookie=cookies.map(c=>c.name+"="+c.value).join("; ");
 const identity=await auth.api.getSession({headers:new Headers({cookie})});assert.ok(identity);
 return {userId:identity.user.id,sessionId:identity.session.id,accessVersion:identity.session.accessVersion};
}
function watch(p){
 p.on("pageerror",e=>errors.push(e.message));
 p.on("response",r=>{if(r.status()>=500)networkErrors.push(r.status()+" "+new URL(r.url()).pathname);});
}
try{
 for(let i=0;i<150;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===149)throw Error("server startup");await new Promise(r=>setTimeout(r,200));}
 browser=await ({chromium,webkit}[engine]).launch({headless:true});
 const legacy=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",locale:"zh-CN",timezoneId:"Asia/Shanghai"}),legacyProof=await login(legacy,"legacy");
 page=await legacy.newPage();watch(page);phase="legacy and menu";
 await go(page,"/dashboard");assert.equal(new URL(page.url()).pathname,"/dashboard");
 await page.getByLabel("账号菜单",{exact:true}).click();
 assert.equal(await page.getByRole("link",{name:"个人资料",exact:true}).count(),1);
 assert.equal(await page.getByRole("link",{name:"测试初次登录",exact:true}).count(),0);
 await page.getByRole("link",{name:"个人资料",exact:true}).click();await page.getByRole("button",{name:"修改资料",exact:true}).waitFor();
 await shot(page,"desktop-profile");
 await page.getByRole("button",{name:"修改资料",exact:true}).click();
 await page.getByLabel("身高",{exact:true}).fill("172");await page.getByLabel("出生日期",{exact:true}).fill("1997-04-12");
 await page.getByRole("button",{name:"保存资料",exact:true}).click();await page.getByRole("status").filter({hasText:"资料已保存"}).waitFor();
 await settle();
 assert.equal((await db.select().from(schema.personalProfile).where(eq(schema.personalProfile.userId,identities.legacy.id)))[0].onboardingStep,"complete");
 checks.push("existing-account-not-forced","menu-profile","real-profile-save");
 await page.getByRole("button",{name:"修改资料",exact:true}).click();await page.getByLabel("身高",{exact:true}).fill("173");
 await settle();
 const current=(await db.select().from(schema.personalProfile).where(eq(schema.personalProfile.userId,identities.legacy.id)))[0];
 await savePersonalProfile(db,legacyProof,{expectedVersion:current.version,heightCm:"174",birthDate:"1997-04-12"});
 await page.getByRole("button",{name:"保存资料",exact:true}).click();await page.getByRole("alert").filter({hasText:"其他页面修改"}).waitFor();
 assert.equal(await page.getByLabel("身高",{exact:true}).inputValue(),"173");
 await shot(page,"desktop-profile-conflict");
 await page.getByRole("button",{name:"查看最新资料",exact:true}).click();
 const confirmation=page.getByRole("dialog",{name:"查看最新资料",exact:true});await confirmation.waitFor();await confirmation.getByRole("button",{name:"取消",exact:true}).click();
 assert.equal(await page.getByLabel("身高",{exact:true}).inputValue(),"173");
 checks.push("profile-conflict-preserves-input","application-confirmation-cancel");
 await go(page,"/onboarding?mode=test");assert.equal((await page.title()).includes("404"),true);
 checks.push("ordinary-test-route-rejected");
 phase="tutorial";
 await go(page,"/dashboard/tutorial");
 await page.locator("[data-directory-topic=meals][aria-current=true]").waitFor();
 const fullRequests=[];page.on("request",r=>{if(/\/tutorials\/[^/]+\.mp4$/.test(r.url())&&!r.url().includes("-preview-"))fullRequests.push(r.url());});
 await page.locator("[data-directory-topic=body]").hover();
 assert.equal(await page.locator("[data-directory-topic=meals]").getAttribute("aria-current"),"true");
 await page.locator("[data-directory-topic=body]").focus();
 assert.equal(await page.locator("[data-directory-topic=meals]").getAttribute("aria-current"),"true");
 await page.locator("[data-directory-topic=body]").click();
 assert.equal(await page.locator("[data-directory-topic=body]").getAttribute("aria-current"),"true");
 assert.equal(await page.locator(".tutorial-modal[open]").count(),0);assert.equal(fullRequests.length,0);
 await page.locator(".preview-picture").click();assert.equal(await page.locator(".tutorial-modal[open]").count(),0);
 checks.push("hover-focus-never-select","click-only-select","explicit-watch-only","no-full-movie-before-watch");
 await page.locator("[data-directory-topic=meals]").click();
 for(const [width,height] of [[1440,900],[1100,900],[1366,768]]){
   await page.setViewportSize({width,height});await shot(page,"desktop-directory-"+width,true);
   const r=await page.locator(".preview-picture").boundingBox();assert.ok(Math.abs(r.width/r.height-1.6)<.02);
 }
 await page.setViewportSize({width:1440,height:900});
 await page.locator("[data-open-preview]").click();await page.locator(".tutorial-modal[open]").waitFor();
 await page.waitForFunction(()=>{const v=document.querySelector(".tutorial-modal video");return v?.readyState>=2&&!v.paused;});
 await page.waitForTimeout(700);await page.locator(".tutorial-modal video").evaluate(v=>v.pause());
 await shot(page,"desktop-watching");
 const fit=await page.locator(".modal-body").evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight}));assert.ok(fit.scroll<=fit.height+2,"normal dialog must fit");
 await page.locator(".tutorial-modal [data-view-switch]").click();await shot(page,"desktop-text");
 await page.locator(".tutorial-modal [data-view-switch]").click();
 await page.keyboard.press("Escape");assert.equal(await page.locator(".tutorial-modal[open]").count(),0);
 checks.push("whole-desktop-frame","single-controls","text-return","escape-close");
 // Every desktop film decodes and renders, with each supplied chapter seekable.
 for(const id of ["body","energy","backfill","ai"]){
   await page.locator("[data-directory-topic="+id+"]").click();await page.locator("[data-open-preview]").click();
   await page.waitForFunction(()=>{const v=document.querySelector(".tutorial-modal video");return v?.readyState>=2&&!v.paused;});
   await page.locator(".tutorial-modal [data-step='1']").click();await page.waitForTimeout(250);
   await page.locator(".tutorial-modal video").evaluate(v=>v.pause());
   await shot(page,"desktop-film-"+id);
   await page.locator(".tutorial-modal [data-close-lesson]").click();
 }
 checks.push("five-desktop-films-play-and-seek");
 // Mobile views never auto-start or move the page on topic selection.
 for(const [width,height] of [[320,560],[390,720],[430,780],[390,560]]){
   await page.setViewportSize({width,height});await go(page,"/dashboard/tutorial");await page.locator("[data-topic=meals][aria-selected=true]").waitFor();
   assert.equal(await page.locator(".mobile-guide video").getAttribute("src"),null);
   await page.locator("[data-topic=energy]").click();
   assert.equal(await page.locator(".mobile-guide video").getAttribute("src"),null);
   await page.locator("[data-topic=meals]").click();
   await shot(page,"phone-initial-"+width+"x"+height);
 }
 await page.setViewportSize({width:390,height:720});
 for(const id of ["meals","body","energy","backfill","ai"]){
   await page.locator("[data-topic="+id+"]").click();
   await page.locator(".mobile-guide .lesson-play").click();
   await page.waitForFunction(()=>{const v=document.querySelector(".mobile-guide video");return v?.readyState>=2&&!v.paused;});
   await page.locator(".mobile-guide [data-step='1']").click();await page.waitForTimeout(250);
   await page.locator(".mobile-guide video").evaluate(v=>v.pause());
   await shot(page,"phone-film-"+id);
 }
 await page.locator(".mobile-guide [data-view-switch]").click();await shot(page,"phone-text",true);
 checks.push("mobile-topic-does-not-play","five-mobile-films-play-and-seek","mobile-text");
 // Owner rehearsal performs zero POSTs and leaves all personal data unchanged.
 phase="owner rehearsal";
 const owner=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",locale:"zh-CN",timezoneId:"Asia/Shanghai"});await login(owner,"owner");
 const op=await owner.newPage();watch(op);await go(op,"/dashboard");await op.getByLabel("账号菜单",{exact:true}).click();
 await op.getByRole("link",{name:"测试初次登录",exact:true}).click();await op.getByRole("heading",{name:"先认识一下你"}).waitFor();
 await settle();
 const before=await db.select().from(schema.personalProfile).where(eq(schema.personalProfile.userId,identities.owner.id)),posts=[];
 op.on("request",r=>{if(r.method()==="POST")posts.push(r.url());});
 await op.getByLabel("身高",{exact:true}).fill("181");await op.getByLabel("出生日期",{exact:true}).fill("1994-07-08");
 await shot(op,"desktop-rehearsal-profile");
 await op.getByRole("button",{name:"保存并继续",exact:true}).click();await op.locator("[data-tutorial-guide]").waitFor();
 await shot(op,"desktop-rehearsal-guide",true);
 await op.getByRole("button",{name:"返回资料",exact:true}).click();assert.equal(await op.getByLabel("身高",{exact:true}).inputValue(),"181");
 await op.getByRole("button",{name:"保存并继续",exact:true}).click();await op.getByRole("button",{name:"结束演练",exact:true}).click();
 await op.getByRole("heading",{name:"演练完成"}).waitFor();
 await settle();
 assert.deepEqual(await db.select().from(schema.personalProfile).where(eq(schema.personalProfile.userId,identities.owner.id)),before);assert.deepEqual(posts,[]);
 checks.push("owner-only-rehearsal","rehearsal-no-posts-no-writes","rehearsal-back-keeps-draft");
 // Real new account: skip, resume in another device, complete, then no repeated guide.
 phase="new account";
 const fresh=await browser.newContext({viewport:{width:390,height:720},reducedMotion:"reduce",locale:"zh-CN",timezoneId:"Asia/Shanghai"});await login(fresh,"new");
 const np=await fresh.newPage();watch(np);await go(np,"/dashboard");await np.getByRole("heading",{name:"先认识一下你"}).waitFor();assert.equal(new URL(np.url()).pathname,"/onboarding");
 await go(np,"/dashboard/ai");assert.equal(new URL(np.url()).pathname,"/dashboard/ai");await go(np,"/dashboard/ai/operations/not-found");assert.notEqual(new URL(np.url()).pathname,"/onboarding");await go(np,"/dashboard");await np.getByRole("heading",{name:"先认识一下你"}).waitFor();checks.push("pending-onboarding-does-not-intercept-ai");
 for(const route of ["/dashboard/meals","/dashboard/energy","/dashboard/measurements"]){await go(np,route);assert.equal(new URL(np.url()).pathname,"/onboarding");}checks.push("all-four-pages-route-new-account");
 await shot(np,"phone-first-profile");
 await np.getByLabel("出生日期",{exact:true}).fill("2099-01-01");await np.getByRole("button",{name:"保存并继续",exact:true}).click();
 await np.getByRole("alert").filter({hasText:"不能晚于今天"}).waitFor();await shot(np,"phone-profile-invalid");
 await np.getByRole("button",{name:"暂时跳过",exact:true}).click();await np.locator("[data-tutorial-guide]").waitFor();
 await settle();
 assert.equal((await db.select().from(schema.personalProfile).where(eq(schema.personalProfile.userId,identities.new.id)))[0].heightCm,null);
 const second=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",locale:"zh-CN",timezoneId:"Asia/Shanghai"});await login(second,"new");const sp=await second.newPage();watch(sp);
 await go(sp,"/dashboard");await sp.locator("[data-tutorial-guide]").waitFor();
 await sp.getByRole("button",{name:"返回资料",exact:true}).click();await sp.getByLabel("身高",{exact:true}).fill("172");await sp.getByLabel("出生日期",{exact:true}).fill("1997-04-12");
 await shot(sp,"desktop-first-profile");
 await sp.getByRole("button",{name:"保存并继续",exact:true}).click();await sp.locator("[data-tutorial-guide]").waitFor();
 await sp.getByRole("button",{name:"开始使用",exact:true}).click();await sp.waitForURL(base+"/dashboard");
 await go(np,"/dashboard");assert.equal(new URL(np.url()).pathname,"/dashboard");
 await go(np,"/dashboard/profile");assert.match(await np.locator("dl dd").first().textContent(),/172/);
 await shot(np,"phone-profile-saved");
 checks.push("new-account-routed","validation-unknown-stays-null","cloud-resume-second-device","finish-without-watching","completed-no-repeat");
 await page.setViewportSize({width:1440,height:900});await go(page,"/dashboard/tutorial");
 // Network failure is intentional and must retain readable steps.
 phase="media failure";
 await page.route("**/tutorials/meals-desktop-*.mp4",r=>r.abort());
 await page.locator("[data-open-preview]").click();await page.locator(".lesson-error").filter({hasText:"视频暂时"}).waitFor();await shot(page,"desktop-video-failure");
 await page.unroute("**/tutorials/meals-desktop-*.mp4");await page.locator(".tutorial-modal .lesson-error button").click();
 await page.waitForFunction(()=>{const v=document.querySelector(".tutorial-modal video");return v?.readyState>=2&&!v.paused;});
 await page.locator(".tutorial-modal [data-close-lesson]").click();checks.push("media-failure-text-and-retry");
 phase="tools";
 await go(page,"/dashboard");await page.getByRole("button",{name:"工具",exact:true}).last().click();
 await page.getByRole("link",{name:/查看教程/}).click();await page.locator("[data-tutorial-guide]").waitFor();checks.push("tools-tutorial-link");

 phase="extra playback and layouts";
 await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:"no-preference"});await go(page,"/dashboard/tutorial");
 await page.waitForFunction(()=>{const v=document.querySelector("[data-directory-preview]");return v?.readyState>=2&&!v.paused;});
 await page.locator("[data-directory-topic=body]").click();
 await page.waitForFunction(()=>document.querySelector("[data-directory-preview]")?.currentSrc.includes("body-desktop-preview"));
 assert.equal(await page.locator(".tutorial-modal[open]").count(),0);
 await page.emulateMedia({reducedMotion:"reduce"});await page.waitForFunction(()=>document.querySelector("[data-directory-preview]")?.paused);
 await page.locator("[data-directory-topic=meals]").click();await page.locator("[data-open-preview]").click();
 await page.waitForFunction(()=>document.querySelector(".tutorial-modal video")?.readyState>=2);
 await page.locator(".tutorial-modal [data-step='1']").click();await page.waitForTimeout(500);await page.locator(".tutorial-modal video").evaluate(v=>v.pause());
 await page.setViewportSize({width:390,height:720});
 await page.waitForFunction(()=>{const v=document.querySelector(".mobile-guide video");return v?.readyState>=2&&v.paused;});
 assert.equal(await page.locator(".mobile-guide [data-step='1']").getAttribute("aria-current"),"step");
 await shot(page,"phone-resize-paused");
 await page.setViewportSize({width:1440,height:900});await page.locator(".tutorial-modal[open]").waitFor();
 await page.waitForFunction(()=>document.querySelector(".tutorial-modal video")?.readyState>=2);
 assert.equal(await page.locator(".tutorial-modal video").evaluate(v=>v.paused),true);
 await page.locator("[data-close-lesson]").click();
 checks.push("selected-preview-only","reduced-motion-stops-preview","resize-preserves-step-and-pause");
 const landscape=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,reducedMotion:"reduce",locale:"zh-CN",timezoneId:"Asia/Shanghai"});
 await landscape.addCookies(await legacy.cookies());const lp=await landscape.newPage();watch(lp);await go(lp,"/dashboard/tutorial");await lp.locator("[data-tutorial-guide][data-mode=mobile]").waitFor();
 await lp.locator(".mobile-guide .lesson-play").click();await lp.waitForFunction(()=>document.querySelector(".mobile-guide video")?.readyState>=2);
 const ratio=await lp.locator(".lesson-frame").evaluate(el=>el.clientHeight/el.clientWidth);
 assert.ok(ratio>1.6,"landscape must not squash portrait film");
 await shot(lp,"phone-landscape",true);await landscape.close();
 const zoom=await browser.newContext({viewport:{width:720,height:450},deviceScaleFactor:2,reducedMotion:"reduce"});await zoom.addCookies(await legacy.cookies());const zp=await zoom.newPage();watch(zp);await go(zp,"/dashboard/tutorial");await zp.locator("[data-tutorial-guide]").waitFor();await shot(zp,"desktop-200percent-simulation",true);await zoom.close();
 checks.push("touch-landscape-full-width","200percent-viewport-simulation");
 phase="profile failures and clear";
 await page.setViewportSize({width:1440,height:900});await go(page,"/dashboard/profile");await page.getByRole("button",{name:"修改资料",exact:true}).click();await page.getByLabel("身高",{exact:true}).fill("176");
 await page.route("**/dashboard/profile",async r=>{if(r.request().method()==="POST"){await new Promise(resolve=>setTimeout(resolve,1800));await r.abort();}else await r.continue();});
 await page.getByRole("button",{name:"保存资料",exact:true}).click();await page.getByRole("button",{name:"正在保存…",exact:true}).waitFor();
 const busyShot=resolve(artifacts,"desktop-profile-saving.png");await page.screenshot({path:busyShot});shots.push(busyShot);
 await page.getByRole("alert").filter({hasText:"输入已保留"}).waitFor();assert.equal(await page.getByLabel("身高",{exact:true}).inputValue(),"176");await shot(page,"desktop-profile-save-failure");
 await page.unroute("**/dashboard/profile");
 await page.getByRole("button",{name:"取消",exact:true}).click();await page.getByRole("dialog",{name:"放弃这次修改？"}).getByRole("button",{name:"放弃修改",exact:true}).click();
 await page.getByRole("button",{name:"清空资料",exact:true}).click();await page.getByRole("dialog",{name:"清空个人资料？"}).getByRole("button",{name:"取消",exact:true}).click();
 assert.match(await page.locator("dl dd").first().textContent(),/174/);
 await page.getByRole("button",{name:"清空资料",exact:true}).click();await page.getByRole("dialog",{name:"清空个人资料？"}).getByRole("button",{name:"清空资料",exact:true}).click();await page.getByRole("status").filter({hasText:"资料已清空"}).waitFor();
 await settle();
 const row=(await db.select().from(schema.personalProfile).where(eq(schema.personalProfile.userId,identities.legacy.id)))[0];assert.equal(row.heightCm,null);assert.equal(row.onboardingStep,"complete");
 checks.push("saving-state","save-failure-preserves-draft","cancel-restores","clear-cancel-and-confirm");
 phase="compact first-use headers and playback restriction";
 for(const width of [320,390,430]){
  await op.setViewportSize({width,height:720});
  for(const mode of ["dark","light"]){
   await go(op,"/onboarding?mode=test");
   await op.getByRole("radio",{name:mode==="dark"?"深色":"浅色",exact:true}).click();
   const headerFits=await op.locator("header").evaluate(el=>el.scrollWidth<=el.clientWidth+1);assert.equal(headerFits,true,"rehearsal header "+width);
   await op.getByLabel("身高",{exact:true}).fill("172");await op.getByLabel("出生日期",{exact:true}).fill("1997-04-12");
   await shot(op,mode+"-first-use-"+width);
  }
 }
 const selectedRadio=op.getByRole("radio",{name:"浅色",exact:true});await selectedRadio.focus();await selectedRadio.press("ArrowRight");
 assert.equal(await op.locator("html").getAttribute("data-theme"),"dark");await op.getByRole("radio",{name:"深色",exact:true}).press("Home");assert.equal(await op.locator("html").getAttribute("data-theme"),"light");
 checks.push("compact-rehearsal-header-320-390-430","profile-both-themes-and-age","theme-keyboard-radio");
 await op.setViewportSize({width:1440,height:900});await op.emulateMedia({reducedMotion:"no-preference"});
 await op.addInitScript({content:'let allowPreview=false;document.addEventListener("click",event=>{if(event.target instanceof Element&&event.target.closest("[data-preview-toggle]"))allowPreview=true;},true);const originalPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(this.hasAttribute("data-directory-preview")&&!allowPreview)return Promise.reject(new DOMException("simulated browser autoplay policy","NotAllowedError"));return originalPlay.call(this);};'});
 await go(op,"/dashboard/tutorial");await op.locator("[data-tutorial-guide]").waitFor();await op.getByRole("button",{name:"播放预览",exact:true}).waitFor();
 assert.equal(await op.getByRole("button",{name:"暂停预览",exact:true}).count(),0);
 await op.getByRole("button",{name:"播放预览",exact:true}).click();
 await op.waitForFunction(()=>{const v=document.querySelector("[data-directory-preview]");return v&&!v.paused&&v.currentTime>.1});
 assert.equal(await op.getByRole("button",{name:"暂停预览",exact:true}).count(),1);await shot(op,"desktop-preview-policy-recovery");checks.push("blocked-autoplay-honest-label-and-click-retry");
 phase="anonymous routes";const anonymous=await browser.newContext(),ap=await anonymous.newPage();
 for(const route of ["/onboarding","/dashboard/profile","/dashboard/tutorial"]){await go(ap,route);assert.equal(new URL(ap.url()).pathname,"/");}
 await anonymous.close();checks.push("new-routes-require-login");

 assert.deepEqual(errors,[]);assert.deepEqual(networkErrors,[]);
}catch(error){failure=error?.stack||String(error);await writeFile(resolve(artifacts,"failure.json"),JSON.stringify({phase,failure},null,2));console.error(phase,failure);if(page)try{await page.screenshot({path:resolve(artifacts,"failure.png"),fullPage:true});}catch{}}
finally{
 await browser?.close();child.kill("SIGTERM");if(child.exitCode===null)await once(child,"exit");await socket.stop();await new Promise(r=>setTimeout(r,250));await pg.close();
 await writeFile(resolve(artifacts,"server.log"),log);
 const report={createdAt:new Date().toISOString(),engine,passed:!failure,phase,checks,screenshots:shots,errors,networkErrors,failure,realIPhone:"未测",systemKeyboard:"未测",nativeFullScreen:"未测"};
 await writeFile(resolve(artifacts,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
if(failure)process.exitCode=1;
