import assert from"node:assert/strict";import{mkdir,writeFile}from"node:fs/promises";import{addCalendarDays}from"../src/features/measurements/calendar.ts";
export async function checkDetailHierarchy({browser,storageState,baseURL,today,engine,artifacts,sizes=[[320,560],[390,720],[430,780],[390,560],[844,390],[1100,900],[1440,900]]}){
 await mkdir(artifacts,{recursive:true});const cases=[],errors=[],serverErrors=[];
 for(const theme of["dark","light"])for(const[width,height]of sizes){
  const context=await browser.newContext({storageState,viewport:{width,height},locale:"zh-CN",timezoneId:"Asia/Shanghai",isMobile:width<1000,hasTouch:width<1000,reducedMotion:"reduce"});await context.addInitScript(t=>localStorage.setItem("formward-theme",t),theme);const page=await context.newPage();page.setDefaultTimeout(20000);page.on("pageerror",e=>errors.push(e.message));page.on("response",r=>{if(r.status()>=500)serverErrors.push({status:r.status(),path:new URL(r.url()).pathname});});
  try{for(const[surface,date]of[["meals",today],["energy",addCalendarDays(today,-1)]]){
   await page.goto(baseURL+"/dashboard/"+surface+"?date="+date);await page.waitForLoadState("networkidle");if(surface==="energy")await page.getByRole("button",{name:"查看记录 →",exact:true}).click();const drawer=page.locator("dialog[open]:not(.page-loading-dialog)").last();await drawer.waitFor();await page.evaluate(()=>document.fonts.ready);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"页面不横向溢出");assert.ok(await drawer.evaluate(n=>n.scrollWidth<=n.clientWidth+1),"详情本身不横向溢出");
   let geometry;
   if(surface==="meals"){
    const summary=drawer.locator("[data-day-nutrition-summary]"),list=drawer.locator("[data-meal-day-list]");assert.equal(await summary.getByText("当天合计",{exact:true}).count(),1);const text=await drawer.innerText();assert.ok(!/这一天的饮食有修改|请重新确认|已记录营养构成|营养供能占比/.test(text),"查看详情不再重复解释或催确认");
    const values=await summary.locator("strong").allTextContents();assert.ok(values[0].replace(/\s/g,"").startsWith("1190"));assert.equal(await list.locator(":scope > details").count(),1);assert.ok((await list.innerText()).includes("1190"));
    geometry=await list.evaluate(n=>{const row=n.querySelector(":scope>details"),trigger=row.querySelector(":scope>summary"),s=getComputedStyle(n),r=getComputedStyle(row),t=getComputedStyle(trigger),b=trigger.getBoundingClientRect();return {border:s.borderTopWidth,borderStyle:s.borderTopStyle,vertical:s.borderInlineStartWidth,rowTop:r.paddingTop,rowBottom:r.paddingBottom,triggerTop:t.paddingTop,triggerBottom:t.paddingBottom,hitHeight:b.height};});
    assert.equal(geometry.border,"1px");assert.equal(geometry.borderStyle,"solid");assert.equal(geometry.vertical,"0px");assert.equal(geometry.rowTop,"12px");assert.equal(geometry.rowBottom,"12px");assert.equal(geometry.triggerTop,"0px");assert.equal(geometry.triggerBottom,"0px");assert.ok(geometry.hitHeight>=44);
    const preview=await list.locator("[data-meal-preview]").evaluate(n=>({height:n.getBoundingClientRect().height,line:parseFloat(getComputedStyle(n).lineHeight),overflow:getComputedStyle(n).textOverflow,whiteSpace:getComputedStyle(n).whiteSpace}));
    assert.ok(preview.height<=preview.line+1,"收起摘要最多一行");assert.equal(preview.overflow,"ellipsis");assert.equal(preview.whiteSpace,"nowrap");
    const metricBoxes=await summary.locator("strong").evaluateAll(ns=>ns.map(n=>{const b=n.getBoundingClientRect();return {bottom:b.bottom,right:b.right,left:b.left};}));assert.ok(Math.max(...metricBoxes.map(b=>b.bottom))-Math.min(...metricBoxes.map(b=>b.bottom))<=8,"普通营养四项同排");
    const footer=drawer.locator("[data-meal-day-actions]"),add=footer.getByRole("button",{name:"添加一餐",exact:true}),complete=footer.getByRole("checkbox",{name:/已记全$/});const ab=await add.boundingBox(),cb=await complete.boundingBox();assert.ok(ab.height>=44&&cb.height>=44);assert.ok(ab.x<cb.x);assert.equal(await complete.getAttribute("aria-checked"),"false");
   }else{
    const detail=drawer.locator("[data-energy-day-detail]");assert.equal(await drawer.locator("h2").count(),1);assert.equal((await drawer.locator("h2").innerText()).split(date).length-1,1);assert.ok(!(await detail.innerText()).includes(date.replaceAll("-",".")),"日期只在标题出现");
    geometry=await detail.locator(":scope>div").first().evaluate(n=>{const s=getComputedStyle(n),values=[...n.querySelectorAll("strong")];return {paddingTop:s.paddingTop,paddingBottom:s.paddingBottom,values:values.map(v=>{const style=getComputedStyle(v),b=v.getBoundingClientRect(),unit=v.querySelector("small"),u=unit.getBoundingClientRect();return {marginTop:style.marginTop,marginBottom:style.marginBottom,lineHeight:parseFloat(style.lineHeight),font:parseFloat(style.fontSize),display:getComputedStyle(unit).display,top:b.top,bottom:b.bottom,unitTop:u.top,unitBottom:u.bottom};})};});
    assert.equal(geometry.paddingTop,"12px");assert.equal(geometry.paddingBottom,"12px");assert.equal(geometry.values.length,3);
    for(const v of geometry.values){assert.equal(v.marginTop,"4px");assert.equal(v.marginBottom,"0px");assert.ok(Math.abs(v.lineHeight/v.font-1.2)<.03);assert.notEqual(v.display,"block");assert.ok(v.unitTop>=v.top-1&&v.unitBottom<=v.bottom+1,"单位与数字同行");}
    assert.ok(Math.max(...geometry.values.map(v=>v.top))-Math.min(...geometry.values.map(v=>v.top))<=1,"普通消耗三项同排");
    assert.ok((await detail.innerText()).includes("3415"));assert.ok((await detail.innerText()).includes("851"));assert.ok((await detail.innerText()).includes("741"));assert.equal(await detail.locator("[data-exercise-status]").innerText(),"已含在活动合计");
    assert.equal(await detail.locator("[data-exercise-effect]").count(),0,"完整说明只在展开后挂载");
    assert.equal(await detail.getByRole("button",{name:"删除活动",exact:true}).count(),0,"删除不常驻");
   }
   await page.screenshot({path:artifacts+"/"+engine+"-"+theme+"-"+surface+"-"+width+"x"+height+".png"});
   if(width===1440||width===390&&height===720)await drawer.screenshot({path:artifacts+"/"+engine+"-"+theme+"-"+surface+"-drawer-"+width+".png"});
   if(surface==="meals"&&theme==="dark"&&(width===1440||width===390&&height===720)){
    const row=drawer.locator("[data-meal-day-list]>details").first(),trigger=row.locator(":scope>summary");await trigger.click();await row.getByRole("button",{name:"编辑",exact:true}).waitFor();
    assert.ok(await trigger.evaluate(n=>getComputedStyle(n,"::after").content.includes("−")),"展开标记跟随实际展开状态");await page.screenshot({path:artifacts+"/"+engine+"-meals-open-"+width+".png"});await trigger.click();await row.getByRole("button",{name:"编辑",exact:true}).waitFor({state:"hidden"});
   }
   cases.push({surface,theme,width,height,geometry,passed:true});
  }}catch(e){await page.screenshot({path:artifacts+"/"+engine+"-failure.png",fullPage:true});throw e;}finally{await context.close();}
 }
 const ctx=await browser.newContext({storageState,viewport:{width:390,height:720},locale:"zh-CN",timezoneId:"Asia/Shanghai",hasTouch:true,isMobile:true,reducedMotion:"reduce"}),p=await ctx.newPage();p.setDefaultTimeout(20000);const extras=[];
 try{
  for(const[offset,expected]of[[-1,"known"],[-2,"unknown"],[-5,"zero"],[-6,"unknown"],[-7,"known"]]){
   await p.goto(baseURL+"/dashboard/meals?date="+addCalendarDays(today,offset));await p.waitForLoadState("networkidle");const d=p.locator("dialog[open]:not(.page-loading-dialog)").last();await d.waitFor();assert.equal(await d.locator("[data-day-nutrition-summary] [data-nutrition-composition]").getAttribute("data-nutrition-composition"),expected);
   if(expected!=="known"){assert.equal(await d.locator("[data-day-nutrition-summary] [data-macro-share]").count(),0);assert.ok((await d.innerText()).includes(expected==="zero"?"零供能":"营养未齐"));}
   assert.ok(await d.evaluate(n=>n.scrollWidth<=n.clientWidth+1),"长营养值整项退让，不撑宽详情");
   if(offset===-1)assert.equal(await d.locator("[data-meal-day-list]>details").count(),2);
   await p.screenshot({path:artifacts+"/"+engine+"-state-meals-"+(-offset)+".png"});extras.push({surface:"meals",offset,expected,passed:true});
  }
  for(const[offset,content]of[[-2,"2200"],[-3,"0"],[-4,"300"],[-7,"99998"]]){
   await p.goto(baseURL+"/dashboard/energy?date="+addCalendarDays(today,offset));await p.waitForLoadState("networkidle");await p.locator('[data-energy-date="'+addCalendarDays(today,offset)+'"]').focus();await p.keyboard.press("Enter");await p.getByRole("button",{name:"查看记录 →",exact:true}).click();const d=p.locator("[data-energy-day-detail]");assert.ok(await d.evaluate(n=>n.scrollWidth<=n.clientWidth+1),"长消耗值不撑宽详情");assert.ok((await d.innerText()).includes(content),"所选日应显示 "+content+"；"+await d.innerText());assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:artifacts+"/"+engine+"-state-energy-"+(-offset)+".png"});extras.push({surface:"energy",offset,passed:true});
  }
  for(const[offset,status,total]of[[-8,"额外增加 741 kcal","4156"],[-9,"按运动明细累计","2799"],[-10,"运动热量未知",null]]){
   const date=addCalendarDays(today,offset);await p.goto(baseURL+"/dashboard/energy?date="+date);await p.waitForLoadState("networkidle");await p.locator('[data-energy-date="'+date+'"]').focus();await p.keyboard.press("Enter");await p.getByRole("button",{name:"查看记录 →",exact:true}).click();
   const d=p.locator("[data-energy-day-detail]");assert.equal(await d.locator("[data-exercise-status]").innerText(),status);if(total)assert.ok((await d.locator(":scope>div:first-child strong").first().innerText()).includes(total));
   assert.equal(await d.locator("[data-exercise-effect]").count(),0);await p.screenshot({path:artifacts+"/"+engine+"-state-exercise-"+(-offset)+".png"});extras.push({surface:"exercise",offset,status,passed:true});
  }
 }finally{await ctx.close();}
 assert.deepEqual(errors,[]);assert.deepEqual(serverErrors,[]);await writeFile(artifacts+"/"+engine+"-detail-checks.json",JSON.stringify({cases,extras,errors,serverErrors},null,2));return {cases:cases.length,extras:extras.length,passed:true};
}

