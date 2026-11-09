import assert from "node:assert/strict";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createDatabase} from "../src/db/client.ts";
import {resetAssistantPending} from "./assistant-fixture.mjs";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";
import {checkAssistantEdges} from "./assistant-edge.browser.mjs";

const config=JSON.parse(await readFile(process.env.FORMWARD_ASSISTANT_CONFIG??".codex/assistant/preview.json","utf8"));
assert.ok(new URL(config.databaseUrl).pathname.startsWith("/formward_browser_")||(config.isolatedFixture==="pglite"&&new URL(config.databaseUrl).pathname==="/postgres"));
assert.equal(new URL(config.databaseUrl).hostname,"127.0.0.1");
assert.ok(["localhost","127.0.0.1"].includes(new URL(config.baseURL).hostname));
const engine=process.env.FORMWARD_ASSISTANT_BROWSER??"chromium";
const engines=await import(process.env.PLAYWRIGHT_MODULE??"/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
const browser=await engines[engine].launch({headless:true});
const artifacts=resolve(process.env.FORMWARD_ASSISTANT_ARTIFACTS??".codex/assistant/visual/"+engine);
await mkdir(artifacts,{recursive:true});
const errors=[],serverErrors=[],checks=[],screenshots=[],connection=createDatabase(config.databaseUrl),authCookies=new Map();
let fault=false;
const surface=page=>page.locator("[data-assistant-surface][open]");
const trigger=page=>page.locator("[data-assistant-trigger]:visible");
async function ready(page){await page.waitForLoadState("networkidle");await page.waitForFunction(()=>!document.querySelector(".page-loading-dialog[open]"));await page.evaluate(()=>document.fonts.ready);}
async function createContext({width=1440,height=900,theme="dark",empty=false,motion="reduce",timezone="Asia/Shanghai",video=false}={}){
 const context=await browser.newContext({viewport:{width,height},locale:"zh-CN",timezoneId:timezone,isMobile:width<1000,hasTouch:width<1000,reducedMotion:motion,...(video?{recordVideo:{dir:artifacts+"/video",size:{width,height}}}:{})});
 await context.addInitScript(value=>{try{localStorage.setItem("formward-theme",value);}catch{}},theme);
 const account=empty?config.other:config.account;
 if(authCookies.has(account.email))await context.addCookies(authCookies.get(account.email));
 else{assert.equal((await context.request.post(config.baseURL+"/api/auth/sign-in/email",{headers:{Origin:config.baseURL},data:{email:account.email,password:account.password}})).status(),200);authCookies.set(account.email,await context.cookies());}
 context.on("page",page=>{page.setDefaultTimeout(15000);page.on("pageerror",e=>errors.push(e.message));page.on("response",r=>{if(r.status()>=500&&!fault)serverErrors.push(r.status()+" "+new URL(r.url()).pathname);});});
 return context;
}
async function shot(page,name){const path=artifacts+"/"+name+".png";await page.screenshot({path});screenshots.push(path);}
async function open(page){if(!await surface(page).isVisible())await trigger(page).click();await surface(page).waitFor();await surface(page).getByRole("heading",{name:"小助手",exact:true}).waitFor();}
async function close(page){await surface(page).getByRole("button",{name:"收起小助手",exact:true}).click();await surface(page).waitFor({state:"detached"});}
try{
 await resetAssistantPending(connection.db,config.userId,config.today);
 const guest=await browser.newContext();assert.equal((await guest.request.get(config.baseURL+"/api/assistant-context?timezone=Asia%2FShanghai")).status(),401);await guest.close();
 const auth=await createContext(),first=await auth.newPage();
 const response=await auth.request.get(config.baseURL+"/api/assistant-context?timezone=Asia%2FShanghai"),payload=await response.json();
 assert.equal(response.status(),200);assert.equal(response.headers()["cache-control"],"private, no-store");assert.equal(payload.pending.length,1);assert.equal(payload.pending[0].date,addCalendarDays(config.today,-1));
 assert.deepEqual(Object.keys(payload).sort(),["generatedAt","localDate","pending","suggestions","timezone"]);
 for(const query of ["","?timezone=Mars%2FTest","?timezone=Asia%2FShanghai&userId=other"])assert.equal((await auth.request.get(config.baseURL+"/api/assistant-context"+query)).status(),400);
 await first.goto(config.baseURL+"/dashboard");await ready(first);await first.waitForTimeout(800);
 assert.equal(await surface(first).count(),0,"只出现角标和轻提示，不自动展开完整助手");
 assert.match(await trigger(first).getAttribute("aria-label"),/1/);
 await first.reload();await ready(first);await first.waitForTimeout(700);assert.equal(await surface(first).count(),0);
 await open(first);assert.equal(await surface(first).getByRole("checkbox").count(),0,"移除自动弹出开关");
 await surface(first).getByRole("button",{name:"常用功能",exact:true}).click();
 const tray=surface(first).getByRole("navigation",{name:"常用功能"});
 assert.deepEqual(await tray.getByRole("link").allTextContents(),["使用说明→","AI 接入→","导出 Excel→"]);
 await tray.getByRole("link",{name:/使用说明/}).focus();await first.keyboard.press("Escape");assert.equal(await surface(first).isVisible(),true);
 assert.equal(await surface(first).getByRole("button",{name:"常用功能",exact:true}).evaluate(n=>n===document.activeElement),true);
 await close(first);
 await first.locator('summary[aria-label="账号菜单"]').click();
 await first.getByRole("menuitemcheckbox",{name:"跟随系统外观"}).click();
 assert.equal(await first.getByRole("menuitemcheckbox",{name:"跟随系统外观"}).getAttribute("aria-checked"),"true");
 await first.getByRole("button",{name:"外部接入",exact:true}).click();assert.ok(await first.getByRole("link",{name:"AI 接入",exact:true}).isVisible());
 await first.keyboard.press("Escape");await first.getByRole("button",{name:"账号管理",exact:true}).click();
 for(const label of ["个人资料","账号与安全","退出登录"])assert.ok(await first.getByText(label,{exact:true}).isVisible());
 assert.equal(await first.getByRole("button",{name:"管理与测试",exact:true}).count(),0,"普通账号没有管理员入口");
 await first.keyboard.press("Escape");await first.keyboard.press("Escape");
 await open(first);await surface(first).getByRole("button",{name:"常用功能",exact:true}).click();await surface(first).getByRole("link",{name:/AI 接入/}).click();await first.waitForURL("**/dashboard/ai");await ready(first);assert.equal(await surface(first).count(),0);
 await open(first);await surface(first).getByRole("button",{name:"常用功能",exact:true}).click();await surface(first).getByRole("link",{name:/导出 Excel/}).click();await first.waitForURL("**/dashboard/export");await ready(first);
 const download=first.waitForEvent("download");await first.getByRole("button",{name:/下载 Excel/}).click();assert.ok((await download).suggestedFilename().endsWith(".xlsx"));
 await auth.close();checks.push("认证与隔离、手动展开、角标、工具抽屉与焦点、菜单分组、系统外观、AI和导出");
 const empty=await createContext({empty:true}),emptyPage=await empty.newPage();await emptyPage.goto(config.baseURL+"/dashboard");await ready(emptyPage);await emptyPage.waitForTimeout(600);
 assert.equal((await(await empty.request.get(config.baseURL+"/api/assistant-context?timezone=Asia%2FShanghai")).json()).pending.length,0);
 await open(emptyPage);await surface(emptyPage).getByText("暂无待确认或待办事项",{exact:true}).waitFor();await shot(emptyPage,"empty-account");await empty.close();
 for(const [width,height]of[[320,560],[390,640],[430,780],[844,390],[1100,900],[1440,900],[1920,1080]])for(const theme of["dark","light"]){
  const context=await createContext({width,height,theme}),page=await context.newPage();
  try{
   await page.goto(config.baseURL+"/dashboard");await ready(page);
   const nav=page.getByRole("navigation",{name:"主导航",exact:true});assert.equal(await nav.getByRole("link").count(),5);
   if(width<=700||width===844){const boxes=await nav.getByRole("link").evaluateAll(rows=>rows.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));assert.ok(boxes.every(b=>b.w>=44&&b.h>=44),JSON.stringify(boxes));}
   await open(page);
   const geometry=await surface(page).evaluate(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,overflow:n.scrollWidth>n.clientWidth+1,modal:n.matches(":modal"),locked:document.documentElement.style.overflow==="hidden"};});
   assert.ok(geometry.x>=-1&&geometry.y>=-1&&geometry.right<=width+1&&geometry.bottom<=height+1,JSON.stringify(geometry));assert.equal(geometry.overflow,false);
   const mobile=width<=700||width===844;assert.equal(geometry.modal,mobile);assert.equal(geometry.locked,mobile);
   if(mobile){for(let i=0;i<14;i++){await page.keyboard.press("Tab");assert.ok(await surface(page).evaluate(n=>n.contains(document.activeElement)));}}
   await surface(page).getByRole("button",{name:"常用功能",exact:true}).click();
   const menu=surface(page).getByRole("navigation",{name:"常用功能"}),r=await menu.boundingBox(),b=await surface(page).getByRole("button",{name:"常用功能",exact:true}).boundingBox();assert.ok(r.y+r.height<=b.y+1);
   await shot(page,theme+"-"+width+"x"+height);await page.keyboard.press("Escape");await close(page);assert.equal(await page.evaluate(()=>document.documentElement.style.overflow),"");
   await open(page);await surface(page).getByRole("link",{name:"记录饮食",exact:true}).click();await page.waitForURL("**/dashboard/meals?**");await ready(page);await page.locator('form[data-entry-form="meal"]').waitFor();assert.equal(await surface(page).count(),0);
   await page.keyboard.press("Escape");await page.locator('form[data-entry-form="meal"]').waitFor({state:"hidden"});checks.push({width,height,theme,geometry});
  }finally{await context.close();}
 }
 await checkAssistantEdges({createContext,config,connection,ready,open,close,surface,trigger,shot,checks,setFault:value=>{fault=value;}});
 assert.deepEqual(errors,[]);assert.deepEqual(serverErrors,[]);
 await writeFile(artifacts+"/report.json",JSON.stringify({engine,checks,screenshots,passed:true},null,2));console.log(JSON.stringify({engine,checks:checks.length,screenshots:screenshots.length,passed:true}));
}catch(e){await writeFile(artifacts+"/failure.json",JSON.stringify({error:String(e),stack:e.stack,checks,errors,serverErrors},null,2));throw e;}
finally{await browser.close();await connection.close();}
