import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {readMealSnapshot,submitMealOperation,decideMealOperation} from "../src/features/meals/records.ts";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";
import {randomUUID} from "node:crypto";
import {dailyTotals} from "../src/features/meals/model.ts";
import {readEnergySnapshot} from "../src/features/activities/records.ts";
import {energyBaseline} from "../src/features/activities/model.ts";

const kinds=["intake","morning-weight","energy"];
const routeFor={intake:"meals","morning-weight":"measurements",energy:"energy"};
const activity=new WeakMap();
function trackRequests(page){
 const state={pending:new Set(),changed:Date.now(),retired:[]};activity.set(page,state);
 const relevant=request=>request.method()==="POST"||new URL(request.url()).searchParams.has("_rsc");
 page.on("request",request=>{
  if(request.isNavigationRequest()&&request.resourceType()==="document"&&request.frame()===page.mainFrame()){
   // 新文档接管后旧预取及已确认退出的运输事件不再决定当前文档就绪；
   // 业务写入仍留在账本，不能用跳页跳过未完成的保存。
   for(const old of state.pending)if(old.method()==="GET"||new URL(old.url()).pathname==="/api/auth/sign-out"){
    state.retired.push({method:old.method(),url:old.url(),reason:"document-replaced"});state.pending.delete(old);
   }
   state.changed=Date.now();
  }
  if(relevant(request)){state.pending.add(request);state.changed=Date.now();}
 });
 const complete=request=>{if(state.pending.delete(request))state.changed=Date.now();};
 page.on("requestfinished",complete);page.on("requestfailed",complete);
}
async function quiet(page){
 const state=activity.get(page);if(!state)return;
 const deadline=Date.now()+30000;
 while(state.pending.size||Date.now()-state.changed<500){
  assert.ok(Date.now()<deadline,"导航及 Server Action 流应完成："+JSON.stringify([...state.pending].map(request=>({method:request.method(),url:request.url()}))));await new Promise(done=>setTimeout(done,25));
 }
}
const settled=async page=>{
 await page.waitForFunction(()=>!document.querySelector(".workspace-skeleton,[data-chart-flight]"));
 await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 await quiet(page);
};
const mainPlot=page=>page.locator('[data-record-slot="plot"] svg[role="group"]').first();
async function visiblePlot(page){
 const plot=mainPlot(page);await plot.waitFor();
 await page.waitForFunction(()=>{const svg=document.querySelector('[data-record-slot="plot"] svg[role="group"]');return svg&&getComputedStyle(svg).visibility==="visible"&&svg.getBoundingClientRect().width>100;});
 return plot;
}
async function installRecorder(page){
 await page.evaluate(()=>{
  const frames=[],start=performance.now();let frame;
  const take=()=>{
   const node=document.querySelector("[data-chart-flight]");
   if(node){const box=node.getBoundingClientRect(),animation=node.getAnimations()[0],target=document.querySelector("[data-trend-ready]"),targetBox=target?.getBoundingClientRect(),matrix=target?.getScreenCTM(),a=matrix?new DOMPoint(0,0).matrixTransform(matrix):null,b=matrix?new DOMPoint(240,120).matrixTransform(matrix):null,kind=node.querySelector("[data-trend-glyph]")?.dataset.trendGlyph,source=kind?document.querySelector('[data-metric-card="'+kind+'"] [data-trend-glyph]'):null,sourceBox=source?.getBoundingClientRect();frames.push({time:performance.now()-start,scroll:scrollY,source:sourceBox?{x:sourceBox.x,y:sourceBox.y,width:sourceBox.width,height:sourceBox.height}:null,id:node.dataset.chartFlight,direction:node.dataset.chartDirection,starts:node.dataset.motionStarts??null,visible:getComputedStyle(node).visibility,left:box.left,top:box.top,width:box.width,height:box.height,animation:animation?{state:animation.playState,time:animation.currentTime}:null,target:targetBox?{x:targetBox.x,y:targetBox.y,width:targetBox.width,height:targetBox.height,skeleton:!!target.closest(".workspace-skeleton"),plane:a&&b?{x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y}:null,slots:Array.from(document.querySelectorAll("[data-record-slot]")).map(n=>({slot:n.dataset.recordSlot,y:n.getBoundingClientRect().y,height:n.getBoundingClientRect().height}))}:null});}
   frame=requestAnimationFrame(take);
  };
  take();window.__desktopFlightRecord={frames,stop:()=>cancelAnimationFrame(frame)};
 });
}
async function flightRecord(page){
 return page.evaluate(()=>{const record=window.__desktopFlightRecord;record.stop();return record.frames;});
}
function assertMotion(frames,direction){
 const visible=frames.filter(frame=>frame.direction===direction&&frame.visible==="visible");
 const ids=[...new Set(visible.map(frame=>frame.id))];assert.equal(ids.length,1,direction+" 每方向只能一个图层");
 assert.ok(visible.length>=2,direction+" 须有真实中间帧");
 const widths=visible.map(frame=>frame.width);assert.ok(Math.max(...widths)-Math.min(...widths)>4,direction+" 须实际移动／缩放");
 for(const frame of visible)assert.ok(Math.abs(frame.width/frame.height-2)<.02,"数据平面保持2:1");
}
async function picture(page,folder,name){
 const path=join(folder,name+".png");await page.screenshot({path,fullPage:false});return path;
}
async function checkInspector(page,expectedIntent="view"){
 const dialog=page.locator("dialog[open]").first();
 await dialog.waitFor();
 await dialog.evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
 const state=await dialog.evaluate(node=>{
  const generic=node.querySelector('[class*="inspector_heading"]'),heading=generic??node.querySelector("header"),handle=node.querySelector('[class*="sheetHandle"]'),close=node.querySelector('button[aria-label^="关闭"]'),style=getComputedStyle(heading),rect=close.getBoundingClientRect();
  return {generic:!!generic,radius:style.borderRadius,shadow:style.boxShadow,background:style.backgroundColor,filter:style.backdropFilter,marginLeft:style.marginLeft,handle:getComputedStyle(handle).display,close:{width:rect.width,height:rect.height},intent:node.querySelector("[data-record-intent]")?.dataset.recordIntent,forms:node.querySelectorAll("form").length};
 });
 assert.equal(state.radius,"0px");assert.equal(state.shadow,"none");if(state.generic)assert.equal(state.background,"rgba(0, 0, 0, 0)");
 assert.ok(["none",""].includes(state.filter));assert.equal(state.marginLeft,"0px");
 assert.ok(state.close.width>=43.9&&state.close.height>=43.9);
 if(expectedIntent!==null){assert.equal(state.intent,expectedIntent);if(expectedIntent==="view")assert.equal(state.forms,0);}
 if(await page.evaluate(()=>innerWidth>700&&matchMedia("(hover:hover)").matches))assert.equal(state.handle,"none");
 return state;
}

