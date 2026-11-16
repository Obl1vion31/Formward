import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {eq,desc} from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
export async function runChatBackgroundBrowser(db){
 const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??"/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
 const engine=process.env.CHAT_BROWSER??"chromium",browser=await({chromium,webkit}[engine]).launch({headless:true});
 const fixture=JSON.parse(await readFile(process.env.FORMWARD_CHAT_BROWSER_CONFIG,"utf8")),base=fixture.baseURL,dir=process.env.FORMWARD_CHAT_ARTIFACTS;
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[],checks=[],shots=[];
 // WebKit may report the deliberately interrupted fetch after the page has reconnected.
 let networkFault=false;const expectedNetworkErrors=[];page.on("pageerror",e=>{if(networkFault&&/due to access control checks\.$/.test(e.message)&&/\/api\/assistant-(?:chat|context)/.test(e.message))expectedNetworkErrors.push(e.message);else errors.push(e.message);});
 const wait=async(fn)=>{for(let i=0;i<160;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,150));}throw Error("后台回归等待超时");};
 const latest=async()=>{const [row]=await db.select().from(schema.assistantRun).where(eq(schema.assistantRun.userId,fixture.userId)).orderBy(desc(schema.assistantRun.createdAt)).limit(1);return row;};
 const shot=async(name)=>{await page.screenshot({path:join(dir,engine+"-"+name+".png"),animations:"disabled"});shots.push(engine+"-"+name+".png");};
 const open=async()=>{if(!await page.getByRole("dialog",{name:"小助手",exact:true}).isVisible())await page.locator("[data-assistant-trigger]:visible").click();await page.getByRole("textbox",{name:"给小助手发消息",exact:true}).waitFor();};
 async function start(label){const prior=(await latest())?.id;await page.getByRole("textbox",{name:"给小助手发消息",exact:true}).fill("慢速测试 "+label);await page.getByRole("button",{name:"发送消息",exact:true}).click();return wait(async()=>{const row=await latest();if(row?.id!==prior&&row?.state==="error"){const [answer]=await db.select().from(schema.assistantMessage).where(eq(schema.assistantMessage.id,row.assistantMessageId));throw Error("后台任务错误："+answer?.error);}return row?.id!==prior&&row?.requestDiagnostics.some(d=>d.state!=="prepared")?row:null;});}
 async function complete(id){return wait(async()=>{const [row]=await db.select().from(schema.assistantRun).where(eq(schema.assistantRun.id,id));return row?.state==="complete"?row:null;});}
 async function verify(id){const [row]=await db.select().from(schema.assistantRun).where(eq(schema.assistantRun.id,id));assert.equal(row.requestDiagnostics.length,1);const usage=await db.select().from(schema.assistantUsageRequest).where(eq(schema.assistantUsageRequest.runId,id));assert.equal(usage.length,1);return row;}
 try{
  const login=await context.request.post(base+"/api/auth/sign-in/email",{headers:{Origin:base},data:{email:fixture.account.email,password:fixture.account.password}});assert.equal(login.status(),200);
  await page.goto(base+"/dashboard");await page.waitForFunction(()=>!document.querySelector(".page-loading-dialog[open]"));await open();
  const offline=await start("临时断网");networkFault=true;await context.setOffline(true);await complete(offline.id);await context.setOffline(false);await page.evaluate(()=>{window.dispatchEvent(new Event("online"));window.dispatchEvent(new Event("focus"));});
  await page.getByRole("button",{name:"停止生成",exact:true}).waitFor({state:"hidden",timeout:15000});await verify(offline.id);checks.push("浏览器离线后独立worker完成，恢复同一任务，一次模型替身请求及结算");await shot("background-offline-recovered");
  const refresh=await start("刷新恢复");await page.reload();await page.waitForFunction(()=>!document.querySelector(".page-loading-dialog[open]"));await open();await complete(refresh.id);await page.getByRole("button",{name:"停止生成",exact:true}).waitFor({state:"hidden",timeout:15000});await verify(refresh.id);checks.push("生成中刷新不停止，不新增任务或重复调用");await shot("background-refresh-recovered");
  const hidden=await start("收起面板");await page.getByRole("button",{name:"收起小助手",exact:true}).click();await complete(hidden.id);await open();await page.getByRole("button",{name:"停止生成",exact:true}).waitFor({state:"hidden",timeout:15000});await verify(hidden.id);checks.push("收起助手继续生成，重新打开读取完整回答");
  const stopped=await start("主动停止");await page.getByRole("button",{name:"停止生成",exact:true}).click();await wait(async()=>{const row=await latest();return row.id===stopped.id&&row.state==="stopped";});checks.push("主动停止仍取消真实任务");await shot("background-explicit-stop");
  await page.getByRole("button",{name:"千问",exact:true}).click();await page.getByRole("menuitemradio",{name:/小米 MiMo/}).click();await page.getByRole("button",{name:"小米 MiMo",exact:true}).waitFor();const old=await verify(offline.id);assert.equal(old.provider,"qwen");checks.push("选择小米不会改写旧千问回答归属");
  const dimensions=await page.getByRole("dialog",{name:"小助手",exact:true}).evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1,inputs:[...el.querySelectorAll("textarea")].map(x=>parseFloat(getComputedStyle(x).fontSize))}));assert.equal(dimensions.overflow,false);assert.ok(dimensions.inputs.every(n=>n>=16));
  await shot("background-final-mobile");await page.setViewportSize({width:1440,height:900});await shot("background-final-desktop");assert.deepEqual(errors,[]);
  const result={passed:true,engine,checks,shots,physicalIPhone:false,paidModelCalls:0,errors,expectedNetworkErrors};await writeFile(join(dir,engine+"-background.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await context.close();await browser.close();}
}
