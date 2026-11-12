import assert from "node:assert/strict";
import {mkdir,writeFile,rename} from "node:fs/promises";
import {join,resolve} from "node:path";
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??"/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
const engine=process.env.PROTOTYPE_BROWSER??"chromium",browser=await ({chromium,webkit}[engine]).launch({headless:true});
const dir=resolve(process.env.PROTOTYPE_ARTIFACTS??".codex/assistant-chat/acceptance");await mkdir(dir,{recursive:true});
const errors=[],network=[],checks=[],screenshots=[],layouts=[];
const base="http://127.0.0.1:4177";
async function create(width=1440,height=900,video=false,touch=false){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:"reduce",timezoneId:"Asia/Shanghai",hasTouch:touch,isMobile:touch,recordVideo:video?{dir,size:{width,height}}:undefined});
 const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));page.on("request",request=>{if(!request.url().startsWith(base)&&!request.url().startsWith("blob:")&&!request.url().startsWith("data:"))network.push({url:request.url(),method:request.method()});});
 await page.goto(base);await page.locator(".chatWindow[open]").waitFor();return {page,context};
}
async function shot(page,name){const file=engine+"-"+name+".png";await page.screenshot({path:join(dir,file),animations:"disabled"});screenshots.push(file);}
async function scene(page,value){
 if(await page.locator(".overlay[open]").count())await page.getByRole("button",{name:"关闭详情",exact:true}).click();
 if(!await page.locator(".chatWindow[open]").count())await page.getByRole("button",{name:"打开小助手",exact:true}).click();
 await page.locator(".scenarioMenu>summary").click();await page.getByLabel("切换演示场景",{exact:true}).selectOption(value);await page.locator(".scenarioMenu:not([open])").waitFor();
}
async function send(page,text){await page.getByRole("textbox",{name:"给小助手发消息",exact:true}).fill(text);await page.getByRole("button",{name:"发送消息",exact:true}).click();await page.getByRole("button",{name:"停止生成",exact:true}).waitFor({state:"hidden"});}
async function fit(page,label){
 const data=await page.evaluate(()=>{
  const surface=document.querySelector(".overlay[open]")??document.querySelector(".chatWindow[open]")??document.querySelector(".prototype");
  const controls=[...surface.querySelectorAll("button,summary,input:not([type=file]):not([type=checkbox]),select,textarea,a")].filter(node=>node.checkVisibility()).map(node=>({label:node.getAttribute("aria-label")??node.textContent?.trim(),height:node.getBoundingClientRect().height,width:node.getBoundingClientRect().width,font:parseFloat(getComputedStyle(node).fontSize),tag:node.tagName}));
  const roots=[...document.querySelectorAll(".chatWindow[open],.overlay[open],.messageFeed,.taskRail,.composerArea")].filter(node=>node.checkVisibility());
  const overflow=roots.filter(node=>node.scrollWidth>node.clientWidth+1).map(node=>({class:node.className,client:node.clientWidth,scroll:node.scrollWidth}));
  const heading=document.querySelector(".chatHeading"),a=heading?.firstElementChild?.getBoundingClientRect(),b=heading?.lastElementChild?.getBoundingClientRect();
  const shell=[...document.querySelectorAll('.chatWindow[open] .chatHeading,.chatWindow[open] .chatTabs')].filter(node=>node.checkVisibility()).map(node=>({name:node.className,top:node.getBoundingClientRect().top,bottom:node.getBoundingClientRect().bottom}));
  return {viewport:[innerWidth,innerHeight],documentOverflow:document.documentElement.scrollWidth>innerWidth+1,overflow,controls,shell,headingCollision:!!a&&!!b&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1};
 });
 layouts.push({label,...data});assert.equal(data.documentOverflow,false,"文档横向溢出");assert.deepEqual(data.overflow,[],"面板内容不得被横向裁切");assert.equal(data.headingCollision,false,"标题和操作不得重叠");assert.ok(data.controls.every(control=>control.height>=43.9&&control.width>=43.9),"可见操作至少44×44px："+JSON.stringify(data.controls.filter(c=>c.height<43.9||c.width<43.9)));assert.ok(data.shell.every(part=>part.top>=-1&&part.bottom<=data.viewport[1]+1),"标题和标签必须在视口内："+JSON.stringify(data.shell));assert.ok(data.controls.filter(c=>["INPUT","TEXTAREA","SELECT"].includes(c.tag)).every(c=>c.font>=16));return data;
}
async function text200(page){await page.evaluate(()=>document.documentElement.style.fontSize="200%");}