/** 仅隔离虚构账号；覆盖真实点击、鼠标、键盘、history 与绘图几何。 */
export async function checkDesktopLinked({browser,baseURL,baselineURL,slowURL,fixture,db,artifacts}){
 assert.ok(["localhost","127.0.0.1"].includes(new URL(baseURL).hostname));
 assert.equal(fixture.account.email,"assistant@example.test");
 await mkdir(artifacts,{recursive:true});
 const report={passed:false,matrix:[],flows:[],resize:[],boundaries:[],stability:[],editors:[],errors:[],serverErrors:[],screens:[]};
 const recordVideo=browser.browserType().name()==="chromium"?{dir:join(artifacts,"videos"),size:{width:1440,height:900}}:undefined;
 const context=await browser.newContext({locale:"zh-CN",timezoneId:"Asia/Shanghai",viewport:{width:1440,height:900},recordVideo});
 await context.addInitScript(({id,today})=>{if(location.protocol==="http:"||location.protocol==="https:"){localStorage.setItem("formward:assistant:shown:"+id+":"+today,"shown");localStorage.setItem("formward:rail-hint:"+id,"seen");}}, {id:fixture.userId,today:fixture.today});
 assert.equal((await context.request.post(baseURL+"/api/auth/sign-in/email",{headers:{Origin:baseURL},data:fixture.account})).status(),200);
 const page=await context.newPage();
 trackRequests(page);
 page.on("pageerror",error=>report.errors.push({url:page.url(),message:error.message}));
 page.on("response",response=>{if(response.status()>=500)report.serverErrors.push({url:response.url(),status:response.status()});});
 try{
  if(baselineURL){
   for(const [width,height] of [[1440,900],[390,640]]){
    await page.setViewportSize({width,height});await page.goto(baselineURL+"/dashboard");await settled(page);
    report.screens.push(await picture(page,artifacts,"before-home-"+width));
    await page.goto(baselineURL+"/dashboard/energy?date="+addCalendarDays(fixture.today,-1));await settled(page);
    if(await page.locator("dialog[open]").count())report.screens.push(await picture(page,artifacts,"before-inspector-"+width));
    await page.goto(baseURL+"/dashboard/energy?date="+addCalendarDays(fixture.today,-1));await settled(page);await checkInspector(page);
    report.screens.push(await picture(page,artifacts,"after-inspector-"+width));
   }
  }
  if(process.env.FORMWARD_DESKTOP_FOCUS!=="flows")for(const theme of ["dark","light"]){
   for(const [width,height] of [[1440,900],[1100,800],[320,560],[390,640],[430,780],[844,390]]){
    await page.setViewportSize({width,height});
    await page.goto(baseURL+"/dashboard");
    await page.evaluate(theme=>{localStorage.setItem("formward-theme",theme);document.documentElement.dataset.appearance=theme;document.documentElement.dataset.theme=theme;window.dispatchEvent(new Event("formward-theme-change"));},theme);
    await settled(page);assert.equal(await page.locator("[data-metric-card]").count(),3);
    const boxes=await page.locator("[data-metric-card]").evaluateAll(nodes=>nodes.map(node=>{const rect=node.getBoundingClientRect();return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};}));
    const desktop=await page.evaluate(()=>matchMedia("(min-width:701px) and (hover:hover)").matches);
    if(desktop){if(width>=1100)assert.ok(Math.max(...boxes.map(b=>b.y))-Math.min(...boxes.map(b=>b.y))<=1);assert.equal(await page.locator("[data-metric-layout=grid]").count(),1);}
    else assert.equal(await page.locator("[data-metric-layout=rail]").count(),1);
    const order=await page.evaluate(()=>document.querySelector("[data-metric-rail]").compareDocumentPosition(document.querySelector('section[aria-label="热量与晨重趋势"]'))&Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(order);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    report.matrix.push({theme,width,height,boxes,desktop});
    report.screens.push(await picture(page,artifacts,theme+"-home-"+width));
   }
  }
  await page.setViewportSize({width:1440,height:900});
  for(const kind of kinds){
   await page.goto(baseURL+"/dashboard");await settled(page);
   await page.getByRole("button",{name:"90D",exact:true}).click();
   assert.equal(await page.getByLabel("显示体重估计",{exact:true}).count(),0);
   const card=page.locator('[data-metric-card="'+kind+'"]');
   const href=await card.getAttribute("href"),query=new URL(href,baseURL).searchParams;
   if(kind==="energy")await page.evaluate(()=>scrollTo(0,80));
   const sourceScroll=await page.evaluate(()=>scrollY);
   await installRecorder(page);await card.click();await page.waitForURL("**/dashboard/"+routeFor[kind]+"?**");await settled(page);
   const graph=await visiblePlot(page);
   assert.equal(await page.locator("dialog[open]").count(),0);
   assert.equal(await page.locator("[data-linked-plot]").count(),1);
   assert.equal(await page.locator("[data-chart-selection]").first().getAttribute("data-selected-date"),query.get("date"));
   const plane=await page.locator("[data-linked-plot] [data-trend-ready]").evaluate(node=>{const matrix=node.getScreenCTM(),a=new DOMPoint(0,0).matrixTransform(matrix),b=new DOMPoint(240,120).matrixTransform(matrix);return {left:a.x,top:a.y,width:b.x-a.x,height:b.y-a.y};});
   assert.ok(plane.width<=641&&Math.abs(plane.width/plane.height-2)<.02);
   const entryFrames=await flightRecord(page);const flow={kind,href,plane,sourceScroll,entryFrames};report.flows.push(flow);assertMotion(entryFrames,"forward");
   for(const frame of entryFrames)if(frame.target?.plane){
    const target=frame.target.plane;
    assert.ok(Math.max(Math.abs(target.x-plane.left),Math.abs(target.y-plane.top),Math.abs(target.width-plane.width),Math.abs(target.height-plane.height))<=1,"骨架与真实数据平面的位置和尺寸一致");
   }
   report.screens.push(await picture(page,artifacts,"desktop-linked-"+kind));
   // 实际鼠标移动预览；移向查看入口时不能丢失目标日期。
   const date=query.get("from"),point=graph.locator('[data-chart-date="'+date+'"]');
   await point.hover();
   await page.waitForFunction(date=>document.querySelector("[data-chart-selection]").dataset.selectedDate===date,date);
   await page.getByRole("button",{name:"查看记录 →",exact:true}).click();await page.locator("dialog[open]").waitFor();
   const inspector=await checkInspector(page);
   const detailText=await page.locator("dialog[open]").innerText();assert.ok(detailText.includes(date)||detailText.includes(date.replaceAll("-",".")));
   report.screens.push(await picture(page,artifacts,"desktop-inspector-"+kind));
   await page.getByRole("button",{name:/^关闭.*详情$/}).click();await page.locator("dialog[open]").waitFor({state:"hidden"});
   await installRecorder(page);
   await page.goBack();
   await page.waitForURL(baseURL+"/dashboard");await settled(page);
   const backFrames=await flightRecord(page);flow.backFrames=backFrames;assertMotion(backFrames,"back");
   assert.equal(await page.getByRole("button",{name:"90D",exact:true}).getAttribute("aria-pressed"),"true");
   assert.equal(await page.getByLabel("显示体重估计",{exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute("data-metric-card")),kind);
   assert.ok(Math.abs(await page.evaluate(()=>scrollY)-sourceScroll)<=1,"返回恢复原滚动");
   Object.assign(flow,{inspector,backFrames});
   await page.goForward();await settled(page);await visiblePlot(page);
   assert.equal(new URL(page.url()).searchParams.get("date"),query.get("date"));
  }
  if(process.env.FORMWARD_DESKTOP_FOCUS==="flows"){assert.deepEqual(report.errors,[]);report.passed=true;report.focus="flows";return report;}
  // 不带关联参数的图形，切换设备宽度后必须重新测量挂载节点。
  for(const route of ["meals","energy","measurements"]){
   await page.goto(baseURL+"/dashboard/"+route);
   for(const width of [390,1440,320,1100,430,1440]){
    await page.setViewportSize({width,height:width<701?640:900});await settled(page);const graph=await visiblePlot(page);
    report.resize.push({route,width,viewBox:await graph.getAttribute("viewBox")});
   }
  }
  // 改区间后正常返回，不能把另一条日期轴缩回原卡片。
  await page.goto(baseURL+"/dashboard");await settled(page);
  await page.locator('[data-metric-card="intake"]').click();await settled(page);
  await page.getByRole("button",{name:"30D",exact:true}).click();await settled(page);
  assert.equal(await page.locator("[data-linked-plot]").count(),0);await visiblePlot(page);
  await installRecorder(page);await page.getByRole("navigation",{name:"主导航",exact:true}).getByRole("link",{name:"总览",exact:true}).click();await settled(page);
  const changedFrames=await flightRecord(page);
  assert.equal(changedFrames.filter(f=>f.direction==="back"&&f.visible==="visible").length,0);
  report.boundaries.push({case:"range-change",frames:changedFrames});
  // 减少动态效果仍保留导航、日期和返回。
  await page.emulateMedia({reducedMotion:"reduce"});await page.goto(baseURL+"/dashboard");await settled(page);
  await installRecorder(page);await page.locator('[data-metric-card="energy"]').click();await settled(page);await visiblePlot(page);
  await page.getByRole("navigation",{name:"主导航",exact:true}).getByRole("link",{name:"总览",exact:true}).click();await settled(page);
  const reducedFrames=await flightRecord(page);assert.equal(reducedFrames.length,0);
  report.boundaries.push({case:"reduced-motion",frames:reducedFrames});
  await page.emulateMedia({reducedMotion:"no-preference"});
  // 新标签页保留正常链接语义，独立页面不依赖来源状态。
  const card=page.locator('[data-metric-card="intake"]'),href=await card.getAttribute("href");
  const popupPromise=context.waitForEvent("page");await card.click({modifiers:["Control"]});const popup=await popupPromise;
  await settled(popup);await visiblePlot(popup);assert.equal(new URL(popup.url()).pathname,"/dashboard/meals");
  assert.equal(await popup.locator("dialog[open]").count(),0);await popup.close();
  report.boundaries.push({case:"new-tab",href});
  // 200%文字：整卡退让，所有日期和关闭操作可达。
  await page.evaluate(()=>document.documentElement.style.fontSize="200%");await settled(page);
  const enlarged=await page.addStyleTag({content:'[data-metric-card] strong{font-size:60px!important}[data-metric-card] small,[data-metric-card] p,[data-metric-card] [class*="range"]{font-size:24px!important}[data-metric-card] [class*="title"]{font-size:30px!important}'});
  await settled(page);
  assert.equal(await page.locator("[data-metric-card]").count(),3);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  report.screens.push(await picture(page,artifacts,"desktop-text-200"));
  await page.evaluate(()=>document.documentElement.style.fontSize="");
  await enlarged.evaluate(node=>node.remove());
  // 每一方向的新操作接管旧交接，返回及迟到响应不能留下隐藏图形。
  for(const kind of kinds){
   await page.goto(baseURL+"/dashboard");await settled(page);await installRecorder(page);
   await page.locator('[data-metric-card="'+kind+'"]').click();
   await page.waitForFunction(()=>document.querySelector('[data-chart-flight][data-motion-starts="1"]'));
   await page.getByRole("navigation",{name:"主导航",exact:true}).getByRole("link",{name:"总览",exact:true}).click();await page.waitForURL(baseURL+"/dashboard");await settled(page);
   const frames=await flightRecord(page);
   for(const direction of ["forward","back"])assert.ok(new Set(frames.filter(f=>f.direction===direction&&f.visible==="visible").map(f=>f.id)).size<=1);
   assert.equal(await page.locator("[data-chart-travelling]").count(),0);report.boundaries.push({case:"quick-return",kind,frames});
  }
  await checkSelectionStability({page,baseURL,fixture,report,artifacts});
  await checkEditors({page,context,baseURL,fixture,db,report,artifacts});
  await checkTouch({browser,context,baseURL,fixture,report,artifacts});
  await checkSlowNavigation({browser,context,slowURL,fixture,report,artifacts});
  await checkLargeAxis({page,baseURL,fixture,db,report,artifacts});
  await checkEmptyAccount({page,context,baseURL,fixture,report,artifacts});
  report.retiredRequests=activity.get(page).retired;
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.serverErrors,[]);report.passed=true;
 }catch(error){
  report.failure={message:error.message,stack:error.stack,url:page.url()};
  await picture(page,artifacts,"failure");throw error;
 }finally{
  await context.close();await writeFile(join(artifacts,"report.json"),JSON.stringify(report,null,2));
 }
 return report;
}

