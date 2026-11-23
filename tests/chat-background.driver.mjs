import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {eq,desc} from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
async function checkStopRecovery({ page, context, base, latest, start, complete, wait, shot, checks, verify }) {
 const root = url => url.pathname === "/api/assistant-chat";
 const control = url => url.pathname === "/api/assistant-chat/control";
 const stopButton = page.getByRole("button",{name:"停止生成",exact:true});
 const text = page.getByRole("textbox",{name:"给小助手发消息",exact:true});
 const send = page.getByRole("button",{name:"发送消息",exact:true});
 const manuallyRead = page.getByRole("button",{name:"重新读取对话",exact:true});
 const stopPost = response => control(new URL(response.url())) && response.request().postDataJSON()?.action === "stop";

 // 暂缓发送到正式路由。按钮先记录停止意图，收到实际运行编号后才调用停止。
 let releaseSend, sendHeld = false;
 const sendGate = new Promise(resolve => { releaseSend = resolve; });
 const delaySend = async route => {
   if (route.request().method() === "POST") { sendHeld = true; await sendGate; }
   await route.continue();
 };
 await page.route(root, delaySend);
 const previous = (await latest())?.id;
 await text.fill("慢速测试 停止与重读验收，等待发送确认");
 await send.click();
 await wait(() => sendHeld);
 await stopButton.click();
 const pendingStop = page.getByRole("button",{name:"正在停止生成",exact:true});
 await pendingStop.waitFor();
 assert.equal(await pendingStop.isDisabled(), true);
 assert.equal((await latest())?.id, previous);
 await shot("stop-waiting-for-acceptance");
 const queuedResponse = page.waitForResponse(stopPost);
 releaseSend();
 const stopResponse = await queuedResponse;
 const payload = stopResponse.request().postDataJSON();
 assert.equal(stopResponse.status(), 200);
 const aborted = await wait(async () => {
   const row = await latest();
   return row?.state === "stopped" && row.id !== previous ? row : null;
 });
 assert.equal(payload.runId, aborted.id);
 assert.equal(payload.conversationId, aborted.conversationId);
 await page.unroute(root, delaySend);
 await pendingStop.waitFor({ state: "hidden" });
 checks.push("发送未确认时点停止，确认后只停止这一条");

 // 模拟停止响应失联、随后第一次读取也失败。显式重读请求可以在接收回复时发出。
 let stopFailed = false;
 const failStop = async route => {
   if (!stopFailed && route.request().postDataJSON()?.action === "stop") {
     stopFailed = true;
     return route.fulfill({ status: 503, json: { error: "虚构停止响应失败" } });
   }
   await route.continue();
 };
 await page.route(control, failStop);
 const active = await start("停止与重读验收，原任务持续回复");
 await page.waitForFunction(id => window.__chatRecoveryEvents.filter(event => event.type === "text_delta" && event.runId === id).length >= 2, active.id);
 assert.equal((await latest()).state, "running");
 const headers = { Origin:base };
 const oldClient = await context.request.post(base+"/api/assistant-chat/control",{headers,data:{action:"stop",runId:null}});
 assert.equal(oldClient.status(), 200);
 assert.equal((await oldClient.json()).activeRunId, active.id);
 const staleStop = await context.request.post(base+"/api/assistant-chat/control",{headers,data:{action:"stop",runId:aborted.id,conversationId:aborted.conversationId}});
 assert.equal(staleStop.status(), 200);
 assert.equal((await latest()).state, "running");
 await text.fill("尚未发送的虚构草稿");
 await stopButton.click();
 await manuallyRead.waitFor();
 assert.equal(stopFailed, true);
 let reads = 0, releaseRead;
 const readGate = new Promise(resolve => { releaseRead = resolve; });
 const pinned = url => root(url) && url.searchParams.get("conversationId") === active.conversationId;
 const inspectRead = async route => {
   reads++;
   if (reads === 1) {
     await readGate;
     return route.fulfill({status:503,json:{error:"虚构读取故障"}});
   }
   await route.continue();
 };
 await page.route(pinned, inspectRead);
 await manuallyRead.click();
 const reading = page.getByRole("button",{name:"正在重新读取…",exact:true});
 await reading.waitFor();
 await wait(() => reads === 1);
 assert.equal(await reading.isDisabled(), true);
 assert.equal(await text.inputValue(), "尚未发送的虚构草稿");
 await shot("manual-reread-in-progress");
 releaseRead();
 await page.getByText(/暂时读不到对话，已有内容已保留/).waitFor();
 const rereadResponse = page.waitForResponse(response => pinned(new URL(response.url())) && response.ok());
 await manuallyRead.click();
 assert.equal((await (await rereadResponse).json()).activeRunId, active.id);
 await manuallyRead.waitFor({state:"hidden"});
 assert.equal(reads, 2);
 assert.equal(await text.inputValue(), "尚未发送的虚构草稿");
 assert.equal((await latest()).id, active.id);
 await verify(active.id);
 checks.push("真实正文分片逐段可达，旧空编号和迟到停止不影响正在运行的另一条");
 checks.push("生成中显式重读发出针对本会话的 GET，显示等待和失败重试，保持草稿及同一任务");
 await page.unroute(pinned, inspectRead);
 await page.unroute(control, failStop);
 await stopButton.click();
 await wait(async () => (await latest()).state === "stopped");
 await stopButton.waitFor({state:"hidden"});
 await shot("chat-stopped-after-reread");

 // 完整回复已经进入浏览器时，故意阻住随后的快照读取。
 let releaseFinalRead, finalReading = false;
 const finishGate = new Promise(resolve => { releaseFinalRead = resolve; });
 const delayFinalRead = async route => {
   if (route.request().method() === "GET" && !finalReading) { finalReading = true; await finishGate; }
   await route.continue();
 };
 const snapshot = url => root(url) && !url.search;
 await page.route(snapshot, delayFinalRead);
 await text.fill("隔离回放：排版验收，终态快照延迟");
 await send.click();
 const finalRun = await wait(async () => {
   const row = await latest();
   return row?.id !== active.id && row?.state === "complete" ? row : null;
 });
 await complete(finalRun.id);
 await page.getByRole("heading",{name:"本餐汇总",exact:true}).last().waitFor();
 await wait(() => finalReading);
 assert.equal(await stopButton.count(), 0);
 assert.equal(await manuallyRead.count(), 0);
 await shot("reply-finished-with-delayed-read");
 const finalResponse = page.waitForResponse(response => snapshot(new URL(response.url())) &&
   response.request().method() === "GET" && response.ok());
 releaseFinalRead();
 await finalResponse;
 await page.unroute(snapshot, delayFinalRead);
 checks.push("回复完成后即收起停止按钮，稍晚的快照读取不会送出空编号");
}

