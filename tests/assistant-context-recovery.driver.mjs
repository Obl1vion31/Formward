import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { assistantConversation, assistantMessage, assistantRun, assistantUsageRequest, meal, rateLimit } from "../src/db/schema.ts";
import { readMealSnapshot } from "../src/features/meals/records.ts";

const warning = "这次要处理的内容太多，回复已中断。";
const replyWithQuote = "新建会话继续回答";

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
    const record = {name,engine,viewport,shots:[],checks:[],errors:[]};
    report.push(record);
    page.on("pageerror",error=>record.errors.push(String(error)));
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
      if(!mobile) await page.locator("[data-assistant-trigger]:visible").click();
      await input.waitFor();
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
      await run({page,input,button,chat,control,shot,check,open,send,finished,showSource,geometry,context});
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

  try{
    if(process.env.FORMWARD_CONTEXT_SCREEN!=="desktop")await journey("mobile",true,async flow=>{
      await savedThenInterrupted(flow,true);
      const {page,input,button,chat,control,shot,check,open,send,finished}=flow;
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

      await db.delete(rateLimit);
      await control({action:"new"}); await open();
      await send("两张照片已读验收。",2);
      await page.getByText("两张照片都已读取。",{exact:true}).waitFor();
      await finished();
      assert.equal(await button(replyWithQuote).count(),0);
      assert.equal(await page.getByRole("group",{name:/照片未处理/}).count(),0);
      await shot("two-photos","两张照片处理完成，正常结束");

      await send("分批验收 · 四张",4);
      const batch=page.getByRole("group",{name:/还有 4 张照片未处理/});
      await batch.waitFor();
      assert.equal(await button(replyWithQuote).count(),0);
      await shot("four-photos","四张照片在原消息下进入分批");
      await batch.getByRole("checkbox").first().check();
      await button("处理所选照片").click();
      await page.getByText("还有 3 张照片未处理",{exact:true}).waitFor();
      await finished();
      await shot("photo-batched","处理后剩余候选减少，原消息继续可见");

      const photos=await readFile(samples[0].file);
      let uploads=0;
      page.on("request",request=>{if(request.method()==="POST"&&request.url().includes("/api/meal-images/upload"))uploads++;});
      await page.getByLabel("选择聊天照片",{exact:true}).setInputFiles(Array.from({length:10},(_,i)=>({name:"fixture-"+i+".png",mimeType:"image/png",buffer:photos})));
      await page.getByRole("alert").filter({hasText:"每条消息最多8张照片。"}).waitFor();
      assert.equal(uploads,0);
      assert.equal(await input.inputValue(),"");
      await shot("ten-photos","选十张在上传之前提示每条最多八张");
      check("两图完成、四图分批、十图选图上限分别复测");
    });
    if(process.env.FORMWARD_CONTEXT_SCREEN!=="mobile")await journey("desktop",false,flow=>savedThenInterrupted(flow,false));
  }finally{await browser.close();}
}