async function checkSelectionStability({page,baseURL,fixture,report,artifacts}){
 const geometry=()=>page.locator("[data-record-trend]").first().evaluate(root=>{
  const values=["metrics","range","title","plot"].flatMap(slot=>{const r=root.querySelector('[data-record-slot="'+slot+'"]').getBoundingClientRect();return [r.top,r.height];});
  return {scroll:scrollY,values,date:root.closest("[data-chart-selection]")?.dataset.selectedDate};
 });
 for(const route of ["/dashboard","/dashboard/measurements"]){
  await page.setViewportSize({width:1440,height:900});await page.goto(baseURL+route);await settled(page);
  if(route==="/dashboard"){
   await page.getByRole("button",{name:"30D",exact:true}).click();assert.equal(await page.getByLabel("显示体重估计",{exact:true}).count(),0);
  }
  const point=date=>route==="/dashboard"?page.locator('[data-overview-date="'+date+'"] > rect').first():page.locator('[data-chart-metric="weightKg"] [data-chart-date="'+date+'"][data-period="daytime"] circle').first();
  await point(fixture.observed).scrollIntoViewIfNeeded();await point(fixture.observed).hover();await settled(page);
  const before=await geometry(),samples=[];
  for(const date of [fixture.anotherObserved,fixture.observed,fixture.partialWeight]){
   await point(date).hover();
   for(let frame=0;frame<8;frame++){
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(done)));
    const current=await geometry();assert.ok(Math.abs(current.scroll-before.scroll)<=1);assert.ok(current.values.every((value,i)=>Math.abs(value-before.values[i])<=1));
    assert.equal(current.date,date,"鼠标静止时选日不能反复跳动");samples.push(current);
   }
  }
  const keyPoint=point(fixture.observed).locator("..");await keyPoint.press("ArrowRight");const keyboard=await geometry();assert.ok(keyboard.values.every((v,i)=>Math.abs(v-before.values[i])<=1));
  await page.mouse.move(0,0);await settled(page);const left=await geometry();assert.ok(left.values.every((v,i)=>Math.abs(v-before.values[i])<=1));
  report.stability.push({route,before,samples,keyboard,left});report.screens.push(await picture(page,artifacts,"stable-"+(route==="/dashboard"?"overview":"body")));
 }
}

