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
      window.photoInput = [];
      for (const type of ["pointerdown", "pointerup", "pointercancel", "click"]) {
        document.addEventListener(type, event => {
          const dialog = event.target.closest?.('dialog[aria-label="照片预览"]');
          if (dialog) window.photoInput.push({ type, target:event.target.closest("button")?.ariaLabel ?? event.target.nodeName,
            point:[event.clientX,event.clientY] });
        }, true);
      }
      const shift = (value,node) => {
        if (!value || value === "none") return 0;
        const probe = document.createElement("div");
        Object.assign(probe.style,{position:"absolute",visibility:"hidden",pointerEvents:"none",
          width:node.getBoundingClientRect().width+"px",height:0,transform:value});
        document.body.append(probe);
        const transform = getComputedStyle(probe).transform;
        probe.remove();
        return transform==="none" ? 0 : new DOMMatrix(transform).m41;
      };
      function record(target, source, node) {
        const frames = source?.effect?.getKeyframes();
        if (!frames?.length) return;
        const object = { target, from: shift(frames[0].transform,node), to: shift(frames.at(-1).transform,node) };
        window.directionProof.push(object);
      }
      const native = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const animation = native.apply(this,args);
        const role = this.getAttribute("data-photo-frame") || this.getAttribute("aria-label") ||
          (this.hasAttribute("data-history-body") ? "历史会话" :
            this.hasAttribute("data-admin-content") ? "管理后台正文" : this.nodeName.toLowerCase());
        if (this.hasAttribute("data-workspace-moving") || this.hasAttribute("data-photo-frame")) record(role,animation,this);
        return animation;
      };
      document.addEventListener("transitionrun", event => {
        const node = event.target;
        if (!(node instanceof HTMLElement) || event.propertyName !== "transform" || node.parentElement?.dataset.page !== "true") return;
        record(node.getAttribute("aria-label"),node.getAnimations().find(clip => clip.transitionProperty === "transform"),node);
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
      try {
        await page.waitForFunction(({since,target,from,to})=>window.directionProof.slice(since).some(item=>
          item.target===target &&
          (from===0 ? Math.abs(item.from)<=1 : item.from*from>1) &&
          (to===0 ? Math.abs(item.to)<=1 : item.to*to>1)),{since,target,from,to},{timeout:7500});
      } catch (error) {
        const observed=await page.evaluate(since=>window.directionProof.slice(since),since);
        throw Error("没有观察到 "+target+" "+from+"→"+to+"。记录："+JSON.stringify(observed),{cause:error});
      }
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
        const drawer=page.locator("dialog[data-assistant-surface][open]");
        for(let attempt=0;attempt<3&&!await drawer.isVisible();attempt++){
          await page.locator("[data-assistant-trigger]:visible").click();
          await drawer.waitFor({timeout:1500}).catch(()=>{});
        }
        await drawer.evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
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
      async function flip(index, direction, turn) {
        const before=await mark();
        await photoStage.evaluate(node=>{
          const frames=[];
          window.photoFrames=frames;
          window.photoFramesComplete=false;
          const until=performance.now()+550;
          const sample=now=>{
            const photo=node.querySelectorAll('img[data-ready="true"]');
            const alpha=[...photo].reduce((total,image)=>{
              const visible=image.complete&&image.naturalWidth>0&&getComputedStyle(image).visibility==="visible";
              return visible ? 1-(1-total)*(1-Number(getComputedStyle(image).opacity)) : total;
            },0);
            const {x,y,width,height}=node.getBoundingClientRect();
            frames.push({alpha,box:[x,y,width,height]});
            if(now<until||frames.length<8) requestAnimationFrame(sample);
            else window.photoFramesComplete=true;
          };
          requestAnimationFrame(sample);
        });
        await turn();
        await original(index).waitFor();
        await saw(before,"current",direction,0);
        await saw(before,"previous",0,-direction);
        await page.waitForFunction(()=>window.photoFramesComplete);
        const frames=await page.evaluate(()=>window.photoFrames);
        assert.ok(frames.every(frame=>frame.alpha>.7),"翻页持续显示解码好的原图");
        assert.ok(frames.every(frame=>frame.box.every((value,i)=>Math.abs(value-[stage.x,stage.y,stage.width,stage.height][i])<1)));
        result.photoFrames=(result.photoFrames??0)+frames.length;
      }
      if(mobile) {
        await flip(2,1,()=>activate(button("下一张")));
        await flip(1,-1,()=>activate(button("上一张")));
        const cdp=engine==="chromium" ? await context.newCDPSession(page) : null;
        const swipe=async direction => {
          if(cdp){
            const x=Math.round(stage.x+stage.width*(direction>0?.8:.2)),y=Math.round(stage.y+stage.height*.5);
            const point=dx=>({x:x-direction*dx,y,id:1});
            await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[point(0)]});
            for(const dx of [22,50,90,140]) await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[point(dx)]});
            await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
          } else await photoStage.evaluate((node,direction)=>{
            const rect=node.getBoundingClientRect(),event={bubbles:true,pointerId:1,isPrimary:true,pointerType:"touch",clientY:rect.top+60};
            const start=rect.left+rect.width*(direction>0?.8:.2);
            node.dispatchEvent(new PointerEvent("pointerdown",{...event,clientX:start}));
            node.dispatchEvent(new PointerEvent("pointerup",{...event,clientX:start-direction*140}));
          },direction);
        };
        await flip(2,1,()=>swipe(1));
        await shot("photo-next");
        await flip(1,-1,()=>swipe(-1));
        await cdp?.detach();
      } else {
        await flip(2,1,()=>page.keyboard.press("ArrowRight"));
        await shot("photo-next");
        await flip(1,-1,()=>page.keyboard.press("ArrowLeft"));
      }
      let before;
      await page.emulateMedia({reducedMotion:"reduce"});
      before=await mark();
      await button("下一张").click();
      await original(2).waitFor();
      assert.equal(await mark(),before);
      await button("关闭照片预览").click();
      await viewer.waitFor({state:"hidden"});
      assert.ok(await stack.evaluate(node=>document.activeElement===node));
      await page.emulateMedia({reducedMotion:"no-preference"});

      await button("半碗").click();
      before=await mark();
      await button("下一题").click();
      await page.getByText("鸡肉吃了多少？",{exact:true}).waitFor();
      await saw(before,"fieldset",1,0);
      await settle();
      before=await mark();
      await page.getByRole("button",{name:/上一题/}).click();
      await page.getByText("鸡油饭吃了多少？",{exact:true}).waitFor();
      await saw(before,"fieldset",-1,0);
      assert.equal(await button("半碗").getAttribute("aria-pressed"),"true");

      await button("历史会话").click();
      await page.getByRole("heading",{name:"历史会话",exact:true}).waitFor();
      if(mobile) await input.waitFor({state:"hidden"});
      before=await mark();
      await page.getByRole("button",{name:new RegExp(title)}).first().click();
      await page.getByRole("heading",{name:"历史对话",exact:true}).waitFor();
      await saw(before,"历史会话",1,0);
      await settle();
      before=await mark();
      await button("返回列表").click();
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
      await button("下个月").click();
      await saw(before,"训练月历",1,0);
      await settle();
      before=await mark();
      await button("上个月").click();
      await saw(before,"训练月历",-1,0);
      await settle();
      before=await mark();
      await page.getByRole("link",{name:"总览",exact:true}).filter({visible:true}).last().click();
      await page.waitForURL("**/dashboard");
      await saw(before,"div",-1,0);

      if(!mobile) {
        await page.goto("/admin",{waitUntil:"networkidle"});
        const verify=page.getByLabel("当前密码");
        await verify.fill(account.password);
        await button("验证并进入").click();
        await page.getByRole("link",{name:"查看用户",exact:true}).first().waitFor();
        const nav=page.getByRole("navigation",{name:"管理后台栏目",exact:true});
        await nav.waitFor();
        before=await mark();
        await nav.getByRole("link",{name:"用量分析",exact:true}).click();
        await page.getByRole("heading",{name:"用量分析",exact:true}).waitFor();
        await saw(before,"管理后台正文",1,0);
        await settle();
        await page.getByRole("combobox",{name:"用户",exact:true}).selectOption(userId);
        await page.getByText("所选用户",{exact:true}).waitFor();
        const adminSteps = [
          ["用户概况","用户概况",1],
          [/^账号设置/,"账号设置",1],
          [/返回用户概况/,"用户概况",-1],
          [/返回用量分析/,"用量分析",-1],
        ];
        for (const [link,heading,direction] of adminSteps) {
          before=await mark();
          await page.getByRole("link",{name:link}).click();
          await page.getByRole("heading",{name:heading,exact:true}).waitFor();
          await saw(before,"管理后台正文",direction,0);
          await settle();
        }
        before=await mark();
        await nav.getByRole("link",{name:"用户管理",exact:true}).click();
        await page.getByRole("heading",{name:"用户管理",exact:true}).waitFor();
        await saw(before,"管理后台正文",-1,0);
        await settle();
        const sections=page.getByRole("navigation",{name:"用户管理分类",exact:true});
        before=await mark();
        await sections.getByRole("link",{name:"邀请",exact:true}).click();
        await page.getByLabel("邀请账号").waitFor();
        await saw(before,"管理后台正文",1,0);
        await settle();
        before=await mark();
        await sections.getByRole("link",{name:"账号",exact:true}).click();
        await page.getByLabel("账号状态").waitFor();
        await saw(before,"管理后台正文",-1,0);
        await settle();
      }
      assert.deepEqual(result.errors,[]);
      result.passed=true;
    } catch(error) {
      result.failure=String(error);
      result.diagnostics=await page.evaluate(() => {
        const dialog=document.querySelector('dialog[aria-label="照片预览"]');
        return { photoInput:window.photoInput, shown:dialog?.open ? dialog.querySelector("header")?.textContent : null,
          photos:[...dialog?.querySelectorAll("img") ?? []].map(node=>({
            alt:node.alt,frame:node.dataset.photoFrame,ready:node.dataset.ready,width:node.naturalWidth,
          })) };
      }).catch(()=>null);
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