export async function checkDetailActions({page,baseURL,today,artifacts,engine}){
 const errors=[],serverErrors=[];page.on("pageerror",e=>errors.push(e.message));page.on("response",r=>{if(r.status()>=500)serverErrors.push(r.status());});
 const go=async()=>{await page.goto(baseURL+"/dashboard/meals?date="+today);await page.waitForLoadState("networkidle");await page.locator("[data-meal-day-actions]").waitFor();};
 const drawer=()=>page.locator("dialog[open]:not(.page-loading-dialog)").last(),control=()=>drawer().locator("[data-meal-day-actions]").getByRole("checkbox",{name:/已记全$/});
 await go();assert.equal(await control().getAttribute("aria-checked"),"false");
 await drawer().getByRole("button",{name:"添加一餐",exact:true}).click();await page.locator('form[data-entry-form="meal"]').waitFor();await page.keyboard.press("Escape");await page.locator('form[data-entry-form="meal"]').waitFor({state:"hidden"});assert.equal(await control().getAttribute("aria-checked"),"false");
 await control().click();await page.waitForFunction(()=>document.querySelector("[data-meal-day-actions] [role=checkbox]")?.getAttribute("aria-checked")==="true");
 const edit=async value=>{
  const row=drawer().locator("[data-meal-day-list]>details").first();if(await row.getAttribute("open")===null)await row.locator(":scope>summary").click();await row.getByRole("button",{name:"编辑",exact:true}).click();const form=page.locator('form[data-entry-form="meal"]');await form.waitFor();const name=form.getByRole("textbox",{name:/^(自由填写食物名称|食物名称 1)$/}).first(),original=await name.inputValue();await name.fill(value??original+" · 修改验收");await form.getByRole("button",{name:"保存餐次 · "+today,exact:true}).click();await form.waitFor({state:"hidden"});return original;
 };
 const original=await edit();await page.waitForFunction(()=>document.querySelector("[data-meal-day-actions] [role=checkbox]")?.getAttribute("aria-checked")==="false");
 assert.ok(!(await page.locator("body").innerText()).includes("请重新确认"),"保存成功不重复追加催确认");assert.ok((await drawer().locator("[data-day-nutrition-summary] strong").first().innerText()).includes("1190"));await edit(original);await go();assert.equal(await control().getAttribute("aria-checked"),"false");
 const row=drawer().locator("[data-meal-day-list]>details").first();if(await row.getAttribute("open")!==null)await row.locator(":scope>summary").click();await row.locator(":scope>summary").focus();await page.keyboard.press("Enter");await row.getByRole("button",{name:"编辑",exact:true}).waitFor();await page.keyboard.press("Escape");await page.locator("dialog[open]:not(.page-loading-dialog)").waitFor({state:"hidden"});
 assert.deepEqual(errors,[]);assert.deepEqual(serverErrors,[]);
 await writeFile(artifacts+"/"+engine+"-detail-actions.json",JSON.stringify({passed:true,emptyAddCloses:true,explicitCompletionSaved:true,editingInvalidatesCompletion:true,caloriesRemain1190:true,noRepeatedPrompt:true,keyboardAndEscape:true},null,2));
 return {passed:true};
}


