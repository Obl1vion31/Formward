import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { assistantConversation, assistantMessage, assistantRun, assistantUsageRequest, meal, rateLimit } from "../src/db/schema.ts";
import { readMealSnapshot } from "../src/features/meals/records.ts";

const warning = "这次要处理的内容太多，回复已中断。";
const replyWithQuote = "新会话继续回答";

export async function runAssistantContextRecovery(db) {
  const fixture = JSON.parse(await readFile(process.env.FORMWARD_CHAT_BROWSER_CONFIG,"utf8"));
  const { baseURL, account, userId, samples } = fixture;
  const directory = process.env.FORMWARD_CHAT_ARTIFACTS;
  const engine = process.env.CHAT_BROWSER ?? "chromium";
  const library = await import(process.env.PLAYWRIGHT_MODULE ?? "/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
  const browser = await library[engine].launch({headless:true});
  const report = [];
  const ledgerCount = async () => (await db.select().from(assistantUsageRequest).where(eq(assistantUsageRequest.userId,userId))).length;
  const meals = async () => (await readMealSnapshot(db,userId,[fixture.today],{images:true})).meals;
  const existingMeals = async () => new Set((await db.select({id:meal.id}).from(meal).where(eq(meal.userId,userId))).map(row=>row.id));

  async function journey(name,mobile,run) {
    const viewport = mobile ? {width:390,height:844} : {width:1440,height:900};
    const context = await browser.newContext({viewport,baseURL,hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1,recordVideo:{dir:directory,size:viewport}});
    await context.addInitScript(() => {
      localStorage.setItem("formward-theme","light");
      const native = window.visualViewport, proxy = new EventTarget();
      let keyboardHeight = null;
      for (const key of ["height","width","offsetTop","offsetLeft","pageTop","pageLeft","scale"])
        Object.defineProperty(proxy,key,{get:()=>key==="height"&&keyboardHeight!==null?keyboardHeight:native?.[key]??0});
      Object.defineProperty(window,"visualViewport",{configurable:true,value:proxy});
      window.setFixtureKeyboardHeight = value=>{keyboardHeight=value;proxy.dispatchEvent(new Event("resize"));};
    });
    const page = await context.newPage(), video = page.video(), began = performance.now();
    page.setDefaultTimeout(40000);
    const record = {name,engine,viewport,shots:[],checks:[],errors:[]};
    report.push(record);
    let disconnecting = false;
    page.on("pageerror",error=>{
      if (disconnecting && engine==="webkit" && /\/api\/assistant-(?:chat|context).*due to access control checks\.$/.test(error.message)) {
        (record.browserNotices??=[]).push("主动断网时 WebKit 取消了正在进行的助手读取。");
      } else record.errors.push(String(error));
    });
    const input = page.getByRole("textbox",{name:"给小助手发消息",exact:true});
    const button = name => page.getByRole("button",{name,exact:true}).filter({visible:true});
    const chat = () => context.request.get("/api/assistant-chat").then(response=>response.json());
    const control=async (data,expected=200)=>{
      const response=await context.request.post("/api/assistant-chat/control",{headers:{Origin:baseURL},data});
      assert.equal(response.status(),expected,await response.text());
      return response.json();
    };
    async function shot(label,description){
      const name = engine+"-"+record.name+"-"+String(record.shots.length+1).padStart(2,"0")+"-"+label+".png";
      await page.screenshot({path:join(directory,name)});
      record.shots.push({file:name,description,seconds:Math.round((performance.now()-began)/100)/10});
    }
    const check = description => {record.checks.push(description);console.log(engine,name,"PASS",description);};
    async function open() {
      await page.goto(mobile?"/dashboard/assistant":"/dashboard");
      if(!mobile) {
        await page.locator("[data-assistant-trigger]:visible").click();
        await page.locator("dialog[data-assistant-surface]").evaluate(node =>
          Promise.all(node.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
      }
      await input.waitFor();
      await page.waitForFunction(()=>[...document.querySelectorAll('button[aria-label="添加照片"]')]
        .some(el=>el.getClientRects().length&&!el.disabled));
    }
    async function reconnect(ready){
      disconnecting = true;
      try {
        await context.setOffline(true);
        await page.waitForTimeout(420);
        await context.setOffline(false);
        await open();
        await ready.waitFor();
      } finally { disconnecting = false; }
    }
    async function send(text,files=0){
      await input.fill(text);
      if(files)await page.getByLabel("选择聊天照片",{exact:true}).setInputFiles(samples.slice(0,files).map(row=>row.file));
      await page.waitForFunction(()=>[...document.querySelectorAll('button[aria-label="发送消息"]')].some(el=>el.getClientRects().length&&!el.disabled));
      await button("发送消息").click();
    }
    async function finished(){
      await button("停止生成").waitFor({state:"hidden"});
      return chat();
    }
    async function showSource(title){
      await button("历史会话").click();
      const entry = page.getByRole("button",{name:new RegExp(title)}).filter({visible:true}).first();
      await entry.click();
      await button("回到这段对话").click();
      await input.waitFor();
    }
    async function geometry(){
      const error = page.getByText(warning,{exact:true}).last();
      await error.scrollIntoViewIfNeeded();
      const buttons=[button("新建对话").last(),button(replyWithQuote).last()];
      for(const target of buttons){
        const area=await target.boundingBox();
        assert.ok(area && area.height>=44 && area.x>=0 && area.x+area.width<=page.viewportSize().width+1);
        assert.ok(await target.evaluate(node=>node.scrollWidth<=node.clientWidth+2));
      }
      assert.equal(await input.evaluate(node=>getComputedStyle(node).fontSize),"16px");
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    try {
      await db.delete(rateLimit);
      const login=await context.request.post("/api/auth/sign-in/email",{headers:{Origin:baseURL},data:account});
      assert.equal(login.status(),200);
      await control({action:"new"});
      await open();
      await run({page,input,button,chat,control,shot,check,open,send,finished,showSource,geometry,context,reconnect});
      assert.deepEqual(record.errors,[]);
    } catch(error) {
      record.failure=String(error);
      await page.screenshot({path:join(directory,engine+"-"+name+"-failure.png")}).catch(()=>{});
      throw error;
    } finally {
      await context.close();
      if(video) {
        record.video=engine+"-"+name+".webm";
        await video.saveAs(join(directory,record.video));
      }
      await writeFile(join(directory,engine+"-context-report.json"),JSON.stringify(report,null,2));
    }
  }

  async function savedThenInterrupted(flow,mobile) {
    const {page,input,button,chat,shot,check,send,finished,showSource,geometry}=flow;
    const original=(await chat()).conversationId, previousMeals=await existingMeals();
    const text=mobile?"上下文验收晚餐 · 两张照片":"上下文验收晚餐 · 保留正文";
    await send(text,2);
    const error=page.getByText(warning,{exact:true});
    await error.waitFor();
    const failing=(await finished()).messages.at(-1);
    assert.equal(failing.state,"error");
    assert.equal(failing.contextLimited,true);
    assert.equal(failing.photoLimit,undefined);
    assert.equal(failing.text,mobile?"":"我已经核对了烤鸡的份量。");
    assert.equal(failing.references.filter(ref=>ref.kind==="preview").length,1);
    assert.equal((await existingMeals()).size,previousMeals.size);
    await button("保存确认").waitFor();
    for (const theme of ["light","dark"]) {
      const sizes=mobile?[320,390,430]:[1100,1440];
      for (const width of sizes) {
        await page.setViewportSize({width,height:mobile?844:900});
        await page.evaluate(value=>{localStorage.setItem("formward-theme",value);document.documentElement.dataset.theme=value;},theme);
        await geometry();
        await shot("pending-"+theme+"-"+width,"待确认餐次、明确中断提示、两种新建入口");
      }
    }
    await page.setViewportSize({width:mobile?390:1440,height:mobile?844:900});
    await page.evaluate(()=>{localStorage.setItem("formward-theme","light");document.documentElement.dataset.theme="light";});
    await button("保存确认").click();
    await page.getByRole("heading",{name:"已保存",exact:true}).waitFor();
    await shot("saved", "两张原图的晚餐已保存，回复仍显示中断");
    assert.equal(await error.count(),1);
    assert.equal((await existingMeals()).size,previousMeals.size+1);
    const dinner=(await meals()).find(row=>!previousMeals.has(row.id));
    assert.ok(dinner && dinner.mealType==="晚餐");
    assert.equal(dinner.items.length,2);
    assert.equal(dinner.imageIds.length,2);
    const foods=dinner.items.map(row=>String(row.name));
    assert.deepEqual(foods,["验收烤鸡","验收燕麦饮"]);
    assert.deepEqual(dinner.items.map(row=>Number(row.quantity)),[150,200]);
    check("实际保存仅新增一次，有两项食物及两张照片，回复中断状态独立保留");

    const usage=await ledgerCount();
    await input.fill("留在旧对话的草稿");
    await button("新建对话").last().click();
    await button("开始新对话").click();
    await page.getByRole("heading",{name:"今天想聊点什么？"}).waitFor();
    assert.equal(await input.inputValue(),"");
    assert.notEqual((await chat()).conversationId,original);
    assert.equal((await chat()).pendingContextQuote,undefined);
    await shot("blank","打开空白对话，用户可以另起话题");
    await showSource(text);
    assert.equal((await chat()).conversationId,original);
    assert.equal(await input.inputValue(),"留在旧对话的草稿");
    await input.fill("");
    await button(replyWithQuote).click();
    await page.getByText("引用上一问",{exact:true}).waitFor();
    const created=(await chat()).conversationId;
    assert.notEqual(created,original);
    assert.equal((await chat()).messages.length,0);
    assert.equal((await chat()).pendingContextQuote.id,failing.id);
    assert.match((await chat()).pendingContextQuote.text,/本轮已有记录保存/);
    assert.equal(await input.inputValue(),"");
    assert.equal(await ledgerCount(),usage);
    assert.equal((await existingMeals()).size,previousMeals.size+1);
    await shot("quote","新会话保留上一问引用，输入栏等待用户发送");

    await flow.open();
    await page.getByText("引用上一问",{exact:true}).waitFor();
    assert.equal((await chat()).conversationId,created);
    if(mobile){
      await input.focus();
      await page.evaluate(()=>window.setFixtureKeyboardHeight(500));
      await page.waitForFunction(()=>document.querySelector('[aria-label="给小助手发消息"]').getBoundingClientRect().bottom<=502);
      const cancel=await button("取消引用").boundingBox();
      assert.ok(cancel && cancel.y>=0 && cancel.y+cancel.height<=502);
      await shot("keyboard","模拟键盘期间引用和输入框仍在可见区域");
      await input.blur();
      await page.evaluate(()=>window.setFixtureKeyboardHeight(null));
    }
    await send("上下文验收接着问");
    await page.getByText("沿用上一问的文字和已保存记录。",{exact:true}).waitFor();
    assert.equal((await finished()).pendingContextQuote,undefined);
    assert.equal(await page.getByText("引用上一问",{exact:true}).count(),0);
    await shot("continued","手动发送后，模型沿用一条文字引用回答");
    check("空白与引用新建均通过，切换零模型请求，旧草稿回原对话可取回，刷新后仍有引用");

    await showSource(text);
    await button(replyWithQuote).click();
    await button("取消引用").click();
    await page.getByText("引用上一问",{exact:true}).waitFor({state:"hidden"});
    await flow.open();
    assert.equal((await chat()).pendingContextQuote,undefined);
    await send("上下文验收只看现在");
    await page.getByText("本次只核对两点。第一，份量已确认。第二，晚餐已归到今天。",{exact:true}).waitFor();
    assert.equal((await finished()).messages[0].replyTo,null);
    await shot("cancelled","移除引用后可发普通文字，刷新也不找回已取消的引用");
    check("取消引用后可正常发送，记录数保持");
    assert.equal((await existingMeals()).size,previousMeals.size+1);
    if(!mobile){
      await showSource(text);
      await button(replyWithQuote).click();
      await page.getByText("引用上一问",{exact:true}).waitFor();
      await flow.control({action:"remove_conversation",conversationId:original});
      await flow.open();
      await page.getByText("原消息已不可用，请移除引用后发送。",{exact:true}).waitFor();
      await input.fill("来源已移出时这条草稿仍保留");
      assert.ok(await button("发送消息").isDisabled());
      await shot("removed-source","引用来源移出后显示取消入口，当前草稿仍保留");
      await button("取消引用").click();
      await page.getByText("引用上一问",{exact:true}).waitFor({state:"hidden"});
      assert.equal(await input.inputValue(),"来源已移出时这条草稿仍保留");
      assert.equal((await existingMeals()).size,previousMeals.size+1);
      check("引用来源移出后需取消引用，草稿和已保存晚餐仍可用");
    }
  }

  async function automaticPhotos(flow,mobile) {
    const {page,reconnect,input,button,chat,control,open,send,finished,shot,check} = flow;
    const defaults=mobile?{width:390,height:844}:{width:1440,height:900};
    const fileInput=page.getByLabel("选择聊天照片",{exact:true});
    const hint = count=>page.getByText(`已选 ${count} 张，发送后分批读取`,{exact:true});
    const progress = label=>page.getByRole("status").filter({hasText:label});
    const waitSend = () => page.waitForFunction(()=>[...document.querySelectorAll('button[aria-label="发送消息"]')]
      .some(el=>el.getClientRects().length&&!el.disabled),null,{timeout:40000});
    const verifyNoOverflow = async locator => {
      const box=await locator.boundingBox();
      assert.ok(box && box.x>=0 && box.x+box.width<=page.viewportSize().width+1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    };
    const setView = async (width,theme) => {
      await page.setViewportSize({...defaults,width});
      await page.evaluate(value=>{localStorage.setItem("formward-theme",value);document.documentElement.dataset.theme=value;},theme);
    };
    async function matrix(locator,label,description){
      for(const theme of ["light","dark"]) for(const width of mobile?[320,390,430]:[1100,1440]){
        await setView(width,theme);
        await locator.scrollIntoViewIfNeeded();
        await verifyNoOverflow(locator);
        await shot(label+"-"+theme+"-"+width,description);
      }
      await setView(defaults.width,"light");
    }
    const consentCalls=[];
    page.on("request",request=>{
      if(request.method()==="POST" && new URL(request.url()).pathname==="/api/assistant-chat"){
        const value=request.postDataJSON();consentCalls.push(value.action);
      }
    });
    const attempt = async id => (await db.select().from(assistantRun).where(eq(assistantRun.id,id)))[0];
    const photosIn = (row) => row.requestDiagnostics.filter(item=>item.phase==="photos").map(item=>item.images.map(image=>image.id));

    if(mobile){
      await send("两张照片已读验收。",2);
      await page.getByText("两张照片都已读取。",{exact:true}).waitFor();
      const two=await finished(), row=await attempt(two.messages.at(-1).runId);
      assert.equal(row.requestDiagnostics[0].images.length,2);
      assert.equal(two.messages.at(-1).photoProgress,undefined);
      await shot("two-photos","两张直接在一轮读取并回答");
      check("两张原图按原流程完成，无分批提示");
      await db.delete(rateLimit);
      await control({action:"new"});await open();
    }

    const text="四张都是同一顿晚餐。前两张是餐盘，后两张是标签。请合起来记一餐，重复食物只算一次。";
    const beforeMeals=await existingMeals();
    await input.fill(text);
    await fileInput.setInputFiles(samples.slice(0,4).map(row=>row.file));
    await waitSend();
    assert.equal(await hint(4).count(),1);
    await shot("four-selected","四张在输入栏内，提示发送后自动分批");
    await matrix(hint(4),"selected","选图提示在双主题和不同宽度保持完整");
    if(mobile){
      await input.focus();
      await page.evaluate(()=>window.setFixtureKeyboardHeight(500));
      await page.waitForFunction(()=>document.querySelector('[aria-label="给小助手发消息"]').getBoundingClientRect().bottom<=502);
      const fixed = () => page.evaluate(()=>{
        const root=document.querySelector("[data-assistant-page]");
        const editor=root.querySelector('textarea[aria-label="给小助手发消息"]');
        return [root.querySelector("header").getBoundingClientRect().y,editor.getBoundingClientRect().bottom,scrollY];
      });
      const anchors=await fixed();
      await page.getByRole("log",{name:"聊天消息"}).evaluate(node=>{node.scrollTop+=80;});
      assert.ok((await fixed()).every((value,index)=>Math.abs(value-anchors[index])<=1));
      const sendBounds=await button("发送消息").boundingBox();
      assert.ok(sendBounds && sendBounds.height>=44 && sendBounds.y+sendBounds.height<=502);
      await shot("four-keyboard","模拟键盘升起，提示及四张图、发送键仍可见");
    }
    const countBefore=consentCalls.length;
    await button("发送消息").evaluate(node=>{node.click();node.click();});
    if(mobile)await page.evaluate(()=>window.setFixtureKeyboardHeight(null));
    await progress("已读取 2 / 4 张").waitFor();
    await shot("four-reading","同一条消息读完第一批，计时随运行显示");
    const active=await chat();
    assert.equal(consentCalls.length,countBefore+1);
    assert.equal(active.messages.length,2);
    assert.deepEqual(active.messages.at(-1).photoProgress,{read:2,total:4,phase:"reading"});
    assert.equal(active.messages.at(-1).references.length,0);
    await progress("正在合并结果").waitFor();
    await shot("four-combining","四张全部读完，进入统一汇总");
    await button("保存确认").waitFor();
    const result = await finished(), answer=result.messages.at(-1), sent=result.messages[0];
    const ledger=await attempt(answer.runId);
    assert.equal(answer.state,"complete");
    assert.equal(sent.text,text);
    assert.equal(sent.imageIds.length,4);
    assert.equal(answer.references.filter(ref=>ref.kind==="preview").length,1);
    assert.deepEqual(photosIn(ledger),[sent.imageIds.slice(0,2),sent.imageIds.slice(2)]);
    assert.ok(ledger.requestDiagnostics.every(item=>item.textSha256===createHash("sha256").update(text).digest("hex")));
    assert.ok(ledger.requestDiagnostics.filter(item=>item.phase==="answer").every(item=>item.images.length===0));
    assert.equal(ledger.toolResults.filter(item=>item.name==="preview_meals"&&!item.result.error).length,1);
    assert.equal((await existingMeals()).size,beforeMeals.size);
    await shot("four-preview","一次统一回答和一张待确认卡，尚未写入正式记录");
    await button("保存确认").evaluate(node=>{node.click();node.click();});
    await page.getByRole("heading",{name:"已保存",exact:true}).waitFor();
    const saved = (await meals()).filter(row=>!beforeMeals.has(row.id));
    assert.equal(saved.length,1);
    assert.equal(saved[0].mealType,"晚餐");
    assert.deepEqual(saved[0].items.map(item=>item.name),["验收烤鸡","验收鸡油饭"]);
    assert.deepEqual(saved[0].items.map(item=>Number(item.quantity)),[150,130]);
    assert.deepEqual([...saved[0].imageIds].sort(),[...sent.imageIds].sort());
    await shot("four-saved","人工确认后只保存一餐，四张原图均关联");
    check("四张一次发送。两批原文一致且顺序正确，文本合并后才创建一卡，确认只写入一餐和四张原图");

    await db.delete(rateLimit);
    await control({action:"new"});await open();
    await send("分批验收 · 第二批失败 · 晚餐烤鸡和鸡油饭合起来记一餐。",4);
    await progress("已读取 2 / 4 张").waitFor();
    const interruptedRun=(await chat()).activeRunId;
    assert.ok(interruptedRun);
    const resume=button("继续读取剩余 2 张");
    await reconnect(resume);
    const stopped=(await finished()).messages.at(-1);
    assert.equal(stopped.state,"error");
    assert.equal(stopped.runId,interruptedRun);
    assert.equal(stopped.photoLimit,undefined);
    assert.equal(stopped.contextLimited,undefined);
    assert.equal(stopped.references.length,0);
    assert.equal((await existingMeals()).size,beforeMeals.size+1);
    await open();await resume.waitFor();
    assert.equal((await chat()).messages.at(-1).photoProgress.read,2);
    const bounds=await resume.boundingBox();
    assert.ok(bounds && bounds.height>=43.9 && bounds.width>=43.9, JSON.stringify(bounds));
    assert.equal(await resume.evaluate(node=>getComputedStyle(node).minHeight),"44px");
    await matrix(resume,"failure","刷新后真实失败状态及唯一续读行动");
    const previousCalls=consentCalls.length;
    await resume.evaluate(node=>{node.click();node.click();});
    await progress("正在合并结果").waitFor();
    await shot("resume-combining","重连后仅读取剩余照片，回到同一条回复");
    await button("保存确认").waitFor();
    const recovered = await finished(), retried = recovered.messages.at(-1);
    assert.equal(consentCalls.length,previousCalls+1);
    assert.equal(retried.id,stopped.id);
    assert.equal(recovered.messages.length,2);
    assert.deepEqual(photosIn(await attempt(retried.runId)),[recovered.messages[0].imageIds.slice(2)]);
    assert.equal(retried.references.filter(ref=>ref.kind==="preview").length,1);
    await shot("resume-preview","失败续读后在原回复下得到一张待确认卡");
    check("断网和刷新恢复原任务。失败后只读图3和4，连点续读只发一次，保持同一条回复");

    if(mobile){
      await db.delete(rateLimit);
      await control({action:"new"});await open();
      await send("分批验收 · 汇总失败 · 请只核对四张照片",4);
      const merge=button("重试汇总");
      await merge.waitFor();
      const broken=(await finished()).messages.at(-1);
      assert.deepEqual(broken.photoProgress,{read:4,total:4,phase:"combining"});
      await shot("merge-failure","全部照片已读取，汇总失败后允许重试汇总");
      await merge.click();
      await page.getByText("已一起核对 4 张照片。重复角度的食物只计算一次。",{exact:true}).waitFor();
      const merged=(await finished()).messages.at(-1);
      assert.equal(merged.id,broken.id);
      assert.deepEqual(photosIn(await attempt(merged.runId)),[]);
      await shot("merge-retried","汇总重试在原回复内完成，没有重读照片");

      await db.delete(rateLimit);
      await control({action:"new"});await open();
      const extra=await readFile(samples[0].file);
      let uploads=0;
      page.on("request",request=>{if(request.method()==="POST"&&request.url().includes("/api/meal-images/"))uploads++;});
      await fileInput.setInputFiles(Array.from({length:10},(_,i)=>({name:"样例-"+i+".png",mimeType:"image/png",buffer:extra})));
      await page.getByRole("alert").filter({hasText:"每条消息最多8张照片。"}).waitFor();
      assert.equal(uploads,0);
      await shot("ten-photos","超过8张在选图阶段明确提示，未发上传请求");
      await input.fill("请只核对八张照片，重复角度只算一次。");
      await fileInput.setInputFiles(samples.slice(0,8).map(row=>row.file));
      await hint(8).waitFor();
      await waitSend();
      await shot("eight-selected","可选满八张，手机缩略图可横向浏览");
      await button("发送消息").click();
      await page.getByText("已一起核对 8 张照片。重复角度的食物只计算一次。",{exact:true}).waitFor();
      const eight = await finished();
      assert.equal(eight.messages.length,2);
      const ids=eight.messages[0].imageIds;
      assert.equal(ids.length,8);
      assert.deepEqual(photosIn(await attempt(eight.messages.at(-1).runId)),[0,2,4,6].map(index=>ids.slice(index,index+2)));
      await shot("eight-complete","八张依序分四批完成，仅输出一条答复");
      check("八张四批、十张上传前校验及只重试汇总均通过");
    }
  }

  try{
    if(process.env.FORMWARD_CONTEXT_CASE!=="photos" && process.env.FORMWARD_CONTEXT_SCREEN!=="desktop")await journey("mobile",true,async flow=>{
      await savedThenInterrupted(flow,true);
      const {page,chat,control,shot,check,open,send,finished}=flow;
      await control({action:"new"});
      const historical=(await chat()).conversationId;
      const history=Array.from({length:12},(_,n)=>({id:randomUUID(),userId,conversationId:historical,seq:n+1,
        role:n%2?"assistant":"user",text:(n===0?"最早一轮验收标记":"较早的问答")+"虚构记录".repeat(4300)}));
      await db.insert(assistantMessage).values(history);
      await db.update(assistantConversation).set({sequence:12}).where(eq(assistantConversation.id,historical));
      await open();
      await send("上下文验收只看现在");
      const ordinary=page.getByText("本次只核对两点。第一，份量已确认。第二，晚餐已归到今天。",{exact:true});
      await ordinary.waitFor();
      const normal=(await finished()).messages.at(-1);
      assert.equal(normal.state,"complete");
      assert.equal(normal.detailLimit,undefined);
      await shot("trimmed-history","省略较早问答后仍覆盖新问题全部两项");
      check("请求实际省掉较早问答并正常结束");

      await control({action:"new"});
      const partial=(await chat()).conversationId,partialQ=randomUUID(),partialA=randomUUID();
      await db.insert(assistantMessage).values([
        {id:partialQ,userId,conversationId:partial,seq:1,role:"user",text:"请列出这16天的全部饮食明细。"},
        {id:partialA,userId,conversationId:partial,seq:2,role:"assistant",text:"我只核对了这段记录的前8天。",provider:"qwen"},
      ]);
      await db.update(assistantConversation).set({sequence:2}).where(eq(assistantConversation.id,partial));
      await db.insert(assistantRun).values({id:randomUUID(),userId,conversationId:partial,userMessageId:partialQ,assistantMessageId:partialA,
        requestDigest:"fixture",requestId:randomUUID(),provider:"qwen",model:"isolated",state:"complete",requestDiagnostics:[{
          state:"completed",requestSha256:"fixture",round:2,provider:"qwen",model:"isolated",messageId:partialQ,attachmentSourceId:partialQ,images:[],textSha256:"fixture",detailLimit:8,
        }]});
      await open();
      await page.getByText("本次查询中，较长的明细列表只核对了前 8 项。",{exact:true}).waitFor();
      await shot("partial-query","服务端回放部分明细，用户能看到结果只覆盖前8项");
      check("部分明细保留范围说明");

    });
    if(process.env.FORMWARD_CONTEXT_CASE!=="photos" && process.env.FORMWARD_CONTEXT_SCREEN!=="mobile")
      await journey("desktop",false,flow=>savedThenInterrupted(flow,false));
    if(process.env.FORMWARD_CONTEXT_CASE!=="overflow" && process.env.FORMWARD_CONTEXT_SCREEN!=="desktop")
      await journey("mobile-batches",true,flow=>automaticPhotos(flow,true));
    if(process.env.FORMWARD_CONTEXT_CASE!=="overflow" && process.env.FORMWARD_CONTEXT_SCREEN!=="mobile")
      await journey("desktop-batches",false,flow=>automaticPhotos(flow,false));
  }finally{await browser.close();}
}

