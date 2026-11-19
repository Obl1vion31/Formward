import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { assistantConversation, assistantMessage, rateLimit } from "../src/db/schema.ts";

const title = "四张照片和方向验收";
const draft = "来回切换后留住这条待发文字";

export async function runDirectionalNavigation(db) {
  const { baseURL, account, userId, samples } = JSON.parse(await readFile(process.env.FORMWARD_CHAT_BROWSER_CONFIG, "utf8"));
  const engine = process.env.CHAT_BROWSER ?? "chromium";
  const output = process.env.FORMWARD_CHAT_ARTIFACTS;
  const playwright = await import(process.env.PLAYWRIGHT_MODULE);
  const browser = await playwright[engine].launch();
  const results = [];

  async function checkSurface(mobile) {
    const name = mobile ? "mobile" : "desktop";
    const viewport = mobile ? { width:390, height:844 } : { width:1440, height:900 };
    const context = await browser.newContext({ baseURL, viewport, hasTouch:mobile, isMobile:mobile,
      recordVideo: { dir:output, size:viewport } });
    const page = await context.newPage();
    const video = page.video();
    const result = { name, viewport, checks:[], errors:[], screenshots:[], passed:false };
    results.push(result);
    page.setDefaultTimeout(16000);
    page.on("pageerror", error => result.errors.push(String(error)));
    await context.addInitScript(() => {
      localStorage.setItem("formward-theme", "dark");
      window.directionProof = [];
      const shift = value => new DOMMatrix(value === "none" || !value ? undefined : value).m41;
      function record(target, source) {
        const frames = source?.effect?.getKeyframes();
        if (!frames?.length) return;
        const object = { target, from: shift(frames[0].transform), to: shift(frames.at(-1).transform) };
        window.directionProof.push(object);
      }
      const native = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const animation = native.apply(this,args);
        const role = this.getAttribute("data-photo-frame") || this.getAttribute("aria-label") ||
          this.nodeName.toLowerCase();
        if (this.hasAttribute("data-workspace-moving") || this.hasAttribute("data-photo-frame")) record(role,animation);
        return animation;
      };
      document.addEventListener("transitionrun", event => {
        const node = event.target;
        if (!(node instanceof HTMLElement) || event.propertyName !== "transform" || node.parentElement?.dataset.page !== "true") return;
        record(node.getAttribute("aria-label"),node.getAnimations().find(clip => clip.transitionProperty === "transform"));
      });
    });
    const button = label => page.getByRole("button",{name:label,exact:true}).filter({visible:true});
    const tab = label => page.getByRole("tab",{name:label,exact:true});
    const input = page.getByRole("textbox",{name:"给小助手发消息",exact:true});
    const snapshot = () => context.request.get("/api/assistant-chat").then(response=>response.json());
    const mark = () => page.evaluate(()=>window.directionProof.length);
    const signs = (from, to, expectFrom, expectTo) =>
      (expectFrom === 0 ? Math.abs(from) <= 1 : from * expectFrom > 1) &&
      (expectTo === 0 ? Math.abs(to) <= 1 : to * expectTo > 1);
    async function saw(since,target,from,to) {
      await page.waitForFunction(({since,target,from,to})=>window.directionProof.slice(since).some(item=>
        item.target===target &&
        (from===0 ? Math.abs(item.from)<=1 : item.from*from>1) &&
        (to===0 ? Math.abs(item.to)<=1 : item.to*to>1)),{since,target,from,to});
      const observed=await page.evaluate(since=>window.directionProof.slice(since),since);
      assert.ok(observed.some(item=>item.target===target&&signs(item.from,item.to,from,to)));
      result.checks.push({target,from,to});
    }
    async function shot(label) {
      const file=engine+"-"+name+"-"+label+".png";
      await page.screenshot({path:join(output,file)});
      result.screenshots.push(file);
    }
    async function activate(locator) {
      if(mobile) await locator.tap();
      else await locator.click();
    }
    async function settle() {
      await page.waitForTimeout(330);
    }
    try {
      await db.delete(rateLimit);
      const logged=await context.request.post("/api/auth/sign-in/email",{headers:{Origin:baseURL},data:account});
      assert.equal(logged.status(),200);
      const created=await context.request.post("/api/assistant-chat/control",{
        headers:{Origin:baseURL},data:{action:"new"},
      });
      assert.equal(created.status(),200);
      const conversationId=(await snapshot()).conversationId;
      const question=randomUUID(),answer=randomUUID();
      const ids=[samples[0].id,samples[2].id,samples[1].id,samples[3].id];
      await db.insert(assistantMessage).values([
        {id:question,userId,conversationId,seq:1,role:"user",imageIds:ids,text:title},
        {id:answer,userId,conversationId,seq:2,role:"assistant",provider:"qwen",text:"请补充这餐的份量。"},
      ]);
      await db.update(assistantConversation).set({sequence:2,followup:{
        subject:"份量",question:"鸡油饭吃了多少？",messageId:question,assistantMessageId:answer,
        questions:[{id:"rice",prompt:"鸡油饭吃了多少？",options:[{id:"half",label:"半碗"}],optional:true},
          {id:"chicken",prompt:"鸡肉吃了多少？",options:[{id:"portion",label:"一份"}],optional:true}],
      }}).where(eq(assistantConversation.id,conversationId));

      await page.goto(mobile?"/dashboard/assistant":"/dashboard");
      if(!mobile){
        await page.locator("[data-assistant-trigger]:visible").click();
        await page.locator("dialog[data-assistant-surface][open]").waitFor();
      }
      await page.getByText(title,{exact:true}).waitFor();
      const stack=button("查看 4 张照片");
      if(mobile) {
        await input.fill(draft);
        for(const theme of ["dark","light"]){
          await page.evaluate(value=>{
            localStorage.setItem("formward-theme",value);
            document.documentElement.dataset.theme=value;
          },theme);
          let before=await mark();
          await activate(tab("待办"));
          await saw(before,"待办与快捷记录",1,0);
          await saw(before,"AI聊天",0,-1);
          await settle();
          // 设备点按与保留悬停都必需复验。
          for (const hover of [false,true]) {
            if(hover) await tab("待办").hover();
            assert.ok(await tab("待办").evaluate(node=>{
              const css=getComputedStyle(node);
              const probe=document.createElement("span");
              document.body.append(probe);
              const read=name=>{probe.style.color="var("+name+")";return getComputedStyle(probe).color;};
              const paired=css.backgroundColor===read("--warm-white")&&css.color===read("--surface");
              probe.remove();
              return paired&&node.getAttribute("aria-selected")==="true";
            }),"主题选中态在触屏及悬停保持配对");
          }
          await shot("tasks-"+theme);
          before=await mark();
          await activate(tab("聊天"));
          await saw(before,"AI聊天",-1,0);
          await saw(before,"待办与快捷记录",0,1);
          await settle();
          assert.equal(await input.inputValue(),draft);
        }
      }
      await stack.scrollIntoViewIfNeeded();
      await activate(stack);
      const viewer=page.getByRole("dialog",{name:"照片预览",exact:true});
      const original=i=>viewer.getByRole("img",{name:"第 "+i+" 张照片",exact:true});
      await original(1).waitFor();
      const photoStage=viewer.locator("[class*='photoStage']");
      const stage=await photoStage.boundingBox();
      await settle();
      let before=await mark();
      if(mobile) {
        const sendSwipe=async () => {
          if(engine==="chromium"){
            const cdp=await context.newCDPSession(page);
            const x=Math.round(stage.x+stage.width*.8),y=Math.round(stage.y+stage.height*.5);
            await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
            for(const dx of [22,50,90,140]) await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x-dx,y}]});
            await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
            await cdp.detach();
          } else await photoStage.evaluate(node=>{
            const rect=node.getBoundingClientRect(),event={bubbles:true,pointerId:1,isPrimary:true,pointerType:"touch",clientY:rect.top+60};
            node.dispatchEvent(new PointerEvent("pointerdown",{...event,clientX:rect.left+220}));
            node.dispatchEvent(new PointerEvent("pointerup",{...event,clientX:rect.left+80}));
          });
        };
        await sendSwipe();
      } else await page.keyboard.press("ArrowRight");
      await original(2).waitFor();
      await saw(before,"current",1,0);
      await saw(before,"previous",0,-1);
      await settle();
      assert.deepEqual(await photoStage.boundingBox(),stage);
      await shot("photo-next");
      before=await mark();
      if(mobile) await activate(button("上一张"));
      else await page.keyboard.press("ArrowLeft");
      await original(1).waitFor();
      await saw(before,"current",-1,0);
      await saw(before,"previous",0,1);
      await settle();
      await page.emulateMedia({reducedMotion:"reduce"});
      before=await mark();
      await activate(button("下一张"));
      await original(2).waitFor();
      assert.equal(await mark(),before);
      await activate(button("关闭照片预览"));
      await viewer.waitFor({state:"hidden"});
      assert.ok(await stack.evaluate(node=>document.activeElement===node));
      await page.emulateMedia({reducedMotion:"no-preference"});

      await button("半碗").click();
      before=await mark();
      await activate(button("下一题"));
      await page.getByText("鸡肉吃了多少？",{exact:true}).waitFor();
      await saw(before,"fieldset",1,0);
      await settle();
      before=await mark();
      await activate(page.getByRole("button",{name:/上一题/}));
      await page.getByText("鸡油饭吃了多少？",{exact:true}).waitFor();
      await saw(before,"fieldset",-1,0);
      assert.equal(await button("半碗").getAttribute("aria-pressed"),"true");

      await activate(button("历史会话"));
      before=await mark();
      await activate(page.getByRole("button",{name:new RegExp(title)}).first());
      await page.getByRole("heading",{name:"历史对话",exact:true}).waitFor();
      await saw(before,"历史会话",1,0);
      await settle();
      before=await mark();
      await activate(button("返回列表"));
      await page.getByRole("heading",{name:"历史会话",exact:true}).waitFor();
      await saw(before,"历史会话",-1,0);
      await settle();

      await page.goto("/dashboard");
      before=await mark();
      await page.getByRole("link",{name:"训练",exact:true}).filter({visible:true}).last().click();
      await page.getByRole("button",{name:"下个月",exact:true}).waitFor();
      await saw(before,"div",1,0);
      await settle();
      before=await mark();
      await activate(button("下个月"));
      await saw(before,"训练月历",1,0);
      await settle();
      before=await mark();
      await activate(button("上个月"));
      await saw(before,"训练月历",-1,0);
      await settle();
      before=await mark();
      await page.getByRole("link",{name:"总览",exact:true}).filter({visible:true}).last().click();
      await page.waitForURL("**/dashboard");
      await saw(before,"div",-1,0);

      if(!mobile) {
        await page.goto("/admin");
        const verify=page.getByLabel("当前密码");
        await verify.fill(account.password);
        await button("验证并进入").click();
        const nav=page.getByRole("navigation",{name:"管理后台栏目",exact:true});
        await nav.waitFor();
        before=await mark();
        await nav.getByRole("link",{name:"用量分析",exact:true}).click();
        await page.getByRole("heading",{name:"用量分析",exact:true}).waitFor();
        await saw(before,"div",1,0);
        await settle();
        before=await mark();
        await nav.getByRole("link",{name:"用户管理",exact:true}).click();
        await page.getByRole("heading",{name:"用户管理",exact:true}).waitFor();
        await saw(before,"div",-1,0);
        await settle();
      }
      assert.deepEqual(result.errors,[]);
      result.passed=true;
    } catch(error) {
      result.failure=String(error);
      await shot("failure").catch(()=>{});
      throw error;
    } finally {
      await context.close();
      result.video=engine+"-"+name+"-directions.webm";
      await video.saveAs(join(output,result.video));
      await writeFile(join(output,engine+"-directions.json"),JSON.stringify(results,null,2));
    }
  }
  try {
    await checkSurface(true);
    await checkSurface(false);
  } finally {
    await browser.close();
  }
}