/** 验证摘要与展开内容、更多菜单和删除取消，不能靠裁切隐藏真实字段。 */
export async function checkDetailDisclosure({page,baseURL,today,artifacts,engine}){
 const errors=[];page.on("pageerror",e=>errors.push(e.message));const results=[];
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:width===1440?900:720});
  for(const surface of ["meals","energy"]){
   const date=surface==="meals"?today:addCalendarDays(today,-1);
   await page.goto(baseURL+"/dashboard/"+surface+"?date="+date);await page.waitForLoadState("networkidle");
   if(surface==="energy"){await page.locator('[data-energy-date="'+date+'"]').focus();await page.keyboard.press("Enter");await page.getByRole("button",{name:"查看记录 →",exact:true}).click();}
   const drawer=page.locator("dialog[open]:not(.page-loading-dialog)").last();await drawer.waitFor();
   const row=surface==="meals"?drawer.locator("[data-meal-day-list]>details").first():drawer.locator("details").filter({has:page.locator("[data-exercise-summary]")}).first();
   const trigger=row.locator(":scope>summary");assert.equal(await row.getAttribute("open"),null);
   assert.equal(await row.locator("[data-record-detail-actions]").count(),0);
   if(surface==="meals"){const preview=row.locator("[data-meal-preview]");assert.ok((await preview.textContent()).includes("炖土豆"));assert.ok(await preview.evaluate(n=>n.scrollWidth>n.clientWidth),"长食物名需单行省略");}
   else{assert.equal(await row.locator("[data-exercise-status]").innerText(),"已含在活动合计");assert.ok(!(await row.innerText()).includes("1357"),"顶部总数不在收起行重复解释");}
   await trigger.focus();await page.keyboard.press("Enter");
   const actions=row.locator("[data-record-detail-actions]");await actions.waitFor();assert.equal(await row.getByRole("button",{name:surface==="meals"?"删除":"删除活动",exact:true}).isVisible(),false);
   if(surface==="meals")assert.ok((await row.innerText()).includes("炖土豆"),"完整食物展开后仍可读");
   else{assert.ok((await row.locator("[data-exercise-effect]").innerText()).includes("1357 千卡中，本次不再额外增加"));assert.ok((await row.locator("[data-exercise-explanation]").innerText()).includes("60 分钟"));}
   assert.ok(await drawer.evaluate(n=>n.scrollWidth<=n.clientWidth+1));
   await page.screenshot({path:artifacts+"/"+engine+"-"+surface+"-expanded-"+width+".png"});
   const more=actions.locator("details"),moreTrigger=more.locator("summary");
   await moreTrigger.click();const remove=more.getByRole("button",{name:surface==="meals"?"删除":"删除活动",exact:true});await remove.waitFor({state:"visible"});assert.ok((await remove.boundingBox()).height>=44);
   await page.keyboard.press("Escape");assert.equal(await more.getAttribute("open"),null);assert.ok(await drawer.isVisible(),"Escape先关闭更多菜单");assert.ok(await moreTrigger.evaluate(n=>document.activeElement===n),"关闭菜单回到触发焦点");
   await moreTrigger.click();await trigger.click();await actions.waitFor({state:"detached"});assert.equal(await row.locator("[data-record-detail-actions]").count(),0,"收起记录同时清理更多菜单");await trigger.click();await actions.waitFor();
   await moreTrigger.click();await remove.click();const confirm=page.getByRole("dialog").last();assert.ok((await confirm.innerText()).includes("删除"));await confirm.getByRole("button",{name:/取消|继续保留/}).click();assert.ok(await row.isVisible());assert.ok(await drawer.isVisible());
   await trigger.click();assert.equal(await row.getAttribute("open"),null);await actions.waitFor({state:"detached"});assert.equal(await row.locator("[data-record-detail-actions]").count(),0);await page.keyboard.press("Escape");await drawer.waitFor({state:"hidden"});
   results.push({surface,width,summaryAndDetails:true,fullFactsRetained:true,menuEscapeAndOutside:true,deleteCancelled:true});
  }
 }
 assert.deepEqual(errors,[]);await writeFile(artifacts+"/"+engine+"-disclosure.json",JSON.stringify({passed:true,results,errors},null,2));return {passed:true,cases:results.length};
}