async function checkEditors({page,context,baseURL,fixture,db,report,artifacts}){
 await page.setViewportSize({width:1440,height:900});
 for(const [route,intent] of [["energy","edit"],["measurements","edit"]]){
  await page.goto(baseURL+"/dashboard/"+route+"?date="+addCalendarDays(fixture.today,-1)+"&intent=edit");await settled(page);
  const state=await checkInspector(page,intent);assert.ok(state.forms>0);
  report.editors.push({route,state});report.screens.push(await picture(page,artifacts,"desktop-editor-"+route));
  await page.keyboard.press("Escape");await page.locator("dialog[open]").waitFor({state:"hidden"});
 }
 await page.goto(baseURL+"/dashboard");await settled(page);
 await page.getByLabel("账号菜单",{exact:true}).click();await page.getByRole("button",{name:"账号管理",exact:true}).click();
 await page.getByRole("link",{name:"个人资料",exact:true}).click();await page.waitForURL("**/dashboard/profile");await settled(page);
 assert.ok(await page.getByRole("heading",{name:"个人资料",exact:true}).isVisible());
 report.screens.push(await picture(page,artifacts,"desktop-profile"));
 // 真实餐次表单：失败保留、继续编辑和放弃均通过原保护；最后成功保存备注。
 const before=(await readMealSnapshot(db,fixture.userId)).meals.find(meal=>meal.date===fixture.today);
 await page.goto(baseURL+"/dashboard/meals?date="+fixture.today+"&intent=edit");await settled(page);
 await page.locator("[data-meal-day-list] > details > summary").first().click();
 await page.locator("[data-record-intent=edit]").getByRole("button",{name:"编辑",exact:true}).first().click();
 const form=page.locator('form[data-entry-form="meal"]');await form.waitFor();
 report.editors.push({route:"meals",state:await checkInspector(page,"edit")});
 await form.getByLabel("餐次备注",{exact:true}).fill("虚构桌面关联验收");
 await context.setOffline(true);
 try{await form.locator('button[type="submit"]').click();await form.getByRole("alert").waitFor();assert.equal(await form.getByLabel("餐次备注",{exact:true}).inputValue(),"虚构桌面关联验收");}
 finally{await context.setOffline(false);}
 await page.getByRole("button",{name:"关闭编辑",exact:true}).click();
 await page.getByRole("button",{name:"继续编辑",exact:true}).click();assert.equal(await form.getByLabel("餐次备注",{exact:true}).inputValue(),"虚构桌面关联验收");
 await page.getByRole("button",{name:"关闭编辑",exact:true}).click();await page.getByRole("button",{name:"放弃修改",exact:true}).click();await form.waitFor({state:"hidden"});
 await page.goto(baseURL+"/dashboard/meals?date="+fixture.today+"&intent=edit");await settled(page);
 await page.locator("[data-meal-day-list] > details > summary").first().click();
 await page.locator("[data-record-intent=edit]").getByRole("button",{name:"编辑",exact:true}).first().click();await form.waitFor();
 await form.getByLabel("餐次备注",{exact:true}).fill("虚构成功保存备注");await form.locator('button[type="submit"]').click();await form.waitFor({state:"hidden"});
 // Server Action 的重验证流完成后才读取，不能以按钮消失冒充事务完成。
 await settled(page);
 const after=(await readMealSnapshot(db,fixture.userId)).meals.find(meal=>meal.id===before.id);
 assert.equal(after.notes,"虚构成功保存备注");assert.deepEqual(after.items.map(item=>item.nutrition),before.items.map(item=>item.nutrition));
 await page.locator("dialog[open]").getByRole("checkbox",{name:fixture.today+" 已记全",exact:true}).click();
 await page.waitForFunction(()=>document.querySelector("dialog[open] [data-meal-day-actions] [role=checkbox]")?.getAttribute("aria-checked")==="true");await settled(page);
 assert.equal(dailyTotals((await readMealSnapshot(db,fixture.userId)).meals).find(day=>day.date===fixture.today).day.status,"complete");
 report.editors.push({case:"failure-cancel-success",mealId:after.id,nutritionUnchanged:true});
 report.editors.push({case:"meal-day-complete",confirmed:true});
 report.screens.push(await picture(page,artifacts,"desktop-meal-saved"));
 // 消耗改期继续使用原 Inspector；取消不落库，确认后原编号、数值与来源保持。
 const sourceDate=addCalendarDays(fixture.today,-1),targetDate=addCalendarDays(fixture.today,-12);
 const energyBefore=await readEnergySnapshot(db,fixture.userId),day=energyBefore.days.find(row=>row.date===sourceDate&&!row.deletedAt);
 const activities=energyBefore.activities.filter(row=>row.date===sourceDate&&!row.deletedAt);
 assert.ok(day&&activities.length);assert.ok(!energyBefore.days.some(row=>row.date===targetDate&&!row.deletedAt));
 await page.goto(baseURL+"/dashboard/energy?date="+sourceDate+"&intent=edit");await settled(page);
 const energyForm=page.locator('form[data-entry-form="energy"]');await energyForm.getByText("时间与备注",{exact:true}).click();
 await energyForm.getByLabel("日期",{exact:true}).fill(targetDate);
 // 日期变化使包含依据失效，按真实流程重新核对，不能跳过该业务保护。
 await energyForm.getByRole("button",{name:"已包含",exact:true}).click();await energyForm.locator('button[type="submit"]').click();
 await page.getByRole("button",{name:"取消",exact:true}).click();assert.equal(await energyForm.getByLabel("日期",{exact:true}).inputValue(),targetDate);
 assert.deepEqual(await readEnergySnapshot(db,fixture.userId),energyBefore);
 await energyForm.locator('button[type="submit"]').click();await page.getByRole("button",{name:"确认改期并保存",exact:true}).click();
 await energyForm.waitFor({state:"hidden"});await settled(page);
 const moved=await readEnergySnapshot(db,fixture.userId),movedDay=moved.days.find(row=>row.id===day.id);
 const facts=({version,date,inclusionBasis,...rest})=>{void version;void date;void inclusionBasis;return rest;};
 assert.equal(movedDay.date,targetDate);assert.deepEqual(facts(movedDay),facts(day));
 for(const old of activities){const item=moved.activities.find(row=>row.id===old.id);assert.equal(item.date,targetDate);assert.deepEqual(facts(item),facts(old));assert.equal(item.inclusionBasis,energyBaseline(movedDay));}
 assert.ok(!moved.days.some(row=>row.date===sourceDate&&!row.deletedAt));
 report.editors.push({case:"energy-date-move",cancelKeptSnapshot:true,idsAndFactsKept:true,activities:activities.length});
 report.screens.push(await picture(page,artifacts,"desktop-energy-moved"));
 // 助手沿用真实业务入口，先收起再打开相应日期的编辑任务。
 await page.goto(baseURL+"/dashboard");await settled(page);await page.locator("[data-assistant-trigger]:visible").click();
 const assistant=page.locator("[data-assistant-surface]");await assistant.waitFor();await assistant.locator('[aria-busy="false"]').waitFor();
 const action=assistant.locator("ul").first().getByRole("link").first(),href=await action.getAttribute("href");
 assert.ok(href.includes("date="+sourceDate)&&href.includes("intent=edit"));await action.click();await settled(page);
 await assistant.waitFor({state:"hidden"});await checkInspector(page,"edit");assert.equal(new URL(page.url()).searchParams.get("date"),sourceDate);
 report.editors.push({case:"assistant-record-handoff",href});await page.getByRole("button",{name:"关闭编辑",exact:true}).click();
 await page.locator("dialog[open]").waitFor({state:"hidden"});
}

