import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {and,eq} from "drizzle-orm";
import {mealDayEvent} from "../src/db/schema.ts";
import {readMealSnapshot} from "../src/features/meals/records.ts";
import {dailyTotals} from "../src/features/meals/model.ts";
import {setMealDayStatus} from "../src/features/meals/day-status.ts";
import {addCalendarDays} from "../src/features/measurements/calendar.ts";

const actionRequest=request=>request.method()==="POST"&&!!request.headers()["next-action"];
const row=(page,date)=>page.locator('[data-record-date="'+date+'"]');
const control=(page,date)=>row(page,date).getByRole("checkbox");
const pause=ms=>new Promise(done=>setTimeout(done,ms));
function trackPageErrors(page){
 const errors=[],requests=[],pending=new Map();
 page.on("request",request=>{
  if(request.method()==="GET"&&new URL(request.url()).searchParams.has("_rsc")){
   const entry={url:request.url(),retired:false,failure:null};requests.push(entry);pending.set(request,entry);
  }
 });
 page.on("requestfinished",request=>pending.delete(request));
 page.on("requestfailed",request=>{const entry=pending.get(request);if(entry)entry.failure=request.failure()?.errorText??"failed";pending.delete(request);});
 page.on("pageerror",error=>errors.push(error.message));
 return{
  retire:()=>{for(const entry of pending.values())entry.retired=true;},
  verify:()=>{
   const expected=[],unexpected=[];
   for(const error of errors){
    const request=requests.find(request=>request.retired&&request.failure&&/cancelled|canceled|aborted|Load failed/i.test(request.failure)&&error.includes(request.url.replace(/^https?:\/\//,""))&&error.endsWith("due to access control checks."));
    if(request)expected.push({message:error,request});else unexpected.push(error);
   }
   return{expected,unexpected,all:errors};
  }
 };
}

async function settled(page){
 await page.waitForFunction(()=>document.querySelector("[data-record-date]")&&!document.querySelector(".workspace-skeleton"));
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>!document.querySelector('[role="checkbox"][aria-busy="true"]'));
 await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
}
async function checked(page,date,value){
 await page.waitForFunction(({date,value})=>{
  const button=document.querySelector('[data-record-date="'+date+'"] [role="checkbox"]');
  return button?.getAttribute("aria-checked")===String(value)&&button.getAttribute("aria-busy")==="false";
 },{date,value},{timeout:20000});
 await settled(page);
}
async function startFrames(page,date){
 await page.evaluate(date=>{
  const frames=[];let frame;
  const sample=()=>{
   const article=document.querySelector('[data-record-date="'+date+'"]');
   const nodes=[...document.querySelectorAll("[data-record-slot]"),article?.querySelector("time"),article?.querySelector("[data-record-actions]"),article?.querySelector("[role=checkbox]")].filter(Boolean);
   frames.push({time:performance.now(),scroll:scrollY,selected:document.querySelector("[data-chart-selection]")?.dataset.selectedDate,overlay:!!document.querySelector(".workspace-loading,.page-loading-dialog[open],[data-workspace-pending=true]"),anchors:nodes.map((node,index)=>{const box=node.getBoundingClientRect();return{key:node.dataset.recordSlot??node.getAttribute("role")??node.tagName+index,x:box.x,y:box.y,width:box.width,height:box.height};})});
   frame=requestAnimationFrame(sample);
  };
  sample();window.__mealInlineFrames={frames,stop:()=>cancelAnimationFrame(frame)};
 },date);
}
async function endFrames(page,artifacts,name){
 const frames=await page.evaluate(()=>{const recorder=window.__mealInlineFrames;recorder.stop();return recorder.frames;});
 await writeFile(join(artifacts,name+"-frames.json"),JSON.stringify(frames));
 const baseline=frames[0];let deviation=0,scroll=0;
 for(const frame of frames){
  assert.equal(frame.selected,baseline.selected,"保存不能改变图表选日");
  assert.equal(frame.overlay,false,"行内确认不能触发全屏等待");
  scroll=Math.max(scroll,Math.abs(frame.scroll-baseline.scroll));
  assert.equal(frame.anchors.length,baseline.anchors.length);
  frame.anchors.forEach((anchor,index)=>{
   const before=baseline.anchors[index];assert.equal(anchor.key,before.key);
   for(const key of ["x","y","width","height"])deviation=Math.max(deviation,Math.abs(anchor[key]-before[key]));
  });
 }
 assert.ok(deviation<=1,"正常保存的布局偏差 "+deviation+"px");
 assert.ok(scroll<=1,"保存引起滚动 "+scroll+"px");
 return{frames:frames.length,deviation,scroll,selected:baseline.selected};
}
async function shot(page,artifacts,name){
 const path=join(artifacts,name+".png");await page.screenshot({path,fullPage:true});return path;
}
function operation(request){
 const found=/"operationId"\s*:\s*"([^"]+)"/.exec(request.body??"");
 assert.ok(found,"Server Action 请求应包含幂等标识");return found[1];
}
function assertUnique(dates){assert.equal(dates.length,new Set(dates).size,"最近与历史不能重复日期");}
async function datesOnPage(page){return page.locator("[data-record-date]").evaluateAll(rows=>rows.map(node=>node.dataset.recordDate));}
async function geometry(page,date){
 return control(page,date).evaluate(button=>{
  const box=button.getBoundingClientRect(),article=button.closest("article"),time=article.querySelector("time").getBoundingClientRect();
  const actions=[...article.querySelectorAll("[data-record-actions] button")].map(node=>node.getBoundingClientRect());
  return{width:box.width,height:box.height,timeWidth:time.width,overflow:document.documentElement.scrollWidth-innerWidth,actions:actions.map(box=>({x:box.x,right:box.right,width:box.width,height:box.height})),color:getComputedStyle(button).color,muted:getComputedStyle(document.documentElement).getPropertyValue("--muted").trim(),label:button.textContent.trim()};
 });
}