export async function checkDetailScale({page,baseURL,today,artifacts,engine}){
 await page.setViewportSize({width:320,height:560});
 const show=async(surface,date)=>{await page.goto(baseURL+"/dashboard/"+surface+"?date="+date);await page.waitForLoadState("networkidle");if(surface==="energy"){await page.locator('[data-energy-date="'+date+'"]').focus();await page.keyboard.press("Enter");await page.getByRole("button",{name:"查看记录 →",exact:true}).click();}const d=page.locator("dialog[open]:not(.page-loading-dialog)").last();await d.waitFor();return d;};
 for(const surface of["meals","energy"]){
  const d=await show(surface,addCalendarDays(today,-7));assert.ok(await d.evaluate(n=>n.scrollWidth<=n.clientWidth+1),"320px长值完整、不撑宽详情");
  const top=await d.locator(surface==="meals"?"[data-day-nutrition-summary] strong":"[data-energy-day-detail]>div:first-child strong").evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().top));assert.ok(Math.max(...top)-Math.min(...top)>5,"长值应整项退让");
  await page.screenshot({path:artifacts+"/"+engine+"-long-"+surface+"-320.png"});
 }
 for(const[surface,date]of[["meals",today],["energy",addCalendarDays(today,-1)]]){
  const d=await show(surface,date);await page.addStyleTag({content:"html{zoom:2}"});const zoomGeometry=await d.evaluate(n=>({client:n.clientWidth,scroll:n.scrollWidth,overflow:[...n.querySelectorAll("*")].filter(e=>e.scrollWidth>e.clientWidth+1&&e.clientWidth>0).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,client:e.clientWidth,scroll:e.scrollWidth,min:getComputedStyle(e).minWidth}))}));if(zoomGeometry.scroll>zoomGeometry.client+1)await page.screenshot({path:artifacts+"/"+engine+"-zoom-failure-"+surface+".png"});assert.ok(zoomGeometry.scroll<=zoomGeometry.client+1,"200% "+surface+" "+JSON.stringify(zoomGeometry));
  const target=surface==="meals"?d.getByRole("checkbox",{name:/已记全$/}):d.getByRole("button",{name:"添加活动",exact:true});await target.scrollIntoViewIfNeeded();assert.ok(await target.isVisible());await page.screenshot({path:artifacts+"/"+engine+"-zoom-"+surface+".png"});await page.keyboard.press("Escape");await d.waitFor({state:"hidden"});
 }
 await writeFile(artifacts+"/"+engine+"-detail-scale.json",JSON.stringify({passed:true,longMetricsWrap:true,zoom200ControlsReachable:true,realDeviceTextScaling:"未测"},null,2));return {passed:true};
}

