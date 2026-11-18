import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {authenticateFixture} from './fixture-auth.mjs';

// 仅连接chat-pilot的虚构账号与回放模型；不接受公网目标或真实健康数据。
const fixture=JSON.parse(await readFile(process.env.FORMWARD_CHAT_BROWSER_CONFIG,'utf8'));
const base=process.env.FORMWARD_REFINEMENT_BASE??fixture.baseURL;
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'只接受本机隔离转发');
assert.ok(fixture.isolatedFixture,'需要隔离数据库标识');
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE);
const engine=process.env.CHAT_BROWSER??'chromium',folder=resolve(process.env.FORMWARD_CHAT_ARTIFACTS);
const version=await(await fetch(base+'/api/app-version')).json();
await mkdir(folder,{recursive:true});
const browser=await({chromium,webkit}[engine]).launch({headless:true});
const errors=[],checks=[],frames=[],screens=[];
let signedState,failure=null;
async function context(size,motion='no-preference'){
 const ctx=await browser.newContext({viewport:{width:size[0],height:size[1]},hasTouch:size[0]<1000,locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:motion,storageState:signedState,recordVideo:{dir:folder,size:{width:size[0],height:size[1]}}});
 if(!signedState){await authenticateFixture(ctx.request,fixture,process.env.FORMWARD_CHAT_BROWSER_CONFIG);signedState=await ctx.storageState();}
 const page=await ctx.newPage();await page.bringToFront();page.on('pageerror',error=>errors.push(error.message));
 if(Number(process.env.FORMWARD_REFINEMENT_DELAY)>0)await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.searchParams.has('_rsc')&&/^\/dashboard\/(meals|measurements|energy)$/.test(url.pathname))await new Promise(resolve=>setTimeout(resolve,Number(process.env.FORMWARD_REFINEMENT_DELAY)));await route.continue();});
 await page.addInitScript(({account})=>{
  localStorage.setItem('formward-assistant-seen-v1','true');
  for(const kind of ['meals','body','energy','training'])localStorage.setItem('formward:record-guide:v1:'+encodeURIComponent(account)+':'+kind,'seen');
  window.__drawFrames=[];window.__observeDrawFrames=true;
  const sample=()=>{if(!window.__observeDrawFrames)return;for(const node of document.querySelectorAll('[data-record-slot="plot"] [data-chart-bar],[data-record-slot="plot"] [data-trend-glyph="morning-weight"],[data-record-slot="plot"] [data-chart-line]'))for(const animation of node.getAnimations()){
   const timing=animation.effect?.getTiming();if(timing&&[400,600].includes(timing.duration)&&window.__drawFrames.length<200)window.__drawFrames.push({duration:timing.duration,time:animation.currentTime,kind:node.dataset.chartBar!==undefined?'bar':'line'});
  }requestAnimationFrame(sample);};requestAnimationFrame(sample);
 },{account:fixture.userId});
 return {ctx,page};
}
async function skipGuide(page){const skip=page.getByRole('button',{name:'跳过引导',exact:true});if(await skip.isVisible())await skip.click();}
async function ready(page){const selector='[data-route-content]:not([data-return-covered]):not([data-forward-covered]) [data-record-slot="plot"] svg[role="group"]';await page.locator(selector+':visible').first().waitFor();await page.waitForFunction(selector=>[...document.querySelectorAll(selector)].some(plot=>plot.getClientRects().length&&getComputedStyle(plot).visibility==='visible'&&!plot.closest('[data-workspace-reading],[inert]')),selector);await page.evaluate(()=>document.fonts.ready);await skipGuide(page);}
async function shot(page,name){const file=join(folder,engine+'-'+name+'.png');await page.screenshot({path:file});screens.push(file);}
async function recordScene(page){
 await page.evaluate(()=>{
  window.__sceneFrames=[];
  const take=()=>{
   const main=document.querySelector('.workspace-shell main:not([data-workspace-previous] *)[data-workspace-scene]');
   const body=main?.querySelector('[data-workspace-body]'),old=document.querySelector('[data-workspace-previous]:has(> *)');
   if(body&&old){
    const oldState=getComputedStyle(old),nextState=getComputedStyle(body);
    const x=pose=>pose.transform==='none'?0:new DOMMatrix(pose.transform).m41;
    window.__sceneFrames.push({direction:main.dataset.workspaceScene,oldX:x(oldState),x:x(nextState),oldOpacity:Number(oldState.opacity),opacity:Number(nextState.opacity),plot:!!body.querySelector('[data-record-slot="plot"] svg text'),flight:!!document.querySelector('[data-chart-flight]')});
   }
   window.__sceneRAF=requestAnimationFrame(take);
  };
  take();
 });
}
async function scenes(page,direction){
 await page.waitForFunction(()=>!document.querySelector('[data-workspace-scene],[data-workspace-previous] > *'));
 const samples=await page.evaluate(()=>{cancelAnimationFrame(window.__sceneRAF);return window.__sceneFrames;});
 frames.push({direction,samples});
 const sign=direction==='forward'?1:-1;
 const active=samples.filter(row=>row.direction===direction);
 assert.ok(active.some(row=>row.oldOpacity>.08&&row.oldX*sign<-.45),direction+' 原正文离场');
 assert.ok(active.some(row=>row.opacity>.08&&row.x*sign>.4),direction+' 目标正文入场');
 assert.ok(active.every(row=>!row.flight&&!(row.oldOpacity>.42&&row.opacity>.42)),direction+' 无漂浮图形和两套清晰正文');
}
try{
 console.log('starting cold charts');
 // 冷启动真实数据初次绘制，而不是只验证切换区间。
 for(const route of ['meals','measurements','energy']){
  const {ctx,page}=await context([1440,900]);await page.goto(base+'/dashboard/'+route);console.log('cold '+route);await ready(page);
  await page.waitForFunction(()=>window.__drawFrames.some(frame=>frame.time>0&&frame.time<frame.duration));const draw=await page.evaluate(()=>window.__drawFrames);assert.ok(draw.some(frame=>frame.duration===(route==='measurements'?600:400)),route+'首次绘制');
  let previous;
  for(const range of ['7D','30D','90D']){
   await page.getByRole('button',{name:range,exact:true}).click();await ready(page);
   await page.waitForTimeout(650);
   const geometry=await page.locator('[data-record-slot="plot"]').first().evaluate(node=>{const r=node.getBoundingClientRect(),svg=node.querySelector('svg[role="group"]'),s=svg.getBoundingClientRect(),point=node.querySelector('[data-glyph-point]'),p=point?.getBoundingClientRect();return {top:r.top,height:s.height,width:s.width,slotHeight:r.height,point:p?{width:p.width,height:p.height}:null,recordTop:document.querySelector('section[aria-label="最近记录"]')?.getBoundingClientRect().top};});
   assert.ok(Math.abs(geometry.height-320)<=1,route+' '+range+'同高320');
   if(range==='7D')assert.ok(geometry.width<=640);else assert.ok(geometry.width>640);
   if(previous){assert.ok(Math.abs(previous.top-geometry.top)<=1);assert.ok(Math.abs(previous.slotHeight-geometry.slotHeight)<=1);}
   if(geometry.point){assert.ok(Math.abs(geometry.point.width-7)<=1);assert.ok(Math.abs(geometry.point.height-7)<=1);}
   previous=geometry;checks.push({case:'range',route,range,...geometry});await shot(page,route+'-'+range);
  }
  await ctx.close();
 }
 // 三卡首次点击的去回程均使用一次正文过渡。
 console.log('starting roundtrips');
 const {ctx,page}=await context([1440,900]);
 for(const kind of ['intake','morning-weight','energy']){
  await page.goto(base+'/dashboard');await page.locator('[data-metric-card="'+kind+'"]:visible [data-trend-glyph]').waitFor();
  // 首次绘制与共享转场分别采样；逐SVG读取getAnimations会在WebKit强制重算样式，污染转场帧率。
  await page.evaluate(()=>{window.__observeDrawFrames=false;});
  await recordScene(page);await page.locator('[data-metric-card="'+kind+'"]:visible').click();await ready(page);await scenes(page,'forward');
  await recordScene(page);await page.goBack();await page.locator('[data-metric-card="'+kind+'"]:visible [data-trend-glyph]').waitFor();await scenes(page,'back');checks.push({case:'roundtrip',kind});
 }
 await ctx.close();
 // 实际录入与补充路径，双主题/尺寸/200%/触摸与键盘焦点。
 console.log('starting forms and followup');
 if(process.env.FORMWARD_REFINEMENT_CHARTS_ONLY!=='1')for(const theme of ['light','dark'])for(const size of [[320,560],[390,667],[430,844],[844,390],[1100,800],[1440,900]]){
  const {ctx,page}=await context(size,'reduce');await page.goto(base+'/dashboard/energy?date=2026-01-02'+'&entry=1');
  const form=page.locator('form[data-entry-form="energy"]:visible');await form.waitFor();
  const skip=page.getByText('跳过引导',{exact:true});if(await skip.isVisible())await skip.click();
  await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
  // DecimalInput uses textbox in browsers; aria-label is the contract.
  const r=form.getByLabel('静息 千卡',{exact:true}),a=form.getByLabel('活动合计 · 千卡',{exact:true});
  assert.ok(await r.isVisible());assert.ok(await a.isVisible());const rb=await r.boundingBox(),ab=await a.boundingBox();assert.ok(Math.abs(rb.y-ab.y)<=1,'静息活动同排');
  await r.fill('1539');await a.fill('331');await form.getByRole('button',{name:'只有总数？',exact:true}).click();await form.getByLabel('全天总消耗 千卡',{exact:true}).fill('2000');await form.getByRole('button',{name:'分开填写',exact:true}).click();assert.equal(await r.inputValue(),'1539');assert.equal(await a.inputValue(),'331');
  assert.equal(await form.getByLabel('静息来源',{exact:true}).isVisible(),false);
  await shot(page,'energy-form-'+theme+'-'+size[0]);
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await shot(page,'energy-text200-'+theme+'-'+size[0]);
  // 清空已填内容，走正常草稿保护返回，不修改正式数据。
  await page.evaluate(()=>document.documentElement.style.fontSize='');await r.fill('');await a.fill('');await form.getByRole('button',{name:'只有总数？',exact:true}).click();await form.getByLabel('全天总消耗 千卡',{exact:true}).fill('');
  await page.getByRole('button',{name:'关闭编辑',exact:true}).click();const discard=page.getByRole('button',{name:'放弃修改',exact:true});if(await discard.isVisible())await discard.click();
  await page.locator('[data-assistant-trigger]:visible').click();const dialog=page.getByRole('dialog',{name:'小助手',exact:true});await dialog.waitFor();
  const input=page.getByRole('textbox',{name:'给小助手发消息',exact:true});await input.fill('来源卡片验收：今天早上体重67');await page.getByRole('button',{name:'发送消息',exact:true}).click();
  const follow=dialog.locator('form[aria-label^="补充"]');await follow.waitFor({timeout:30000});
  const choices=follow.locator('button[aria-pressed]');assert.ok(await choices.count()>=3);const boxes=await choices.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,width:r.width,height:r.height,pressed:n.getAttribute('aria-pressed')};}));assert.ok(boxes.every(b=>Math.abs(b.x-boxes[0].x)<=1&&Math.abs(b.width-boxes[0].width)<=1&&b.height>=44));assert.ok(boxes.every(b=>b.pressed==='false'));
  assert.equal(await follow.locator('input').isVisible(),false);await follow.getByRole('button',{name:'自己填写',exact:false}).click();await follow.locator('input').fill('OKOK');await follow.getByRole('button',{name:'本次不填写来源',exact:true}).click();assert.equal(await follow.locator('input').isVisible(),false);await follow.getByRole('button',{name:'自己填写',exact:true}).click();assert.equal(await follow.locator('input').inputValue(),'OKOK');await shot(page,'followup-'+theme+'-'+size[0]);
  const snapshot=await(await ctx.request.get(base+'/api/assistant-chat')).json();assert.deepEqual(snapshot.catalog.map(model=>model.id),['qwen','mimo']);
  const forbidden=await ctx.request.post(base+'/api/assistant-chat/control',{headers:{Origin:base},data:{action:'select_model',provider:'glm'}});assert.equal(forbidden.status(),503);
  await shot(page,'selected-'+theme+'-'+size[0]);
  await ctx.close();checks.push({case:'form-followup-focus',theme,size});
 }
 assert.deepEqual(errors,[]);

 console.log(JSON.stringify({engine,checks:checks.length,screens:screens.length,errors}));
}catch(error){failure=String(error);throw error;}finally{await writeFile(join(folder,engine+'-report.json'),JSON.stringify({passed:!failure,failure,engine,version,checks,frames,screens,errors,nativeIPhone:false,paidModelCalls:0},null,2));for(const context of browser.contexts())await context.close();await browser.close();}