export async function runChatBackgroundBrowser(db){
 const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??"/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
 const engine=process.env.CHAT_BROWSER??"chromium",browser=await({chromium,webkit}[engine]).launch({headless:true});
 const fixture=JSON.parse(await readFile(process.env.FORMWARD_CHAT_BROWSER_CONFIG,"utf8")),base=fixture.baseURL,dir=process.env.FORMWARD_CHAT_ARTIFACTS;
 const mobile = process.env.FORMWARD_CHAT_QA_DESKTOP !== "1";
 const context=await browser.newContext({viewport:{width:mobile?390:1440,height:844},isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[],checks=[],shots=[];
 await context.addInitScript(() => {
   const read = window.fetch;
   window.__chatRecoveryEvents = [];
   window.fetch = async (...args) => {
     const response = await read(...args);
     if (response.headers.get("content-type")?.includes("text/event-stream")) {
       const body = response.clone().body;
       if (body) void (async () => {
         const reader = body.pipeThrough(new TextDecoderStream()).getReader();
         let buffer = "";
         try {
           for (;;) {
             const part = await reader.read();
             if (part.done) break;
             buffer += part.value;
             for (let end; (end = buffer.indexOf("\n\n")) >= 0;) {
               const frame = buffer.slice(0,end);
               buffer = buffer.slice(end+2);
               if (frame.startsWith("data: ")) {
                 const event = JSON.parse(frame.slice(6));
                 window.__chatRecoveryEvents.push({type:event.type,runId:event.runId});
               }
             }
           }
         } catch { /* 主测试会主动断线和取消订阅。 */ }
         finally { reader.releaseLock(); }
       })();
     }
     return response;
   };
 });
 // WebKit may report the deliberately interrupted fetch after the page has reconnected.
 let networkFault=false;const expectedNetworkErrors=[];page.on("pageerror",e=>{if(networkFault&&/due to access control checks\.$/.test(e.message)&&/\/api\/assistant-(?:chat|context)/.test(e.message))expectedNetworkErrors.push(e.message);else errors.push(e.message);});
 const wait=async(fn)=>{for(let i=0;i<160;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,150));}throw Error("后台回归等待超时");};
 const latest=async()=>{const [row]=await db.select().from(schema.assistantRun).where(eq(schema.assistantRun.userId,fixture.userId)).orderBy(desc(schema.assistantRun.createdAt)).limit(1);return row;};
 const shot=async(name)=>{await page.screenshot({path:join(dir,engine+"-"+name+".png"),animations:"disabled"});shots.push(engine+"-"+name+".png");};
 const open = async () => {
   const input = page.getByRole("textbox", {name:"给小助手发消息",exact:true});
   const trigger = page.locator("[data-assistant-trigger]:visible");
   if (new URL(page.url()).pathname !== "/dashboard/assistant") {
     await input.or(trigger).first().waitFor();
     if (!await input.isVisible()) await trigger.click();
   }
   await input.waitFor();
 };
 async function start(label){const prior=(await latest())?.id;await page.getByRole("textbox",{name:"给小助手发消息",exact:true}).fill("慢速测试 "+label);await page.getByRole("button",{name:"发送消息",exact:true}).click();return wait(async()=>{const row=await latest();if(row?.id!==prior&&row?.state==="error"){const [answer]=await db.select().from(schema.assistantMessage).where(eq(schema.assistantMessage.id,row.assistantMessageId));throw Error("后台任务错误："+answer?.error);}return row?.id!==prior&&row?.requestDiagnostics.some(d=>d.state!=="prepared")?row:null;});}
 async function complete(id){return wait(async()=>{const [row]=await db.select().from(schema.assistantRun).where(eq(schema.assistantRun.id,id));return row?.state==="complete"?row:null;});}
 async function verify(id){const [row]=await db.select().from(schema.assistantRun).where(eq(schema.assistantRun.id,id));assert.equal(row.requestDiagnostics.length,1);const usage=await db.select().from(schema.assistantUsageRequest).where(eq(schema.assistantUsageRequest.runId,id));assert.equal(usage.length,1);return row;}
 try{
  const login=await context.request.post(base+"/api/auth/sign-in/email",{headers:{Origin:base},data:{email:fixture.account.email,password:fixture.account.password}});assert.equal(login.status(),200);
  await page.goto(base+"/dashboard");await page.waitForFunction(()=>!document.querySelector(".page-loading-dialog[open]"));await open();
  const offline=await start("临时断网");networkFault=true;await context.setOffline(true);await complete(offline.id);await context.setOffline(false);await page.evaluate(()=>{window.dispatchEvent(new Event("online"));window.dispatchEvent(new Event("focus"));});
  await page.getByRole("button",{name:"停止生成",exact:true}).waitFor({state:"hidden",timeout:15000});await verify(offline.id);checks.push("浏览器离线后独立worker完成，恢复同一任务，一次模型替身请求及结算");await shot("background-offline-recovered");
  await checkStopRecovery({page,context,base,latest,start,complete,wait,shot,checks,verify});
  const refresh=await start("刷新恢复");await page.reload();await page.waitForFunction(()=>!document.querySelector(".page-loading-dialog[open]"));await open();await complete(refresh.id);await page.getByRole("button",{name:"停止生成",exact:true}).waitFor({state:"hidden",timeout:15000});await verify(refresh.id);checks.push("生成中刷新不停止，不新增任务或重复调用");await shot("background-refresh-recovered");
  const hidden=await start("收起面板");await page.getByRole("button",{name:mobile?"返回工作区":"收起小助手",exact:true}).click();await complete(hidden.id);await open();await page.getByRole("button",{name:"停止生成",exact:true}).waitFor({state:"hidden",timeout:15000});await verify(hidden.id);checks.push("收起助手继续生成，重新打开读取完整回答");
  const stopped=await start("主动停止");await page.getByRole("button",{name:"停止生成",exact:true}).click();await wait(async()=>{const row=await latest();return row.id===stopped.id&&row.state==="stopped";});checks.push("主动停止仍取消真实任务");await shot("background-explicit-stop");
  await page.getByRole("button",{name:"千问",exact:true}).click();await page.getByRole("menuitemradio",{name:/小米 MiMo/}).click();await page.getByRole("button",{name:"小米 MiMo",exact:true}).waitFor();const old=await verify(offline.id);assert.equal(old.provider,"qwen");checks.push("选择小米不会改写旧千问回答归属");
  const dimensions=await page.locator(mobile?"[data-assistant-page]:visible":"[data-assistant-surface]:visible").evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1,inputs:[...el.querySelectorAll("textarea")].map(x=>parseFloat(getComputedStyle(x).fontSize))}));assert.equal(dimensions.overflow,false);assert.ok(dimensions.inputs.every(n=>n>=16));
  await shot(mobile?"background-final-mobile":"background-final-desktop");assert.deepEqual(errors,[]);
  const result={passed:true,engine,checks,shots,physicalIPhone:false,paidModelCalls:0,errors,expectedNetworkErrors};await writeFile(join(dir,engine+"-background.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 } catch (error) {
   await shot("background-failure").catch(() => {});
   console.log("验收页面", new URL(page.url()).pathname, "已通过", JSON.stringify(checks));
   throw error;
 } finally { await context.close(); await browser.close(); }
}
