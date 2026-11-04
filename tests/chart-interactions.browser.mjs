import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";
export async function checkChartInteractions({page,context=page.context(),baseURL,today=new Date(Date.now()+8*3600_000).toISOString().slice(0,10),engine="chromium",artifacts}){
 await mkdir(artifacts,{recursive:true});const checks=[],errors=[];let sharedStyles;page.on("pageerror",e=>errors.push(e.message));
 async function visit(path){await page.goto(baseURL+path);await page.waitForLoadState("networkidle");await page.waitForTimeout(260);}
 const root=()=>page.locator("[data-chart-selection]");
 const close=async()=>{await page.keyboard.press("Escape");await page.locator('dialog[open]:not(.page-loading-dialog)').waitFor({state:"hidden"});};
 for(const [route,selector] of [["/dashboard","[data-overview-date]"],["/dashboard/meals","[data-bar-date]"],["/dashboard/energy","[data-energy-date]"],["/dashboard/measurements","[data-point-id]"]]){
  await page.setViewportSize({width:1440,height:900});await visit(route);
  const initial=await root().getAttribute("data-selected-date"),a=addCalendarDays(today,-3),b=addCalendarDays(today,-4);
  const point=date=>page.locator(selector+'[data-chart-date="'+date+'"]').first();
  async function at(date,click=false){
   const target=point(date),hit=target.locator(selector==="[data-point-id]"?":scope > circle":":scope > rect").first();await hit.scrollIntoViewIfNeeded();
   const box=await hit.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);if(click)await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
   await page.waitForTimeout(40);
  }
  await at(a);assert.equal(await root().getAttribute("data-selected-date"),a);
  await at(a,true);await at(b);assert.equal(await root().getAttribute("data-selected-date"),b,"鼠标点击不能固定");
  await page.mouse.move(2,75);assert.equal(await root().getAttribute("data-selected-date"),initial,"完整面板外恢复默认");
  await at(a);const view=page.getByRole("button",{name:"查看记录 →",exact:true});await view.hover();
  assert.equal(await root().getAttribute("data-selected-date"),a,"移至查看入口仍保留目标日期");
  await view.click();await page.locator('dialog[open]:not(.page-loading-dialog)').waitFor();assert.ok((await page.locator('dialog[open]:not(.page-loading-dialog)').last().innerText()).replaceAll(".","-").includes(a));
  await close();await page.mouse.move(2,75);assert.equal(await root().getAttribute("data-selected-date"),initial);
  await page.keyboard.press("Tab");await point(a).focus();await page.keyboard.press("Enter");await page.mouse.move(2,75);
  assert.equal(await root().getAttribute("data-selected-date"),a,"鼠标离开不打断键盘选日");
  await view.focus();await page.keyboard.press("Enter");await page.locator('dialog[open]:not(.page-loading-dialog)').waitFor();
  assert.ok((await page.locator('dialog[open]:not(.page-loading-dialog)').last().innerText()).replaceAll(".","-").includes(a));await close();
  const columns=page.locator("[data-chart-selection-column]");assert.ok(await columns.count()>=1);
  const geometry=await columns.first().evaluate(n=>{const band=n.querySelector("[data-chart-selection-band]"),line=n.querySelector("[data-chart-selection-line]"),svg=n.closest("svg"),clip=svg.querySelector("clipPath[id='"+n.getAttribute("clip-path").slice(5,-1)+"'] rect");return {fill:getComputedStyle(band).fill,stroke:getComputedStyle(line).stroke,strokeWidth:getComputedStyle(line).strokeWidth,dash:getComputedStyle(line).strokeDasharray,sameTransform:band.parentElement===line.parentElement,clip:!!clip,pointer:getComputedStyle(n).pointerEvents};});
  const feedback={fill:geometry.fill,stroke:geometry.stroke,dash:geometry.dash,strokeWidth:geometry.strokeWidth};if(sharedStyles)assert.deepEqual(feedback,sharedStyles,"四页选中反馈使用同一规格");else sharedStyles=feedback;
  assert.equal(geometry.strokeWidth,"1px");assert.equal(geometry.sameTransform,true);assert.equal(geometry.clip,true);assert.equal(geometry.pointer,"none");
  const rings=page.locator("[data-chart-selection-point]");for(const ring of await rings.all()){assert.equal(await ring.getAttribute("r"),"6");assert.equal(await ring.evaluate(n=>getComputedStyle(n).strokeWidth),"1.5px");assert.equal(await ring.evaluate(n=>getComputedStyle(n).fill),"none");}
  assert.equal(await page.locator("[data-chart-selection-tick]").count(),route==="/dashboard/meals"||route==="/dashboard/energy"?1:0);
  checks.push({route,interaction:"desktop hover/click/region/view/keyboard",geometry});
 }
 await visit("/dashboard/measurements");const a=addCalendarDays(today,-3),evening=page.locator('[data-chart-metric="weightKg"] [data-point-id][data-chart-date="'+a+'"][data-period="evening"]');
 const eb=await evening.locator("circle").first().boundingBox();await page.mouse.move(eb.x+eb.width/2,eb.y+eb.height/2);
 await page.getByRole("button",{name:"查看记录 →",exact:true}).click();await page.waitForTimeout(350);
 const expanded=await page.locator("dialog[open] details[open]").allTextContents();assert.ok(expanded.join(" ").includes("晚间"),"晚间点的查看应展开晚间");await close();checks.push("body evening target captured");
 // Sample real frames around a pointer move, including rapid retarget and reversal.
 await visit("/dashboard");await page.getByRole("button",{name:"7D",exact:true}).click();await page.mouse.move(2,75);await page.waitForTimeout(130);
 const marker=page.locator("[data-chart-selection-marker]").first();
 const value=()=>marker.evaluate(n=>getComputedStyle(n).transform);
 const p=page.locator('[data-overview-date="'+addCalendarDays(today,-4)+'"] > rect').first(),pb=await p.boundingBox(),before=await value();
 await page.evaluate(()=>{window.__selectionFrames=[];const start=performance.now();const sample=()=>{const root=document.querySelector("[data-chart-selection]"),n=root.querySelector("[data-chart-selection-marker]");window.__selectionFrames.push({t:performance.now()-start,date:root.dataset.selectedDate,visual:getComputedStyle(n).transform,target:n.style.transform,animations:n.getAnimations().map(a=>({state:a.playState,duration:a.effect.getTiming().duration,easing:a.effect.getTiming().easing}))});if(performance.now()-start<260)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
 await page.mouse.move(pb.x+pb.width/2,pb.y+pb.height/2);await page.waitForTimeout(280);
 const frames=await page.evaluate(()=>window.__selectionFrames),end=await value(),moving=frames.filter(f=>f.date===addCalendarDays(today,-4)&&f.animations.some(a=>a.state==="running"));
 assert.ok(moving.length>0,"应观察到真实的短过渡帧");assert.notEqual(before,end);
 assert.ok(moving.every(f=>f.animations.every(a=>a.duration===100&&a.easing==="cubic-bezier(0.2, 0, 0, 1)")),"统一100ms曲线");
 const middle=moving.find(f=>f.visual!==before&&f.visual!==end)?.visual;assert.ok(middle,"至少一帧中间位置");
 const selected=frames.filter(f=>f.date===addCalendarDays(today,-4)),settled=selected.find(f=>f.visual===end&&!f.animations.some(a=>a.state==="running"));
 assert.ok(settled&&settled.t-selected[0].t<=150,"约100ms收敛，不排队");
 const fastDates=[-3,-5,-2,-4,-1],fastPoints=[];
 for(const offset of fastDates){const hit=page.locator('[data-overview-date="'+addCalendarDays(today,offset)+'"] > rect').first(),b=await hit.boundingBox();fastPoints.push({x:b.x+b.width/2,y:b.y+b.height/2,date:addCalendarDays(today,offset)});}
 const retarget=[];
 for(const target of fastPoints){await page.mouse.move(target.x,target.y);retarget.push(await marker.evaluate(n=>({date:n.closest("[data-chart-selection]").dataset.selectedDate,animations:n.getAnimations().map(a=>({state:a.playState,from:a.effect.getKeyframes()[0].transform}))})));assert.equal(retarget.at(-1).date,target.date);assert.ok(retarget.at(-1).animations.length<=1,"同一个标记不能堆积动画");}
 await page.waitForTimeout(150);assert.equal(await root().getAttribute("data-selected-date"),fastPoints.at(-1).date);
 assert.equal(await marker.evaluate(n=>n.getAnimations().filter(a=>a.playState==="running").length),0);
 // Repeated movement in one date must keep the existing animation object.
 await marker.evaluate(n=>{window.__sameDateAnimation=n.getAnimations()[0];});
 const last=fastPoints.at(-1);await page.mouse.move(last.x+.2,last.y);
 assert.equal(await marker.evaluate(n=>n.getAnimations()[0]===window.__sameDateAnimation),true);
 // Range and geometry replacements snap to the new coordinate system.
 await page.getByRole("button",{name:"30D",exact:true}).click();assert.equal(await marker.evaluate(n=>n.getAnimations().filter(a=>a.playState==="running").length),0);
 await page.setViewportSize({width:1100,height:900});await page.waitForTimeout(70);assert.equal(await marker.evaluate(n=>n.getAnimations().filter(a=>a.playState==="running").length),0);
 await page.emulateMedia({reducedMotion:"reduce"});await page.mouse.move(2,75);
 assert.equal(await marker.evaluate(n=>n.getAnimations().length),0);await page.emulateMedia({reducedMotion:"no-preference"});checks.push("100ms frames, rapid retarget/reversal, same-date dedup, range/resize snap and reduced motion");
 const touch=await context.browser().newContext({storageState:await context.storageState(),locale:"zh-CN",timezoneId:"Asia/Shanghai",viewport:{width:390,height:720},isMobile:true,hasTouch:true});
 const t=await touch.newPage();try{
  for(const [route,selector] of [["/dashboard","[data-overview-date]"],["/dashboard/meals","[data-bar-date]"],["/dashboard/energy","[data-energy-date]"],["/dashboard/measurements","[data-point-id]"]]){
   await t.goto(baseURL+route);await t.waitForLoadState("networkidle");
   const date=addCalendarDays(today,-3),hit=t.locator(selector+'[data-chart-date="'+date+'"]').first().locator(selector==="[data-point-id]"?":scope > circle":":scope > rect").first();await hit.tap();
   assert.equal(await t.locator("[data-chart-selection]").getAttribute("data-selected-date"),date);
   assert.equal(await t.locator("[data-chart-selection-marker]").evaluateAll(nodes=>nodes.flatMap(n=>n.getAnimations()).filter(a=>a.playState==="running").length),0,"触屏跟手，不排队动画");
   await t.getByRole("button",{name:"查看记录 →",exact:true}).tap();await t.locator('dialog[open]:not(.page-loading-dialog)').waitFor();
   assert.ok((await t.locator('dialog[open]:not(.page-loading-dialog)').last().innerText()).replaceAll(".","-").includes(date));await t.keyboard.press("Escape");await t.locator('dialog[open]:not(.page-loading-dialog)').waitFor({state:"hidden"});await t.waitForTimeout(220);checks.push(route+" touch selection snaps and detail target matches");
   if(engine==="chromium"){
    const cdp=await touch.newCDPSession(t),svg=t.locator("svg:has([data-chart-selection-column])").first();await svg.scrollIntoViewIfNeeded();const b=await svg.boundingBox(),from={x:b.x+b.width*.45,y:b.y+b.height*.5};
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[from]});
    for(let i=1;i<=8;i++){await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:from.x+b.width*.35*i/8,y:from.y}]});await t.waitForTimeout(20);}
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});assert.equal(await t.locator("[data-chart-selection]").getAttribute("data-selection-origin"),"touch");
    assert.equal(await t.locator("[data-chart-selection-marker]").evaluateAll(ns=>ns.flatMap(n=>n.getAnimations()).filter(a=>a.playState==="running").length),0);
    const before=await t.locator("[data-chart-selection]").getAttribute("data-selected-date"),area=await svg.boundingBox(),finger={x:area.x+area.width*.4,y:Math.min(550,area.y+area.height*.7)};
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[finger]});
    for(let i=1;i<=8;i++){await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:finger.x,y:finger.y-i*12}]});await t.waitForTimeout(20);}
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await t.waitForTimeout(120);assert.equal(await t.locator("[data-chart-selection]").getAttribute("data-selected-date"),before,"纵向滑动不能误选日期");await cdp.detach();
    checks.push(route+" native emulated touch horizontal selection / vertical scroll");
   }
  }
 }finally{await touch.close();}
 assert.deepEqual(errors,[]);await writeFile(artifacts+"/"+engine+"-interactions.json",JSON.stringify({checks,errors,before,middle,end,frames,retarget},null,2));return checks;
}