async function checkTouch({browser,context,baseURL,fixture,report,artifacts}){
 const touch=await browser.newContext({locale:"zh-CN",timezoneId:"Asia/Shanghai",viewport:{width:390,height:780},hasTouch:true,isMobile:true,storageState:await context.storageState()});
 await touch.addInitScript(({id,today})=>{if(location.protocol==="http:"||location.protocol==="https:"){localStorage.setItem("formward:assistant:shown:"+id+":"+today,"shown");localStorage.setItem("formward:rail-hint:"+id,"seen");}}, {id:fixture.userId,today:fixture.today});
 const page=await touch.newPage();trackRequests(page);page.on("pageerror",error=>report.errors.push({surface:"touch",message:error.message}));
 try{
  for(const kind of kinds){
   await page.goto(baseURL+"/dashboard");await settled(page);await page.locator('[data-metric-card="'+kind+'"]').tap();await settled(page);const graph=await visiblePlot(page);
   const date=await graph.locator("[data-chart-date]").first().getAttribute("data-chart-date");await graph.locator('[data-chart-date="'+date+'"]').first().tap();
   assert.equal(await page.locator("[data-chart-selection]").first().getAttribute("data-selected-date"),date);
   await page.getByRole("button",{name:"查看记录 →",exact:true}).tap();await checkInspector(page);
   report.screens.push(await picture(page,artifacts,"phone-inspector-"+kind));
   await page.getByRole("button",{name:/^关闭.*详情$/}).tap();await page.locator("dialog[open]").waitFor({state:"hidden"});
   await page.getByRole("navigation",{name:"主导航",exact:true}).getByRole("link",{name:"总览",exact:true}).tap();await settled(page);
   assert.equal(await page.locator("[data-metric-layout=rail]").count(),1);report.boundaries.push({case:"touch",kind,date});
  }
  await page.setViewportSize({width:844,height:390});await settled(page);assert.equal(await page.locator("[data-metric-layout=rail]").count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);report.screens.push(await picture(page,artifacts,"touch-landscape"));
 }finally{await touch.close();}
}

