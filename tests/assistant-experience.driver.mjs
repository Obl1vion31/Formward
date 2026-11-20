import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {eq} from "drizzle-orm";
import {assistantConversation,assistantMessage,assistantUsageRequest,rateLimit} from "../src/db/schema.ts";

const sendLabel = "发送消息";
const inputLabel = "给小助手发消息";
const firstPrompt = "这顿海南鸡饭帮我记一下，晚餐。";

async function checkModelAnchor(button, menu, record, scenario) {
  const geometry = await menu.evaluate(node => {
    const menu = node.getBoundingClientRect(), visual = window.visualViewport;
    const button = document.querySelector('[aria-controls="' + node.id + '"]').getBoundingClientRect();
    return { menu: menu.toJSON(), button: button.toJSON(), scrollRoom: node.scrollHeight - node.clientHeight,
      viewport: { left: visual.offsetLeft, top: visual.offsetTop, width: visual.width } };
  });
  const { menu: box, button: trigger, viewport } = geometry;
  assert.ok(await button.isVisible());
  assert.ok(Math.abs(trigger.top - box.bottom - 8) <= 1, JSON.stringify({ scenario, ...geometry }));
  assert.ok(box.top >= viewport.top + 7 && box.left >= viewport.left + 11, JSON.stringify(geometry));
  const expectedRight = Math.min(viewport.left + viewport.width - 12, Math.max(trigger.right, viewport.left + 12 + box.width));
  assert.ok(Math.abs(box.right - expectedRight) <= 1, JSON.stringify(geometry));
  (record.menuPositions ??= []).push({ scenario, ...geometry });
  return geometry;
}

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

  async function journey(name, size, mobile, run, theme = "light", wheel = false) {
    const context = await browser.newContext({viewport:size,hasTouch:mobile,isMobile:mobile&&!wheel,deviceScaleFactor:1,
      reducedMotion:"no-preference",recordVideo:{dir,size}});
    await context.addInitScript(value => {
      localStorage.setItem("formward-theme",value);
      const native = window.visualViewport, proxy = new EventTarget();
      let state = null;
      for (const name of ["height","width","offsetTop","offsetLeft","pageTop","pageLeft","scale"])
        Object.defineProperty(proxy,name,{get:()=>state?.[name]??native?.[name]??0});
      Object.defineProperty(window,"visualViewport",{configurable:true,value:proxy});
      for (const type of ["resize","scroll"]) native?.addEventListener(type,()=>proxy.dispatchEvent(new Event(type)));
      window.fixtureViewport = (value,eventType="resize") => {state=value;proxy.dispatchEvent(new Event(eventType));};
    },theme);
    await context.route(/^https:\/\/(?:[a-z0-9-]+\.cos\.ap-shanghai\.myqcloud\.com|vercel\.com)\//,
      route=>route.fulfill({status:200,body:""}));
    const page = await context.newPage(), video = page.video(), start = performance.now();
    page.setDefaultTimeout(65000);
    const record = {name,engine,browserVersion:browser.version(),theme,viewport:size,simulatedKeyboard:mobile,wheel,screenshots:[],checks:[],errors:[]};
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
    async function shot(label, description, clip) {
      const file = engine+"-"+name+"-"+String(record.screenshots.length+1).padStart(2,"0")+"-"+label+".png";
      await page.screenshot({path:join(dir,file),clip});
      record.screenshots.push({file,description,clip,atSeconds:Math.round((performance.now()-start)/100)/10});
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
      await run({page,context,input,send,status,message,shot,mark,open,newConversation,fixtureFiles,interrupting,record});
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

  async function composerFlow({page,context,input,send,status,open,shot,mark,record}, mobile) {
    await open();
    const plus = page.getByRole("button",{name:"添加照片",exact:true});
    const model = () => page.getByRole("button",{name:/^(千问|小米 MiMo)$/});
    const menu = page.getByRole("dialog",{name:"模型与用量"});
    const remaining = menu.locator("[data-chat-remaining]");
    const row = input().locator("..");
    const frame = page.locator("[data-chat-composer-frame]:visible");
    async function assertNoPressTint(scenario) {
      const painted = await frame.evaluate(node => [node, ...node.querySelectorAll("*")].flatMap(element =>
        [null, "::before", "::after"].filter(pseudo =>
          getComputedStyle(element, pseudo).backgroundImage.includes("radial-gradient("),
        ).map(pseudo => element.tagName + (pseudo ?? "")),
      ));
      assert.deepEqual(painted, [], scenario);
    }
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
      await page.waitForFunction(() => document.activeElement?.matches(
        'button[aria-haspopup="dialog"][aria-expanded="false"]:is([aria-label="千问"],[aria-label="小米 MiMo"])',
      ));
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
        await checkModelAnchor(model(), menu, record, "空白 " + theme + " " + width);
        await shot(theme+"-"+width,"实际 "+width+"px "+(theme==="light"?"浅色":"深色")+"输入栏与上方额度菜单");
        await closeMenu();
      }
    }
    await mark("各尺寸单行、16px输入、44px按钮和弹层向上展开");

    await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:900});
    await page.evaluate(()=>{ document.documentElement.dataset.theme="light"; });
    await assertNoPressTint("空白输入区及其按键");
    const cdp = mobile && engine === "chromium" ? await context.newCDPSession(page) : undefined;
    async function holdComposerPoint(x, y, scenario) {
      const target = await page.evaluateHandle(({x, y}) => document.elementFromPoint(x, y), {x, y});
      const bounds = await frame.boundingBox();
      try {
        if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{x, y, id: 0}] });
        else await target.evaluate((node, {x, y}) => node.dispatchEvent(new PointerEvent("pointerdown", {
          pointerType: "touch", pointerId: 40, isPrimary: true, bubbles: true, clientX: x, clientY: y, buttons: 1,
        })), {x, y});
        await page.waitForTimeout(180);
        await assertNoPressTint(scenario);
        assert.deepEqual(await frame.boundingBox(), bounds, scenario);
        await shot("held-" + scenario, "按住" + scenario + "时保留输入区边界与背景");
      } finally {
        if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
        else await target.evaluate((node, {x, y}) => node.dispatchEvent(new PointerEvent("pointercancel", {
          pointerType: "touch", pointerId: 40, isPrimary: true, bubbles: true, clientX: x, clientY: y,
        })), {x, y});
        await target.dispose();
      }
    }
    if (mobile) {
      const box = await input().boundingBox();
      await holdComposerPoint(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2), "文字");
      await input().focus();
      await input().fill("可以选中文本并继续编辑");
      await input().evaluate(node=>node.setSelectionRange(2,6));
      assert.equal(await input().evaluate(node=>node.value.substring(node.selectionStart,node.selectionEnd)),"选中文本");
      await page.evaluate(()=>window.fixtureViewport({height:350,offsetTop:0}));
      await openMenu();
      await checkModelAnchor(model(), menu, record, "短稿与键盘");
      await shot("keyboard-menu","模拟键盘缩高后，菜单仍从当前模型按钮上方 8px 展开");
      await closeMenu();
      await page.evaluate(()=>window.fixtureViewport(null));
      await mark("按住文字时边界保持，输入选区和模拟键盘菜单可用");
    }

    const draft = "这顿海南鸡饭帮我记一下，晚餐。";
    await input().fill(draft.repeat(5));
    await page.waitForFunction(label => document.querySelector('textarea[aria-label="'+label+'"]')
      ?.getBoundingClientRect().height > 44,inputLabel,{timeout:5000});
    assert.ok((await input().boundingBox()).height>44,"长文字在同一输入框增高");
    await openMenu();
    await checkModelAnchor(model(), menu, record, "长稿");
    await shot("long-draft-menu","多行草稿时，菜单从当前模型按钮上方 8px 展开");
    await closeMenu();
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
    const rail = frame.locator("[data-chat-composer-photos]");
    const photoBox = await rail.boundingBox(), fieldBox = await input().boundingBox(), frameBox = await frame.boundingBox();
    assert.ok(photoBox && fieldBox && frameBox && frameBox.y <= photoBox.y + 1 &&
      frameBox.y + frameBox.height >= fieldBox.y + fieldBox.height - 1,
      JSON.stringify({photoBox, fieldBox, frameBox}));
    await assertNoPressTint("已有照片的输入区及其按键");
    if (mobile) {
      const photo = await thumbnail.boundingBox();
      await holdComposerPoint(Math.round(photo.x + 8), Math.round(photo.y + photo.height - 12), "照片");
    }
    await mark("添加、按住、移除照片后，照片与文字仍在同一输入框内");
    await openMenu();
    assert.ok(await remaining.isVisible());
    await checkModelAnchor(model(), menu, record, "短稿与照片");
    await shot("photo-menu","实际选图并逐张移除后，菜单仍跟随当前模型按钮");
    await menu.getByRole("menuitemradio",{name:/小米 MiMo/}).click();
    await page.getByRole("button",{name:"小米 MiMo",exact:true}).waitFor();
    assert.equal(await input().inputValue(),draft);
    assert.ok(await thumbnail.isVisible());
    await openMenu();
    await checkModelAnchor(model(), menu, record, "切换模型后");
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

    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "千问");
    await input().focus();
    await input().fill("慢速测试 · 查看共享余额");
    await page.waitForFunction(label => document.querySelector('textarea[aria-label="'+label+'"]')
      ?.value === "慢速测试 · 查看共享余额",inputLabel,{timeout:5000});
    await send().click();
    await page.getByText("慢速测试 · 查看共享余额",{exact:true}).waitFor();
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

    await input().fill("两张照片已读验收。");
    await fixtureFiles(2);
    await send().click();
    await page.getByText("两张照片都已读取。",{exact:true}).waitFor();
    await page.getByRole("button",{name:"停止生成",exact:true}).waitFor({state:"hidden"});
    assert.equal(await page.getByRole("group",{name:/张照片未处理/}).count(),0);
    assert.equal(await page.getByRole("button",{name:"继续回答",exact:true}).count(),0);
    await shot("two-photos-complete","两张照片的回答已完成，末尾没有分批或继续回答");
    await mark("两张照片正常完成后不出现后续操作");
    await db.delete(rateLimit);

    await input().fill("分批验收，帮我读这四张照片。");
    await fixtureFiles(4);
    await page.getByText("已选 4 张，发送后分批读取",{exact:true}).waitFor();
    await send().click();
    await page.getByRole("status").filter({hasText:"已读取 2 / 4 张"}).waitFor();
    await shot("photo-batches","四张照片在原消息下按实际结果推进");
    const firstBefore = await context.request.get(base+"/api/assistant-chat").then(response=>response.json());
    await page.getByText("已一起核对 4 张照片。重复角度的食物只计算一次。",{exact:true}).waitFor();
    await page.getByRole("button",{name:"停止生成",exact:true}).waitFor({state:"hidden"});
    const final = await context.request.get(base+"/api/assistant-chat").then(response=>response.json());
    assert.equal(final.conversationId,firstBefore.conversationId);
    assert.equal(await message("分批验收，帮我读这四张照片。").count(),1);
    await shot("batches-complete","同一条消息自动读取并汇总，照片原位保留");
    await mark("四张照片一条消息自动分批，原始图文未重复发送");

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

  async function repairFlow({page,context,input,open,shot,mark}, mobile) {
    const chatUrl = base + "/api/assistant-chat";
    const current = await (await context.request.get(chatUrl)).json();
    const titles = Array.from({length:16},(_,index)=>"历史验收记录 " + (index + 1));
    const histories = titles.map((title,index)=>({
      id:randomUUID(), userId:fixture.userId, active:false, sequence:1,
      updatedAt:new Date(Date.now() - index * 10000 - 2000), title,
    }));
    await db.insert(assistantConversation).values(histories.map(({id,userId,active,sequence,updatedAt})=>({id,userId,active,sequence,updatedAt})));
    await db.insert(assistantMessage).values(histories.map(row=>({
      id:randomUUID(), userId:fixture.userId, conversationId:row.id, seq:1, role:"user", text:row.title,
    })));
    await db.insert(assistantMessage).values([
      {id:randomUUID(),userId:fixture.userId,conversationId:current.conversationId,seq:1,role:"user",text:"查看虚构记录。"},
      {id:randomUUID(),userId:fixture.userId,conversationId:current.conversationId,seq:2,role:"assistant",provider:"qwen",
        text:Array.from({length:26},(_,index)=>"第 "+(index+1)+" 条虚构记录。聊天消息可以滚动阅读，顶部和编辑栏各在原处。").join("\n\n")},
    ]);
    await db.update(assistantConversation).set({sequence:2}).where(eq(assistantConversation.id,current.conversationId));
    await open();
    await page.getByText(/第 26 条虚构记录/).waitFor();
    const cdp = mobile && engine==="chromium" ? await context.newCDPSession(page) : undefined;
    async function drag(x,y,dx,dy) {
      if (cdp) {
        await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,id:0}]});
        for (const part of [.25,.5,.75,1]) await cdp.send("Input.dispatchTouchEvent",{
          type:"touchMove",touchPoints:[{x:x+dx*part,y:y+dy*part,id:0}],
        });
        await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
      } else {
        await page.evaluate(({x,y,dx,dy})=>{
          const hit=document.elementFromPoint(x,y);
          for(const [name,part] of [["pointerdown",0],["pointermove",.5],["pointermove",1],["pointerup",1]]) {
            hit.dispatchEvent(new PointerEvent(name,{bubbles:true,isPrimary:true,pointerId:71,pointerType:"touch",
              clientX:x+dx*part,clientY:y+dy*part,buttons:name==="pointerup"?0:1}));
          }
        },{x,y,dx,dy});
      }
      await page.waitForTimeout(175);
    }
    if (mobile) {
      await input().focus();
      await page.evaluate(()=>window.fixtureViewport({height:470,width:390,offsetTop:0,scale:1}));
      await page.locator("[data-assistant-keyboard]").waitFor();
      await page.waitForTimeout(500);
      const geometry = () => page.locator("[data-assistant-page]").evaluate(node=>{
        const top = node.querySelector("header").getBoundingClientRect();
        const area = node.querySelector("textarea").getBoundingClientRect();
        const offset = window.visualViewport.offsetTop;
        return {heading:top.top-offset,composer:area.bottom-offset,scroll:window.scrollY};
      });
      const before=await geometry(), box=await input().boundingBox();
      await drag(Math.round(box.x+45),Math.round(box.y+box.height/2),0,60);
      await drag(Math.round(box.x+45),Math.round(box.y+box.height/2),0,-62);
      await page.evaluate(() => window.fixtureViewport({height:470,width:390,offsetTop:46,scale:1},"scroll"));
      await page.waitForFunction(() => {
        const content = document.querySelector("[data-assistant-page-content]").getBoundingClientRect();
        return Math.abs(content.top - window.visualViewport.offsetTop) <= 1;
      }, null, {timeout:3500});
      const after=await geometry();
      for (const key of Object.keys(before)) assert.ok(Math.abs(before[key]-after[key])<=1,JSON.stringify({before,after}));
      const feed=page.getByRole("log",{name:"聊天消息"});
      const previousTop=await feed.evaluate(node=>node.scrollTop);
      await feed.evaluate(node=>{node.scrollTop=0;});
      assert.ok(previousTop>0);
      assert.equal(await feed.evaluate(node=>node.scrollTop),0);
      assert.deepEqual(await geometry(),after);
      const appearance=await page.getByRole("button",{name:sendLabel,exact:true}).evaluate(node=>({
        width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,
        ring:getComputedStyle(node,"::before").borderRadius,
      }));
      assert.deepEqual(appearance,{width:44,height:44,ring:"50%"});
      await shot("keyboard-fixed","缩小可视区后上下拖输入栏，只有消息区可滚动");
      await mark("视口缩高和纵拖时顶栏及输入框稳定，发送为圆形并保留44px触控");
      await input().blur();
      await page.evaluate(()=>window.fixtureViewport(null));
    }
    const citation=page.getByRole("button",{name:"引用回复",exact:true}).locator("span");
    const copy=page.getByRole("button",{name:"复制",exact:true}).locator("span");
    await citation.waitFor();
    await copy.waitFor();
    if (mobile) assert.equal(await citation.evaluate(node=>getComputedStyle(node).fontSize),"13px");
    await page.getByRole("button",{name:"历史会话",exact:true}).click();
    const history=page.getByRole("region",{name:"历史会话"});
    const target=history.locator('[data-history-row="' + histories[0].id + '"]');
    await target.waitFor();
    await shot("history-list","历史会话行共用边界和内缩分隔线");
    let modelSends=0;
    page.on("request",request=>{if(request.url()===chatUrl && request.method()==="POST") modelSends++;});
    const selected = histories[1];
    await history.locator('[data-history-id="' + selected.id + '"]').click();
    await history.locator('article[data-role="user"]').getByText(selected.title,{exact:true}).waitFor();
    const switching = page.waitForResponse(response => response.url() === chatUrl + "/control" &&
      response.request().postDataJSON()?.action === "select_conversation");
    await history.getByRole("button",{name:"回到这段对话",exact:true}).click();
    const switched = await switching;
    assert.equal(switched.request().postDataJSON().conversationId, selected.id);
    assert.equal(switched.status(), 200);
    assert.equal((await switched.json()).conversationId, selected.id);
    await page.getByRole("log",{name:"聊天消息"}).getByText(selected.title,{exact:true}).waitFor();
    await input().waitFor();
    assert.equal((await (await context.request.get(chatUrl)).json()).conversationId, selected.id);
    assert.equal(modelSends,0);
    await page.getByRole("button",{name:"历史会话",exact:true}).click();
    await target.waitFor();
    if (mobile) {
      const row=await target.locator("[data-history-id]").boundingBox();
      const x = Math.round(row.x+row.width*.62), y = Math.round(row.y+row.height/2);
      await drag(x,y,60,0);
      assert.equal(await target.getAttribute("data-action"),null);
      await drag(x,y,-95,0);
      assert.equal(await target.getAttribute("data-action"),"swipe");
      const surface = await target.boundingBox();
      const rail = await target.getByRole("button",{name:"删除",exact:true}).boundingBox();
      assert.ok(Math.abs(rail.x+rail.width - (surface.x+surface.width)) <= 1,"删除在会话行右边");
      await shot("history-swipe","左滑从右侧露出本条红色删除，其他行保持原位");
    } else {
      await target.getByRole("button",{name:/更多操作/}).press("Enter");
      assert.equal(await target.getAttribute("data-action"),"menu");
      await shot("history-menu","桌面使用键盘打开同一条会话的删除菜单");
    }
    await target.getByRole("button",{name:"删除",exact:true}).click();
    const confirm=page.getByRole("dialog",{name:"删除这段对话？"});
    await confirm.getByRole("button",{name:"取消",exact:true}).click();
    await target.waitFor();
    await target.getByRole("button",{name:"删除",exact:true}).click();
    await shot("history-confirm","明确确认删除，已保存和待核对记录仍可使用");
    await confirm.getByRole("button",{name:"删除",exact:true}).click();
    await target.waitFor({state:"hidden"});
    const old=await context.request.get(chatUrl+"?conversationId="+histories[0].id);
    assert.equal(old.status(),404);
    const [removed]=await db.select().from(assistantConversation).where(eq(assistantConversation.id,histories[0].id));
    assert.ok(removed.removedAt);
    const rows=await db.select().from(assistantMessage).where(eq(assistantMessage.conversationId,histories[0].id));
    assert.equal(rows[0].text,titles[0]);
    await shot("history-removed","已确认移出历史，原文在隔离库保留");
    await page.evaluate(()=>{ document.documentElement.dataset.theme="dark"; });
    await shot("history-dark","深色历史列表的分隔与行操作");
    await mark("历史返回不发送模型请求，删除有确认、保留原文并拒绝旧链接");
  }

  async function keyboardFlow({page,context,input,send,message,shot,mark,open,fixtureFiles,record}, baseline, draftScroll = null) {
    const width = 393, chatUrl = base + "/api/assistant-chat";
    const scrollDraft = draftScroll !== null, longHistory = draftScroll === "long";
    const historyText = "这条虚构的午餐记录有米饭、烤鸡肉和西兰花。照片和文字将在同一条消息里对照。";
    const longReply = Array.from({length: 20}, (_, index) =>
      "第 " + (index + 1) + " 段历史记录。这里是与当前草稿无关的虚构对话，用于确认长聊天列表有足够的距离上下滚动。",
    ).join("\n\n");
    const {conversationId} = await context.request.get(chatUrl).then(response => response.json());
    await db.insert(assistantMessage).values([
      {id:randomUUID(), userId:fixture.userId, conversationId, seq:1, role:"user", text:"看看虚构的午餐记录。"},
      {id:randomUUID(), userId:fixture.userId, conversationId, seq:2, role:"assistant", provider:"qwen",
        text: longHistory ? longReply : historyText},
    ]);
    await db.update(assistantConversation).set({sequence:2}).where(eq(assistantConversation.id,conversationId));
    const draftLines = [
      "两张照片是同一份午餐的不同角度。",
      "第一张是米饭、烤鸡肉和西兰花，米饭大概剩了三分之一。",
      "另一张是侧面，用来核对盘子里的份量。",
      "鸡肉按可食部分算，调味料的份量还需要确认。",
      "这是一段虚构的长草稿，用来验证输入时能同时保留两张照片。",
    ];
    if (scrollDraft) {
      draftLines.splice(1, 0, ...Array.from({length:15}, (_, index) => `第 ${index + 2} 行虚构记录，待核对。`));
    }
    let draft = draftLines.join("\n");
    const viewport = (height, offsetTop = 0, type = "resize") => page.evaluate(
      ({height, width, offsetTop, type}) => {
        window.fixtureViewport(height === null ? null : {height, width, offsetTop, scale:1}, type);
        return new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      },
      {height, width, offsetTop, type});
    const geometry = () => page.locator("[data-assistant-page]").evaluate(shell => {
      const field = shell.querySelector("textarea");
      const sendButton = shell.querySelector('button[aria-label="发送消息"]');
      const box = sendButton.getBoundingClientRect(), outer = shell.getBoundingClientRect();
      const visual = window.visualViewport;
      const content = shell.querySelector("[data-assistant-page-content]").getBoundingClientRect();
      const row = field.getBoundingClientRect();
      return {
        top: outer.top, bottom: outer.bottom, contentTop: content.top, contentBottom: content.bottom,
        reportedOffset: visual.offsetTop, reportedHeight: visual.height, fieldTop: row.top, fieldBottom: row.bottom,
        fieldHeight: row.height, overflow: field.scrollHeight > field.clientHeight,
        fieldHitAtLowerEdge: field.contains(document.elementFromPoint(row.x + row.width / 2, row.bottom - 1.5)),
        sendHeight: box.height, sendBottom: box.bottom, gap: content.bottom - box.bottom,
        gapAtReportedHeight: visual.height - box.bottom,
        hit: sendButton.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
        keyboard: shell.hasAttribute("data-assistant-keyboard"),
      };
    });
    const withinViewport = async expectedBottom => {
      await page.waitForFunction(bottom => {
        const shell = document.querySelector("[data-assistant-page]").getBoundingClientRect();
        const content = document.querySelector("[data-assistant-page-content]").getBoundingClientRect();
        return Math.abs(shell.top) <= 1 && Math.abs(shell.bottom - innerHeight) <= 1 &&
          Math.abs(content.bottom - bottom) <= 1 && Math.abs(content.top - shell.top) <= 1;
      }, expectedBottom, { timeout: 3500 });
      const view = await geometry();
      assert.ok(view.fieldHeight >= 44 && view.fieldTop >= view.contentTop - 1 &&
        view.fieldBottom <= view.contentBottom + 1 && view.fieldHitAtLowerEdge, JSON.stringify(view));
      assert.ok(view.sendHeight >= 44 && view.hit && view.gap >= 4 && view.gap <= 8, JSON.stringify(view));
      return view;
    };
    async function checkDraftScroll() {
      const field = input();
      const cdp = engine === "chromium" ? await context.newCDPSession(page) : null;
      const position = () => field.evaluate(node => {
        const shell = node.closest("[data-assistant-page]");
        return {
          top:node.scrollTop, end:node.scrollHeight-node.clientHeight,
          heading:shell.querySelector("header").getBoundingClientRect().top,
          send:shell.querySelector('button[aria-label="发送消息"]').getBoundingClientRect().bottom,
          feed:shell.querySelector('[role="log"]').scrollTop, document:scrollY,
        };
      });
      async function nativeDrag(x, y, moves, pause = 0) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 0 }] });
        if (pause) await page.waitForTimeout(pause);
        for (const [dx, dy] of moves) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx, y: y + dy, id: 0 }] });
          await page.waitForTimeout(18);
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      }
      async function gesture(towardStart, target = field) {
        const box = await target.boundingBox();
        const x = Math.round(box.x + box.width / 2);
        if (!cdp) {
          await page.mouse.move(x, box.y + box.height / 2);
          await page.mouse.wheel(0, towardStart ? -110 : 110);
        } else {
          const y = Math.round(towardStart ? box.y + 8 : box.y + box.height - 8);
          const distance = (towardStart ? 1 : -1) * Math.min(60, Math.floor(box.height - 16));
          await nativeDrag(x, y, Array.from({ length: 6 }, (_, index) => [0, Math.round(distance * (index + 1) / 6)]));
        }
        await page.waitForTimeout(125);
      }
      const fixed = (before, after) => {
        for (const key of ["heading", "send", "feed", "document"]) {
          assert.ok(Math.abs(before[key]-after[key]) <= 1, JSON.stringify({key,before,after}));
        }
      };
      async function testBoundaryPan(target, towardStart, scenario, { turn = false, gap = false, edge = false } = {}) {
        const before = await position();
        const hit = await target.evaluate((node, { edge, gap, towardStart }) => {
          const box = node.getBoundingClientRect();
          const x = Math.round(box.x + box.width / 2);
          // 软键盘遮蔽区的第一像素和边上真实留白都应命中自己的容器。
          const y = gap ? Math.round(box.top + 1) : edge ? Math.floor(box.bottom - 1) :
            Math.round(towardStart ? box.top + 8 : box.bottom - 8);
          const target = document.elementFromPoint(x, y);
          return { x, y, inside: node.contains(target), touchAction: getComputedStyle(node).touchAction };
        }, { edge, gap, towardStart });
        assert.ok(hit.inside, JSON.stringify({ scenario, hit }));
        if (gap) assert.equal(hit.touchAction, "none");
        await field.evaluate(node => {
          const shell = node.closest("[data-assistant-page]"), heading = shell.querySelector("header");
          const send = shell.querySelector('button[aria-label="发送消息"]'), feed = shell.querySelector('[role="log"]');
          const frames = [];
          let frame;
          function capture() {
            frames.push({ time: performance.now(), heading: heading.getBoundingClientRect().top,
              send: send.getBoundingClientRect().bottom, feed: feed.scrollTop, document: scrollY });
            frame = requestAnimationFrame(capture);
          }
          capture();
          window.stopComposerBoundaryCapture = () => { cancelAnimationFrame(frame); return frames; };
        });
        let cancelled, frames;
        try {
          const vertical = towardStart ? 1 : -1;
          const moves = turn ? [[16, 0], [24, 0], [24, vertical * 18], [24, vertical * 54]]
            : [[0, vertical * 12], [0, vertical * 32], [0, vertical * 56]];
          if (cdp) await nativeDrag(hit.x, hit.y, moves, gap ? 520 : 0);
          else {
            await page.mouse.move(hit.x, hit.y);
            await page.mouse.wheel(0, towardStart ? -110 : 110);
          }
          if (!gap) {
            // 两引擎另回放触点的转向和取消逻辑，WebKit 的原生滚动用上方滚轮检查。
            cancelled = await page.evaluate(({ hit, moves }) => {
              const origin = document.elementFromPoint(hit.x, hit.y);
              function touch(type, touches) {
                const event = new Event(type, { bubbles: true, cancelable: type === "touchmove" });
                Object.defineProperty(event, "touches", { value: touches });
                origin.dispatchEvent(event);
                return event.defaultPrevented;
              }
              touch("touchstart", [{ clientX: hit.x, clientY: hit.y }]);
              const cancelled = moves.map(([x, y]) => touch("touchmove", [{ clientX: hit.x + x, clientY: hit.y + y }]));
              touch("touchend", []);
              return cancelled;
            }, { hit, moves });
          }
          await page.waitForTimeout(230);
        } finally {
          frames = await page.evaluate(() => window.stopComposerBoundaryCapture());
          (record.gestureFrames ??= []).push({ scenario, hit, native: cdp ? "touch" : "wheel", before, cancelled, frames });
        }
        assert.ok(frames.length >= 5);
        for (const frame of frames) fixed(before, frame);
        if (!gap) assert.equal(cancelled.at(-1), true, scenario);
        // 注入松手后的偏移报告。直接检查应用布局，避免拿同一个偏移值修正测量。
        await viewport(235, 17, "scroll");
        await withinViewport(235);
        fixed(before, await position());
        await viewport(235, 18, "resize");
        await withinViewport(235);
        fixed(before, await position());
        await viewport(235);
        await withinViewport(235);
      }
      const bottom = await position();
      assert.ok(bottom.end > 350 && bottom.end-bottom.top <= 1, JSON.stringify(bottom));
      const reversal = await field.evaluate(node => {
        const rect = node.getBoundingClientRect(), x = Math.round(rect.x + rect.width / 2), y = Math.floor(rect.bottom - 1);
        const hit = node.contains(document.elementFromPoint(x, y));
        function dispatch(type, touches) {
          const event = new Event(type, { bubbles: true, cancelable: type === "touchmove" });
          Object.defineProperty(event, "touches", { value: touches });
          node.dispatchEvent(event);
          return event.defaultPrevented;
        }
        dispatch("touchstart", [{ clientX: x, clientY: y }]);
        const moves = [[2, 0], [2, -35], [2, -62], [2, -8], [2, -82]].map(([dx, dy]) => ({
          blocked: dispatch("touchmove", [{ clientX: x + dx, clientY: y + dy }]), top: node.scrollTop,
        }));
        dispatch("touchend", []);
        return { hit, moves };
      });
      assert.ok(reversal.hit && Math.abs(reversal.moves[0].top - bottom.top) <= 1, JSON.stringify(reversal));
      assert.ok(reversal.moves.slice(1).every(move => move.blocked), JSON.stringify(reversal));
      assert.ok(Math.abs(reversal.moves[2].top - bottom.end) <= 1 && reversal.moves[3].top <= bottom.end - 30 &&
        Math.abs(reversal.moves[4].top - bottom.end) <= 1, JSON.stringify(reversal));
      fixed(bottom, await position());
      record.lowerEdgeReversal = reversal;
      await mark("文字框内沿离底部 1px 起手，抵达末尾后原指反向可继续滚动");
      await gesture(true);
      await page.waitForTimeout(250);
      const reading = await position();
      assert.ok(reading.top <= bottom.top-15, JSON.stringify({bottom,reading}));
      fixed(bottom, reading);
      await viewport(210);
      await withinViewport(210);
      await page.waitForTimeout(120);
      const resized = await position();
      assert.ok(resized.end > reading.end && Math.abs(resized.top-reading.top) <= 1, JSON.stringify({reading,resized}));
      await shot("reading-resize","改变模拟键盘高度后保留长草稿的阅读位置",{x:0,y:0,width,height:210});
      await viewport(235);
      await withinViewport(235);
      await page.waitForTimeout(100);

      const stable = await position();
      for (let step = 0; step < 24 && (await position()).top > 1; step++) await gesture(true);
      await gesture(true);
      const start = await position();
      assert.ok(start.top <= 1, JSON.stringify(start));
      fixed(stable, start);
      await shot("draft-start","滑到两图草稿的开头，发送键仍可点",{x:0,y:0,width,height:235});
      await testBoundaryPan(field, true, "文字滚到开头仍继续拖");

      const original = "第 2 行虚构记录，待核对。";
      const offset = draft.indexOf(original);
      assert.ok(offset >= 0);
      await field.evaluate((node, range) => node.setSelectionRange(...range), [offset, offset + original.length]);
      const edited = "第 2 行虚构记录，已核对。";
      await page.keyboard.insertText(edited);
      draft = draft.replace(original, edited);
      assert.equal(await field.inputValue(), draft);
      const afterEdit = await position();
      assert.ok(afterEdit.top < afterEdit.end / 2, JSON.stringify(afterEdit));

      for (let step = 0; step < 24; step++) {
        const current = await position();
        if (current.end-current.top <= 1) break;
        await gesture(false);
      }
      await gesture(false);
      const end = await position();
      assert.ok(end.end-end.top <= 1, JSON.stringify(end));
      fixed(afterEdit, end);
      await shot("draft-end","修改前文后滑回末尾，两张照片和输入仍在",{x:0,y:0,width,height:235});
      await testBoundaryPan(field, false, "文字滚到末尾仍继续拖");
      await testBoundaryPan(field, false, "文字末尾下边缘先横后竖", { turn: true, edge: true });
      await testBoundaryPan(page.locator("[data-chat-composer-bottom-gap]"), false, "输入框下方 4px 留白长按后拖", { turn: true, gap: true });
      await testBoundaryPan(page.locator("[data-assistant-keyboard-gap]"), true, "键盘边界第一像素长按后拖", { turn: true, gap: true });
      if (longHistory) {
        const feed = page.getByRole("log", {name:"聊天消息", exact:true});
        await viewport(300);
        await withinViewport(300);
        const before = await position();
        assert.ok(before.feed > 1000, JSON.stringify(before));
        await gesture(true, feed);
        const after = await position();
        assert.ok(after.feed < before.feed - 10, JSON.stringify({before, after}));
        (record.feedMovement ??= []).push({ before, after });
        await viewport(235);
        await withinViewport(235);
      }
      const photo = page.locator('[data-chat-composer-photos]').getByAltText("照片 1", {exact:true}).locator("..");
      await testBoundaryPan(photo, true, "照片首端向下拖");
      if (longHistory) {
        await fixtureFiles(6);
        const rail = page.locator("[data-chat-composer-photos]");
        const extras = page.locator("[data-chat-composer-extras]");
        const point = () => rail.evaluate(node => {
          const row = node.getBoundingClientRect(), clip = node.closest("[data-chat-composer-extras]").getBoundingClientRect();
          const x = Math.round(row.left + row.width / 2);
          const y = Math.round((Math.max(row.top, clip.top) + Math.min(row.bottom, clip.bottom)) / 2);
          return { x, y, hit: node.contains(document.elementFromPoint(x, y)) };
        });
        await field.focus();
        await viewport(180);
        await withinViewport(180);
        await extras.evaluate(node => { node.scrollTop = 0; });
        const before = await position();
        const start = await point();
        assert.ok(start.hit, JSON.stringify(start));
        if (cdp) await nativeDrag(start.x, start.y, [[-12,0],[-28,0],[-50,0],[-80,0]]);
        else {
          await page.mouse.move(start.x, start.y);
          await page.mouse.wheel(110, 0);
        }
        await page.waitForFunction(() => document.querySelector("[data-chat-composer-photos]").scrollLeft > 10);
        const photoScroll = await rail.evaluate(node => node.scrollLeft);
        fixed(before, await position());

        const next = await point();
        assert.ok(next.hit, JSON.stringify(next));
        if (cdp) await nativeDrag(next.x, next.y, [[0,-10],[0,-25],[0,-45],[0,-65]]);
        else {
          await page.mouse.move(next.x, next.y);
          await page.mouse.wheel(0, 110);
        }
        await page.waitForFunction(() => document.querySelector("[data-chat-composer-extras]").scrollTop > 5);
        const extrasScroll = await extras.evaluate(node => node.scrollTop);
        fixed(before, await position());
        record.attachmentScroll = { photoScroll, extrasScroll };
        await shot("attachment-scroll","八张照片可横向查看，超高的附件区可纵向浏览",{x:0,y:0,width,height:180});
        for (let index = 8; index >= 3; index--) {
          await page.getByRole("button",{name:"移除照片 " + index,exact:true}).evaluate(node => node.click());
        }
        await mark("模拟键盘下，照片横滑、超高附件纵滑都留在输入区");
      }
      await viewport(215, 5);
      await withinViewport(215);
      await viewport(235);
      await withinViewport(235);
      await shot("boundary","长文字和照片边界拖动后，列表和发送栏仍在原位", {x:0,y:0,width,height:235});
      await mark((longHistory ? "长" : "短") + "历史中，底部留白长按、先横后竖、滚至边界及迟到平移逐帧偏差≤1px" +
        (longHistory ? "，消息区起滑仍可翻历史" : ""));
      await mark(`20 行草稿通过${cdp ? "浏览器触控事件" : "窄屏原生滚轮"}往返首尾、编辑前文和视口变化，外层位置稳定`);
    }
    const source = scrollDraft ? await page.evaluate(() => {
      window.scrollTo(0, Math.min(168, document.scrollingElement.scrollHeight - innerHeight));
      return window.scrollY;
    }) : 0;
    await open();
    await fixtureFiles(2);
    const editor = input();
    await editor.fill(draft);
    await editor.blur();
    await shot("draft","键盘收起时，两张照片和多行草稿");
    const editBox = await editor.boundingBox();
    await editor.tap({ position: { x: editBox.width / 2, y: editBox.height - 2 } });
    assert.ok(await editor.evaluate(node => document.activeElement === node));
    await editor.evaluate(node => node.setSelectionRange(node.value.length,node.value.length));
    if (!baseline) {
      await viewport(802, 40, "scroll");
      const early = await geometry();
      record.keyboardViewport = { early };
      assert.equal(early.reportedOffset, 40);
      assert.ok(!early.keyboard && Math.abs(early.contentTop - early.top) <= 1 &&
        Math.abs(early.contentBottom - early.bottom) <= 1, JSON.stringify(early));
    }
    await viewport(235, baseline ? 0 : 120, baseline ? "resize" : "scroll");
    await page.locator("[data-assistant-keyboard]").waitFor({ timeout: 3500 });
    if (!baseline) {
      const appeared = await withinViewport(235);
      // 保持模拟键盘高度，注入迟到的 offsetTop。它只模拟报告值，浏览器仍在同一绘制位置。
      await viewport(235, 290, "resize");
      const late = await withinViewport(235);
      await viewport(235, 0, "scroll");
      const settled = await withinViewport(235);
      for (const key of ["contentTop", "contentBottom", "fieldTop", "fieldBottom", "sendBottom"]) {
        const positions = [appeared, late, settled].map(sample => sample[key]);
        assert.ok(Math.max(...positions) - Math.min(...positions) <= 1, JSON.stringify({key, appeared, late, settled}));
      }
      Object.assign(record.keyboardViewport, { appeared, late, settled });
      await mark("模拟键盘高度相同时，先到的 scroll 和迟到的 offsetTop 不移动顶栏、输入框或发送键");
    }
    await page.waitForFunction(() => {
      const field = document.querySelector("[data-assistant-page] textarea");
      return field.scrollTop + field.clientHeight >= field.scrollHeight - 1;
    });
    const before = await geometry();
    await shot("235","393 × 235 CSS px 网页可见区，两张照片和多行草稿", {x:0,y:0,width,height:235});
    if (baseline) {
      assert.ok(before.gapAtReportedHeight < 0, "旧版发送区应在模拟的可见边缘被裁切：" + JSON.stringify(before));
      await mark("旧版两张照片加长草稿的裁切：" + JSON.stringify(before));
      return;
    }
    assert.ok((await withinViewport(235)).overflow);
    await page.waitForTimeout(550);
    await viewport(235, 12, "scroll");
    await withinViewport(235);
    await viewport(235, 12, "resize");
    await withinViewport(235);
    await viewport(235);
    await withinViewport(235);
    await mark("两张图和长草稿同时保留，模拟偏移报告后发送键仍完整可点：" + JSON.stringify(await geometry()));
    if (scrollDraft) await checkDraftScroll();

    await input().blur();
    assert.ok((await withinViewport(235)).keyboard);
    await viewport(null);
    await page.locator("[data-assistant-keyboard]").waitFor({state:"detached"});
    assert.equal(await input().inputValue(),draft);
    await page.getByRole("button",{name:"引用回复",exact:true}).tap();
    await viewport(235);
    await withinViewport(235);
    await page.getByRole("button",{name:"取消引用"}).waitFor();
    await shot("quote","矮屏下两张照片和一行引用仍在固定的输入行上方", {x:0,y:0,width,height:235});

    await page.getByRole("button",{name:"千问",exact:true}).tap();
    const menu = page.getByRole("dialog",{name:"模型与用量",exact:true});
    await menu.waitFor();
    const model = page.getByRole("button",{name:"千问",exact:true});
    await viewport(200);
    await page.waitForFunction(() => {
      const button = document.querySelector('button[aria-label="千问"][aria-expanded="true"]');
      const menu = document.getElementById(button.getAttribute("aria-controls"));
      return Math.abs(button.getBoundingClientRect().top - menu.getBoundingClientRect().bottom - 8) <= 1 &&
        menu.getBoundingClientRect().top >= 7 && menu.getBoundingClientRect().bottom < 193;
    });
    const narrowMenu = await checkModelAnchor(model, menu, record, "长稿、照片、引用与 200px 可见区");
    assert.ok(narrowMenu.scrollRoom > 0);
    const menuScroll = await menu.evaluate(node => { node.scrollTop = node.scrollHeight; return node.scrollTop; });
    assert.ok(menuScroll > 0, "受限高度时可滚选菜单内容");
    await shot("models","更矮的可见区内菜单贴模型按钮，内部可滚动", {x:0,y:0,width,height:200});
    await page.keyboard.press("Escape");
    await menu.waitFor({state:"detached"});

    await input().focus();
    await input().evaluate(node => node.setSelectionRange(node.value.length,node.value.length));
    await page.keyboard.insertText("\n重新打开键盘后继续输入。");
    await viewport(180);
    await withinViewport(180);
    if (scrollDraft) {
      await page.waitForFunction(() => {
        const field = document.querySelector("[data-assistant-page] textarea");
        return field.scrollTop + field.clientHeight >= field.scrollHeight - 1;
      });
    }
    const photo = page.getByRole("button",{name:"移除照片 2",exact:true});
    const removal = await photo.evaluate(node => {
      const media = node.closest("[data-chat-composer-extras]");
      const glyph = node.querySelector("svg");
      const clip = media.getBoundingClientRect();
      const control = node.getBoundingClientRect();
      // 只滚附件所在的区域，让整个按键进入裁剪边界，再点实际绘制的删除图标。
      media.scrollTop += (control.top + control.bottom) / 2 - (clip.top + clip.bottom) / 2;
      const button = node.getBoundingClientRect(), icon = glyph.getBoundingClientRect();
      const x = Math.round((icon.left + icon.right) / 2), y = Math.round((icon.top + icon.bottom) / 2);
      return { x, y, owned: node.contains(document.elementFromPoint(x, y)), clip: clip.toJSON(), button: button.toJSON(),
        scrollTop: media.scrollTop };
    });
    assert.ok(removal.owned && removal.button.height >= 44 && removal.clip.top <= removal.button.top + 1 &&
      removal.button.bottom <= removal.clip.bottom + 1, JSON.stringify(removal));
    record.photoActionAt180 = removal;
    await withinViewport(180);
    await page.touchscreen.tap(removal.x, removal.y);
    await photo.waitFor({state:"detached"});
    await withinViewport(180);
    await mark("可见区矮至 180px 时，只滚照片槽后仍可点按移除，模型菜单在 200px 可见区内");
    await input().blur();
    await viewport(null);
    await page.locator("[data-assistant-keyboard]").waitFor({state:"detached"});
    await page.locator('input[aria-label="选择聊天照片"]').last().setInputFiles(samples[1].file);
    await photo.waitFor();
    await page.waitForFunction(() => !document.querySelector('button[aria-label="发送消息"]').disabled);
    const updated = draft + "\n重新打开键盘后继续输入。";
    assert.equal(await input().inputValue(),updated);
    assert.equal(await page.getByRole("button",{name:/^移除照片/}).count(),2);
    await page.getByRole("button",{name:"取消引用"}).waitFor();
    await shot("restored","收键盘后，草稿、照片和引用仍在");
    await input().focus();
    await viewport(235);
    await withinViewport(235);
    await send().tap();
    await viewport(null);
    await page.getByText("两张照片都已读取。",{exact:true}).waitFor();
    assert.equal(await message("重新打开键盘后继续输入。").count(),1);
    const sent = message("重新打开键盘后继续输入。").locator("img");
    assert.equal(await sent.count(),2);
    await shot("sent","点一次发送，文字和两张照片进入同一条消息");
    await mark("键盘开合保留图文、引用和输入位置，点按一次发送");
    if (scrollDraft) {
      assert.deepEqual(await page.evaluate(() => [document.body.style.position, document.body.style.overflow]), ["", "hidden"]);
      await page.getByRole("button", {name:"返回工作区", exact:true}).tap();
      await page.waitForFunction(() => !document.querySelector("[data-assistant-page]"));
      await page.waitForFunction(target => Math.abs(window.scrollY - target) <= 1, source);
      assert.equal(await page.evaluate(() => document.body.style.position), "");
      await mark("离开助手释放外层滚动锁，工作区回到原阅读位置");
    }
  }

  async function keyboardNativePanFlow({page,input,send,open,fixtureFiles,record,shot,mark}) {
    const width = 393, fullHeight = 695, keyboardHeight = 357;
    const draft = Array.from({length:20}, (_, line) => "第 " + (line + 1) + " 行。用两张照片核对虚构午餐。").join("\n");
    await open();
    await fixtureFiles(2);
    await input().fill(draft);
    await input().blur();

    async function moveViewport(height, shellTop, reportedOffset, event) {
      await page.evaluate(({height,shellTop,reportedOffset,event,width,fullHeight}) => {
        const workspace = document.querySelector("[data-workspace-viewport]");
        if (shellTop) workspace.style.translate = "0 " + shellTop + "px";
        else workspace.style.removeProperty("translate");
        // 只代录尺寸与事件，外壳直接在浏览器画布里移动，BCR 和命中检测读取实际结果。
        window.fixtureViewport(height === fullHeight ? null : {height,width,offsetTop:reportedOffset,scale:1},event);
        return new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      }, {height,shellTop,reportedOffset,event,width,fullHeight});
    }

    const measure = () => input().evaluate(field => {
      const shell = field.closest("[data-assistant-page]");
      const content = shell.querySelector("[data-assistant-page-content]");
      const header = shell.querySelector("header");
      const send = shell.querySelector('button[aria-label="发送消息"]');
      const hit = (node,box) => node.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
      const shellBox = shell.getBoundingClientRect(), contentBox = content.getBoundingClientRect();
      const headerBox = header.getBoundingClientRect(), fieldBox = field.getBoundingClientRect(), sendBox = send.getBoundingClientRect();
      const visual = window.visualViewport;
      return {
        shellTop:shellBox.top,shellHeight:shellBox.height, contentTop:contentBox.top,contentBottom:contentBox.bottom,
        headerTop:headerBox.top,headerBottom:headerBox.bottom,headerHit:hit(header,headerBox),
        fieldX:fieldBox.x,fieldWidth:fieldBox.width,fieldTop:fieldBox.top,fieldBottom:fieldBox.bottom,
        fieldHit:hit(field,fieldBox),sendTop:sendBox.top,sendBottom:sendBox.bottom,sendHit:hit(send,sendBox),
        visualHeight:visual.height,reportedOffset:visual.offsetTop,rootY:window.scrollY,
        focus:document.activeElement === field,overflow:field.scrollHeight > field.clientHeight,
      };
    });
    const initial = await measure();
    record.nativePan = {initial, cycles:[]};
    const check = (scene, box, shellTop, height, focused) => {
      assert.ok(Math.abs(box.shellTop - shellTop) <= 1 && Math.abs(box.shellHeight - fullHeight) <= 1 &&
        box.visualHeight === height && Math.abs(box.rootY - initial.rootY) <= 1, JSON.stringify({scene,box}));
      // 窗口裁到给定高度时，布局实际命中点也要落在录屏的可见范围。
      assert.ok(Math.abs(box.headerTop - initial.headerTop) <= 1 && box.headerBottom <= height + 1 &&
        Math.abs(box.contentTop - initial.contentTop) <= 1 && Math.abs(box.contentBottom - height) <= 1 &&
        box.fieldTop >= 0 && box.fieldBottom <= height && box.sendTop >= 0 &&
        height - box.sendBottom >= 0 && height - box.sendBottom <= 8 &&
        box.headerHit && box.fieldHit && box.sendHit && box.focus === focused,
        JSON.stringify({scene,box}));
    };
    check("初始画面",initial,0,fullHeight,false);

    async function focusAt(box, cycle) {
      const x = Math.round(box.fieldX + box.fieldWidth / 2);
      const y = Math.round([box.fieldTop + 4,(box.fieldTop + box.fieldBottom) / 2,box.fieldBottom - 2][cycle % 3]);
      assert.ok(await input().evaluate((field, {x,y}) => field.contains(document.elementFromPoint(x,y)), {x,y}));
      await page.touchscreen.tap(x,y);
      return {x,y};
    }

    async function checkMenuAfterPan() {
      const button = page.getByRole("button",{name:"千问",exact:true});
      const menu = page.getByRole("dialog",{name:"模型与用量",exact:true});
      const point = await button.evaluate(node => {
        const box = node.getBoundingClientRect();
        const x = Math.round(box.left + box.width / 2), y = Math.round(box.top + box.height / 2);
        return {x,y,hit:node.contains(document.elementFromPoint(x,y))};
      });
      assert.ok(point.hit, JSON.stringify(point));
      await page.touchscreen.tap(point.x,point.y);
      await menu.waitFor();
      await menu.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
      const geometry = await menu.evaluate(node => {
        const anchor = document.querySelector('[aria-controls="' + node.id + '"]').getBoundingClientRect();
        const view = document.querySelector("[data-assistant-page-content]").getBoundingClientRect();
        const box = node.getBoundingClientRect();
        const hit = node.contains(document.elementFromPoint(box.left + box.width / 2,box.top + box.height / 2));
        return {box:box.toJSON(),anchorTop:anchor.top,contentTop:view.top,hit,reportedOffset:window.visualViewport.offsetTop};
      });
      assert.ok(geometry.reportedOffset === fullHeight - keyboardHeight && geometry.hit &&
        geometry.box.height >= 44 && geometry.box.top >= geometry.contentTop + 7 &&
        Math.abs(geometry.anchorTop - geometry.box.bottom - 8) <= 1, JSON.stringify(geometry));
      await shot("panned-model-menu","外壳平移后，模型菜单在当前按钮上方展开并保留实际命中",{x:0,y:0,width,height:keyboardHeight});
      await page.keyboard.press("Escape");
      await menu.waitFor({state:"hidden"});
      return geometry;
    }

    for (let cycle = 0; cycle < 12; cycle++) {
      const row = {cycle:cycle + 1,point:await focusAt(await measure(),cycle)};
      record.nativePan.cycles.push(row);
      await moveViewport(keyboardHeight,0,0,"resize");
      row.shrunk = await measure();
      check("打开键盘只通报缩高",row.shrunk,0,keyboardHeight,true);

      if (cycle % 3 === 1) {
        await moveViewport(keyboardHeight,0,fullHeight - keyboardHeight,"scroll");
        row.offsetOnly = await measure();
        check("仅有偏移报告但外壳实际未动",row.offsetOnly,0,keyboardHeight,true);
      }
      const pan = keyboardHeight - fullHeight;
      await moveViewport(keyboardHeight,pan,cycle % 3 === 2 ? -pan : 0,"scroll");
      row.panned = await measure();
      if ([0,5,11].includes(cycle)) {
        await shot("pan-" + (cycle + 1),"第 " + (cycle + 1) + " 次，外壳实际向上移动 338 CSS px",{x:0,y:0,width,height:keyboardHeight});
      }
      check("同高度下迟到的外壳真实平移",row.panned,pan,keyboardHeight,true);
      assert.ok(row.panned.overflow && await send().isEnabled());
      assert.equal(await input().inputValue(),draft);
      if (cycle === 2) {
        row.menu = await checkMenuAfterPan();
        await focusAt(await measure(),cycle);
      }

      const resized = cycle % 2 === 0 ? 418 : 286;
      await moveViewport(resized,resized - fullHeight,0,"resize");
      row.resized = await measure();
      check("外壳已平移时可用高度改变",row.resized,resized - fullHeight,resized,true);

      await input().blur();
      await moveViewport(fullHeight,0,0,"resize");
      row.restored = await measure();
      check("键盘收起且外壳归位",row.restored,0,fullHeight,false);
      assert.equal(await input().inputValue(),draft);
    }
    assert.equal(await page.getByRole("button",{name:/^移除照片/}).count(),2);
    await focusAt(await measure(),11);
    const [start,end] = await input().evaluate(field => [field.selectionStart,field.selectionEnd]);
    await page.keyboard.insertText("续");
    assert.equal(await input().inputValue(),draft.slice(0,start) + "续" + draft.slice(end));
    await mark("十二次实际触点切换与迟到的外壳物理平移，顶栏、两图长稿与发送可见并可命中，键盘收起后可继续编辑");
  }

  try {
    if (!samples?.length) throw Error("需要提供隔离海南鸡饭样例");
    const scope = process.env.FORMWARD_EXPERIENCE_CASE;
    if (scope === "keyboard-native-pan") {
      await journey(scope,{width:393,height:695},true,keyboardNativePanFlow,"dark");
    }
    if (scope === "keyboard" || scope === "keyboard-before" || scope === "draft-scroll") {
      const draftScroll = scope === "draft-scroll" ? "short" : null;
      await journey(scope,{width:393,height:852},true,flow=>keyboardFlow(flow,scope==="keyboard-before",draftScroll),"dark",!!draftScroll && engine==="webkit");
    }
    if (scope === "composer-scroll") {
      await journey("composer-scroll-short",{width:393,height:852},true,flow=>keyboardFlow(flow,false,"short"),"dark",engine==="webkit");
      await db.delete(rateLimit);
      await journey("composer-scroll-long",{width:393,height:852},true,flow=>keyboardFlow(flow,false,"long"),"light",engine==="webkit");
    }
    if (scope==="composer" || scope==="composer-mobile") {
      await journey("composer-mobile",{width:390,height:844},true,flow=>composerFlow(flow,true));
    }
    if (scope==="composer" || scope==="composer-desktop") {
      if (results.length) await db.delete(rateLimit);
      await journey("composer-desktop",{width:1440,height:900},false,flow=>composerFlow(flow,false));
    }
    if (scope==="repair") {
      await journey("repair-mobile",{width:390,height:844},true,flow=>repairFlow(flow,true));
      await db.delete(rateLimit);
      await journey("repair-desktop",{width:1440,height:900},false,flow=>repairFlow(flow,false));
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