async function runInIsolation(){
 const [{PGlite},{PGLiteSocketServer},{drizzle},{migrate},schema,{provisionAccount},{eq},{seedDetailHierarchy},{spawn},{createServer},{once},{resolve}]=await Promise.all([
  import("@electric-sql/pglite"),import("@electric-sql/pglite-socket"),import("drizzle-orm/pglite"),import("drizzle-orm/pglite/migrator"),import("../src/db/schema.ts"),import("../src/features/auth/provision.ts"),import("drizzle-orm"),import("./detail-hierarchy-fixture.mjs"),import("node:child_process"),import("node:net"),import("node:events"),import("node:path")
 ]);
 const pg=new PGlite(),db=drizzle(pg,{schema});await migrate(db,{migrationsFolder:"./drizzle"});
 const account={email:"detail-browser@example.test",password:"fictional-detail-browser"},user=await provisionAccount(db,{...account,name:"虚构详情验收"}),today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 await db.delete(schema.personalProfile).where(eq(schema.personalProfile.userId,user.id));await db.update(schema.user).set({createdAt:new Date(addCalendarDays(today,-18)+"T00:00:00Z")}).where(eq(schema.user.id,user.id));await seedDetailHierarchy(db,user.id,today);
 const socket=new PGLiteSocketServer({db:pg,host:"127.0.0.1",port:0,maxConnections:10});await socket.start();const net=createServer();net.listen(0,"127.0.0.1");await once(net,"listening");const port=net.address().port;await new Promise(r=>net.close(r));const baseURL="http://127.0.0.1:"+port;
 const app=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{env:{PATH:process.env.PATH,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH,FONTCONFIG_FILE:process.env.FONTCONFIG_FILE,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",DATABASE_URL:"postgresql://postgres:postgres@"+socket.getServerConn()+"/postgres?max=1",BETTER_AUTH_URL:baseURL,BETTER_AUTH_SECRET:"fictional-detail-browser-secret-at-least-32-characters",FORMWARD_TIMEZONE:"Asia/Shanghai"},stdio:["ignore","pipe","pipe"]});
 let log="",browser;app.stdout.on("data",b=>{log+=b});app.stderr.on("data",b=>{log+=b});const engine=process.env.FORMWARD_DETAIL_BROWSER??"chromium",artifacts=resolve(process.env.FORMWARD_DETAIL_ARTIFACTS??".codex/detail-hierarchy/"+engine);
 try{
  for(let i=0;i<100;i++){try{if((await fetch(baseURL)).ok)break;}catch{}if(i===99)throw Error("Isolated app did not start: "+log);await new Promise(r=>setTimeout(r,150));}
  const pw=await import(process.env.PLAYWRIGHT_MODULE??"/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");browser=await pw[engine].launch({headless:true,args:engine==="chromium"?["--no-sandbox"]:[]});const ctx=await browser.newContext();assert.equal((await ctx.request.post(baseURL+"/api/auth/sign-in/email",{headers:{Origin:baseURL},data:account})).status(),200);const storageState=await ctx.storageState();await ctx.close();
  console.log(engine,await checkDetailHierarchy({browser,storageState,baseURL,today,engine,artifacts}));const interaction=await browser.newContext({storageState,viewport:{width:390,height:720},isMobile:true,hasTouch:true,reducedMotion:"reduce"});console.log("scale",await checkDetailScale({page:await interaction.newPage(),baseURL,today,artifacts,engine}));console.log("disclosure",await checkDetailDisclosure({page:await interaction.newPage(),baseURL,today,artifacts,engine}));console.log("actions",await checkDetailActions({page:await interaction.newPage(),baseURL,today,artifacts,engine}));await interaction.close();
 }finally{await browser?.close();if(app.exitCode===null){app.kill("SIGTERM");await once(app,"exit");}await socket.stop();
  // pglite-socket在setImmediate中处理close回调，先排空再关闭引擎。
  await new Promise(r=>setImmediate(r));await pg.close();}
}
if(process.argv[1]&&(await import("node:url")).pathToFileURL((await import("node:path")).resolve(process.argv[1])).href===import.meta.url)await runInIsolation();