async function checkSlowNavigation({browser,context,slowURL,fixture,report,artifacts}){
 if(!slowURL)return;
 const slow=await browser.newContext({locale:"zh-CN",timezoneId:"Asia/Shanghai",viewport:{width:1440,height:900},storageState:await context.storageState()});
 await slow.addInitScript(({id,today})=>{if(location.protocol==="http:"||location.protocol==="https:"){localStorage.setItem("formward:assistant:shown:"+id+":"+today,"shown");localStorage.setItem("formward:rail-hint:"+id,"seen");}}, {id:fixture.userId,today:fixture.today});
 const page=await slow.newPage();trackRequests(page);page.on("pageerror",error=>report.errors.push({surface:"slow",message:error.message}));
 try{
  await page.goto(slowURL+"/dashboard");await settled(page);await installRecorder(page);
  await page.locator('[data-metric-card="intake"]').click();
  // 未完成的图形导航期间仍可选择另一模块，迟到的饮食响应不得覆盖消耗页。
  await page.getByRole("navigation",{name:"主导航",exact:true}).getByRole("link",{name:"消耗",exact:true}).click();
  await page.waitForURL(slowURL+"/dashboard/energy");await settled(page);await visiblePlot(page);
  await page.waitForTimeout(1300);assert.equal(new URL(page.url()).pathname,"/dashboard/energy");
  assert.equal(await page.locator("[data-chart-flight],[data-chart-travelling]").count(),0);
  const frames=await flightRecord(page);report.boundaries.push({case:"slow-interrupted-navigation",frames});report.screens.push(await picture(page,artifacts,"slow-navigation"));
 }finally{await slow.close();}
}