/** 真实 Server Action + 隔离事务；不读取或写入任何正式账号。 */
export async function checkMealDayInline({browser,baseURL,fixture,db,artifacts}){
 await mkdir(artifacts,{recursive:true});
 const report={baseURL,engine:browser.browserType().name(),steps:[],matrix:[],screens:[],unmeasured:["真实 iOS／Android 设备与系统软键盘"]};
 const day=async date=>dailyTotals((await readMealSnapshot(db,fixture.userId,[date])).meals)[0]?.day;
 const audit=async date=>(await db.select().from(mealDayEvent).where(and(eq(mealDayEvent.userId,fixture.userId),eq(mealDayEvent.date,date)))).length;
 const mark=async(date,status)=>{const current=await day(date);assert.ok(current);await setMealDayStatus(db,fixture.userId,{date,status,version:current.version,contentDigest:current.contentDigest,operationId:randomUUID()});};
 const yesterday=addCalendarDays(fixture.today,-1),historyDate=addCalendarDays(fixture.today,-3);
 await mark(yesterday,"incomplete");await mark(fixture.today,"incomplete");await mark(historyDate,"complete");
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce"});
 await context.addInitScript(()=>localStorage.setItem("formward-theme","dark"));
 assert.equal((await context.request.post(baseURL+"/api/auth/sign-in/email",{headers:{Origin:baseURL},data:fixture.account})).status(),200);
 const storageState=await context.storageState();
 const page=await context.newPage();page.setDefaultTimeout(15000);
 const errorTracker=trackPageErrors(page);
 const requests=[];let nextAction=null;
 await page.route("**/dashboard/meals*",async route=>{
  const request=route.request();
  if(!actionRequest(request)){await route.continue();return;}
  requests.push({body:request.postData()});
  const handler=nextAction;nextAction=null;
  if(handler)await handler(route);else await route.continue();
 });
 const hold=()=>{
  let release,seen;
  const gate=new Promise(resolve=>{release=resolve;}),arrived=new Promise(resolve=>{seen=resolve;});
  nextAction=async route=>{seen();await gate;await route.continue();};
  return{arrived,release};
 };
 const open=async()=>{errorTracker.retire();await page.goto(baseURL+"/dashboard/meals");await settled(page);};
 const reload=async()=>{errorTracker.retire();await page.reload();await settled(page);};
 try{
  await open();
  const target=control(page,yesterday);
  assert.equal(await target.getAttribute("aria-checked"),"false");
  await target.scrollIntoViewIfNeeded();await target.focus();
  const retained=await target.elementHandle(),beforeAudit=await audit(yesterday),beforeVersion=(await day(yesterday)).version;
  const beforeDates=await datesOnPage(page),beforeRequests=requests.length,gate=hold();
  await startFrames(page,yesterday);
  await target.click();await gate.arrived;
  assert.equal(await target.getAttribute("aria-busy"),"true");
  assert.equal(await target.getAttribute("aria-disabled"),"true");
  assert.equal(await target.getAttribute("aria-checked"),"false","收到成功响应前不能假装已保存");
  await target.evaluate(button=>{button.click();button.click();});
  await pause(220);
  assert.equal(requests.length,beforeRequests+1,"连续点击仅提交一次");
  report.screens.push(await shot(page,artifacts,"desktop-saving"));
  gate.release();await checked(page,yesterday,true);
  assert.equal(await retained.evaluate(button=>button.isConnected&&button===document.activeElement),true,"原控件保留且焦点不丢失");
  assert.deepEqual(await datesOnPage(page),beforeDates,"完成后留在原位");
  assert.equal(await audit(yesterday),beforeAudit+1);assert.equal((await day(yesterday)).version,beforeVersion+1);
  report.steps.push({name:"慢速保存／连续点击／焦点／默认选日",...await endFrames(page,artifacts,"desktop-save")});
  const completedColor=await target.evaluate(button=>getComputedStyle(button).color);
  const mutedColor=await page.evaluate(()=>{const node=document.createElement("span");node.style.color="var(--muted)";document.body.append(node);const color=getComputedStyle(node).color;node.remove();return color;});
  assert.equal(completedColor,mutedColor,"完成后的文字使用次级颜色");
  report.screens.push(await shot(page,artifacts,"desktop-completed"));
  await target.press("Space");await checked(page,yesterday,false);
  await target.press("Enter");await checked(page,yesterday,true);
  report.steps.push({name:"键盘 Space 取消／Enter 勾选",pass:true});
  await reload();
  assert.equal(await row(page,yesterday).count(),0,"刷新后完成日期归入尚未展开的历史");
  await page.locator("[data-history-toggle]").click();
  assert.equal(await row(page,yesterday).locator("xpath=ancestor::*[@data-record-history]").count(),1);
  await control(page,yesterday).click();await checked(page,yesterday,false);
  assert.equal(await row(page,yesterday).locator("xpath=ancestor::*[@data-record-history]").count(),1,"历史中取消不会立即移走日期");
  assertUnique(await datesOnPage(page));
  report.screens.push(await shot(page,artifacts,"history-unchecked"));
  await reload();
  assert.equal(await row(page,yesterday).locator("xpath=ancestor::*[@data-record-history]").count(),0);
  assert.equal(await control(page,yesterday).getAttribute("aria-checked"),"false");
  report.steps.push({name:"原位保留／刷新分类／历史不重复",pass:true});

  const beforeFailure=await audit(yesterday),failureIndex=requests.length;
  nextAction=route=>route.abort("failed");
  await control(page,yesterday).click();
  await row(page,yesterday).getByRole("alert").waitFor();
  assert.equal(await control(page,yesterday).getAttribute("aria-checked"),"false");
  assert.equal(await audit(yesterday),beforeFailure);
  assert.equal(await row(page,yesterday).getByRole("alert").count(),1);
  report.screens.push(await shot(page,artifacts,"network-failure"));
  await control(page,yesterday).click();await checked(page,yesterday,true);
  assert.equal(operation(requests[failureIndex]),operation(requests[failureIndex+1]),"失败重试复用请求标识");
  assert.equal(await row(page,yesterday).getByRole("alert").count(),0);
  assert.equal(await audit(yesterday),beforeFailure+1);
  report.steps.push({name:"网络失败原状态／行内错误／原请求重试",pass:true});

  await control(page,yesterday).click();await checked(page,yesterday,false);
  const lostIndex=requests.length,lostAudit=await audit(yesterday);
  nextAction=async route=>{const response=await route.fetch();assert.equal(response.status(),200);await response.body();await route.abort("failed");};
  await control(page,yesterday).click();await row(page,yesterday).getByRole("alert").waitFor();
  assert.equal(await control(page,yesterday).getAttribute("aria-checked"),"false");
  assert.equal((await day(yesterday)).status,"complete","响应丢失但事务确实已提交");
  assert.equal(await audit(yesterday),lostAudit+1);
  const lostVersion=(await day(yesterday)).version;
  await control(page,yesterday).click();await checked(page,yesterday,true);
  assert.equal(operation(requests[lostIndex]),operation(requests[lostIndex+1]));
  assert.equal(await audit(yesterday),lostAudit+1,"响应丢失重试不增加审计");
  assert.equal((await day(yesterday)).version,lostVersion);
  report.steps.push({name:"已提交但响应丢失／幂等重试",pass:true});

  const conflictGate=hold(),conflictAudit=await audit(fixture.today);
  await control(page,fixture.today).click();await conflictGate.arrived;
  await mark(fixture.today,"incomplete");conflictGate.release();
  const conflict=row(page,fixture.today).getByRole("alert");await conflict.waitFor();
  assert.match(await conflict.textContent(),/已改变|刷新/);
  assert.equal(await control(page,fixture.today).getAttribute("aria-checked"),"false");
  assert.equal(await audit(fixture.today),conflictAudit+1,"过期请求不能新增审计或覆盖状态");
  report.screens.push(await shot(page,artifacts,"version-conflict"));
  await reload();
  await control(page,fixture.today).click();await checked(page,fixture.today,true);
  await reload();
  assert.equal(await control(page,fixture.today).getAttribute("aria-checked"),"true");
  report.steps.push({name:"版本冲突保留原状态／刷新重试／持久化",pass:true});

  await row(page,fixture.today).getByRole("button",{name:"查看",exact:true}).click();
  const dialog=page.locator("dialog[open]");await dialog.waitFor();
  assert.equal(await dialog.getByRole("checkbox").count(),0,"只读详情保留静态状态");
  assert.match(await dialog.textContent(),/已记全/);
  await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});
  await row(page,fixture.today).getByRole("button",{name:"编辑",exact:true}).click();
  await page.locator("dialog[open] [data-meal-day-actions]").waitFor();
  await page.locator("dialog[open] [data-meal-day-actions]").getByRole("checkbox").click();
  await checked(page,fixture.today,false);
  await page.keyboard.press("Escape");await page.locator("dialog[open]").waitFor({state:"hidden"});
  report.steps.push({name:"查看仅状态／编辑继续共用控件",pass:true});
  await page.locator("[data-history-toggle]").click();
  assert.match(await row(page,addCalendarDays(fixture.today,-5)).textContent(),/0 kcal/);
  assert.equal(await control(page,addCalendarDays(fixture.today,-5)).getAttribute("aria-checked"),"true");
  assert.ok(!(await row(page,addCalendarDays(fixture.today,-6)).textContent()).includes("0 kcal"),"营养未知不能变成0");
  assertUnique(await datesOnPage(page));
  report.steps.push({name:"明确0／营养未知／历史控件",pass:true});
  await page.getByRole("button",{name:"7D",exact:true}).click();
  await page.locator('[data-chart-date="'+historyDate+'"]').click();
  await control(page,fixture.today).evaluate(button=>button.scrollIntoView({block:"center",behavior:"instant"}));
  await startFrames(page,fixture.today);
  await control(page,fixture.today).click();await checked(page,fixture.today,true);
  assert.equal(await page.locator("[data-chart-selection]").getAttribute("data-selected-date"),historyDate);
  assert.equal(await page.getByRole("button",{name:"7D",exact:true}).getAttribute("aria-pressed"),"true");
  report.steps.push({name:"明确图表选日和7D区间保持",...await endFrames(page,artifacts,"explicit-chart-selection")});
  await control(page,fixture.today).click();await checked(page,fixture.today,false);
  await page.getByRole("button",{name:"自定义",exact:true}).click();
  await page.getByLabel("饮食开始日期").fill(addCalendarDays(fixture.today,-4));
  await page.getByLabel("饮食结束日期").fill(fixture.today);
  await page.getByRole("button",{name:"应用",exact:true}).click();
  await page.locator('[data-chart-date="'+historyDate+'"]').click();
  await control(page,fixture.today).evaluate(button=>button.scrollIntoView({block:"center",behavior:"instant"}));
  await startFrames(page,fixture.today);
  await control(page,fixture.today).click();await checked(page,fixture.today,true);
  assert.equal(await page.locator("[data-chart-selection]").getAttribute("data-selected-date"),historyDate);
  assert.equal(await page.locator("[data-chart-date]").count(),5,"自定义区间不随记全变化");
  assert.equal(await page.getByRole("button",{name:"自定义",exact:true}).getAttribute("aria-pressed"),"true");
  report.steps.push({name:"自定义区间和选日保持",...await endFrames(page,artifacts,"custom-chart-selection")});
  await control(page,fixture.today).click();await checked(page,fixture.today,false);
  report.navigationCancellations=errorTracker.verify().expected;
  assert.deepEqual(errorTracker.verify().unexpected,[]);

  const sizes=[[320,560],[390,640],[430,780],[844,390],[1100,850],[1440,1000]];
  for(const theme of ["dark","light"])for(const[width,height]of sizes){
   const mobile=width<900;
   const matrixContext=await browser.newContext({storageState,viewport:{width,height},isMobile:mobile,hasTouch:mobile,reducedMotion:"reduce"});
   await matrixContext.addInitScript(theme=>localStorage.setItem("formward-theme",theme),theme);
   const matrixPage=await matrixContext.newPage();
   const errors=[];matrixPage.on("pageerror",error=>errors.push(error.message));
   try{
    await matrixPage.goto(baseURL+"/dashboard/meals");await settled(matrixPage);
    const button=control(matrixPage,fixture.today);
    await button.evaluate(button=>button.scrollIntoView({block:"center",behavior:"instant"}));
    await matrixPage.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    const details=await geometry(matrixPage,fixture.today);
    assert.ok(details.width>=44&&details.height>=44);
    assert.ok(details.timeWidth>90,"日期仍有可用宽度");
    assert.ok(details.overflow<=1,"不产生横向溢出");
    assert.ok(details.actions.every(box=>box.height>=44&&box.right<=width+1));
    const key=theme+"-"+width+"x"+height;
    await startFrames(matrixPage,fixture.today);
    if(mobile)await button.tap();else await button.click();
    await checked(matrixPage,fixture.today,true);
    const stability=await endFrames(matrixPage,artifacts,key);
    report.screens.push(await shot(matrixPage,artifacts,key));
    report.matrix.push({theme,width,height,control:details,...stability,pass:true});
    if(mobile)await button.tap();else await button.click();
    await checked(matrixPage,fixture.today,false);
    if(width===390&&theme==="dark"){
     let failOnce=true;
     await matrixPage.route("**/dashboard/meals*",async route=>{
      if(actionRequest(route.request())&&failOnce){failOnce=false;await route.abort("failed");}
      else await route.continue();
     });
     await button.tap();await row(matrixPage,fixture.today).getByRole("alert").waitFor();
     assert.equal(await button.getAttribute("aria-checked"),"false");
     assert.ok((await geometry(matrixPage,fixture.today)).overflow<=1);
     report.screens.push(await shot(matrixPage,artifacts,"mobile-network-failure"));
     await button.tap();await checked(matrixPage,fixture.today,true);
     assert.equal(await row(matrixPage,fixture.today).getByRole("alert").count(),0);
     await button.tap();await checked(matrixPage,fixture.today,false);
     report.steps.push({name:"手机触屏断网／原位错误／重试",pass:true});
    }
    if(width===430&&theme==="light"){
     let release;
     const gate=new Promise(resolve=>{release=resolve;});
     await matrixPage.route("**/dashboard/meals*",async route=>{
      if(actionRequest(route.request()))await gate;
      await route.continue();
     });
     await button.evaluate(button=>button.scrollIntoView({block:"center",behavior:"instant"}));
     await startFrames(matrixPage,fixture.today);
     await button.tap();
     assert.equal(await button.getAttribute("aria-busy"),"true");
     assert.equal(await button.getAttribute("aria-checked"),"false");
     await pause(350);
     report.screens.push(await shot(matrixPage,artifacts,"mobile-saving"));
     release();await checked(matrixPage,fixture.today,true);
     report.steps.push({name:"手机慢速保存",...await endFrames(matrixPage,artifacts,"mobile-slow-save")});
     await button.tap();await checked(matrixPage,fixture.today,false);
    }
    assert.deepEqual(errors,[]);
   }finally{await matrixContext.close();}
  }
  // 独立空账号：空日期不挂载任何写入控件，也不混入上一账号日期。
  const empty=await browser.newContext({viewport:{width:390,height:640},isMobile:true,hasTouch:true});
  try{
   const account=fixture.other??{email:"assistant-empty@example.test",password:"formward-assistant-empty"};
   assert.equal((await empty.request.post(baseURL+"/api/auth/sign-in/email",{headers:{Origin:baseURL},data:{email:account.email,password:account.password}})).status(),200);
   const emptyPage=await empty.newPage();await emptyPage.goto(baseURL+"/dashboard/meals");await settled(emptyPage);
   assert.equal(await emptyPage.getByRole("checkbox").count(),0);
   assert.match(await row(emptyPage,fixture.today).textContent(),/尚无记录/);
   report.screens.push(await shot(emptyPage,artifacts,"mobile-empty-account"));
   report.steps.push({name:"空餐日无勾选／账号隔离",pass:true});
  }finally{await empty.close();}
  report.pass=true;
 }catch(error){
  report.failure=error.stack??String(error);report.pageErrors=errorTracker.verify();
  report.screens.push(await shot(page,artifacts,"failure").catch(()=>null));
  throw error;
 }finally{
  await writeFile(join(artifacts,"results.json"),JSON.stringify(report,null,2));
  await context.close();
 }
}
