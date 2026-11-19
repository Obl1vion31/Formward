import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {rateLimit} from "../src/db/schema.ts";

const sendLabel = "发送消息";
const inputLabel = "给小助手发消息";
const firstPrompt = "这顿海南鸡饭帮我记一下，晚餐。";

export async function runAssistantExperienceBrowser(db) {
  const fixture = JSON.parse(await readFile(process.env.FORMWARD_CHAT_BROWSER_CONFIG,"utf8"));
  const {baseURL:base,samples} = fixture, dir = process.env.FORMWARD_CHAT_ARTIFACTS;
  const engine = process.env.CHAT_BROWSER??"chromium";
  const library = await import(process.env.PLAYWRIGHT_MODULE??"/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
  const browser = await library[engine].launch({headless:true,executablePath:process.env.FORMWARD_CHAT_BROWSER_EXECUTABLE});
  const results = [];
  const delay = async delayMs => {
    if (!fixture.delayControlURL) return;
    const response = await fetch(fixture.delayControlURL,{method:"POST",body:JSON.stringify({delayMs})});
    assert.ok(response.ok);
  };

  async function journey(name, size, mobile, run) {
    const context = await browser.newContext({viewport:size,hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1,
      reducedMotion:"no-preference",recordVideo:{dir,size}});
    await context.addInitScript(() => {
      localStorage.setItem("formward-theme","light");
      const native = window.visualViewport, proxy = new EventTarget();
      let state = null;
      for (const name of ["height","width","offsetTop","offsetLeft","pageTop","pageLeft","scale"])
        Object.defineProperty(proxy,name,{get:()=>state?.[name]??native?.[name]??0});
      Object.defineProperty(window,"visualViewport",{configurable:true,value:proxy});
      for (const type of ["resize","scroll"]) native?.addEventListener(type,()=>proxy.dispatchEvent(new Event(type)));
      window.fixtureViewport = value => {state=value;proxy.dispatchEvent(new Event("resize"));proxy.dispatchEvent(new Event("scroll"));};
    });
    await context.route(/^https:\/\/(?:[a-z0-9-]+\.cos\.ap-shanghai\.myqcloud\.com|vercel\.com)\//,
      route=>route.fulfill({status:200,body:""}));
    const page = await context.newPage(), video = page.video(), start = performance.now();
    page.setDefaultTimeout(65000);
    const record = {name,engine,viewport:size,simulatedKeyboard:mobile,screenshots:[],checks:[],errors:[]};
    results.push(record);
    let expectedInterruption = false;
    page.on("pageerror",error=>{
      if (expectedInterruption && engine==="webkit" && /\/api\/assistant-(?:chat|context).*due to access control checks\.$/.test(error.message)) {
        (record.browserNotices??=[]).push("测试主动断开时 WebKit 取消正在进行的读取。");
      } else record.errors.push(error.message);
    });
    const interrupting = value => {expectedInterruption=value;};
    const input = () => page.getByRole("textbox",{name:inputLabel,exact:true});
    const send = () => page.getByRole("button",{name:sendLabel,exact:true});
    const status = () => page.locator("article[data-role=assistant] time[datetime^=PT]").last();
    const message = text => page.locator("article[data-role=user]").filter({hasText:text}).last();
    async function shot(label, description) {
      const file = engine+"-"+name+"-"+String(record.screenshots.length+1).padStart(2,"0")+"-"+label+".png";
      await page.screenshot({path:join(dir,file)});
      record.screenshots.push({file,description,atSeconds:Math.round((performance.now()-start)/100)/10});
      console.log(engine,name,label);
    }
    async function mark(label) {record.checks.push(label);console.log(engine,name,"PASS",label);}
    async function open() {
      if (!(await input().isVisible())) await page.locator("[data-assistant-trigger]:visible").first().click();
      await input().waitFor();
      await page.getByRole("button",{name:"千问",exact:true}).waitFor();
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(350);
      assert.equal(await page.locator(".local-preview-label").innerText(),"隔离测试 · 虚构数据");
    }
    async function newConversation() {
      const response = await context.request.post(base+"/api/assistant-chat/control",{headers:{Origin:base},data:{action:"new"}});
      assert.equal(response.status(),200);
    }
    async function fixtureFiles(count) {
      await page.locator('input[aria-label="选择聊天照片"]:visible, input[aria-label="选择聊天照片"]').last()
        .setInputFiles(samples.slice(0,count).map(sample=>sample.file));
      await page.waitForFunction(()=>[...document.querySelectorAll('button[aria-label="发送消息"]')].some(node=>node.getClientRects().length && !node.disabled));
    }
    try {
      const response = await context.request.post(base+"/api/auth/sign-in/email",{
        headers:{Origin:base},data:{email:fixture.account.email,password:fixture.account.password},
      });
      assert.equal(response.status(),200);
      await newConversation();
      await page.goto(base+"/dashboard");
      await page.waitForFunction(()=>!!document.querySelector("[data-assistant-trigger]"));
      await run({page,context,input,send,status,message,shot,mark,open,newConversation,fixtureFiles,interrupting});
      assert.deepEqual(record.errors,[]);
    } catch (error) {
      record.failure = String(error);
      await page.screenshot({path:join(dir,engine+"-"+name+"-failure.png")}).catch(()=>{});
      throw error;
    } finally {
      await context.close();
      if (video) {
        const file = engine+"-"+name+".webm";
        await video.saveAs(join(dir,file));
        record.video = file;
        record.originalVideo = await video.path();
      }
      await writeFile(join(dir,engine+"-experience.json"),JSON.stringify(results,null,2));
    }
  }

  async function mainFlow(flow, mobile) {
    const {page,input,send,status,message,shot,mark,open,fixtureFiles,context} = flow;
    await delay(0);
    await shot("entry","从总览进入小助手");
    await open();
    await shot("header","完整聊天头部与空对话");
    if (mobile) {
      const positions = await page.getByRole("tab").evaluateAll(tabs=>tabs.filter(tab=>tab.getClientRects().length).map(tab=>tab.getBoundingClientRect().top));
      assert.equal(positions.length,2);
      assert.ok(Math.abs(positions[0]-positions[1])<=1);
      const heading = await page.locator("[data-assistant-page] header").first().boundingBox();
      assert.ok(heading.height>=54 && heading.height<=58);
      await page.getByRole("tab",{name:/待办/}).click();
      await shot("tasks","同一行切换待办");
      await page.getByRole("tab",{name:"聊天",exact:true}).click();
    }
    await input().fill(firstPrompt);
    await fixtureFiles(1);
    await input().focus();
    if (mobile) await page.evaluate(()=>window.fixtureViewport({height:530,offsetTop:0}));
    await shot("composing",mobile?"照片和文字已就绪，模拟键盘占用视口":"照片和文字已就绪");
    await page.waitForTimeout(400);

    await delay(1200);
    let first = true;
    await context.route(base+"/api/assistant-chat",async route => {
      if (route.request().method()==="POST" && first) {
        first = false;
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
      await route.continue();
    });
    await send().click();
    const bubble = message(firstPrompt);
    await bubble.getByText("发送中",{exact:true}).waitFor();
    assert.equal(await input().inputValue(),"");
    await bubble.evaluate(node=>{window.fixtureSentNode=node;});
    const image = bubble.getByAltText("本条消息的私有照片");
    await image.waitFor();
    assert.ok((await image.getAttribute("src")).startsWith("blob:"));
    const picture = await image.boundingBox(), lettering = await bubble.getByText(firstPrompt,{exact:true}).boundingBox();
    assert.ok(picture.y+picture.height<=lettering.y,"图在字上方");
    await shot("sending","未收到服务器确认时已显示真实照片、文字和发送中");
    if (mobile) {
      assert.equal(await bubble.getAttribute("data-new-message"),null);
      await page.evaluate(()=>window.fixtureViewport(null));
      await page.waitForFunction(()=>window.fixtureSentNode?.dataset.newMessage==="true");
      await page.waitForTimeout(230);
      await shot("keyboard-settled","模拟视口恢复后原消息轻缩放并落位");
    }
    await page.getByText("正在查找食材库",{exact:true}).waitFor();
    await status().waitFor();
    const firstTime = await status().innerText(), timeBounds = await status().boundingBox();
    await page.waitForFunction(prior=>Array.from(document.querySelectorAll("time[datetime^=PT]")).some(node=>node.textContent!==prior),firstTime);
    const nextTime = await status().innerText(), nextBounds = await status().boundingBox();
    assert.notEqual(nextTime,firstTime);
    assert.ok(Math.abs(timeBounds.width-nextBounds.width)<=1);
    await shot("timing","查库中计时，每秒更新，时间宽度稳定");

    const card = page.getByRole("form",{name:"补充海南鸡饭份量",exact:true});
    await card.waitFor();
    await delay(0);
    const manual = card.getByRole("textbox");
    const previousStatus = await bubble.evaluate(node=>node===window.fixtureSentNode);
    assert.ok(previousStatus,"服务器确认不替换气泡");
    assert.equal(await page.locator("time[datetime^=PT]").count(),0);
    assert.equal(await card.getByRole("button",{name:"半碗",exact:true}).getAttribute("aria-pressed"),"false");
    await manual.fill("3/4 碗");
    await shot("manual","手填框始终可见，选项无默认值");
    if (mobile) {
      await page.setViewportSize({width:320,height:560});
      await card.scrollIntoViewIfNeeded();
      assert.ok(await card.evaluate(node=>node.getBoundingClientRect().width<=innerWidth && node.scrollWidth<=node.clientWidth+1));
      await page.evaluate(()=>{document.documentElement.dataset.theme="dark";});
      await shot("narrow-dark","320px 深色矮屏可滚动，操作不横向溢出");
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>{document.documentElement.dataset.theme="light";});
    }
    await card.getByRole("button",{name:"跳过本题",exact:true}).click();
    await card.getByText("白切鸡大约吃了多少？",{exact:true}).waitFor();
    await card.getByRole("button",{name:"上一题",exact:false}).click();
    await card.getByText("本题已跳过",{exact:true}).waitFor();
    await card.getByRole("button",{name:"半碗",exact:true}).click();
    await card.getByRole("button",{name:"下一题",exact:true}).click();
    await card.getByRole("button",{name:"上一题",exact:false}).click();
    assert.equal(await card.getByRole("button",{name:"半碗",exact:true}).getAttribute("aria-pressed"),"true");
    await card.getByRole("button",{name:"下一题",exact:true}).click();
    assert.equal(await card.getByRole("button",{name:"跳过全部",exact:true}).count(),0);
    await card.getByRole("button",{name:"不知道",exact:true}).click();
    await shot("unknown","不知道作为当前题选项，最后一题继续");
    await page.waitForTimeout(450);
    await card.getByRole("button",{name:"继续",exact:true}).click();
    const result = page.locator("article[data-role=assistant]").last();
    await result.getByText(/按晚餐整/).waitFor();
    const partial = await result.innerText();
    assert.ok(!partial.includes("待保存记录。"),"在正式回复结束之前已显示真实分片");
    await status().waitFor();
    await shot("streaming","新一轮计时和未结束的正文片段");
    await result.getByText(/白切鸡份量留空。/).waitFor();
    await page.locator("[data-chat-preview]").last().waitFor();
    assert.equal(await card.count(),0,"明确不知道后旧字段没有再次发问");
    const summary = page.locator("article[data-role=assistant] details").filter({hasText:/已补充 · 鸡油饭半碗/});
    await summary.scrollIntoViewIfNeeded();
    await shot("collapsed","摘要回到原提问下面，保留记录入口");
    await summary.locator("summary").click();
    assert.match(await summary.innerText(),/白切鸡[\s\S]*不知道/);
    assert.equal(await page.locator("article[data-role=user]").filter({hasText:"已补充"}).count(),0);
    await shot("expanded","展开核对每题内容，未提供字段有明确状态");
    const preview = page.locator("[data-chat-preview]").last();
    await preview.scrollIntoViewIfNeeded();
    await shot("preview","实际生成隔离待保存预览");
    await page.waitForTimeout(800);
    const progress = page.locator("article[data-role=assistant] details").filter({hasText:"查找食材库 · 2 次"});
    await progress.locator("summary").click();
    assert.match(await progress.innerText(),/查找食材库 · 2 次/);
    await shot("progress","真实查库结果归到同一过程组");
    await mark("发送前本地照片可见、上图下字、同一气泡确认、计时宽度稳定、手填与逐题回退、未知去重、摘要和实际预览");
    await page.waitForTimeout(500);
  }

  async function exceptional(flow) {
    const {page,context,input,send,status,message,shot,mark,open,fixtureFiles,interrupting} = flow;
    await open();
    let failures = 2;
    interrupting(true);
    await context.route(base+"/api/assistant-chat",route => route.request().method()==="POST" && failures-- >0
      ? route.fulfill({status:503,contentType:"application/json",headers:{"Access-Control-Allow-Origin":base,
        "Access-Control-Allow-Credentials":"true"},body:JSON.stringify({error:"模拟发送连接中断，可以重试。"})})
      : route.continue());
    await input().fill("慢速测试 · 恢复原消息");
    await fixtureFiles(1);
    await send().click();
    await page.getByRole("button",{name:"恢复草稿",exact:true}).waitFor();
    await shot("failed-send","发送接口暂时失败，图文留在同一条消息");
    await page.waitForTimeout(450);
    await page.getByRole("button",{name:"恢复草稿",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('textarea[aria-label="给小助手发消息"]')?.value.includes("恢复原消息"));
    assert.equal(await message("慢速测试 · 恢复原消息").count(),0);
    await shot("restored","草稿文字和图片一起恢复");
    await send().click();
    await page.getByRole("button",{name:"重试发送",exact:true}).click();
    await status().waitFor();
    const before = await context.request.get(base+"/api/assistant-chat").then(response=>response.json());
    assert.ok(before.activeRunId);
    await shot("running","重试成功，后台正在回复");
    await page.reload();
    await open();
    await status().waitFor();
    const after = await context.request.get(base+"/api/assistant-chat").then(response=>response.json());
    assert.equal(after.activeRunId,before.activeRunId);
    interrupting(false);
    await shot("resumed","刷新后续订原后台任务与计时");
    await page.getByRole("button",{name:"停止生成",exact:true}).waitFor({state:"hidden"});
    assert.equal(await message("慢速测试 · 恢复原消息").count(),1);
    await mark("发送失败恢复图文，重试及刷新保留原任务，消息只出现一次");

    await input().fill("分批验收，帮我读这四张照片。");
    await fixtureFiles(4);
    await send().click();
    const picker = page.getByRole("group",{name:"这条消息的照片可以分批处理"});
    await picker.waitFor();
    assert.match(await picker.innerText(),/还有 4 张可选/);
    await shot("over-limit","原消息内选择照片分批继续");
    await page.waitForTimeout(600);
    const firstBefore = await context.request.get(base+"/api/assistant-chat").then(response=>response.json());
    for (let count=4;count>0;count--) {
      await picker.getByRole("checkbox").first().check();
      await picker.getByRole("button",{name:"处理所选照片",exact:true}).click();
      if (count>1) await picker.getByText(new RegExp("还有 "+(count-1)+" 张可选")).waitFor();
    }
    await page.getByText("这条消息的照片已经分批处理。",{exact:true}).waitFor();
    const final = await context.request.get(base+"/api/assistant-chat").then(response=>response.json());
    assert.equal(final.conversationId,firstBefore.conversationId);
    assert.equal(await message("分批验收，帮我读这四张照片。").count(),1);
    await shot("batches-complete","已在同一对话逐批处理，原始照片消息保留");
    await mark("四张照片分批在原对话处理，原始图文未重复发送");

    await input().fill(firstPrompt);
    await send().click();
    const card = page.getByRole("form",{name:"补充海南鸡饭份量",exact:true});
    await card.getByRole("button",{name:"跳过全部",exact:true}).click();
    await page.getByText("本次未提供补充",{exact:true}).waitFor();
    await page.getByText(/鸡油饭和白切鸡的实际份量均留空/).last().waitFor();
    await page.getByRole("button",{name:"停止生成",exact:true}).waitFor({state:"hidden"});
    assert.equal(await card.count(),0);
    await shot("all-skipped","跳过两项后继续回复，未知信息留空");
    await mark("跳过全部一次推进，服务端结束该任务的追问");
    await page.waitForTimeout(850);
  }

  try {
    if (!samples?.length) throw Error("需要提供隔离海南鸡饭样例");
    if (process.env.FORMWARD_EXPERIENCE_CASE !== "exceptions") {
      await journey("mobile",{width:390,height:844},true,flow=>mainFlow(flow,true));
      if (process.env.FORMWARD_EXPERIENCE_CASE !== "mobile")
        await journey("desktop",{width:1440,height:900},false,flow=>mainFlow(flow,false));
    }
    await delay(0);
    if (!process.env.FORMWARD_EXPERIENCE_CASE || process.env.FORMWARD_EXPERIENCE_CASE === "exceptions") {
      // 三条录像复用的仅是本地虚构库。上一条录像的诊断请求不占下一条的分钟配额。
      if (results.length) await db.delete(rateLimit);
      await journey("recovery",{width:390,height:844},true,exceptional);
    }
    console.log(JSON.stringify(results.map(({name,checks,screenshots,video})=>({name,checks,shots:screenshots.length,video}))));
  } finally {
    await delay(0);
    await browser.close();
  }
}