async function checkLargeAxis({page,baseURL,fixture,db,report,artifacts}){
 const operation=await submitMealOperation(db,{userId:fixture.userId,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_meal",date:fixture.today,mealType:"虚构长坐标样本",items:[{kind:"food",name:"仅供布局的虚构大数",quantity:"1",unit:"份",sourceKind:"reference",nutritionBasis:"consumed_total",nutrition:{caloriesKcal:"99999",proteinG:null,carbsG:null,fatG:null}}]}]});
 assert.equal(operation.canConfirm,true);await decideMealOperation(db,fixture.userId,operation.id,operation.revision,"confirm");
 await page.goto(baseURL+"/dashboard");await settled(page);await installRecorder(page);
 await page.locator('[data-metric-card="intake"]').click();await settled(page);await visiblePlot(page);
 const plane=await page.locator("[data-linked-plot] [data-trend-ready]").evaluate(node=>{const m=node.getScreenCTM(),a=new DOMPoint(0,0).matrixTransform(m),b=new DOMPoint(240,120).matrixTransform(m);return {x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y};});
 const frames=await flightRecord(page);report.boundaries.push({case:"large-axis",plane,frames});
 assertMotion(frames,"forward");
 for(const frame of frames)if(frame.target?.plane)for(const key of ["x","y","width","height"])assert.ok(Math.abs(frame.target.plane[key]-plane[key])<=1,"长坐标的骨架与真实图区一致");
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);report.screens.push(await picture(page,artifacts,"large-axis-linked"));
}

async function checkEmptyAccount({page,context,baseURL,fixture,report,artifacts}){
 if(!fixture.other)return;
 await page.goto(baseURL+"/dashboard");await settled(page);
 await page.getByRole("button",{name:"90D",exact:true}).click();assert.equal(await page.getByLabel("显示体重估计",{exact:true}).count(),0);
 await page.getByLabel("账号菜单",{exact:true}).click();await page.getByRole("button",{name:"账号管理",exact:true}).click();await page.getByRole("button",{name:"退出登录",exact:true}).click();await page.waitForURL(baseURL+"/");
 assert.equal((await context.request.post(baseURL+"/api/auth/sign-in/email",{headers:{Origin:baseURL},data:{email:fixture.other.email,password:fixture.other.password}})).status(),200);
 await page.goto(baseURL+"/dashboard");await settled(page);
 assert.equal(await page.locator("[data-metric-card]").count(),3);
 const readings=await page.locator("[data-metric-card] strong").allTextContents();assert.ok(readings.every(text=>/^—\s*(kcal|kg)$/.test(text.trim())));
 assert.equal(await page.locator("[data-metric-card] [data-trend-glyph] :is(rect,line,circle)").count(),0,"空账号不出现前一账号图形");
 assert.equal(await page.getByRole("button",{name:"30D",exact:true}).getAttribute("aria-pressed"),"true");
 assert.equal(await page.getByLabel("显示体重估计",{exact:true}).count(),0);
 report.boundaries.push({case:"empty-account-and-reset",readings});report.screens.push(await picture(page,artifacts,"empty-account"));
}
