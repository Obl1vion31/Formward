import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {eq} from "drizzle-orm";
import {assistantUsageRequest,rateLimit} from "../src/db/schema.ts";

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

    await delay(1900);
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
    const preceding = summary.locator("xpath=ancestor::article");
    assert.equal(await preceding.getByText("千问",{exact:true}).count(),1);
    assert.equal(await result.getByText("千问",{exact:true}).count(),0);
    assert.equal(await result.locator('time:not([datetime^="PT"])').count(),1);
    const records = preceding.getByRole("link",{name:/查看饮食记录/});
    const quote = preceding.getByRole("button",{name:"引用回复",exact:true});
    const copy = preceding.getByRole("button",{name:"复制",exact:true});
    if (mobile) {
      for (const button of [quote,copy]) {
        assert.equal(await button.locator("span").isVisible(),false);
        const box = await button.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44);
        assert.ok(Math.abs(box.y - (await records.boundingBox()).y) <= 1,"记录链接和操作同行");
      }
    }
    await shot("handoff","同任务的原提问、补充摘要、记录入口和后续时间在原处连读");
    const preview = page.locator("[data-chat-preview]").last();
    await preview.scrollIntoViewIfNeeded();
    await shot("preview","实际生成隔离待保存预览");
    await page.waitForTimeout(800);
    const progress = page.locator("article[data-role=assistant] details").filter({hasText:"查找食材库 · 2 次"});
    await progress.locator("summary").click();
    assert.match(await progress.innerText(),/查找食材库 · 2 次/);
    await shot("progress","真实查库结果归到同一过程组");
    const copyText = await preceding.getByText("鸡油饭和白切鸡各吃了多少？",{exact:true}).innerText();
    await copy.click();
    await page.getByText("已复制回答",{exact:true}).waitFor();
    await quote.click();
    await page.getByRole("button",{name:"取消引用",exact:true}).waitFor();
    assert.match(await page.getByRole("button",{name:/引用回答/}).last().innerText(),new RegExp(copyText.replaceAll("？","[？?]")));
    await page.getByRole("button",{name:"取消引用",exact:true}).click();
    await mark("发送前本地照片可见、上图下字、计时宽度稳定、同一任务连读、引用复制和实际预览");
    await page.waitForTimeout(500);
  }

  async function composerFlow({page,context,input,send,status,open,shot,mark}, mobile) {
    await open();
    const plus = page.getByRole("button",{name:"添加照片",exact:true});
    const model = () => page.getByRole("button",{name:/^(千问|小米 MiMo)$/});
    const menu = page.getByRole("dialog",{name:"模型与用量"});
    const remaining = menu.locator("[data-chat-remaining]");
    const row = input().locator("..");
    const requestBalance = async () => {
      const response = await context.request.get(base+"/api/account/entitlements");
      assert.equal(response.status(),200);
      return (await response.json()).usage;
    };
    async function openMenu() {
      await model().click();
      await menu.waitFor();
      await menu.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
    }
    async function closeMenu() {
      await page.keyboard.press("Escape");
      await menu.waitFor({state:"hidden"});
    }
    const widths = mobile ? [[320,560],[390,844],[430,860]] : [[1100,780],[1440,900]];
    for (const theme of ["light","dark"]) {
      for (const [width,height] of widths) {
        await page.setViewportSize({width,height});
        await page.evaluate(value => { document.documentElement.dataset.theme=value; },theme);
        const boxes = await Promise.all([plus,input(),model(),send()].map(control => control.boundingBox()));
        for (const [index,box] of boxes.entries()) {
          assert.ok(box && box.height >= 44);
          if (index !== 1) assert.ok(box.width >= 44);
          assert.ok(Math.abs(box.y + box.height - (boxes[0].y + boxes[0].height))<=1);
          if (index) assert.ok(box.x >= boxes[index-1].x+boxes[index-1].width);
        }
        assert.equal(await input().evaluate(node=>getComputedStyle(node).fontSize),"16px");
        assert.equal(await remaining.count(),0);
        await openMenu();
        await remaining.waitFor();
        const box = await menu.boundingBox(), anchor = await model().boundingBox();
        assert.ok(box.x >= 8 && box.x+box.width <= width-8 && box.y >= 4 && box.y+box.height <= anchor.y-3);
        await shot(theme+"-"+width,"实际 "+width+"px "+(theme==="light"?"浅色":"深色")+"输入栏与上方额度菜单");
        await closeMenu();
      }
    }
    await mark("各尺寸单行、16px输入、44px按钮和弹层向上展开");

    await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:900});
    await page.evaluate(()=>{ document.documentElement.dataset.theme="light"; });
    if (mobile) {
      const cdp = engine==="chromium" ? await context.newCDPSession(page) : undefined;
      let lastPoint, pointerId = 40;
      async function touch(type, x, y) {
        if (cdp) {
          await cdp.send("Input.dispatchTouchEvent",{
            type, touchPoints:type==="touchEnd" || type==="touchCancel" ? [] : [{x,y,id:0}],
          });
        } else {
          if (type==="touchStart") {
            pointerId++;
            lastPoint=await page.evaluateHandle(({x,y})=>document.elementFromPoint(x,y),{x,y});
          }
          const event = {pointerType:"touch",pointerId,isPrimary:true,bubbles:true,clientX:x,clientY:y,
            buttons:type==="touchEnd"||type==="touchCancel"?0:1};
          await lastPoint.evaluate((node,{name,event})=>node.dispatchEvent(new PointerEvent(name,event)),{
            name:{touchStart:"pointerdown",touchMove:"pointermove",touchEnd:"pointerup",touchCancel:"pointercancel"}[type],event,
          });
          if (type==="touchEnd" || type==="touchCancel") await lastPoint.dispose();
        }
      }
      const box = await row.boundingBox(), x=Math.round(box.x+box.width/2), y=Math.round(box.y+box.height/2);
      const shift = () => row.evaluate(node=>parseFloat(node.style.getPropertyValue("--press-shift")));
      const origin = () => row.evaluate(node=>parseFloat(node.style.getPropertyValue("--press-x")));
      await touch("touchStart",x,y);
      await page.waitForTimeout(170);
      assert.equal(await row.getAttribute("data-pressing"),"true");
      assert.ok(Math.abs(await origin() - box.width/2)<=1);
      await shot("center","手指按在中间，横向柔光向两侧铺开");
      await touch("touchMove",x+38,y);
      await page.waitForTimeout(80);
      assert.equal(await shift(),12);
      await shot("right","手指向右移动38px，高光只偏移12px");
      await touch("touchMove",x-38,y);
      await page.waitForTimeout(80);
      assert.equal(await shift(),-12);
      await shot("left","手指向左移动，高光跟随，表单边界保持");
      assert.deepEqual(await row.boundingBox(),box);
      await touch("touchEnd",x-38,y);
      await page.waitForTimeout(200);
      assert.equal(await row.getAttribute("data-pressing"),null);
      await touch("touchStart",x-42,y);
      await page.waitForTimeout(170);
      assert.ok(Math.abs(await origin() - box.width/2 + 42)<=1);
      await shot("offset","偏左按下，高光从实际触点周围展开");
      await touch("touchMove",x-42,y-16);
      await page.waitForTimeout(100);
      assert.equal(await row.getAttribute("data-pressing"),null);
      await touch("touchCancel",x-42,y-16);
      await page.emulateMedia({reducedMotion:"reduce"});
      await touch("touchStart",x,y);
      assert.equal(await row.evaluate(node=>{
        const light = node.querySelector('[aria-hidden="true"] div span');
        return getComputedStyle(light).transitionDuration;
      }),"0s");
      await shot("reduced","减少动态效果时只显示静态按压色");
      await touch("touchEnd",x,y);
      await page.emulateMedia({reducedMotion:"no-preference"});
      await input().focus();
      await input().fill("可以选中文本并继续编辑");
      await input().evaluate(node=>node.setSelectionRange(2,6));
      assert.equal(await input().evaluate(node=>node.value.substring(node.selectionStart,node.selectionEnd)),"选中文本");
      await page.evaluate(()=>window.fixtureViewport({height:350,offsetTop:0}));
      await openMenu();
      assert.ok((await menu.boundingBox()).y+(await menu.boundingBox()).height<=350);
      await shot("keyboard-menu","模拟键盘缩小可视区后，模型菜单留在可视区");
      await closeMenu();
      await page.evaluate(()=>window.fixtureViewport(null));
      await mark("触点、左右跟手、竖向取消、减少动态效果、输入选区和模拟键盘");
    }

    const draft = "这顿海南鸡饭帮我记一下，晚餐。";
    await input().fill(draft.repeat(5));
    assert.ok((await input().boundingBox()).height>44,"长文字在同一输入框增高");
    await input().fill(draft);
    const choose = page.waitForEvent("filechooser");
    if (mobile) await plus.tap(); else await plus.click();
    const picker = await choose;
    await picker.setFiles(samples.slice(0,2).map(sample=>sample.file));
    await page.getByRole("button",{name:"移除照片 2",exact:true}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('button[aria-label="发送消息"]').disabled);
    const thumbnail = page.getByAltText("照片 1",{exact:true});
    assert.ok((await thumbnail.boundingBox()).y+(await thumbnail.boundingBox()).height<=(await row.boundingBox()).y+1);
    await page.getByRole("button",{name:"移除照片 2",exact:true}).click();
    assert.equal(await page.getByAltText("照片 2",{exact:true}).count(),0);
    await openMenu();
    assert.ok(await remaining.isVisible());
    const photoMenu = await menu.boundingBox(), photoBox = await thumbnail.boundingBox();
    assert.ok(photoMenu.y + photoMenu.height + 2 <= photoBox.y, "有照片时菜单不遮挡缩略图");
    await shot("photo-menu","实际选图并逐张移除后，缩略图在输入栏左上方");
    await menu.getByRole("menuitemradio",{name:/小米 MiMo/}).click();
    await page.getByRole("button",{name:"小米 MiMo",exact:true}).waitFor();
    assert.equal(await input().inputValue(),draft);
    assert.ok(await thumbnail.isVisible());
    await openMenu();
    await menu.getByRole("menuitemradio",{name:/千问/}).click();
    await page.getByRole("button",{name:"千问",exact:true}).waitFor();
    await page.getByRole("button",{name:"移除照片 1",exact:true}).click();

    let fail = true;
    await context.route(base+"/api/account/entitlements",route => fail
      ? route.fulfill({status:503,json:{error:"隔离验收模拟读取失败"}}) : route.continue());
    await openMenu();
    await menu.getByText("额度更新失败",{exact:true}).waitFor();
    await shot("refresh-failed","额度刷新失败时菜单内保留已知余额，可在原位置重试");
    fail = false;
    await menu.getByRole("button",{name:"重试",exact:true}).click();
    await remaining.waitFor();
    await menu.getByText(/北京时间 00:00 重置/).waitFor();
    await closeMenu();
    await context.unroute(base+"/api/account/entitlements");

    await input().fill("慢速测试 · 查看共享余额");
    await send().click();
    await status().waitFor();
    let active;
    for (let attempt = 0; attempt < 24; attempt++) {
      const response = await context.request.get(base+"/api/assistant-chat");
      active = await response.json();
      if (active.activeRunId && active.usage.reserved > 0) break;
      await page.waitForTimeout(75);
    }
    assert.ok(active.activeRunId);
    assert.ok(active.usage.reserved>0,"运行任务已在隔离账本预占");
    const activeBalance = await requestBalance();
    await openMenu();
    await menu.getByText("今日剩余 "+activeBalance.remainingPercent,{exact:true}).waitFor();
    for (const option of await menu.getByRole("menuitemradio").all()) assert.ok(await option.isDisabled());
    await shot("running-balance","生成时可读取实际扣除预占后的余额，模型切换暂缓");
    await closeMenu();
    const stop = page.getByRole("button",{name:"停止生成",exact:true});
    if (await stop.isVisible()) await stop.click();
    await stop.waitFor({state:"hidden"});
    await openMenu();
    assert.equal(await menu.getByRole("menuitemradio",{name:/小米 MiMo/}).isDisabled(),false);
    await closeMenu();
    await mark("实际选图和逐张移除、换模型保留草稿、失败重试、生成中看余额及停止后切换");

    if (!mobile) return;
    const settled = await (await context.request.get(base+"/api/assistant-chat")).json();
    const ledgerId = randomUUID();
    try {
      await db.insert(assistantUsageRequest).values({
        id:ledgerId,userId:fixture.userId,runId:active.activeRunId,provider:"mimo",date:settled.usage.date,
        state:"settled",reservedCny:"0",costCny:(settled.usage.available-.005).toFixed(8),
        usage:{prompt_tokens:0,completion_tokens:0},rates:{input:1,cachedInput:.02,output:2},
      });
      assert.equal((await requestBalance()).remainingPercent,"<1%");
      await openMenu();
      await menu.getByText("今日剩余 <1%",{exact:true}).waitFor();
      await shot("nearly-empty","隔离账本真实余额低于1%");
      await closeMenu();
      await db.update(assistantUsageRequest).set({costCny:settled.usage.limit.toString()}).where(eq(assistantUsageRequest.id,ledgerId));
      await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
      await page.getByText(/今日可用额度不足/).waitFor();
      await input().fill("额度不足时保留文字");
      assert.ok(await send().isDisabled());
      await openMenu();
      await menu.getByText("今日剩余 0%",{exact:true}).waitFor();
      await shot("no-balance","隔离账本耗尽，剩余0%且草稿可继续编辑");
      await closeMenu();
      const midnight = Date.parse(settled.usage.resetAt);
      await page.clock.setFixedTime(new Date(midnight-2200));
      let nextDay = false;
      await context.route(base+"/api/account/entitlements",async route=>{
        if (!nextDay) return route.continue();
        const response = await route.fetch();
        const payload = await response.json();
        await new Promise(resolve=>setTimeout(resolve,850));
        payload.usage.remainingPercent="100%";
        payload.usage.resetAt=new Date(midnight+86400000).toISOString();
        await route.fulfill({response,json:payload});
      });
      await openMenu();
      await menu.getByText("今日剩余 0%",{exact:true}).waitFor();
      nextDay=true;
      await page.clock.setFixedTime(new Date(midnight+1));
      await menu.getByText("正在读取额度…",{exact:true}).waitFor();
      assert.equal(await remaining.count(),0);
      await shot("midnight-reading","为跨日回放切换浏览器时钟，旧日0%已失效，读取只出现在菜单里");
      await menu.getByText("今日剩余 100%",{exact:true}).waitFor();
      await shot("midnight-ready","跨日回放返回新额度，菜单原位更新");
      await closeMenu();
      await context.unroute(base+"/api/account/entitlements");
    } finally {
      await db.delete(assistantUsageRequest).where(eq(assistantUsageRequest.id,ledgerId));
    }
    await mark("真实账本验证接近用完及耗尽，模拟跨日验证旧日值过期和重置");
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
    const scope = process.env.FORMWARD_EXPERIENCE_CASE;
    if (scope==="composer" || scope==="composer-mobile") {
      await journey("composer-mobile",{width:390,height:844},true,flow=>composerFlow(flow,true));
    }
    if (scope==="composer" || scope==="composer-desktop") {
      if (results.length) await db.delete(rateLimit);
      await journey("composer-desktop",{width:1440,height:900},false,flow=>composerFlow(flow,false));
    }
    if (!scope || scope==="mobile") await journey("mobile",{width:390,height:844},true,flow=>mainFlow(flow,true));
    if (!scope || scope==="desktop") await journey("desktop",{width:1440,height:900},false,flow=>mainFlow(flow,false));
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
