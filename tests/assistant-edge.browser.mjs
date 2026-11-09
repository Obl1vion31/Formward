import assert from "node:assert/strict";
import {eq} from "drizzle-orm";
import {assistantReminderDismissal} from "../src/db/schema.ts";

/** 仅使用隔离 fixture。浏览器状态与账号云端忽略独立核对。 */
export async function checkAssistantEdges({createContext,config,connection,ready,open,close,surface,shot,checks,setFault}){
 const first=await createContext({width:390,height:780,motion:"no-preference",video:true}),page=await first.newPage();
 const second=await createContext({width:1440,height:900}),otherPage=await second.newPage();
 try{
  await page.goto(config.baseURL+"/dashboard");await ready(page);await otherPage.goto(config.baseURL+"/dashboard");await ready(otherPage);await open(page);
  const handle=surface(page).getByRole("button",{name:"展开小助手，可拖动",exact:true});
  await handle.click();await page.waitForTimeout(300);assert.equal(await surface(page).getAttribute("data-expanded"),"true");await shot(page,"expanded");
  await surface(page).getByRole("button",{name:"收起小助手到半屏，可拖动",exact:true}).click();await page.waitForTimeout(250);
  setFault(true);
  await page.route("**/dashboard**",route=>route.request().method()==="POST"?route.fulfill({status:500,body:"fictional reminder failure"}):route.continue());
  await surface(page).getByRole("button",{name:"忽略这一天",exact:true}).click();
  await surface(page).getByRole("alert").waitFor();assert.ok(await surface(page).getByRole("button",{name:"忽略这一天",exact:true}).isVisible(),"失败保留未处理事项");
  await page.unroute("**/dashboard**");setFault(false);
  await surface(page).getByRole("button",{name:"忽略这一天",exact:true}).click();
  await surface(page).getByRole("button",{name:"忽略这一天",exact:true}).waitFor({state:"detached"});
  const cloud=await(await second.request.get(config.baseURL+"/api/assistant-context?timezone=Asia%2FShanghai")).json();assert.equal(cloud.pending.filter(item=>item.category==="meals").length,0);
  await otherPage.evaluate(()=>window.dispatchEvent(new Event("focus")));await open(otherPage);await surface(otherPage).getByText("暂无待确认或待办事项",{exact:true}).waitFor();
  await close(otherPage);
  const row=await connection.db.select().from(assistantReminderDismissal).where(eq(assistantReminderDismissal.userId,config.userId));assert.equal(row.length,1);
  await page.evaluate(()=>{window.__backdropFrames=[];const start=performance.now();function tick(){const n=document.querySelector("[data-assistant-surface]");window.__backdropFrames.push({t:performance.now()-start,modal:n?.matches(":modal")??false,bg:n?getComputedStyle(n,"::backdrop").backgroundColor:null,closing:n?.dataset.closing,locked:document.documentElement.style.overflow});if(performance.now()-start<550)requestAnimationFrame(tick);}tick();});
  await surface(page).getByRole("button",{name:"收起小助手",exact:true}).click();await surface(page).waitFor({state:"detached"});await page.waitForTimeout(550);
  const frames=await page.evaluate(()=>window.__backdropFrames);assert.ok(frames.some(f=>f.modal&&f.closing==="true"),"退出期间保留模态");assert.equal(frames.at(-1).locked,"");
  await shot(page,"closed");checks.push({test:"忽略失败、重试、云端跨设备、半全屏、关闭遮罩与滚动释放",frames});
  for(let i=0;i<6;i++){await open(page);await page.waitForTimeout(35);await surface(page).getByRole("button",{name:"收起小助手",exact:true}).click();await page.evaluate(()=>document.querySelector("[data-assistant-trigger]")?.click());await page.waitForTimeout(300);assert.ok(await surface(page).isVisible());await close(page);}
  assert.equal(await page.locator("dialog[open]").count(),0);assert.equal(await page.evaluate(()=>document.documentElement.style.overflow),"");

  setFault(true);await page.route("**/api/assistant-context?**",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"fictional"})}));
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await open(page);
  await surface(page).getByRole("alert").waitFor();assert.equal(await surface(page).getByText("暂无待确认或待办事项",{exact:true}).count(),0);
  await shot(page,"read-failure");await page.unroute("**/api/assistant-context?**");setFault(false);
  await surface(page).getByRole("button",{name:"重新读取",exact:true}).click();await surface(page).getByText("暂无待确认或待办事项",{exact:true}).waitFor();await close(page);
  checks.push("6次关闭中反向续接、读取失败不报无待办、局部重试");
 }finally{setFault(false);await first.close();await second.close();}
}