async function finishVideo(context,page,name){const video=page.video();await context.close();if(video)await rename(await video.path(),join(dir,engine+"-"+name+".webm"));}
try{
 const {page,context}=await create(1440,900,true);
 await fit(page,"default");await shot(page,"desktop-default");
 await send(page,"100克");
 assert.match(await page.locator("[data-preview-id]").textContent(),/米饭 150克 · 鸡胸肉 100克/);assert.equal(await page.locator(".prototype").getAttribute("data-write-count"),"0");
 await page.getByRole("button",{name:"查看并确认",exact:true}).click();await page.getByRole("button",{name:"确认保存 · 演示",exact:true}).click();await page.locator(".chatWindow[open]").waitFor();
 assert.equal(await page.locator(".prototype").getAttribute("data-write-count"),"1");assert.equal(await page.getByText("饮食是不是还没记全？",{exact:true}).isVisible(),true,"今天的记录不清除昨天待办");
 await shot(page,"preview-confirmed");
 await scene(page,"quote");await page.locator("#meal-09").getByRole("button",{name:/引用回复/}).click();await send(page,"备注改成聚餐");
 assert.match(await page.locator("[data-preview-id]").textContent(),/2026-11-09/);assert.equal(await page.locator("[data-preview-id]").count(),1);await page.locator(".messageQuote").last().click();assert.equal(await page.locator("#meal-09").evaluate(node=>node.classList.contains("referenced")),true);await shot(page,"quote-older-message");
 await scene(page,"meal");await send(page,"最近七天体重怎么样？");assert.equal(await page.locator("[data-preview-id]").count(),0);assert.match(await page.locator(".assistant .messageText").last().textContent(),/缺测/);checks.push("补充保留米饭150克、引用旧消息定位11月9日、换身体查询不修改饮食");
 await scene(page,"photo");await page.getByLabel("本地照片文件",{exact:true}).setInputFiles({name:"虚构照片.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nE0AAAAASUVORK5CYII=","base64")});
 assert.equal(await page.getByAltText("待发送的本地照片").isVisible(),true);await send(page,"这顿饭帮我记一下");await send(page,"100克");assert.equal(await page.locator("[data-preview-id]").count(),0);
 await send(page,"鸡胸肉100克");assert.equal(await page.locator("[data-preview-id]").count(),0);await send(page,"米饭150克");assert.match(await page.locator("[data-preview-id]").textContent(),/米饭 150克 · 鸡胸肉 100克/);await shot(page,"photo-followup");
 await scene(page,"meal");await page.getByRole("button",{name:"忽略这一天",exact:true}).click();assert.equal(await page.locator(".prototype").getAttribute("data-model-requests"),"0");assert.equal(await page.locator(".prototype").getAttribute("data-write-count"),"0");assert.equal(await page.getByText("这一天的提醒已忽略",{exact:true}).isVisible(),true);
 await scene(page,"meal");await page.getByRole("button",{name:"去补录",exact:true}).click();await page.getByLabel("本次实际食量",{exact:true}).fill("米饭150克，鸡胸肉100克");await page.getByRole("button",{name:"保存补录 · 演示",exact:true}).click();await page.locator(".chatWindow[open]").waitFor();assert.equal(await page.getByText("昨日待办已处理",{exact:true}).isVisible(),true);assert.equal(await page.locator(".prototype").getAttribute("data-model-requests"),"0");checks.push("本地照片不上传且未知食量不猜；补录更新所属待办，忽略不写记录或调用模型");
 await scene(page,"meal");await page.getByRole("textbox",{name:"给小助手发消息",exact:true}).fill("保留这份草稿");await page.getByRole("button",{name:"关闭小助手",exact:true}).click();await page.locator(".chatWindow[open]").waitFor({state:"hidden"});await page.getByRole("button",{name:"打开小助手",exact:true}).click();assert.equal(await page.getByRole("textbox",{name:"给小助手发消息",exact:true}).inputValue(),"保留这份草稿");
 await page.getByRole("button",{name:"新对话",exact:true}).click();await page.getByRole("button",{name:"继续编辑",exact:true}).click();assert.equal(await page.getByRole("textbox",{name:"给小助手发消息",exact:true}).inputValue(),"保留这份草稿");
 await scene(page,"long");await page.emulateMedia({reducedMotion:"no-preference"});await page.getByRole("textbox",{name:"给小助手发消息",exact:true}).fill("帮我梳理这一周的记录");await page.getByRole("button",{name:"发送消息",exact:true}).click();await page.getByRole("button",{name:"停止生成",exact:true}).click();await page.getByText("生成已停止",{exact:true}).waitFor();await page.getByRole("button",{name:"继续回答",exact:true}).click();await page.getByRole("button",{name:"停止生成",exact:true}).waitFor({state:"hidden"});await page.emulateMedia({reducedMotion:"reduce"});checks.push("关闭恢复草稿、新对话取消保护、停止与继续回答");
 await finishVideo(context,page,"flows");

 const second=await create(),p=second.page;
 for(const state of ["offline","timeout","service","tool-error"]){await scene(p,state);await send(p,"查询昨天的饮食");assert.equal(await p.getByRole("alert").count(),1);await fit(p,state);await shot(p,state);await p.getByRole("button",{name:state==="tool-error"?"重试查询":"重试这条消息",exact:true}).click();await p.getByRole("button",{name:"停止生成",exact:true}).waitFor({state:"hidden"});assert.equal(await p.locator(".messageError").count(),0);}
 await scene(p,"partial");await send(p,"查询昨天的饮食与消耗");assert.match(await p.locator(".assistant .messageText").last().textContent(),/消耗查询失败/);await shot(p,"partial-results");
 await scene(p,"stale-source");await send(p,"昨天吃了什么？");await p.getByRole("button",{name:/昨日饮食记录/}).click();await p.getByText("引用的是当时的摘要，当前记录已有更新。请重新查询后再据此修改。",{exact:true}).waitFor();await fit(p,"stale-source");await shot(p,"source-stale");await p.getByRole("button",{name:"关闭详情",exact:true}).click();await p.keyboard.press("Tab");
 for(const state of ["expired","conflict"]){await scene(p,state);await send(p,"100克");await p.getByRole("button",{name:"查看并确认",exact:true}).click();assert.equal(await p.getByRole("button",{name:"确认保存 · 演示",exact:true}).count(),0);await shot(p,state+"-review");await p.getByRole("button",{name:"重新获取预览",exact:true}).click();await p.getByRole("button",{name:"确认保存 · 演示",exact:true}).click();await p.locator(".chatWindow[open]").waitFor();}
 await scene(p,"duplicate");await send(p,"100克");await p.getByRole("button",{name:"查看并确认",exact:true}).click();await p.getByRole("button",{name:"确认保存 · 演示",exact:true}).click();await p.locator(".chatWindow[open]").waitFor();await send(p,"补记这顿饭");await send(p,"100克");assert.equal(await p.locator(".prototype").getAttribute("data-write-count"),"1");assert.match(await p.locator(".assistant .messageText").last().textContent(),/没有重复新增/);
 for(const state of ["context-limit","daily-limit","rate-limit","login"]){await scene(p,state);await p.getByRole("textbox",{name:"给小助手发消息",exact:true}).fill("限制状态下的草稿");assert.equal(await p.getByRole("button",{name:"发送消息",exact:true}).isDisabled(),true);await fit(p,state);await shot(p,state);}
 await p.getByRole("button",{name:"重新登录 · 演示",exact:true}).click();assert.equal(await p.getByRole("textbox",{name:"给小助手发消息",exact:true}).inputValue(),"限制状态下的草稿");
 await scene(p,"long");await send(p,"梳理这一周");await p.getByText("回答尚未完成",{exact:true}).waitFor();const originalCount=await p.locator(".message").count();await p.getByRole("button",{name:"继续回答",exact:true}).click();await p.getByRole("button",{name:"停止生成",exact:true}).waitFor({state:"hidden"});assert.equal(await p.locator(".message").count(),originalCount);checks.push("断网／超时／服务／工具失败重试、部分成功、来源失效、过期／冲突、重复保护、三种上限与登录恢复");

 for(const theme of ["light","dark"])for(const [width,height] of [[320,560],[390,640],[430,780],[844,390],[1100,780],[1440,900]]){
  await p.setViewportSize({width,height});await scene(p,"meal");await p.evaluate(value=>document.documentElement.dataset.theme=value,theme);await fit(p,theme+"-"+width);await shot(p,theme+"-"+width+"x"+height);
 }
 for(const [width,height] of [[320,780],[390,780],[1440,900]]){
  await p.setViewportSize({width,height});await scene(p,"meal");await p.reload();await p.locator(".chatWindow[open]").waitFor();await text200(p);await fit(p,"text200-"+width);await shot(p,"text200-"+width);
  await scene(p,"context-limit");await fit(p,"text200-limit-"+width);await shot(p,"text200-limit-"+width);
 }
 await second.context.close();

 const mobile=await create(390,780,true,true),m=mobile.page;
 async function dragHandle(delta,expanded){const box=await m.locator('.sheetHandle').boundingBox();await m.mouse.move(box.x+box.width/2,box.y+box.height/2);await m.mouse.down();await m.mouse.move(box.x+box.width/2,box.y+box.height/2+delta,{steps:6});await m.mouse.up();await m.waitForFunction(value=>document.querySelector('.chatWindow')?.dataset.expanded===String(value),expanded);}
 await dragHandle(90,false);await dragHandle(-90,true);await dragHandle(90,false);await dragHandle(-90,true);await dragHandle(12,false);await m.locator('.sheetHandle').click();
 await m.locator('.sheetHandle').focus();await m.keyboard.press('Space');assert.equal(await m.locator('.chatWindow').getAttribute('data-expanded'),'false');await m.keyboard.press('Enter');assert.equal(await m.locator('.chatWindow').getAttribute('data-expanded'),'true');
 await m.locator('#chat-title').focus();await m.keyboard.press('Tab');assert.equal(await m.locator(':focus').getAttribute('aria-label'),'新对话');await m.keyboard.press('Shift+Tab');assert.equal(await m.locator(':focus').getAttribute('class'),'sheetHandle');
 await m.locator('.scenarioMenu>summary').focus();await m.keyboard.press('Enter');assert.equal(await m.locator('.scenarioMenu').getAttribute('open'),'');await m.keyboard.press('Escape');assert.equal(await m.locator('.scenarioMenu').getAttribute('open'),null);assert.equal(await m.locator('.chatWindow[open]').count(),1);await m.keyboard.press('Escape');await m.locator('.chatWindow[open]').waitFor({state:'hidden'});assert.equal(await m.locator(':focus').getAttribute('aria-label'),'打开小助手');await m.keyboard.press('Enter');
 await scene(m,'sources');await send(m,'昨天吃了什么？');await m.getByRole('button',{name:/昨日饮食记录/}).click();await m.keyboard.press('Tab');assert.equal(await m.locator(':focus').getAttribute('aria-label'),'关闭详情');await m.keyboard.press('Escape');assert.equal(await m.locator('.overlay[open]').count(),0);assert.equal(await m.locator('.chatWindow[open]').count(),1);assert.equal(await m.locator('.sources button').first().evaluate(node=>node===document.activeElement),true);
 checks.push('双向及连续反向拖动、阈值内点击、把手单击／空格／Enter、Tab／Shift+Tab、Escape分层与关闭焦点恢复');
 await scene(m,'meal');
 await m.getByRole("tab",{name:/待办/}).click();await shot(m,"mobile-tasks");await m.getByRole("button",{name:"让 AI 帮我补记",exact:true}).click();assert.match(await m.getByRole("textbox",{name:"给小助手发消息",exact:true}).inputValue(),/11月11/);assert.equal(await m.getByRole("tab",{name:"聊天",exact:true}).getAttribute("aria-selected"),"true");
 await m.setViewportSize({width:390,height:420});await m.getByRole("textbox",{name:"给小助手发消息",exact:true}).focus();await fit(m,"short-keyboard-viewport");await shot(m,"keyboard-viewport-simulation");
 await m.setViewportSize({width:844,height:390});await fit(m,"touch-landscape");await shot(m,"touch-landscape");
 await m.setViewportSize({width:390,height:780});await scene(m,"meal");await m.getByRole("tab",{name:/待办/}).click();await m.locator(".taskRail").getByRole("button",{name:"记录测量",exact:true}).click();await m.getByRole("heading",{name:"记录测量 · 本地演示",exact:true}).waitFor();await m.getByLabel("实测体重（kg）",{exact:true}).fill("70.2");await m.getByRole("button",{name:"保存补录 · 演示",exact:true}).click();await m.getByRole("tab",{name:/待办/}).click();assert.equal(await m.getByText("饮食是不是还没记全？",{exact:true}).isVisible(),true);checks.push("深浅主题六视口与200%文字、手机聊天待办切换、键盘视口模拟、触屏横屏、测量不清除饮食待办");
 await finishVideo(mobile.context,m,"mobile");

 const loading=await create(390,640),l=loading.page;
 for(const slow of [false,true]){
  await scene(l,"meal");await l.locator(".scenarioMenu>summary").click();await l.getByRole("checkbox",{name:"慢速响应演示",exact:true}).setChecked(slow);await l.locator(".scenarioMenu>summary").click();
  await l.evaluate(()=>{window.prototypeFrames=[];const begin=performance.now();function record(){const input=document.querySelector(".composer"),heading=document.querySelector(".chatHeading");if(input&&heading)window.prototypeFrames.push({time:performance.now()-begin,input:input.getBoundingClientRect().toJSON(),heading:heading.getBoundingClientRect().toJSON()});if(performance.now()-begin<6500)requestAnimationFrame(record);}requestAnimationFrame(record);});
  await send(l,"100克");const frames=await l.evaluate(()=>window.prototypeFrames);let maxDelta=0;const first=frames[0];for(const frame of frames)for(const name of ["input","heading"])for(const axis of ["x","y","width"])maxDelta=Math.max(maxDelta,Math.abs(frame[name][axis]-first[name][axis]));assert.ok(maxDelta<=1,"生成过程固定槽位偏移"+maxDelta);
  await writeFile(join(dir,engine+"-loading-"+(slow?"slow":"normal")+".json"),JSON.stringify({maxDelta,frames},null,2));checks.push((slow?"慢速":"正常")+"模拟响应：固定输入／标题偏移"+maxDelta+"px");
 }
 await l.getByRole("button",{name:"关闭小助手",exact:true}).click();await l.locator(".chatWindow[open]").waitFor({state:"hidden"});await l.getByRole("button",{name:"打开小助手",exact:true}).click();await l.locator(".scenarioMenu>summary").click();await l.getByRole("button",{name:/切换演示账号/}).click();await l.getByRole("button",{name:"切换账号",exact:true}).click();assert.equal(await l.locator(".message").count(),0);assert.equal(await l.locator(".prototype").getAttribute("data-account"),"B");await loading.context.close();
 assert.equal((await fetch(base+"/api/mcp",{method:"POST"})).status,405);assert.equal((await fetch(base+"/.env.local")).status,404);
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);checks.push("切换账号清空状态；无外部请求、写接口或仓库文件暴露");
 await writeFile(join(dir,engine+"-report.json"),JSON.stringify({engine,checks,screenshots,layouts,errors,network},null,2));
 console.log(JSON.stringify({engine,checks,screenshots:screenshots.length,errors,network}));
}catch(error){await writeFile(join(dir,engine+"-failure.txt"),String(error));for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:join(dir,engine+"-failed-"+browser.contexts().indexOf(context)+".png")}).catch(()=>{});await writeFile(join(dir,engine+"-failed-layouts.json"),JSON.stringify(layouts,null,2));throw error;}
finally{await browser.close();}
